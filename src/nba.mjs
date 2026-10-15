// The NBA island: tonight's games as agents, each player's box score, prop lines worked out from season averages (there are
// no sportsbook odds here, only stats) and the visitor's slip of overs and unders, settled from the live box scores. Pure (no
// DOM, no network), so all of it is tested without a browser. The feed is ESPN's public scoreboard and game summaries (see
// nbafeed.mjs), read defensively: a field that is missing or of the wrong kind is skipped, never trusted.
import { clock } from './timewords.mjs';

// The props a slip can hold, in the order the props panel shows them.
export const STATS = [['pts', 'PTS', 'Points'], ['reb', 'REB', 'Rebounds'], ['ast', 'AST', 'Assists'], ['threes', '3PM', 'Threes made'], ['pra', 'PRA', 'Pts + Reb + Ast']];
const STAT_KEYS = STATS.map(s => s[0]);
export const statLabel = key => (STATS.find(s => s[0] === key) || [key, key])[1];
export const MAX_LEGS = 20;

const num = v => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const text = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const https = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

// The value of a prop for one player's line of figures (pra is the three added up). null when a figure is missing.
export function statValue(p, key) {
  if (!p) return null;
  if (key === 'pra') { const a = [p.pts, p.reb, p.ast].map(num); return a.some(v => v === null) ? null : a[0] + a[1] + a[2]; }
  return num(p[key]);
}

// A prop line from a season average: the nearest x.5, so a prop never ends level. 24.3 and 24.9 both give 24.5, a whole 30 goes
// up to 30.5; never below 0.5.
export const propLine = avg => (num(avg) === null || avg < 0 ? null : Math.max(0.5, Math.round(avg - 0.5) + 0.5));

// ----- the scoreboard: one game per event
const STATE = { pre: 'pre', in: 'in', post: 'post' };
export function parseScoreboard(json) {
  const out = [];
  for (const ev of Array.isArray(json?.events) ? json.events : []) {
    const comp = ev?.competitions?.[0], teams = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const side = where => {
      const c = teams.find(t => t?.homeAway === where); if (!c) return null;
      return { abbr: text(c.team?.abbreviation, 6) || '?', name: text(c.team?.displayName || c.team?.name, 40), score: num(c.score) ?? 0 };
    };
    const home = side('home'), away = side('away'), type = ev?.status?.type || comp?.status?.type || {};
    if (!ev?.id || !home || !away) continue;
    const link = (Array.isArray(ev.links) ? ev.links : []).find(l => Array.isArray(l?.rel) && l.rel.includes('summary')) || ev.links?.[0];
    out.push({ id: text(ev.id, 20), start: text(ev.date, 30), state: STATE[type.state] || 'pre', detail: text(type.shortDetail || type.detail, 40),
      period: num(ev.status?.period) ?? 0, clock: text(ev.status?.displayClock, 10), home, away,
      url: https(link?.href) || `https://www.espn.com/nba/game/_/gameId/${encodeURIComponent(text(ev.id, 20))}` });
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || (a.id < b.id ? -1 : 1));
}

// ----- a game summary: every player's figures in this game, and the season averages ESPN gives for the team leaders before tip-off
const LABEL = { MIN: 'min', PTS: 'pts', REB: 'reb', AST: 'ast', '3PT': 'threes' };
export function parseBox(json) {
  const players = [];
  for (const team of Array.isArray(json?.boxscore?.players) ? json.boxscore.players : []) {
    const abbr = text(team?.team?.abbreviation, 6), block = team?.statistics?.[0];
    const labels = Array.isArray(block?.labels) ? block.labels : [];
    for (const row of Array.isArray(block?.athletes) ? block.athletes : []) {
      const a = row?.athlete; if (!a?.id) continue;
      const p = { id: text(a.id, 20), name: text(a.displayName || a.shortName, 40), team: abbr, pos: text(a.position?.abbreviation, 4), starter: !!row.starter, dnp: !!row.didNotPlay };
      for (const k of STAT_KEYS) if (k !== 'pra') p[k] = 0;
      const stats = Array.isArray(row.stats) ? row.stats : [];
      labels.forEach((l, i) => { const k = LABEL[l]; if (k) p[k] = num(String(stats[i] ?? '').split('-')[0]) ?? 0; });   // 3PT is "made-attempted"
      players.push(p);
    }
  }
  return players;
}

// Season averages by player id, from the team leaders a summary lists before the game (per-game categories only: during and
// after a game the leaders are that game's figures, which are not averages).
const AVG_CAT = { pointsPerGame: 'pts', reboundsPerGame: 'reb', assistsPerGame: 'ast', threePointFieldGoalsMadePerGame: 'threes' };
export function parseAverages(json) {
  const out = {};
  for (const team of Array.isArray(json?.leaders) ? json.leaders : []) {
    const abbr = text(team?.team?.abbreviation, 6);
    for (const cat of Array.isArray(team?.leaders) ? team.leaders : []) {
      const key = AVG_CAT[cat?.name]; if (!key) continue;
      for (const l of Array.isArray(cat.leaders) ? cat.leaders : []) {
        const id = l?.athlete?.id, v = num(l?.value ?? l?.displayValue); if (!id || v === null) continue;
        const p = out[text(id, 20)] ||= { name: text(l.athlete.displayName || l.athlete.shortName, 40), team: abbr };
        p[key] = Math.round(v * 10) / 10;
      }
    }
  }
  return out;
}

// Averages kept from earlier looks, so a game that has started still has its lines: newer figures win, and a player not seen
// for `keepDays` is forgotten. Each entry is { name, team, pts?, reb?, ast?, threes?, at }.
export function mergeAverages(saved, fresh, now = Date.now(), keepDays = 4) {
  const out = {};
  for (const [id, p] of Object.entries(saved && typeof saved === 'object' ? saved : {})) if (p && now - (num(p.at) ?? 0) < keepDays * 864e5) out[id] = p;
  for (const [id, p] of Object.entries(fresh || {})) out[id] = { ...out[id], ...p, at: now };
  return out;
}

// ----- the props of one game: a row per player who is on the box score or has an average, with the line for the chosen prop
export function gameProps(game, box = [], averages = {}, stat = 'pts') {
  const rows = new Map();
  for (const p of box) rows.set(p.id, { id: p.id, name: p.name, team: p.team, pos: p.pos, starter: p.starter, dnp: p.dnp, now: game.state === 'pre' ? null : statValue(p, stat) });
  const teams = new Set([game.home.abbr, game.away.abbr]);
  for (const [id, a] of Object.entries(averages)) if (!rows.has(id) && teams.has(a.team)) rows.set(id, { id, name: a.name, team: a.team, pos: '', starter: false, dnp: false, now: null });
  const list = [...rows.values()].map(r => { const avg = statValue(averages[r.id], stat); return { ...r, avg, line: propLine(avg) }; });
  // players with a line first (the best first), then starters, then by name
  return list.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || Number(b.starter) - Number(a.starter) || (b.now ?? -1) - (a.now ?? -1) || (a.name < b.name ? -1 : 1));
}

// ----- the slip: legs of { id, gameId, game, playerId, player, team, stat, side, line, at, last? }, kept in the visitor's browser
export const legId = (gameId, playerId, stat) => `${gameId}:${playerId}:${stat}`;

// A saved slip as it can be trusted: damaged legs dropped, text cut short, at most MAX_LEGS.
export function cleanSlip(v) {
  if (!Array.isArray(v)) return [];
  const out = [], seen = new Set();
  for (const l of v) {
    if (!l || typeof l !== 'object' || !STAT_KEYS.includes(l.stat) || !['over', 'under'].includes(l.side)) continue;
    const line = num(l.line), gameId = text(l.gameId, 20), playerId = text(l.playerId, 20);
    if (line === null || line < 0 || line > 200 || !gameId || !playerId) continue;
    const id = legId(gameId, playerId, l.stat); if (seen.has(id)) continue;
    seen.add(id);
    const leg = { id, gameId, game: text(l.game, 20), playerId, player: text(l.player, 40), team: text(l.team, 6), stat: l.stat, side: l.side, line, at: num(l.at) ?? 0 };
    if (l.last && typeof l.last === 'object' && num(l.last.value) !== null && ['pre', 'in', 'post'].includes(l.last.state)) leg.last = { value: num(l.last.value), state: l.last.state };
    out.push(leg);
    if (out.length >= MAX_LEGS) break;
  }
  return out;
}

// Adds a leg, or changes the side or line of the one already there for the same player and prop. A full slip is left as it is.
export function addLeg(slip, leg, now = Date.now()) {
  const id = legId(leg.gameId, leg.playerId, leg.stat), i = slip.findIndex(l => l.id === id);
  const next = cleanSlip([{ ...leg, at: now }])[0];
  if (!next) return slip;
  if (i >= 0) return slip.map((l, k) => (k === i ? { ...next, at: l.at, ...(l.last ? { last: l.last } : {}) } : l));
  return slip.length >= MAX_LEGS ? slip : [...slip, next];
}
export const removeLeg = (slip, id) => slip.filter(l => l.id !== id);

// Where a leg stands for a figure and its game's state: pending before tip-off, live while it can still go either way, and hit,
// miss or push once it is decided. An over is won the moment it passes the line and an under lost, even mid-game.
export function legState(leg, value, state) {
  if (value === null || value === undefined || state === 'pre' || !state) return { state: 'pending', value: null, progress: 0 };
  const progress = Math.min(1, leg.line > 0 ? value / leg.line : 1);
  if (value > leg.line) return { state: leg.side === 'over' ? 'hit' : 'miss', value, progress };
  if (state !== 'post') return { state: 'live', value, progress };
  if (value === leg.line) return { state: 'push', value, progress };
  return { state: leg.side === 'under' ? 'hit' : 'miss', value, progress };
}

// The slip with every leg's latest figure from the games now on the board (a leg whose game has left the board keeps what was
// last seen), and where each leg stands. `boxes` is { gameId: players }.
export function settleSlip(slip, games, boxes) {
  const byId = new Map(games.map(g => [g.id, g]));
  return slip.map(l => {
    const g = byId.get(l.gameId), p = (boxes[l.gameId] || []).find(x => x.id === l.playerId);
    let last = l.last;
    if (g && g.state === 'pre') last = undefined;
    else if (g && boxes[l.gameId]) last = { value: statValue(p, l.stat) ?? 0, state: g.state };   // a player not on the box score has not played: 0
    const leg = { ...l }; if (last) leg.last = last; else delete leg.last;
    return leg;
  });
}
export const legNow = leg => legState(leg, leg.last?.value ?? null, leg.last?.state ?? 'pre');

// The slip as a whole: counts of each state, and won once every leg hits (pushes do not count against it), lost on any miss.
export function slipSummary(slip) {
  const n = { hit: 0, miss: 0, live: 0, pending: 0, push: 0 };
  for (const l of slip) n[legNow(l).state]++;
  const verdict = !slip.length ? 'empty' : n.miss ? 'lost' : n.live || n.pending ? 'open' : n.hit ? 'won' : 'void';
  return { ...n, legs: slip.length, verdict };
}

// ----- the island: every game of the night is an agent. A live game is working, a finished one is done and one still to come
// is asleep until tip-off.
const GAME_STATUS = { in: 'running', post: 'ok', pre: 'idle' };
export const gameName = g => `${g.away.abbr} @ ${g.home.abbr}`;
export function gameWord(g, timeZone) {
  if (g.state === 'in') return g.detail || `Q${g.period} ${g.clock}`;
  if (g.state === 'post') return g.detail || 'Final';
  return g.detail || (Number.isNaN(Date.parse(g.start)) ? 'Tonight' : `Tip-off ${clock(Date.parse(g.start), timeZone)}`);
}
export function gameAgents(island, games, boxes = {}, timeZone) {
  return games.map(g => ({ id: `${island}::${g.id}`, name: gameName(g), kind: 'game', status: GAME_STATUS[g.state] || 'idle', repo: null, url: g.url, gameId: g.id,
    ...(g.demo ? { demo: true } : {}),
    details: { latest: { date: g.start, result: gameWord(g, timeZone) }, game: g, players: (boxes[g.id] || []).length } }));
}

// What changes the world's picture: a game starting or ending (the score moves every refresh and only redraws the cards).
export const gamesSignature = games => games.map(g => `${g.id}=${g.state}`).join(' ');

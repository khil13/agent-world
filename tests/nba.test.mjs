import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propLine, statValue, parseScoreboard, parseBox, parseAverages, mergeAverages, gameProps, cleanSlip, addLeg, removeLeg, legState, settleSlip, legNow,
  slipSummary, gameAgents, gameWord, gamesSignature, legId, MAX_LEGS } from '../src/nba.mjs';
import { createNbaFeed } from '../src/nbafeed.mjs';
import { demoNba } from '../src/nbademo.mjs';
import { buildWorld } from '../src/world.mjs';

// The shapes ESPN's public scoreboard and summary give, cut down to the fields that are read.
const board = { events: [
  { id: '401', date: '2026-10-15T23:30Z', status: { period: 2, displayClock: '4:12', type: { state: 'in', shortDetail: '4:12 - 2nd' } },
    links: [{ rel: ['summary', 'desktop', 'event'], href: 'https://www.espn.com/nba/game/_/gameId/401' }],
    competitions: [{ competitors: [{ homeAway: 'home', score: '55', team: { abbreviation: 'NYK', displayName: 'New York Knicks' } }, { homeAway: 'away', score: '51', team: { abbreviation: 'BOS', displayName: 'Boston Celtics' } }] }] },
  { id: '400', date: '2026-10-15T23:00Z', status: { period: 0, type: { state: 'pre', shortDetail: '10/15 - 7:00 PM EDT' } }, links: [{ rel: ['x'], href: 'javascript:alert(1)' }],
    competitions: [{ competitors: [{ homeAway: 'home', score: '0', team: { abbreviation: 'MIA' } }, { homeAway: 'away', score: '0', team: { abbreviation: 'ORL' } }] }] },
  { id: '402', competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'X' } }] }] },   // one side missing: skipped
] };
const summary = {
  boxscore: { players: [{ team: { abbreviation: 'BOS' }, statistics: [{ labels: ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'PTS'],
    athletes: [{ athlete: { id: '1', displayName: 'Jay Tee', position: { abbreviation: 'F' } }, starter: true, stats: ['20', '8-15', '3-6', '2-2', '7', '4', '21'] },
      { athlete: { id: '2', displayName: 'Bench Guy' }, didNotPlay: true, stats: [] }, { athlete: {} }] }] }] },
  leaders: [{ team: { abbreviation: 'BOS' }, leaders: [
    { name: 'pointsPerGame', leaders: [{ value: 26.9, athlete: { id: '1', displayName: 'Jay Tee' } }] },
    { name: 'reboundsPerGame', leaders: [{ displayValue: '8.1', athlete: { id: '1', displayName: 'Jay Tee' } }] },
    { name: 'points', leaders: [{ value: 40, athlete: { id: '9', displayName: 'Game Only' } }] }] }],
};

test('a prop line is the nearest half point to the average, so a prop never ends level', () => {
  assert.equal(propLine(24.3), 24.5);
  assert.equal(propLine(24.9), 24.5);
  assert.equal(propLine(25.1), 25.5);
  assert.equal(propLine(0.2), 0.5);
  assert.equal(propLine(30), 30.5);   // a whole number goes up half a point
  assert.equal(propLine(null), null);
  assert.equal(propLine('x'), null);
  assert.equal(statValue({ pts: 20, reb: 5, ast: 3 }, 'pra'), 28);
  assert.equal(statValue({ pts: 20, reb: 5 }, 'pra'), null);
});

test('the scoreboard gives one game per event, by tip-off, with only an https link', () => {
  const games = parseScoreboard(board);
  assert.deepEqual(games.map(g => g.id), ['400', '401']);
  const live = games[1];
  assert.deepEqual([live.state, live.period, live.clock, live.home.abbr, live.home.score, live.away.score], ['in', 2, '4:12', 'NYK', 55, 51]);
  assert.equal(live.url, 'https://www.espn.com/nba/game/_/gameId/401');
  assert.equal(games[0].url, 'https://www.espn.com/nba/game/_/gameId/400');   // a link that is not https is never used
  assert.deepEqual(parseScoreboard(null), []);
  assert.deepEqual(parseScoreboard({ events: 'x' }), []);
});

test('the box score gives every player\'s figures, and the averages only the per-game leaders', () => {
  const box = parseBox(summary);
  assert.equal(box.length, 2);
  assert.deepEqual(box[0], { id: '1', name: 'Jay Tee', team: 'BOS', pos: 'F', starter: true, dnp: false, pts: 21, reb: 7, ast: 4, threes: 3, min: 20 });
  assert.equal(box[1].dnp, true);
  assert.equal(box[1].pts, 0);
  assert.deepEqual(parseAverages(summary), { 1: { name: 'Jay Tee', team: 'BOS', pts: 26.9, reb: 8.1 } });
  assert.deepEqual(parseBox({}), []);
  assert.deepEqual(parseAverages({ leaders: [null] }), {});
});

test('averages are kept between looks and forgotten after a few days', () => {
  const day = 864e5, now = 10 * day;
  const saved = { a: { name: 'A', pts: 10, at: now - day }, old: { name: 'O', pts: 5, at: now - 9 * day } };
  const m = mergeAverages(saved, { a: { pts: 12 }, b: { name: 'B', reb: 4 } }, now);
  assert.deepEqual(Object.keys(m).sort(), ['a', 'b']);
  assert.deepEqual([m.a.name, m.a.pts, m.a.at], ['A', 12, now]);
  assert.deepEqual(mergeAverages('junk', {}, now), {});
});

test('a game\'s props list players with a line first, with their figure once the game has started', () => {
  const [, live] = parseScoreboard(board);
  const rows = gameProps(live, parseBox(summary), { 1: { name: 'Jay Tee', team: 'BOS', pts: 26.9 }, 5: { name: 'Knick', team: 'NYK', pts: 30 }, 7: { name: 'Elsewhere', team: 'LAL', pts: 30 } }, 'pts');
  assert.deepEqual(rows.map(r => [r.name, r.line, r.now]), [['Knick', 30.5, null], ['Jay Tee', 26.5, 21], ['Bench Guy', null, 0]]);
});

test('a saved slip is cleaned: damaged legs and duplicates are dropped, and it is never longer than the limit', () => {
  const ok = { gameId: 'g', playerId: 'p', stat: 'pts', side: 'over', line: 20.5, player: 'P', game: 'A @ B' };
  const s = cleanSlip([ok, ok, { ...ok, stat: 'blocks' }, { ...ok, playerId: 'q', side: 'sideways' }, { ...ok, playerId: 'r', line: 'x' }, null, { ...ok, playerId: 's', line: -1 }]);
  assert.deepEqual(s.map(l => l.id), ['g:p:pts']);
  assert.deepEqual(cleanSlip('nope'), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ ...ok, playerId: `p${i}` }));
  assert.equal(cleanSlip(many).length, MAX_LEGS);
});

test('adding a leg for a player and prop already on the slip changes it, and a full slip takes no more', () => {
  const leg = { gameId: 'g', playerId: 'p', stat: 'reb', side: 'over', line: 8.5, player: 'P' };
  let slip = addLeg([], leg, 100);
  slip = addLeg(slip, { ...leg, side: 'under', line: 9.5 }, 200);
  assert.equal(slip.length, 1);
  assert.deepEqual([slip[0].side, slip[0].line, slip[0].at], ['under', 9.5, 100]);
  assert.equal(addLeg(slip, { ...leg, stat: 'nope' }), slip);
  assert.deepEqual(removeLeg(slip, legId('g', 'p', 'reb')), []);
  const full = Array.from({ length: MAX_LEGS }, (_, i) => addLeg([], { ...leg, playerId: `p${i}` })[0]);
  assert.equal(addLeg(full, { ...leg, playerId: 'new' }).length, MAX_LEGS);
});

test('a leg is pending before tip-off, live while it can go either way, and decided as soon as it can be', () => {
  const over = { side: 'over', line: 20.5 }, under = { side: 'under', line: 20.5 };
  assert.equal(legState(over, null, 'pre').state, 'pending');
  assert.deepEqual(legState(over, 10, 'in'), { state: 'live', value: 10, progress: 10 / 20.5 });
  assert.equal(legState(over, 21, 'in').state, 'hit');      // an over is won the moment it passes the line
  assert.equal(legState(under, 21, 'in').state, 'miss');    // and an under lost
  assert.equal(legState(under, 18, 'in').state, 'live');
  assert.equal(legState(under, 18, 'post').state, 'hit');
  assert.equal(legState(over, 18, 'post').state, 'miss');
  assert.equal(legState({ side: 'over', line: 20 }, 20, 'post').state, 'push');
  assert.equal(legState(over, 40, 'in').progress, 1);
});

test('the slip is settled from the box scores, keeps what it last saw when a game leaves the board, and sums up', () => {
  const games = parseScoreboard(board), boxes = { 401: parseBox(summary) };
  const slip = cleanSlip([{ gameId: '401', playerId: '1', stat: 'pts', side: 'over', line: 19.5 }, { gameId: '401', playerId: '1', stat: 'ast', side: 'over', line: 6.5 },
    { gameId: '401', playerId: '2', stat: 'pts', side: 'under', line: 4.5 }, { gameId: '400', playerId: '3', stat: 'pts', side: 'over', line: 10.5 },
    { gameId: 'gone', playerId: '4', stat: 'reb', side: 'under', line: 5.5, last: { value: 3, state: 'post' } }]);
  const settled = settleSlip(slip, games, boxes);
  assert.deepEqual(settled.map(l => legNow(l).state), ['hit', 'live', 'live', 'pending', 'hit']);
  assert.deepEqual(slipSummary(settled), { hit: 2, miss: 0, live: 2, pending: 1, push: 0, legs: 5, verdict: 'open' });
  assert.equal(slipSummary([]).verdict, 'empty');
  assert.equal(slipSummary([{ side: 'over', line: 1.5, last: { value: 0, state: 'post' } }]).verdict, 'lost');
  assert.equal(slipSummary([{ side: 'over', line: 1.5, last: { value: 3, state: 'post' } }]).verdict, 'won');
});

test('each game is an agent: working while live, done when final, asleep before tip-off', () => {
  const games = parseScoreboard(board), agents = gameAgents('NBA', games, { 401: parseBox(summary) });
  assert.deepEqual(agents.map(a => [a.id, a.name, a.kind, a.status]), [['NBA::400', 'ORL @ MIA', 'game', 'idle'], ['NBA::401', 'BOS @ NYK', 'game', 'running']]);
  assert.equal(agents[1].details.players, 2);
  assert.equal(gameWord({ state: 'pre', detail: '', start: '2026-10-15T23:00:00Z' }, 'UTC'), 'Tip-off Thu 23:00');
  assert.equal(gameWord({ state: 'post', detail: '' }), 'Final');
  assert.equal(gamesSignature(games), '400=pre 401=in');
});

test('the world gets an NBA island with its games only when there are games and the config asks for it', () => {
  const data = { generatedAt: '2026-10-15T00:00:00Z', repos: [] }, games = parseScoreboard(board), now = Date.parse('2026-10-15T23:45Z');
  const w = buildWorld(data, { nba: { island: 'NBA' } }, now, { nba: { games, boxes: {} } });
  assert.deepEqual(w.islands.map(i => [i.name, i.health, i.agentCount]), [['NBA', 'running', 2]]);
  assert.ok(w.agents.every(a => a.island === 'NBA' && a.pos));
  assert.equal(buildWorld(data, {}, now, { nba: { games, boxes: {} } }).islands.length, 0);
  assert.equal(buildWorld(data, { nba: {} }, now, { nba: { games: [], boxes: {} } }).islands.length, 0);
});

test('the feed reads the scoreboard and every game\'s summary, and asks for a finished game\'s box score only once', async () => {
  const calls = [], done = { events: [{ ...board.events[0], status: { type: { state: 'post' } } }] };
  const fetchFn = async url => { calls.push(url); return { ok: true, json: async () => (url.endsWith('/scoreboard') ? done : summary) }; };
  const load = createNbaFeed({ fetchFn, base: 'https://x.test' });
  const a = await load(), b = await load();
  assert.equal(a.boxes['401'].length, 2);
  assert.deepEqual(b.boxes, a.boxes);
  assert.deepEqual(calls, ['https://x.test/scoreboard', 'https://x.test/summary?event=401', 'https://x.test/scoreboard']);
  assert.equal(await createNbaFeed({ fetchFn: async () => { throw new TypeError('offline'); } })(), null);
  assert.equal(await createNbaFeed({ fetchFn: async () => ({ ok: false }) })(), null);
});

test('the demo night is invented, has live, final and coming games, and its live figures only go up as the game goes on', () => {
  const t = Date.parse('2026-10-15T20:00:00Z'), a = demoNba(t), b = demoNba(t + 60e3);
  assert.deepEqual(a.games.map(g => g.state).sort(), ['in', 'in', 'post', 'post', 'pre', 'pre']);
  assert.ok(a.games.every(g => g.demo && g.id.startsWith('demo-')));
  assert.deepEqual(demoNba(t), a);
  const live = a.games.find(g => g.state === 'in').id;
  for (const p of a.boxes[live]) {
    const later = b.boxes[live].find(x => x.id === p.id);
    if (b.games.find(g => g.id === live).clock && later.min >= p.min) assert.ok(later.pts >= p.pts);
  }
  for (const g of a.games.filter(x => x.state === 'pre')) assert.deepEqual(a.boxes[g.id], []);
});

// The props panel of the NBA island: a game's players with a line for the chosen prop (from their season average, or the one the
// visitor types in from their own book), their figure so far, and Over / Under buttons that put the prop on the slip; and the
// slip itself, each leg moving towards its line while its game is live and marked hit, miss or push once it is decided. There
// are no odds and no real bets: the slip is kept in this browser only. DOM calls and textContent only, never innerHTML, because
// team and player names come from outside this page. The logic is in nba.mjs.
import { STATS, statLabel, gameProps, gameName, gameWord, legId, legNow, slipSummary } from './nba.mjs';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, onclick, title) => { const b = el('button', cls, text); b.type = 'button'; b.onclick = onclick; if (title) b.title = title; return b; };
const fmt = v => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));
const STATE_WORD = { hit: 'Hit', miss: 'Miss', push: 'Push', live: 'Live', pending: 'Not started' };
const VERDICT = { won: 'Slip won: every leg hit', lost: 'Slip lost: a leg missed', open: 'Slip still open', void: 'Every leg pushed', empty: '' };

const score = g => (g.state === 'pre' ? gameWord(g) : `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr} · ${gameWord(g)}`);

// The game tab: a game picker, the prop chips and a row per player.
function gameTab(v, on) {
  const box = el('div', 'pgame'), g = v.games.find(x => x.id === v.gameId) || v.games[0];
  if (!g) { box.append(el('p', 'note', 'No NBA games on the board right now.')); return box; }
  const pick = el('select', 'pselect'); pick.setAttribute('aria-label', 'Game');
  for (const x of v.games) { const o = el('option', '', `${gameName(x)} · ${gameWord(x)}`); o.value = x.id; o.selected = x.id === g.id; pick.append(o); }
  pick.onchange = () => on.game(pick.value);
  const chips = el('div', 'pchips');
  for (const [key, short, long] of STATS) { const c = button(key === v.stat ? 'pchip on' : 'pchip', short, () => on.stat(key), long); c.setAttribute('aria-pressed', String(key === v.stat)); chips.append(c); }
  box.append(pick, el('p', 'pscore', score(g)), chips);

  const rows = gameProps(g, v.boxes[g.id] || [], v.averages, v.stat);
  if (!rows.length) { box.append(el('p', 'note', g.state === 'pre' ? 'No players listed for this game yet.' : 'The box score has not come in yet.')); return box; }
  const legs = new Map(v.slip.map(l => [l.id, l]));
  const table = el('div', 'ptable');
  const head = el('div', 'prow phead'); head.append(el('span', 'pn', 'Player'), el('span', 'pv', 'Avg'), el('span', 'pv', g.state === 'pre' ? '' : 'Now'), el('span', 'pl', 'Line'), el('span', 'pb', ''));
  table.append(head);
  for (const r of rows) {
    const key = legId(g.id, r.id, v.stat), leg = legs.get(key), row = el('div', `prow${r.dnp ? ' dnp' : ''}`);
    const who = el('span', 'pn'); who.append(el('b', '', r.name), el('small', '', [r.team, r.pos, r.dnp ? 'did not play' : ''].filter(Boolean).join(' · ')));
    const line = el('input', 'pline'); line.type = 'number'; line.step = '0.5'; line.min = '0'; line.inputMode = 'decimal'; line.dataset.key = key;
    line.value = v.lines[key] ?? leg?.line ?? r.line ?? ''; line.placeholder = 'line'; line.setAttribute('aria-label', `${r.name} ${statLabel(v.stat)} line`);
    line.oninput = () => on.line(key, line.value);
    const sides = el('span', 'pb');
    for (const side of ['over', 'under']) {
      const b = button(`pside ${side}${leg?.side === side ? ' on' : ''}`, side === 'over' ? 'O' : 'U', () => on.pick({ game: g, player: r, stat: v.stat, side, line: parseFloat(line.value) }),
        `${side === 'over' ? 'Over' : 'Under'} ${line.value || '?'} ${statLabel(v.stat)}${leg?.side === side ? ' (on your slip: click to take it off)' : ''}`);
      b.disabled = g.state === 'post';
      sides.append(b);
    }
    row.append(who, el('span', 'pv', fmt(r.avg)), el('span', 'pv now', g.state === 'pre' ? '' : fmt(r.now)), line, sides);
    table.append(row);
  }
  box.append(table, el('p', 'note', g.demo ? 'Demo night: the teams, players and figures are invented.'
    : 'Lines are the nearest half point to the season average ESPN lists for a team\'s leaders. There are no odds here: type your book\'s line to change one.'));
  return box;
}

// The slip tab: where each leg stands, and the slip as a whole.
function slipTab(v, on) {
  const box = el('div', 'pslip'), sum = slipSummary(v.slip);
  if (!v.slip.length) { box.append(el('p', 'note', 'Your slip is empty. Pick an Over (O) or Under (U) on a player in a game\'s props.')); return box; }
  const head = el('div', `psum ${sum.verdict}`);
  head.append(el('b', '', VERDICT[sum.verdict]), el('span', '', [`${sum.hit} hit`, `${sum.live} live`, `${sum.miss} miss`, sum.pending ? `${sum.pending} to come` : '', sum.push ? `${sum.push} push` : ''].filter(Boolean).join(' · ')));
  box.append(head);
  const list = el('ul', 'plegs');
  for (const l of v.slip) {
    const st = legNow(l), li = el('li', `pleg ${st.state}`);
    const top = el('div', 'plt');
    top.append(el('b', '', l.player), el('span', `pst ${st.state}`, STATE_WORD[st.state]), button('x', '×', () => on.remove(l.id), 'Take it off the slip'));
    const what = el('div', 'plw', `${l.side === 'over' ? 'Over' : 'Under'} ${l.line} ${statLabel(l.stat)} · ${l.team ? l.team + ' · ' : ''}${l.game}`);
    const bar = el('div', `bar ${st.state === 'miss' ? 'fail' : st.state === 'live' ? 'running' : 'ok'} known`), fill = el('i');
    fill.style.width = `${Math.round(st.progress * 100)}%`; bar.append(fill);
    li.append(top, what, bar, el('div', 'plv', st.value === null ? 'waiting for tip-off' : `${fmt(st.value)} of ${l.line}`));
    list.append(li);
  }
  box.append(list, button('ghost pclear', 'Clear slip', on.clear), el('p', 'note', 'Kept in this browser only. Nothing is staked or sent anywhere.'));
  return box;
}

// v: { open, tab, games, boxes, averages, slip, gameId, stat, lines }; on: { close, tab, game, stat, line, pick, remove, clear }.
export function renderProps(root, v, on) {
  // a redraw while a line is being typed keeps the field focused, with its text and caret where they were
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  const keep = active?.dataset?.key ? { key: active.dataset.key, value: active.value } : null;
  const scrolled = root.querySelector('.dbody')?.scrollTop || 0;
  root.replaceChildren();
  root.hidden = !v.open;
  if (!v.open) return;
  const g = v.games.find(x => x.id === v.gameId);
  const head = el('div', 'dhead'), titles = el('div', 'dtitles');
  titles.append(el('h2', '', '🏀 NBA props'), el('p', 'dsub', g ? `${g.away.name} at ${g.home.name}` : 'Tonight\'s games'));
  head.append(titles, button('x', '×', on.close, 'Close props'));
  const tabs = el('div', 'dtabs'); tabs.setAttribute('role', 'tablist');
  for (const [id, label] of [['game', 'Game props'], ['slip', `Slip${v.slip.length ? ` (${v.slip.length})` : ''}`]]) {
    const b = button(id === v.tab ? 'on' : '', label, () => on.tab(id)); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === v.tab)); tabs.append(b);
  }
  const body = el('div', 'dbody');
  body.append(v.tab === 'slip' ? slipTab(v, on) : gameTab(v, on));
  root.append(head, tabs, body);
  body.scrollTop = scrolled;
  if (keep) { const f = root.querySelector(`input[data-key="${CSS.escape(keep.key)}"]`); if (f) { f.value = keep.value; f.focus(); } }
}

// The card that pops up over a clicked agent, like the one in the reference: avatar, title, a status chip
// and progress bar, an Open button, then the details. Built with DOM calls and textContent, never
// innerHTML, because commit messages and workflow names are text from outside this page.
import { progressAt, progressLabel, stuckAt } from './progress.mjs';
import { ago } from './timewords.mjs';
import { isTask, statusWord, safeUrl, cardStats } from './details.mjs';
import { SWATCHES } from './colours.mjs';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (text, url, cls) => { const a = el('a', cls, text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; };

const KIND_LABEL = { workflow: 'GitHub Action', builder: 'Coding agent', human: 'Human', local: 'Cowork · local agent', site: 'Website', game: 'NBA game' };
const GAME_WORD = { running: 'Live', ok: 'Final', idle: 'Upcoming' };   // a game is working while it is being played
const BAR = { running: 55, ok: 100, fail: 100, idle: 60, asleep: 0 };
const SITE_WORD = { running: 'Live', fail: 'Down', idle: 'Checking…' };   // a website is working while it answers

// The colours section of a card: a button that opens two rows of twelve swatches and a custom colour (suit, helmet), a reset and
// an apply-to-all. `c` is { choice, open, island, onToggle, onPick(part, hex, final), onReset, onApplyAll }.
function colourSection(c, agent) {
  const box = el('div', 'colours'), toggle = el('button', 'ghost cbtn', `🎨 Colours${c.choice.custom ? ' · changed' : ''}`);
  toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(c.open)); toggle.onclick = c.onToggle; box.append(toggle);
  if (!c.open) return box;
  for (const [part, label] of [['suit', 'Suit'], ['helmet', 'Helmet']]) {
    const row = el('div', 'crow'), swatches = el('div', 'swatches');
    for (const hex of SWATCHES) {
      const b = el('button', c.choice[part] === hex ? 'sw on' : 'sw'); b.type = 'button'; b.style.background = hex; b.title = hex; b.setAttribute('aria-label', `${label} ${hex}`);
      b.onclick = () => c.onPick(part, hex, true); swatches.append(b);
    }
    const pick = el('input', 'cpick'); pick.type = 'color'; pick.value = c.choice[part]; pick.title = 'Any colour'; pick.setAttribute('aria-label', `${label} custom colour`);
    pick.oninput = () => c.onPick(part, pick.value, false);   // the astronaut changes as the colour is dragged, the card is redrawn when it is let go
    pick.onchange = () => c.onPick(part, pick.value, true);
    swatches.append(pick); row.append(el('span', 'cl', label), swatches); box.append(row);
  }
  const buttons = el('div', 'cbuttons'), reset = el('button', 'ghost', 'Reset'), all = el('button', 'ghost', `Apply to all on ${c.island}`);
  for (const b of [reset, all]) { b.type = 'button'; b.disabled = !c.choice.custom; buttons.append(b); }
  reset.onclick = c.onReset; all.onclick = c.onApplyAll;
  box.append(buttons);
  if (agent.disabled) box.append(el('p', 'note', 'This task is disabled, so it stays grey. Your choice is kept for when it is switched on.'));
  return box;
}

// actions: { focus, activation, details, colours, props } handlers for the buttons and sections.
export function renderPanel(root, agent, onClose, now = Date.now(), actions = {}) {
  root.replaceChildren();
  root.hidden = !agent;
  if (!agent) return;
  const d = agent.details || {};
  const when = agent.kind === 'local' ? 'not tracked live' : agent.kind === 'game' ? d.latest?.result || '' : d.latest?.date ? ago(d.latest.date, now) : '';

  const top = el('div', 'cardtop');
  const face = el('div', 'avatar'); face.append(el('i'), el('i'));
  const titles = el('div', 'titles');
  titles.append(el('h2', '', agent.kind === 'site' ? `${agent.island} website` : agent.kind === 'game' && d.game ? `${d.game.away.name} at ${d.game.home.name}` : agent.name));
  const chips = el('div', 'chips'), chip = el('span', `chip ${agent.status}`);
  chip.append(el('span', `dot ${agent.status}`), agent.kind === 'site' ? SITE_WORD[agent.status] || agent.status : agent.kind === 'game' ? GAME_WORD[agent.status] || agent.status : statusWord(agent));
  const task = isTask(agent);   // only tasks carry progress and a schedule
  const prog = task ? progressAt(d.progress, now) : null, stuck = task && agent.status === 'running' ? stuckAt(d.progress, now) : null;
  chips.append(chip, el('span', 'when', when));
  if (prog) chips.append(el('span', 'pct', progressLabel(prog)));
  if (stuck) chips.append(el('span', `chip stuck ${stuck}`, stuck === 'red' ? '⚠ Much longer than usual' : '⚠ Longer than usual'));
  titles.append(chips);
  const x = el('button', 'x', '×'); x.setAttribute('aria-label', 'Close'); x.onclick = onClose;
  top.append(face, titles, x);

  const bar = el('div', `bar ${agent.status}${prog ? ' known' : ''}${prog && !prog.exact ? ' est' : ''}`); bar.append(el('i')); bar.firstChild.style.width = `${prog ? prog.value : agent.disabled || d.queued || (agent.kind === 'workflow' && !d.latest) ? 0 : agent.kind === 'site' && agent.status === 'running' ? 100 : agent.kind === 'game' ? gameBar(d.game) : BAR[agent.status] ?? 0}%`;

  // For the signed-in Admin, an agent that is not working gets an Activate button in place of the GitHub link
  // (see activation.mjs); everyone else keeps the plain Open link.
  const act = actions.activation, offer = act?.offer;
  const buttons = el('div', 'buttons'), url = safeUrl(agent.kind === 'workflow' ? d.latest?.url || agent.url : agent.url);
  if (offer?.kind === 'activate') {
    const run = el('button', 'open run', act.busy ? 'Starting…' : `▶ ${offer.label}`); run.type = 'button'; run.disabled = !!(act.busy || act.confirming);
    run.onclick = () => act.onAsk?.(); buttons.append(run);
  } else if (offer?.kind === 'pending') {
    const wait = el('button', 'open run pending', offer.label); wait.type = 'button'; wait.disabled = true; buttons.append(wait);
  } else if (offer?.kind === 'cowork') {
    buttons.append(link('↗ ' + offer.label, offer.url, 'open'));
  } else if (offer?.kind === 'signin') {
    const work = el('button', 'open run', '▶ ' + offer.label); work.type = 'button'; work.onclick = () => act.onSignIn?.(); buttons.append(work);
    if (url) buttons.append(link('↗ Open', url, 'open alt'));
  } else if (offer?.kind === 'manual') {
    const work = el('button', 'open run', '▶ ' + offer.label); work.type = 'button'; work.disabled = true; buttons.append(work);
    if (url) buttons.append(link('↗ Open', url, 'open alt'));
  } else if (agent.kind === 'game' && actions.props) {
    const props = el('button', 'open run', '🏀 Props'); props.type = 'button'; props.onclick = actions.props; buttons.append(props);
    if (url) buttons.append(link('↗ ESPN', url, 'open alt'));
  } else if (url) buttons.append(link('↗ Open', url, 'open'));
  const focus = el('button', 'ghost', '⌖ Focus'); focus.type = 'button'; focus.onclick = () => actions.focus?.();
  if (task && actions.details) { const more = el('button', 'ghost', '☰ Details'); more.type = 'button'; more.onclick = actions.details; buttons.append(more); }
  buttons.append(focus);
  const extras = [];
  if (offer?.kind === 'activate' && act.confirming) {
    const box = el('div', 'confirm'), yes = el('button', 'open', 'Yes, start'), no = el('button', 'ghost', 'Cancel');
    yes.type = no.type = 'button'; yes.onclick = () => act.onStart?.(); no.onclick = () => act.onCancel?.();
    const row = el('div', 'row'); row.append(yes, no); box.append(el('p', '', offer.confirm), row); extras.push(box);
  }
  if (offer?.note) extras.push(el('p', 'hint', offer.note));
  if (act?.error) extras.push(el('p', 'activateerr', act.error));
  if (act?.runUrl && safeUrl(act.runUrl)) { const p = el('p', 'runlink'); p.append(link('View this run on GitHub ↗', act.runUrl)); extras.push(p); }

  const body = el('div', 'body');
  const sub = el('p', 'sub');
  sub.append(el('span', 'tag', agent.demo ? (agent.kind === 'game' ? 'Demo game · invented' : 'Demo task · invented') : KIND_LABEL[agent.kind] || agent.kind));
  if (agent.repo) sub.append('  in ', el('b', '', agent.repo));
  else if (agent.kind === 'workflow' && agent.island) sub.append('  on ', el('b', '', agent.island));
  else if (agent.kind === 'site' && safeUrl(agent.url)) { const u = new URL(agent.url); sub.append('  at ', el('b', '', u.host + (u.pathname === '/' ? '' : u.pathname))); }
  if (agent.district) sub.append(' · ', el('b', '', `${agent.district} district`));
  body.append(sub);

  if (agent.kind === 'game' && d.game) {
    const g = d.game, grid = el('div', 'stats');
    grid.append(stat(g.state === 'pre' ? '—' : String(g.away.score), g.away.abbr), stat(g.state === 'pre' ? '—' : String(g.home.score), `${g.home.abbr} · home`));
    body.append(grid, el('p', 'note', g.state === 'pre' ? 'Lines are ready from the season averages. Open the props to put overs and unders on your slip.'
      : `${d.players || 'No'} players on the box score. Open the props to see them against their lines.`));
  } else if (agent.kind === 'site') {
    const grid = el('div', 'stats'); grid.append(stat(d.latest ? `${d.latest.ms} ms` : '—', 'answer time'), stat(d.latest ? ago(d.latest.date, now) : 'checking…', 'last checked'));
    body.append(grid, el('p', 'note', 'This page can only see whether the website answers. It cannot tell a working page from an error page.'));
  } else if (agent.kind === 'local') {
    if (d.role) body.append(el('p', 'role', d.role));
    const grid = el('div', 'stats'); grid.append(stat(d.schedule || '—', 'schedule'));
    body.append(grid, el('p', 'note', d.note));
  } else if (agent.kind === 'workflow' && !d.latest) {
    body.append(el('p', 'note', agent.disabled ? 'This task is switched off.' : 'This task has not run yet.'), statGrid(agent, now));
  } else if (d.latest) {
    body.append(statGrid(agent, now), el('div', 'sec', agent.kind === 'workflow' ? 'Recent runs' : 'Recent commits'));
    const list = el('ul', 'runs');
    for (const it of d.recent) {
      const li = el('li'), line = el('span', 'm'), u = safeUrl(it.url), label = it.result || it.text;
      line.append(u ? link(label, u) : label, ' ', el('span', 't', ago(it.date, now) + (it.event ? ' · ' + it.event.replace(/_/g, ' ') : '')));
      li.append(el('span', `dot ${it.result === 'failed' ? 'fail' : it.result === 'running' ? 'running' : 'ok'}`), line);
      list.append(li);
    }
    body.append(list);
  }
  if (agent.demo) body.append(el('p', 'note', agent.kind === 'game' ? 'Demo game: the teams and players are invented. Nothing here is real.' : 'Demo task: invented to try out the world. Nothing here is real.'));
  root.append(top, bar, buttons, ...extras, body, ...(actions.colours ? [colourSection(actions.colours, agent)] : []));
}

// How far through its 48 minutes a game is (a quarter is 12 minutes; overtime counts as the end).
function gameBar(g) {
  if (!g || g.state === 'pre') return 0;
  if (g.state === 'post' || g.period > 4) return 100;
  const [m, sec] = String(g.clock || '0:00').split(':').map(Number), left = (Number.isFinite(m) ? m : 0) + (Number.isFinite(sec) ? sec : 0) / 60;
  return Math.round(Math.min(100, Math.max(0, ((g.period - 1) * 12 + (12 - Math.min(12, left))) / 48 * 100)));
}

// The grid of figures on the card for an agent (see cardStats in details.mjs).
function statGrid(agent, now) {
  const grid = el('div', 'stats');
  for (const s of cardStats(agent, now)) grid.append(stat(s.value, s.label, s.cls));
  return grid;
}

function stat(value, label, cls = '') {
  const s = el('div', cls ? `stat ${cls}` : 'stat');
  s.append(el('b', '', value), el('span', '', label));
  return s;
}

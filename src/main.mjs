// Wires the page together: load data, build the world, show it in 3D, handle clicks and the side panel,
// and replay the last day's activity on a loop so something is always happening.
import { buildWorld } from './world.mjs';
import { loadData } from './data.mjs';
import { probeAll, siteSignature, siteLatest } from './sites.mjs';
import { CONFIG } from './config.mjs';
import { renderPanel } from './panel.mjs';
import { ago } from './timewords.mjs';
import { renderList } from './list.mjs';
import { replayClock, due, ERRAND_SECONDS } from './anim.mjs';
import { createFeed } from './feed.mjs';
import { initAdmin, isAdmin, onAdminChange, mountSignIn, signOut } from './admin.mjs';
import { offerFor } from './activation.mjs';
import { createRequests } from './requests.mjs';
import { personal } from './personal.mjs';
import { demoTasks } from './demo.mjs';
import { progressAt, progressLabel } from './progress.mjs';
import { taskDetails, isTask } from './details.mjs';
import { renderDrawer } from './drawer.mjs';

const mine = personal();   // what this visitor chose just for themselves, kept in their own browser
// ?demo=tasks fills the CRM islands with invented demo tasks (see demo.mjs); without it the page shows real data only
const demoOn = new URLSearchParams(location.search).get('demo') === 'tasks';

const $ = s => document.querySelector(s);
const feed = createFeed($('#feed'));
// The feed starts collapsed so it does not cover the world; a badge counts what arrived while it was closed.
const feedBox = $('#feed'), badge = $('#feedBadge'), toggle = $('#feedToggle');
let unseen = 0;
function setFeedOpen(open) {
  feedBox.classList.toggle('collapsed', !open); toggle.setAttribute('aria-expanded', String(open));
  if (open) { unseen = 0; badge.hidden = true; }
  mine.setChoice('feedOpen', open ? '1' : '0');
}
toggle.onclick = () => setFeedOpen(feedBox.classList.contains('collapsed'));
if (mine.choice('feedOpen', ['1', '0'], '0') === '1') setFeedOpen(true);   // collapsed by default
const labels = $('#labels'), card = $('#card'), side = $('#side');
const demoTag = $('#demoTag'); if (demoTag) demoTag.hidden = !demoOn;   // an older cached page may not have the label yet
const state = { builtAt: 0, data: null, probes: {}, world: null, selectedAgent: null, selectedIsland: null, hoverAgent: null, showDormant: false, expanded: new Set(), needsFit: true, drawerOpen: false, drawerTab: 'overview' };
const drawer = $('#drawer');   // missing in an older cached page, which then simply has no drawer
const ui = { papers: [], errands: [], hubGlow: 0 };
const bubbles = new Map();       // agent id -> { el, from, until }
const islandLabels = new Map();  // island name -> element
const nameTags = new Map();      // agent id -> name tag shown when zoomed in
const NEAR_DISTANCE = 26;        // camera distance under which name tags appear
const MAX_TAGS = 5;              // name tags shown at once

const LOOP_MS = 240e3;           // the last 24 hours replay in four minutes, then start over
const MAX_PER_FRAME = 6;         // after a pause in the tab, don't flood the screen
const MAX_BUBBLES = 5;           // speech bubbles on screen at once; the robots still run every errand
const BUBBLE_S = 4.5, FLIGHT_S = 1.8;
const t0 = performance.now(), seconds = () => (performance.now() - t0) / 1000;

function message(text) { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; }

// The render effects (ambient occlusion, bloom, tilt-shift) are on by default and drop out by themselves on a slow
// machine. ?fx=1 or ?fx=0 forces them for a visit; the header button remembers the choice.
const fxParam = new URLSearchParams(location.search).get('fx');
const fxSaved = mine.choice('fx', ['on', 'off'], null);   // null: automatic
const fxForce = fxParam === '1' ? true : fxParam === '0' ? false : fxSaved === 'on' ? true : fxSaved === 'off' ? false : null;
if (new URLSearchParams(location.search).has('debug')) {   // for measuring: ?debug
  window.__stats = () => scene?.stats(); window.__root = () => scene?.debugRoot();
  window.__edges = () => (state.world?.islands ?? []).flatMap(i => [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz]) => ({ island: i.name || i.id, ...scene.project(i.x + dx * i.radius, 0, i.z + dz * i.radius) })));
}
const showFx = () => { $('#btnFx').textContent = 'fx: ' + (scene?.fxOn() ? 'on' : 'off'); };
let scene = null;
try { scene = (await import('./scene.mjs')).createScene($('#stage'), { fx: fxForce, onFxAuto: showFx, onContext: lost => message(lost ? 'The graphics card ran out of memory and the 3D view stopped. Close other heavy tabs and reload this page.' : '') }); }
catch { message('Could not load the 3D engine. It needs a connection to cdn.jsdelivr.net, so check your network and reload.'); }
if (!scene && !$('#banner').textContent) message('This browser could not start WebGL, which the 3D world needs. Try a current Chrome, Edge, Firefox or Safari.');

const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text != null) e.textContent = text; return e; };

// ----- Activate: only the signed-in Admin sees any of it (see activation.mjs and admin.mjs)
const act = { confirming: null, busy: null, error: null };   // the card's confirm step, the request in flight, the last refusal
await initAdmin();
const reqs = createRequests({ onChange: () => rebuild() });
mountSignIn($('#stage'));
const showAdmin = () => { $('#btnAdmin').hidden = !isAdmin(); };
showAdmin();
$('#btnAdmin').onclick = () => signOut();
onAdminChange(() => { showAdmin(); act.confirming = act.busy = act.error = null; reqs.resume(); if (state.data) rebuild(); });

// ----- building and refreshing the world
function rebuild() {
  if (!state.data) return;
  const now = Date.now(), tasks = demoOn ? demoTasks(now) : undefined;
  const base = buildWorld(state.data, CONFIG, now, { showDormant: state.showDormant, probes: state.probes, tasks });
  reqs.reconcileWith(base.agents);   // a run the hourly data has caught up with no longer needs its own overlay
  const overrides = reqs.overrides();
  state.world = Object.keys(overrides).length ? buildWorld(state.data, CONFIG, now, { showDormant: state.showDormant, probes: state.probes, tasks, statusOverrides: overrides }) : base;
  const w = state.world;
  if (state.selectedAgent && !w.agents.some(a => a.id === state.selectedAgent)) state.selectedAgent = null;
  if (state.selectedIsland && !w.islands.some(i => i.name === state.selectedIsland)) state.selectedIsland = null;
  scene?.setWorld(w, { refit: state.needsFit }); state.needsFit = false;
  islandLabels.forEach(e => e.remove()); islandLabels.clear();
  for (const isl of w.islands) {
    const e = el('div', `islandlabel ${isl.health}`, isl.name); e.append(el('small', '', isl.dormant ? 'closed' : `${isl.agentCount}`));
    labels.append(e); islandLabels.set(isl.name, e);
  }
  syncProgressBars(w);
  $('#btnDormant').textContent = 'dormant: ' + (state.showDormant ? 'shown' : 'hidden');
  $('#meta').textContent = `${w.islands.filter(i => !i.dormant).length} repos · ${w.agents.length} agents`;
  feed.setQuiet(w.events.length === 0 && !$('#feed ul').children.length);
  refreshUi();
}

function refreshUi() {
  if (state.world) renderList(side, state.world, state, { island: selectIsland, agent: selectAgent });
  const agent = state.world?.agents.find(a => a.id === state.selectedAgent) || null;
  renderPanel(card, agent, clearSelection, Date.now(), { focus: () => scene?.focusAgent(state.selectedAgent), activation: agent && activationFor(agent), details: drawer ? openDrawer : null });
  refreshDrawer(agent);
  if (agent) placeCard();
}

// ----- the details drawer follows the selected task: it opens from the card's Details button and closes with its button, with Escape,
// or when the selection moves to something that has no details
function refreshDrawer(agent = state.world?.agents.find(a => a.id === state.selectedAgent)) {
  if (!drawer) return;
  if (state.drawerOpen && !isTask(agent)) state.drawerOpen = false;
  renderDrawer(drawer, state.drawerOpen ? taskDetails(agent, Date.now()) : null, { tab: state.drawerTab, onTab: t => { state.drawerTab = t; refreshDrawer(); }, onClose: closeDrawer });
}
function openDrawer() { state.drawerOpen = true; refreshDrawer(); }
function closeDrawer() { state.drawerOpen = false; refreshDrawer(); }
addEventListener('keydown', e => { if (e.key === 'Escape' && state.drawerOpen) closeDrawer(); });

// What the card offers this agent right now, and what its buttons do (null when there is nothing to offer).
function activationFor(agent) {
  const request = reqs.requestFor(agent.id), ph = request ? reqs.phaseOf(request) : null;
  const offer = offerFor(agent, { admin: isAdmin(), request, phase: ph?.phase });
  if (!offer) return null;
  return {
    offer, confirming: act.confirming === agent.id, busy: act.busy === agent.id, runUrl: ph?.runUrl || null,
    error: act.error?.id === agent.id ? act.error.message : '',
    onAsk: () => { act.confirming = agent.id; act.error = null; refreshUi(); },
    onCancel: () => { act.confirming = null; refreshUi(); },
    onSignIn: () => { location.hash = '#admin'; },   // the sign-in form opens; once signed in the same card offers the real Work button
    onStart: async () => {
      act.confirming = null; act.busy = agent.id; act.error = null; refreshUi();
      const res = await reqs.start(agent);
      act.busy = null; act.error = res.ok ? null : { id: agent.id, message: res.message };
      refreshUi();
    },
  };
}

// ----- selection
function selectAgent(id) {
  const a = state.world?.agents.find(x => x.id === id); if (!a) return;
  if (act.confirming !== id) act.confirming = null;
  state.selectedAgent = id; state.selectedIsland = a.island; state.expanded.add(a.island);
  scene?.focusAgent(id); refreshUi();
}
function selectIsland(name) {
  const open = state.expanded.has(name) && state.selectedIsland === name && !state.selectedAgent;
  state.selectedAgent = null; state.selectedIsland = name;
  open ? state.expanded.delete(name) : state.expanded.add(name);
  scene?.focusIsland(name); refreshUi();
}
function clearSelection() { state.selectedAgent = null; refreshUi(); }

// What the websites answered: a fresh answer time goes onto the cards without rebuilding the world, and the world is only
// rebuilt when a site goes up or down. An offline browser says nothing about the sites, so it changes nothing.
function applyProbes(probes) {
  if (navigator.onLine === false) return;
  const flipped = siteSignature(probes) !== siteSignature(state.probes);
  state.probes = probes;
  for (const a of state.world?.agents || []) if (a.kind === 'site') a.details = { ...a.details, latest: siteLatest(probes[a.url]) };
  if (flipped && state.data) { rebuild(); state.builtAt = Date.now(); } else if (state.world) refreshUi();
}

async function refresh() {
  // The sites are asked while the data loads, but a site that hangs must never hold the picture up: the first picture waits
  // for them a moment so it already knows which are up, and a late answer is applied when it arrives.
  const probing = probeAll(CONFIG.sites || []).then(applyProbes);
  const data = await loadData();
  await Promise.race([probing, new Promise(r => setTimeout(r, 1500))]);
  if (!data) {
    message(state.data ? 'Could not refresh the data, showing the last copy.' : 'Could not load the data, so the world is empty. Check your connection and reload.');
    return;
  }
  // The data only changes about once an hour, so most five-minute refreshes find the same snapshot. Rebuilding the
  // whole 3D world for nothing costs a visible hitch, so it is only redone for new data or when the clock-based
  // statuses (a committer counts as working for 30 minutes) may have moved on.
  const same = state.data && data.generatedAt && data.generatedAt === state.data.generatedAt && Date.now() - state.builtAt < 15 * 60e3;
  message(''); state.data = data;
  if (!same) { rebuild(); state.builtAt = Date.now(); } else refreshUi();     // the replay clock keeps running; only the events it draws from are swapped
}

// ----- progress: a small bar over each working task astronaut, and the open card's bar, kept moving between refreshes
const progressBars = new Map();   // working task agent id -> its floating bar
let lastProgressSecond = -1;
function syncProgressBars(w) {
  for (const e of progressBars.values()) e.remove();
  progressBars.clear();
  for (const a of w.agents) {
    if (a.status !== 'running' || !a.details?.progress || a.details.progress.state === 'queued') continue;   // a queued run never has a figure
    const e = el('div', 'pbar'), track = el('b'); track.append(el('i')); e.append(track, el('span')); labels.append(e); progressBars.set(a.id, e);
  }
  lastProgressSecond = -1;
}
function updateProgress(t) {
  const second = Math.floor(t);
  if (second === lastProgressSecond || !state.world) return;
  lastProgressSecond = second;
  const now = Date.now(), byId = new Map(state.world.agents.map(a => [a.id, a]));
  for (const [id, e] of progressBars) {
    const p = progressAt(byId.get(id)?.details.progress, now);
    e.classList.toggle('none', !p); e.classList.toggle('est', !!p && !p.exact);
    if (p) { e.firstChild.firstChild.style.width = `${p.value}%`; e.lastChild.textContent = progressLabel(p); }
  }
  const sel = byId.get(state.selectedAgent);
  if (sel && 'progress' in (sel.details || {})) {
    const p = progressAt(sel.details.progress, now), fill = card.querySelector('.bar.known i'), pct = card.querySelector('.pct');
    if (p && fill) fill.style.width = `${p.value}%`;
    if (p && pct) pct.textContent = progressLabel(p);
  }
  if (state.drawerOpen && drawer) {   // the open drawer's bar moves too, and its times are redrawn now and then so they do not go stale
    const p = progressAt(sel?.details?.progress, now), fill = drawer.querySelector('.bar.known i'), pct = drawer.querySelector('.pct');
    if (p && fill) fill.style.width = `${p.value}%`;
    if (p && pct) pct.textContent = progressLabel(p);
    if (second % 15 === 0) refreshDrawer(sel);
  }
}

// ----- overlays that follow things in the 3D view
function place(elm, p, dy = 0) {
  elm.style.display = p && p.visible ? '' : 'none';
  if (p) { elm.style.left = `${p.x}px`; elm.style.top = `${p.y + dy}px`; }
}
function placeCard() {
  const p = scene?.agentHead(state.selectedAgent), box = $('#stage').getBoundingClientRect();
  if (!p || !p.visible) { card.style.visibility = 'hidden'; return; }
  card.style.visibility = '';
  // beside the agent, as in the reference: to its right when there is room, otherwise to its left,
  // and never under the repo panel on the right or the tool strip on the left
  const w = card.offsetWidth, h = card.offsetHeight, minX = 52, maxX = box.width - (side.offsetWidth ? side.offsetWidth + 24 : 8) - w;
  let left = p.x + 34;
  if (left > maxX) left = p.x - w - 34;
  left = Math.min(Math.max(minX, left), Math.max(minX, maxX));
  const top = Math.min(Math.max(8, p.y - 70), box.height - h - 8);
  card.style.left = `${left}px`; card.style.top = `${top}px`;
}

// ----- replay: events the clock passes get a bubble, a page flying to the hub and a feed line
let lastClock = null;
function replay(t) {
  if (!state.world) return;
  const clock = replayClock(performance.now(), Date.now(), LOOP_MS);
  if (lastClock !== null && scene) {
    const fired = due(state.world.events, lastClock, clock).slice(-MAX_PER_FRAME);
    for (const e of fired) {
      const agent = state.world.agents.find(a => a.id === e.agentId); if (!agent) continue;
      let b = bubbles.get(e.agentId);
      if (!b && bubbles.size < MAX_BUBBLES) { b = { el: el('div', 'bubble') }; labels.append(b.el); bubbles.set(e.agentId, b); }
      if (b) { b.el.textContent = e.text; b.el.className = `bubble ${e.result}`; b.from = t; b.until = t + BUBBLE_S; }
      ui.papers.push({ agentId: e.agentId, result: e.result, start: t, dur: FLIGHT_S });
      ui.errands.push({ agentId: e.agentId, result: e.result, start: t });     // its robot walks the crate to the headquarters
      feed.add(e, agent.name);
      if (feedBox.classList.contains('collapsed')) { unseen++; badge.textContent = String(unseen); badge.hidden = false; }
    }
  }
  lastClock = clock;
  ui.papers = ui.papers.filter(p => t - p.start < p.dur + 0.1);
  ui.errands = ui.errands.filter(e => t - e.start < ERRAND_SECONDS + 0.2);
  ui.hubGlow = ui.papers.some(p => { const k = (t - p.start) / p.dur; return k > 0.85 && k <= 1; }) ? 1 : Math.max(0, ui.hubGlow - 0.05);
}

const hoverName = el('div', 'hovername'); hoverName.style.display = 'none'; labels.append(hoverName);
let pointer = null;

function tick() {
  const t = seconds();
  replay(t);
  if (pointer && scene && state.world) {                   // hover: what is under the mouse
    const hit = scene.pick(pointer.x, pointer.y);
    state.hoverAgent = hit?.agentId || null;
    scene.element.style.cursor = hit ? 'pointer' : 'grab'; pointer = null;
  }
  scene?.update(t, { ...ui, t, selectedId: state.selectedAgent, hoverId: state.hoverAgent });
  if (scene && state.world) {
    for (const isl of state.world.islands) { const e = islandLabels.get(isl.name); if (e) place(e, scene.islandLabel(isl)); }
    updateProgress(t);
    for (const [id, e] of progressBars) { if (e.classList.contains('none')) e.style.display = 'none'; else place(e, scene.agentHead(id), -26); }
    for (const [id, b] of bubbles) {
      if (t > b.until || !scene.hasAgent(id)) { b.el.remove(); bubbles.delete(id); continue; }
      place(b.el, scene.agentHead(id), -16); b.el.style.opacity = String(Math.max(0, Math.min(1, (t - b.from) * 5, (b.until - t) * 2.5)));
    }
    // zoomed in: a name tag over the agents nearest the middle of the view, so you can see who is doing what
    // only a handful, working agents first, so busy islands stay readable
    const working = id => (state.world.agents.find(x => x.id === id)?.status === 'running' ? 1 : 0);
    const near = scene.cameraDistance() < NEAR_DISTANCE
      ? new Set(scene.nearAgents(11, 16).sort((a, b) => working(b) - working(a)).slice(0, MAX_TAGS)) : new Set();
    for (const [id, tag] of nameTags) if (!near.has(id) || id === state.selectedAgent) { tag.remove(); nameTags.delete(id); }
    for (const id of near) {
      if (id === state.selectedAgent) continue;
      const a = state.world.agents.find(x => x.id === id); if (!a) continue;
      let tag = nameTags.get(id);
      if (!tag) { tag = el('div', 'worklabel'); tag.append(el('span', `dot ${a.status}`), el('span', 'wn', a.name)); labels.append(tag); nameTags.set(id, tag); }
      tag.classList.toggle('working', a.status === 'running');
      place(tag, scene.agentHead(id), -4);
    }
    const h = state.hoverAgent && !bubbles.has(state.hoverAgent) ? state.world.agents.find(a => a.id === state.hoverAgent) : null;
    if (h) { hoverName.textContent = h.name; place(hoverName, scene.agentHead(h.id), -12); } else hoverName.style.display = 'none';
    if (state.selectedAgent) placeCard();
  }
  if (state.data) $('#sync').textContent = 'data · ' + ago(state.data.generatedAt);
  requestAnimationFrame(tick);
}

// ----- pointer: the scene's controls handle orbit, pan and zoom; a click without movement selects
if (scene) {
  // keep the world centred in the space left of the side panel
  const inset = () => scene.setInset(side.offsetWidth && getComputedStyle(side).display !== 'none' ? side.offsetWidth + 24 : 0);
  inset(); addEventListener('resize', inset);
  let down = null;
  scene.element.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, at: performance.now() }; });
  scene.element.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; });
  scene.element.addEventListener('pointerleave', () => { state.hoverAgent = null; });
  scene.element.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.at > 600 || !state.world) return;
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit?.agentId) selectAgent(hit.agentId);
    else if (hit?.island) selectIsland(hit.island);
    else if (state.selectedAgent) clearSelection();
  });
}

const toggleDormant = () => { state.showDormant = !state.showDormant; state.needsFit = true; rebuild(); };
$('#btnFit').onclick = $('#tbFit').onclick = () => scene?.fit();
showFx();
$('#btnFx').onclick = () => {
  if (!scene) return;
  const on = !scene.fxOn(); scene.setFx(on); showFx();
  mine.setChoice('fx', on ? 'on' : 'off');
};
$('#btnDormant').onclick = $('#tbDormant').onclick = toggleDormant;
$('#tbIn').onclick = () => scene?.zoom(0.7);
$('#tbOut').onclick = () => scene?.zoom(1.4);

refresh();
setInterval(refresh, 5 * 60e3);
requestAnimationFrame(tick);

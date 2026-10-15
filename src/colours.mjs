// The colours of the astronauts. Every agent has the suit and helmet colours its kind gives it; a visitor can choose others for any
// agent (kept in their own browser only, see personal.mjs). A choice is { suit?, helmet? } per agent id, each a '#rrggbb' colour,
// so the suit and the helmet change separately. Pure: the functions take a choice and give a new one, and never change the old.
const DEFAULT_SUIT = { workflow: '#ff7a1a', builder: '#ff3d8a', bot: '#e5353b', human: '#2f86ff', local: '#9a62ff', site: '#14b8a6' };
export const DISABLED = '#9aa3b2';   // a disabled task is greyed out, whatever was chosen, so that its state can still be seen
const PARTS = ['suit', 'helmet'];
const MAX_AGENTS = 400, MAX_ID = 200;   // how many agents' choices are kept, and how long an agent id may be

// The twelve ready colours of the picker: the six the kinds use, then six more.
export const SWATCHES = ['#ff7a1a', '#ff3d8a', '#e5353b', '#2f86ff', '#9a62ff', '#14b8a6', '#f2d24a', '#2fd6a0', '#59d6ff', '#ffffff', '#8b94a3', '#2d3240'];

// '#rrggbb' in lower case ('#rgb' is widened), or null for anything that is not a colour.
export function parseColour(value) {
  if (typeof value !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? [...h].map(c => c + c).join('') : h);
}
export const toInt = colour => parseInt(colour.slice(1), 16);

// The colours an agent's kind gives it: the bot is red, Claude and other builders pink, and so on. The helmet matches the suit.
export function defaultLook(agent) {
  const key = agent.kind === 'builder' ? (agent.name === 'Auto-commit bot' ? 'bot' : 'builder') : DEFAULT_SUIT[agent.kind] ? agent.kind : 'workflow';
  return { suit: DEFAULT_SUIT[key], helmet: DEFAULT_SUIT[key] };
}

// What the visitor has chosen for an agent, with the kind's colour for any part they have not chosen. A saved value that is
// not a colour is ignored.
export function choiceOf(agent, saved) {
  const base = defaultLook(agent), mine = saved && typeof saved === 'object' ? saved[agent.id] : null;
  const suit = parseColour(mine?.suit), helmet = parseColour(mine?.helmet);
  return { suit: suit || base.suit, helmet: helmet || base.helmet, customSuit: !!suit, customHelmet: !!helmet, custom: !!(suit || helmet) };
}

// The colours to draw an agent in: its choice, except that a disabled agent stays grey.
export function lookOf(agent, saved) {
  if (agent.disabled) return { suit: DISABLED, helmet: DISABLED };
  const c = choiceOf(agent, saved);
  return { suit: c.suit, helmet: c.helmet };
}

const validId = id => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID;

// A new choice with one part of one agent set. Anything that is not valid changes nothing (the same object comes back).
export function setColour(saved, id, part, value) {
  const colour = parseColour(value);
  if (!validId(id) || !PARTS.includes(part) || !colour) return saved;
  return { ...saved, [id]: { ...saved[id], [part]: colour } };
}

// A new choice without anything chosen for one agent.
export function resetColour(saved, id) {
  if (!saved || !Object.hasOwn(saved, id)) return saved;
  const { [id]: _gone, ...rest } = saved;
  return rest;
}

// Copy what an agent has chosen (only the parts it has chosen) to every agent on its island. Another island is untouched.
export function applyToIsland(saved, world, agentId) {
  const from = world.agents.find(a => a.id === agentId), c = from && choiceOf(from, saved);
  if (!c || !c.custom) return saved;
  const out = { ...saved };
  for (const a of world.agents.filter(x => x.island === from.island)) {
    out[a.id] = { ...out[a.id], ...(c.customSuit ? { suit: c.suit } : {}), ...(c.customHelmet ? { helmet: c.helmet } : {}) };
  }
  return out;
}

// What was saved, cleaned: only agents with a valid id and at least one valid colour, colours written the same way, and no more
// than MAX_AGENTS of them so storage cannot grow without end.
export function cleanColours(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_AGENTS) break;
    if (!validId(id) || !v || typeof v !== 'object') continue;
    const suit = parseColour(v.suit), helmet = parseColour(v.helmet);
    if (suit || helmet) out[id] = { ...(suit ? { suit } : {}), ...(helmet ? { helmet } : {}) };
  }
  return out;
}

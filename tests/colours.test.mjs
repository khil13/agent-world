import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWATCHES, DISABLED, parseColour, toInt, defaultLook, choiceOf, lookOf, setColour, resetColour, applyToIsland, cleanColours } from '../src/colours.mjs';

const agent = (id, over = {}) => ({ id, name: id.split('::')[1] || id, kind: 'workflow', island: id.split('::')[0], ...over });
const world = (...agents) => ({ agents });

test('a colour is a six-digit hex colour, written in lower case; three digits are widened, anything else is refused', () => {
  assert.equal(parseColour('#14b8a6'), '#14b8a6');
  assert.equal(parseColour('#14B8A6'), '#14b8a6');
  assert.equal(parseColour('#ABC'), '#aabbcc');
  for (const bad of ['14b8a6', '#12345', '#1234567', '#12345678', '#gggggg', 'red', 'rgb(1,2,3)', 'url(x)', '#', '', '  #14b8a6', '#14b8a6 ', null, undefined, 7, {}, ['#fff']]) {
    assert.equal(parseColour(bad), null, String(bad));
  }
});

test('there are twelve different swatches, all valid colours', () => {
  assert.equal(SWATCHES.length, 12);
  assert.equal(new Set(SWATCHES).size, 12);
  for (const c of SWATCHES) assert.equal(parseColour(c), c);
});

test('a colour becomes the number the 3D library wants', () => {
  assert.equal(toInt('#14b8a6'), 0x14b8a6);
  assert.equal(toInt('#000000'), 0);
  assert.equal(toInt('#ffffff'), 0xffffff);
});

test('without a choice an agent has the colours its kind gives, and the helmet matches the suit', () => {
  assert.deepEqual(defaultLook(agent('a::x')), { suit: '#ff7a1a', helmet: '#ff7a1a' });
  assert.equal(defaultLook(agent('a::x', { kind: 'site' })).suit, '#14b8a6');
  assert.equal(defaultLook(agent('a::x', { kind: 'human' })).suit, '#2f86ff');
  assert.equal(defaultLook(agent('a::x', { kind: 'local' })).suit, '#9a62ff');
  assert.equal(defaultLook(agent('a::Claude · builder', { kind: 'builder' })).suit, '#ff3d8a');
  assert.equal(defaultLook(agent('a::Auto-commit bot', { kind: 'builder' })).suit, '#e5353b', 'the bot is red, not the builders\' pink');
  assert.equal(defaultLook(agent('a::x', { kind: 'something new' })).suit, '#ff7a1a', 'an unknown kind is a workflow');
});

test('a choice changes the suit and the helmet separately, and the other part keeps its default', () => {
  const a = agent('NL CRM::t');
  const suitOnly = choiceOf(a, { 'NL CRM::t': { suit: '#2f86ff' } });
  assert.deepEqual([suitOnly.suit, suitOnly.helmet, suitOnly.customSuit, suitOnly.customHelmet, suitOnly.custom], ['#2f86ff', '#ff7a1a', true, false, true]);
  const helmetOnly = choiceOf(a, { 'NL CRM::t': { helmet: '#ffffff' } });
  assert.deepEqual([helmetOnly.suit, helmetOnly.helmet, helmetOnly.customSuit, helmetOnly.customHelmet], ['#ff7a1a', '#ffffff', false, true]);
  const none = choiceOf(a, {});
  assert.deepEqual([none.suit, none.helmet, none.custom], ['#ff7a1a', '#ff7a1a', false]);
});

test('a saved value that is not a colour, or one saved for another agent, is ignored', () => {
  const a = agent('NL CRM::t');
  assert.equal(choiceOf(a, { 'NL CRM::t': { suit: 'red', helmet: 5 } }).custom, false);
  assert.equal(choiceOf(a, { 'NL CRM::other': { suit: '#2f86ff' } }).custom, false);
  assert.equal(choiceOf(a, null).custom, false);
  assert.equal(choiceOf(a, undefined).suit, '#ff7a1a');
  assert.equal(choiceOf(a, { 'NL CRM::t': { suit: 'red', helmet: '#ffffff' } }).suit, '#ff7a1a', 'the good part is kept, the bad part is not');
  assert.equal(choiceOf(a, { 'NL CRM::t': { suit: 'red', helmet: '#ffffff' } }).helmet, '#ffffff');
});

test('a disabled agent stays grey whatever was chosen, so the state can still be seen, but its choice is not lost', () => {
  const off = agent('NL CRM::t', { disabled: true }), saved = { 'NL CRM::t': { suit: '#2f86ff', helmet: '#ffffff' } };
  assert.deepEqual(lookOf(off, saved), { suit: DISABLED, helmet: DISABLED });
  assert.deepEqual(lookOf(off, {}), { suit: DISABLED, helmet: DISABLED });
  assert.equal(choiceOf(off, saved).suit, '#2f86ff', 'the choice is still there for when it is switched on again');
  assert.deepEqual(lookOf(agent('NL CRM::t'), saved), { suit: '#2f86ff', helmet: '#ffffff' });
});

test('setting a colour gives a new choice and changes nothing else', () => {
  const before = { 'NL CRM::a': { suit: '#2f86ff' }, 'NL CRM::b': { helmet: '#ffffff' } };
  const frozen = JSON.stringify(before);
  const after = setColour(before, 'NL CRM::a', 'helmet', '#ABC');
  assert.deepEqual(after, { 'NL CRM::a': { suit: '#2f86ff', helmet: '#aabbcc' }, 'NL CRM::b': { helmet: '#ffffff' } });
  assert.equal(JSON.stringify(before), frozen, 'the old choice is not touched');
  assert.deepEqual(setColour({}, 'NL CRM::a', 'suit', '#14b8a6'), { 'NL CRM::a': { suit: '#14b8a6' } });
});

test('a colour that is not valid, an unknown part or a bad agent id changes nothing', () => {
  const saved = { 'NL CRM::a': { suit: '#2f86ff' } };
  assert.equal(setColour(saved, 'NL CRM::a', 'suit', 'red'), saved);
  assert.equal(setColour(saved, 'NL CRM::a', 'suit', null), saved);
  assert.equal(setColour(saved, 'NL CRM::a', 'shoes', '#ffffff'), saved);
  assert.equal(setColour(saved, '', 'suit', '#ffffff'), saved);
  assert.equal(setColour(saved, undefined, 'suit', '#ffffff'), saved);
  assert.equal(setColour(saved, 'x'.repeat(300), 'suit', '#ffffff'), saved);
});

test('resetting an agent puts it back to its kind\'s colours and leaves the others', () => {
  const saved = { 'NL CRM::a': { suit: '#2f86ff', helmet: '#ffffff' }, 'NL CRM::b': { suit: '#14b8a6' } };
  assert.deepEqual(resetColour(saved, 'NL CRM::a'), { 'NL CRM::b': { suit: '#14b8a6' } });
  assert.equal(resetColour(saved, 'NL CRM::nothing'), saved, 'nothing to reset');
  assert.equal(Object.keys(saved).length, 2, 'the old choice is not touched');
});

test('apply to all copies what the agent has chosen to every agent of its CRM island, and to no other island', () => {
  const w = world(agent('NL CRM::a'), agent('NL CRM::b'), agent('NL CRM::Website', { kind: 'site' }), agent('DK CRM::c'));
  const saved = { 'NL CRM::a': { suit: '#2f86ff', helmet: '#ffffff' } };
  const out = applyToIsland(saved, w, 'NL CRM::a');
  for (const id of ['NL CRM::a', 'NL CRM::b', 'NL CRM::Website']) assert.deepEqual(out[id], { suit: '#2f86ff', helmet: '#ffffff' }, id);
  assert.equal(out['DK CRM::c'], undefined, 'another island is untouched');
  assert.deepEqual(saved, { 'NL CRM::a': { suit: '#2f86ff', helmet: '#ffffff' } }, 'the old choice is not touched');
});

test('apply to all copies only the parts that were chosen, so the others keep what they had', () => {
  const w = world(agent('NL CRM::a'), agent('NL CRM::b'), agent('NL CRM::Website', { kind: 'site' }));
  const saved = { 'NL CRM::a': { suit: '#2f86ff' }, 'NL CRM::b': { helmet: '#ffffff' } };
  const out = applyToIsland(saved, w, 'NL CRM::a');
  assert.deepEqual(out['NL CRM::b'], { helmet: '#ffffff', suit: '#2f86ff' }, 'b keeps its own helmet choice and gets the suit');
  assert.deepEqual(out['NL CRM::Website'], { suit: '#2f86ff' }, 'the website keeps its teal helmet');
  assert.deepEqual(choiceOf(w.agents[2], out), { ...choiceOf(w.agents[2], out), suit: '#2f86ff', helmet: '#14b8a6', customSuit: true, customHelmet: false, custom: true });
});

test('apply to all does nothing for an agent that has chosen nothing, or one that is not in the world', () => {
  const w = world(agent('NL CRM::a'), agent('NL CRM::b'));
  const saved = { 'NL CRM::b': { suit: '#2f86ff' } };
  assert.equal(applyToIsland(saved, w, 'NL CRM::a'), saved);
  assert.equal(applyToIsland(saved, w, 'NL CRM::ghost'), saved);
  assert.equal(applyToIsland(saved, world(), 'NL CRM::b'), saved);
});

test('saved colours are cleaned when read: junk is dropped, good parts are kept and written the same way', () => {
  assert.deepEqual(cleanColours(null), {});
  assert.deepEqual(cleanColours('text'), {});
  assert.deepEqual(cleanColours([1, 2]), {});
  assert.deepEqual(cleanColours({ a: { suit: '#ABC', helmet: 'red' }, b: 'x', c: null, d: { suit: 5 }, e: { helmet: '#ffffff', extra: 1 } }),
    { a: { suit: '#aabbcc' }, e: { helmet: '#ffffff' } });
  assert.deepEqual(cleanColours({ ['x'.repeat(300)]: { suit: '#ffffff' } }), {}, 'an agent id that long is not one');
});

test('there is a limit to how many agents are remembered, so storage cannot grow without end', () => {
  const many = Object.fromEntries(Array.from({ length: 600 }, (_, i) => ['NL CRM::t' + i, { suit: '#ffffff' }]));
  assert.equal(Object.keys(cleanColours(many)).length, 400);
});

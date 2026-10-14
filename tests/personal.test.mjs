import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personal } from '../src/personal.mjs';

const memory = (start = {}) => {
  const map = new Map(Object.entries(start));
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); } };
};
const blocked = () => ({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() { throw new Error('SecurityError'); } });
const full = () => ({ ...memory(), setItem() { throw new Error('QuotaExceededError'); } });

test('a text choice is remembered and read back', () => {
  const p = personal(memory());
  assert.equal(p.choice('fx', ['on', 'off'], null), null, 'nothing chosen yet');
  assert.equal(p.setChoice('fx', 'off'), true);
  assert.equal(p.choice('fx', ['on', 'off'], null), 'off');
});

test('choices already saved by earlier visits are still understood, under the same names', () => {
  const store = memory({ 'world.fx': 'on', 'world.feedOpen': '1' });
  const p = personal(store);
  assert.equal(p.choice('fx', ['on', 'off'], null), 'on');
  assert.equal(p.choice('feedOpen', ['1', '0'], '0'), '1');
  p.setChoice('feedOpen', '0');
  assert.equal(store.map.get('world.feedOpen'), '0', 'the name and the plain text are unchanged, so nothing is lost on either side');
});

test('a saved text that is not one of the allowed choices is ignored', () => {
  const p = personal(memory({ 'world.fx': 'maybe' }));
  assert.equal(p.choice('fx', ['on', 'off'], 'auto'), 'auto');
  assert.equal(p.setChoice('fx', 'maybe', ['on', 'off']), false, 'and one that is not allowed is not saved');
});

test('structured choices (colours, names) round trip', () => {
  const p = personal(memory());
  const colours = { 'NL CRM::Website': { suit: '#14b8a6', helmet: '#ffffff' } };
  assert.equal(p.setJson('colours', colours), true);
  assert.deepEqual(p.json('colours', {}), colours);
  assert.deepEqual(p.json('names', {}), {}, 'a choice never made gives the fallback');
});

test('a damaged or wrong-kind saved value gives the fallback instead of breaking the page', () => {
  const p = personal(memory({ 'world.colours': '{"half', 'world.names': '["not","an","object"]' }));
  assert.deepEqual(p.json('colours', { none: true }), { none: true }, 'damaged text');
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  assert.deepEqual(p.json('names', {}, isObject), {}, 'valid text of the wrong kind');
  assert.deepEqual(p.json('names', {}), ['not', 'an', 'object'], 'without a check the value is returned as saved');
});

test('with browser storage blocked nothing throws: reads give the fallback and writes say they were not kept', () => {
  const p = personal(blocked());
  assert.equal(p.choice('fx', ['on', 'off'], 'auto'), 'auto');
  assert.deepEqual(p.json('colours', {}), {});
  assert.equal(p.setChoice('fx', 'on'), false);
  assert.equal(p.setJson('colours', {}), false);
  assert.doesNotThrow(() => p.forget('fx'));
});

test('with no browser storage at all it behaves the same', () => {
  const p = personal(null);
  assert.equal(p.choice('fx', ['on', 'off'], 'auto'), 'auto');
  assert.equal(p.setChoice('fx', 'on'), false);
  assert.doesNotThrow(() => personal(), 'asking for the browser\'s own storage never throws, whatever the environment');
});

test('a full storage keeps what it had and reports that the new value was not saved', () => {
  const p = personal(full());
  assert.equal(p.setChoice('fx', 'on'), false);
  assert.equal(p.choice('fx', ['on', 'off'], 'auto'), 'auto');
});

test('forgetting a choice returns it to the fallback', () => {
  const p = personal(memory());
  p.setChoice('fx', 'on'); p.setJson('names', { a: 'b' });
  p.forget('fx'); p.forget('names');
  assert.equal(p.choice('fx', ['on', 'off'], 'auto'), 'auto');
  assert.deepEqual(p.json('names', {}), {});
});

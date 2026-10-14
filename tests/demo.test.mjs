import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoTasks, DEMO_ISLANDS } from '../src/demo.mjs';
import { buildWorld } from '../src/world.mjs';
import { CONFIG } from '../src/config.mjs';
import { progressAt } from '../src/progress.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const all = feed => Object.values(feed).flat();

test('the demo feed has fifteen tasks for each of the three CRM islands, and none for the landing page', () => {
  const feed = demoTasks(NOW);
  assert.deepEqual(Object.keys(feed), ['NL CRM', 'DK CRM', 'BE CRM']);
  assert.deepEqual(Object.keys(feed), DEMO_ISLANDS);
  for (const tasks of Object.values(feed)) assert.equal(tasks.length, 15);
});

test('every demo task is plainly invented: a generic name starting with Demo, marked as a demo, no link', () => {
  for (const t of all(demoTasks(NOW))) {
    assert.match(t.name, /^Demo [a-z]+( [a-z]+)*$/, t.name);
    assert.equal(t.demo, true, t.name);
    assert.ok(!t.url, t.name + ' has no link to pretend to be a real run');
  }
});

test('task names are unique on an island, and the three islands share the same invented names', () => {
  const feed = demoTasks(NOW);
  for (const tasks of Object.values(feed)) assert.equal(new Set(tasks.map(t => t.name)).size, tasks.length);
  assert.deepEqual(feed['DK CRM'].map(t => t.name).sort(), feed['NL CRM'].map(t => t.name).sort());
});

test('between them the demo tasks show every state the world can draw', () => {
  const states = new Set(all(demoTasks(NOW)).map(t => (t.enabled === false ? 'disabled' : !t.status ? 'never run' : t.status === 'queued' ? 'queued' : t.status === 'in_progress' ? 'running' : t.concl)));
  for (const s of ['running', 'queued', 'success', 'failure', 'cancelled', 'disabled', 'never run']) assert.ok(states.has(s), s);
});

test('each CRM island shows a different mix, so the three do not look copied', () => {
  const feed = demoTasks(NOW), mix = tasks => tasks.map(t => (t.enabled === false ? 'd' : t.status === 'in_progress' ? 'r' : t.status === 'queued' ? 'q' : t.concl || 'n')[0]).join('');
  assert.equal(new Set(Object.values(feed).map(mix)).size, 3);
});

test('the demo feed depends only on the time it is given, and its runs are in the past of that time', () => {
  assert.deepEqual(demoTasks(NOW), demoTasks(NOW));
  for (const t of all(demoTasks(NOW)).filter(t => t.date)) assert.ok(Date.parse(t.date) <= NOW, t.name);
  const later = demoTasks(NOW + 3600e3);
  assert.deepEqual(all(later).map(t => t.name), all(demoTasks(NOW)).map(t => t.name), 'the cast does not change, only the clock');
});

test('built into the real world config, the CRM islands fill up and the other islands are untouched', () => {
  const w = buildWorld({ repos: [] }, CONFIG, NOW, { tasks: demoTasks(NOW) });
  const count = n => w.agents.filter(a => a.island === n).length;
  assert.deepEqual([count('NL CRM'), count('DK CRM'), count('BE CRM')], [16, 16, 16]);
  assert.equal(count('CRM landing'), 1);
  assert.equal(count('Lobby'), 1);
  const plain = buildWorld({ repos: [] }, CONFIG, NOW, {});
  assert.deepEqual(w.islands.map(i => i.name), plain.islands.map(i => i.name), 'the same islands, just fuller');
});

test('the demo tasks show every kind of progress figure: exact, estimated, frozen where a run stopped, and none', () => {
  const w = buildWorld({ repos: [] }, CONFIG, NOW, { tasks: demoTasks(NOW) });
  const kinds = new Set();
  for (const a of w.agents.filter(x => x.demo)) {
    const p = progressAt(a.details.progress, NOW), how = !p ? 'no figure' : p.exact ? 'exact' : 'estimate';
    if (a.status === 'running' && !a.details.queued) kinds.add('running, ' + how);
    if (a.status === 'fail') kinds.add('failed, ' + how);
  }
  for (const k of ['running, exact', 'running, estimate', 'running, no figure', 'failed, exact', 'failed, estimate']) assert.ok(kinds.has(k), k);
});

test('a demo run that is still going never shows as finished, and every figure is a sensible percentage', () => {
  const w = buildWorld({ repos: [] }, CONFIG, NOW, { tasks: demoTasks(NOW) });
  for (const a of w.agents.filter(x => x.demo && x.status === 'running')) {
    const p = progressAt(a.details.progress, NOW);
    if (p) assert.ok(Number.isInteger(p.value) && p.value >= 0 && p.value <= 99, a.name + ' ' + p.value);
  }
  for (const a of w.agents.filter(x => x.demo)) { const p = progressAt(a.details.progress, NOW); if (p) assert.ok(p.value >= 0 && p.value <= 100, a.name); }
});

test('finished demo tasks carry the history that the estimates come from', () => {
  const t = demoTasks(NOW)['NL CRM'].find(x => x.status === 'completed' && x.concl === 'success' && x.enabled);
  assert.ok(t.runs.length >= 3 && t.runs.every(r => r.ms > 0), 'a few past runs, each with a duration');
});

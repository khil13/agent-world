import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/world.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const iso = hoursAgo => new Date(NOW - hoursAgo * 3600e3).toISOString();
const SITES = [{ name: 'NL CRM', url: 'https://x.dev/' }, { name: 'DK CRM', url: 'https://x.dev/dk/' }, { name: 'CRM landing', url: 'https://x.dev/landing' }];
const CONFIG = { localAgents: [], sites: SITES };
// A task as the task feed gives it: a workflow's latest run (same words as the published data) and whether it is switched on.
const task = (name, over = {}) => ({ name, enabled: true, status: 'completed', concl: 'success', date: iso(3), url: 'https://example.test/run', event: 'schedule', ...over });
const world = (tasks, config = CONFIG, opts = {}) => buildWorld({ repos: [] }, config, NOW, { tasks, ...opts });
const on = (w, island) => w.agents.filter(a => a.island === island);

test('tasks stand on their CRM island beside its website agent, and the islands stay as they were', () => {
  const w = world({ 'NL CRM': [task('b task'), task('a task')] });
  assert.deepEqual(w.islands.map(i => i.name), ['NL CRM', 'DK CRM', 'CRM landing']);
  assert.deepEqual(on(w, 'NL CRM').map(a => [a.name, a.kind]), [['Website', 'site'], ['a task', 'workflow'], ['b task', 'workflow']]);
  assert.equal(w.islands[0].agentCount, 3);
  assert.deepEqual(on(w, 'DK CRM').map(a => a.name), ['Website'], 'an island without a feed keeps just its website');
  assert.equal(new Set(w.agents.map(a => a.id)).size, w.agents.length, 'ids are unique');
});

test('a task is working while its run goes, asleep after it, and failing when its last run failed', () => {
  const w = world({ 'NL CRM': [
    task('running', { status: 'in_progress', concl: null }),
    task('done'),
    task('broken', { concl: 'failure' }),
    task('cancelled', { concl: 'cancelled' })] });
  const st = Object.fromEntries(on(w, 'NL CRM').map(a => [a.name, a.status]));
  assert.deepEqual(st, { Website: 'idle', running: 'running', done: 'ok', broken: 'fail', cancelled: 'idle' });
  const broken = on(w, 'NL CRM').find(a => a.name === 'broken');
  assert.equal(broken.details.latest.result, 'failed');
  assert.equal(w.islands[0].health, 'fail', 'a failing task colours its island');
});

test('a queued task works and says it is queued', () => {
  const a = on(world({ 'NL CRM': [task('waiting', { status: 'queued', concl: null })] }), 'NL CRM').find(x => x.name === 'waiting');
  assert.equal(a.status, 'running');
  assert.equal(a.details.queued, true);
  assert.equal(a.details.latest.result, 'queued');
  assert.equal(on(world({ 'NL CRM': [task('going', { status: 'in_progress', concl: null })] }), 'NL CRM').find(x => x.name === 'going').details.queued, undefined);
});

test('a disabled task is asleep and marked disabled, whatever its last run says', () => {
  const w = world({ 'NL CRM': [task('off', { enabled: false, status: 'in_progress', concl: null }), task('off too', { enabled: false, concl: 'failure' })] });
  for (const a of on(w, 'NL CRM').filter(x => x.kind === 'workflow')) {
    assert.equal(a.status, 'idle', a.name);
    assert.equal(a.disabled, true, a.name);
    assert.equal(a.details.queued, undefined);
  }
  assert.notEqual(w.islands[0].health, 'fail', 'a disabled task does not raise an alarm');
  assert.equal(on(world({ 'NL CRM': [task('on')] }), 'NL CRM').find(x => x.name === 'on').disabled, undefined);
});

test('a task that has never run is asleep with no run to show', () => {
  const a = on(world({ 'NL CRM': [{ name: 'new one', enabled: true }] }), 'NL CRM').find(x => x.name === 'new one');
  assert.equal(a.status, 'idle');
  assert.equal(a.details.latest, null);
  assert.deepEqual(a.details.recent, []);
});

test('a task carries its repo, its run link, its recent runs and whether it is a demo', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7].map(h => ({ status: 'completed', concl: h === 2 ? 'failure' : 'success', date: iso(h), url: 'https://example.test/' + h, event: 'workflow_dispatch' }));
  const a = on(world({ 'NL CRM': [task('wf', { repo: 'some-repo', demo: true, runs })] }), 'NL CRM').find(x => x.name === 'wf');
  assert.equal(a.repo, 'some-repo');
  assert.equal(a.demo, true);
  assert.equal(a.id, 'NL CRM::wf');
  assert.equal(a.details.recent.length, 5, 'the same number of recent runs as any workflow');
  assert.equal(a.details.latest.url, 'https://example.test/1');
  const plain = on(world({ 'NL CRM': [task('p')] }), 'NL CRM').find(x => x.name === 'p');
  assert.equal(plain.repo, null);
  assert.equal(plain.demo, undefined);
});

test('a feed for an island that does not exist is ignored', () => {
  const w = world({ 'Nowhere': [task('ghost')], 'NL CRM': [task('real')] });
  assert.deepEqual(w.islands.map(i => i.name), ['NL CRM', 'DK CRM', 'CRM landing']);
  assert.ok(!w.agents.some(a => a.name === 'ghost'));
  assert.ok(!JSON.stringify(w).includes('Nowhere'));
});

test('a repeated task name, or one called Website, makes one agent only', () => {
  const w = world({ 'NL CRM': [task('twin'), task('twin', { concl: 'failure' }), task('Website')] });
  assert.deepEqual(on(w, 'NL CRM').map(a => a.name), ['Website', 'twin']);
  assert.equal(on(w, 'NL CRM').find(a => a.name === 'Website').kind, 'site', 'the website agent is the real one');
});

test('entries and feeds that are not tasks are ignored instead of breaking the world', () => {
  const w = world({ 'NL CRM': [null, 7, 'text', {}, { name: '' }, { name: 5 }, task('fine')], 'DK CRM': 'not a list', 'CRM landing': null });
  assert.deepEqual(on(w, 'NL CRM').map(a => a.name), ['Website', 'fine']);
  assert.deepEqual(on(w, 'DK CRM').map(a => a.name), ['Website']);
});

test('without a task feed the world is exactly what it was', () => {
  const none = buildWorld({ repos: [] }, CONFIG, NOW, {});
  assert.deepEqual(world(undefined), none);
  assert.deepEqual(world({}), none);
  assert.deepEqual(world({ 'NL CRM': [] }), none);
});

test('an island full of tasks is drawn crowded, and every astronaut still has its own tile inside it', () => {
  const many = Array.from({ length: 15 }, (_, i) => task('task ' + String(i).padStart(2, '0')));
  const w = world({ 'NL CRM': many, 'DK CRM': many, 'CRM landing': [] });
  const nl = w.islands.find(i => i.name === 'NL CRM');
  assert.equal(nl.agentCount, 16);
  assert.equal(nl.rings, 2);
  assert.ok(nl.scale < 1 && nl.scale >= 0.5, 'its buildings are drawn smaller');
  assert.equal(w.islands.find(i => i.name === 'CRM landing').scale, 1, 'a quiet island is not shrunk');
  const spots = on(w, 'NL CRM').map(a => `${a.pos.x},${a.pos.z}`);
  assert.equal(new Set(spots).size, 16, 'no two share a tile');
  for (const a of on(w, 'NL CRM')) assert.ok(Math.hypot(a.pos.x - nl.x, a.pos.z - nl.z) < nl.radius, a.name + ' is inside the island');
  assert.equal(w.islands.length, 3, 'still the same islands');
});

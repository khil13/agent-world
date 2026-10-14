import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../src/world.mjs';
import { taskDetails, isTask, durationText, finishText, cardStats } from '../src/details.mjs';
import { progressBasis } from '../src/progress.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');   // a Friday
const MIN = 60e3;
const iso = hoursAgo => new Date(NOW - hoursAgo * 3600e3).toISOString();
const minAgo = m => new Date(NOW - m * MIN).toISOString();
const SITES = [{ name: 'NL CRM', url: 'https://x.dev/' }];
const finished = (minutes, hoursAgo = 5, over = {}) => ({ status: 'completed', concl: 'success', date: iso(hoursAgo), ms: minutes * MIN, url: 'https://example.test/old', event: 'schedule', ...over });
const task = (name, runs, over = {}) => ({ name, enabled: true, schedule: ['0 6 * * *'], ...(runs[0] || {}), runs, ...over });
const agent = (t, config = { localAgents: [], sites: SITES }) => buildWorld({ repos: [] }, config, NOW, { tasks: { 'NL CRM': [t] } }).agents.find(a => a.name === t.name);
const details = (t, now = NOW) => taskDetails(agent(t), now, 'UTC');
const row = (d, label) => d.overview.find(r => r.label === label);
const going = (m, extra = {}) => ({ status: 'in_progress', concl: null, date: minAgo(m), url: 'https://example.test/now', event: 'schedule', ...extra });

test('only a task has details: not a website, not a published workflow, not nothing', () => {
  const w = buildWorld({ repos: [] }, { localAgents: [], sites: SITES }, NOW, { tasks: { 'NL CRM': [task('Contact finder', [finished(6)])] } });
  assert.equal(isTask(w.agents.find(a => a.kind === 'site')), false);
  assert.equal(isTask(w.agents.find(a => a.name === 'Contact finder')), true);
  assert.equal(isTask(null), false);
  assert.equal(taskDetails(w.agents.find(a => a.kind === 'site'), NOW, 'UTC'), null);
  assert.equal(taskDetails(null, NOW, 'UTC'), null);
});

test('a running task with its steps: the overview names its step, the progress tab shows the exact figure, the step count and when it should finish', () => {
  const d = details(task('Contact finder', [going(3, { steps: { done: 3, total: 8, current: 'Fetch data' } }), finished(6), finished(6, 29), finished(6, 53)]));
  assert.deepEqual(d.overview.map(r => r.label), ['Task', 'Status', 'Kind of job', 'Schedule', 'Current step', 'Last result', 'Last duration', 'Latest run']);
  assert.equal(row(d, 'Task').value, 'Contact finder');
  assert.equal(row(d, 'Status').value, 'Working');
  assert.equal(row(d, 'Kind of job').value, 'Contacts district');
  assert.equal(row(d, 'Schedule').value, 'UTC: 0 6 * * *');
  assert.equal(row(d, 'Current step').value, 'Fetch data');
  assert.equal(row(d, 'Last result').value, 'succeeded 5h ago', 'the last run that finished, not the one going now');
  assert.equal(row(d, 'Last duration').value, '6 min');
  assert.deepEqual(row(d, 'Latest run'), { label: 'Latest run', value: 'Open it on GitHub', href: 'https://example.test/now' });
  assert.equal(row(d, 'Next run'), undefined, 'a task that is working is not waiting for its next run');
  assert.deepEqual(d.progress, { mode: 'running', figure: { value: 37, exact: true, label: '37%' }, step: 'Fetch data', stepsText: '3 of 8 steps',
    finish: { text: 'about Fri 12:03 (in 3 min)', late: false }, stuck: null, note: '' });
});

test('without steps the figure is an estimate, and there is no current step to name', () => {
  const d = details(task('Contact finder', [going(3), finished(6), finished(6, 29)]));
  assert.equal(row(d, 'Current step'), undefined);
  assert.deepEqual(d.progress.figure, { value: 50, exact: false, label: '≈50%' });
  assert.equal(d.progress.step, null);
  assert.equal(d.progress.stepsText, null);
  assert.equal(d.progress.finish.text, 'about Fri 12:03 (in 3 min)');
});

test('a running task with nothing to compare with says so instead of showing a made-up figure or time', () => {
  const d = details(task('Contact finder', [going(3)]));
  assert.equal(d.progress.mode, 'running');
  assert.equal(d.progress.figure, null);
  assert.equal(d.progress.finish, null);
  assert.match(d.progress.note, /no finished runs to compare with/i);
  assert.equal(row(d, 'Last result').value, 'never finished a run');
  assert.equal(row(d, 'Last duration').value, '—');
});

test('a run that is taking longer than usual says so rather than giving a time in the past', () => {
  const d = details(task('Contact finder', [going(10), finished(6), finished(6, 29)]));
  assert.deepEqual(d.progress.finish, { text: 'taking longer than usual', late: true });
  assert.equal(d.progress.figure.value, 95);
});

test('a queued task is waiting for GitHub', () => {
  const d = details(task('Contact finder', [{ status: 'queued', concl: null, date: minAgo(1), url: 'https://example.test/q', event: 'schedule' }, finished(6)]));
  assert.equal(row(d, 'Status').value, 'Queued');
  assert.equal(d.progress.mode, 'queued');
  assert.equal(d.progress.figure, null);
  assert.equal(d.progress.note, 'Waiting for GitHub to start it.');
});

test('a task that succeeded: complete, with its last result, duration, link and when it runs next', () => {
  const d = details(task('Contact finder', [finished(6, 5, { ms: 372e3 }), finished(6, 29)]));
  assert.equal(row(d, 'Status').value, 'Healthy');
  assert.equal(row(d, 'Last result').value, 'succeeded 5h ago');
  assert.equal(row(d, 'Last duration').value, '6 min 12 s');
  assert.equal(row(d, 'Next run').value, 'in 18 h, Sat 06:00');
  assert.equal(row(d, 'Latest run').href, 'https://example.test/old');
  assert.equal(d.progress.mode, 'finished');
  assert.deepEqual(d.progress.figure, { value: 100, exact: true, label: '100%' });
  assert.equal(d.progress.note, 'The last run finished.');
  assert.equal(d.progress.finish, null);
});

test('a task that failed shows where the run stopped', () => {
  const d = details(task('Contact finder', [finished(3, 2, { concl: 'failure', steps: { done: 4, total: 9 } }), finished(6, 29)]));
  assert.equal(row(d, 'Status').value, 'Failed');
  assert.equal(row(d, 'Last result').value, 'failed 2h ago');
  assert.deepEqual(d.progress.figure, { value: 44, exact: true, label: '44%' });
  assert.equal(d.progress.note, 'The last run stopped at 44%.');
  const unknown = details(task('Contact finder', [{ status: 'completed', concl: 'failure', date: iso(2), url: 'https://example.test/f', event: 'schedule' }]));
  assert.equal(unknown.progress.figure, null);
  assert.equal(unknown.progress.note, 'The last run stopped, and there is not enough to say where.');
});

test('a disabled task says it is switched off and has no next run', () => {
  const d = details(task('Contact finder', [finished(6)], { enabled: false }));
  assert.equal(row(d, 'Status').value, 'Disabled');
  assert.equal(row(d, 'Next run').value, 'Disabled');
  assert.equal(d.progress.mode, 'none');
  assert.equal(d.progress.note, 'This task is switched off.');
});

test('a task that has never run has nothing to show but says so', () => {
  const d = details({ name: 'Contact finder', enabled: true, schedule: ['0 6 * * *'] });
  assert.equal(row(d, 'Last result').value, 'never run');
  assert.equal(row(d, 'Last duration').value, '—');
  assert.equal(row(d, 'Latest run'), undefined, 'no run, no link');
  assert.equal(d.progress.mode, 'none');
  assert.equal(d.progress.note, 'This task has not run yet.');
  assert.deepEqual(d.history, []);
});

test('the schedule row shows the entries as given, none, or unknown', () => {
  assert.equal(row(details(task('Contact finder', [finished(6)], { schedule: ['0 7 * * *', '0 19 * * *'] })), 'Schedule').value, 'UTC: 0 7 * * * · 0 19 * * *');
  assert.equal(row(details(task('Contact finder', [finished(6)], { schedule: [] })), 'Schedule').value, 'none: runs only when started');
  assert.equal(row(details(task('Contact finder', [finished(6)], { schedule: undefined })), 'Schedule').value, 'unknown');
  assert.equal(row(details(task('Contact finder', [finished(6)], { schedule: ['0 7 * * *', 5] })), 'Schedule').value, 'UTC: 0 7 * * * · ?');
});

test('history lists the recent runs, newest first, with the result, how long ago, how it started, how long it took and a link', () => {
  const runs = [
    finished(6, 1, { concl: 'failure', event: 'workflow_dispatch', url: 'https://example.test/1' }),
    finished(5, 5, { ms: 372e3, url: 'https://example.test/2' }),
    finished(5, 29, { event: 'push', url: 'http://example.test/insecure' }),
    finished(5, 53, { event: 'repository_dispatch', url: 'javascript:alert(1)' }),
    finished(5, 77, { event: 'some_other_event', url: undefined }),
    finished(5, 101),
    finished(5, 125),
  ];
  const d = details(task('Contact finder', runs));
  assert.equal(d.history.length, 5, 'the same recent runs the card keeps');
  assert.deepEqual(d.history[0], { result: 'failed', tone: 'fail', when: '1h ago', how: 'started by hand', duration: '6 min', href: 'https://example.test/1' });
  assert.deepEqual(d.history.map(r => r.how), ['started by hand', 'on schedule', 'by a push', 'by a request', 'some other event']);
  assert.equal(d.history[1].duration, '6 min 12 s');
  assert.deepEqual(d.history.map(r => r.href), ['https://example.test/1', 'https://example.test/2', null, null, null], 'only https links are kept');
  assert.equal(d.history[1].tone, 'ok');
});

test('a run that is going shows in the history as running, with no duration yet', () => {
  const d = details(task('Contact finder', [going(3), finished(6)]));
  assert.deepEqual([d.history[0].result, d.history[0].tone, d.history[0].duration], ['running', 'running', null]);
});

test('durations read plainly', () => {
  assert.equal(durationText(45e3), '45 s');
  assert.equal(durationText(6 * MIN), '6 min');
  assert.equal(durationText(372e3), '6 min 12 s');
  assert.equal(durationText(65 * MIN), '1 h 5 min');
  assert.equal(durationText(2 * 3600e3), '2 h');
  for (const bad of [0, -5, NaN, undefined, null, '5']) assert.equal(durationText(bad), null, String(bad));
});

test('the details hold only what the task\'s own data says: no description is written anywhere', () => {
  const d = details(task('Contact finder', [finished(6)]));
  const text = JSON.stringify(d);
  assert.ok(!/description|about this task|purpose/i.test(text));
});

test('the progress tab warns when the run is taking much longer than usual, amber first and then red', () => {
  const old = [finished(6), finished(6, 29), finished(6, 53)];
  assert.equal(details(task('Contact finder', [going(3), ...old])).progress.stuck, null);
  assert.equal(details(task('Contact finder', [going(13), ...old])).progress.stuck, 'amber');
  assert.equal(details(task('Contact finder', [going(19), ...old])).progress.stuck, 'red');
  assert.equal(details(task('Contact finder', [going(600), finished(6), finished(6, 29)])).progress.stuck, null, 'two finished runs are not enough to say');
});

test('a task that is not running has no stuck warning, whatever it did before', () => {
  assert.equal(details(task('Contact finder', [finished(600), finished(6, 29), finished(6, 53), finished(6, 77)])).progress.stuck, null);
  assert.equal(details(task('Contact finder', [finished(3, 2, { concl: 'failure' }), finished(6, 29)])).progress.stuck, null);
});

test('the finish text is the same wherever it is shown', () => {
  const basis = progressBasis(going(3), [finished(6)]);
  assert.deepEqual(finishText(basis, NOW, 'UTC'), { text: 'about Fri 12:03 (in 3 min)', late: false });
  assert.deepEqual(finishText(progressBasis(going(10), [finished(6)]), NOW, 'UTC'), { text: 'taking longer than usual', late: true });
  assert.equal(finishText(progressBasis(going(3), []), NOW, 'UTC'), null);
  assert.equal(finishText(null, NOW, 'UTC'), null);
  assert.deepEqual(details(task('Contact finder', [going(3), finished(6)])).progress.finish, finishText(progressBasis(going(3), [finished(6)]), NOW, 'UTC'));
});

// What the small card shows in its grid of figures, for every kind of agent.
const stats = (a, now = NOW) => cardStats(a, now, 'UTC').map(s => [s.label, s.value, s.cls || '']);
const labels = a => cardStats(a, NOW, 'UTC').map(s => s.label);

test('a task that is asleep shows its last run, how it started and when it runs next', () => {
  const a = agent(task('Contact finder', [finished(6, 5, { event: 'workflow_dispatch' }), finished(6, 29)]));
  assert.deepEqual(stats(a), [['latest run', 'succeeded', ''], ['triggered by', 'workflow dispatch', ''], ['next run', 'in 18 h, Sat 06:00', 'wide']]);
});

test('a task that is running shows when it should finish, and not a next run', () => {
  const a = agent(task('Contact finder', [going(3), finished(6), finished(6, 29)]));
  assert.deepEqual(stats(a), [['latest run', 'running', ''], ['triggered by', 'schedule', ''], ['expected finish', 'about Fri 12:03 (in 3 min)', 'wide']]);
});

test('a run that has gone on too long shows that, in the late style', () => {
  const a = agent(task('Contact finder', [going(10), finished(6), finished(6, 29)]));
  assert.deepEqual(stats(a).at(-1), ['expected finish', 'taking longer than usual', 'wide late']);
});

test('a running task with nothing to compare with has no finish line, and a queued one the same', () => {
  assert.deepEqual(labels(agent(task('Contact finder', [going(3)]))), ['latest run', 'triggered by']);
  assert.deepEqual(labels(agent(task('Contact finder', [{ status: 'queued', concl: null, date: minAgo(1), event: 'schedule' }, finished(6)]))), ['latest run', 'triggered by']);
});

test('a disabled task says Disabled where the next run would be', () => {
  assert.deepEqual(stats(agent(task('Contact finder', [finished(6)], { enabled: false }))).at(-1), ['next run', 'Disabled', 'wide']);
});

test('a task that has never run shows only when it runs next', () => {
  assert.deepEqual(stats(agent({ name: 'Contact finder', enabled: true, schedule: ['0 6 * * *'] })), [['next run', 'in 18 h, Sat 06:00', 'wide']]);
  assert.deepEqual(stats(agent({ name: 'Contact finder', enabled: true })), [['next run', 'schedule unknown', 'wide']]);
});

test('a workflow of a published repo shows its run and how it started, and nothing about commits or next runs', () => {
  const repo = { name: 'r', full: 'me/r', desc: '', url: 'https://github.com/me/r', home: '', lang: 'JS', pushed: iso(1), priv: false, issues: 0, prs: '—', commits: [],
    workflows: [{ name: 'Scan', status: 'completed', concl: 'success', date: iso(1), url: 'u', event: 'schedule' }] };
  const a = buildWorld({ repos: [repo] }, { localAgents: [] }, NOW, {}).agents.find(x => x.name === 'Scan');
  assert.deepEqual(stats(a), [['latest run', 'succeeded', ''], ['triggered by', 'schedule', '']]);
});

test('a builder or a person shows when they last committed and how many commits there were', () => {
  const repo = { name: 'r', full: 'me/r', desc: '', url: 'https://github.com/me/r', home: '', lang: 'JS', pushed: iso(1), priv: false, issues: 0, prs: '—', workflows: [],
    commits: [{ sha: 'abc1234', msg: 'a change', date: iso(2), author: 'x', url: 'u', who: 'you', ai: false }, { sha: 'def5678', msg: 'another', date: iso(9), author: 'x', url: 'u', who: 'you', ai: false }] };
  const a = buildWorld({ repos: [repo] }, { localAgents: [] }, NOW, {}).agents.find(x => x.kind === 'human');
  assert.deepEqual(stats(a), [['last commit', '2h ago', ''], ['commits · 8w', '2', '']]);
});

test('agents that have their own cards (a website, a Cowork agent) have no figures from here', () => {
  const w = buildWorld({ repos: [] }, { localAgents: [{ name: 'Watcher', repo: null, schedule: 'Daily', status: 'scheduled' }], sites: SITES }, NOW, {});
  assert.deepEqual(cardStats(w.agents.find(a => a.kind === 'site'), NOW, 'UTC'), []);
  assert.deepEqual(cardStats(w.agents.find(a => a.kind === 'local'), NOW, 'UTC'), []);
});

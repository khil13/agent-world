// What the details drawer shows for a task: three tabs of rows built from the task's own data (nothing is written by hand
// about any task), as plain data so it can be tested without a browser. The drawer in drawer.mjs only draws it.
import { ago, relative, clock } from './timewords.mjs';
import { progressAt, progressLabel, finishAt } from './progress.mjs';
import { describeNextRun } from './schedule.mjs';

export const STATUS_WORD = { running: 'Working', ok: 'Healthy', fail: 'Failed', idle: 'Idle', asleep: 'Scheduled' };
const HOW = { schedule: 'on schedule', workflow_dispatch: 'started by hand', push: 'by a push', pull_request: 'by a pull request', repository_dispatch: 'by a request' };
export const safeUrl = u => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
const going = r => r === 'running' || r === 'queued';   // a run that has not finished

export const isTask = agent => !!agent && agent.kind === 'workflow' && 'progress' in (agent.details || {});

// How long a run took, in plain words: "45 s", "6 min 12 s", "1 h 5 min". null when it is not known.
export function durationText(ms) {
  if (typeof ms !== 'number' || !(ms > 0)) return null;
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (s < 60) return `${s} s`;
  if (h < 1) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

function progressTab(agent, now, timeZone) {
  const d = agent.details, basis = d.progress, figure = progressAt(basis, now);
  const shown = figure && { ...figure, label: progressLabel(figure) };
  if (agent.disabled) return { mode: 'none', figure: null, step: null, stepsText: null, finish: null, note: 'This task is switched off.' };
  if (!basis) return { mode: 'none', figure: null, step: null, stepsText: null, finish: null, note: 'This task has not run yet.' };
  if (basis.state === 'queued') return { mode: 'queued', figure: null, step: null, stepsText: null, finish: null, note: 'Waiting for GitHub to start it.' };
  if (basis.state === 'running') {
    const end = finishAt(basis, now);
    return { mode: 'running', figure: shown, step: basis.step, stepsText: basis.steps ? `${basis.steps.done} of ${basis.steps.total} steps` : null,
      finish: !end ? null : end.late ? { text: 'taking longer than usual', late: true } : { text: `about ${clock(end.at, timeZone)} (${relative(end.at - now)})`, late: false },
      note: shown ? '' : 'No figure yet: this task has no finished runs to compare with.' };
  }
  return { mode: 'finished', figure: shown, step: null, stepsText: null, finish: null,
    note: basis.state === 'done' ? 'The last run finished.' : shown ? `The last run stopped at ${shown.label}.` : 'The last run stopped, and there is not enough to say where.' };
}

// { title, subtitle, overview: [{ label, value, href? }], progress, history } for a task agent, or null for anything else.
export function taskDetails(agent, now, timeZone) {
  if (!isTask(agent)) return null;
  const d = agent.details, latest = d.latest, working = agent.status === 'running';
  const lastDone = (d.recent || []).find(r => !going(r.result));   // the last run that has finished, which is not always the latest
  const status = agent.disabled ? 'Disabled' : d.queued ? 'Queued' : STATUS_WORD[agent.status] || agent.status;
  const schedule = !Array.isArray(d.schedule) ? 'unknown' : d.schedule.length ? `UTC: ${d.schedule.map(s => s || '?').join(' · ')}` : 'none: runs only when started';
  const overview = [
    { label: 'Task', value: agent.name },
    { label: 'Status', value: status },
    { label: 'Kind of job', value: `${agent.district} district` },
    { label: 'Schedule', value: schedule },
  ];
  if (!working) overview.push({ label: 'Next run', value: describeNextRun({ enabled: !agent.disabled, schedule: d.schedule }, now, timeZone) });
  if (working && d.progress?.step) overview.push({ label: 'Current step', value: d.progress.step });
  overview.push(
    { label: 'Last result', value: lastDone ? `${lastDone.result} ${ago(lastDone.date, now)}` : latest ? 'never finished a run' : 'never run' },
    { label: 'Last duration', value: durationText(lastDone?.ms) || '—' });
  if (latest && safeUrl(latest.url)) overview.push({ label: 'Latest run', value: 'Open it on GitHub', href: latest.url });

  const history = (d.recent || []).map(r => ({
    result: r.result, tone: r.result === 'failed' ? 'fail' : going(r.result) ? 'running' : 'ok', when: ago(r.date, now),
    how: HOW[r.event] || (r.event ? String(r.event).replace(/_/g, ' ') : '—'), duration: going(r.result) ? null : durationText(r.ms), href: safeUrl(r.url) }));
  return { title: agent.name, tone: agent.status, subtitle: `on ${agent.island} · ${agent.district} district`, overview, progress: progressTab(agent, now, timeZone), history };
}

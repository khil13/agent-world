// How far a task's run has got, as a percentage. Pure: a run's facts are turned into a "basis" once (when the world is built),
// and the figure for any moment is worked out from the basis and the clock, so a bar can keep moving between refreshes.
// A run is { status, concl, date (when it started), ms (how long it took, once finished), steps: { done, total } }, in the
// words of the published data. A figure is { value 0..100, exact } or null when there is nothing honest to show.
export const EXACT_CAP = 99;       // steps all done but the run still going: it is not finished until GitHub says so
export const ESTIMATE_CAP = 95;    // an estimate never claims the run is nearly over
const USUAL_RUNS = 10;             // how many successful runs say how long a task usually takes
const STUCK_AFTER = { amber: 2, red: 3 };   // a run is amber past this many times its usual time, and red past this many
const STUCK_NEEDS = 3;             // finished runs needed to know the usual time well enough to call a run stuck

const isSteps = s => s && Number.isInteger(s.done) && Number.isInteger(s.total) && s.total > 0 && s.done >= 0 && s.done <= s.total;
const median = list => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// How long the last ten successful runs that have a duration took, newest first. `runs` is newest first.
const usualTimes = runs => (Array.isArray(runs) ? runs : []).filter(r => r && r.status === 'completed' && r.concl === 'success' && r.ms > 0).slice(0, USUAL_RUNS).map(r => r.ms);

// The usual time a task takes: the median of those.
export function typicalMs(runs) {
  const times = usualTimes(runs);
  return times.length ? median(times) : null;
}

// What a task's latest run says about progress, to be read later with progressAt. `older` is the runs before it, newest first.
export function progressBasis(latest, older = []) {
  if (!latest || !latest.status) return null;
  if (latest.status === 'queued') return { state: 'queued' };
  const step = typeof latest.steps?.current === 'string' ? latest.steps.current.slice(0, 80) : null;   // the name of the step it is on, when the run says
  const times = usualTimes(older);
  const common = { startedAt: Date.parse(latest.date), steps: isSteps(latest.steps) ? { done: latest.steps.done, total: latest.steps.total } : null, step,
    typicalMs: times.length ? median(times) : null, samples: times.length };
  if (latest.status !== 'completed') return { state: 'running', ...common };
  return latest.concl === 'success' ? { state: 'done' } : { state: 'stopped', ...common, ms: latest.ms > 0 ? latest.ms : null };
}

const share = (part, whole) => Math.floor((part / whole) * 100);

// The figure for a basis at a moment, or null when there is nothing to base one on.
export function progressAt(basis, now) {
  if (!basis || basis.state === 'queued') return null;
  if (basis.state === 'done') return { value: 100, exact: true };
  if (basis.steps) return { value: Math.min(EXACT_CAP, share(basis.steps.done, basis.steps.total)), exact: true };
  if (!basis.typicalMs) return null;
  if (basis.state === 'running') {
    const elapsed = now - basis.startedAt;
    return Number.isFinite(elapsed) ? { value: Math.min(ESTIMATE_CAP, Math.max(0, share(elapsed, basis.typicalMs))), exact: false } : null;
  }
  return basis.ms ? { value: Math.min(ESTIMATE_CAP, share(basis.ms, basis.typicalMs)), exact: false } : null;   // stopped early: where it got to
}

// When a running task is expected to finish: when it started plus how long it usually takes. { at } while that is still ahead,
// { late: true } once the run has gone on that long, null when there is no past run to compare with or the task is not running.
export function finishAt(basis, now) {
  if (!basis || basis.state !== 'running' || !basis.typicalMs || !Number.isFinite(basis.startedAt) || !Number.isFinite(now)) return null;
  const at = basis.startedAt + basis.typicalMs;
  return at > now ? { at } : { late: true };
}

// Whether a run that is going is taking much longer than usual: 'amber' past twice the usual time, 'red' past three times, else null.
// Only for a task with at least three finished runs to compare with, so a new task never raises a false alarm.
export function stuckAt(basis, now) {
  if (!basis || basis.state !== 'running' || !basis.typicalMs || !(basis.samples >= STUCK_NEEDS)) return null;
  const elapsed = now - basis.startedAt;
  if (!Number.isFinite(elapsed)) return null;
  return elapsed > STUCK_AFTER.red * basis.typicalMs ? 'red' : elapsed > STUCK_AFTER.amber * basis.typicalMs ? 'amber' : null;
}

export const progressLabel = p => (p ? `${p.exact ? '' : '≈'}${p.value}%` : '');

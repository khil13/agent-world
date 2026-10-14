// How far a task's run has got, as a percentage. Pure: a run's facts are turned into a "basis" once (when the world is built),
// and the figure for any moment is worked out from the basis and the clock, so a bar can keep moving between refreshes.
// A run is { status, concl, date (when it started), ms (how long it took, once finished), steps: { done, total } }, in the
// words of the published data. A figure is { value 0..100, exact } or null when there is nothing honest to show.
export const EXACT_CAP = 99;       // steps all done but the run still going: it is not finished until GitHub says so
export const ESTIMATE_CAP = 95;    // an estimate never claims the run is nearly over
const USUAL_RUNS = 10;             // how many successful runs say how long a task usually takes

const isSteps = s => s && Number.isInteger(s.done) && Number.isInteger(s.total) && s.total > 0 && s.done >= 0 && s.done <= s.total;
const median = list => { const s = [...list].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// The usual time a task takes: the median of its last ten successful runs that have a duration. `runs` is newest first.
export function typicalMs(runs) {
  const times = (Array.isArray(runs) ? runs : []).filter(r => r && r.status === 'completed' && r.concl === 'success' && r.ms > 0).slice(0, USUAL_RUNS).map(r => r.ms);
  return times.length ? median(times) : null;
}

// What a task's latest run says about progress, to be read later with progressAt. `older` is the runs before it, newest first.
export function progressBasis(latest, older = []) {
  if (!latest || !latest.status) return null;
  if (latest.status === 'queued') return { state: 'queued' };
  const common = { startedAt: Date.parse(latest.date), steps: isSteps(latest.steps) ? { done: latest.steps.done, total: latest.steps.total } : null, typicalMs: typicalMs(older) };
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

export const progressLabel = p => (p ? `${p.exact ? '' : '≈'}${p.value}%` : '');

// A demo feed of invented tasks, to see the CRM islands full of task astronauts without any real data. It is switched on only
// by a deliberate option in the address (?demo=tasks), every name starts with "Demo", and nothing here is, or is taken from,
// a real task: this is a public repository. Pure: the same time always gives the same feed.
export const DEMO_ISLANDS = ['NL CRM', 'DK CRM', 'BE CRM'];

// Fifteen generic names, three for each kind of job the districts will group by (news, contacts, competitors, research, reports).
const NAMES = ['news scan', 'news digest', 'press watch', 'contact finder', 'contact check', 'contact tidy', 'competitor watch', 'competitor jobs',
  'competitor prices', 'research sweep', 'research outputs', 'research focus', 'daily report', 'weekly report', 'export'];
// What state each task is in, so every state the world can draw is on show. Each island starts the list at a different place.
const STATES = ['ok', 'ok', 'running', 'ok', 'fail', 'ok', 'queued', 'ok', 'disabled', 'ok', 'running', 'ok', 'ok', 'cancelled', 'never'];
const MIN = 60e3;

export function demoTasks(now = Date.now()) {
  const ago = minutes => new Date(now - minutes * MIN).toISOString();
  const someHoursAgo = i => ago(60 * (1 + (i * 7) % 20));   // a different time for each task, within the last day
  const usual = i => 4 + (i % 5);                            // minutes a task usually takes
  // Earlier successful runs, newest first, which say how long the task usually takes.
  const history = i => Array.from({ length: 4 }, (_, k) => ({ status: 'completed', concl: 'success', date: ago(60 * (30 + 24 * k)), ms: (usual(i) + (k % 2)) * MIN, event: 'schedule' }));
  const finishedRun = (i, concl, extra = {}) => ({ status: 'completed', concl, date: someHoursAgo(i), ms: usual(i) * MIN, event: 'schedule', ...extra });

  // The task as the feed gives it: its latest run's fields on the task itself, and its runs newest first.
  const make = (name, state, i, n) => {
    const base = { name, enabled: true, demo: true }, v = (i * 5 + n) % 3;   // v spreads the kinds of figure across the islands
    const withRuns = (latest, older = history(i)) => ({ ...base, ...latest, runs: [latest, ...older] });
    switch (state) {
      case 'running': {
        const latest = { status: 'in_progress', concl: null, date: ago(2 + (i % 4)), event: 'schedule' };
        if (v === 0) return withRuns({ ...latest, steps: { done: 2 + (i % 5), total: 8 } });   // exact: the run reports its steps
        return withRuns(latest, v === 1 ? history(i) : []);                                    // an estimate, or no figure at all (no past runs)
      }
      case 'queued': return withRuns({ status: 'queued', concl: null, date: ago(1), event: 'schedule' });
      case 'fail': return withRuns(finishedRun(i, 'failure', v === 0 ? { steps: { done: 3 + (i % 4), total: 9 }, ms: 2 * MIN } : { ms: Math.round(usual(i) * 0.4 * MIN) }));
      case 'cancelled': return withRuns(finishedRun(i, 'cancelled', { event: 'workflow_dispatch', ms: MIN }));
      case 'disabled': return { ...withRuns({ ...finishedRun(i, 'success'), date: ago(60 * 72) }), enabled: false };
      case 'never': return base;
      default: return withRuns(finishedRun(i, 'success'));
    }
  };
  return Object.fromEntries(DEMO_ISLANDS.map((island, n) => [island, NAMES.map((name, i) => make('Demo ' + name, STATES[(i + 4 * n) % STATES.length], i, n))]));
}

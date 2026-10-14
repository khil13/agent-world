// A demo feed of invented tasks, to see the CRM islands full of task astronauts without any real data. It is switched on only
// by a deliberate option in the address (?demo=tasks), every name starts with "Demo", and nothing here is, or is taken from,
// a real task: this is a public repository. Pure: the same time always gives the same feed.
export const DEMO_ISLANDS = ['NL CRM', 'DK CRM', 'BE CRM'];

// Fifteen generic names, three for each kind of job the districts will group by (news, contacts, competitors, research, reports).
const NAMES = ['news scan', 'news digest', 'press watch', 'contact finder', 'contact check', 'contact tidy', 'competitor watch', 'competitor jobs',
  'competitor prices', 'research sweep', 'research outputs', 'research focus', 'daily report', 'weekly report', 'export'];
// What state each task is in, so every state the world can draw is on show. Each island starts the list at a different place.
const STATES = ['ok', 'ok', 'running', 'ok', 'fail', 'ok', 'queued', 'ok', 'disabled', 'ok', 'running', 'ok', 'ok', 'cancelled', 'never'];

export function demoTasks(now = Date.now()) {
  const ago = minutes => new Date(now - minutes * 60e3).toISOString();
  const someHoursAgo = i => ago(60 * (1 + (i * 7) % 20));   // a different time for each task, within the last day
  const make = (name, state, i) => {
    const base = { name, enabled: true, demo: true };
    switch (state) {
      case 'running': return { ...base, status: 'in_progress', concl: null, date: ago(5 + i), event: 'schedule' };
      case 'queued': return { ...base, status: 'queued', concl: null, date: ago(1), event: 'schedule' };
      case 'fail': return { ...base, status: 'completed', concl: 'failure', date: someHoursAgo(i), event: 'schedule' };
      case 'cancelled': return { ...base, status: 'completed', concl: 'cancelled', date: someHoursAgo(i), event: 'workflow_dispatch' };
      case 'disabled': return { ...base, enabled: false, status: 'completed', concl: 'success', date: ago(60 * 72), event: 'schedule' };
      case 'never': return base;
      default: return { ...base, status: 'completed', concl: 'success', date: someHoursAgo(i), event: 'schedule' };
    }
  };
  return Object.fromEntries(DEMO_ISLANDS.map((island, n) => [island, NAMES.map((name, i) => make('Demo ' + name, STATES[(i + 4 * n) % STATES.length], i))]));
}

// What a manager wants from the world at a glance: how many agents are working, asleep or failing, which of them need
// attention, and which repos to look at first. Pure (no DOM), so it can be tested without a browser.
// Working is a running agent, failing one whose last run failed, and everything else is asleep (the world draws it so).
// A working task whose run is taking much longer than usual (see progress.mjs) needs attention too, though it still counts as working.
import { stuckAt } from './progress.mjs';
const wordFor = status => (status === 'running' ? 'working' : status === 'fail' ? 'failing' : 'asleep');
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function overview(world, now = Date.now()) {
  const totals = { working: 0, asleep: 0, failing: 0 };
  const per = new Map(world.islands.map(i => [i.name, { name: i.name, dormant: !!i.dormant, health: i.health, working: 0, asleep: 0, failing: 0, total: 0 }]));
  const attention = [];
  for (const a of world.agents) {
    const w = wordFor(a.status), repo = per.get(a.island);
    totals[w]++;
    if (repo) { repo[w]++; repo.total++; }
    const date = a.details?.latest?.date || null, level = w === 'working' ? stuckAt(a.details?.progress, now) : null;
    if (w === 'failing') attention.push({ id: a.id, name: a.name, island: a.island, date, kind: 'failing', level: null });
    else if (level) attention.push({ id: a.id, name: a.name, island: a.island, date, kind: 'stuck', level });
  }
  // failing repos first (the worst first), then the ones with work going on, then the calm ones, closed repos last
  const rank = r => (r.dormant ? 3 : r.failing ? 0 : r.working ? 1 : 2);
  const repos = [...per.values()].sort((a, b) => rank(a) - rank(b) || b.failing - a.failing || b.working - a.working || byText(a.name, b.name));
  attention.sort((a, b) => byText(a.island, b.island) || byText(a.name, b.name));
  return { totals, verdict: attention.length ? 'attention' : totals.working ? 'busy' : 'calm', attention, repos };
}

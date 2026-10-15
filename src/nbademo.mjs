// A demo night of NBA games, to try the NBA island and the props panel without the live feed (?demo=nba). Every team and player
// is invented (no real team, player or figure is used), so nothing here can be mistaken for a real box score. Two games are live
// and keep moving (a whole game plays out every 24 minutes, then starts over), two are final and two are still to come.
// Pure: the same time always gives the same night.
const TEAMS = [['MCO', 'Moon Comets'], ['ORB', 'Orbit Owls'], ['NEB', 'Nebula Knights'], ['RKT', 'Rocket Rays'], ['CRT', 'Crater Cats'], ['SOL', 'Solar Sharks'],
  ['AST', 'Asteroid Apes'], ['PUL', 'Pulsar Pumas'], ['GAL', 'Galaxy Gulls'], ['ION', 'Ion Ibex'], ['VEC', 'Vector Vipers'], ['LUN', 'Lunar Lynx']];
const FIRST = ['Ari', 'Bo', 'Cy', 'Dex', 'Eli', 'Fen', 'Gus', 'Hal', 'Ike', 'Jax', 'Kai', 'Lev', 'Max', 'Nico', 'Oz', 'Pax'];
const LAST = ['Demo', 'Sample', 'Testa', 'Mockley', 'Placer', 'Fakely', 'Dummond', 'Proto'];
const POS = ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C'];
// Season averages by role: the first five start.
const ROLE = [[24, 4.5, 6.5, 2.8], [18, 3.8, 4, 2.2], [15, 6.5, 2.5, 1.4], [11, 5.5, 2, 1.1], [10, 9.5, 1.6, 0.2], [9, 2.5, 2.4, 1.3], [7, 3.5, 1.2, 0.7], [5, 4.5, 0.8, 0.1]];
const CYCLE = 24 * 60e3, HOUR = 3600e3;
// [state, offset]: a live game's offset is how far through its game it was at time 0; the others say when they start.
const NIGHT = [['in', 0.15], ['in', 0.6], ['post', -3.2], ['post', -2.9], ['pre', 1.2], ['pre', 2.7]];

const rnd = seed => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };   // 0..1, the same for a seed
const r1 = v => Math.round(v * 10) / 10;

function roster(t) {
  return ROLE.map((role, k) => {
    const s = t * 31 + k * 7, f = 0.8 + rnd(s) * 0.4;
    return { id: `demo-${TEAMS[t][0]}-${k}`, name: `${FIRST[(t * 5 + k * 3) % FIRST.length]} ${LAST[(t + k) % LAST.length]}`, team: TEAMS[t][0], pos: POS[k], starter: k < 5,
      avg: { pts: r1(role[0] * f), reb: r1(role[1] * f), ast: r1(role[2] * f), threes: r1(role[3] * f) } };
  });
}

export function demoNba(now = Date.now()) {
  const games = [], boxes = {}, averages = {};
  NIGHT.forEach(([state, off], i) => {
    const home = 2 * i, away = 2 * i + 1, id = `demo-${i + 1}`;
    const f = state === 'in' ? (now / CYCLE + off) % 1 : state === 'post' ? 1 : 0;   // how far through the game it is
    const start = state === 'in' ? now - f * 2.4 * HOUR : now + off * HOUR;
    const players = [home, away].flatMap(roster);
    for (const p of players) averages[p.id] = { name: p.name, team: p.team, ...p.avg };
    // each player's figures for the whole game, then the part of them reached by now
    const box = players.map((p, k) => {
      const full = key => p.avg[key] * (0.5 + rnd(i * 97 + k * 13 + key.length) * 1.0);
      return { id: p.id, name: p.name, team: p.team, pos: p.pos, starter: p.starter, dnp: false,
        pts: Math.round(full('pts') * f), reb: Math.round(full('reb') * f), ast: Math.round(full('ast') * f), threes: Math.round(full('threes') * f), min: Math.round((p.starter ? 34 : 16) * f) };
    });
    const score = team => box.filter(p => p.team === TEAMS[team][0]).reduce((s, p) => s + p.pts, 0);
    const quarter = Math.min(4, Math.floor(f * 4) + 1), left = Math.max(0, Math.round((quarter / 4 - f) * 48 * 60));
    const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const detail = state === 'in' ? `Q${quarter} ${clock}` : state === 'post' ? 'Final' : '';   // before tip-off the page shows the time in the viewer's own zone
    games.push({ id, start: new Date(start).toISOString(), state, detail, period: state === 'in' ? quarter : state === 'post' ? 4 : 0, clock: state === 'in' ? clock : '', demo: true,
      home: { abbr: TEAMS[home][0], name: TEAMS[home][1], score: state === 'pre' ? 0 : score(home) },
      away: { abbr: TEAMS[away][0], name: TEAMS[away][1], score: state === 'pre' ? 0 : score(away) }, url: null });
    boxes[id] = state === 'pre' ? [] : box;
  });
  return { games, boxes, averages };
}

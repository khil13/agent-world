// Reads tonight's NBA games from ESPN's public scoreboard and each game's summary (box score and, before tip-off, the season
// averages of the team leaders). Read-only and keyless; nothing here ever throws: a feed that cannot be reached gives null and
// a summary that cannot be read gives that game no players. Pure apart from the injected fetch, so it is tested without a browser.
import { parseScoreboard, parseBox, parseAverages } from './nba.mjs';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

const getJson = async (fetchFn, url) => {
  try { const r = await fetchFn(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
};

// A loader that remembers the box scores of finished games, so they are only asked for once.
export function createNbaFeed({ fetchFn = (...a) => fetch(...a), base = BASE } = {}) {
  const finals = new Map();   // game id -> its final box score
  return async function load() {
    const board = await getJson(fetchFn, `${base}/scoreboard`);
    if (!board) return null;
    const games = parseScoreboard(board), boxes = {}, averages = {};
    await Promise.all(games.map(async g => {
      if (g.state === 'post' && finals.has(g.id)) { boxes[g.id] = finals.get(g.id); return; }
      const sum = await getJson(fetchFn, `${base}/summary?event=${encodeURIComponent(g.id)}`);
      if (!sum) return;
      boxes[g.id] = parseBox(sum);
      if (g.state === 'pre') Object.assign(averages, parseAverages(sum));
      if (g.state === 'post' && boxes[g.id].length) finals.set(g.id, boxes[g.id]);
    }));
    for (const id of finals.keys()) if (!games.some(g => g.id === id)) finals.delete(id);   // yesterday's games leave the board
    return { games, boxes, averages };
  };
}

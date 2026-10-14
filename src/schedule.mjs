// When a task runs next, from the schedule entries of its workflow (GitHub's cron form: minute hour day-of-month month
// day-of-week, always in UTC). Pure. Only the plain forms are read: *, numbers, ranges (a-b), lists (a,b) and steps (*/n, a-b/n),
// with month and weekday names. Anything else is unreadable and gives no time, never a guess.
import { relative, clock } from './timewords.mjs';
const MINUTE = 60e3, DAY = 864e5, WEEK = 7 * DAY;
const SEARCH_DAYS = 366 * 8;   // far enough for a leap day, which comes every fourth year

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// One field as the set of numbers it allows, or null when it cannot be read. `names` are the three-letter names it may use.
function field(text, min, max, names, first = 0) {
  const value = word => {
    if (/^\d+$/.test(word)) return Number(word);
    const at = names.indexOf(word.toLowerCase());
    return /^[a-z]{3}$/i.test(word) && at >= 0 ? at + first : NaN;
  };
  const out = new Set();
  for (const part of text.split(',')) {
    const m = /^(?:(\*)|([0-9a-z]+)(?:-([0-9a-z]+))?)(?:\/(\d+))?$/i.exec(part);
    if (!m) return null;
    const step = m[4] === undefined ? 1 : Number(m[4]);
    if (step < 1) return null;
    const lo = m[1] ? min : value(m[2]), hi = m[1] ? (max === 7 ? 6 : max) : m[3] !== undefined ? value(m[3]) : m[4] !== undefined ? NaN : lo;
    if (![lo, hi].every(Number.isInteger) || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size ? out : null;
}

function compile(cron) {
  if (typeof cron !== 'string') return null;
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const minutes = field(f[0], 0, 59, []), hours = field(f[1], 0, 23, []), dom = field(f[2], 1, 31, []), months = field(f[3], 1, 12, MONTHS, 1), dow = field(f[4], 0, 7, WEEKDAYS);
  if (!minutes || !hours || !dom || !months || !dow) return null;
  return { minutes: [...minutes].sort((a, b) => a - b), hours: [...hours].sort((a, b) => a - b), dom, months, dow: new Set([...dow].map(d => d % 7)),
    domStar: f[2].startsWith('*'), dowStar: f[4].startsWith('*') };
}

// The next time (ms since 1970) after `after` that a schedule entry runs, or null when it cannot be read or never happens.
export function nextRun(cron, after) {
  const s = compile(cron);
  if (!s || !Number.isFinite(after)) return null;
  const start = Math.floor(after / MINUTE) * MINUTE + MINUTE;   // the next whole minute, so a run at this very minute does not count
  const first = new Date(start);
  let day = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  for (let i = 0; i < SEARCH_DAYS; i++, day += DAY) {
    const d = new Date(day);
    if (!s.months.has(d.getUTCMonth() + 1)) continue;
    const inMonth = s.dom.has(d.getUTCDate()), inWeek = s.dow.has(d.getUTCDay());
    // when both the day of the month and the day of the week are given, either one is enough
    if (!(s.domStar || s.dowStar ? inMonth && inWeek : inMonth || inWeek)) continue;
    const from = i === 0 ? (start - day) / MINUTE : 0;   // minutes into the first day that are still to come
    for (const h of s.hours) for (const m of s.minutes) if (h * 60 + m >= from) return day + (h * 60 + m) * MINUTE;
  }
  return null;
}

// The soonest of several entries. If any one cannot be read the answer is unknown, because it might be the soonest.
export function nextRunOf(schedule, after) {
  if (!Array.isArray(schedule) || !schedule.length) return null;
  const times = schedule.map(c => nextRun(c, after));
  return times.every(t => t !== null) ? Math.min(...times) : null;
}

// What the card says about when a task runs next: "in 3 h 12 min, Wed 06:00", or why there is no time.
export function describeNextRun(task, now, timeZone) {
  if (task.enabled === false) return 'Disabled';
  if (Array.isArray(task.schedule) && task.schedule.length === 0) return 'no schedule: runs when started';
  const next = nextRunOf(task.schedule, now);
  return next === null ? 'schedule unknown' : `${relative(next - now)}, ${clock(next, timeZone, next - now >= WEEK)}`;
}

// Time in plain words, for cards, the drawer and lists. Pure.
const MINUTE = 60e3;

// How long ago: "just now", "12m ago", "3h ago", "2d ago".
export const ago = (iso, now = Date.now()) => {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
};

// How far ahead a time is: "in under a minute", "in 12 min", "in 3 h 12 min", "in 2 d 5 h".
export const relative = ms => {
  const min = Math.floor(ms / MINUTE);
  if (min < 1) return 'in under a minute';
  if (min < 60) return `in ${min} min`;
  if (min < 1440) return `in ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const h = Math.floor((min % 1440) / 60);
  return `in ${Math.floor(min / 1440)} d${h ? ` ${h} h` : ''}`;
};

// The weekday and time of day, in a time zone (the viewer's own when none is given), with the date when `withDate`.
export const clock = (ms, timeZone, withDate) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.weekday} ${withDate ? `${p.day} ${p.month} ` : ''}${p.hour}:${p.minute}`;
};

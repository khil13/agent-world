import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRun, nextRunOf, describeNextRun } from '../src/schedule.mjs';

const at = iso => Date.parse(iso);
const next = (cron, after) => { const n = nextRun(cron, at(after)); return n === null ? null : new Date(n).toISOString(); };

test('a daily schedule runs at the next time of day, never at the moment it is asked', () => {
  assert.equal(next('0 6 * * *', '2026-10-02T12:00:00Z'), '2026-10-03T06:00:00.000Z');
  assert.equal(next('0 6 * * *', '2026-10-02T05:59:59Z'), '2026-10-02T06:00:00.000Z');
  assert.equal(next('0 6 * * *', '2026-10-02T06:00:00Z'), '2026-10-03T06:00:00.000Z', 'at the exact minute it already ran, so the next one is a day later');
  assert.equal(next('30 14 * * *', '2026-10-02T14:30:30Z'), '2026-10-03T14:30:00.000Z');
});

test('steps, lists and ranges work in every field', () => {
  assert.equal(next('*/15 * * * *', '2026-10-02T12:07:00Z'), '2026-10-02T12:15:00.000Z');
  assert.equal(next('*/15 * * * *', '2026-10-02T12:45:00Z'), '2026-10-02T13:00:00.000Z');
  assert.equal(next('0 8,12,18 * * *', '2026-10-02T09:00:00Z'), '2026-10-02T12:00:00.000Z');
  assert.equal(next('0 0-12/4 * * *', '2026-10-02T05:00:00Z'), '2026-10-02T08:00:00.000Z');
  assert.equal(next('0 */6 * * *', '2026-10-02T19:00:00Z'), '2026-10-03T00:00:00.000Z');
  assert.equal(next('5,35 * * * *', '2026-10-02T12:10:00Z'), '2026-10-02T12:35:00.000Z');
  assert.equal(next('10-20/5 3 * * *', '2026-10-02T03:11:00Z'), '2026-10-02T03:15:00.000Z');
  assert.equal(next('0 6 1-7,15 * *', '2026-10-08T00:00:00Z'), '2026-10-15T06:00:00.000Z');
});

test('weekdays: Monday to Friday skips the weekend, and 0 or 7 is Sunday', () => {
  // 2026-10-02 is a Friday
  assert.equal(next('30 2 * * 1-5', '2026-10-02T03:00:00Z'), '2026-10-05T02:30:00.000Z');
  assert.equal(next('0 6 * * 0', '2026-10-02T12:00:00Z'), '2026-10-04T06:00:00.000Z');
  assert.equal(next('0 6 * * 7', '2026-10-02T12:00:00Z'), '2026-10-04T06:00:00.000Z');
  assert.equal(next('0 6 * * 6,0', '2026-10-02T12:00:00Z'), '2026-10-03T06:00:00.000Z');
});

test('day and month names are understood, in any case', () => {
  assert.equal(next('0 6 * * MON', '2026-10-02T12:00:00Z'), '2026-10-05T06:00:00.000Z');
  assert.equal(next('0 6 * * mon-fri', '2026-10-03T12:00:00Z'), '2026-10-05T06:00:00.000Z');
  assert.equal(next('0 0 1 JAN *', '2026-10-02T12:00:00Z'), '2027-01-01T00:00:00.000Z');
  assert.equal(next('0 0 1 jan,jul *', '2026-10-02T12:00:00Z'), '2027-01-01T00:00:00.000Z');
});

test('when both a day of the month and a day of the week are given, either one is enough', () => {
  // the 13th, or any Friday: the next Friday (Oct 9) comes before the 13th
  assert.equal(next('0 0 13 * 5', '2026-10-02T12:00:00Z'), '2026-10-09T00:00:00.000Z');
  assert.equal(next('0 0 13 * 5', '2026-10-10T12:00:00Z'), '2026-10-13T00:00:00.000Z');
});

test('midnight, month ends, year ends and leap days are crossed correctly', () => {
  assert.equal(next('0 0 * * *', '2026-10-02T23:59:30Z'), '2026-10-03T00:00:00.000Z');
  assert.equal(next('0 0 31 * *', '2026-11-15T00:00:00Z'), '2026-12-31T00:00:00.000Z', 'November has no 31st');
  assert.equal(next('0 0 31 * *', '2026-01-31T00:00:00Z'), '2026-03-31T00:00:00.000Z', 'February has none either');
  assert.equal(next('0 0 1 * *', '2026-12-31T12:00:00Z'), '2027-01-01T00:00:00.000Z');
  assert.equal(next('0 0 29 2 *', '2026-03-01T00:00:00Z'), '2028-02-29T00:00:00.000Z', 'the next leap day');
  assert.equal(next('59 23 31 12 *', '2026-12-31T23:59:00Z'), '2027-12-31T23:59:00.000Z');
});

test('a schedule that can never happen has no next run', () => {
  assert.equal(next('0 0 31 2 *', '2026-10-02T12:00:00Z'), null);
  assert.equal(next('0 0 30 2 *', '2026-10-02T12:00:00Z'), null);
});

test('anything that is not a plain five-field schedule is unreadable, never guessed', () => {
  for (const bad of ['@daily', '@hourly', '', '   ', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * 32 * *', '* * * 13 *', '* * * * 8',
    '*/0 * * * *', '1-0 * * * *', 'a b c d e', '0 0 L * *', '0 0 ? * *', '0 0 * * 1#2', '0 0 * * 5L', '0,, * * * *', '0 0 * * MONDAY', '-5 * * * *', '1.5 * * * *', null, undefined, 7, {}, ['0 6 * * *']]) {
    assert.equal(nextRun(bad, at('2026-10-02T12:00:00Z')), null, String(bad));
  }
});

test('spaces and tabs between the fields do not matter', () => {
  assert.equal(next('  0   6\t*  *  * ', '2026-10-02T12:00:00Z'), '2026-10-03T06:00:00.000Z');
});

test('with several schedules the soonest wins, and if any of them is unreadable nothing is guessed', () => {
  const after = at('2026-10-02T12:00:00Z');
  assert.equal(new Date(nextRunOf(['0 19 * * *', '0 7 * * *'], after)).toISOString(), '2026-10-02T19:00:00.000Z');
  assert.equal(nextRunOf(['0 19 * * *', '@daily'], after), null);
  assert.equal(nextRunOf([], after), null);
  assert.equal(nextRunOf(undefined, after), null);
  assert.equal(nextRunOf('0 6 * * *', after), null, 'a list is required');
});

test('the card text: when it runs next, in the viewer\'s own time', () => {
  const now = at('2026-10-02T12:00:00Z');
  const say = (task, tz = 'UTC') => describeNextRun(task, now, tz);
  assert.equal(say({ enabled: true, schedule: ['0 6 * * *'] }), 'in 18 h, Sat 06:00');
  assert.equal(say({ enabled: true, schedule: ['0 6 * * *'] }, 'Europe/Amsterdam'), 'in 18 h, Sat 08:00', 'Amsterdam is two hours ahead of UTC in October');
  assert.equal(say({ enabled: true, schedule: ['12 15 * * *'] }), 'in 3 h 12 min, Fri 15:12');
  assert.equal(say({ enabled: true, schedule: ['5 12 * * *'] }), 'in 5 min, Fri 12:05');
  assert.equal(say({ enabled: true, schedule: ['0 12 * * 6'] }), 'in 1 d, Sat 12:00', 'whole days have no hours part');
  assert.equal(say({ enabled: true, schedule: ['30 8 * * 1'] }), 'in 2 d 20 h, Mon 08:30');
});

test('the card text for a next run under a minute away, and one more than a week away', () => {
  const now = at('2026-10-02T11:59:30Z');
  assert.equal(describeNextRun({ enabled: true, schedule: ['0 12 * * *'] }, now, 'UTC'), 'in under a minute, Fri 12:00');
  const later = at('2026-10-02T12:00:00Z');
  assert.equal(describeNextRun({ enabled: true, schedule: ['0 6 1 * *'] }, later, 'UTC'), 'in 29 d 18 h, Sun 1 Nov 06:00', 'a date is added when it is a week or more away');
});

test('a disabled task says so instead of a time, whatever its schedule', () => {
  assert.equal(describeNextRun({ enabled: false, schedule: ['0 6 * * *'] }, at('2026-10-02T12:00:00Z'), 'UTC'), 'Disabled');
});

test('no schedule at all means it only runs when started, and an unreadable or missing one says unknown', () => {
  const now = at('2026-10-02T12:00:00Z');
  assert.equal(describeNextRun({ enabled: true, schedule: [] }, now, 'UTC'), 'no schedule: runs when started');
  assert.equal(describeNextRun({ enabled: true, schedule: ['@daily'] }, now, 'UTC'), 'schedule unknown');
  assert.equal(describeNextRun({ enabled: true, schedule: ['0 6 * * *', 'nonsense'] }, now, 'UTC'), 'schedule unknown');
  assert.equal(describeNextRun({ enabled: true }, now, 'UTC'), 'schedule unknown');
  assert.equal(describeNextRun({ enabled: true, schedule: ['0 0 31 2 *'] }, now, 'UTC'), 'schedule unknown', 'one that never happens is not a time either');
  assert.equal(describeNextRun({ enabled: true, schedule: ['0 6 * * *'] }, NaN, 'UTC'), 'schedule unknown', 'an unreadable clock gives no time');
});

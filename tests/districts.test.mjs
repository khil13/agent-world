import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, DISTRICT_TINT, districtOf, districtRank } from '../src/districts.mjs';

test('a task is put in the district of the kind of job its name describes', () => {
  const cases = {
    'Daily news scan': 'News', 'Press watch': 'News', 'Weekly Newsletter': 'News',
    'Contact finder': 'Contacts', 'Decision-maker discovery': 'Contacts', 'Staff lookup': 'Contacts', 'Verification of people': 'Contacts',
    'Competitor jobs': 'Competitors', 'Competitive pricing': 'Competitors',
    'Weekly research sweep': 'Research', 'Funding scan': 'Research', 'Publication outputs': 'Research', 'Grant watch': 'Research',
    'Daily summary report': 'Reports', 'Export for the landing page': 'Reports', 'Reporting': 'Reports',
  };
  for (const [name, district] of Object.entries(cases)) assert.equal(districtOf(name), district, name);
});

test('the kind is read from the words of the name, in any case, and not from letters inside other words', () => {
  assert.equal(districtOf('NEWS SCAN'), 'News');
  assert.equal(districtOf('daily news'), 'News');
  assert.equal(districtOf('Renewal check'), 'Other', 'renewal is not news');
  assert.equal(districtOf('Unreported'), 'Other', 'a word that merely ends in report is not a report');
});

test('a name that matches no kind of job stands in Other, and so does anything that is not a name', () => {
  for (const name of ['Backup', 'Nightly cleanup', '', '   ', null, undefined, 7, {}, ['news']]) assert.equal(districtOf(name), 'Other', String(name));
});

test('a name that fits two kinds goes to the first in the fixed order, so it never changes', () => {
  assert.equal(districtOf('Competitor news scan'), 'News');
  assert.equal(districtOf('Research report'), 'Research');
  assert.equal(districtOf('Contact report'), 'Contacts');
});

test('the districts come in one fixed order with Other last, and each has a colour of its own', () => {
  assert.deepEqual(DISTRICTS, ['News', 'Contacts', 'Competitors', 'Research', 'Reports', 'Other']);
  assert.deepEqual(DISTRICTS.map(districtRank), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(Object.keys(DISTRICT_TINT), DISTRICTS);
  assert.equal(new Set(Object.values(DISTRICT_TINT)).size, DISTRICTS.length, 'no two districts share a colour');
  for (const c of Object.values(DISTRICT_TINT)) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
});

test('the rank of a name is the rank of its district', () => {
  assert.equal(districtRank('Daily news scan'), 0);
  assert.equal(districtRank('Backup'), 5);
});

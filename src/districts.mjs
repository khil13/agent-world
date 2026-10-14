// Districts: a CRM's tasks stand together on its island by the kind of job they do. The kind is read from the words of the task's
// name when the world is built, so no CRM details are written here, only generic words. A name that fits two kinds goes to the
// first of them in this order, so a task never changes district; a name that fits none goes to Other.
export const DISTRICTS = ['News', 'Contacts', 'Competitors', 'Research', 'Reports', 'Other'];

// Words that start a word of the name (so "renewal" is not "news", but "newsletter" is).
const WORDS = {
  News: /\b(news|press|headline)/,
  Contacts: /\b(contact|discover|staff|people|verif)/,
  Competitors: /\bcompetit/,
  Research: /\b(research|publication|output|funding|grant)/,
  Reports: /\b(report|summary|export)/,
};

// The colour of the ring under each of a district's astronauts, so a group can be seen on the island.
export const DISTRICT_TINT = { News: 0x4aa8ff, Contacts: 0xb07cff, Competitors: 0xff8a4a, Research: 0x3fd6a0, Reports: 0xffd24a, Other: 0x8b94a3 };

export function districtOf(name) {
  if (typeof name !== 'string') return 'Other';
  const lower = name.toLowerCase();
  return DISTRICTS.find(d => WORDS[d]?.test(lower)) || 'Other';
}

export const districtRank = name => DISTRICTS.indexOf(districtOf(name));

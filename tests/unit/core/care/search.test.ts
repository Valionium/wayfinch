// Bike care's search (sub-project 12, Task 3): words as people type them find the tasks by name, part and everyday words.
import { expect, test } from 'vitest';
import { normaliseQuery, searchCare } from '../../../../src/core/care/search.ts';
import type { CareTask } from '../../../../src/core/care/types.ts';
import { CARE_TASKS, PART_LABEL } from '../../../../src/core/wording/en-care.ts';

// What the screen passes for a task (Task 3's interface).
const text = (t: CareTask): string[] => [t.name, PART_LABEL[t.part], ...t.words];
const find = (q: string): string[] => searchCare(q, CARE_TASKS, text).map((t) => t.id);
const has = (id: string) => CARE_TASKS.some((t) => t.id === id);
/** The full list is in (group 2, Task 5): every task the design names is held. */
const held = (ids: string[]) => ids.filter(has);

test('[BC-SEARCH-WORDS] "squeak" finds the chain lube and the brake pad tasks; "bleed" the hydraulic bleed; "chain" every Chain task; "zzz" none', () => {
  const squeak = find('squeak');
  for (const id of held(['chain-lube', 'brakes-pads-disc', 'brakes-pads-rim'])) expect(squeak, id).toContain(id);
  expect(squeak).toEqual(['chain-dry-lube', 'brakes-pads-disc', 'brakes-pads-rim', 'chain-lube', 'brakes-squeal']);
  expect(held(['chain-lube', 'brakes-pads-disc', 'brakes-pads-rim']).length).toBe(3);
  // the bleed itself, and the spongy-brake task that sends the rider to it
  expect(held(['brakes-hydraulic-bleed', 'brakes-spongy']).length).toBe(2);
  expect(find('bleed')).toEqual(['brakes-hydraulic-bleed', 'brakes-spongy']);
  const chain = find('chain');
  const chainTasks = CARE_TASKS.filter((t) => t.part === 'chain').map((t) => t.id);
  expect(chainTasks.length).toBeGreaterThan(0);
  for (const id of chainTasks) expect(chain, id).toContain(id);
  expect(find('zzz')).toEqual([]);
});

test('[BC-SEARCH-WORDS] results keep the list order; an empty query gives the whole list; every query word must match', () => {
  const squeak = find('squeak');
  expect(squeak).toEqual(CARE_TASKS.map((t) => t.id).filter((id) => squeak.includes(id)));
  expect(find('')).toEqual(CARE_TASKS.map((t) => t.id));
  expect(find('   ')).toEqual(CARE_TASKS.map((t) => t.id));
  // a part's name finds its tasks, and two words narrow
  expect(find('frame')).toContain('frame-bolts-check');
  expect(find('squeak rim')).toEqual(['brakes-pads-rim']);
  expect(find('squeak zzz')).toEqual([]);
});

test('[BC-SEARCH-FORMS] "Squeaking", "  SQUEAK ", "squeaks" give the same results as "squeak"; accents and punctuation are forgiven', () => {
  const plain = find('squeak');
  expect(plain.length).toBeGreaterThan(0);
  for (const q of ['Squeaking', '  SQUEAK ', 'squeaks', 'squeaked', 'squeak!', 'squéak']) expect(find(q), q).toEqual(plain);
  // plural and -ing forms both ways
  expect(find('spokes')).toEqual(find('spoke'));
  expect(find('brakes')).toEqual(find('brake'));
  expect(find('oiling')).toContain('chain-lube');
  expect(find('Spoké,  wobble')).toEqual(['wheels-spokes-check', 'wheels-true-tension', 'wheels-wobble']);
});

test('[BC-SEARCH-FORMS] "Bremse" finds nothing and does not throw; odd input never throws', () => {
  expect(find('Bremse')).toEqual([]);
  for (const q of ['\u0000', '((', '.*', '😀', 'a'.repeat(500), '́́']) expect(() => find(q), q).not.toThrow();
  expect(normaliseQuery('  Squeak,  the CHAIN! ')).toEqual(['squeak', 'the', 'chain']);
  expect(normaliseQuery('Pédale')).toEqual(['pedale']);
  expect(normaliseQuery('')).toEqual([]);
});

test('[BC-SEARCH-FORMS] "-ies" plurals meet their "-y" word; an ending is only taken off to meet a whole word, so "spring" never meets "sprocket" (review of PR 58, M3)', () => {
  expect(find('batteries')).toEqual(find('battery'));
  expect(find('battery')).toEqual(['ebike-charge-indoors', 'ebike-dry-contacts', 'gears-electronic-battery', 'ebike-battery-care', 'ebike-service', 'ebike-range-drop']);
  const items = [
    { id: 'sprocket', words: ['sprocket'] }, { id: 'stretched', words: ['stretched chain'] }, { id: 'shock', words: ['shock'] },
    { id: 'spec', words: ['spectacles'] }, { id: 'spring', words: ['springs'] }, { id: 'pump', words: ['pumping'] },
  ];
  const look = (q: string) => searchCare(q, items, (i) => i.words).map((i) => i.id);
  expect(look('spring')).toEqual(['spring']);
  expect(look('string')).toEqual([]);
  expect(look('shoes')).toEqual([]);
  expect(look('speed')).toEqual([]);
  expect(look('pumped')).toEqual(['pump']);
  expect(look('pumps')).toEqual(['pump']);
  // typing a word part way still finds it
  expect(look('sproc')).toEqual(['sprocket']);
});

// Re-check of PR 58, R1: the whole-word guard must not lose the forms people type. Each form finds exactly what its plain word finds:
// -ing, -ed, -s, -ies, a doubled consonant (slipping) and a silent e (lube, wobble, store, service, charge, rattle).
const FORMS: [string, string][] = [
  ['charging', 'charge'], ['charged', 'charge'], ['charges', 'charge'],
  ['lubing', 'lube'], ['lubed', 'lube'], ['lubes', 'lube'],
  ['servicing', 'service'], ['serviced', 'service'],
  ['wobbling', 'wobble'], ['wobbled', 'wobble'], ['rattling', 'rattle'], ['rattles', 'rattle'],
  ['storing', 'store'], ['stored', 'store'],
  ['slips', 'slip'], ['slipping', 'slip'], ['slipped', 'slip'],
  ['squeaking', 'squeak'], ['squeaked', 'squeak'], ['squeaks', 'squeak'],
  ['batteries', 'battery'], ['spokes', 'spoke'], ['brakes', 'brake'], ['oiling', 'oil'], ['creaking', 'creak'],
];

test('[BC-SEARCH-FORMS] each typed form finds exactly what its plain word finds, and the plain word finds something (re-check of PR 58, R1)', () => {
  for (const [form, base] of FORMS) {
    expect(find(base).length, base).toBeGreaterThan(0);
    expect(find(form), `${form} vs ${base}`).toEqual(find(base));
  }
  expect(find('charging')).toEqual(['ebike-charge-indoors', 'gears-electronic-battery', 'ebike-battery-care']);
  expect(find('storing')).toEqual(['ebike-battery-care']);
  expect(find('slips')).toEqual(['chain-wear-check', 'gears-hub-oil']);
});

test('[BC-SEARCH-FORMS] the false hits stay gone with the forms back: spring, string, shoes, speed (re-check of PR 58, R1)', () => {
  const items = [
    { id: 'sprocket', words: ['sprocket'] }, { id: 'stretched', words: ['stretched chain'] }, { id: 'shock', words: ['shock'] },
    { id: 'spec', words: ['spectacles'] }, { id: 'spread', words: ['spreader'] }, { id: 'stream', words: ['streamer'] },
  ];
  const look = (q: string) => searchCare(q, items, (i) => i.words).map((i) => i.id);
  for (const q of ['spring', 'string', 'shoes', 'speed', 'springs', 'strings', 'sped']) expect(look(q), q).toEqual([]);
});

test('[BC-SEARCH-FORMS] filler words are skipped on the tasks too: "my chain squeaks", "the brake is squeaking" (re-check of PR 59, R6)', () => {
  expect(find('my chain squeaks')).toEqual(find('chain squeaks'));
  expect(find('the brake is squeaking')).toEqual(find('brake squeaking'));
  expect(find('brake squeaking').length).toBeGreaterThan(0);
});

test('[BC-SEARCH-WORDS] on the full list: "spring" never meets the rear gears, "rohloff" finds the hub gear oil task, "puncture" and "creak" find what the words name (review of PR 58, M3 and M4)', () => {
  expect(find('spring')).not.toContain('gears-cassette-wear');
  expect(find('rohloff')).toEqual(['gears-hub-oil']);
  expect(find('creak')).toEqual(['frame-bolts-check', 'frame-torque-check', 'frame-creak']);
  expect(find('hydraulic')).toContain('brakes-hydraulic-bleed');
  expect(find('punctur')).toEqual([]);
  // every task is found by its own name, typed whole
  for (const t of CARE_TASKS) expect(find(t.name), t.id).toContain(t.id);
});

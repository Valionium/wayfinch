// Bike care's search (sub-project 12, Task 3): words as people type them find the tasks by name, part and everyday words.
import { expect, test } from 'vitest';
import { normaliseQuery, searchCare } from '../../../../src/core/care/search.ts';
import type { CareTask } from '../../../../src/core/care/types.ts';
import { CARE_TASKS, PART_LABEL } from '../../../../src/core/wording/en-care.ts';

// What the screen passes for a task (Task 3's interface).
const text = (t: CareTask): string[] => [t.name, PART_LABEL[t.part], ...t.words];
const find = (q: string): string[] => searchCare(q, CARE_TASKS, text).map((t) => t.id);
const has = (id: string) => CARE_TASKS.some((t) => t.id === id);
/** The full list's expectation, cut to the tasks the sample holds (until group 2 brings the full list, Task 5). */
const held = (ids: string[]) => ids.filter(has);

test('[BC-SEARCH-WORDS] "squeak" finds the chain lube and the brake pad tasks; "bleed" the hydraulic bleed; "chain" every Chain task; "zzz" none', () => {
  const squeak = find('squeak');
  for (const id of held(['chain-lube', 'brakes-pads-disc', 'brakes-pads-rim'])) expect(squeak, id).toContain(id);
  expect(held(['chain-lube', 'brakes-pads-disc', 'brakes-pads-rim']).length).toBe(3);
  expect(find('bleed')).toEqual(held(['brakes-hydraulic-bleed']));
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
  expect(find('Spoké,  wobble')).toEqual(['wheels-spokes-check']);
});

test('[BC-SEARCH-FORMS] "Bremse" finds nothing and does not throw; odd input never throws', () => {
  expect(find('Bremse')).toEqual([]);
  for (const q of ['\u0000', '((', '.*', '😀', 'a'.repeat(500), '́́']) expect(() => find(q), q).not.toThrow();
  expect(normaliseQuery('  Squeak,  the CHAIN! ')).toEqual(['squeak', 'the', 'chain']);
  expect(normaliseQuery('Pédale')).toEqual(['pedale']);
  expect(normaliseQuery('')).toEqual([]);
});

import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { RT } from '../../../src/core/wording/en-remove.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const texts = (): [string, string][] => Object.entries(RT).map(([k, v]) => [k, typeof v === 'function' ? v('Fixture: Heidelberg to Strasbourg') : v]);

test('[HON-BANNED] no string of Remove this trip uses a banned word; every key is a Trip key, in neither en.ts nor en-trip.ts', () => {
  expect(texts().length).toBe(11);
  for (const [key, text] of texts()) {
    expect(key).toMatch(/^appTripRemov/);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
    expect(key in TR, key).toBe(false);
  }
});

test('[TRIP-NOT-READY-WORD] Remove this trip never calls the trip ready, safe or complete; "Prepare this route" is the only use of "ready"', () => {
  for (const [key, s] of texts()) {
    expect(/\b(ready|safe|complete|completed|done|finished)\b/i.test(s.replace(/Prepare this route/gi, '')), `${key}: ${s}`).toBe(false);
    expect(/\bprepared\b/i.test(s), `${key}: ${s}`).toBe(false);
  }
});

test('[TRIP-REMOVE-ASK] the confirm step names what goes and what stays, in plain short sentences', () => {
  const goes = RT.appTripRemoveGoes('Fixture: Heidelberg to Strasbourg');
  expect(goes).toContain('“Fixture: Heidelberg to Strasbourg”');
  for (const part of ['route', 'date', 'nights', 'Prepare this route', 'places', 'opening hours', 'weather', 'map data', 'position', 'water', 'day plan', 'En route']) expect(goes).toContain(part);
  for (const part of ['bikes', 'setups', 'Bag planner plans', 'rides', 'settings']) expect(RT.appTripRemoveStays).toContain(part);
  for (const [, s] of texts()) expect(s.split(/(?<=[.?:])\s/).every((sentence) => sentence.split(/\s+/).length <= 30), s).toBe(true);
});

// Trip's chunk words moved out of en.ts to make room on the first screen keep en.ts's checks.
test('[HON-BANNED] none of Trip\'s moved chunk words uses a banned word or calls the trip ready; none is also in en.ts', () => {
  const fields = Object.entries(TF).map(([k, v]): [string, string] => [k, typeof v === 'function' ? (v as (...a: unknown[]) => string)(3, 4, '5') : v]);
  expect(fields.length).toBe(21);
  for (const [key, text] of fields) {
    expect(key).toMatch(/^appTrip[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
    expect(/\b(ready|safe|complete|completed|done|finished|prepared)\b/i.test(text), `${key}: ${text}`).toBe(false);
    expect(key in W, key).toBe(false);
    expect(key in TR, key).toBe(false);
  }
});

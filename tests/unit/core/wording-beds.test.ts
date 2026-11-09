import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { BD } from '../../../src/core/wording/en-beds.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const texts = (): [string, string][] => Object.entries(BD).map(([k, v]) => [k, typeof v === 'function' ? v('Hotel Krone', '92.4', 'Mainz') : v]);

test('[HON-BANNED] no day-end sleep line uses a banned word; every key is a Trip key, in neither en.ts, en-trip.ts nor en-trip-fields.ts', () => {
  expect(texts().length).toBe(4);
  for (const [key, text] of texts()) {
    expect(key).toMatch(/^appTripBed/);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, true), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
    expect(key in TR, key).toBe(false);
    expect(key in TF, key).toBe(false);
  }
});

test('[TRIP-NOT-READY-WORD] the day-end sleep lines never call the trip ready, safe or complete; "Prepare this route" is the only use of "ready"', () => {
  for (const [key, s] of texts()) {
    expect(/\b(ready|safe|complete|completed|done|finished)\b/i.test(s.replace(/Prepare this route/gi, '')), `${key}: ${s}`).toBe(false);
    expect(/\bprepared\b/i.test(s), `${key}: ${s}`).toBe(false);
  }
});

test('[TRIP-DAY-BEDS] the lines say where, how far along, and plainly when nothing is mapped', () => {
  expect(BD.appTripBedNear('Hotel Krone', '92.4', 'Mainz')).toBe('To sleep near the end: Hotel Krone, km 92.4, by Mainz');
  expect(BD.appTripBedNear('Campsite', '178.5', null)).toBe('To sleep near the end: Campsite, km 178.5');
  expect(BD.appTripBedTown('Bingen', '93', '9')).toBe('No place to sleep mapped within 9 km of the end; nearest town: Bingen, km 93');
  expect(BD.appTripBedNone('10')).toBe('No place to sleep mapped within 10 km of the end');
});

import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { PR } from '../../../src/core/wording/en-prep.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { TF } from '../../../src/core/wording/en-trip-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const texts = (): [string, string][] => [
  ...Object.entries(PR).map(([k, v]): [string, string] => [k, typeof v === 'function' ? (v as (s: string) => string)('Camping Rheinaue') : v]),
  ['prepNight(null)', PR.prepNight(null)],
];

test('[HON-BANNED] no string of Before you leave uses a banned word; every key is its own, in none of en.ts, en-trip.ts or en-trip-fields.ts', () => {
  expect(texts().length).toBeGreaterThanOrEqual(10);
  for (const [key, text] of texts()) {
    expect(key).toMatch(/^prep/);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
    const own = key.replace(/\(null\)$/, '');
    expect(own in W || own in TR || own in TF, own).toBe(false);
  }
});

test('[TRIP-NOT-READY-WORD] Before you leave never calls the trip ready, safe or complete, and keeps no score', () => {
  for (const [key, s] of texts()) {
    expect(/\b(ready|safe|safely|complete|completed|done|finished|all set)\b/i.test(s.replace(/Prepare this route/gi, '')), `${key}: ${s}`).toBe(false);
    expect(/\d+ of \d+/.test(s), `${key}: ${s}`).toBe(false);
  }
});

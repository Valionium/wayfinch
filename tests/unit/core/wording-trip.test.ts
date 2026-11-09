import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of Trip\'s own chunk words uses a banned word; every key is an app key, and none is also in en.ts', () => {
  const strings = Object.entries(TR);
  expect(strings.length).toBe(22);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^app(Trip|Ab)[A-Z]/);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
  }
});

// The words moved out of en.ts keep TRIP-NOT-READY-WORD's check, which reads W's Trip keys (tests/unit/ui/trip.test.tsx).
test('[TRIP-NOT-READY-WORD] none of Trip\'s own chunk words calls the trip ready, safe or complete; "Prepare this route" is the only use of "ready"', () => {
  for (const [key, s] of Object.entries(TR)) {
    expect(/\b(ready|safe|complete|completed|done|finished)\b/i.test(s.replace(/Prepare this route/gi, '')), `${key}: ${s}`).toBe(false);
    expect(/\bprepared\b/i.test(s), `${key}: ${s}`).toBe(false);
  }
});

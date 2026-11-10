import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TC } from '../../../src/core/wording/en-tyre-calc.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// The tyre tool's calculation words, moved from en.ts (10 Nov 2026) to pay for the first-run card's colour dots: the same banned-words
// check as en.ts, every function called with sample values, and none left behind in en.ts.
test('[HON-BANNED] no string of the tyre tool\'s moved calculation words uses a banned word; every key starts with "tyre" and none is also in en.ts', () => {
  const entries = Object.entries(TC);
  expect(entries.length).toBe(39);
  for (const [key, value] of entries) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(key in W, key).toBe(false);
    const text = typeof value === 'function' ? (value as (...a: string[]) => string)('2.5', '40', '36') : value;
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

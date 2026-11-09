import { expect, test } from 'vitest';
import { T, TM } from '../../../src/core/wording/en-tyre.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the tyre screen\'s own words uses a banned word, and every key starts with "tyre"', () => {
  const strings = Object.entries(T);
  expect(strings.length).toBe(13);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

// Five more words moved from en.ts on 9 Nov 2026 (care pictures, part 2) to make room in the first screen: under the same check.
test('[HON-BANNED] the tyre screen words moved on 9 Nov use no banned word, and every key starts with "tyre"', () => {
  const strings = Object.entries(TM);
  expect(strings.length).toBe(5);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

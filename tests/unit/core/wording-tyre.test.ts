import { expect, test } from 'vitest';
import { T } from '../../../src/core/wording/en-tyre.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the tyre screen\'s own words uses a banned word, and every key starts with "tyre"', () => {
  const strings = Object.entries(T);
  expect(strings.length).toBe(8);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

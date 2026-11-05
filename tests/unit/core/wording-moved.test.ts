import { expect, test } from 'vitest';
import { M } from '../../../src/core/wording/en-moved.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the moved card uses a banned word, and every key starts with "moved"', () => {
  const strings = Object.entries(M);
  expect(strings.length).toBe(4);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^moved[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

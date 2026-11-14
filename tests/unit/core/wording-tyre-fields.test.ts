import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TQ } from '../../../src/core/wording/en-tyre-fields.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the tyre tool\'s moved choice words uses a banned word; every key starts with "tyre" and none is also in en.ts', () => {
  const strings = Object.entries(TQ);
  expect(strings.length).toBe(23);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(key in W, key).toBe(false);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

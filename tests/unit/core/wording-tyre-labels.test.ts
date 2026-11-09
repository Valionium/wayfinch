import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TF } from '../../../src/core/wording/en-tyre-labels.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the tyre tool\'s moved labels uses a banned word; every key starts with "tyre" and none is also in en.ts', () => {
  const strings = Object.entries(TF);
  expect(strings.length).toBe(30);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(key in W, key).toBe(false);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

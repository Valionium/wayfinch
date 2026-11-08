import { expect, test } from 'vitest';
import { TL } from '../../../src/core/wording/en-tools.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the Tools screens\' own words uses a banned word, and every key starts with "tools"', () => {
  const strings = Object.entries(TL);
  expect(strings.length).toBe(2);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tools[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

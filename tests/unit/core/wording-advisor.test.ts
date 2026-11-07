import { expect, test } from 'vitest';
import { GA } from '../../../src/core/wording/en-advisor.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the Gear advisor\'s own words uses a banned word, and every key starts with "advisor"', () => {
  const strings = Object.entries(GA);
  expect(strings.length).toBeGreaterThanOrEqual(4);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^advisor[A-Z]/);
    expect(typeof text === 'string' ? bannedHits(text, false) : [], `${key}`).toEqual([]);
  }
});

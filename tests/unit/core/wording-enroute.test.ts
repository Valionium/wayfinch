import { expect, test } from 'vitest';
import { E } from '../../../src/core/wording/en-enroute.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[AH-EMPTY] no string of En route\'s empty state uses a banned word, the stricter weather and stop list included', () => {
  const strings = Object.entries(E);
  expect(strings.length).toBe(2);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^empty[A-Z]/);
    expect(bannedHits(text, true), `${key}: ${text}`).toEqual([]);
  }
});

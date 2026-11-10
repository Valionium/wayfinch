import { expect, test } from 'vitest';
import { U } from '../../../src/core/wording/en-update.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the update notes uses a banned word', () => {
  expect(Object.keys(U).length).toBe(3);
  for (const [key, text] of Object.entries(U)) expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
});

import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TS } from '../../../src/core/wording/en-tyre-screen.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// The tyre tool's screen words left en.ts for the tool's own chunk (14 Nov 2026): word for word, under en.ts's checks.
test('[HON-BANNED] none of the tyre screen words uses a banned word; every key is its own, not also in en.ts', () => {
  const entries = Object.entries(TS);
  expect(entries.length).toBe(23);
  for (const [key, text] of entries) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
  }
  expect(TS.tyreTitle).toBe('Tyre pressure');
});

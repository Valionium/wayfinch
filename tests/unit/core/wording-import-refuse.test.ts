import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { IR } from '../../../src/core/wording/en-import-refuse.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the three import refusals moved out of en.ts for EM-CLINIC-NAME uses a banned word, and none is also in en.ts', () => {
  const strings = Object.entries(IR);
  expect(strings.length).toBe(3);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^appStoreImport[A-Z]/);
    expect(key in W, key).toBe(false);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

import { expect, test } from 'vitest';
import { H } from '../../../src/core/wording/en-here.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of Emergency’s no-route messages uses a banned word, and every key starts with "here"', () => {
  const strings = Object.entries(H);
  expect(strings.length).toBe(4);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^here[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

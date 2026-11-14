import { expect, test } from 'vitest';
import { T, TM, TS } from '../../../src/core/wording/en-tyre.ts';
import { W } from '../../../src/core/wording/en.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] no string of the tyre screen\'s own words uses a banned word, and every key starts with "tyre"', () => {
  const strings = Object.entries(T);
  expect(strings.length).toBe(13);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

// Three words moved from en.ts on 10 Nov 2026 (care pictures) to pay in the first screen for Bike care's two optional bike details:
// the same banned-words check, every template called with sample values, none left behind in en.ts.
test('[HON-BANNED] the tyre screen words moved on 10 Nov use no banned word, every key starts with "tyre", and none is still in en.ts', () => {
  const entries = Object.entries(TM);
  expect(entries.length).toBe(3);
  for (const [key, value] of entries) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(key in W, key).toBe(false);
    const text = (value as (...a: string[]) => string)('2.5', '3.0');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

// The SRAM cross-check's fifteen words moved from en.ts on 14 Nov 2026 to pay in the first screen for the brake fluid in the bike's details:
// the same banned-words check, every key starts with "tyreSram", none left behind in en.ts.
test('[HON-BANNED] the SRAM cross-check words moved on 14 Nov use no banned word, every key starts with "tyreSram", and none is still in en.ts', () => {
  const entries = Object.entries(TS);
  expect(entries.length).toBe(15);
  for (const [key, text] of entries) {
    expect(key).toMatch(/^tyreSram[A-Z]/);
    expect(key in W, key).toBe(false);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

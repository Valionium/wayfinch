import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { HN } from '../../../src/core/wording/en-hint.ts';
import { TN } from '../../../src/core/wording/en-tyre-notes.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// The first-run bike hint (wish 17): its lazy words, and the card's own on the first screen, never ask, press or promise.
test('[HON-BANNED] no word of the first-run bike hint uses a banned word or presses the rider; every lazy key starts with "hint" and none is also in en.ts', () => {
  const strings = Object.entries(HN);
  expect(strings.length).toBe(9);   // + "Try a colour", the colour dots' group (owner's answer 3 of 9 Nov 2026)
  for (const [key, text] of strings) {
    expect(key).toMatch(/^hint[A-Z]/);
    expect(key in W, key).toBe(false);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
  const card = [W.bikeHintTitle, W.bikeHintBody, W.bikeHintLater, W.bikeHintLaterName];
  for (const text of [...card, ...Object.values(HN)]) {
    expect(bannedHits(text, false), text).toEqual([]);
    // No "must", no "required", no "please", no "don't miss": an offer, never a request.
    expect(/\b(must|required|need to|please|don't miss|now or)\b/i.test(text), text).toBe(false);
  }
});

test('[HON-BANNED] no string of the tyre tool\'s moved notes uses a banned word; every key starts with "tyre" and none is also in en.ts', () => {
  const strings = Object.entries(TN);
  expect(strings.length).toBe(28);
  for (const [key, text] of strings) {
    expect(key).toMatch(/^tyre[A-Z]/);
    expect(typeof text).toBe('string');
    expect(key in W, key).toBe(false);
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

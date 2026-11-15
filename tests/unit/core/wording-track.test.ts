import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TK } from '../../../src/core/wording/en-track.ts';
import { bannedHits } from '../../fixtures/banned.ts';

test('[HON-BANNED] the track refusal moved out of en.ts for EM-CLINIC-NAME uses no banned word, and is not also in en.ts', () => {
  const strings = Object.entries(TK);
  expect(strings.length).toBe(1);
  for (const [key, text] of strings) {
    expect(key).toBe('routeTrackTooLong');
    expect(key in W, key).toBe(false);
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { HO } from '../../../src/core/wording/en-handoff.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Plan bags for this trip's refusals left en.ts for the handoff's own chunk (sweep 2 of 15 Nov 2026): word for word, and en.ts's checks.
test('[HON-BANNED] none of the handoff\'s refusals uses a banned word; every key is its own, not also in en.ts', () => {
  expect(Object.keys(HO)).toEqual(['appHandoffTooManyPoints', 'appHandoffTooLarge', 'appHandoffStorageFull', 'appHandoffNotKept']);
  for (const [key, text] of Object.entries(HO)) {
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text), `${key}: ${text}`).toEqual([]);
    expect(key in W, key).toBe(false);
  }
  expect(HO.appHandoffStorageFull).toBe("This phone's storage is full, so the route could not be passed on. Free some space, then try again.");
});

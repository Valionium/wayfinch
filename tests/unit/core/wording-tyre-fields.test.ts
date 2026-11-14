import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TQ } from '../../../src/core/wording/en-tyre-fields.ts';
import { IM } from '../../../src/core/wording/en-import.ts';
import { PS } from '../../../src/core/wording/en-prepare-steps.ts';
import { TK } from '../../../src/core/wording/en-tyre-card.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// The words moved out of en.ts for the En route chips (14 Nov 2026); a template is read with sample values.
const SAMPLES: Record<string, unknown[]> = {
  tyreUnitFor: ['Tyre maximum'], tyreAskYesPsi: ['65'], tyreFromPlan: ['14 Nov'], tyreSramWidthBoth: ['42'], tyreSramWidthEach: ['42', '45'], tyreCardLast: ['4.1', '4.4'], tyreCardBike: ['Gravel'],
  appPrepWait: ['14:05'],
};

test('[HON-BANNED] no word of the tyre tool, its Tools card or Prepare this route moved out of en.ts uses a banned word; none is also in en.ts', () => {
  const all = { ...TQ, ...PS, ...TK };
  expect(Object.keys(TQ)).toHaveLength(34);
  expect(Object.keys(PS)).toHaveLength(1);
  expect(Object.keys(TK)).toHaveLength(3);
  for (const [key, value] of Object.entries(all)) {
    expect(key in W, key).toBe(false);
    const text = typeof value === 'function' ? (value as (...a: unknown[]) => string)(...SAMPLES[key]!) : value;
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

test('[HON-BANNED] no string of the four import refusals moved out of en.ts uses a banned word, and none is also in en.ts', () => {
  const strings = Object.entries(IM);
  expect(strings.length).toBe(4);
  for (const [key, text] of strings) {
    expect(key in W, key).toBe(false);
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

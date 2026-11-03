import { describe, expect, test } from 'vitest';
import { Y } from '../../../src/core/wording/en-you.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Test values for each template function of You's wording. A new template without an entry here fails the test.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  youCapacityPlan: [['1.25']],
  youLearnRides: [[1], [3]],
  youLearnWeighed: [[1], [2]],
  youRideEstimate: [['1.3']],
  youExported: [['wayfinch-data-2026-10-10.json']],
  youImportTrip: [['Heidelberg to Strasbourg', '165.2']],
  youImportRides: [[1], [4]],
  youImportTyres: [[1], [3]],
  youImportLeftOut: [[1], [2]],
};

function everyString(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(Y)) {
    if (typeof value === 'string') out.push({ key, text: value });
    else {
      const sets = TEMPLATE_ARGS[key];
      if (!sets) throw new Error(`template ${key} has no test values in wording-you.test.ts`);
      for (const args of sets) out.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
    }
  }
  return out;
}

describe('You\'s wording (spec sections 3.5 and 8)', () => {
  test('every key starts with "you" and a capital', () => {
    for (const key of Object.keys(Y)) expect(key, key).toMatch(/^you[A-Z]/);
  });

  test('[HON-BANNED] no string of You\'s wording uses a banned word', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(80);
    for (const { key, text } of strings) expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  });

  test('[HON-BANNED] the app says "estimate", never a promise: no string claims a figure is exact or a medical result', () => {
    for (const { key, text } of everyString()) expect(text, key).not.toMatch(/\b(diagnos|medical|clinical|exactly)\w*/i);
  });
});

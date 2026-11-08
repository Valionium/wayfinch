import { describe, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Trip's words that only its lazy chunks show (after the launch, part 4a), under the same rules as en.ts. Their template test values
// moved here with them from wording.test.ts. A new template without an entry here fails the test.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  appTripReplaceBody: [['Old loop', 'New loop', '165.2']],
  appTripReplacedNoDate: [['Heidelberg to Strasbourg']],
};

function everyString(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(TR)) {
    if (typeof value === 'string') out.push({ key, text: value });
    else {
      const sets = TEMPLATE_ARGS[key];
      if (!sets) throw new Error(`template ${key} has no test values in wording-trip.test.ts`);
      for (const args of sets) out.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
    }
  }
  return out;
}

describe('Trip\'s lazy wording (spec sections 3.3 and 8)', () => {
  test('[HON-BANNED] no string of Trip\'s lazy wording uses a banned word', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThanOrEqual(Object.keys(TR).length);
    for (const { key, text } of strings) expect(bannedHits(text), `${key}: ${text}`).toEqual([]);
  });

  test('[APP-4A-FIRST] every key names its area as en.ts\'s do, and none is in en.ts as well', () => {
    for (const key of Object.keys(TR)) {
      expect(key, key).toMatch(/^app(Trip|Ab)[A-Z]/);
      expect(Object.keys(W), key).not.toContain(key);
    }
  });
});

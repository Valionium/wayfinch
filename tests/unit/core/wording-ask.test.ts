import { expect, test } from 'vitest';
import { A } from '../../../src/core/wording/en-ask.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Test values for each template function. A new template without an entry here fails the test below.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  askPass: [['32', '118']],
  askPassKm: [['32']],
  askPassMeasuredFrom: [['0'], ['12.5']],
};

test('[HON-BANNED] no string of Ahead\'s which-pass question uses a banned word, and every key starts with "ask"', () => {
  const strings: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(A)) {
    expect(key).toMatch(/^ask[A-Z]/);
    if (typeof value === 'string') strings.push({ key, text: value });
    else {
      const sets = TEMPLATE_ARGS[key];
      if (!sets) throw new Error(`template ${key} has no test values in wording-ask.test.ts`);
      for (const args of sets) strings.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
    }
  }
  expect(strings.length).toBe(5);
  for (const { key, text } of strings) expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
});

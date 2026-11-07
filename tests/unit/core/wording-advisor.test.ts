import { expect, test } from 'vitest';
import { GA } from '../../../src/core/wording/en-advisor.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Test values for each template function. A new template without an entry here fails the test.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  advisorRange: [[6, 8], [6, 6], [0.5, 1.5]],
};

test('[HON-BANNED] no string of the Gear advisor\'s own words uses a banned word, and every key starts with "advisor"', () => {
  const strings: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(GA)) {
    expect(key).toMatch(/^advisor[A-Z]/);
    if (typeof value === 'string') { strings.push({ key, text: value }); continue; }
    const sets = TEMPLATE_ARGS[key];
    if (!sets) throw new Error(`template ${key} has no test values in wording-advisor.test.ts`);
    for (const args of sets) strings.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
  }
  expect(strings.length).toBeGreaterThanOrEqual(7);
  for (const { key, text } of strings) expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
});

import { describe, expect, test } from 'vitest';
import { PT } from '../../../src/core/wording/en-paint.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Test values for each template function of the look extras' wording. A new template without an entry here fails the test.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  paintRimValue: [[15], [30], [60]],
  paintPairName: [['Red', 'Yellow'], ['Navy', 'Pink']],
  paintForkPairShade: [['Blue'], ['Silver']],
  paintFrameLabel: [[['Blue', 'Purple'], 'Fade, front to back']],
  paintForkColourLabel: [['Red']],
  paintForkFadeName: [['Blue to purple']],
  paintForkPatternName: [['Water-dyed', 'Blue to purple'], ['Raw carbon', null]],
  paintRimLabel: [[50]],
};

function everyString(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(PT)) {
    if (typeof value === 'string') out.push({ key, text: value });
    else {
      const sets = TEMPLATE_ARGS[key];
      if (!sets) throw new Error(`template ${key} has no test values in wording-paint.test.ts`);
      for (const args of sets) out.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
    }
  }
  return out;
}

describe("the look extras' wording (owner's wish, 5 November 2026)", () => {
  test('every key starts with "paint" and a capital', () => {
    for (const key of Object.keys(PT)) expect(key, key).toMatch(/^paint[A-Z]/);
  });

  test('[HON-BANNED] no string of the look extras uses a banned word, and no pattern carries a brand name', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(60);
    for (const { key, text } of strings) expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
    for (const { key, text } of strings) expect(text, key).not.toMatch(/\b(Spectraflair|Chameleon paint by|Cerakote|Prismatic|Oil slick)\b/i);
  });

  test('[BK-PAINT-PATTERNS] rim depth reads as the try-out: low alloy under 25 mm, mid carbon under 40, deep carbon from 40', () => {
    expect([15, 24, 25, 39, 40, 60].map(PT.paintRimValue)).toEqual(['15 mm · low alloy', '24 mm · low alloy', '25 mm · mid carbon', '39 mm · mid carbon', '40 mm · deep carbon', '60 mm · deep carbon']);
  });
});

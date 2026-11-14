import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { RF } from '../../../src/core/wording/en-route-file.ts';
import { WL } from '../../../src/core/wording/en-water-day.ts';
import { TZ } from '../../../src/core/wording/en-tyre-figures.ts';
import { YR } from '../../../src/core/wording/en-ride-refuse.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// The words moved out of en.ts on 14 Nov 2026 so that the first screen stays at main's figure; a template is read with sample values.
const SAMPLES: Record<string, unknown[]> = {
  tyreDidYouMean: ['65'], tyreRefuseTemp: ['The highest temperature on the trip'], tyreRefuseHeight: ['The highest point of the trip'],
  tyreFrontBackBar: ['4.1'], tyrePsiValue: ['59'], tyreAssumedList: ['no luggage, 700C wheels'],
};

test('[HON-BANNED] no word moved out of en.ts for En route\'s fixes uses a banned word, and none is also in en.ts', () => {
  const all = { ...RF, ...WL, ...TZ, ...YR };
  expect(Object.keys(all)).toHaveLength(11);
  for (const [key, value] of Object.entries(all)) {
    expect(key in W, key).toBe(false);
    const text = typeof value === 'function' ? (value as (...a: unknown[]) => string)(...SAMPLES[key]!) : value;
    expect(typeof text).toBe('string');
    expect(text.trim()).not.toBe('');
    expect(bannedHits(text, false), `${key}: ${text}`).toEqual([]);
  }
});

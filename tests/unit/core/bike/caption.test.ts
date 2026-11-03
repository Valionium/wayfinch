import { describe, expect, test } from 'vitest';
import { captionOf } from '../../../../src/core/bike/index.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import type { BagView } from '../../../../src/core/bike/spec.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { BAG_SETS, drawingSet, tyreSet } from './drawing-set.ts';

const panniers: BagView = { items: [{ pos: 'rack', L: 20, pair: true, fill: [0.5, 0.5] }], decks: { bar: null, rack: null }, bottles: [] };
const line = (fields: Record<string, unknown> | null, plan: BagView | null = null) => {
  const bike = fields ? normaliseBike({ id: 'c', ...fields }) : null;
  const c = captionOf(resolveBikeSpec(bike, plan), bike, plan);
  return `${c.text} · ${c.action}`;
};
const FAULT = /incomplete|missing|unknown|not set|error|invalid|wrong|fix|score|rating|%|!/i;

describe('the caption under the drawing (spec section 3.7)', () => {
  test('[BK-CAPTION] it names what the drawing was drawn from, warmly and truthfully', () => {
    expect(line({ fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, frontTyre: '40-622' }, panniers))
      .toBe('Drawn from your sloping frame (M), 40-622 tyres and panniers · Make it yours');
    expect(line({ fit: { style: 'step-through' } })).toBe('Drawn from your step-through frame · Make it yours');
    expect(line({ fit: { size: { kind: 'cm', value: 57 } } })).toBe('Drawn from your size L frame · Make it yours');
    expect(line({ frontTyre: '40-622', rearTyre: '45-622', look: { bars: 'flat' } })).toBe('Drawn from your 40-622 and 45-622 tyres and flat bars · Make it yours');
    expect(line({ frontTyre: '29 x 2.2' })).toBe('Drawn from your 56-622 tyres · Make it yours');
    expect(line({ pressure: { frontMm: 45 } })).toBe('Drawn from your 45 mm tyres · Make it yours');
    expect(line({ pressure: { wheel: '650b' } })).toBe('Drawn from your 650b wheels · Make it yours');
    expect(line({ look: { ebike: true }, fit: { style: 'trapeze' } }, BAG_SETS.bikepacking)).toBe('Drawn from your trapeze frame, e-bike and bags · Make it yours');
  });

  test('[BK-CAPTION] with no bike: "A typical gravel bike · Add your bike", or the type the plan suggests', () => {
    expect(line(null)).toBe('A typical gravel bike · Add your bike');
    expect(line(null, panniers)).toBe('A typical touring bike with your panniers · Add your bike');
    expect(line({ look: { colour: '#2f7d4f' } })).toBe('A typical gravel bike · Make it yours');
    expect(line({}, { items: [], decks: { bar: null, rack: 'loaded' }, bottles: [] })).toBe('A typical touring bike with your rack-top bag · Make it yours');
  });

  test('[BK-CAPTION] "your frame" is never said of a template, and no caption reads as a fault or uses a banned word', () => {
    const all: string[] = [line(null), line(null, panniers)];
    for (const e of drawingSet()) {
      const c = captionOf(resolveBikeSpec(e.bike, e.bags), e.bike, e.bags);
      all.push(`${c.text} · ${c.action}`);
    }
    for (const e of tyreSet()) {
      const c = captionOf(resolveBikeSpec(e.bike, e.bags), e.bike, e.bags);
      all.push(`${c.text} · ${c.action}`);
    }
    for (const text of new Set(all)) {
      expect(text).not.toMatch(/your frame/i);
      expect(text, text).not.toMatch(FAULT);
      expect(bannedHits(text), text).toEqual([]);
      expect(text, text).not.toMatch(/guess/i);
    }
  }, 60_000);
});

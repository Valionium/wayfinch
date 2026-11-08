// The weight map (weight map and bag shapes design, section 1): a field of weighted kilos over the bike, an ideal for the same kilos,
// and the sentences that carry the whole message without colour.
import { describe, expect, test } from 'vitest';
import { HANDLING_WEIGHTS } from '../../../../src/core/advisor/handling.ts';
import { WEIGHTS } from '../../../../src/core/advisor/table.ts';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { P } from '../../../../src/core/bike/art.ts';
import { bagShape } from '../../../../src/core/bike/shapes.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { blur, diffLine, FULL, GRID, idealItems, idealShares, shareLine, splat, zoneShares } from '../../../../src/core/bike/weightmap.ts';
import { WM } from '../../../../src/core/wording/en-weightmap.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
const square = (x: number, y: number, s: number): P[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const anchors = bikeArt(resolveBikeSpec(null, null), null).anchors;

describe('the weight map (design section 1)', () => {
  test('[WM-FIELD] one table of handling weights for the advisor and the map', () => {
    expect(WEIGHTS).toBe(HANDLING_WEIGHTS);
    expect(HANDLING_WEIGHTS).toMatchObject({ frame: 1.0, top: 1.2, fork: 1.5, rack: 1.8, bar: 2.2, seat: 2.6, pack: 3.5 });
  });

  test('[WM-FIELD] each bag spreads kilos times its weight over its outline; the blur keeps the total, even at the edge of the drawing', () => {
    const items = [
      { pos: 'frame', kg: 2, outline: square(140, 60, 20) },
      { pos: 'pack', kg: 3, outline: square(2, 12, 12) }, // close to the edge
      { pos: 'seat', kg: 1, outline: [[80, 40], [80.2, 40], [80.2, 40.2]] as P[] }, // smaller than a cell: still counted
    ];
    const total = 2 * 1.0 + 3 * 3.5 + 1 * 2.6;
    const raw = splat(items, 0.11);
    const per = (GRID.cell / 0.11 / 100) ** 2; // one cell (2 units at 0.11 units per mm) in units of 10 by 10 cm
    expect(sum(raw) * per).toBeCloseTo(total, 4);
    expect(sum(blur(raw)) * per).toBeCloseTo(total, 3);
    expect(GRID.w * GRID.h).toBe(131 * 66);
  });

  test('[WM-FIELD] the scale is fixed: a bag reads the same whatever else is packed, and full colour is 0.8 weighted kg per 10 by 10 cm', () => {
    expect(FULL).toBe(0.8);
    const one = blur(splat([{ pos: 'frame', kg: 2, outline: square(140, 60, 20) }], 0.11));
    const two = blur(splat([{ pos: 'frame', kg: 2, outline: square(140, 60, 20) }, { pos: 'pack', kg: 9, outline: square(4, 20, 20) }], 0.11));
    const at = (f: Float32Array) => f[Math.floor((70 - GRID.y) / GRID.cell) * GRID.w + Math.floor(150 / GRID.cell)]!;
    expect(at(two)).toBeCloseTo(at(one), 5);
    expect(at(one)).toBeGreaterThan(0);
  });

  test('[WM-IDEAL] the fixed profile: 50% frame, 5% top tube, 12% fork cages, 33% panniers; without panniers (the coordinator ruling of 8 Nov) their 33% goes to the others in proportion, no frame bag shares its 50% between top tube and fork', () => {
    const add = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);
    const full = idealShares({ rack: true, frame: true, top: true });
    expect(full).toEqual({ frame: 0.5, top: 0.05, fork: 0.12, rack: 0.33 });
    // no rack and no pannier mounts: the panniers' 33% to the frame bag, top tube and fork cages, in proportion; nothing in a seat pack
    const noRack = idealShares({ rack: false, frame: true, top: true });
    expect(Object.keys(noRack).sort()).toEqual(['fork', 'frame', 'top']);
    expect(noRack.frame!).toBeCloseTo(0.5 / 0.67, 9);
    expect(noRack.top!).toBeCloseTo(0.05 / 0.67, 9);
    expect(noRack.fork!).toBeCloseTo(0.12 / 0.67, 9);
    const noFrame = idealShares({ rack: true, frame: false, top: true });
    expect(noFrame.frame ?? 0).toBe(0);
    expect(noFrame.top! / noFrame.fork!).toBeCloseTo(5 / 12, 9);
    for (const rack of [true, false]) for (const frame of [true, false]) for (const top of [true, false]) {
      const s = idealShares({ rack, frame, top });
      expect(add(s), `${rack} ${frame} ${top}`).toBeCloseTo(1, 9);
      expect(s.pack ?? 0).toBe(0);
    }
    // the ideal's bags carry the same total kilos, at the planner's own anchors
    const items = idealItems(15, anchors, { rack: true, frame: true, top: true }, bagShape);
    expect(items.reduce((t, i) => t + i.kg, 0)).toBeCloseTo(15, 9);
    expect(items.filter((i) => i.pos === 'fork')).toHaveLength(2);
    expect(items.filter((i) => i.pos === 'rack')).toHaveLength(2);
  });

  test('[WM-SENTENCE] one sentence per map from the same numbers, and the difference in points', () => {
    const items = [{ pos: 'pack', kg: 2, outline: [] }, { pos: 'rack', kg: 4, outline: [] }, { pos: 'frame', kg: 2, outline: [] }, { pos: 'bar', kg: 1, outline: [] }];
    const z = zoneShares(items);
    expect(z.back + z.rear + z.middle + z.front).toBe(100);
    expect(shareLine(z)).toBe(`Of the weighted load: ${z.back}% on your back, ${z.rear}% at the rear, ${z.middle}% in the middle, ${z.front}% at the front.`);
    expect(diffLine({ back: 24, rear: 44, middle: 10, front: 22 }, { back: 0, rear: 40, middle: 42, front: 18 })).toBe('32 points less in the middle, 24 points more on your back, 4 points more at the rear, 4 points more at the front.');
    expect(diffLine({ back: 0, rear: 40, middle: 42, front: 18 }, { back: 0, rear: 41, middle: 41, front: 18 })).toBe('Close to the ideal.');
    for (const [key, value] of Object.entries(WM)) {
      const texts = typeof value === 'string' ? [value] : typeof value === 'function' ? [String((value as (...a: unknown[]) => string)(3, true, 'in the middle'))] : Object.values(value as object).map(String);
      for (const t of texts) expect(bannedHits(t), key).toEqual([]);
    }
  });
});

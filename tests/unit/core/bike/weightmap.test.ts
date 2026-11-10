// The weight map (weight map and bag shapes design, section 1): a field of weighted kilos over the bike, the rider's own ideal,
// and the sentences that carry the whole message without colour.
import { describe, expect, test } from 'vitest';
import { HANDLING_WEIGHTS } from '../../../../src/core/advisor/handling.ts';
import { WEIGHTS } from '../../../../src/core/advisor/table.ts';
import type { P } from '../../../../src/core/bike/art.ts';
import { blur, diffLine, FULL, GRID, movedLine, shareLine, splat, zoneShares } from '../../../../src/core/bike/weightmap.ts';
import { balance } from '../../../../src/core/advisor/balance.ts';
import type { Packing } from '../../../../src/core/advisor/balance.ts';
import { handlingScore } from '../../../../src/core/advisor/rank.ts';
import { WM } from '../../../../src/core/wording/en-weightmap.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);
const square = (x: number, y: number, s: number): P[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

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

  // The owner's finding G (8 Nov 2026) replaced the fixed 50/5/12/33 profile: the ideal is the rider's own setup, packed for the best
  // balance by the advisor's balancing (balance.test.ts), with panniers and without (the page, qa/rig.cjs; the view, weight-map.test.ts).
  test('[WM-IDEAL] the ideal is the rider\'s own things in the rider\'s own bags:the same kilos, less weight where it handles worst, never more on the back', () => {
    const bags = { f: 'frame', s: 'seat', p: 'pack' } as const;
    const cap: Record<string, number> = { f: 6, s: 14, p: 15 };
    const things = [{ id: 'tent', kg: 2.4, L: 5 }, { id: 'stove', kg: 0.6, L: 1.5 }, { id: 'book', kg: 0.5, L: 0.5 }];
    const pack = (at: Record<string, string>): Packing => {
      const left = { ...cap };
      for (const t of things) left[at[t.id]!]! -= t.L;
      const kgByPos: Record<string, number> = {};
      for (const t of things) kgByPos[bags[at[t.id] as keyof typeof bags]] = (kgByPos[bags[at[t.id] as keyof typeof bags]] ?? 0) + t.kg;
      const back = things.filter((t) => at[t.id] === 'p');
      return { result: { overL: 0, spillIds: [], backL: back.reduce((x, t) => x + t.L, 0), backKg: back.reduce((x, t) => x + t.kg, 0), outOfReach: 0, kgByPos, items: {} },
        pieces: things.map((t) => ({ id: t.id, kg: t.kg, L: t.L, unit: at[t.id]!, pos: bags[at[t.id] as keyof typeof bags] })),
        rooms: Object.entries(bags).map(([key, pos]) => ({ key, pos, freeL: left[key]! })) };
    };
    const plan = { tent: 's', stove: 's', book: 'p' };
    const start = pack(plan);
    const ideal = balance(start, (pins) => pack({ ...plan, ...pins })).packing;
    const kilos = (p: Packing) => Object.values(p.result.kgByPos).reduce((x, y) => x + (y ?? 0), 0);
    expect(kilos(ideal)).toBeCloseTo(kilos(start), 9);
    expect(handlingScore(ideal.result)).toBeLessThan(handlingScore(start.result));
    expect(ideal.result.backL).toBeLessThanOrEqual(start.result.backL);
    const items = (p: Packing) => p.pieces.map((x) => ({ pos: x.pos, kg: x.kg, outline: [] }));
    expect(zoneShares(items(ideal)).back).toBeLessThanOrEqual(zoneShares(items(start)).back);
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

// "Handling first" (design of 10 Nov 2026, §3): after a press the map shows Before over After, with one sentence of what moved.
describe("Handling first's Before and After", () => {
  test('[HF-MAP] one sentence: the kilos that left the zone that lost most for the zone that gained most; the same zones, said so', () => {
    const it = (pos: string, kg: number) => ({ pos, kg, outline: [] as P[] });
    expect(movedLine([it('seat', 3), it('pack', 2)], [it('frame', 2.1), it('seat', 0.9), it('pack', 2)])).toBe('2.1 kg moved from the rear to the middle.');
    expect(movedLine([it('pack', 1.5), it('bar', 1)], [it('fork', 1), it('frame', 1.5)])).toBe('1.5 kg moved off your back to the middle.');
    // seat pack to panniers, bar roll to fork cages: each zone keeps its kilos
    expect(movedLine([it('seat', 2), it('bar', 1)], [it('rack', 2), it('fork', 1)])).toBe(WM.sameZones);
    expect(movedLine([], [])).toBe(WM.sameZones);
    for (const t of [WM.before, WM.after, WM.afterSub, WM.beforeSub('4.0'), WM.sameZones, WM.moved('2.1', 'rear', 'middle')]) expect(bannedHits(t)).toEqual([]);
  });
});

import { describe, expect, test } from 'vitest';
import { candidates } from '../../../../src/core/advisor/candidates.ts';
import { compareFor, handlingScore, isValid, sizeRange } from '../../../../src/core/advisor/rank.ts';
import type { Candidate, Suggestion, TrialResult } from '../../../../src/core/advisor/types.ts';
import { GA } from '../../../../src/core/wording/en-advisor.ts';
import { bag, input } from './fixtures.ts';

function result(over: Partial<TrialResult> = {}): TrialResult {
  return { overL: 0, spillIds: [], backL: 3, backKg: 1.5, outOfReach: 1, kgByPos: {}, items: {}, ...over };
}

function suggestion(over: Partial<Suggestion> & { r?: Partial<TrialResult> } = {}): Suggestion {
  const { r, ...rest } = over;
  const res = result(r);
  return { kind: 'add', add: [bag(10, 'seat', 8)], remove: null, decks: { rack: false, bar: false }, newBags: 1, litres: 8, tags: [],
    result: res, score: handlingScore(res), rangeL: [8, 8], ...rest };
}

describe('validity (design §3.2)', () => {
  test('[GA-VALID] invalid when overL > 0, when backL rises by more than 0.005, or when outOfReach rises; valid otherwise', () => {
    const base = result();
    expect(isValid(base, result())).toBe(true);
    expect(isValid(base, result({ overL: 0.1 }))).toBe(false);
    expect(isValid(base, result({ overL: 0, spillIds: ['stove'] }))).toBe(false); // an item left over overflows too
    expect(isValid(base, result({ backL: 3.006 }))).toBe(false);
    expect(isValid(base, result({ backL: 3.004 }))).toBe(true);
    expect(isValid(base, result({ outOfReach: 2 }))).toBe(false);
    expect(isValid(base, result({ backL: 0, backKg: 0, outOfReach: 0 }))).toBe(true);
    // A base that overflows: only a full fix is valid.
    const over = result({ overL: 4, spillIds: ['tent'] });
    expect(isValid(over, result({ overL: 1 }))).toBe(false);
    expect(isValid(over, result())).toBe(true);
  });
});

describe('ranking (design §3.3)', () => {
  test('[GA-RANK-BACK] backpack: fewer back litres first, then fewer back kilos', () => {
    const a = suggestion({ r: { backL: 2, backKg: 3 } });
    const b = suggestion({ r: { backL: 1, backKg: 4 } });
    const c = suggestion({ r: { backL: 1, backKg: 2 } });
    expect([a, b, c].sort(compareFor('backpack'))).toEqual([c, b, a]);
    // Handling's score does not decide it.
    const low = suggestion({ r: { backL: 2, kgByPos: { frame: 1 } } });
    const high = suggestion({ r: { backL: 1, kgByPos: { seat: 9 } } });
    expect([low, high].sort(compareFor('backpack'))).toEqual([high, low]);
  });

  test('[GA-RANK-HANDLING] handling: the lower score first; 2 kg from seat to frame lowers it by 3.2', () => {
    const before = handlingScore(result({ kgByPos: { seat: 2, bar: 1 } }));
    const after = handlingScore(result({ kgByPos: { frame: 2, bar: 1 } }));
    expect(before).toBe(7.4);
    expect(after).toBe(4.2);
    expect(Math.round((before - after) * 100) / 100).toBe(3.2);
    expect(handlingScore(result({ kgByPos: { top: 1 / 3, pack: 1, deck: 1, fork: 1, rack: 1, bottle: 1, bottleU: 1 } }))).toBe(11); // 0.4 + 3.5 + 1.8 + 1.5 + 1.8 + 1 + 1
    expect(handlingScore(result())).toBe(0);
    const good = suggestion({ r: { kgByPos: { frame: 2 } } });
    const bad = suggestion({ r: { kgByPos: { seat: 2 } }, newBags: 1 });
    expect([bad, good].sort(compareFor('handling'))).toEqual([good, bad]);
  });

  test('[GA-TIES] equal on the goal: fewer new bags, then fewer litres, then an add before a swap', () => {
    for (const goal of ['handling', 'backpack'] as const) {
      const two = suggestion({ kind: 'add-two', newBags: 2, litres: 4 });
      const big = suggestion({ litres: 12 });
      const small = suggestion({ litres: 8 });
      const swap = suggestion({ kind: 'swap', remove: 1, litres: 8 });
      expect([two, swap, big, small].sort(compareFor(goal)), goal).toEqual([small, swap, big, two]);
      // Differences below a hundredth are ties.
      const a = suggestion({ litres: 9, r: { backL: 1.001, kgByPos: { seat: 1.001 } } });
      const b = suggestion({ litres: 8, r: { backL: 1, kgByPos: { seat: 1 } } });
      expect([a, b].sort(compareFor(goal)), goal).toEqual([b, a]);
    }
  });

  test('[GA-RANGE] valid sizes 6, 7, 8, 10 with chosen 6 show 6–8 L; only 6 valid shows 6–6 L as "6 L"', () => {
    expect(sizeRange([6, 7, 8, 10], 6, 16)).toEqual([6, 8]);
    expect(GA.advisorRange(6, 8)).toBe('6–8 L');
    expect(sizeRange([6], 6, 16)).toEqual([6, 6]);
    expect(GA.advisorRange(6, 6)).toBe('6 L');
    expect(sizeRange([6, 8], 6, 16)).toEqual([6, 8]);
    expect(sizeRange([6, 7, 10], 6, 16)).toEqual([6, 7]);
    expect(sizeRange([6, 7, 8], 6, 7)).toEqual([6, 7]); // capped at the range's top
    expect(sizeRange([7, 8, 9], 8, 16)).toEqual([8, 9]); // never below the chosen size
    // Top tube bags in half litres: up to two litres more, within 0.5–2 L.
    expect(sizeRange([0.5, 1, 1.5, 2], 0.5, 2)).toEqual([0.5, 2]);
    expect(sizeRange([1, 1.5], 1, 2)).toEqual([1, 1.5]);
    expect(GA.advisorRange(0.5, 1.5)).toBe('0.5–1.5 L');
  });
});

describe('what a swap may take out, and the frame (design §3.1)', () => {
  test('[GA-HAND] a bag holding a hand placement is never removed by a swap', () => {
    const i = input({ bags: [bag(1, 'seat', 14, { hand: true }), bag(2, 'bar', 12), bag(3, 'bottle', 0.75), bag(4, 'bottleU', 0.75)], nextUid: 5 });
    const swaps = candidates(i, 'swap');
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.some((c: Candidate) => c.remove === 1)).toBe(false);
    expect(swaps.some((c: Candidate) => c.remove === 3 || c.remove === 4)).toBe(false); // never a bottle
    expect(new Set(swaps.map((c: Candidate) => c.remove))).toEqual(new Set([2]));
  });

  test('[GA-FRAME-FIT] frameShapes empty with a reason: no frame candidate, and the answer carries the reason', () => {
    for (const frameReason of ['NO_MOUNT', 'NO_ROOM']) {
      const i = input({ frameShapes: [], frameReason, bags: [bag(1, 'seat', 14)], nextUid: 2 });
      const all = (['add', 'swap', 'add-two'] as const).flatMap((p) => candidates(i, p));
      expect(all.length).toBeGreaterThan(0);
      expect(all.some((c) => c.add.some((b) => b.pos === 'frame')), frameReason).toBe(false);
    }
    // The answer's half is in search.test.ts, under the same ID.
  });
});

import fc from 'fast-check';
import { describe, expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { findClimbs } from '../../../../src/core/route/climbs.ts';
import { routeOf, sampled } from '../../../fixtures/route.ts';

const climbsOf = async (pairs: [number, number | null][]) => findClimbs(await routeOf(pairs));

describe('[CL-CLIMB] what a climb is', () => {
  plain('100 m of gain at 3% is a climb', async () => {
    const c = await climbsOf([[0, 100], [3.33, 200]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.gainM).toBeCloseTo(100, 6);
    expect(c[0]!.startKm).toBeCloseTo(0, 2);
    expect(c[0]!.topKm).toBeCloseTo(3.33, 2);
    expect(c[0]!.avgGradePct).toBeCloseTo(3.003, 2);
  });

  plain('99 m is not, and 100 m at 2.9% is not', async () => {
    expect(await climbsOf([[0, 100], [3.33, 199]])).toEqual([]);
    expect(await climbsOf([[0, 100], [3.4483, 200]])).toEqual([]);
  });

  plain('two rises joined across a dip of 19 m are one climb', async () => {
    const c = await climbsOf([[0, 0], [2, 100], [3, 81], [5, 181]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.startKm).toBeCloseTo(0, 2);
    expect(c[0]!.topKm).toBeCloseTo(5, 2);
    expect(c[0]!.gainM).toBeCloseTo(181, 6);
    expect(c[0]!.avgGradePct).toBeCloseTo(3.62, 2);
  });

  plain('across a dip of 20 m they are two', async () => {
    const c = await climbsOf([[0, 0], [2, 100], [3, 80], [5, 180]]);
    expect(c).toHaveLength(2);
    expect(c.map((x) => [x.startKm, x.topKm].map((k) => Math.round(k)))).toEqual([[0, 2], [3, 5]]);
    expect(c.map((x) => x.gainM)).toEqual([100, 100]);
  });

  plain('the climb starts at the lowest point before the rise and ends at the highest', async () => {
    const c = await climbsOf([[0, 300], [1, 250], [2, 240], [4, 340], [6, 400], [7, 380]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.startKm).toBeCloseTo(2, 2);
    expect(c[0]!.topKm).toBeCloseTo(6, 2);
    expect(c[0]!.gainM).toBeCloseTo(160, 6);
  });

  plain('the steepest 500 m is the steepest stretch of that length', async () => {
    const c = await climbsOf([[0, 0], [1, 10], [2, 110], [3, 120]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.avgGradePct).toBeCloseTo(4, 3);
    expect(c[0]!.steepest500mPct).toBeCloseTo(10, 3);
  });

  plain('a climb shorter than 500 m reports a finite steepest stretch, at least its average', async () => {
    const c = await climbsOf([[0, 100], [0.2, 100], [0.4, 220], [0.6, 220]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.steepest500mPct).toBeGreaterThanOrEqual(c[0]!.avgGradePct);
    expect(Number.isFinite(c[0]!.steepest500mPct)).toBe(true);
  });

  plain('wiggles of 10 m on the way up do not split a climb', async () => {
    const c = await climbsOf([[0, 0], [1, 60], [1.5, 50], [2, 110], [2.5, 100], [3, 170]]);
    expect(c).toHaveLength(1);
    expect(c[0]!.gainM).toBeCloseTo(170, 6);
  });

  plain('a descent, a flat route and a route without heights have no climbs', async () => {
    expect(await climbsOf([[0, 900], [10, 100]])).toEqual([]);
    expect(await climbsOf(sampled(50, 1, () => 100))).toEqual([]);
    expect(await climbsOf(sampled(50, 1, null))).toEqual([]);
  });

  plain('one missing height means no climbs, never a guess', async () => {
    expect(await climbsOf([[0, 0], [2, null], [4, 300]])).toEqual([]);
  });

  plain('a very short route gives no climbs and no error, unless it is a real climb', async () => {
    expect(await climbsOf([[0, 0], [0.4, 50]])).toEqual([]);
    expect(await climbsOf([[0, 0], [0.4, 150]])).toHaveLength(1);
  });
});

test.prop([fc.array(fc.integer({ min: -60, max: 90 }), { minLength: 2, maxLength: 60 })])(
  '[CL-CLIMB] every climb meets the thresholds, in order, without overlap', async (steps) => {
    let h = 200;
    const pairs = steps.map((d, i): [number, number] => { h = Math.max(0, h + d); return [i * 0.5, h]; });
    const climbs = findClimbs(await routeOf(pairs));
    climbs.forEach((c, i) => {
      expect(c.gainM).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(c.avgGradePct).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(c.topKm).toBeGreaterThan(c.startKm);
      expect(c.steepest500mPct).toBeGreaterThanOrEqual(c.avgGradePct - 1e-9);
      if (i > 0) expect(c.startKm).toBeGreaterThanOrEqual(climbs[i - 1]!.topKm);
    });
  });

import fc from 'fast-check';
import { describe, expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { findClimbs } from '../../../../src/core/route/climbs.ts';
import { sampleGrid } from '../../../../src/core/route/grid.ts';
import { planStages } from '../../../../src/core/route/stages.ts';
import type { Climb, Stage } from '../../../../src/core/types.ts';
import { routeOf, sampled } from '../../../fixtures/route.ts';

const stage = (day: number, startKm: number, endKm: number): Stage => ({ day, startKm, endKm, ridingHours: 1, ascentM: null });
const gaps = (g: number[]): number[] => g.slice(1).map((k, i) => k - g[i]!);

describe('[LOC-GRID] the sample grid', () => {
  plain('every 10 to 15 km, with the route start and end', async () => {
    const route = await routeOf(sampled(100, 1, null));
    const g = sampleGrid(route, [], []);
    expect(g[0]).toBe(0);
    expect(g.at(-1)).toBeCloseTo(route.lengthKm, 2);
    for (const gap of gaps(g)) {
      expect(gap).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(gap).toBeLessThanOrEqual(15 + 1e-6);
    }
  });

  plain('it adds each stage end, the high point, and each climb top and bottom', async () => {
    const route = await routeOf(sampled(100, 0.5, (km) => (km < 40 ? 100 : km < 50 ? 100 + (km - 40) * 40 : 500 - (km - 50) * 5)));
    const climbs = findClimbs(route);
    expect(climbs).toHaveLength(1);
    const stages = planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 });
    const g = sampleGrid(route, climbs, stages);
    const has = (km: number): boolean => g.some((k) => Math.abs(k - km) < 0.01);
    for (const s of stages) expect(has(s.endKm)).toBe(true);
    expect(has(climbs[0]!.startKm)).toBe(true);
    expect(has(climbs[0]!.topKm)).toBe(true);
    expect(has(50)).toBe(true); // the high point
  });

  plain('no climb points without heights, even when climbs are passed in', async () => {
    const route = await routeOf(sampled(100, 1, null));
    const fake: Climb = { startKm: 33.3, topKm: 44.4, gainM: 120, avgGradePct: 3.5, steepest500mPct: 5 };
    const without = sampleGrid(route, [], []);
    expect(sampleGrid(route, [fake], [])).toEqual(without);
    expect(without.some((k) => Math.abs(k - 33.3) < 0.01 || Math.abs(k - 44.4) < 0.01)).toBe(false);
  });

  plain('the same route always gives the same grid, in order, without repeats', async () => {
    const route = await routeOf(sampled(137, 1, (km) => 200 + 80 * Math.sin(km / 9)));
    const stages = planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 });
    const a = sampleGrid(route, findClimbs(route), stages);
    const b = sampleGrid(route, findClimbs(route), stages);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });

  plain('a route under a kilometre has just its two ends', async () => {
    const route = await routeOf([[0, 100], [0.4, 100]]);
    const g = sampleGrid(route, [], planStages(route, { flatKph: 25, pace: 'sporting', nights: 0 }));
    expect(g).toHaveLength(2);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeCloseTo(0.4, 2);
  });

  plain('a stage end that falls on a grid point is not listed twice', async () => {
    const route = await routeOf(sampled(100, 1, null));
    const g = sampleGrid(route, [], [stage(1, 0, 50), stage(2, 50, route.lengthKm)]);
    expect(new Set(g).size).toBe(g.length);
    expect(g.filter((k) => Math.abs(k - 50) < 0.01)).toHaveLength(1);
  });
});

test.prop([fc.double({ min: 0.1, max: 900, noNaN: true }), fc.array(fc.double({ min: 0.01, max: 0.99, noNaN: true }), { maxLength: 6 })])(
  '[LOC-GRID] no gap is wider than 15 km and every stage end is in the grid', async (length, cuts) => {
    const route = await routeOf([[0, null], [length, null]]);
    const ends = [...new Set(cuts.map((c) => Math.round(c * route.lengthKm * 1000) / 1000))].sort((a, b) => a - b);
    const all = [...ends, route.lengthKm];
    const stages = all.map((e, i): Stage => stage(i + 1, i === 0 ? 0 : all[i - 1]!, e));
    const g = sampleGrid(route, [], stages);
    for (const gap of gaps(g)) expect(gap).toBeLessThanOrEqual(15 + 1e-3);
    for (const s of stages) expect(g.some((k) => Math.abs(k - s.endKm) < 0.001)).toBe(true);
    expect(g[0]).toBe(0);
  });

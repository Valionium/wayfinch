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

// Real files (a planner's export, a bike computer's recording) have a point every 5 to 50 m, so the 200 m smoothing works on every
// point and a flat is never exactly flat: its heights wobble by fractions of a metre, or by metres with recorded heights.
/** A small seeded generator, so a noisy profile is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points every `stepKm`, heights from `ele`, plus up to ±`noiseM` of seeded noise, in whole metres as files store them. */
function dense(lengthKm: number, stepKm: number, ele: (km: number) => number, noiseM = 0, seed = 1): [number, number][] {
  const r = seeded(seed);
  return sampled(lengthKm, stepKm, ele).map(([km, h]) => [km, Math.round((h as number) + (r() * 2 - 1) * noiseM)]);
}

/** A profile from straight pieces: [length km, grade %], starting at `base` metres. */
function pieces(base: number, parts: [number, number][]): (km: number) => number {
  return (km) => {
    let h = base;
    let at = 0;
    for (const [len, grade] of parts) {
      const d = Math.min(Math.max(km - at, 0), len);
      h += (d * 1000 * grade) / 100;
      at += len;
    }
    return h;
  };
}

describe('[CL-CLIMB] dense points: a climb starts at its foot and ends at its top, never on the flats around it', () => {
  plain('5 km flat, 2 km at 6%, 3 km flat, a point every 10 m: one climb, km 5 to 7, 120 m, 6%', async () => {
    for (const step of [0.01, 0.05]) {
      const c = await climbsOf(dense(10, step, pieces(200, [[5, 0], [2, 6], [3, 0]])));
      expect(c, `every ${step * 1000} m`).toHaveLength(1);
      expect(c[0]!.startKm).toBeGreaterThan(4.85);
      expect(c[0]!.startKm).toBeLessThan(5.15);
      expect(c[0]!.topKm).toBeGreaterThan(6.85);
      expect(c[0]!.topKm).toBeLessThan(7.15);
      expect(c[0]!.gainM).toBeGreaterThan(110);
      // The 200 m smoothing rounds the corners at the foot and the top, so the average reads a little under 6%.
      expect(c[0]!.avgGradePct).toBeGreaterThan(5.3);
      expect(c[0]!.avgGradePct).toBeLessThan(6.5);
    }
  });

  plain('30 km of riverside flat, then 6 km at 6%, then 2 km flat, every 20 m, with and without ±2 m of noise: found, about km 30 to 36', async () => {
    for (const noise of [0, 2]) {
      for (const seed of [1, 2, 3]) {
        const c = await climbsOf(dense(38, 0.02, pieces(150, [[30, 0], [6, 6], [2, 0]]), noise, seed));
        expect(c, `noise ${noise}, seed ${seed}`).toHaveLength(1);
        expect(c[0]!.startKm).toBeGreaterThan(29.5);
        expect(c[0]!.startKm).toBeLessThan(30.5);
        expect(c[0]!.topKm).toBeGreaterThan(35.5);
        expect(c[0]!.topKm).toBeLessThan(36.5);
        expect(c[0]!.avgGradePct).toBeGreaterThan(5.4);
        expect(c[0]!.avgGradePct).toBeLessThan(6.6);
      }
    }
  });

  plain('2 km flat, 5 km at 6%, 2 km flat, every 10 m: km 2 to 7 at 6%, not km 0 to 9 at 3.4%', async () => {
    const c = await climbsOf(dense(9, 0.01, pieces(300, [[2, 0], [5, 6], [2, 0]])));
    expect(c).toHaveLength(1);
    expect(c[0]!.startKm).toBeCloseTo(2, 0);
    expect(c[0]!.topKm).toBeCloseTo(7, 0);
    expect(c[0]!.gainM).toBeGreaterThan(290);
    expect(c[0]!.avgGradePct).toBeGreaterThan(5.6);
  });

  plain('a valley road rising 0.3% with ±2 m of noise, a pass of 4%, 8% and 6%, a noisy summit plateau: the climb is the pass alone', async () => {
    const c = await climbsOf(dense(37, 0.025, pieces(400, [[20, 0.3], [3, 4], [3, 8], [4, 6], [1.5, 0], [5.5, -7]]), 2, 7));
    expect(c).toHaveLength(1);
    expect(c[0]!.startKm).toBeGreaterThan(19.5);
    expect(c[0]!.startKm).toBeLessThan(20.5);
    expect(c[0]!.topKm).toBeGreaterThan(29.5);
    expect(c[0]!.topKm).toBeLessThan(30.6);
    expect(c[0]!.gainM).toBeGreaterThan(580);
    expect(c[0]!.avgGradePct).toBeGreaterThan(5.5);
  });

  plain('steps up a valley: three times 10 km flat then 4 km at 7%, every 25 m: three climbs, each about 4 km at 7%', async () => {
    const c = await climbsOf(dense(42, 0.025, pieces(200, [[10, 0], [4, 7], [10, 0], [4, 7], [10, 0], [4, 7]]), 1, 3));
    expect(c).toHaveLength(3);
    c.forEach((x, i) => {
      expect(x.startKm).toBeGreaterThan(10 + i * 14 - 0.5);
      expect(x.topKm).toBeLessThan(14 + i * 14 + 0.5);
      expect(x.avgGradePct).toBeGreaterThan(6.3);
    });
  });

  plain('10 km of a 1% valley road, then 3 km at 8%: the 8% climb is found, not lost in a 13 km average under 3%', async () => {
    for (const step of [0.5, 0.02]) {
      const c = await climbsOf(dense(13, step, pieces(500, [[10, 1], [3, 8]])));
      expect(c, `every ${step * 1000} m`).toHaveLength(1);
      expect(c[0]!.startKm).toBeGreaterThan(9.5);
      expect(c[0]!.topKm).toBeCloseTo(13, 0);
      expect(c[0]!.avgGradePct).toBeGreaterThan(7);
    }
  });
});

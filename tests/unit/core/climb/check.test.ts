import { describe, expect, test } from 'vitest';
import { CLIMB_STEEP_PCT, CLIMB_WALK_PCT, CLIMBS_SHOWN, climbCheck, climbLevel, shownClimbMin } from '../../../../src/core/climb/check.ts';
import { ridingMin } from '../../../../src/core/engines/pace.ts';
import type { Route, Stage } from '../../../../src/core/types.ts';
import { routeOf, sampled } from '../../../fixtures/route.ts';

const stage = (day: number, startKm: number, endKm: number): Stage => ({ day, startKm, endKm, ridingHours: 3, ascentM: null });
const climbsOf = (r: ReturnType<typeof climbCheck>) => (r.kind === 'climbs' ? r.climbs : []);

describe('[CC-NOHEIGHT] a route without heights gets no climbs and no guess', () => {
  test('one missing height: unknown, never "no climbs"', async () => {
    const route = await routeOf([[0, 100], [5, 400], [6, null], [10, 400]]);
    expect(climbCheck(route, { flatKph: 20 })).toEqual({ kind: 'no-heights' });
  });

  test('a route with no heights at all, and a route of one point', async () => {
    expect(climbCheck(await routeOf(sampled(30, 1, null)), { flatKph: 20 })).toEqual({ kind: 'no-heights' });
    expect(climbCheck(await routeOf([[0, 100]]), { flatKph: 20 })).toEqual({ kind: 'no-heights' });
  });
});

describe('[CC-NONE] a flat route, and very short climbs, give none', () => {
  test('flat: none', async () => {
    expect(climbCheck(await routeOf(sampled(40, 0.5, () => 120)), { flatKph: 20 })).toEqual({ kind: 'none' });
  });

  test('a bump of 60 m, and 100 m at 2%, are not climbs (CL-CLIMB: 100 m at 3%)', async () => {
    expect(climbCheck(await routeOf([[0, 100], [1, 160], [2, 100], [10, 100]]), { flatKph: 20 })).toEqual({ kind: 'none' });
    expect(climbCheck(await routeOf([[0, 100], [5, 200], [10, 200]]), { flatKph: 20 })).toEqual({ kind: 'none' });
  });

  test('a stored climb with a broken figure is left out, never shown', async () => {
    const route = await routeOf(sampled(20, 1, () => 100));
    const broken: Route = { ...route, climbs: [{ startKm: 2, topKm: 5, gainM: Number.NaN, avgGradePct: 5, steepest500mPct: 6 }, { startKm: 8, topKm: 8, gainM: 120, avgGradePct: 4, steepest500mPct: 5 }] };
    expect(climbCheck(broken, { flatKph: 20 })).toEqual({ kind: 'none' });
  });
});

describe('[CC-LIST] the climbs, hardest first, with where, length, gain and grades', () => {
  test('one hill: its figures', async () => {
    const route = await routeOf([[0, 100], [5, 400], [10, 400]]);
    const out = climbCheck(route, { flatKph: 20 });
    expect(out.kind).toBe('climbs');
    const [c, ...rest] = climbsOf(out);
    expect(rest).toEqual([]);
    expect(c!.startKm).toBeCloseTo(0, 1);
    expect(c!.topKm).toBeCloseTo(5, 1);
    expect(c!.lengthKm).toBeCloseTo(5, 1);
    expect(c!.gainM).toBeCloseTo(300, 0);
    expect(c!.avgGradePct).toBeCloseTo(6, 1);
    expect(c!.steepestPct).toBeCloseTo(6, 1);
    expect(c!.level).toBe('steady');
    expect(c!.day).toBeNull(); // no days planned yet
    expect(out.kind === 'climbs' && out.more).toBe(0);
  });

  test('two hills: the harder (gain times average grade) comes first, each with its day', async () => {
    // Hill A: 300 m over 5 km (6%, score 1800). Hill B: 200 m over 2 km (10%, score 2000).
    const route = await routeOf([[0, 100], [5, 400], [8, 150], [10, 150], [12, 350], [20, 350]]);
    const withDays: Route = { ...route, stages: [stage(1, 0, 9), stage(2, 9, route.lengthKm)] };
    const list = climbsOf(climbCheck(withDays, { flatKph: 20 }));
    expect(list.map((c) => Math.round(c.startKm))).toEqual([10, 0]);
    expect(list.map((c) => c.day)).toEqual([2, 1]);
    expect(list.map((c) => c.level)).toEqual(['steep', 'steady']);
    expect(list[0]!.avgGradePct).toBeCloseTo(10, 1);
  });

  test(`at most ${CLIMBS_SHOWN} are listed; the rest are counted`, async () => {
    // Twelve hills of 2 km up and 2 km down, each 10 m higher than the last.
    const route = await routeOf(sampled(48, 0.25, (km) => {
      const n = Math.floor(km / 4);
      const into = km - n * 4;
      const top = 120 + n * 10;
      return 100 + (into <= 2 ? (top * into) / 2 : (top * (4 - into)) / 2);
    }));
    const out = climbCheck(route, { flatKph: 20 });
    expect(out.kind).toBe('climbs');
    if (out.kind !== 'climbs') return;
    expect(out.climbs).toHaveLength(CLIMBS_SHOWN);
    expect(out.more).toBe(route.climbs.length - CLIMBS_SHOWN);
    expect(out.more).toBeGreaterThan(0);
    const scores = out.climbs.map((c) => c.gainM * c.avgGradePct);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('[CC-TIME] the time is the pace engine\'s riding time at the trip\'s flat speed, an estimate', () => {
  test('the same minutes as ridingMin for the climb, without breaks', async () => {
    const route = await routeOf([[0, 100], [5, 400], [10, 400]]);
    const [c] = climbsOf(climbCheck(route, { flatKph: 22 }));
    expect(c!.ridingMin).toBeCloseTo(ridingMin(route, c!.startKm, c!.topKm, 22), 6);
    // 5 km plus 4 km for each 100 m up (17 effort-km) at 82% of 22 km/h: about 57 min.
    expect(c!.ridingMin!).toBeGreaterThan(55);
    expect(c!.ridingMin!).toBeLessThan(58);
  });

  test('a flat speed that gives no time gives no time, never a figure', async () => {
    const route = await routeOf([[0, 100], [5, 400], [10, 400]]);
    for (const kph of [Number.NaN, 5, 60]) expect(climbsOf(climbCheck(route, { flatKph: kph }))[0]!.ridingMin).toBeNull();
  });

  test('shown to 5 minutes, never under 5', () => {
    expect([0.5, 2.4, 7.4, 7.6, 47.2, 62.6, 121].map(shownClimbMin)).toEqual([5, 5, 5, 10, 45, 65, 120]);
  });
});

describe('[CC-WALK] steady, steep or likely a walk, by the steepest 500 m', () => {
  test(`under ${CLIMB_STEEP_PCT}% steady; from ${CLIMB_STEEP_PCT}% steep; from ${CLIMB_WALK_PCT}% likely a walk with a loaded bike`, () => {
    expect([CLIMB_STEEP_PCT, CLIMB_WALK_PCT]).toEqual([8, 12]);
    expect([0, 5, 7.99, 8, 10, 11.99, 12, 15, 25].map((p) => climbLevel(p))).toEqual(['steady', 'steady', 'steady', 'steep', 'steep', 'steep', 'walk', 'walk', 'walk']);
  });

  test('a steep short hill on a route is likely a walk', async () => {
    // 150 m over 1 km: 15%.
    const route = await routeOf([[0, 100], [3, 100], [4, 250], [8, 250]]);
    const [c] = climbsOf(climbCheck(route, { flatKph: 20 }));
    expect(c!.steepestPct).toBeGreaterThanOrEqual(12);
    expect(c!.level).toBe('walk');
  });
});

describe('[CC-EBIKE] a bike with a motor gets no walk judgement', () => {
  test('the walk level is not given; steep stays steep', async () => {
    expect([7, 9, 12, 20].map((p) => climbLevel(p, true))).toEqual(['steady', 'steep', 'steep', 'steep']);
    const route = await routeOf([[0, 100], [3, 100], [4, 250], [8, 250]]);
    expect(climbsOf(climbCheck(route, { flatKph: 20, ebike: true })).map((c) => c.level)).toEqual(['steep']);
  });
});

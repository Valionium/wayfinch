import { describe, expect, test as plain } from 'vitest';
import { haversineKm } from '../../../../src/core/geo/haversine.ts';
import { GpxError } from '../../../../src/core/route/gpx.ts';
import type { RawPoint } from '../../../../src/core/route/gpx.ts';
import { routeHash } from '../../../../src/core/route/hash.ts';
import { buildRoute } from '../../../../src/core/route/profile.ts';
import { planStages } from '../../../../src/core/route/stages.ts';
import { pointAtKm } from '../../../fixtures/build.ts';
import { rawAt, routeOf, sampled } from '../../../fixtures/route.ts';

describe('buildRoute', () => {
  plain('rounds every point once, then takes kilometres from the haversine running totals of the rounded points', async () => {
    const raw: RawPoint[] = [{ lat: 49.12345678, lon: 8.12345678, ele: 100.004 }, { lat: 49.2, lon: 8.1, ele: 130.126 }, { lat: 49.3, lon: 8.2, ele: 129 }];
    const r = await buildRoute(raw, 'Ride', 'gpx');
    expect(r.points[0]).toEqual({ lat: 49.123457, lon: 8.123457, ele: 100, km: 0 });
    expect(r.points[1]!.ele).toBe(130.13);
    expect(r.points[1]!.km).toBe(haversineKm(r.points[0]!, r.points[1]!));
    expect(r.points[2]!.km).toBe(r.points[1]!.km + haversineKm(r.points[1]!, r.points[2]!));
    expect(r.lengthKm).toBe(r.points[2]!.km);
    expect(r.name).toBe('Ride');
    expect(r.source).toBe('gpx');
  });

  plain('a recording with 7 decimals gives the same route and hash as the same recording already rounded to 6', async () => {
    const seven: RawPoint[] = Array.from({ length: 40 }, (_, i) => ({ lat: 49.1234567 + i * 0.0012345, lon: 8.7654321 - i * 0.0009876, ele: 100.123 + i }));
    const six = seven.map((p) => ({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6, ele: Math.round(p.ele! * 100) / 100 }));
    const a = await buildRoute(seven, 'a', 'gpx');
    const b = await buildRoute(six, 'a', 'gpx');
    expect(a.hash).toBe(b.hash);
    expect(a.lengthKm).toBe(b.lengthKm);
  });

  plain('the hash is the route hash of the rounded points, and stages and the grid wait for the trip', async () => {
    const r = await routeOf(sampled(30, 1, (km) => 100 + km));
    expect(r.hash).toBe(await routeHash(r.points));
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.stages).toEqual([]);
    expect(r.sampleGrid).toEqual([]);
    expect(r.id.length).toBeGreaterThan(0);
  });

  plain('ascent is rounded to 10 m, and is null as soon as one height is missing', async () => {
    expect((await routeOf(sampled(30, 0.5, (km) => 100 + 7.3 * km))).ascentM).toBe(220);
    expect((await routeOf([[0, 100], [5, null], [10, 300]])).ascentM).toBeNull();
    expect((await routeOf(sampled(10, 1, null))).ascentM).toBeNull();
    expect((await routeOf(sampled(10, 1, () => 100))).ascentM).toBe(0);
  });

  plain('two sections add no distance across the gap, and each counts its own climbing', async () => {
    const a = rawAt([[0, 100], [5, 400]]);
    const b = rawAt([[20, 100], [25, 400]]).map((p, i) => (i === 0 ? { ...p, break: true as const } : p));
    const r = await buildRoute([...a, ...b], 'two', 'gpx');
    expect(r.lengthKm).toBeCloseTo(10, 2);
    expect(r.points[2]!.km).toBe(r.points[1]!.km);
    expect(r.ascentM).toBe(600);
  });

  plain('a track of more than 100,000 km is refused, a long one is not', async () => {
    const hop = (i: number): RawPoint => ({ lat: 0, lon: i % 2 === 0 ? -90 : 90, ele: null });
    await expect(buildRoute([hop(0), hop(1), hop(2)], 'ok', 'gpx')).resolves.toBeDefined();
    await expect(buildRoute(Array.from({ length: 12 }, (_, i) => hop(i)), 'long', 'gpx')).rejects.toBeInstanceOf(GpxError);
  });
});

describe('[LOC-DUP-POINTS] degenerate routes', () => {
  plain('repeated points leave the length unchanged and give finite kilometres, stages and ascent', async () => {
    const base: [number, number][] = [[0, 100], [3, 250], [6, 120], [9, 300], [12, 310]];
    const once = await routeOf(base);
    const dup = await buildRoute(base.flatMap(([km, ele]) => { const p = { ...pointAtKm(km), ele }; return [p, p, p]; }), 'dups', 'planned');
    expect(dup.lengthKm).toBe(once.lengthKm);
    expect(dup.ascentM).toBe(once.ascentM);
    expect(dup.points.every((p) => Number.isFinite(p.km))).toBe(true);
    for (const nights of [0, 1, 2]) {
      const plan = planStages(dup, { flatKph: 25, pace: 'sporting', nights });
      expect(plan).toHaveLength(nights + 1);
      expect(plan.every((s) => Number.isFinite(s.endKm) && Number.isFinite(s.ridingHours) && (s.ascentM === null || Number.isFinite(s.ascentM)))).toBe(true);
      expect(plan.at(-1)!.endKm).toBe(dup.lengthKm);
    }
  });

  plain('a route of one point repeated has length 0 and still plans', async () => {
    const p = { ...pointAtKm(5), ele: 100 };
    const r = await buildRoute([p, p, p, p], 'still', 'planned');
    expect(r.lengthKm).toBe(0);
    const plan = planStages(r, { flatKph: 25, pace: 'sporting', nights: 1 });
    expect(plan.every((s) => s.endKm === 0 && Number.isFinite(s.ridingHours))).toBe(true);
  });

  plain('a 0.4 km route gives one honest stage and a finite ascent', async () => {
    // 60 m up in 0.4 km costs 2.4 km of effort on top of the 0.4 km.
    const r = await routeOf([[0, 100], [0.2, 130], [0.4, 160]]);
    expect(r.lengthKm).toBeCloseTo(0.4, 3);
    expect(Number.isFinite(r.ascentM!)).toBe(true);
    const plan = planStages(r, { flatKph: 25, pace: 'sporting', nights: 0 });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.endKm).toBe(r.lengthKm);
    expect(plan[0]!.ridingHours).toBeCloseTo(2.8 / 20.5, 3);
  });
});

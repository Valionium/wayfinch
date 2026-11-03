import { describe, expect, test } from 'vitest';
import { planStages } from '../../../src/core/route/stages.ts';
import { GpxError } from '../../../src/core/route/gpx.ts';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { W } from '../../../src/core/wording/en.ts';
import { planned, profileOf, routeFromGpx, summaryOf, tripRuns } from '../../../src/ui/trip/model.ts';
import type { Trip } from '../../../src/core/types.ts';
import { fixtureGpx, gpxText } from '../../fixtures/gpx.ts';
import { loadFixtureRoute } from '../../fixtures/packs/index.ts';
import { parseXml } from '../../fixtures/route.ts';

const tripOf = (route: Trip['route'], extra: Partial<Trip> = {}): Trip => ({
  route, departureDate: null, startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, pace: 'sporting', ...extra,
});

describe('Add a route and the summary (spec section 3.3)', () => {
  test('[TRIP-GPX] the 165 km fixture as a file: distance, climbing, profile and daily stages are those of planStages', async () => {
    const { route, hadHeights } = await routeFromGpx(await fixtureGpx('heidelberg-strasbourg'), 'ride.gpx', parseXml);
    expect(hadHeights).toBe(true);
    expect(route.lengthKm).toBeGreaterThan(120);
    const withDays = planned(route, { flatKph: 25, pace: 'sporting', nights: null });
    const suggested = planStages(route, { flatKph: 25, pace: 'sporting', nights: 0 }).suggestedNights;
    const expected = planStages(route, { flatKph: 25, pace: 'sporting', nights: suggested });
    expect(withDays.stages).toEqual([...expected]);
    const s = summaryOf(tripOf(withDays), { nights: null, day1LeaveBy: null });
    expect(s.distance).toBe(`${Math.round(route.lengthKm * 10) / 10} km`);
    expect(s.climbing).toMatch(/^[\d,]+ m climbing$/);
    expect(s.profile).not.toBeNull();
    expect(s.stages).toHaveLength(expected.length);
    expect(s.stages[0]!.text).toBe(`Day 1 · ${Math.round((expected[0]!.endKm - expected[0]!.startKm) * 10) / 10} km`);
    // A fresh route takes the stage model's suggested nights, and the grid is made with the days.
    expect(withDays.sampleGrid.length).toBeGreaterThan(5);
  });

  test('[TRIP-GPX] the route is named from the file when the track has no name, and never empty', async () => {
    const points = (await loadFixtureRoute('loop')).points;
    expect((await routeFromGpx(gpxText(points, ''), 'Sunday loop.gpx', parseXml)).route.name).toBe('Sunday loop');
    expect((await routeFromGpx(gpxText(points, 'Named'), 'x.gpx', parseXml)).route.name).toBe('Named');
    expect((await routeFromGpx(gpxText(points, ''), '', parseXml)).route.name).toBe(W.appTripUnnamed);
  });

  test('[TRIP-GPX-BAD] each GPX refusal keeps its own plain message, and nothing else is thrown', async () => {
    const reasons = new Map<string, string>();
    const bad: [string, string][] = [
      ['unreadable', 'not xml at all'],
      ['unreadable', '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>'],
      ['too-large', 'x'.repeat(21 * 1024 * 1024)],
      ['too-many-points', gpxText(Array.from({ length: 200_001 }, (_, i) => ({ lat: 48 + i * 1e-7, lon: 8 })))],
    ];
    for (const [reason, text] of bad) {
      const e = await routeFromGpx(text, 'a.gpx', parseXml).then(() => null, (x: unknown) => x);
      expect(e, reason).toBeInstanceOf(GpxError);
      expect((e as GpxError).reason).toBe(reason);
      reasons.set(reason, (e as GpxError).message);
    }
    expect(new Set(reasons.values()).size).toBe(reasons.size);
    expect(reasons.get('too-large')).toBe(W.routeGpxTooLarge);
  });

  test('[TRIP-SUMMARY] the day rows read "Day 1 · 78 km", the day before departure adds "leave by about 13:45", and a route without heights says so', async () => {
    const { route } = await routeFromGpx(await fixtureGpx('multi-day-800'), 'a.gpx', parseXml);
    const withDays = planned(route, { flatKph: 25, pace: 'sporting', nights: 3 });
    const s = summaryOf(tripOf(withDays), { nights: 3, day1LeaveBy: 'about 13:45' });
    expect(s.stages).toHaveLength(4);
    expect(s.stages[0]!.text).toMatch(/^Day 1 · [\d.]+ km · leave by about 13:45$/);
    expect(s.stages[1]!.text).toMatch(/^Day 2 · [\d.]+ km$/);
    expect(s.stages[1]!.detail).toMatch(/^[\d.]+ h riding(, [\d,]+ m up)?$/);
    expect(s.note).toBeNull();

    const bare = planned(await buildRoute((await loadFixtureRoute('loop')).points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null })), 'Flat', 'gpx'), { flatKph: 25, pace: 'sporting', nights: 1 });
    const unknown = summaryOf(tripOf(bare), { nights: 1, day1LeaveBy: null });
    expect(unknown.climbing).toBe(W.appTripClimbingUnknown);
    expect(unknown.profile).toBeNull();
    expect(unknown.note).toBe(W.appTripByDistance);
  });

  test('[TRIP-SUMMARY] the profile is a drawing of the heights with its lowest and highest named', async () => {
    const { route } = await routeFromGpx(await fixtureGpx('alpine-pass'), 'a.gpx', parseXml);
    const p = profileOf(route)!;
    const heights = route.points.map((x) => x.ele!);
    expect(p.minM).toBe(Math.round(Math.min(...heights)));
    expect(p.maxM).toBe(Math.round(Math.max(...heights)));
    expect(p.path.startsWith('M')).toBe(true);
    expect(p.path.split('L').length).toBeLessThanOrEqual(121);
  });
});

describe('Which screen the app opens on (spec section 3.1)', () => {
  const base = { prepared: true, departureDate: '2026-10-17', days: 3, today: '2026-10-17', lastPositionAt: null, now: new Date('2026-10-17T10:00:00Z') };

  test('[TRIP-FIRST] no prepared trip: Trip first, however the dates fall', () => {
    expect(tripRuns({ ...base, prepared: false })).toBe(false);
    expect(tripRuns({ ...base, prepared: false, departureDate: null })).toBe(false);
  });

  test('[TRIP-FIRST] a prepared trip runs from its departure date to the day after its planned end', () => {
    expect(tripRuns({ ...base, today: '2026-10-16' })).toBe(false);
    expect(tripRuns(base)).toBe(true);
    expect(tripRuns({ ...base, today: '2026-10-19' })).toBe(true);
    expect(tripRuns({ ...base, today: '2026-10-20' })).toBe(true);
    expect(tripRuns({ ...base, today: '2026-10-21' })).toBe(false);
  });

  test('[TRIP-FIRST] a prepared trip with only a month (no date) counts as running', () => {
    expect(tripRuns({ ...base, departureDate: null })).toBe(true);
  });

  test('[TRIP-FIRST] outside the dates, a position accepted in the last 24 hours makes it run; an older one does not', () => {
    const outside = { ...base, today: '2026-11-30' };
    expect(tripRuns(outside)).toBe(false);
    expect(tripRuns({ ...outside, lastPositionAt: new Date(base.now.getTime() - 23 * 3_600_000) })).toBe(true);
    expect(tripRuns({ ...outside, lastPositionAt: new Date(base.now.getTime() - 25 * 3_600_000) })).toBe(false);
  });
});

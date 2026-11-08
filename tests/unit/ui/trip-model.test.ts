import { describe, expect, test } from 'vitest';
import { planStages } from '../../../src/core/route/stages.ts';
import { GpxError } from '../../../src/core/route/gpx.ts';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { W } from '../../../src/core/wording/en.ts';
import { planned, profileOf, profileY, routeDoneLine, summaryOf, tripLineOf, tripRuns } from '../../../src/ui/trip/model.ts';
import { routeFromGpx } from '../../../src/ui/trip/read-gpx.ts';
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
    const s = summaryOf(tripOf(withDays), { day1LeaveBy: null });
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
    const s = summaryOf(tripOf(withDays), { day1LeaveBy: 'about 13:45' });
    expect(s.stages).toHaveLength(4);
    expect(s.stages[0]!.text).toMatch(/^Day 1 · [\d.]+ km · leave by about 13:45$/);
    expect(s.stages[1]!.text).toMatch(/^Day 2 · [\d.]+ km$/);
    expect(s.stages[1]!.detail).toMatch(/^[\d.]+ h riding(, [\d,]+ m up)?$/);
    expect(s.note).toBeNull();

    const bare = planned(await buildRoute((await loadFixtureRoute('loop')).points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null })), 'Flat', 'gpx'), { flatKph: 25, pace: 'sporting', nights: 1 });
    const unknown = summaryOf(tripOf(bare), { day1LeaveBy: null });
    expect(unknown.climbing).toBe(W.appTripClimbingUnknown);
    expect(unknown.profile).toBeNull();
    expect(unknown.note).toBe(W.appTripByDistance);
  });

  test('[TRIP-SUMMARY] the days shown are the stored ones, never a recomputation: what Ahead reads is what Trip shows', async () => {
    const { route } = await routeFromGpx(await fixtureGpx('multi-day-800'), 'a.gpx', parseXml);
    const stored = planned(route, { flatKph: 25, pace: 'steady', nights: 2 });
    const s = summaryOf(tripOf(stored, { pace: 'hard', flatKph: 40 }), { day1LeaveBy: null });
    expect(s.stages).toHaveLength(3);
    expect(s.stages[0]!.text).toBe(`Day 1 · ${Math.round((stored.stages[0]!.endKm - stored.stages[0]!.startKm) * 10) / 10} km`);
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

  test('[TRIP-FIRST] a prepared trip with no date and no month never counts as running, so Trip opens', () => {
    expect(tripRuns({ ...base, departureDate: null })).toBe(false);
    expect(tripRuns({ ...base, departureDate: null, today: '2027-03-01' })).toBe(false);
  });

  test('[TRIP-FIRST] outside the dates, a position accepted in the last 24 hours makes it run; an older one does not', () => {
    const outside = { ...base, today: '2026-11-30' };
    expect(tripRuns(outside)).toBe(false);
    expect(tripRuns({ ...outside, lastPositionAt: new Date(base.now.getTime() - 23 * 3_600_000) })).toBe(true);
    expect(tripRuns({ ...outside, lastPositionAt: new Date(base.now.getTime() - 25 * 3_600_000) })).toBe(false);
  });
});

describe('The guided Trip (design of 8 Nov 2026)', () => {
  const twoDays = async (): Promise<Trip['route']> => {
    const { route } = await routeFromGpx(await fixtureGpx('heidelberg-strasbourg'), 'ride.gpx', parseXml);
    return planned(route, { flatKph: 25, pace: 'sporting', nights: 2 });
  };

  test('[TRIP-LINE] the trip line says where the rider is in time: before, on each day, after the last day, without a date, without a trip', async () => {
    const route = await twoDays();
    expect(route.stages).toHaveLength(3);
    const at = (departureDate: string | null, today: string) => tripLineOf(tripOf(route, { departureDate }), today);
    expect(at('2026-11-14', '2026-11-08')).toEqual({ name: route.name, when: 'Starts Sat 14 Nov, in 6 days' });
    expect(at('2026-11-14', '2026-11-13').when).toBe('Starts tomorrow, Sat 14 Nov');
    expect(at('2026-11-14', '2026-11-14').when).toBe('Starts today');
    expect(at('2026-11-14', '2026-11-15').when).toBe('Day 2 of 3');
    expect(at('2026-11-14', '2026-11-16').when).toBe('Day 3 of 3');
    expect(at('2026-11-14', '2026-11-17').when).toBe('Ended on Mon 16 Nov');
    expect(at(null, '2026-11-08').when).toBe(W.appTripLineNoDate);
    expect(tripLineOf(null, '2026-11-08')).toEqual({ name: W.appTripNoTrip, when: null });
  });

  test('[TRIP-STEPS] the Route step folds to "165 km · 1,240 m up · 2 days": the distance, the climbing and the stage model\'s days', async () => {
    const route = await twoDays();
    const line = routeDoneLine(tripOf(route));
    expect(line).toBe(`${Math.round(route.lengthKm * 10) / 10} km · ${String(route.ascentM).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} m up · 3 days`);
    expect(routeDoneLine(tripOf({ ...route, ascentM: null, stages: route.stages.slice(0, 1) }))).toMatch(/ km · climbing unknown · 1 day$/);
  });
});

describe('The stops on the height profile (guided Trip design §6)', () => {
  test('[TRIP-STOPS] an icon sits on the profile line: at its km, at the height there, in the profile\'s own box', async () => {
    const { route: full } = await routeFromGpx(await fixtureGpx('alpine-pass'), 'ride.gpx', parseXml);
    // At most 120 points, so the line is drawn through every one of them (the drawn line is what an icon sits on: review of PR 73,
    // M1) and the highest and lowest points are on it: exactly 2 and 70 in the 72 box.
    const every = Math.ceil(full.points.length / 120);
    const route = { ...full, points: full.points.filter((_, i) => i % every === 0 || i === full.points.length - 1) };
    expect(route.points.length).toBeLessThanOrEqual(120);
    const box = profileOf(route)!;
    const top = route.points.reduce((a, b) => (b.ele! > a.ele! ? b : a));
    const low = route.points.reduce((a, b) => (b.ele! < a.ele! ? b : a));
    expect(profileY(route, top.km)).toBeCloseTo(2, 0);
    expect(profileY(route, low.km)).toBeCloseTo(70, 0);
    expect(box.maxM).toBe(Math.round(top.ele!));
    expect(profileY({ ...route, points: route.points.map((p) => ({ ...p, ele: null })) }, 3)).toBeNull();
  });
});

describe('What the review of PR 73 found', () => {
  test('[TRIP-STOPS] the icon’s height is the drawn line’s: within half a unit of the path at 400 kilometres on each fixture', async () => {
    for (const id of ['heidelberg-strasbourg', 'multi-day-800', 'alpine-pass'] as const) {
      const { route } = await routeFromGpx(await fixtureGpx(id), 'ride.gpx', parseXml);
      const pts = [...profileOf(route)!.path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
      for (let n = 0; n <= 400; n++) {
        const km = (route.lengthKm * n) / 400;
        const x = (km / route.lengthKm) * 300;
        const k = Math.max(1, pts.findIndex(([px]) => px >= x));
        const [a, b] = [pts[k - 1]!, pts[k]!];
        const drawn = b[0] > a[0] ? a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]) : a[1];
        expect(Math.abs(profileY(route, km)! - drawn), `${id} at km ${km.toFixed(1)}`).toBeLessThan(0.5);
      }
    }
  });
});

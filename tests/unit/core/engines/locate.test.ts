import { expect, test } from 'vitest';
import { bearingDeg, compass8 } from '../../../../src/core/geo/bearing.ts';
import { buildSegmentIndex } from '../../../../src/core/geo/index.ts';
import { pointAtRouteKm } from '../../../../src/core/geo/project.ts';
import { adjusted, isFarOff, isOffRoute, latestPosition, locate, manualPosition, rejoinKm } from '../../../../src/core/engines/locate.ts';
import type { Position, Route } from '../../../../src/core/types.ts';
import { at, flatRoute, pointAtKm, pos } from '../../../fixtures/build.ts';

const AT = at('2026-10-17 12:00');
const fix = (km: number, off = 0, accuracyM = 10, when = AT) => ({ ...pointAtKm(km, off), accuracyM, at: when });

/** Out to km 75 and back along the same line: km 32 and km 118 are the same spot. */
function outAndBack(): Route {
  const points = [];
  for (let k = 0; k <= 150; k++) points.push({ ...pointAtKm(k <= 75 ? k : 150 - k), ele: 100, km: k });
  return { ...flatRoute(150), points, lengthKm: 150 };
}

function located(route: Route, f: ReturnType<typeof fix>, recent: Position | null = null): Position {
  const r = locate(f, route, buildSegmentIndex(route), recent);
  if (r.kind !== 'position') throw new Error('expected a position');
  return r.position;
}

test('[LOC-PROJECT] half way along a long segment on the 49-50 degree line reads exactly half', () => {
  const route = flatRoute(100);
  const a = route.points[0]!;
  const b = route.points[route.points.length - 1]!;
  const line: Route = { ...route, points: [a, b] };
  const half = { lat: (a.lat + b.lat) / 2, lon: a.lon, accuracyM: 10, at: AT };
  expect(located(line, half).km).toBeCloseTo(50, 9);
  // Half a segment of the 1 km grid: the running total to km 30 plus half a kilometre.
  expect(located(route, fix(30.5)).km).toBeCloseTo(30.5, 6);
});

test('[LOC-PROJECT] the kilometre comes from the running totals, not from a fresh measure', () => {
  const route = flatRoute(10);
  // Running totals that disagree with the geometry on purpose: only the totals may count.
  const stretched: Route = { ...route, points: route.points.map((p) => ({ ...p, km: p.km * 2 })), lengthKm: 20 };
  expect(located(stretched, fix(3.5)).km).toBeCloseTo(7, 6);
});

test('[LOC-PROJECT] repeated points do not break the projection', () => {
  const route = flatRoute(4);
  const dup: Route = { ...route, points: [route.points[0]!, route.points[1]!, route.points[1]!, route.points[2]!, route.points[3]!, route.points[4]!] };
  const p = located(dup, fix(1.5));
  expect(p.km).toBeCloseTo(1.5, 6);
  expect(Number.isFinite(p.offRouteM)).toBe(true);
});

test('[LOC-PROJECT] a fix far from the route still finds the nearest point, 200 km away', () => {
  const route = flatRoute(100);
  const p = located(route, fix(40, 200_000));
  // Meridians converge, so the nearest point lies a little north of the fix's own latitude.
  expect(p.km).toBeGreaterThan(40);
  expect(p.km).toBeLessThan(46);
  expect(p.offRouteM).toBeGreaterThan(199_000);
});

test('[LOC-PROJECT] a long single segment is found through the index in its middle', () => {
  const route = flatRoute(100);
  const line: Route = { ...route, points: [route.points[0]!, route.points[100]!] };
  expect(located(line, fix(61, 150)).km).toBeCloseTo(61, 1);
});

test('[LOC-AMBIG] with a position from 2 h ago at km 30, candidates km 32 and km 118 pick km 32', () => {
  const route = outAndBack();
  const recent = pos({ km: 30, at: '2026-10-17 10:00' });
  expect(located(route, fix(32), recent).km).toBeCloseTo(32, 6);
});

test('[LOC-AMBIG] a recent position further on picks the way back', () => {
  const route = outAndBack();
  const recent = pos({ km: 110, at: '2026-10-17 10:00' });
  expect(located(route, fix(32), recent).km).toBeCloseTo(118, 6);
});

test('[LOC-AMBIG] with no recent position it asks once, km 32 or km 118', () => {
  const route = outAndBack();
  const r = locate(fix(32), route, buildSegmentIndex(route), null);
  expect(r.kind).toBe('ask');
  if (r.kind !== 'ask') return;
  expect(r.options[0]).toBeCloseTo(32, 6);
  expect(r.options[1]).toBeCloseTo(118, 6);
});

test('[LOC-AMBIG] a position older than 3 hours does not settle it, and exactly 3 hours does', () => {
  const route = outAndBack();
  const old = pos({ km: 30, at: '2026-10-17 08:59' });
  expect(locate(fix(32), route, buildSegmentIndex(route), old).kind).toBe('ask');
  const three = pos({ km: 30, at: '2026-10-17 09:00' });
  expect(locate(fix(32), route, buildSegmentIndex(route), three).kind).toBe('position');
});

test('[LOC-AMBIG] when neither candidate is reachable at 40 km/h it asks', () => {
  const route = outAndBack();
  const recent = pos({ km: 75, at: '2026-10-17 11:00' }); // 43 km both ways, one hour ago
  expect(locate(fix(32), route, buildSegmentIndex(route), recent).kind).toBe('ask');
});

test('[LOC-AMBIG] a candidate within 200 m of the closest one counts, and one farther does not', () => {
  // Two parallel passes 150 m apart, then 250 m apart: the fix lies on the first pass.
  const twoPasses = (gapM: number): Route => {
    const points = [
      { ...pointAtKm(0), ele: 1, km: 0 }, { ...pointAtKm(10), ele: 1, km: 10 },
      { ...pointAtKm(10, gapM), ele: 1, km: 10 + gapM / 1000 }, { ...pointAtKm(0, gapM), ele: 1, km: 20 + gapM / 1000 },
    ];
    return { ...flatRoute(20), points, lengthKm: points[3]!.km };
  };
  const near = twoPasses(150);
  expect(locate(fix(5), near, buildSegmentIndex(near), null).kind).toBe('ask');
  const far = twoPasses(250);
  expect(located(far, fix(5)).km).toBeCloseTo(5, 6);
});

test('[LOC-OFFROUTE] off route when farther than max(300 m, accuracy)', () => {
  const route = flatRoute(100);
  const off = (m: number, acc = 10): boolean => isOffRoute(located(route, fix(50, m, acc)));
  expect(off(300)).toBe(false);
  expect(off(301)).toBe(true);
  expect(off(350, 400)).toBe(false);
  expect(off(401, 400)).toBe(true);
});

test('[LOC-OFFROUTE] the distance off the route is in metres by haversine, and a rejoin leg is 1.3 times it', () => {
  const route = flatRoute(100);
  expect(located(route, fix(50, 300)).offRouteM).toBeCloseTo(300, 1);
  expect(rejoinKm(2000)).toBeCloseTo(2.6, 12);
});

test('[LOC-FAR] beyond 5 km off the banner flag is set: 5.0 km no, 5.1 km yes', () => {
  const route = flatRoute(100);
  expect(isFarOff(located(route, fix(50, 5000)))).toBe(false);
  expect(isFarOff(located(route, fix(50, 5100)))).toBe(true);
});

test('[LOC-APPROX] plus or minus 800 m at km 76: ahead from km 75.2, behind from km 76.8, km 76.3 in the radius', () => {
  const route = flatRoute(100);
  const p = located(route, fix(76, 0, 800));
  expect(p.approximate).toBe(true);
  const a = adjusted(p);
  expect(a.aheadFromKm).toBeCloseTo(75.2, 6);
  expect(a.behindFromKm).toBeCloseTo(76.8, 6);
  expect(a.radius).not.toBeNull();
  expect(a.radius![0]).toBeLessThan(76.3);
  expect(a.radius![1]).toBeGreaterThan(76.3);
});

test('[LOC-APPROX] accuracy 500 m is not approximate, 501 m is', () => {
  const route = flatRoute(100);
  const exact = located(route, fix(76, 0, 500));
  expect(exact.approximate).toBe(false);
  expect(adjusted(exact)).toEqual({ aheadFromKm: exact.km, behindFromKm: exact.km, radius: null });
  expect(located(route, fix(76, 0, 501)).approximate).toBe(true);
});

test('[LOC-APPROX] the near edge never lies before the route start', () => {
  const route = flatRoute(100);
  expect(adjusted(located(route, fix(0.3, 0, 800))).aheadFromKm).toBe(0);
});

test('[LOC-MANUAL] a manual position lies on the route, is exact, and always wins over GPS', () => {
  const route = flatRoute(100);
  const m = manualPosition(route, 42.5, AT)!;
  expect(m).toMatchObject({ km: 42.5, offRouteM: 0, source: 'manual', approximate: false });
  const here = pointAtKm(42.5);
  expect(m.lat).toBeCloseTo(here.lat, 6);
  expect(m.lon).toBeCloseTo(here.lon, 6);
  expect(isOffRoute(m)).toBe(false);
  // An earlier fix or one of the same second: the manual pick is the latest.
  const gpsSame = pos({ km: 80, at: '2026-10-17 12:00' });
  const gpsEarlier = pos({ km: 80, at: '2026-10-17 11:00' });
  expect(latestPosition([m, gpsSame])).toBe(m);
  expect(latestPosition([gpsSame, m])).toBe(m);
  expect(latestPosition([gpsEarlier, m])).toBe(m);
  // It settles an ambiguous fix like any position.
  const oab = outAndBack();
  const r = locate(fix(32), oab, buildSegmentIndex(oab), manualPosition(oab, 115, at('2026-10-17 11:00'))!);
  expect(r.kind === 'position' ? r.position.km : -1).toBeCloseTo(118, 6);
});

test('[LOC-MANUAL] a manual kilometre beyond the route is held to the route', () => {
  const route = flatRoute(100);
  expect(manualPosition(route, 130, AT)!.km).toBe(100);
  expect(manualPosition(route, -3, AT)!.km).toBe(0);
});

test('[LOC-PROJECT] a route kilometre gives its point between two route points', () => {
  const p = pointAtRouteKm(flatRoute(10), 3.5);
  expect(p.lat).toBeCloseTo(pointAtKm(3.5).lat, 9);
  expect(p.lon).toBeCloseTo(pointAtKm(3.5).lon, 9);
});

test('[EM-COMPASS] bearings read as eight compass words', () => {
  expect(compass8(22.4)).toBe('north');
  expect(compass8(22.6)).toBe('north-east');
  expect(compass8(359)).toBe('north');
  expect(compass8(180)).toBe('south');
  expect(compass8(270)).toBe('west');
  expect(bearingDeg(pointAtKm(0), pointAtKm(10))).toBeCloseTo(0, 6);
  expect(bearingDeg(pointAtKm(10), pointAtKm(0))).toBeCloseTo(180, 6);
  expect(bearingDeg(pointAtKm(10), pointAtKm(10, 1000))).toBeCloseTo(90, 1);
});

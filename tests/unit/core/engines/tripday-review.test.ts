// Cases from the review of group 2: the kept day start, an unusable flat speed, and bad values from the phone.
import { expect, test } from 'vitest';
import { buildSegmentIndex, segmentsNear } from '../../../../src/core/geo/index.ts';
import { arrivalStatus, daylightLeft } from '../../../../src/core/engines/daylight.ts';
import { adjusted, locate, manualPosition } from '../../../../src/core/engines/locate.ts';
import { buildSchedule, clockMin, correction, flatLegClockMin, ridingMin, usableFlatKph } from '../../../../src/core/engines/pace.ts';
import { daylightAt, dayRide, nowSchedule, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import { matchPlaces } from '../../../../src/core/route/matches.ts';
import type { DayRide, DayStart, PlanTomorrow, Position, Trip } from '../../../../src/core/types.ts';
import { at, flatRoute, pointAtKm, pos, sun, tap, testTrip, zoneAt, zonesOf } from '../../../fixtures/build.ts';

const SAT = '2026-10-17';
const SUN = '2026-10-18';
const MON = '2026-10-19';
const CLOCK_PER_KM = (60 / 20.5) * 1.15;
const MIN = 60_000;
const BERLIN = 'Europe/Berlin';
const env = { sun: sun(), routeZones: zonesOf(300) };
const env18 = { sun: sun({ sunset: '18:00', dusk: '18:35' }), routeZones: zonesOf(300) };

function day(positions: Position[], now: string, kept: DayStart[] = [], plan: PlanTomorrow | null = null): DayRide {
  return dayRide(testTrip(), positions, plan, null, at(now), env, kept);
}
const invalid = new Date(NaN);
const isInvalid = (d: Date): boolean => Number.isNaN(d.getTime());

// ---- the kept day start (sections 4.4 and 6.2a) -----------------------------------------------------------------------

test('[DAY-START] the day start is kept: it does not move when the night position expires', () => {
  const night = pos({ km: 30, at: `${SAT} 11:00` });
  const today = pos({ km: 45, at: `${MON} 10:30` });
  const before = day([night, today], `${MON} 10:59`);
  expect(before.phase).toBe('riding');
  expect(before.stopKm).toBe(78);
  expect(before.keepDayStart).toEqual({ day: MON, km: 30 });
  // The store has dropped the night position, as section 4.4 says, and kept the day start.
  const after = day([today], `${MON} 11:01`, [before.keepDayStart!]);
  expect(after.phase).toBe('riding');
  expect(after.dayStartKm).toBe(30);
  expect(after.stopKm).toBe(78);
  // The same with the expired position still in the list.
  expect(day([night, today], `${MON} 11:01`, [before.keepDayStart!]).stopKm).toBe(78);
});

test('[DAY-START] with no position today the start stays where it was, not the stage start', () => {
  const night = pos({ km: 76.5, at: `${SAT} 11:00` });
  const morning = day([night], `${MON} 10:00`);
  expect(morning.dayStartKm).toBe(76.5);
  const later = day([], `${MON} 12:00`, [morning.keepDayStart!]);
  expect(later.dayStartKm).toBe(76.5);
  expect(later.startKm).toBe(76.5);
  expect(later.stopKm).toBe(150);
  expect(later.note).toBeNull();
});

test('[DAY-START] a kept start beats a fresher position far off the route', () => {
  const r = day([pos({ km: 200, off: 8000, at: `${SUN} 20:00` })], `${MON} 11:01`, [{ day: MON, km: 30 }]);
  expect(r.dayStartKm).toBe(30);
});

test('[DAY-START] a first position before the daily start still moves a kept start: a night further along', () => {
  const r = day([pos({ km: 76.5, at: `${MON} 07:10` })], `${MON} 07:10`, [{ day: MON, km: 35 }]);
  expect(r.dayStartKm).toBe(76.5);
  expect(r.stopKm).toBe(150);
  expect(r.keepDayStart).toEqual({ day: MON, km: 76.5 });
});

test('[DAY-START] a start kept for another date, a bad one, or on day 1 is not read', () => {
  const stale = [{ day: SUN, km: 10 }, { day: MON, km: Number.NaN }];
  expect(day([], `${MON} 10:00`, stale).dayStartKm).toBe(150);
  expect(day([], `${SAT} 07:00`, [{ day: SAT, km: 40 }]).dayStartKm).toBe(0);
});

test('[DAY-START] the stage start and a far-off first position are provisional, so they are not to be kept', () => {
  expect(day([], `${MON} 10:00`).keepDayStart).toBeNull();
  expect(day([pos({ km: 200, off: 8000, at: `${MON} 09:00` })], `${MON} 10:00`).keepDayStart).toBeNull();
  expect(day([], '2026-10-16 10:00').keepDayStart).toBeNull();
  expect(day([pos({ km: 45, at: `${MON} 10:30` })], `${MON} 10:30`).keepDayStart).toEqual({ day: MON, km: 45 });
});

// ---- an unusable flat speed --------------------------------------------------------------------------------------------

const BAD = [-20, Infinity, -Infinity, 0, Number.NaN, 14.9, 40.1, 1e300];

test('[PACE-RIDING] a flat speed outside 15-40 km/h gives no time at all, and 15 and 40 still do', () => {
  const route = flatRoute(90);
  for (const bad of BAD) {
    expect(usableFlatKph(bad)).toBe(false);
    expect(ridingMin(route, 0, 90, bad)).toBeNaN();
    expect(clockMin(route, 0, 90, bad)).toBeNaN();
    expect(flatLegClockMin(2.6, bad)).toBeNaN();
  }
  for (const good of [15, 25, 40]) {
    expect(usableFlatKph(good)).toBe(true);
    expect(ridingMin(route, 0, 90, good)).toBeCloseTo((90 / (good * 0.82)) * 60, 6);
  }
});

test('[PACE-RIDING] with an unusable speed a schedule has no arrivals, and they read unknown, never fine', () => {
  for (const bad of BAD) {
    const trip = testTrip({ flatKph: bad });
    const s = buildSchedule(trip, { startKm: 0, startLegKm: 0, departure: at(`${SAT} 08:30`), dayStopKm: 78, date: SAT }, 1, zoneAt(300));
    expect(isInvalid(s.atKm(50))).toBe(true);
    expect(isInvalid(s.atPlace({ placeId: 'n1', km: 50, offRouteM: 400 }))).toBe(true);
    expect(isInvalid(s.ridingOnAt(50))).toBe(true);
    expect(s.ridingMinTo(50)).toBeNaN();
    expect(daylightAt(s, 50, trip, env)).toEqual({ status: 'unknown', line: null });
  }
});

test('[PACE-R] an unusable speed gives no correction', () => {
  const ins = [pos({ km: 98, at: `${SUN} 11:00` }), pos({ km: 149, at: `${SUN} 14:00` })];
  for (const bad of BAD) expect(correction(ins, 50, testTrip().route, bad)).toBe(1);
});

test('[DAY-END2] with an unusable speed the ride is judged at the most careful one: km 149 at 13:30 has ended', () => {
  const night = pos({ km: 76, at: `${SAT} 19:00` });
  const p = pos({ km: 149, at: `${SUN} 13:00` });
  for (const bad of BAD) {
    const trip = testTrip({ flatKph: bad });
    const r = dayRide(trip, [night, p], null, null, at(`${SUN} 13:30`), env18);
    expect(r.phase).toBe('after-ride');
    expect(r.tonightKm).toBe(149);
    expect(Number.isFinite(r.r)).toBe(true);
    expect(isInvalid(r.departure)).toBe(false);
    // The times the cards would show stay unknown.
    expect(isInvalid(scheduleFor(r, trip, env18).atKm(r.stopKm))).toBe(true);
  }
});

// ---- bad values from the phone ------------------------------------------------------------------------------------------

test('[LOC-MANUAL] a manual kilometre that is no number, or a bad time, gives no position', () => {
  const route = flatRoute(100);
  expect(manualPosition(route, Number.NaN, at(`${SAT} 12:00`))).toBeNull();
  expect(manualPosition(route, Infinity, at(`${SAT} 12:00`))).toBeNull();
  expect(manualPosition(route, 40, invalid)).toBeNull();
});

const goodFix = { ...pointAtKm(30), accuracyM: 10, at: at(`${SAT} 12:00`) };

test('[LOC-PROJECT] a fix with a bad value is no position, never km 0 on the route', () => {
  const route = flatRoute(100);
  const idx = buildSegmentIndex(route);
  for (const bad of [{ lon: Number.NaN }, { lat: Number.NaN }, { lat: 91 }, { lon: 181 }, { accuracyM: Number.NaN }, { accuracyM: -1 }, { at: invalid }]) {
    expect(locate({ ...goodFix, ...bad }, route, idx, null)).toEqual({ kind: 'no-position' });
  }
  expect(locate(goodFix, route, idx, null).kind).toBe('position');
});

test('[LOC-MATCH] a place or point with a bad value finds no segment, and does not hang', () => {
  const route = flatRoute(100);
  const idx = buildSegmentIndex(route);
  expect(segmentsNear(idx, { lat: Number.NaN, lon: 8.4 }, 1)).toEqual([]);
  expect(segmentsNear(idx, { lat: 49, lon: Number.NaN }, 1)).toEqual([]);
  expect(matchPlaces([{ ...tap().atKm(30), lon: Number.NaN }], route, idx)).toEqual([]);
});

test('[LOC-INFINITY] a latitude of Infinity neither hangs locate nor the index', () => {
  const route = flatRoute(100);
  const idx = buildSegmentIndex(route);
  expect(locate({ ...goodFix, lat: Infinity }, route, idx, null)).toEqual({ kind: 'no-position' });
  expect(locate({ ...goodFix, lon: Infinity }, route, idx, null)).toEqual({ kind: 'no-position' });
  expect(segmentsNear(idx, { lat: Infinity, lon: 8.4 }, 1)).toEqual([]);
  expect(matchPlaces([{ ...tap().atKm(30), lat: Infinity }], route, idx)).toEqual([]);
});

test('[DAY-FUTURE-POS] a position with a bad value counts as no position, and nothing throws', () => {
  const good = pos({ km: 60, at: `${SUN} 12:00` });
  const clean = day([good], `${SUN} 12:30`);
  const bads: Partial<Position>[] = [{ km: Number.NaN }, { km: Infinity }, { lat: Number.NaN }, { lon: Number.NaN }, { lat: Infinity }, { at: invalid }, { offRouteM: Number.NaN }, { accuracyM: Number.NaN }];
  for (const bad of bads) {
    const p = { ...pos({ km: 100, at: `${SUN} 12:10` }), ...bad };
    expect(day([good, p], `${SUN} 12:30`)).toEqual(clean);
  }
});

test('[DAY-FUTURE-POS] a bad now plans day 1 from the route start, with no position read, and throws nothing', () => {
  const r = dayRide(testTrip(), [pos({ km: 100, at: `${SUN} 12:10` })], null, null, invalid, env);
  expect(r.phase).toBe('before-trip');
  expect(r.startKm).toBe(0);
  expect(r.stopKm).toBe(78);
  expect(r.departure.getTime()).toBe(at(`${SAT} 08:30`).getTime());
  const none = dayRide(testTrip({ departureDate: null }), [], null, null, invalid, env);
  expect(none.phase).toBe('before-trip');
  expect(isInvalid(none.departure)).toBe(true);
});

test('[DAY-BACK] a bad tap time is no tap', () => {
  const plan = { date: SUN, backToTodayAt: invalid };
  const positions = [pos({ km: 140, at: `${SUN} 19:00` })];
  expect(day(positions, `${SUN} 19:06`, [], plan).phase).toBe('after-ride');
});

test('[D-STATUS] a bad arrival or riding time reads unknown; a bad now states no minutes', () => {
  const s = sun()(49, 8.4, SAT);
  expect(arrivalStatus(invalid, s, 60, BERLIN)).toEqual({ status: 'unknown', line: null });
  expect(arrivalStatus(at(`${SAT} 12:00`), s, Number.NaN, BERLIN)).toEqual({ status: 'unknown', line: null });
  expect(daylightLeft(invalid, s, s, BERLIN)).toBe('daylight not known');
});

// ---- smaller points ------------------------------------------------------------------------------------------------------

test('[LOC-APPROX] the far edge is held to the route end', () => {
  const p = pos({ km: 298, acc: 6800, at: `${SUN} 12:00` });
  expect(adjusted(p, 300).behindFromKm).toBe(300);
  expect(adjusted(p, 300).radius).toEqual([291.2, 300]);
  const r = day([pos({ km: 150, at: `${SAT} 19:00` }), p], `${SUN} 12:00`);
  expect(r.behindFromKm).toBe(300);
});

test('[PACE-DETOUR] a stop off the route at the very start of the ride adds the round trip to every later arrival', () => {
  const trip: Trip = testTrip();
  const s = buildSchedule(trip, { startKm: 30, startLegKm: 0, departure: at(`${SAT} 08:30`), dayStopKm: 78, date: SAT }, 1, zoneAt(300));
  const m = { placeId: 'n1', km: 30, offRouteM: 400 };
  const t = s.through(m);
  expect(t.atKm(60).getTime() - s.atKm(60).getTime()).toBeCloseTo(3.5 * MIN, -3);
  expect(t.atKm(30).getTime()).toBe(s.atKm(30).getTime());
  // A stop at the day's stop belongs to that ride: the next day's arrivals do not take it.
  const atStop = s.through({ placeId: 'n2', km: 78, offRouteM: 400 });
  expect(atStop.atKm(100).getTime()).toBe(s.atKm(100).getTime());
});

test('[DAY-FUTURE-POS] two positions stamped after now: the later stamp is the latest, whatever the input order', () => {
  const a = pos({ km: 90, at: `${SUN} 14:20` });
  const b = pos({ km: 95, at: `${SUN} 14:25` });
  expect(day([a, b], `${SUN} 14:00`).startKm).toBe(95);
  expect(day([b, a], `${SUN} 14:00`).startKm).toBe(95);
  const same = pos({ km: 80, at: `${SUN} 14:25` });
  expect(day([b, same], `${SUN} 14:00`).startKm).toBe(day([same, b], `${SUN} 14:00`).startKm);
});

test('[D-MIDNIGHT] the arrival at 00:48 Sunday is judged on the sun of the ride\'s date, through the ride it lies on', () => {
  const trip = testTrip();
  const dates: string[] = [];
  const byDate = {
    sun: (lat: number, lon: number, date: string) => {
      dates.push(date);
      return sun(date === SAT ? {} : { dusk: '19:15', sunset: '18:40' })(lat, lon, date);
    },
    routeZones: zonesOf(300),
  };
  const s = buildSchedule(trip, { startKm: 100, startLegKm: 0, departure: at(`${SAT} 22:00`), dayStopKm: 150, date: SAT }, 1, zoneAt(300));
  expect(Math.abs(s.atKm(150).getTime() - at(`${SUN} 00:48`).getTime())).toBeLessThan(30_000);
  expect(daylightAt(s, 150, trip, byDate)).toEqual({ status: 'warning', line: 'dark from 19:17' });
  expect(dates).toEqual([SAT]);
  // A place on the next day's ride takes the next date's sun, in the morning: fine.
  expect(daylightAt(s, 160, trip, byDate).status).toBe('fine');
  expect(dates[1]).toBe(SUN);
});

test('[DAY-RIDE-ON-CLOCK] riding there now has no night in it, for places too, and its date is today', () => {
  const trip = testTrip();
  const positions = [pos({ km: 50, at: `${SAT} 19:00` }), pos({ km: 148, at: `${SUN} 19:00` })];
  const ride = dayRide(trip, positions, null, null, at(`${SUN} 19:10`), env);
  expect(ride.phase).toBe('after-ride');
  const n = nowSchedule(ride, trip, at(`${SUN} 19:10`), env);
  const m = { placeId: 'n1', km: 230, offRouteM: 400 }; // beyond even tomorrow's stop
  const expected = at(`${SUN} 19:10`).getTime() + (82 * CLOCK_PER_KM * ride.r + 1.75 * ride.r) * MIN;
  expect(Math.abs(n.atPlace(m).getTime() - expected)).toBeLessThanOrEqual(1000);
  expect(n.atKm(230).getTime()).toBe(n.ridingOnAt(230).getTime());
  expect(n.rideOf(230).date).toBe(SUN);
  expect(n.ridingMinBetween(220, 230)).toBeCloseTo(10 * (60 / 20.5) * ride.r, 6);
  // A bad now gives no times and throws nothing.
  expect(isInvalid(nowSchedule(ride, trip, invalid, env).atKm(160))).toBe(true);
});

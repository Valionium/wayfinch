import { expect, test } from 'vitest';
import { buildSchedule, clockMin, correction, flatLegClockMin, ridingMin, stopRule, type RideStart } from '../../../../src/core/engines/pace.ts';
import { rejoinKm } from '../../../../src/core/engines/locate.ts';
import { planStages } from '../../../../src/core/route/stages.ts';
import type { Route, RouteMatch, Trip } from '../../../../src/core/types.ts';
import { at, flatRoute, pos, testTrip, zoneAt } from '../../../fixtures/build.ts';
import { exactRoute } from '../../../fixtures/route.ts';

const CLOCK_PER_KM = (60 / 20.5) * 1.15; // minutes per flat kilometre at 25 km/h, breaks included
const MIN = 60_000;
const within1s = (a: Date, b: Date): void => expect(Math.abs(a.getTime() - b.getTime())).toBeLessThanOrEqual(1000);
/** Section 6.12: unrounded times are compared within 1 second. */
const msWithin1s = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(1000);

const ride = (over: Partial<RideStart> = {}): RideStart => ({
  startKm: 0, startLegKm: 0, departure: at('2026-10-17 08:30'), dayStopKm: 78, date: '2026-10-17', ...over,
});
const sched = (over: Partial<RideStart> = {}, r = 1, trip: Trip = testTrip()) => buildSchedule(trip, ride(over), r, zoneAt(trip.route.lengthKm));
const shopM = (km: number, offRouteM: number): RouteMatch => ({ placeId: 'n1', km, offRouteM });

/** A route with `ascentM` of climbing evenly over `km`, flat speed unaffected. */
const climbing = (km: number, ascentM: number): Route => ({ ...exactRoute([[0, 100], [km, 100 + ascentM]]), ascentM });

test('[PACE-RIDING] 90 km flat at 25 km/h: 263.4 min riding, 302.9 min clock', () => {
  const route = flatRoute(90);
  expect(ridingMin(route, 0, 90, 25)).toBeCloseTo(263.4, 1);
  expect(clockMin(route, 0, 90, 25)).toBeCloseTo(302.9, 1);
});

test('[PACE-RIDING] r scales every section, and the order of the two kilometres does not matter', () => {
  const route = flatRoute(90);
  expect(ridingMin(route, 10, 40, 25, 1.2)).toBeCloseTo(1.2 * ridingMin(route, 10, 40, 25), 9);
  expect(clockMin(route, 40, 10, 25)).toBeCloseTo(clockMin(route, 10, 40, 25), 9);
  expect(ridingMin(route, 85, 200, 25)).toBeCloseTo(ridingMin(route, 85, 90, 25), 9);
});

test('[PACE-EFFORT] loaded is flat x 0.82; 45 km with 1,125 m up: 4.39 h riding', () => {
  expect(ridingMin(climbing(45, 1125), 0, 45, 25) / 60).toBeCloseTo(4.39, 2);
  expect(ridingMin(flatRoute(82), 0, 82, 25) / 60).toBeCloseTo(4, 9); // 82 km at 25 x 0.82 = 20.5 km/h
});

test('[PACE-EFFORT] climbs are slower than flats, also with r', () => {
  const route: Route = { ...exactRoute([[0, 100], [10, 100], [20, 600], [30, 600]]), ascentM: 500 };
  const flat = ridingMin(route, 0, 10, 25);
  const climb = ridingMin(route, 10, 20, 25);
  expect(flat).toBeCloseTo((10 / 20.5) * 60, 6);
  expect(climb).toBeCloseTo(((10 + 20) / 20.5) * 60, 6);
  expect(ridingMin(route, 10, 20, 25, 1.3)).toBeGreaterThan(ridingMin(route, 0, 10, 25, 1.3));
  expect(ridingMin(route, 20, 30, 25)).toBeCloseTo(flat, 6); // no credit for flats after the climb
});

test('[PACE-EFFORT] a stage takes the hours the stage plan says', () => {
  const route: Route = { ...exactRoute([[0, 100], [40, 700], [60, 300], [100, 900]]), ascentM: 1200 };
  const stages = planStages(route, { flatKph: 25, pace: 'steady', nights: 2 });
  for (const s of stages) expect(ridingMin(route, s.startKm, s.endKm, 25)).toBeCloseTo(s.ridingHours * 60, 6);
});

test('[PACE-DETOUR] a shop 400 m off at km 30: one-way +1 min 45 s (09:49:01 to 09:47:16 at the leave-by shape)', () => {
  const m = shopM(30, 400);
  const onRoute = sched({ departure: at('2026-10-17 09:49:01') });
  within1s(onRoute.atKm(30), at('2026-10-17 11:30'));
  const toShop = sched({ departure: at('2026-10-17 09:47:16') });
  within1s(toShop.atPlace(m), at('2026-10-17 11:30'));
  expect(flatLegClockMin(1.3 * 0.4, 25)).toBeCloseTo(1.75, 2);
});

test('[PACE-DETOUR] the round trip through it adds 3.5 min to every later arrival, and to nothing earlier', () => {
  const m = shopM(30, 400);
  const s = sched();
  const t = s.through(m);
  msWithin1s(t.atKm(60).getTime() - s.atKm(60).getTime(), 3.5 * MIN);
  msWithin1s(t.atKm(78).getTime() - s.atKm(78).getTime(), 3.5 * MIN);
  expect(t.atKm(20).getTime()).toBe(s.atKm(20).getTime());
  expect(t.atKm(30).getTime()).toBe(s.atKm(30).getTime());
  expect(t.atPlace(m).getTime()).toBe(s.atPlace(m).getTime());
  expect(t.departure).toBe(s.departure);
});

test('[PACE-REJOIN] a camp 2 km off: a 2.6 km flat leg at loaded pace, breaks included', () => {
  const leg = rejoinKm(2000);
  expect(flatLegClockMin(leg, 25)).toBeCloseTo(2.6 * CLOCK_PER_KM, 9);
  const s = sched({ startLegKm: leg });
  expect(s.startLegKm).toBeCloseTo(2.6, 9);
  msWithin1s(s.atKm(10).getTime() - s.departure.getTime(), (12.6 * CLOCK_PER_KM) * MIN);
  msWithin1s(s.atKm(0).getTime() - s.departure.getTime(), (2.6 * CLOCK_PER_KM) * MIN);
});

test('[PACE-BEHIND] a place behind: the ride back at the same pace plus the detour', () => {
  const s = sched({ startKm: 50, dayStopKm: 78, departure: at('2026-10-17 12:00') });
  const back = s.behind(shopM(40, 400)).getTime() - s.departure.getTime();
  msWithin1s(back, (10 * CLOCK_PER_KM + 1.75) * MIN);
  // With r, and from the far edge of an approximate position.
  const far = sched({ startKm: 49.2, behindFromKm: 50.8, dayStopKm: 78, departure: at('2026-10-17 12:00') }, 1.2);
  msWithin1s(far.behind(shopM(40, 0)).getTime() - far.departure.getTime(), 10.8 * CLOCK_PER_KM * 1.2 * MIN);
});

test('[PACE-STOPRULE] stage ends 78, 150, 222, 300: day starts at km 63, 30, 39, 80 give 150, 78, 78, 150', () => {
  const stages = testTrip().route.stages;
  expect(stopRule(stages, 63, 300)).toBe(150);
  expect(stopRule(stages, 30, 300)).toBe(78);
  expect(stopRule(stages, 39, 300)).toBe(78);
  expect(stopRule(stages, 80, 300)).toBe(150);
  expect(stopRule(stages, 0, 300)).toBe(78);
});

test('[PACE-STOPRULE] km 78 lies in the stage it ends; never beyond the route end', () => {
  const stages = testTrip().route.stages;
  expect(stopRule(stages, 78, 300)).toBe(150);
  expect(stopRule(stages, 150, 300)).toBe(222);
  expect(stopRule(stages, 222, 300)).toBe(300);
  expect(stopRule(stages, 299, 300)).toBe(300);
  expect(stopRule(stages, 300, 300)).toBe(300);
  expect(stopRule(stages, 320, 300)).toBe(300);
  expect(stopRule([], 10, 300)).toBe(300);
  expect(stopRule(stages, 100, 120)).toBe(120); // a stage end past a shorter length
});

test('[PACE-STOPRULE] the stop always lies beyond the kilometre it starts from, also with a stage of no length', () => {
  const stages = [
    { day: 1, startKm: 0, endKm: 10, ridingHours: 1, ascentM: 0 },
    { day: 2, startKm: 10, endKm: 10, ridingHours: 0, ascentM: 0 },
    { day: 3, startKm: 10, endKm: 20, ridingHours: 1, ascentM: 0 },
  ];
  expect(stopRule(stages, 10, 20)).toBe(20);
});

test('[PACE-LATER] a later day starts at the previous stop at the daily start time on the next date', () => {
  const s = sched();
  const expected = at('2026-10-18 08:30').getTime() + 22 * CLOCK_PER_KM * MIN;
  msWithin1s(s.atKm(100).getTime(), expected);
  const day = s.rideOf(100);
  expect(day).toMatchObject({ date: '2026-10-18', startKm: 78, stopKm: 150, r: 1 });
  expect(day.departure.getTime()).toBe(at('2026-10-18 08:30').getTime());
  expect(s.rideOf(170).date).toBe('2026-10-19');
  expect(s.rideOf(40)).toMatchObject({ date: '2026-10-17', startKm: 0, stopKm: 78 });
  // km 78 itself is on the first day; just past it is on the next day's ride.
  msWithin1s(s.atKm(78).getTime(), at('2026-10-17 08:30').getTime() + 78 * CLOCK_PER_KM * MIN);
  msWithin1s(s.atKm(78.5).getTime(), at('2026-10-18 08:30').getTime() + 0.5 * CLOCK_PER_KM * MIN);
});

test('[PACE-LATER] when a late ride reaches the stop after that time, the next day starts at that arrival', () => {
  const trip = testTrip({ route: flatRoute(400, { stageEnds: [300] }) });
  const s = sched({ dayStopKm: 300, departure: at('2026-10-17 20:00') }, 1, trip);
  const arrival = at('2026-10-17 20:00').getTime() + 300 * CLOCK_PER_KM * MIN; // Sunday, about 12:49
  expect(arrival).toBeGreaterThan(at('2026-10-18 08:30').getTime());
  msWithin1s(s.atKm(350).getTime(), arrival + 50 * CLOCK_PER_KM * MIN);
  expect(s.rideOf(350).date).toBe('2026-10-18');
  msWithin1s(s.rideOf(350).departure.getTime(), arrival);
});

test('[PACE-LATER] riding on past the stop that evening has no night in it', () => {
  const s = sched({ startKm: 50, dayStopKm: 78, departure: at('2026-10-17 16:00') });
  msWithin1s(s.ridingOnAt(100).getTime() - s.departure.getTime(), 50 * CLOCK_PER_KM * MIN);
});

test('[PACE-LATER] the riding time to a kilometre runs from the start of the ride it lies on, leg included', () => {
  const s = sched({ startKm: 50, startLegKm: 2, dayStopKm: 78 });
  expect(s.ridingMinTo(60)).toBeCloseTo(12 * (60 / 20.5), 6);
  expect(s.ridingMinTo(100)).toBeCloseTo(22 * (60 / 20.5), 6); // the next day's ride, from km 78
});

test('[PACE-R] night at km 50, check-ins at km 50.2 at 07:00, km 98 at 11:00 and km 149 at 14:00: r = 180 / 171.7 = 1.05', () => {
  const route = testTrip().route;
  const ins = [pos({ km: 50.2, at: '2026-10-17 07:00' }), pos({ km: 98, at: '2026-10-17 11:00' }), pos({ km: 149, at: '2026-10-17 14:00' })];
  expect(clockMin(route, 98, 149, 25)).toBeCloseTo(171.7, 1);
  expect(correction(ins, 50, route, 25)).toBeCloseTo(180 / clockMin(route, 98, 149, 25), 9);
  expect(correction(ins, 50, route, 25)).toBeCloseTo(1.05, 2);
});

test('[PACE-R] km 98 and km 104 alone: r = 1; exactly 10 km counts, 9.9 km does not', () => {
  const route = testTrip().route;
  const two = (b: number) => [pos({ km: 98, at: '2026-10-17 11:00' }), pos({ km: b, at: '2026-10-17 11:40' })];
  expect(correction(two(104), 50, route, 25)).toBe(1);
  expect(correction(two(107.9), 50, route, 25)).toBe(1);
  expect(correction(two(108), 50, route, 25)).toBeCloseTo(40 / (10 * CLOCK_PER_KM), 9);
});

test('[PACE-R] a check-in 8 km off never counts, nor does a manual or a coarse one', () => {
  const route = testTrip().route;
  const first = pos({ km: 98, at: '2026-10-17 11:00' });
  expect(correction([first, pos({ km: 149, at: '2026-10-17 14:00', off: 8000 })], 50, route, 25)).toBe(1);
  expect(correction([first, pos({ km: 149, at: '2026-10-17 14:00', manual: true })], 50, route, 25)).toBe(1);
  expect(correction([first, pos({ km: 149, at: '2026-10-17 14:00', acc: 101 })], 50, route, 25)).toBe(1);
  expect(correction([first, pos({ km: 149, at: '2026-10-17 14:00', acc: 100 })], 50, route, 25)).toBeGreaterThan(1);
});

test('[PACE-R] clamped to 0.85 and 1.5', () => {
  const route = testTrip().route;
  const first = pos({ km: 98, at: '2026-10-17 11:00' });
  expect(correction([first, pos({ km: 149, at: '2026-10-17 11:10' })], 50, route, 25)).toBe(0.85);
  expect(correction([first, pos({ km: 149, at: '2026-10-17 23:00' })], 50, route, 25)).toBe(1.5);
});

test('[PACE-R] the stretch starts at the first check-in more than 2 km from the day start', () => {
  const route = testTrip().route;
  const ins = [pos({ km: 51, at: '2026-10-17 07:00' }), pos({ km: 52, at: '2026-10-17 09:00' }), pos({ km: 52.1, at: '2026-10-17 10:00' }), pos({ km: 72.1, at: '2026-10-17 11:00' })];
  expect(correction(ins, 50, route, 25)).toBeCloseTo(60 / (20 * CLOCK_PER_KM), 9);
});

test('[PACE-R-LATER] with r = 1.4 the rest of today is scaled, and a shop 40 km into tomorrow is still about 2 h 15 min after its departure', () => {
  const s = sched({ startKm: 50, dayStopKm: 150, departure: at('2026-10-17 10:00') }, 1.4);
  msWithin1s(s.atKm(100).getTime() - s.departure.getTime(), 50 * CLOCK_PER_KM * 1.4 * MIN);
  expect(s.ridingMinBetween(60, 100)).toBeCloseTo(40 * (60 / 20.5) * 1.4, 6);
  expect(s.clockMinBetween(60, 100)).toBeCloseTo(40 * CLOCK_PER_KM * 1.4, 6);
  expect(s.ridingMinTo(100)).toBeCloseTo(50 * (60 / 20.5) * 1.4, 6);
  // The detour and the rejoin leg of today's ride are scaled too.
  msWithin1s(s.atPlace(shopM(100, 400)).getTime() - s.atKm(100).getTime(), 1.75 * 1.4 * MIN);
  // Tomorrow: r = 1.
  const tomorrow = at('2026-10-18 08:30').getTime();
  const min = (s.atKm(190).getTime() - tomorrow) / MIN;
  expect(min).toBeCloseTo(40 * CLOCK_PER_KM, 3);
  expect(Math.abs(min - 135)).toBeLessThan(2.5);
  msWithin1s(s.atPlace(shopM(190, 400)).getTime() - s.atKm(190).getTime(), 1.75 * MIN);
  // A stretch across the night: r only on today's part.
  expect(s.ridingMinBetween(140, 160)).toBeCloseTo(10 * (60 / 20.5) * 1.4 + 10 * (60 / 20.5), 6);
});

test('[PACE-ONE-TIME] a shop 400 m off at km 30 has one unrounded arrival through every caller for the same departure', () => {
  const trip = testTrip();
  const zone = zoneAt(300);
  const input = ride();
  const m = shopM(30, 400);
  const a = buildSchedule(trip, input, 1, zone);
  const b = buildSchedule(trip, input, 1, zone);
  const exact = at('2026-10-17 08:30').getTime() + (30 * CLOCK_PER_KM + 1.75) * MIN;
  msWithin1s(a.atPlace(m).getTime(), exact);
  expect(a.atPlace(m).getTime()).toBe(a.atPlace(m).getTime());
  expect(b.atPlace(m).getTime()).toBe(a.atPlace(m).getTime());
  expect(a.withDeparture(input.departure).atPlace(m).getTime()).toBe(a.atPlace(m).getTime());
});

test('[PACE-ONE-TIME] another time comes only from another departure', () => {
  const s = sched();
  const later = s.withDeparture(at('2026-10-17 09:30'));
  const m = shopM(30, 400);
  expect(later.atPlace(m).getTime() - s.atPlace(m).getTime()).toBe(60 * MIN);
  expect(later.departure.getTime()).toBe(at('2026-10-17 09:30').getTime());
  expect(s.departure.getTime()).toBe(at('2026-10-17 08:30').getTime());
});

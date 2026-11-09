import { fc, test as fcTest } from '@fast-check/vitest';
import { expect, test } from 'vitest';
import { formatAbout } from '../../../../src/core/answers/time.ts';
import { rejoinKm } from '../../../../src/core/engines/locate.ts';
import { dayRide, nowSchedule, noteFor, scheduleFor, tomorrowRide } from '../../../../src/core/engines/tripday.ts';
import type { DayRide, Position, Route, Trip } from '../../../../src/core/types.ts';
import { at, flatRoute, pos, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';

const BERLIN = 'Europe/Berlin';
const SAT = '2026-10-17';
const SUN = '2026-10-18';
const MON = '2026-10-19';
const FRI = '2026-10-16';
const CLOCK_PER_KM = (60 / 20.5) * 1.15;

type Opts = { trip?: Trip; sunset?: string };
const envOf = (o: Opts, length: number) => ({ sun: sun(o.sunset ? { sunset: o.sunset, dusk: '18:35' } : {}), routeZones: zonesOf(length) });
function day(positions: Position[], now: string, o: Opts = {}): DayRide {
  const trip = o.trip ?? testTrip();
  return dayRide(trip, positions, null, null, at(now), envOf(o, trip.route.lengthKm));
}
const schedule = (r: DayRide, o: Opts = {}) => {
  const trip = o.trip ?? testTrip();
  return scheduleFor(r, trip, envOf(o, trip.route.lengthKm));
};
const nightAt = (km: number): Position => pos({ km, at: `${SAT} 19:00` });
const tripOf = (route: Route): Trip => testTrip({ route });

test('[DAY-STOPS] night at km 149: the day\'s and tonight\'s stop km 222 all day', () => {
  for (const [positions, now] of [[[nightAt(149)], `${SUN} 07:00`], [[nightAt(149), pos({ km: 170, at: `${SUN} 11:00` })], `${SUN} 11:00`]] as const) {
    const r = day([...positions], now);
    expect(r.stopKm).toBe(222);
    expect(r.tonightKm).toBe(222);
    expect(r.tomorrowKm).toBe(300);
  }
});

test('[DAY-STOPS] riding from km 76: at km 150.0 today\'s stop becomes km 222', () => {
  const r = day([nightAt(76), pos({ km: 149.9, at: `${SUN} 12:00` })], `${SUN} 12:00`);
  expect(r.stopKm).toBe(150);
  const past = day([nightAt(76), pos({ km: 150, at: `${SUN} 12:00` })], `${SUN} 12:00`);
  expect(past.phase).toBe('riding');
  expect(past.stopKm).toBe(222);
  expect(past.tonightKm).toBe(222);
  expect(past.tomorrowKm).toBe(300);
});

test('[DAY-STOPS] a rider whose day began at km 76 stopping at km 151: tonight km 151, tomorrow km 222', () => {
  const r = day([nightAt(76), pos({ km: 151, at: `${SUN} 17:30` })], `${SUN} 17:30`, { sunset: '18:00' });
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(151);
  expect(r.tomorrowKm).toBe(222);
});

const stamp = (dayOffset: number, minute: number): Date => new Date(at(`${FRI} 00:00`).getTime() + (dayOffset * 1440 + minute) * 60_000);

fcTest.prop([
  fc.array(fc.record({ km: fc.double({ min: 0, max: 300, noNaN: true }), off: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 20_000 })), acc: fc.oneof(fc.constant(10), fc.integer({ min: 0, max: 3000 })), d: fc.integer({ min: 0, max: 5 }), m: fc.integer({ min: 0, max: 1439 }) }), { maxLength: 5 }),
  fc.integer({ min: 0, max: 5 }),
  fc.integer({ min: 0, max: 1439 }),
  fc.constantFrom(null, '2026-10-18', '2026-10-19'),
  fc.boolean(),
])('[DAY-TOMORROW-BEYOND] tomorrow\'s stop lies beyond tonight\'s stop, or there is none', (raw, d, m, endDate, planned) => {
  const trip = testTrip();
  const now = stamp(d, m);
  const positions = raw.map((p): Position => ({ ...pos({ km: p.km, off: p.off, acc: p.acc, at: '2026-10-16 00:00' }), at: stamp(p.d, p.m) }));
  const plan = planned ? { date: '2026-10-18', backToTodayAt: null } : null;
  const r = dayRide(trip, positions, plan, endDate, now, { sun: sun(), routeZones: zonesOf(300) });
  if (r.phase === 'before-trip') expect(r.tonightKm).toBeNull();
  else expect(r.tonightKm).not.toBeNull();
  if (r.phase === 'route-end' || (r.tonightKm !== null && r.tonightKm >= 300)) expect(r.tomorrowKm).toBeNull();
  if (r.tomorrowKm !== null && r.tonightKm !== null) expect(r.tomorrowKm).toBeGreaterThan(r.tonightKm);
  if (r.phase !== 'route-end' && r.tonightKm !== null && r.tonightKm < 300) expect(r.tomorrowKm).not.toBeNull();
  // Nothing negative, nothing beyond the route, and a ride that never runs backwards.
  for (const km of [r.startKm, r.stopKm, r.dayStartKm, r.behindFromKm]) {
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeGreaterThanOrEqual(0);
  }
  expect(r.startOffRouteM).toBeGreaterThanOrEqual(0);
  expect(r.stopKm).toBeLessThanOrEqual(300);
  expect(r.behindFromKm).toBeLessThanOrEqual(300);
  expect(r.startKm).toBeLessThanOrEqual(r.stopKm);
  expect(r.departure.getTime()).toBeGreaterThanOrEqual(r.phase === 'route-end' || r.phase === 'riding' || r.noRide ? now.getTime() : now.getTime() - 86_400_000);
  const s = schedule(r, { trip });
  expect(s.atKm(r.stopKm).getTime()).toBeGreaterThanOrEqual(r.departure.getTime());
});

test('[DAY-ONE-STOP] sunset 18:00. At km 151 at 17:30, day began at km 76: tomorrow\'s ride from km 151 at 08:30 to km 222', () => {
  const r = day([nightAt(76), pos({ km: 151, at: `${SUN} 17:30` })], `${SUN} 17:30`, { sunset: '18:00' });
  expect(r.phase).toBe('after-ride');
  expect(r.startKm).toBe(151);
  expect(r.stopKm).toBe(222);
  expect(r.date).toBe(MON);
  expect(r.departure.getTime()).toBe(at(`${MON} 08:30`).getTime());
});

test('[DAY-OLD-POS] position km 125 from 14:20, opened at 15:00: the ride leaves km 125 at 15:00', () => {
  const r = day([nightAt(100), pos({ km: 125, at: `${SUN} 14:20` })], `${SUN} 15:00`);
  expect(r.phase).toBe('riding');
  expect(r.startKm).toBe(125);
  expect(r.departure.getTime()).toBe(at(`${SUN} 15:00`).getTime());
});

test('[DAY-DEPARTURE] at 07:00 Saturday at the route start: leaving 08:30; later than the daily start: now', () => {
  const start = pos({ km: 0, at: `${SAT} 07:00` });
  const early = day([start], `${SAT} 07:00`);
  expect(early.phase).toBe('before-ride');
  expect(early.departure.getTime()).toBe(at(`${SAT} 08:30`).getTime());
  expect(early.date).toBe(SAT);
  const late = day([start], `${SAT} 09:10`);
  expect(late.departure.getTime()).toBe(at(`${SAT} 09:10`).getTime());
});

test('[DAY-CAMP-START] a camp 2 km off beside the start: the 2.6 km rejoin leg, the evening before and on day 1', () => {
  const eve = pos({ km: 0, off: 2000, at: `${FRI} 19:00` });
  const before = day([eve], `${FRI} 20:00`);
  expect(before.phase).toBe('before-trip');
  expect(before.startKm).toBe(0);
  expect(before.startOffRouteM).toBe(2000);
  expect(rejoinKm(before.startOffRouteM)).toBeCloseTo(2.6, 9);
  expect(noteFor(before)).toBeNull();
  const s = schedule(before);
  expect(s.startLegKm).toBeCloseTo(2.6, 9);
  expect(s.atKm(10).getTime() - s.departure.getTime()).toBeCloseTo(12.6 * CLOCK_PER_KM * 60_000, -3);
  const morning = day([eve, pos({ km: 0, off: 2000, at: `${SAT} 07:00` })], `${SAT} 07:00`);
  expect(morning.phase).toBe('before-ride');
  expect(morning.startOffRouteM).toBe(2000);
  expect(noteFor(morning)).toBeNull();
  // A position older than 48 hours still is the camp: the latest accepted position counts here.
  expect(day([pos({ km: 0, off: 2000, at: '2026-10-14 19:00' })], `${SAT} 07:00`).startOffRouteM).toBe(2000);
});

test('[DAY-CAMP-START] elsewhere: the note, and day 1 starts at the route start', () => {
  const text = 'Day 1 starts at the route start (km 0)';
  for (const [p, now] of [
    [pos({ km: 12, off: 40_000, at: `${FRI} 19:00` }), `${FRI} 20:00`],
    [pos({ km: 3, at: `${FRI} 19:00` }), `${FRI} 20:00`],
    [pos({ km: 12, off: 40_000, at: `${SAT} 07:00` }), `${SAT} 07:30`],
  ] as const) {
    const r = day([p], now);
    expect(r.startKm).toBe(0);
    expect(r.startOffRouteM).toBe(0);
    expect(noteFor(r)).toBe(text);
  }
  expect(noteFor(day([], `${FRI} 20:00`))).toBeNull();
  // A hotel at km 3 on the morning of day 1 is the day start, so day 1 starts there.
  const hotel = day([pos({ km: 3, at: `${SAT} 07:00` })], `${SAT} 07:00`);
  expect(hotel.startKm).toBe(3);
  expect(noteFor(hotel)).toBeNull();
});

test('[DAY-ACROSS-NIGHT] with no position between: tomorrow\'s stop at 21:00 equals the day\'s stop at 07:00 next morning', () => {
  for (const km of [60, 120, 149, 151, 200]) {
    const last = pos({ km, at: `${SUN} 18:40` });
    const evening = day([nightAt(50), last], `${SUN} 21:00`);
    const morning = day([nightAt(50), last], `${MON} 07:00`);
    expect(evening.phase).toBe('after-ride');
    expect(morning.stopKm).toBe(evening.tomorrowKm);
    expect(morning.phase).toBe('before-ride');
    expect(morning.startKm).toBe(evening.startKm);
  }
  // With no position at all, too.
  expect(day([], `${MON} 07:00`).stopKm).toBe(day([], `${SUN} 21:00`).tomorrowKm);
});

test('[DAY-ACROSS-NIGHT] a hotel 11.8 km off at route km 0, stage ends km 36.4 and 78.3: tonight km 0, both stops km 36.4', () => {
  const trip = tripOf(flatRoute(78.3, { stageEnds: [36.4] }));
  const hotel = pos({ km: 0, off: 11_800, at: `${SAT} 20:00` });
  const evening = day([hotel], `${SAT} 21:00`, { trip });
  expect(evening.phase).toBe('after-ride');
  expect(evening.tonightKm).toBe(0);
  expect(evening.tomorrowKm).toBe(36.4);
  const morning = day([hotel], `${SUN} 07:00`, { trip });
  expect(morning.phase).toBe('before-ride');
  expect(morning.stopKm).toBe(36.4);
  expect(morning.tonightKm).toBe(36.4);
});

test('[DAY-NO-ROUTE-POS] trip day 2, ends 20.4, 49.2, 81.4, the only position (15:44) 5.3 km off at km 74.9: stop km 81.4, never km 49.2', () => {
  const trip = tripOf(flatRoute(81.4, { stageEnds: [20.4, 49.2] }));
  const r = day([pos({ km: 74.9, off: 5300, at: `${SUN} 15:44` })], `${SUN} 15:44`, { trip });
  expect(r.dayStartKm).toBe(74.9);
  expect(r.stopKm).toBe(81.4);
  expect(r.startKm).toBe(74.9);
  expect(r.startOffRouteM).toBe(5300);
  expect(r.phase).toBe('before-ride');
});

test('[DAY-NO-ROUTE-POS] with no position at all: stage 2, from the stage start at km 20.4', () => {
  const trip = tripOf(flatRoute(81.4, { stageEnds: [20.4, 49.2] }));
  const r = day([], `${SUN} 10:00`, { trip });
  expect(r.dayStartKm).toBe(20.4);
  expect(r.startKm).toBe(20.4);
  expect(r.stopKm).toBe(49.2);
  expect(noteFor(r)).toBe("From the start of today's stage (km 20.4), position not confirmed. Update position for answers from where you are.");
});

const pastStopTrip = tripOf(flatRoute(120.9, { stageEnds: [23.9, 53.7, 93.4] }));

test('[DAY-PAST-STOP] night at km 53.6, the only position 11.4 km off at km 120.9: stop stays km 93.4, ride starts there with a 14.8 km leg', () => {
  const r = day([pos({ km: 53.6, at: `${SAT} 19:00` }), pos({ km: 120.9, off: 11_400, at: `${SUN} 10:00` })], `${SUN} 10:00`, { trip: pastStopTrip });
  expect(r.stopKm).toBe(93.4);
  expect(r.startKm).toBe(93.4);
  expect(r.startOffRouteM).toBe(11_400);
  expect(rejoinKm(r.startOffRouteM)).toBeCloseTo(14.82, 2);
  expect(r.phase).toBe('before-ride');
  expect(noteFor(r)).toBe('Your position lies past today\'s stop at km 93.4. Times assume you rejoin the route there.');
  const s = schedule(r, { trip: pastStopTrip });
  expect(s.atKm(93.4).getTime()).toBeGreaterThan(s.departure.getTime());
});

test('[DAY-PAST-STOP] after the day\'s ride it says tomorrow\'s stop', () => {
  const r = day([pos({ km: 53.6, at: `${SAT} 19:00` }), pos({ km: 120.9, off: 11_400, at: `${SUN} 19:00` })], `${SUN} 20:00`, { trip: pastStopTrip });
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(53.6);
  expect(r.stopKm).toBe(93.4);
  expect(r.startKm).toBe(93.4);
  expect(noteFor(r)).toBe('Your position lies past tomorrow\'s stop at km 93.4. Times assume you rejoin the route there.');
});

test('[DAY-LAST-NO-POS] one-stage 108.5 km route, no position: after sunset tonight\'s stop is the end; no day\'s ride, no tomorrow', () => {
  const trip = tripOf(flatRoute(108.5));
  const r = day([], `${SAT} 19:00`, { trip });
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(108.5);
  expect(r.tomorrowKm).toBeNull();
  expect(r.noRide).toBe(true);
  expect(r.routeEndReachedOn).toBeNull();
  expect(noteFor(r)).toBe('Tonight\'s stop is the end of your route (km 108.5)');
  expect(noteFor(r)).not.toMatch(/reached/);
  // In the morning: the plain ride to the end.
  const morning = day([], `${SAT} 07:00`, { trip });
  expect(morning.phase).toBe('before-ride');
  expect(morning.noRide).toBe(false);
  expect(morning.tonightKm).toBe(108.5);
  expect(morning.tomorrowKm).toBeNull();
});

test('[DAY-NO-LATEST] after the ride with no position: from tonight\'s stop at km 150; no position', () => {
  const r = day([], `${SUN} 19:00`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(150);
  expect(r.startKm).toBe(150);
  expect(r.stopKm).toBe(222);
  expect(r.departure.getTime()).toBe(at(`${MON} 08:30`).getTime());
  expect(noteFor(r)).toBe('from tonight\'s stop at km 150; no position');
});

test('[DAY-APPROX-RIDE] plus or minus 800 m at km 76: the ride starts at km 75.2, places behind from km 76.8', () => {
  const r = day([nightAt(50), pos({ km: 76, acc: 800, at: `${SUN} 12:00` })], `${SUN} 12:00`);
  expect(r.phase).toBe('riding');
  expect(r.startKm).toBeCloseTo(75.2, 9);
  expect(r.behindFromKm).toBeCloseTo(76.8, 9);
  expect(r.startOffRouteM).toBe(0);
  const s = schedule(r);
  expect(s.atKm(80).getTime() - s.departure.getTime()).toBeCloseTo(4.8 * CLOCK_PER_KM * 60_000, -3);
  expect(s.behind({ placeId: 'n1', km: 70, offRouteM: 0 }).getTime() - s.departure.getTime()).toBeCloseTo(6.8 * CLOCK_PER_KM * 60_000, -3);
});

test('[DAY-RIDE-ON-CLOCK] at km 140 at 18:00, a campsite at km 158: about 19:00 riding on past km 150, about 08:55 on tomorrow\'s ride', () => {
  const r = day([nightAt(50), pos({ km: 140, at: `${SUN} 18:00` })], `${SUN} 18:00`);
  expect(r.phase).toBe('riding');
  const s = schedule(r);
  expect(formatAbout(s.ridingOnAt(158), BERLIN)).toBe('about 19:00');
  expect(formatAbout(s.atKm(158), BERLIN)).toBe('about 08:55');
});

test('[DAY-RIDE-ON-CLOCK] after the day\'s ride at km 151, a restaurant 600 m ahead is timed for riding there now, with today\'s r', () => {
  const trip = testTrip();
  const e = { sun: sun({ sunset: '18:00', dusk: '18:35' }), routeZones: zonesOf(300) };
  const r = dayRide(trip, [nightAt(76), pos({ km: 151, at: `${SUN} 17:30` })], null, null, at(`${SUN} 17:40`), e);
  expect(r.phase).toBe('after-ride');
  const n = nowSchedule(r, trip, at(`${SUN} 17:40`), e);
  expect(n.departure.getTime()).toBe(at(`${SUN} 17:40`).getTime());
  expect(n.ridingOnAt(151.6).getTime() - n.departure.getTime()).toBeCloseTo(0.6 * CLOCK_PER_KM * 60_000, -3);
  // The tomorrow schedule meanwhile stays at r = 1, whatever today's correction was.
  expect(scheduleFor(r, trip, e).r).toBe(1);
});

test('[DAY-RIDE-ON-CLOCK] r scales the rest of today; tomorrow\'s schedule has r = 1', () => {
  const ins = [nightAt(50), pos({ km: 60, at: `${SUN} 09:00` }), pos({ km: 100, at: `${SUN} 12:30` })];
  const r = day(ins, `${SUN} 12:30`);
  expect(r.phase).toBe('riding');
  expect(r.r).toBeGreaterThan(1);
  expect(schedule(r).r).toBeCloseTo(r.r, 9);
  const ended = day(ins, `${SUN} 19:30`);
  expect(ended.phase).toBe('after-ride');
  expect(schedule(ended).r).toBe(1);
  expect(ended.r).toBeCloseTo(r.r, 9);
});

test('[DAY-STOPS] tomorrow\'s ride, before and while riding: from tonight\'s stop at the daily start on the next date', () => {
  const trip = testTrip();
  const e = { sun: sun(), routeZones: zonesOf(300) };
  const r = dayRide(trip, [nightAt(50), pos({ km: 140, at: `${SUN} 12:00` })], null, null, at(`${SUN} 12:00`), e);
  const t = tomorrowRide(r, trip, e);
  expect(t.startKm).toBe(150);
  expect(t.stopKm).toBe(222);
  expect(t.date).toBe(MON);
  expect(t.departure.getTime()).toBe(at(`${MON} 08:30`).getTime());
  expect(t.r).toBe(1);
  expect(t.tomorrowKm).toBe(222);
  // After the ride, the ride already is tomorrow's.
  const after = dayRide(trip, [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` })], null, null, at(`${SUN} 19:00`), e);
  expect(tomorrowRide(after, trip, e)).toBe(after);
  // A shop 40 km into tomorrow's ride, with r = 1.4 today: about 2 h 15 min after its departure.
  const fast = { ...r, r: 1.4 };
  const later = scheduleFor(tomorrowRide(fast, trip, e), trip, e);
  expect((later.atKm(190).getTime() - later.departure.getTime()) / 60_000).toBeCloseTo(40 * CLOCK_PER_KM, 3);
  // Before the trip: the day after day 1.
  const before = dayRide(trip, [], null, null, at(`${FRI} 12:00`), e);
  const d2 = tomorrowRide(before, trip, e);
  expect(d2.startKm).toBe(78);
  expect(d2.stopKm).toBe(150);
  expect(d2.date).toBe(SUN);
  // At the last stage there is none.
  const last = dayRide(testTrip(), [nightAt(230)], null, null, at(`${SUN} 07:00`), e);
  expect(last.tomorrowKm).toBeNull();
  expect(tomorrowRide(last, trip, e).noRide).toBe(true);
});

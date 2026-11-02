import { expect, test } from 'vitest';
import { formatAbout } from '../../../../src/core/answers/time.ts';
import { arrivalStatus, fineLimit } from '../../../../src/core/engines/daylight.ts';
import { dayRide, offersPlanTomorrow, ridingDate, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import type { DayRide, PlanTomorrow, Position, Trip } from '../../../../src/core/types.ts';
import { at, flatRoute, pos, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';

const BERLIN = 'Europe/Berlin';
const SAT = '2026-10-17';
const SUN = '2026-10-18';
const MON = '2026-10-19';
const FRI = '2026-10-16';

type Opts = { trip?: Trip; plan?: PlanTomorrow | null; endDate?: string | null; sunset?: string; dusk?: string };
const env = (o: Opts, length: number) => ({
  sun: sun(o.sunset ? { sunset: o.sunset, dusk: o.dusk ?? '18:35' } : {}),
  routeZones: zonesOf(length),
});
function day(positions: Position[], now: string, o: Opts = {}): DayRide {
  const trip = o.trip ?? testTrip();
  return dayRide(trip, positions, o.plan ?? null, o.endDate ?? null, at(now), env(o, trip.route.lengthKm));
}
const nightAt = (km: number): Position => pos({ km, at: `${SAT} 19:00` });
const sunny18 = { sunset: '18:00', dusk: '18:35' };

// ---- moved today --------------------------------------------------------------------------------------------------

test('[DAY-MOVED] day start km 76.5: check-ins at km 76.6 and 78.4 keep before the ride, km 79.0 ends it', () => {
  const night = nightAt(76.5);
  const a = pos({ km: 76.6, at: `${SUN} 09:00` });
  const b = pos({ km: 78.4, at: `${SUN} 09:30` });
  const c = pos({ km: 79.0, at: `${SUN} 10:00` });
  expect(day([night, a], `${SUN} 09:00`).phase).toBe('before-ride');
  expect(day([night, a, b], `${SUN} 09:30`).phase).toBe('before-ride');
  expect(day([night, a, b, c], `${SUN} 10:00`).phase).toBe('riding');
  expect(day([night, a, b, c], `${SUN} 10:00`).dayStartKm).toBe(76.5);
});

test('[DAY-MOVED] a check-in 8 km off at route km 90 does not end it', () => {
  const off = pos({ km: 90, off: 8000, at: `${SUN} 10:00` });
  const r = day([nightAt(76.5), off], `${SUN} 10:00`);
  expect(r.phase).toBe('before-ride');
  expect(r.dayStartKm).toBe(76.5);
});

test('[DAY-MOVED] a night position older than 48 h is not used', () => {
  const old = pos({ km: 76.5, at: `${SAT} 08:00` });
  const r = day([old], `${MON} 10:00`); // 50 hours later, trip day 3
  expect(r.nightKm).toBeNull();
  expect(r.dayStartKm).toBe(150);
  expect(r.stopKm).toBe(222);
  const fresh = pos({ km: 76.5, at: `${SAT} 10:00` }); // exactly 48 hours
  expect(day([fresh], `${MON} 10:00`).dayStartKm).toBe(76.5);
});

// ---- day start ----------------------------------------------------------------------------------------------------

test('[DAY-START] night at km 35 from the day before; first position km 76.5 at 07:10: a night further along', () => {
  const night = pos({ km: 35, at: `${SAT} 14:00` });
  const r = day([night, pos({ km: 76.5, at: `${SUN} 07:10` })], `${SUN} 07:10`);
  expect(r.dayStartKm).toBe(76.5);
  expect(r.phase).toBe('before-ride');
  expect(r.stopKm).toBe(150);
});

test('[DAY-START] the same first position at 09:10: day start km 35, riding, stop km 78', () => {
  const night = pos({ km: 35, at: `${SAT} 14:00` });
  const r = day([night, pos({ km: 76.5, at: `${SUN} 09:10` })], `${SUN} 09:10`);
  expect(r.dayStartKm).toBe(35);
  expect(r.phase).toBe('riding');
  expect(r.stopKm).toBe(78);
});

test('[DAY-START] day 1: a hotel at km 3 at 07:00 moves the day start to km 3; at 09:00 it does not, and the rider is riding', () => {
  const early = day([pos({ km: 3, at: `${SAT} 07:00` })], `${SAT} 07:00`);
  expect(early.dayStartKm).toBe(3);
  expect(early.phase).toBe('before-ride');
  const late = day([pos({ km: 3, at: `${SAT} 09:00` })], `${SAT} 09:00`);
  expect(late.dayStartKm).toBe(0);
  expect(late.phase).toBe('riding');
});

test('[DAY-START] home 40 km off, the evening before or on day 1\'s morning, changes nothing', () => {
  const home = (when: string): Position => pos({ km: 12, off: 40_000, at: when });
  for (const positions of [[home(`${FRI} 20:00`)], [home(`${SAT} 07:30`)], [home(`${FRI} 20:00`), home(`${SAT} 07:30`)]]) {
    const r = day(positions, `${SAT} 08:00`);
    expect(r.dayStartKm).toBe(0);
    expect(r.phase).toBe('before-ride');
    expect(r.stopKm).toBe(78);
  }
});

test('[DAY-START] the 2 km test runs both ways: a night further along can also lie behind', () => {
  const r = day([nightAt(60), pos({ km: 50, at: `${SUN} 07:00` })], `${SUN} 07:00`);
  expect(r.dayStartKm).toBe(50);
});

test('[DAY-START] exactly at the daily start time is no longer before it', () => {
  const r = day([nightAt(35), pos({ km: 76.5, at: `${SUN} 08:30` })], `${SUN} 08:30`);
  expect(r.dayStartKm).toBe(35);
});

// ---- before the trip ----------------------------------------------------------------------------------------------

test('[DAY-BEFORE-TRIP] Fri 16 Oct at 16:00 and 21:00, at a hotel at km 3 or at home 40 km off: day 1 from the route start', () => {
  const hotel = pos({ km: 3, at: `${FRI} 15:00` });
  const home = pos({ km: 12, off: 40_000, at: `${FRI} 15:00` });
  for (const now of [`${FRI} 16:00`, `${FRI} 21:00`]) {
    for (const p of [hotel, home]) {
      const r = day([p], now);
      expect(r.phase).toBe('before-trip');
      expect(r.date).toBe(SAT);
      expect(r.startKm).toBe(0);
      expect(r.startOffRouteM).toBe(0);
      expect(r.departure.getTime()).toBe(at(`${SAT} 08:30`).getTime());
      expect(r.stopKm).toBe(78);
      expect(r.tomorrowKm).toBe(78);
      expect(r.tonightKm).toBeNull();
    }
  }
});

test('[DAY-BEFORE-TRIP] two days before, tomorrow is no trip day; without a position the time is the same', () => {
  const r = day([], '2026-10-15 12:00');
  expect(r.phase).toBe('before-trip');
  expect(r.tomorrowKm).toBeNull();
  expect(r.departure.getTime()).toBe(at(`${SAT} 08:30`).getTime());
});

test('[DAY-BEFORE-TRIP] no phase test runs before the trip, even after sunset or at the route end', () => {
  expect(day([pos({ km: 299, at: `${FRI} 20:00` })], `${FRI} 20:00`).phase).toBe('before-trip');
});

// ---- end 2 ---------------------------------------------------------------------------------------------------------

const began76 = nightAt(76);

test('[DAY-END2] sunset 18:00, day began at km 76: at km 149.0 the next stage\'s daylight limit is 13:22:15', () => {
  const p = pos({ km: 149, at: `${SUN} 13:00` });
  expect(day([began76, p], `${SUN} 13:22:14`, sunny18).phase).toBe('riding');
  expect(day([began76, p], `${SUN} 13:22:16`, sunny18).phase).toBe('after-ride');
});

test('[DAY-END2] at 13:00 riding; at 13:30 ended: tonight km 149.0, tomorrow km 222', () => {
  const p = pos({ km: 149, at: `${SUN} 13:00` });
  const riding = day([began76, p], `${SUN} 13:00`, sunny18);
  expect(riding.phase).toBe('riding');
  expect(riding.stopKm).toBe(150);
  const ended = day([began76, p], `${SUN} 13:30`, sunny18);
  expect(ended.phase).toBe('after-ride');
  expect(ended.tonightKm).toBe(149);
  expect(ended.tomorrowKm).toBe(222);
  expect(ended.stopKm).toBe(222);
});

const man = (km: number, hm: string): Position => pos({ km, at: `${SUN} ${hm}`, manual: true });

test('[DAY-END2-HOLD] manual km 149.0 at 13:00 and 13:30; one at km 153.5 at 14:00 keeps it ended, tonight km 153.5', () => {
  const r = day([began76, man(149, '13:00'), man(149, '13:30'), man(153.5, '14:00')], `${SUN} 14:00`, sunny18);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(153.5);
  expect(r.tomorrowKm).toBe(222);
});

test('[DAY-END2-HOLD] one at km 154.5 instead is Riding on, to km 222', () => {
  const r = day([began76, man(149, '13:00'), man(149, '13:30'), man(154.5, '14:00')], `${SUN} 14:00`, sunny18);
  expect(r.phase).toBe('riding');
  expect(r.stopKm).toBe(222);
});

test('[DAY-END2-HOLD] with only the 13:00 position the end at 13:30 holds only now, and km 153.5 is riding again', () => {
  expect(day([began76, man(149, '13:00')], `${SUN} 13:30`, sunny18).phase).toBe('after-ride');
  const r = day([began76, man(149, '13:00'), man(153.5, '14:00')], `${SUN} 14:00`, sunny18);
  expect(r.phase).toBe('riding');
  expect(r.stopKm).toBe(222);
});

test('[DAY-RIDING-ON] day start km 50: end 2 holds at km 80.5 at 14:20; a position at km 120 at 16:30 is riding again, to km 150', () => {
  const night = nightAt(50);
  const a = pos({ km: 80.5, at: `${SUN} 14:20` });
  const ended = day([night, a], `${SUN} 14:20`);
  expect(ended.phase).toBe('after-ride');
  expect(ended.tonightKm).toBe(80.5);
  // km 150 at about 18:15, after the limit of about 18:10
  const now = day([night, pos({ km: 80.5, at: `${SUN} 14:00` })], `${SUN} 14:00`);
  const s = scheduleFor(now, testTrip(), { sun: sun(), routeZones: zonesOf(300) });
  expect(formatAbout(new Date(s.atKm(150).getTime() + 20 * 60_000), BERLIN)).toBe('about 18:15');
  expect(formatAbout(fineLimit(sun()(49, 8.4, SUN), s.ridingMinTo(150))!, BERLIN)).toBe('about 18:10');
  const again = day([night, a, pos({ km: 120, at: `${SUN} 16:30` })], `${SUN} 16:30`);
  expect(again.phase).toBe('riding');
  expect(again.stopKm).toBe(150);
});

test('[DAY-RIDING-ON] an end that holds at the riding-on position or later ends the ride again', () => {
  const night = nightAt(50);
  const a = pos({ km: 80.5, at: `${SUN} 14:20` });
  const later = pos({ km: 147.5, at: `${SUN} 17:30` }); // within 3 km of km 150, km 222 far out of daylight
  const r = day([night, a, later], `${SUN} 17:30`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(147.5);
});

// ---- end 3 and Back to today ----------------------------------------------------------------------------------------

test('[DAY-END3] at 18:45, 5 km short of km 150: riding, arriving about 19:00, lights on from 18:42', () => {
  const trip = testTrip();
  const r = day([nightAt(50), pos({ km: 145, at: `${SUN} 18:45` })], `${SUN} 18:45`);
  expect(r.phase).toBe('riding');
  expect(r.stopKm).toBe(150);
  const e = { sun: sun(), routeZones: zonesOf(300) };
  const s = scheduleFor(r, trip, e);
  expect(formatAbout(s.atKm(150), BERLIN)).toBe('about 19:00');
  const status = arrivalStatus(s.atKm(150), e.sun(49, 8.4, SUN), s.ridingMinTo(150), BERLIN);
  expect(status).toEqual({ status: 'action', line: 'lights on from 18:42' });
});

test('[DAY-END3] at 19:00, 10 km short (about 19:35): ended, tonight km 140, tomorrow km 222', () => {
  const r = day([nightAt(50), pos({ km: 140, at: `${SUN} 19:00` })], `${SUN} 19:00`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(140);
  expect(r.tomorrowKm).toBe(222);
});

test('[DAY-END3] within 3 km of the stop after sunset the ride has ended; the exception is for a rider more than 3 km short', () => {
  const r = day([nightAt(50), pos({ km: 147.5, at: `${SUN} 18:50` })], `${SUN} 18:50`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(147.5);
});

test('[DAY-END3] after sunset a rider who has not moved has ended the day; before sunset not', () => {
  expect(day([nightAt(50)], `${SUN} 18:42`).phase).toBe('before-ride');
  expect(day([nightAt(50)], `${SUN} 18:42:01`).phase).toBe('after-ride');
});

test('[DAY-END3] a sunset without civil dusk never ends a rider still on the way', () => {
  const trip = testTrip();
  const e = { sun: sun({ sunset: '18:42', dusk: null }), routeZones: zonesOf(300) };
  const r = dayRide(trip, [nightAt(50), pos({ km: 100, at: `${SUN} 20:00` })], null, null, at(`${SUN} 20:00`), e);
  expect(r.phase).toBe('riding');
});

test('[DAY-END3] light all night: no sunset, no end 3, and no end 2', () => {
  const trip = testTrip();
  const e = { sun: sun({ sunset: null, dusk: null, lightAllNight: true }), routeZones: zonesOf(300) };
  const r = dayRide(trip, [nightAt(50), pos({ km: 149, at: `${SUN} 23:00` })], null, null, at(`${SUN} 23:00`), e);
  expect(r.phase).toBe('riding');
});

const backAt = (hm: string): PlanTomorrow => ({ date: SUN, backToTodayAt: at(`${SUN} ${hm}`) });

test('[DAY-BACK] after Back to today the cards plan to km 150, dark from 19:17', () => {
  const trip = testTrip();
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` })];
  expect(day(positions, `${SUN} 19:05`).phase).toBe('after-ride');
  const r = day(positions, `${SUN} 19:06`, { plan: backAt('19:05') });
  expect(r.phase).toBe('riding');
  expect(r.stopKm).toBe(150);
  expect(r.tonightKm).toBe(150);
  const e = { sun: sun(), routeZones: zonesOf(300) };
  const s = scheduleFor(r, trip, e);
  expect(arrivalStatus(s.atKm(150), e.sun(49, 8.4, SUN), s.ridingMinTo(150), BERLIN)).toEqual({ status: 'warning', line: 'dark from 19:17' });
});

test('[DAY-BACK] km 146 at 19:20, more than 5 km on, stays riding: both ends stay set aside', () => {
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` }), pos({ km: 146, at: `${SUN} 19:20` })];
  const r = day(positions, `${SUN} 19:20`, { plan: backAt('19:05') });
  expect(r.phase).toBe('riding');
  // Later still, ends stay aside until 24:00 without a position near the stop.
  expect(day(positions, `${SUN} 23:30`, { plan: backAt('19:05') }).phase).toBe('riding');
});

test('[DAY-BACK] a campsite at km 150.4 at 19:40 ends the ride: tonight km 150.4, tomorrow km 222', () => {
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` }), pos({ km: 146, at: `${SUN} 19:20` }), pos({ km: 150.4, at: `${SUN} 19:40` })];
  const r = day(positions, `${SUN} 19:40`, { plan: backAt('19:05') });
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(150.4);
  expect(r.tomorrowKm).toBe(222);
});

test('[DAY-BACK] a position within 3 km of the stop as it stood at the tap also releases the ends', () => {
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` }), pos({ km: 147, at: `${SUN} 19:30` })];
  const r = day(positions, `${SUN} 19:30`, { plan: backAt('19:05') });
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(147);
});

test('[DAY-BACK] a tap on an earlier date sets nothing aside today', () => {
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` })];
  const plan = { date: SAT, backToTodayAt: at(`${SAT} 20:00`) };
  expect(day(positions, `${SUN} 19:06`, { plan }).phase).toBe('after-ride');
});

test('[DAY-BACK] a tap when no end 2 or 3 held sets nothing aside: a later end ends the ride', () => {
  const positions = [nightAt(50), pos({ km: 140, at: `${SUN} 19:00` })];
  const plan = { date: SUN, backToTodayAt: at(`${SUN} 15:30`) };
  expect(day(positions, `${SUN} 19:06`, { plan }).phase).toBe('after-ride');
});

test('[DAY-NOW-ONLY] position at km 140 from 18:30: ended at 19:00; a position at km 146 at 19:01 (about 19:15) is riding again', () => {
  const first = pos({ km: 140, at: `${SUN} 18:30` });
  expect(day([nightAt(50), first], `${SUN} 18:30`).phase).toBe('riding');
  expect(day([nightAt(50), first], `${SUN} 19:00`).phase).toBe('after-ride');
  const positions = [nightAt(50), first, pos({ km: 146, at: `${SUN} 19:01` })];
  const r = day(positions, `${SUN} 19:01`);
  expect(r.phase).toBe('riding');
  const s = scheduleFor(r, testTrip(), { sun: sun(), routeZones: zonesOf(300) });
  expect(formatAbout(s.atKm(150), BERLIN)).toBe('about 19:15');
});

test('[DAY-NO-RIDE] night at km 50, stop km 150; km 78 at 15:30: ended, tonight km 78, tomorrow km 150, from km 78 at 08:30', () => {
  const r = day([nightAt(50), pos({ km: 78, at: `${SUN} 15:30` })], `${SUN} 15:30`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(78);
  expect(r.tomorrowKm).toBe(150);
  expect(r.stopKm).toBe(150);
  expect(r.startKm).toBe(78);
  expect(r.date).toBe(MON);
  expect(r.departure.getTime()).toBe(at(`${MON} 08:30`).getTime());
});

// ---- Plan tomorrow and rest day -------------------------------------------------------------------------------------

test('[DAY-PLAN-TOMORROW] Plan tomorrow at 15:00 holds until 24:00; Back to today undoes it', () => {
  const positions = [nightAt(50), pos({ km: 100, at: `${SUN} 14:00` })];
  const plan = { date: SUN, backToTodayAt: null };
  expect(day(positions, `${SUN} 14:59`).phase).toBe('riding');
  const held = day(positions, `${SUN} 15:00`, { plan });
  expect(held.phase).toBe('after-ride');
  expect(held.tonightKm).toBe(100);
  expect(day(positions, `${SUN} 23:59`, { plan }).phase).toBe('after-ride');
  expect(day(positions, `${MON} 00:01`, { plan }).phase).not.toBe('after-ride');
  expect(day(positions, `${SUN} 15:40`, { plan: backAt('15:30') }).phase).toBe('riding');
});

test('[DAY-PLAN-TOMORROW] rest day: every position within 2 km of the day start; offered at 15:00; after sunset tomorrow\'s plan without it', () => {
  const positions = [nightAt(50), pos({ km: 50.5, at: `${SUN} 10:00` }), pos({ km: 51.9, at: `${SUN} 15:00` })];
  const afternoon = day(positions, `${SUN} 15:00`);
  expect(afternoon.phase).toBe('before-ride');
  expect(offersPlanTomorrow(afternoon)).toBe(true);
  const night = day(positions, `${SUN} 19:00`);
  expect(night.phase).toBe('after-ride');
  expect(night.date).toBe(MON);
  expect(night.departure.getTime()).toBe(at(`${MON} 08:30`).getTime());
  expect(offersPlanTomorrow(night)).toBe(false);
});

test('[DAY-APPROX] after a night at km 37, a plus or minus 2.5 km fix at km 40.0 at 07:00 leaves day start km 37 and stop km 78', () => {
  const r = day([nightAt(37), pos({ km: 40, acc: 2500, at: `${SUN} 07:00` })], `${SUN} 07:00`);
  expect(r.dayStartKm).toBe(37);
  expect(r.stopKm).toBe(78);
  expect(r.phase).toBe('before-ride');
  // The same fix with a sharper accuracy: a night further along.
  expect(day([nightAt(37), pos({ km: 40, at: `${SUN} 07:00` })], `${SUN} 07:00`).dayStartKm).toBe(40);
  // Moved today takes the accuracy too.
  expect(day([nightAt(37), pos({ km: 40, acc: 2500, at: `${SUN} 10:00` })], `${SUN} 10:00`).phase).toBe('before-ride');
  expect(day([nightAt(37), pos({ km: 41.6, acc: 2500, at: `${SUN} 10:00` })], `${SUN} 10:00`).phase).toBe('riding');
});

test('[DAY-R-END] from the PACE-R case at km 149: km 222 at about 18:20, after the limit of about 18:10: end 2', () => {
  const ins = [nightAt(50), pos({ km: 50.2, at: `${SUN} 07:00` }), pos({ km: 98, at: `${SUN} 11:00` }), pos({ km: 149, at: `${SUN} 14:00` })];
  const r = day(ins, `${SUN} 14:00`);
  expect(r.phase).toBe('after-ride');
  expect(r.tonightKm).toBe(149);
  expect(r.r).toBeCloseTo(1.05, 2);
  // Without the correction it would not end: 14:00 + 4 h 5 min = 18:06, before the limit of about 18:10.
  const noR = day([nightAt(50), pos({ km: 149, at: `${SUN} 14:00` })], `${SUN} 14:00`);
  expect(noR.phase).toBe('riding');
});

test('[DAY-R-END] each position is judged with the correction as it stood then, and the day start stays out of it', () => {
  // A check-in later today slows r to where an earlier position's end would not have held; the earlier end still stands.
  const ins = [nightAt(50), pos({ km: 98, at: `${SUN} 11:00` }), pos({ km: 149, at: `${SUN} 14:00` }), pos({ km: 151, at: `${SUN} 14:01` })];
  expect(day(ins, `${SUN} 14:01`).phase).toBe('after-ride');
});

// ---- the route end -------------------------------------------------------------------------------------------------

test('[DAY-ROUTE-END] a position at km 298 on Monday 15:00 reaches the end', () => {
  const r = day([pos({ km: 298, at: `${MON} 15:00` })], `${MON} 15:00`);
  expect(r.phase).toBe('route-end');
  expect(r.routeEndReachedOn).toBe(MON);
  expect(r.stopKm).toBe(300);
  expect(r.tonightKm).toBe(298);
  expect(r.tomorrowKm).toBeNull();
  expect(r.startKm).toBe(298);
  expect(r.departure.getTime()).toBe(at(`${MON} 15:00`).getTime());
});

test('[DAY-ROUTE-END] within 3 km: km 297 yes, km 296.9 no; an approximate fix counts from its near edge', () => {
  expect(day([pos({ km: 297, at: `${MON} 15:00` })], `${MON} 15:00`).phase).toBe('route-end');
  expect(day([pos({ km: 296.9, at: `${MON} 15:00` })], `${MON} 15:00`).phase).not.toBe('route-end');
  expect(day([pos({ km: 298, acc: 900, at: `${MON} 15:00` })], `${MON} 15:00`).phase).toBe('route-end');
  expect(day([pos({ km: 298, acc: 1100, at: `${MON} 15:00` })], `${MON} 15:00`).phase).not.toBe('route-end');
});

test('[DAY-ROUTE-END] the stored date holds the phase with no position left, unless the departure now lies after it', () => {
  const r = day([], '2026-10-21 12:00', { endDate: MON });
  expect(r.phase).toBe('route-end');
  expect(r.tonightKm).toBe(300);
  expect(r.startKm).toBe(300);
  expect(r.tomorrowKm).toBeNull();
  expect(r.routeEndReachedOn).toBe(MON);
  expect(day([], `${SUN} 12:00`, { endDate: '2026-10-10' }).phase).not.toBe('route-end');
});

test('[DAY-ROUTE-END] 107 km route: km 106.97 at 19:44 reaches it; a position 15.2 km off at km 105.75 at 20:41 leaves tonight km 106.97', () => {
  const trip = testTrip({ route: flatRoute(107) });
  const a = pos({ km: 106.97, at: `${SAT} 19:44` });
  expect(day([a], `${SAT} 19:44`, { trip }).phase).toBe('route-end');
  const r = day([a, pos({ km: 105.75, off: 15_200, at: `${SAT} 20:41` })], `${SAT} 20:41`, { trip });
  expect(r.phase).toBe('route-end');
  expect(r.tonightKm).toBe(106.97);
  expect(r.startKm).toBe(105.75);
  expect(r.startOffRouteM).toBe(15_200);
});

test('[DAY-ROUTE-END] the loop\'s start never counts as its end', () => {
  const route = flatRoute(100);
  const loop = { ...route, points: route.points.map((p, i, all) => (i > 50 ? { ...all[100 - i]!, km: p.km } : p)) };
  const trip = testTrip({ route: loop });
  const r = day([pos({ km: 0.5, at: `${SAT} 08:00` })], `${SAT} 08:00`, { trip });
  expect(r.phase).toBe('before-ride');
  expect(r.routeEndReachedOn).toBeNull();
});

// ---- review focus ---------------------------------------------------------------------------------------------------

test('[DAY-DST] a ride on Sat 24 Oct continuing on Sun 25 Oct: the daily start stays 08:30 wall clock on Sunday (07:30 UTC)', () => {
  const trip = testTrip({ departureDate: '2026-10-24' });
  const e = { sun: sun(), routeZones: zonesOf(300) };
  // Leaving at 23:00 on Saturday: km 78 is reached in the small hours of Sunday, across the clock change.
  const late = dayRide(trip, [pos({ km: 3, at: '2026-10-24 23:00' })], null, null, at('2026-10-24 23:00'), { ...e, sun: sun({ sunset: null, dusk: null, lightAllNight: true }) });
  expect(late.phase).toBe('riding');
  const s = scheduleFor(late, trip, e);
  expect(s.atKm(78).getTime() - at('2026-10-24 23:00').getTime()).toBeCloseTo(75 * (60 / 20.5) * 1.15 * 60_000, -3);
  expect(s.rideOf(100).departure.toISOString()).toBe('2026-10-25T07:30:00.000Z');
  // After the ride on Saturday evening, the plan for Sunday.
  const ended = dayRide(trip, [pos({ km: 60, at: '2026-10-24 19:30' })], null, null, at('2026-10-24 20:00'), e);
  expect(ended.phase).toBe('after-ride');
  expect(ended.departure.toISOString()).toBe('2026-10-25T07:30:00.000Z');
  expect(ended.date).toBe('2026-10-25');
  // And on the Sunday morning itself.
  const sunday = dayRide(trip, [pos({ km: 60, at: '2026-10-24 19:30' })], null, null, at('2026-10-25 06:00'), e);
  expect(sunday.departure.toISOString()).toBe('2026-10-25T07:30:00.000Z');
});

test('[DAY-DST] riding dates change at local midnight', () => {
  expect(ridingDate(new Date('2026-10-24T21:59:59Z'), BERLIN)).toBe('2026-10-24'); // 23:59:59 CEST
  expect(ridingDate(new Date('2026-10-24T22:00:00Z'), BERLIN)).toBe('2026-10-25'); // 00:00 CEST
  expect(ridingDate(new Date('2026-10-25T22:59:59Z'), BERLIN)).toBe('2026-10-25'); // 23:59:59 CET, a day of 25 hours
  expect(ridingDate(new Date('2026-10-25T23:00:00Z'), BERLIN)).toBe('2026-10-26');
});

test('[DAY-FUTURE-POS] a position stamped 20 min after now is counted, with age 0, and nothing negative', () => {
  const r = day([nightAt(50), pos({ km: 90, at: `${SUN} 14:20` })], `${SUN} 14:00`);
  expect(r.phase).toBe('riding');
  expect(r.startKm).toBe(90);
  expect(r.departure.getTime()).toBe(at(`${SUN} 14:00`).getTime());
  expect(r.startOffRouteM).toBeGreaterThanOrEqual(0);
  expect(r.nightKm).toBe(90);
  expect(r.r).toBeGreaterThan(0);
});

test('[DAY-FUTURE-POS] one stamped past midnight still counts for the date of now', () => {
  const r = day([nightAt(50), pos({ km: 90, at: `${MON} 00:10` })], `${SUN} 23:50`);
  expect(r.date).toBe(MON); // after sunset: tomorrow's ride
  expect(r.tonightKm).toBe(90);
  expect(r.startKm).toBe(90);
});

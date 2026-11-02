import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { formatLeaveBy } from '../../../../src/core/answers/time.ts';
import { fineLimit } from '../../../../src/core/engines/daylight.ts';
import { closureApplies, leaveBy, limitFor, type LeaveBy, type LeaveFacts } from '../../../../src/core/engines/leaveby.ts';
import { openOnArrival, openWaterWindow } from '../../../../src/core/hours/check.ts';
import { rejoinKm } from '../../../../src/core/engines/locate.ts';
import { findS1S2 } from '../../../../src/core/engines/water.ts';
import { pointAtRouteKm } from '../../../../src/core/geo/project.ts';
import type { Place, PlaceHours, RouteMatch, ZoneSpan } from '../../../../src/core/types.ts';
import { at, bakery, cafe, flatRoute, fuelShop, kiosk, pos, restaurant, shop, supermarket, tap, testTrip } from '../../../fixtures/build.ts';
import { hoursValue } from '../../../gen/index.ts';
import { dayTo, FRI, leaveFacts, near, preparedHours, SAT, TAPS, type LeaveCase } from './leaveby-helpers.ts';
import type { Spot } from './water-helpers.ts';

const SUNSET_17 = { sunset: '17:00', dusk: '17:35' };
const lb = (c: LeaveCase): LeaveBy => {
  const f = leaveFacts(c);
  return leaveBy(f, f.ride);
};
const about = (d: Date | null): string => formatLeaveBy(d!, 'Europe/Berlin');
const daylightCase = (more: Spot[] = []): LeaveCase => ({ sun: SUNSET_17, spots: [...TAPS, ...more] });
const SHOP_30 = { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 };

describe('the worked cases of section 6.12', () => {
  test('[LB-DAYLIGHT] 90 km, sunset 17:00: riding 263.4 min, clock 302.9, margin 39.5, leave by 11:17:34, about 11:15', () => {
    const f = leaveFacts(daylightCase());
    const r = leaveBy(f, f.ride);
    const s = f.schedule;
    expect(s.ridingMinTo(90)).toBeCloseTo(263.4, 1);
    expect(s.clockMinBetween(0, 90)).toBeCloseTo(302.9, 1);
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(about(r.unrounded)).toBe('about 11:15');
    expect(r.binding).toBe('daylight');
    expect(r.kept).toEqual(['daylight']);
    expect(r.setAside.map((s) => s.id)).toEqual(['food-closure']);
  });

  test('[LB-CLOSURE] nothing open next day: a supermarket at km 30 closing 12:00 means leaving by 09:49:01, about 09:45', () => {
    const r = lb(daylightCase([SHOP_30]));
    expect(near(r.unrounded, `${SAT} 09:49:01`)).toBe(true);
    expect(about(r.unrounded)).toBe('about 09:45');
    expect(r.binding).toBe('food');
    expect(r.kept).toContain('food-closure');
    expect(r.limits[0]!.id).toBe('food-closure');
    expect(r.limits[0]!.place).toBe('supermarket at km 30');
    expect(r.closure).toBe(true);
  });

  test('[LB-LATEST-SHOP] a supermarket at km 60 open to 20:00 as well: daylight binds again', () => {
    const r = lb(daylightCase([SHOP_30, { b: supermarket('Mo-Sa 08:00-20:00'), km: 60 }]));
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(about(r.unrounded)).toBe('about 11:15');
    expect(r.binding).toBe('daylight');
  });

  test('[LB-LUNCH] the afternoon window lies after the daylight limit, so the morning one counts', () => {
    const r = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-12:00,15:00-19:00'), km: 30 }]));
    expect(near(r.unrounded, `${SAT} 09:49:01`)).toBe(true);
    expect(about(r.unrounded)).toBe('about 09:45');
    expect(r.binding).toBe('food');
    expect(near(r.limits.find((l) => l.id === 'food-closure')!.latest, `${SAT} 09:49:01`)).toBe(true);
  });

  test('[LB-DETOUR] 400 m off: 09:47:16, and the daylight limit moves 3.5 min earlier for the round trip', () => {
    const r = lb(daylightCase([{ ...SHOP_30, off: 400 }]));
    expect(near(r.unrounded, `${SAT} 09:47:16`)).toBe(true);
    const moved = new Date(at(`${SAT} 11:17:34`).getTime() - 3.5 * 60_000);
    const daylight = r.limits.find((l) => l.id === 'daylight')!.latest!;
    expect(Math.abs(daylight.getTime() - moved.getTime())).toBeLessThanOrEqual(1000);
    expect(r.stops.map((m) => m.km)).toEqual([30]);
  });

  test('[LB-DETOUR] the shop met off the route, when daylight binds: leave-by itself moves 3.5 min', () => {
    const r = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-20:00'), km: 30, off: 400 }]));
    const moved = at(`${SAT} 11:17:34`).getTime() - 3.5 * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - moved)).toBeLessThanOrEqual(1000);
    expect(r.binding).toBe('daylight');
  });

  test('[LB-DETOUR] a shop on the route beats one off it when both meet the limit: no round trip is added', () => {
    const r = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-20:00'), km: 30, off: 400 }, { b: supermarket('Mo-Sa 08:00-20:00'), km: 40 }]));
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(r.stops).toEqual([]);
  });

  test('[LB-UNKNOWN] a shop without hours is not counted, and the reason says so', () => {
    const r = lb({ ...daylightCase([{ b: supermarket(null), km: 30 }]), now: `${SAT} 07:00` });
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(r.binding).toBe('daylight');
    expect(r.notCounted).toBe(1);
    expect(r.setAside).toEqual([{ id: 'food-closure', why: "No food shop on today's ride is mapped as open before Sunday · 1 shop with unknown hours" }]);
  });

  test('[LB-HOLIDAY] 3 June 2026: closure with the stop in Baden-Württemberg (Corpus Christi), not in Alsace', () => {
    const wed = '2026-06-03';
    const zones = (holidayZone: string, country: string): ZoneSpan[] => [{ fromKm: 0, toKm: 400, timeZone: 'Europe/Berlin', holidayZone, country }];
    const holidays = { 'DE-BW': ['2026-06-04'], 'FR-67': ['2026-05-14'] };
    const c = (z: ZoneSpan[]): LeaveCase => ({
      trip: dayTo(90, { departureDate: wed }), now: '2026-06-02 20:00', sun: SUNSET_17, zones: z, holidays,
      spots: [...TAPS, { b: supermarket('Mo-Fr 08:00-12:00'), km: 30 }],
    });
    const bw = lb(c(zones('DE-BW', 'DE')));
    expect(bw.closure).toBe(true);
    expect(near(bw.unrounded, `${wed} 09:49:01`)).toBe(true);
    const alsace = lb(c(zones('FR-67', 'FR')));
    expect(alsace.closure).toBe(false);
    expect(near(alsace.unrounded, `${wed} 11:17:34`)).toBe(true);
  });

  test('[LB-HOLIDAY] a zone named like an object member is no holiday and does not throw', () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 400, timeZone: 'Europe/Berlin', holidayZone: 'constructor', country: 'DE' }];
    const r = lb({ trip: dayTo(90, { departureDate: '2026-06-03' }), now: '2026-06-02 20:00', sun: SUNSET_17, zones, holidays: {}, spots: TAPS });
    expect(r.closure).toBe(false);
  });

  test('[LB-WATER] S1 a bakery at km 12, open 06:00-12:00: leave-by at most 10:49:37', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-12:00'), km: 12 }, { b: tap(), km: 50 }] });
    expect(near(r.unrounded, `${SAT} 10:49:37`)).toBe(true);
    expect(r.binding).toBe('water');
    expect(r.kept).toContain('water');
  });

  test('[LB-WATER] an outdoor class A tap as S1 adds no limit, and neither does a bakery 5 km past the stop', () => {
    expect(lb({ sun: SUNSET_17, spots: [{ b: tap(), km: 12 }] }).kept).toEqual(['daylight']);
    const past = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-12:00'), km: 95 }] });
    expect(past.kept).toEqual(['daylight']);
    expect(near(past.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(past.limits.filter((l) => l.id === 'water')).toEqual([]);
  });

  test('[LB-WATER] two sources off the route: the second adds the first one\'s round trip, as does daylight', () => {
    const r = lb({
      sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-18:00', { waterClass: null }), km: 10, off: 400 }, { b: cafe('Mo-Su 06:00-12:00'), km: 20 }],
    });
    // The café must be open until arrival + 30 min: 11:30, by a clock of 67.32 min from the start plus the 3.5 min round trip.
    const byCafe = at(`${SAT} 11:30`).getTime() - (20 / 20.5) * 60 * 1.15 * 60_000 - 3.5 * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - byCafe)).toBeLessThanOrEqual(1000);
    expect(r.stops.map((m) => m.km)).toEqual([10]);
  });

  test('[LB-CLASH] food set aside, 11:17:34, and the expanded view says why', () => {
    const r = lb({
      sun: SUNSET_17,
      spots: [{ b: bakery('Mo-Su 07:00-11:00'), km: 80 }, { b: cafe('Mo-Su 08:00-18:00'), km: 10 }, { b: tap(), km: 50 }],
    });
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
    expect(about(r.unrounded)).toBe('about 11:15');
    expect(r.kept).toEqual(['daylight', 'water']);
    expect(r.setAside).toEqual([{ id: 'food-closure', why: "The bakery at km 80, open until 11:00, can't be reached on a departure that suits the water plan" }]);
  });

  test('[LB-CLASH] water that cannot be met with daylight is set aside, and food kept when that then works', () => {
    // 150 km means leaving by 07:29; the café suits the usual 08:30 start, and opens too late for that.
    const r = lb({ trip: dayTo(150), sun: SUNSET_17, spots: [{ b: cafe('Mo-Su 08:30-18:00'), km: 10 }, { b: tap(), km: 50 }, { b: supermarket('Mo-Sa 08:00-20:00'), km: 60 }] });
    expect(r.kept).toEqual(['daylight', 'food-closure']);
    expect(r.setAside.map((s) => s.id)).toEqual(['water']);
    expect(r.setAside[0]!.why).toContain("can't be reached on a departure");
  });

  test('[LB-NO-DAYLIGHT] tomorrow, 240 km: no leave-by, and a 04:00 arrival of about 17:30', () => {
    const r = lb({ trip: dayTo(240), spots: TAPS });
    expect(r.unrounded).toBeNull();
    expect(r.binding).toBeNull();
    expect(near(r.earliest, `${SAT} 04:00`)).toBe(true);
    expect(formatLeaveBy(new Date(r.earliestArrival!.getTime() + 150_000), 'Europe/Berlin')).toBe('about 17:30');
  });

  test('[LB-LAST-DAY] the stop is the route end, next day Sunday with nothing open: no closure, daylight binds', () => {
    const r = lb({ trip: testTrip({ route: flatRoute(90), stay: 'accommodation' }), sun: SUNSET_17, spots: [...TAPS, SHOP_30] });
    expect(r.closure).toBe(false);
    expect(r.kept).toEqual(['daylight']);
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
  });

  test('[LB-APPROX] +-800 m at km 76 is computed from km 75.2, and a shop inside the radius sets no limit', () => {
    const trip = testTrip({ departureDate: FRI, stay: 'accommodation' });
    const positions = [pos({ km: 76, at: `${FRI} 19:10` }), pos({ km: 76, at: `${SAT} 07:00`, acc: 800 })];
    const f = leaveFacts({ trip, positions, now: `${SAT} 07:10`, spots: [...['n901', 'n902'].map((id, i) => ({ b: tap(), km: 80 + i, id })), { b: supermarket('Mo-Sa 08:00-10:00'), km: 75.6 }] });
    expect(f.ride.startKm).toBeCloseTo(75.2, 6);
    const r = leaveBy(f, f.ride);
    const riding = ((150 - 75.2) / 20.5) * 60;
    const expected = at(`${SAT} 18:42`).getTime() - (Math.max(30, riding * 0.15) + riding * 1.15) * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - expected)).toBeLessThanOrEqual(1000);
    expect(r.kept).toEqual(['daylight']);
  });

  test('[LB-NIGHT] camping, no closure: a food shop on the ride sets food for tonight', () => {
    const r = lb({ trip: dayTo(90, { stay: 'camping', departureDate: '2026-10-20' }), now: '2026-10-19 20:00', sun: SUNSET_17, spots: [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    expect(r.kept).toContain('food-tonight');
    expect(near(r.unrounded, '2026-10-20 09:49:01')).toBe(true);
    expect(r.binding).toBe('food');
  });

  test('[LB-NIGHT] a restaurant within 1 km of the stop counts for tonight, one 1.2 km away does not, and a café mid-ride does not', () => {
    const tue = '2026-10-20';
    const c = (spot: Spot): LeaveBy => lb({ trip: dayTo(90, { stay: 'mixed', departureDate: tue }), now: '2026-10-19 20:00', sun: SUNSET_17, spots: [...TAPS, spot] });
    expect(c({ b: restaurant('Mo-Su 16:00-22:00'), km: 89.2 }).kept).toContain('food-tonight');
    expect(c({ b: restaurant('Mo-Su 16:00-22:00'), km: 88.8 }).kept).not.toContain('food-tonight');
    expect(c({ b: cafe('Mo-Su 06:00-22:00'), km: 40 }).kept).not.toContain('food-tonight');
  });

  test('[LB-NIGHT] food for tonight only for camping and mixed, and never beside the closure', () => {
    const tue = '2026-10-20';
    const shopAt = [...TAPS, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }];
    const stay = (s: 'camping' | 'mixed' | 'accommodation'): LeaveBy => lb({ trip: dayTo(90, { stay: s, departureDate: tue }), now: '2026-10-19 20:00', sun: SUNSET_17, spots: shopAt });
    expect(stay('accommodation').kept).toEqual(['daylight']);
    expect(stay('mixed').kept).toContain('food-tonight');
    const sat = lb({ trip: dayTo(90, { stay: 'camping' }), sun: SUNSET_17, spots: shopAt });
    expect(sat.kept).toContain('food-closure');
    expect(sat.limits.map((l) => l.id)).not.toContain('food-tonight');
  });

  test('[LB-AT-STOP] a shop 0.8 km past the stop counts and is reached riding on', () => {
    const r = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-16:00'), km: 90.8 }]));
    const clock = (90.8 / 20.5) * 60 * 1.15;
    const expected = at(`${SAT} 15:30`).getTime() - clock * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - expected)).toBeLessThanOrEqual(1000);
    expect(r.binding).toBe('food');
  });

  test('[LB-AT-STOP] one exactly 1.0 km past counts; 1.1 km does not, and then it lies on the next day\'s ride', () => {
    expect(lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-16:00'), km: 91 }])).binding).toBe('food');
    const far = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-16:00'), km: 91.1 }]));
    expect(far.binding).toBe('daylight');
    expect(far.setAside.map((s) => s.id)).toEqual(['food-closure']);
    // Open on the next day's ride, it lifts the closure altogether.
    expect(lb(daylightCase([{ b: supermarket('Mo-Su 08:00-16:00'), km: 91.1 }])).closure).toBe(false);
  });

  test('[LB-AT-STOP] a shop past the stop adds no round trip to the arrival at the stop', () => {
    const r = lb(daylightCase([{ b: supermarket('Mo-Sa 08:00-20:00'), km: 90.8, off: 400 }]));
    expect(near(r.unrounded, `${SAT} 11:17:34`)).toBe(true);
  });
});

describe('what never counts, and bad data', () => {
  test('[LB-UNKNOWN] may-be-open and possibly-closed hours are not counted', () => {
    const spanned = (p: Place, state: 'unknown' | 'possibly-closed'): PlaceHours => {
      const h = preparedHours(p);
      return { ...h, spans: [{ from: h.windowStart, to: h.windowEnd, state, reason: 'x' }] };
    };
    for (const state of ['unknown', 'possibly-closed'] as const) {
      const b = supermarket('Mo-Su 08:00-12:00');
      const p = b.atKm(30, { id: 'n77' });
      const f = leaveFacts({ ...daylightCase([{ b, km: 30, id: 'n77' }]), hours: [spanned(p, state)] });
      const r = leaveBy(f, f.ride);
      expect(r.binding).toBe('daylight');
      expect(r.notCounted).toBe(1);
    }
  });

  test('[LB-DAYLIGHT] sun times that are no times read as not known, never as a good time', () => {
    const f = leaveFacts(daylightCase());
    const bad: LeaveFacts = { ...f, sun: () => ({ dawn: null, sunrise: null, sunset: new Date(Number.NaN), dusk: new Date(Number.NaN), lightAllNight: false }) };
    const r = leaveBy(bad, bad.ride);
    expect(r.unrounded).toBeNull();
    expect(r.binding).toBeNull();
    expect(r.kept).toEqual([]);
    expect(r.earliestArrival).toBeNull();
  });

  test('[LB-DAYLIGHT] a flat speed outside 15-40 gives no leave-by', () => {
    for (const flatKph of [0, Number.NaN, 400]) {
      const f = leaveFacts({ ...daylightCase(), trip: dayTo(90, { flatKph }) });
      const r = leaveBy(f, f.ride);
      expect(r.unrounded).toBeNull();
      expect(r.earliestArrival).toBeNull();
    }
  });

  test('[LB-DEGRADED] broken matches, and a broken first one, decide nothing', () => {
    const base = leaveFacts(daylightCase([SHOP_30]));
    const broken: LeaveFacts = { ...base, matches: [{ placeId: base.places[2]!.id, km: Number.NaN, offRouteM: 0 }, { placeId: base.places[2]!.id, km: 5, offRouteM: Number.NaN }, ...base.matches] };
    expect(leaveBy(broken, broken.ride).unrounded!.getTime()).toBe(leaveBy(base, base.ride).unrounded!.getTime());
  });

  test('[LB-DEGRADED] shop tags from strangers: constructor and __proto__ are simply no food shop', () => {
    const odd = [{ b: shop('Mo-Sa 08:00-12:00', { tags: { shop: 'constructor' } }), km: 30 }, { b: shop('Mo-Sa 08:00-12:00', { tags: { shop: '__proto__' } }), km: 31 }];
    const r = lb(daylightCase(odd));
    expect(r.binding).toBe('daylight');
    expect(r.limits.filter((l) => l.id === 'food-closure' && l.place !== null)).toEqual([]);
  });

  test('[LB-DEGRADED] a place zone the phone does not know does not throw', () => {
    const good = leaveFacts(daylightCase([SHOP_30]));
    const odd: LeaveFacts = { ...good, places: good.places.map((p) => ({ ...p, timeZone: 'Mars/Olympus' })) };
    const r = leaveBy(odd, odd.ride);
    expect(near(r.unrounded, `${SAT} 09:49:01`)).toBe(true);
  });

  test('[LB-DAYLIGHT] an unknown departure date gives no leave-by', () => {
    const f = leaveFacts({ ...daylightCase(), trip: dayTo(90, { departureDate: null }) });
    expect(leaveBy(f, f.ride).unrounded).toBeNull();
  });

  test('[LB-NIGHT] kinds that are food shops: supermarket, convenience, bakery, kiosk, fuel-station shop', () => {
    for (const b of [supermarket, shop, bakery, kiosk, fuelShop]) {
      expect(lb(daylightCase([{ b: b('Mo-Sa 08:00-12:00'), km: 30 }])).binding).toBe('food');
    }
    expect(lb(daylightCase([{ b: restaurant('Mo-Sa 08:00-12:00'), km: 30 }])).binding).toBe('daylight');
    // A fuel station without a shop is no shop.
    expect(lb(daylightCase([{ b: fuelShop('Mo-Sa 08:00-12:00', { tags: { shop: 'no' } }), km: 30 }])).binding).toBe('daylight');
  });

  test('[LB-WATER] the limit of the realistic rounded stop: a match a metre before the stop counts as before it', () => {
    const r = lb({ trip: dayTo(90.0004), sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-16:00'), km: 90 }, { b: tap(), km: 95 }] });
    expect(r.limits.some((l) => l.id === 'water')).toBe(true);
  });
});

describe('a clock change', () => {
  test('[LB-DAYLIGHT] the ride on Sunday 25 October, when clocks go back at 03:00: 04:00 onward is on the new clock', () => {
    const sun25 = '2026-10-25';
    const r = lb({ trip: dayTo(90, { departureDate: sun25 }), now: '2026-10-24 20:00', sun: SUNSET_17, spots: TAPS });
    expect(near(r.unrounded, `${sun25} 11:17:34`)).toBe(true);
    expect(near(r.earliest, `${sun25} 04:00`)).toBe(true);
  });
  test('[LB-CLOSURE] closing hours across it read on the place\'s clock', () => {
    const sat24 = '2026-10-24';
    const r = lb({ trip: dayTo(90, { departureDate: sat24 }), now: '2026-10-23 20:00', sun: SUNSET_17, spots: [...TAPS, SHOP_30] });
    expect(near(r.unrounded, `${sat24} 09:49:01`)).toBe(true);
  });
});

describe('limits met together', () => {
  test('[LB-CLASH] water asks for 30 minutes before the arrival too: 07:56 from a café opening 08:00, past a bakery that needs 07:45', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 07:00-12:44'), km: 80 }, { b: cafe('Mo-Su 08:00-18:00'), km: 10 }, { b: tap(), km: 50 }] });
    expect(r.kept).toEqual(['daylight', 'water']);
  });
  test('[LB-DETOUR] two food places meet it at one departure: the one on the route, so no round trip', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-12:00'), km: 12 }, { b: tap(), km: 20 }, { b: supermarket('Mo-Sa 08:00-20:00'), km: 30, off: 400, id: 'n1' }, { b: supermarket('Mo-Sa 08:00-20:00'), km: 30, id: 'n2' }] });
    expect(near(r.unrounded, `${SAT} 10:49:37`)).toBe(true);
    expect(r.stops).toEqual([]);
  });
  test('[LB-WATER] a source\'s own latest is no later than daylight allows: its afternoon opening does not read as the limit', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Su 06:00-12:00,15:00-20:00'), km: 12 }, { b: tap(), km: 50 }] });
    expect(near(r.limits.find((l) => l.id === 'water')!.latest, `${SAT} 10:49:37`)).toBe(true);
  });
  test('[LB-UNKNOWN] a shop open only outside 04:00-24:00 is "no food shop mapped as open", not a clash', () => {
    const r = lb(daylightCase([{ b: supermarket('Sa 00:30-01:30'), km: 3 }]));
    expect(r.setAside[0]!.why).toBe('No food shop on day 1\'s ride is mapped as open before Sunday');
  });
  test('[LB-CLOSURE] the expanded view lists the best two, a supermarket first', () => {
    const r = lb(daylightCase([{ b: bakery('Mo-Sa 08:00-20:00'), km: 60 }, { b: supermarket('Mo-Sa 08:00-20:00'), km: 30 }, { b: kiosk('Mo-Sa 08:00-13:00'), km: 40 }]));
    expect(r.limits.filter((l) => l.id === 'food-closure').map((l) => l.place)).toEqual(['supermarket at km 30', 'bakery at km 60']);
  });
  test('[LB-SINGLE-DAY-RIDE] at the route end there is no leave-by, also when asked directly', () => {
    const f = leaveFacts({ trip: testTrip(), now: '2026-10-19 15:00', positions: [pos({ km: 298, at: '2026-10-19 15:00' })] });
    expect(f.ride.phase).toBe('route-end');
    expect(leaveBy(f, f.ride).unrounded).toBeNull();
  });
  test('[LB-WATER] a food place past a water source off the route: its arrival adds the source\'s round trip', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: cafe('Mo-Su 06:00-18:00'), km: 10, off: 400 }, { b: tap(), km: 12 }, { b: supermarket('Mo-Sa 08:00-12:00'), km: 30 }] });
    const expected = at(`${SAT} 11:30`).getTime() - ((30 / 20.5) * 60 * 1.15 + 3.5) * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - expected)).toBeLessThanOrEqual(1000);
    expect(r.kept).toEqual(['daylight', 'water', 'food-closure']);
  });
  test('[LB-WATER] one place that is both S1 and the food limit adds its round trip once', () => {
    const r = lb({ sun: SUNSET_17, spots: [{ b: bakery('Mo-Sa 06:00-20:00'), km: 30, off: 400 }, { b: tap(), km: 35 }] });
    const moved = at(`${SAT} 11:17:34`).getTime() - 3.5 * 60_000;
    expect(Math.abs(r.unrounded!.getTime() - moved)).toBeLessThanOrEqual(1000);
  });
});

describe('limitFor', () => {
  test('[LB-CLOSURE] limitFor reads the same limit: meets up to its latest departure and not after', () => {
    const f = leaveFacts(daylightCase([SHOP_30]));
    const l = limitFor('food-closure', f);
    expect(near(l.latest, `${SAT} 09:49:01`)).toBe(true);
    expect(l.meets(l.latest!)).toBe(true);
    expect(l.meets(new Date(l.latest!.getTime() + 1000))).toBe(false);
    expect(limitFor('water', f).latest).toBeNull();
    const d = limitFor('daylight', f);
    expect(near(d.latest, `${SAT} 11:17:34`)).toBe(true);
    expect(d.meets(d.latest!)).toBe(true);
    expect(d.meets(new Date(d.latest!.getTime() + 1000))).toBe(false);
  });
});

// ---- properties ---------------------------------------------------------------------------------------------------

const FOOD_SHOPS = new Set(['supermarket', 'convenience', 'bakery', 'kiosk']);
const isFoodShop = (p: Place): boolean => (p.kind === 'shop' && FOOD_SHOPS.has(p.tags['shop'] ?? '')) || (p.kind === 'fuel_shop' && (p.tags['shop'] ?? 'no') !== 'no');

/** Written apart from the engine: one minute-free reading of the limits at one departure, by the Schedule and hours check alone. */
function oracle(f: LeaveFacts, r: LeaveBy) {
  const { ride } = f;
  const stop = ride.stopKm;
  const hoursOfId = new Map(f.hours.map((h) => [h.placeId, h]));
  const byId = new Map(f.places.map((p) => [p.id, p]));
  const pt = pointAtRouteKm(f.trip.route, stop);
  const sunNow = f.sun(pt.lat, pt.lon, ride.date);
  const limit = fineLimit(sunNow, f.schedule.ridingMinTo(stop));
  const water = f.ride.phase === 'after-ride' ? findS1S2(f, { tomorrowOnly: true }) : findS1S2(f);
  const waterStops = r.kept.includes('water') ? [water.s1, water.s2].flatMap((t) => (t.kind === 'place' && t.km < stop && !(t.place.waterClass === 'A' && !t.place.indoorOrLimited) ? [t.match] : [])) : [];
  const shops = f.matches.filter((m) => {
    const p = byId.get(m.placeId);
    return p && isFoodShop(p) && m.km >= ride.startKm && m.km <= stop + 1;
  });
  const arrivalAt = (d: Date, stops: RouteMatch[], m: RouteMatch): Date => {
    let s = f.schedule.withDeparture(d);
    for (const x of stops) if (x.km < stop) s = s.through(x);
    if (m.km <= stop) return s.atPlace(m);
    return new Date(s.ridingOnAt(m.km).getTime() + (rejoinKm(m.offRouteM) / (25 * 0.82)) * 60 * 1.15 * 60_000);
  };
  const meetsWith = (d: Date, food: RouteMatch | null): boolean => {
    const stops = food && !waterStops.some((w) => w.placeId === food.placeId && w.km === food.km) ? [...waterStops, food] : waterStops;
    if (r.kept.includes('daylight')) {
      let s = f.schedule.withDeparture(d);
      for (const x of stops) if (x.km < stop) s = s.through(x);
      if (!limit || s.atKm(stop).getTime() > limit.getTime()) return false;
    }
    for (const w of waterStops) if (!openWaterWindow(hoursOfId.get(w.placeId), arrivalAt(d, stops, w))) return false;
    return food === null || openOnArrival(hoursOfId.get(food.placeId), arrivalAt(d, stops, food));
  };
  const needsFood = r.kept.includes('food-closure') || r.kept.includes('food-tonight');
  return (d: Date): boolean => (needsFood ? shops.some((m) => meetsWith(d, m)) : meetsWith(d, null));
}

const genCase = fc.record({
  stop: fc.integer({ min: 20, max: 180 }), sunset: fc.integer({ min: 15, max: 20 }),
  shops: fc.array(fc.record({ km: fc.double({ min: 1, max: 200, noNaN: true }), off: fc.constantFrom(0, 0, 200, 400, 900), tag: hoursValue(), kind: fc.constantFrom('super', 'bakery', 'fuel', 'cafe') }), { maxLength: 5 }),
  stay: fc.constantFrom('camping', 'mixed', 'accommodation'),
  phase: fc.constantFrom('before-trip', 'before-ride', 'after-ride', 'riding'),
});
type Gen = { stop: number; sunset: number; shops: { km: number; off: number; tag: string; kind: string }[]; stay: string; phase: string };

function factsFromGen(g: Gen): LeaveFacts {
  const builders = new Map([['super', supermarket], ['bakery', bakery], ['fuel', fuelShop], ['cafe', cafe]]);
  const spots: Spot[] = g.shops.map((s, i) => ({ b: builders.get(s.kind)!(s.tag), km: s.km, off: s.off, id: `n${i + 1}` }));
  const trip = testTrip({ route: flatRoute(600, { stageEnds: [g.stop, g.stop + 120, g.stop + 240] }), stay: g.stay as 'camping', departureDate: g.phase === 'before-trip' ? SAT : FRI });
  const sunset = { sunset: `${g.sunset}:00`, dusk: `${g.sunset}:35` };
  if (g.phase === 'before-trip') return leaveFacts({ trip, spots, sun: sunset, now: `${FRI} 20:00` });
  const dayOne = { positions: [pos({ km: 0, at: `${FRI} 08:00` })], plan: null };
  if (g.phase === 'before-ride') return leaveFacts({ trip, spots, sun: sunset, now: `${SAT} 06:00`, positions: [pos({ km: 1, at: `${FRI} 20:00` })] });
  if (g.phase === 'after-ride') return leaveFacts({ trip, spots, sun: sunset, now: `${FRI} 15:00`, ...dayOne, plan: { date: FRI, backToTodayAt: null } });
  return leaveFacts({ trip, spots, sun: sunset, now: `${FRI} 10:00`, positions: [pos({ km: 0, at: `${FRI} 07:00` }), pos({ km: 5, at: `${FRI} 10:00` })] });
}

const later = (d: Date, stepMin: number, end: number): Date[] => {
  const out: Date[] = [];
  for (let t = d.getTime() + 1000; t <= d.getTime() + 6 * 3_600_000 && t <= end; t += stepMin * 60_000) out.push(new Date(t));
  return out;
};
const dayEnd = (date: string): number => at(`${date} 23:59:59`).getTime();

describe('properties', () => {
  fcTest.prop([genCase])('[LB-PROP-MEETS] the leave-by meets every limit kept; every later departure breaks one; shown 0-5 min before it', (g) => {
    const f = factsFromGen(g);
    const r = leaveBy(f, f.ride);
    if (r.unrounded === null) return;
    const meets = oracle(f, r);
    expect(meets(r.unrounded)).toBe(true);
    for (const d of later(r.unrounded, 7, dayEnd(f.ride.date))) expect(meets(d)).toBe(false);
    const tz = 'Europe/Berlin';
    const shown = /(\d\d):(\d\d)/.exec(formatLeaveBy(r.unrounded, tz))!;
    const shownAt = at(`${f.ride.date} ${shown[1]}:${shown[2]}`, tz).getTime();
    expect(r.unrounded.getTime() - shownAt).toBeGreaterThanOrEqual(0);
    expect(r.unrounded.getTime() - shownAt).toBeLessThan(5 * 60_000);
  }, 60_000);

  fcTest.prop([genCase])('[LB-PROP-NONE] with no leave-by, no departure from 04:00 meets daylight', (g) => {
    const f = factsFromGen(g);
    const r = leaveBy(f, f.ride);
    if (r.unrounded !== null) return;
    const pt = pointAtRouteKm(f.trip.route, f.ride.stopKm);
    const limit = fineLimit(f.sun(pt.lat, pt.lon, f.ride.date), f.schedule.ridingMinTo(f.ride.stopKm))!;
    const zero = at(`${f.ride.date} 04:00`);
    expect(f.schedule.withDeparture(zero).atKm(f.ride.stopKm).getTime()).toBeGreaterThan(limit.getTime());
  }, 60_000);

  test('[LB-PROP-NONE] a long ride, by hand: no leave-by exactly when 04:00 misses the limit', () => {
    const f = leaveFacts({ trip: dayTo(240), spots: TAPS });
    const pt = pointAtRouteKm(f.trip.route, 240);
    const limit = fineLimit(f.sun(pt.lat, pt.lon, f.ride.date), f.schedule.ridingMinTo(240))!;
    expect(f.schedule.withDeparture(at(`${SAT} 04:00`)).atKm(240).getTime()).toBeGreaterThan(limit.getTime());
    expect(leaveBy(f, f.ride).unrounded).toBeNull();
  });

  fcTest.prop([genCase])('[LB-PROP-UNKNOWN] places with unknown, may-be-open or possibly-closed hours never set it', (g) => {
    const f = factsFromGen(g);
    const base = leaveBy(f, f.ride);
    const extra = (['unknown', 'possibly-closed', 'none'] as const).map((state, i) => {
      const b = i === 0 ? supermarket('x') : i === 1 ? bakery('x') : fuelShop('x');
      const p = b.atKm(5 + i * 7, { id: `n9${i}` });
      const m: RouteMatch = { placeId: p.id, km: 5 + i * 7, offRouteM: 0 };
      const h = preparedHours(p, null);
      return { p, m, h: state === 'none' ? null : { ...h, spans: [{ from: h.windowStart, to: h.windowEnd, state, reason: 'x' }] } };
    });
    const more: LeaveFacts = { ...f, places: [...f.places, ...extra.map((e) => e.p)], matches: [...f.matches, ...extra.map((e) => e.m)], hours: [...f.hours, ...extra.flatMap((e) => (e.h ? [e.h] : []))] };
    const r = leaveBy(more, more.ride);
    expect(r.unrounded?.getTime()).toBe(base.unrounded?.getTime());
    expect(r.binding).toBe(base.binding);
    expect(r.closure).toBe(base.closure);
  }, 60_000);

  fcTest.prop([genCase])('[LB-PROP-S1S2] the water-plan sources are the Water card\'s S1 and S2 for the same ride; after the ride, without tonight\'s water', (g) => {
    const f = factsFromGen(g);
    const r = leaveBy(f, f.ride);
    const { s1, s2 } = f.ride.phase === 'after-ride' ? findS1S2(f, { tomorrowOnly: true }) : findS1S2(f);
    const allowed = [s1, s2].flatMap((t) => (t.kind === 'place' && t.km < f.ride.stopKm && !(t.place.waterClass === 'A' && !t.place.indoorOrLimited) ? [t.place.id] : []));
    expect([...r.waterSources].sort()).toEqual([...new Set(allowed)].sort());
  }, 60_000);

  test('[LB-PROP-S1S2] after the ride, tonight\'s water adds no limit: S1 and S2 are tomorrow\'s alone', () => {
    const trip = testTrip({ departureDate: FRI, stay: 'accommodation' });
    const f = leaveFacts({
      trip, now: `${FRI} 18:00`, positions: [pos({ km: 0, at: `${FRI} 08:00` }), pos({ km: 78, at: `${FRI} 18:00` })], plan: { date: FRI, backToTodayAt: null },
      spots: [{ b: cafe('Mo-Su 06:00-22:00'), km: 77.8, id: 'n70' }, { b: bakery('Mo-Su 06:00-12:00'), km: 90, id: 'n71' }, { b: tap(), km: 100, id: 'n72' }],
    });
    expect(f.ride.phase).toBe('after-ride');
    expect(findS1S2(f).s1.kind === 'place' && findS1S2(f).s1.kind === 'place').toBe(true);
    expect(leaveBy(f, f.ride).waterSources).toEqual(['n71']);
  });
});

describe('INV-16', () => {
  test('[STOP-T1-HOLIDAY] the closure function reads the date after the ride, and only at the stop\'s zone', () => {
    const zones = [{ fromKm: 0, toKm: 50, timeZone: 'Europe/Berlin', holidayZone: 'FR-67', country: 'FR' }, { fromKm: 50, toKm: 400, timeZone: 'Europe/Berlin', holidayZone: 'DE-BW', country: 'DE' }];
    const f = leaveFacts({ trip: dayTo(90, { departureDate: '2026-06-03' }), now: '2026-06-02 20:00', zones, holidays: { 'DE-BW': ['2026-06-04'] } });
    expect(closureApplies(f, f.ride)).toBe(true);
    const g = leaveFacts({ trip: dayTo(30, { departureDate: '2026-06-03' }), now: '2026-06-02 20:00', zones, holidays: { 'DE-BW': ['2026-06-04'] } });
    expect(closureApplies(g, g.ride)).toBe(false);
  });
});

import { describe, expect, test } from 'vitest';
import { formatHm } from '../../../../src/core/answers/time.ts';
import type { StopFacts } from '../../../../src/core/engines/covers.ts';
import { leaveBy, type LeaveBy, type LeaveFacts } from '../../../../src/core/engines/leaveby.ts';
import { rainPlans } from '../../../../src/core/engines/rain-plans.ts';
import { exposureMin, waitOrGo, waitTries, type WaitFacts } from '../../../../src/core/engines/wait-or-go.ts';
import { rainAtStart, rainHereNow } from '../../../../src/core/engines/weather-windows.ts';
import { weatherWindows, type WaitOrGo } from '../../../../src/core/engines/weather.ts';
import { hourClass } from '../../../../src/core/engines/weather-classes.ts';
import type { Position, RainPlan, RainWindow, Trip } from '../../../../src/core/types.ts';
import { at, bakery, cafe, flatRoute, pos, tap, testTrip } from '../../../fixtures/build.ts';
import { sampleGrid } from '../../../../src/core/route/grid.ts';
import { FRI, leaveFacts, SAT, type LeaveCase } from './leaveby-helpers.ts';
import type { Spot } from './water-helpers.ts';
import { forecastOf, stamps, type ForecastOpts, type Spell } from './weather-helpers.ts';

const TZ = 'Europe/Berlin';
const hm = (d: Date | null): string => formatHm(d!, TZ);

/** The Heidelberg to Strasbourg shape of section 3.2: km 125 at 14:20, the day's stop 40 km on. */
const toStop = (stop = 165, over: Partial<Trip> = {}): Trip => testTrip({ route: flatRoute(400, { stageEnds: [70, stop, 300] }), departureDate: FRI, stay: 'accommodation', ...over });

type Case = LeaveCase & { spells?: Spell[]; km?: number; time?: string; acc?: number; opts?: ForecastOpts; off?: number };

function facts(c: Case): { f: WaitFacts & LeaveFacts; windows: RainWindow[]; plans: RainPlan[]; lb: LeaveBy; position: Position | null } {
  const km = c.km ?? 125;
  const time = c.time ?? '14:20';
  const trip = c.trip ?? toStop();
  const date = c.now && typeof c.now === 'string' ? c.now.slice(0, 10) : SAT;
  const positions = c.positions ?? [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km, at: `${date} ${time}`, ...(c.acc ? { acc: c.acc } : {}), ...(c.off ? { off: c.off } : {}) })];
  const leave = leaveFacts({ ...c, trip, positions, now: c.now ?? `${SAT} ${time}`, spots: c.spots ?? [] });
  const forecast = c.forecast === undefined ? forecastOf(trip.route, c.spells ?? [], { fetchedAt: `${date} 07:10`, from: `${FRI} 01:00`, ...c.opts }) : c.forecast;
  const position = positions[positions.length - 1] ?? null;
  const f = { ...leave, forecast, baseline: null, position, roofs: [] } as WaitFacts & LeaveFacts;
  const windows = weatherWindows(f);
  const plans = rainPlans(windows, f as unknown as StopFacts);
  return { f, windows, plans, lb: leaveBy(f, f.ride), position };
}
const wg = (c: Case): WaitOrGo | null => {
  const x = facts(c);
  return waitOrGo(x.f, x.windows, x.plans, x.lb);
};
const UNTIL_15 = { km: undefined, range: [100, 145] as [number, number], stamps: stamps(SAT, 13, 15), pp: 80, mm: 1 };

describe('the worked example', () => {
  test('[WX-WG-EXAMPLE] saves 30-40 min, and the arrival moves from about 16:35 to 17:15', () => {
    const r = wg({ spells: [UNTIL_15] })!;
    expect(r.where).toBe('here');
    expect(hm(r.d)).toBe('15:00');
    expect(r.savedMin).toBeGreaterThanOrEqual(30);
    expect(r.savedMin).toBeLessThanOrEqual(40);
    expect(Math.abs(r.arrivalWait!.getTime() - at(`${SAT} 17:15`).getTime())).toBeLessThanOrEqual(5 * 60_000);
    expect(Math.abs(r.arrivalNow.getTime() - at(`${SAT} 16:35`).getTime())).toBeLessThanOrEqual(60_000);
    expect(r.lines[0]).toBe("Waiting until about 15:00 could save about 35 min of riding in likely rain, here. Tonight's stop then about 17:15 instead of 16:35, before sunset (18:42).");
  });

  test('[WX-WG-EXAMPLE] "instead of" equals the strip\'s arrival, and waiting here moves it by exactly the wait', () => {
    const x = facts({ spells: [UNTIL_15] });
    const r = waitOrGo(x.f, x.windows, x.plans, x.lb)!;
    expect(r.arrivalNow.getTime()).toBe(x.f.schedule.atKm(165).getTime());
    expect(r.arrivalWait!.getTime() - r.arrivalNow.getTime()).toBe(r.d!.getTime() - x.f.ride.departure.getTime());
  });
});

describe('exposure', () => {
  test('[WX-WG-THRESHOLD] exposureMin: riding minutes in likely hours, without breaks, and with no band', () => {
    const x = facts({ spells: [UNTIL_15] });
    // 40 minutes on the clock in the likely hour, breaks taken out.
    expect(exposureMin(x.f.forecast!, x.f.schedule, 165)).toBeCloseTo(40 / 1.15, 1);
  });

  test('[WX-WG-THRESHOLD] no rain at all: 0', () => {
    const x = facts({ spells: [] });
    expect(exposureMin(x.f.forecast!, x.f.schedule, 165)).toBe(0);
  });

  test('[WX-WG-THRESHOLD] rain only at a point not ridden in that hour counts nothing: no band', () => {
    // km 160 is reached at about 16:18: rain there from 15:00 to 16:00 is an hour ahead of the rider.
    const x = facts({ spells: [{ range: [155, 165], stamps: stamps(SAT, 16, 16), pp: 80, mm: 1 }] });
    expect(exposureMin(x.f.forecast!, x.f.schedule, 165)).toBe(0);
  });

  test('[WX-WG-THRESHOLD] possible hours are not likely hours', () => {
    const x = facts({ spells: [{ range: [100, 145], stamps: stamps(SAT, 15, 15), pp: 30, mm: 0.2 }] });
    expect(exposureMin(x.f.forecast!, x.f.schedule, 165)).toBe(0);
  });

  test('[WX-WG-THRESHOLD] an hour that is not known gives no figure, never a calm 0', () => {
    const x = facts({ spells: [{ range: [100, 200], stamps: stamps(SAT, 15, 15), pp: Number.NaN }] });
    expect(exposureMin(x.f.forecast!, x.f.schedule, 165)).toBeNaN();
    const short = facts({ opts: { until: `${SAT} 15:00` } });
    expect(exposureMin(short.f.forecast!, short.f.schedule, 165)).toBeNaN();
  });

  test('[WX-WG-THRESHOLD] the rejoin leg counts: an off-route rider is exposed for it too', () => {
    const allDay = [{ range: [100, 170] as [number, number], stamps: stamps(SAT, 15, 19), pp: 80, mm: 1 }];
    const near = facts({ spells: allDay });
    const off = facts({ off: 1000, spells: allDay });
    expect(exposureMin(off.f.forecast!, off.f.schedule, 165)).toBeGreaterThan(exposureMin(near.f.forecast!, near.f.schedule, 165));
  });

  test('[WX-WG-THRESHOLD] saving under 30 min is never suggested, even if it is half', () => {
    // Rain 14:20-14:40 only: E(dep) is about 34.8 with the 15:00 stamp, so take a short ride whose E is under 30.
    const r = wg({ trip: toStop(135), spells: [{ range: [100, 200], stamps: stamps(SAT, 15, 15), pp: 80, mm: 1 }], km: 130 })!;
    expect(r.d).toBeNull();
    expect(r.lines).toEqual(["Waiting up to 3 hours won't help much."]);
  });

  test('[WX-WG-THRESHOLD] half of a long exposure decides over 30 min', () => {
    // Likely until 16:00: E(dep) = 100/1.15 = 87; half is 43.5. 15:00 saves 34.8, 15:30 saves 60.9.
    const r = wg({ spells: [{ range: [100, 200], stamps: stamps(SAT, 15, 16), pp: 80, mm: 1 }] })!;
    expect(hm(r.d)).toBe('15:30');
  });
});

describe('the other cases of section 11', () => {
  test('[WX-WG-NOHELP] likely every hour until 20:00', () => {
    const r = wg({ spells: [{ range: [100, 200], stamps: stamps(SAT, 14, 20), pp: 80, mm: 1 }] })!;
    expect(r.d).toBeNull();
    expect(r.lines).toEqual(["Waiting up to 3 hours won't help much."]);
    expect(r.arrivalWait).toBeNull();
  });

  test('[WX-WG-LIGHTS] at 15:00 with rain until 16:00: the arrival moves from 18:05 to 19:05, with lights on from 18:42', () => {
    const r = wg({ trip: toStop(165), km: 110, time: '15:00', spells: [{ range: [100, 170], stamps: stamps(SAT, 16, 16), pp: 80, mm: 1 }] })!;
    expect(hm(r.arrivalNow)).toBe('18:05');
    expect(hm(r.arrivalWait)).toBe('19:05');
    expect(r.lines[0]).toContain('lights on from 18:42');
    expect(r.lines[0]).toContain('could');
  });

  test('[WX-WG-DARK] a November date where waiting passes dusk: no suggestion', () => {
    const NOV = '2026-11-14';
    const trip = testTrip({ route: flatRoute(400, { stageEnds: [70, 165, 300] }), departureDate: '2026-11-13', stay: 'accommodation' });
    const r = wg({
      trip, now: `${NOV} 14:20`, positions: [pos({ km: 60, at: '2026-11-13 19:00' }), pos({ km: 125, at: `${NOV} 14:20` })], sun: { sunset: '16:57', dusk: '17:31' },
      opts: { fetchedAt: `${NOV} 07:10`, from: '2026-11-13 01:00' }, spells: [{ range: [100, 200], stamps: stamps(NOV, 15, 16), pp: 80, mm: 1 }],
    })!;
    expect(r.d).toBeNull();
    expect(r.lines).toEqual(['Waiting would mean arriving after dark (dark from 17:31)']);
  });

  test('[WX-WG-DARK] at exactly dusk is after dark', () => {
    // The arrival leaving at 15:00 is 17:14:38: dusk at that second rules it out.
    const r = wg({ sun: { sunset: '16:50', dusk: '17:14' }, spells: [UNTIL_15] })!;
    expect(r.d).toBeNull();
    expect(r.lines[0]).toContain('Waiting would mean arriving after dark (dark from 17:14)');
  });

  test('[WX-WG-STALE] a forecast over 12 hours old: no wait or go', () => {
    expect(wg({ spells: [UNTIL_15], opts: { fetchedAt: `${FRI} 20:00` } })).toBeNull();
    // Exactly 12 hours is not over.
    expect(wg({ spells: [UNTIL_15], opts: { fetchedAt: `${SAT} 02:20` } })).not.toBeNull();
    // A fetch time that is no time is never fresh.
    const x = facts({ spells: [UNTIL_15] });
    expect(waitOrGo({ ...x.f, forecast: { ...x.f.forecast!, fetchedAt: new Date(Number.NaN) } }, x.windows, x.plans, x.lb)).toBeNull();
  });

  test('[WX-WG-PHASE] never after the day\'s ride or before the trip', () => {
    expect(wg({ spells: [UNTIL_15], plan: { date: SAT, backToTodayAt: null } })).toBeNull();
    const trip = testTrip({ route: flatRoute(400, { stageEnds: [165, 300] }), departureDate: '2026-10-18', stay: 'accommodation' });
    const before = facts({ trip, positions: [], now: `${SAT} 14:20`, spells: [UNTIL_15] });
    expect(before.f.ride.phase).toBe('before-trip');
    expect(waitOrGo(before.f, before.windows, before.plans, before.lb)).toBeNull();
    const end = facts({ trip: toStop(), km: 399, positions: [pos({ km: 399, at: `${SAT} 14:20` })], spells: [{ range: [385, 400], stamps: stamps(SAT, 14, 16), pp: 80, mm: 1 }] });
    expect(end.f.ride.phase).toBe('route-end');
    expect(waitOrGo(end.f, end.windows, end.plans, end.lb)).toBeNull();
  });

  test('[WX-WG-PHASE] no forecast, a bad speed or a bad clock: none', () => {
    const x = facts({ spells: [UNTIL_15] });
    expect(waitOrGo({ ...x.f, forecast: null }, x.windows, x.plans, x.lb)).toBeNull();
    expect(waitOrGo({ ...x.f, trip: { ...x.f.trip, flatKph: Number.NaN } }, x.windows, x.plans, x.lb)).toBeNull();
    expect(waitOrGo({ ...x.f, now: new Date(Number.NaN) }, x.windows, x.plans, x.lb)).toBeNull();
  });

  test('[WX-WG-WHEN] rain at the start shows it; dry start and a window far away does not', () => {
    expect(wg({ spells: [UNTIL_15] })).not.toBeNull();
    expect(wg({ spells: [] })).toBeNull();
    expect(wg({ trip: toStop(190), spells: [{ range: [170, 180], stamps: stamps(SAT, 16, 18), pp: 80, mm: 1 }] })).toBeNull();
  });

  // A dry start at km 100, a window whose first met point lies exactly so far on: 3.366 min per km on the clock.
  const PER_KM = (1 / (25 * 0.82)) * 60 * 1.15;
  const windowAt = (minutes: number): Case => {
    const km = 100 + minutes / PER_KM;
    return { km: 100, trip: toStop(190), opts: { extraKms: [km] }, spells: [{ km: [km], stamps: stamps(SAT, 14, 20), pp: 80, mm: 1 }] };
  };
  test('[WX-WG-WHEN] a window\'s first met point within 2 h of riding of the departure: shown', () => {
    expect(wg(windowAt(120))).not.toBeNull();
  });
  test('[WX-WG-WHEN] 2 h 1 min: not shown', () => {
    expect(wg(windowAt(121))).toBeNull();
  });
  test('[WX-WG-WHEN] possible rain never shows it', () => {
    expect(wg({ spells: [{ range: [100, 200], stamps: stamps(SAT, 14, 16), pp: 30, mm: 0.1 }] })).toBeNull();
  });
  test('[WX-WG-WHEN] rain at the start reads the point nearest the position, as rain here does: an approximate position', () => {
    // km 120.4 +-800 m starts at km 119.6, nearer grid point 110; on the ground the position is nearer grid point 130.
    const c: Case = { km: 120.4, acc: 800, opts: { onlyKms: [90, 110, 130, 150, 170, 190] }, spells: [{ km: [130], stamps: stamps(SAT, 14, 16), pp: 80, mm: 1 }], spots: [{ b: cafe('Mo-Su 08:00-22:00'), km: 123 }] };
    const x = facts(c);
    const here = rainHereNow(x.f.forecast, x.position, x.f.now, x.f.trip.route);
    expect(hourClass(here!).cls).toBe('likely');
    expect(rainAtStart(x.f.forecast, x.f.ride, null, x.f.trip.route)).toBe(false);
    expect(rainAtStart(x.f.forecast, x.f.ride, x.position, x.f.trip.route)).toBe(true);
    expect(x.plans[0]!.covers.length).toBeGreaterThan(0);
    expect(waitOrGo(x.f, x.windows, x.plans, x.lb)!.where).toBe('here');
  });
  test('[WX-WG-WHEN] on realistic rounded grid kilometres', () => {
    const route = flatRoute(400, { stageEnds: [70.1234567, 165.7654321, 300] });
    const trip = testTrip({ route: { ...route, sampleGrid: sampleGrid(route, [], route.stages) }, departureDate: FRI, stay: 'accommodation' });
    const r = wg({ trip, spells: [{ range: [100, 145], stamps: stamps(SAT, 15, 15), pp: 80, mm: 1 }] })!;
    expect(hm(r.d)).toBe('15:00');
  });

  test('[WX-WG-TRIES] from 14:20: 14:20, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00. Seven at most', () => {
    expect(waitTries(at(`${SAT} 14:20`), TZ).map(hm)).toEqual(['14:20', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00']);
    expect(waitTries(at(`${SAT} 14:30`), TZ).map(hm)).toEqual(['14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']);
    expect(waitTries(at(`${SAT} 14:00`), TZ)).toHaveLength(7);
    expect(waitTries(at(`${SAT} 14:29:59`), TZ)).toHaveLength(7);
  });

  test('[WX-WG-TRIES] half hours on the zone\'s own clock, in a quarter-hour zone too', () => {
    const tries = waitTries(new Date('2026-10-17T08:40:00Z'), 'Asia/Kathmandu');
    expect(formatHm(tries[0]!, 'Asia/Kathmandu')).toBe('14:25');
    expect(formatHm(tries[1]!, 'Asia/Kathmandu')).toBe('14:30');
  });
});

describe('waiting at a cover', () => {
  const COVER_KM = 131;
  const dryHere = { range: [135, 200] as [number, number], stamps: stamps(SAT, 15, 16), pp: 80, mm: 1 };
  const coverCase = (over: Partial<Case> = {}): Case => ({ km: 125, spots: [{ b: cafe('Mo-Su 08:00-18:00'), km: COVER_KM, off: 100 }], spells: [dryHere], ...over });

  test('[WX-WG-COVER] no rain at the start: the plan\'s first cover; arrival adds time waited plus the round trip', () => {
    const x = facts(coverCase());
    expect(x.plans[0]!.covers.length).toBeGreaterThan(0);
    const r = waitOrGo(x.f, x.windows, x.plans, x.lb)!;
    expect(r.where).not.toBe('here');
    const cover = x.plans[0]!.covers[0]!;
    const atCover = x.f.schedule.atPlace({ placeId: cover.placeId!, km: cover.km, offRouteM: cover.offRouteM });
    expect(r.d!.getTime()).toBeGreaterThanOrEqual(atCover.getTime());
    const roundTrip = 2 * ((1.3 * 0.1) / (25 * 0.82)) * 60 * 1.15 * 60_000;
    const waited = r.d!.getTime() - atCover.getTime();
    expect(Math.abs(r.arrivalWait!.getTime() - (r.arrivalNow.getTime() + waited + roundTrip))).toBeLessThanOrEqual(1000);
  });

  test('[WX-WG-COVER] departures before the arrival at the cover are dropped', () => {
    // Cover far on: reached at 14:40, so the 14:30 try is not one.
    const x = facts(coverCase());
    const r = waitOrGo(x.f, x.windows, x.plans, x.lb)!;
    expect(hm(r.d)).not.toBe('14:30');
    expect(r.d!.getTime()).toBeGreaterThan(at(`${SAT} 14:40`).getTime());
  });

  test('[WX-WG-COVER] E(d) includes the ride to the cover: rain on the way there is not saved', () => {
    // Dry at the start's grid point; km 125-137 wet until 15:00. The 20 minutes to the cover stay wet whenever the rider waits.
    const x = facts({ km: 125, spells: [{ range: [130, 140], stamps: stamps(SAT, 15, 15), pp: 80, mm: 1 }] });
    expect(rainAtStart(x.f.forecast, x.f.ride, x.position, x.f.trip.route)).toBe(false);
    const cover = { placeId: 'n1', roof: null, km: 131, offRouteM: 0, arrival: x.f.schedule.atKm(131), coverClass: 1 as const, openUntil: null, lightning: false };
    const plan = { ...x.plans[0]!, covers: [cover] };
    const r = waitOrGo(x.f, x.windows, [plan], x.lb)!;
    // Leaving now: 34.8 min in the rain. Leaving the cover at 15:00: the same ride there, 17.4 min, so it saves 17.4: too little.
    expect(r.where).not.toBe('here');
    expect(r.d).toBeNull();
  });

  test('[WX-WG-COVER] a departure before the arrival there is dropped, even where it would have saved the most', () => {
    // Cover at km 150, reached 15:44. Rain 16:00-17:00: the 14:30 try would beat it, but the rider is not there yet.
    const r = wg({ trip: toStop(170), spots: [{ b: cafe('Mo-Su 08:00-22:00'), km: 150 }], spells: [{ range: [155, 200], stamps: stamps(SAT, 17, 17), pp: 80, mm: 1 }] })!;
    expect(r.where).not.toBe('here');
    expect(hm(r.d)).toBe('16:30');
  });

  test('[WX-WG-COVER] departures after the cover closes are dropped', () => {
    // Closes 15:20: leaving at 15:30 can't be waited for there. It would have helped; nothing else does.
    const r = wg(coverCase({ spots: [{ b: cafe('Mo-Su 08:00-15:20'), km: COVER_KM }], spells: [{ range: [135, 200], stamps: stamps(SAT, 15, 16), pp: 80, mm: 1 }] }))!;
    expect(r.d).toBeNull();
    expect(hm(wg(coverCase())!.d)).toBe('15:30');
  });

  test('[WX-WG-COVER] with rain at the start, or when the plan has no cover: here', () => {
    expect(wg({ km: 125, spells: [UNTIL_15], spots: [{ b: cafe('Mo-Su 08:00-18:00'), km: COVER_KM }] })!.where).toBe('here');
    expect(wg({ km: 125, spells: [dryHere] })!.where).toBe('here');
  });

  test('[WX-WG-COVER] a roof has no closing time, and a cover line reads "could"', () => {
    const r = wg(coverCase())!;
    expect(r.lines[0]).toContain('could');
    expect(r.lines[0]).toContain('km 131');
  });
});

describe('what waiting must not do', () => {
  test('[WX-WG-THUNDER] never a d that meets a thunderstorm dep does not', () => {
    // A storm at the stop at 18:00-19:00: leaving now reaches it at 16:35, over an hour before; 15:00 reaches at 17:15, within one.
    const r = wg({ spells: [UNTIL_15, { range: [160, 170], stamps: [`${SAT} 19:00`], pp: 40, code: 95 }] })!;
    expect(r.d).toBeNull();
    expect(r.lines.join(' ')).not.toContain('after dark');
  });

  test('[WX-WG-THUNDER] the storm is read at the stop on rounded grid kilometres too', () => {
    const route = flatRoute(400, { stageEnds: [70.1234567, 165.7654321, 300] });
    const trip = testTrip({ route: { ...route, sampleGrid: sampleGrid(route, [], route.stages) }, departureDate: FRI, stay: 'accommodation' });
    const stopKm = trip.route.sampleGrid.find((k) => Math.abs(k - 165.7654321) < 0.01)!;
    const r = wg({ trip, spells: [UNTIL_15, { km: [stopKm], stamps: [`${SAT} 19:00`], pp: 40, code: 95 }] })!;
    expect(r.d).toBeNull();
  });

  test('[WX-WG-THUNDER] when dep meets one, "won\'t help much" is never shown', () => {
    const r = wg({ spells: [{ range: [100, 200], stamps: stamps(SAT, 14, 20), pp: 80, mm: 1, code: 95 }] });
    expect(r === null ? '' : r.lines.join(' ')).not.toContain("won't help much");
    expect(r!.d).toBeNull();
  });

  test('[WX-WG-THUNDER] a storm dep meets too does not stop waiting past the rain', () => {
    const r = wg({ spells: [UNTIL_15, { km: [130], stamps: stamps(SAT, 15, 16), code: 95, pp: 80, mm: 1 }] })!;
    expect(r.d).not.toBeNull();
  });

  const bakeryAt = (km: number, closes: string): Spot => ({ b: bakery(`Mo-Su 06:00-${closes}`), km });
  test('[WX-WG-LIMIT] never a d breaking a kept limit dep meets', () => {
    // The bakery at km 140 is S1 with a tap after it: arriving by 15:30 is needed; leaving at 15:00 reaches it at 15:50.
    const x = facts({ km: 125, spells: [UNTIL_15], spots: [bakeryAt(140, '16:00'), { b: tap(), km: 150 }] });
    expect(x.lb.kept).toContain('water');
    const r = waitOrGo(x.f, x.windows, x.plans, x.lb)!;
    expect(r.d).toBeNull();
    expect(r.lines).toEqual(['Waiting would mean missing the bakery at km 140 (open until 16:00)']);
  });

  test('[WX-WG-LIMIT] a limit dep already breaks does not rule waiting out', () => {
    const x = facts({ km: 125, spells: [UNTIL_15] });
    expect(waitOrGo(x.f, x.windows, x.plans, { ...x.lb, checks: [{ id: 'food-closure', meets: () => false, missLine: 'x' }] })!.d).not.toBeNull();
    // One dep meets and d does not: ruled out, with its own line.
    expect(waitOrGo(x.f, x.windows, x.plans, { ...x.lb, checks: [{ id: 'food-closure', meets: (d) => d.getTime() < at(`${SAT} 15:00`).getTime(), missLine: 'x' }] })!.lines).toEqual(['x']);
  });

  test('[WX-WG-LIMIT] d later than leave-by: "later than your leave-by (about 15:40)"', () => {
    // Leave-by 14:55: the 15:00 try passes daylight's fine limit but not dusk.
    const r = wg({ trip: toStop(165), km: 125, sun: { sunset: '17:40', dusk: '18:20' }, spells: [UNTIL_15] })!;
    expect(r.d).not.toBeNull();
    expect(r.lines.join(' ')).toMatch(/later than your leave-by \(about \d\d:\d\d\)/);
    expect(r.lines.join(' ')).toContain('later than your leave-by (about 14:55)');
  });

  test('[WX-WG-LIMIT] within leave-by: no such line', () => {
    expect(wg({ spells: [UNTIL_15] })!.lines.join(' ')).not.toContain('later than your leave-by');
  });

  test('[WX-WG-LIMIT] both dark and a limit rule it out: the general line, not one reason as if alone', () => {
    const r = wg({ km: 125, sun: { sunset: '16:50', dusk: '17:14' }, spells: [UNTIL_15], spots: [{ b: bakery('Mo-Su 06:00-16:00'), km: 140 }, { b: tap(), km: 150 }] })!;
    expect(r.d).toBeNull();
    expect(r.lines).toEqual(["Waiting up to 3 hours won't help much."]);
  });
});

describe('wording', () => {
  test('[WX-WG-WORDING] always "could"', () => {
    const lines = wg({ spells: [UNTIL_15] })!.lines.join(' ');
    expect(lines).toContain('could');
    expect(lines).not.toMatch(/\b(wait|must|should)\b/i);
  });

  test('[WX-WG-WORDING] a window with showers adds the caveat; plain rain does not', () => {
    const showers = wg({ spells: [{ ...UNTIL_15, code: 80 }] })!;
    expect(showers.lines).toContain("Exact places and times can't be forecast.");
    expect(wg({ spells: [UNTIL_15] })!.lines).not.toContain("Exact places and times can't be forecast.");
  });

  test('[WX-WG-WORDING] a forecast too short to judge says so, instead of "won\'t help much"', () => {
    const r = wg({ spells: [{ range: [100, 200], stamps: stamps(SAT, 14, 16), pp: 80, mm: 1 }], opts: { until: `${SAT} 16:00` } })!;
    expect(r.d).toBeNull();
    expect(r.lines.join(' ')).not.toContain("won't help much");
    expect(r.lines.join(' ')).toContain('forecast');
  });
});

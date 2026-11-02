import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { kitchenHoursId, openOnArrival, openOver } from '../../../../src/core/hours/check.ts';
import { leaveBy, type LeaveBy, type LeaveFacts } from '../../../../src/core/engines/leaveby.ts';
import { foodAnswer } from '../../../../src/core/engines/food.ts';
import { rainPlans } from '../../../../src/core/engines/rain-plans.ts';
import { stopIdeas, type FoodFacts, type Ideas } from '../../../../src/core/engines/stop-ideas.ts';
import { waitOrGo } from '../../../../src/core/engines/wait-or-go.ts';
import { weatherWindows, type WaitOrGo } from '../../../../src/core/engines/weather.ts';
import type { Answer, Climb, PlaceHours, Position, RainPlan, StopFlags, Trip, ZoneSpan } from '../../../../src/core/types.ts';
import { stampLine } from '../../../../src/core/engines/weather.ts';
import { at, bakery, cafe, fastFood, flatRoute, fuelShop, kiosk, pos, restaurant, settlement, shelter, supermarket, tap, testTrip } from '../../../fixtures/build.ts';
import { hoursValue } from '../../../gen/index.ts';
import { FRI as REAL_FRI, leaveFacts, preparedHours, SAT as REAL_SAT, type LeaveCase } from './leaveby-helpers.ts';
import type { Spot } from './water-helpers.ts';
import { forecastOf, stamps, type ForecastOpts, type Spell } from './weather-helpers.ts';

// A plain midweek ride unless a case says otherwise, so the day after it closes nothing.
const FRI = '2026-10-13';
const SAT = '2026-10-14';
const SEATS = (indoorSeating: boolean | null, more: Partial<StopFlags> = {}): { stop: StopFlags } => ({ stop: { indoorSeating, outdoorSeating: null, toilets: null, takeaway: null, kitchenHours: null, bikeParking50m: false, ...more } });

type Case = LeaveCase & { spells?: Spell[]; opts?: ForecastOpts; water?: string | null; noForecast?: boolean; km?: number; time?: string };

/** A day out from km 100 (the night there), the stop at km 200: nothing else unless the case says so. */
const dayFrom100 = (over: Partial<Trip> = {}): Trip => testTrip({ route: flatRoute(500, { stageEnds: [100, 200, 320] }), departureDate: FRI, stay: 'accommodation', ...over });

function setup(c: Case): { f: FoodFacts & LeaveFacts; plans: RainPlan[]; lb: LeaveBy; wg: WaitOrGo | null; position: Position | null } {
  const trip = c.trip ?? dayFrom100();
  const positions = c.positions ?? [pos({ km: c.km ?? 100, at: `${FRI} 19:00` }), ...(c.time ? [pos({ km: c.km ?? 100, at: `${SAT} ${c.time}` })] : [])];
  const now = c.now ?? `${SAT} ${c.time ?? '07:00'}`;
  const leave = leaveFacts({ ...c, trip, positions, now });
  const forecast = c.noForecast ? null : forecastOf(trip.route, c.spells ?? [], { fetchedAt: `${SAT} 07:10`, from: `${FRI} 01:00`, ...c.opts });
  const position = positions[positions.length - 1] ?? null;
  const f = { ...leave, forecast, roofs: [], position, baseline: null } as FoodFacts & LeaveFacts & { position: Position | null };
  const windows = weatherWindows(f);
  const plans = rainPlans(windows, f);
  const lb = leaveBy(f, f.ride);
  const wg = waitOrGo(f, windows, plans, lb);
  return { f, plans, lb, wg, position };
}
const ideas = (c: Case): Ideas => {
  const x = setup(c);
  return stopIdeas(x.f, x.plans, x.lb, c.water ?? null, x.wg);
};
const answer = (c: Case): Answer => {
  const x = setup(c);
  return foodAnswer(x.f, stopIdeas(x.f, x.plans, x.lb, c.water ?? null, x.wg));
};
const kmToMin = (km: number): number => (km / (25 * 0.82)) * 60 * 1.15;
/** A place open every day from early to late, so triggers can be read one at a time. */
const OPEN = 'Mo-Su 05:00-23:30';
const SAFE_STOP: Spot[] = [{ b: restaurant(OPEN), km: 199.5, id: 'n500' }];
/** Food places often enough along the ride that neither T1 nor T2 fires. */
const NO_GAP = (from = 100, to = 200): Spot[] => {
  const out: Spot[] = [...SAFE_STOP];
  for (let k = from + 15; k < to; k += 30) out.push({ b: kiosk(OPEN), km: k, id: `n${600 + k}` });
  return out;
};

describe('T1 Last chance', () => {
  const CASE: Case = {
    now: `${REAL_SAT} 17:10`,
    spots: [{ b: supermarket('Mo-Sa 08:00-20:00'), km: 69 }, { b: settlement('Ettlingen'), km: 69 }, { b: supermarket('Mo 07:00-20:00'), km: 200 }],
  };
    const riding: Case = {
    ...CASE, trip: testTrip({ route: flatRoute(300, { stageEnds: [78, 150, 222] }), departureDate: REAL_SAT, stay: 'accommodation' }),
    positions: [pos({ km: 55, at: `${REAL_SAT} 17:00` }), pos({ km: 60, at: `${REAL_SAT} 17:10` })], opts: { fetchedAt: `${REAL_SAT} 07:10`, from: `${REAL_FRI} 01:00` },
  };

  test('[STOP-T1] Saturday 17:40 at a shop closing 20:00, nothing open until Monday: T1 names that shop, action', () => {
    const r = ideas(riding);
    expect(r.title?.trigger).toBe('last-chance');
    expect(r.title?.status).toBe('action');
    expect(r.title?.reason).toBe('Last open shop before Sunday: supermarket in Ettlingen, +9 km, about 17:40, closes 20:00. Nothing mapped as open after it until Monday 07:00; consider buying dinner, breakfast and snacks there. Sunday closing is an assumption.');
    expect(answer(riding).status).toBe('action');
  });

  test('[STOP-T1] the first clause: nothing within 1 km of the stop open on arrival, on a weekday', () => {
    const tue = testTrip({ route: flatRoute(300, { stageEnds: [100, 200] }), departureDate: '2026-10-20', stay: 'accommodation' });
    const r = ideas({ trip: tue, now: '2026-10-20 07:00', positions: [], spots: [{ b: supermarket(OPEN), km: 60 }, { b: kiosk(OPEN), km: 98.9 }] });
    expect(r.title?.trigger).toBe('last-chance');
    expect(r.title?.km).toBe(98.9);
    const near = ideas({ trip: tue, now: '2026-10-20 07:00', positions: [], spots: [{ b: supermarket(OPEN), km: 60 }, { b: kiosk(OPEN), km: 99.2 }, { b: kiosk(OPEN), km: 30 }] });
    expect(near.title?.trigger).not.toBe('last-chance');
  });

  test('[STOP-T1] candidates up to 1 h before the last open place, by kind: an earlier supermarket beats a later kiosk, named beside it', () => {
    const tue = testTrip({ route: flatRoute(300, { stageEnds: [100, 200] }), departureDate: '2026-10-20', stay: 'accommodation' });
    const c = (km: number): Ideas => ideas({ trip: tue, now: '2026-10-20 07:00', positions: [], spots: [{ b: supermarket(OPEN), km }, { b: kiosk(OPEN), km: 90 }] });
    const within = c(90 - 59 / kmToMin(1));
    expect(within.title?.km).toBeCloseTo(90 - 59 / kmToMin(1), 6);
    expect(within.title?.lines.join(' ')).toContain('kiosk at km 90');
    expect(c(90 - 61 / kmToMin(1)).title?.km).toBe(90);
  });

  test('[STOP-T1] nothing open at all: it still sets the title and states the gap', () => {
    const r = ideas({ spots: [{ b: tap(), km: 110 }] });
    expect(r.title?.trigger).toBe('last-chance');
    expect(r.title?.reason).toContain('No food place mapped as open for the next 100 km');
    expect(r.title?.status).toBe('action');
  });

  test('[STOP-T1-END] the second clause never applies when the stop is the route end', () => {
    const trip = testTrip({ route: flatRoute(100), departureDate: REAL_SAT, stay: 'accommodation' });
    const r = ideas({ trip, now: `${REAL_SAT} 07:00`, positions: [], opts: { fetchedAt: `${REAL_SAT} 05:00`, from: `${REAL_FRI} 01:00` }, spots: [{ b: restaurant(OPEN), km: 99.5 }, { b: kiosk(OPEN), km: 20 }, { b: kiosk(OPEN), km: 50 }, { b: kiosk(OPEN), km: 75 }] });
    expect(r.title?.trigger).not.toBe('last-chance');
  });

  test('[STOP-T1-HOLIDAY] T1\'s second clause and the closure limit hold together, 3 June 2026', () => {
    const wed = '2026-06-03';
    const zones = (holidayZone: string, country: string): ZoneSpan[] => [{ fromKm: 0, toKm: 300, timeZone: 'Europe/Berlin', holidayZone, country }];
    const c = (z: ZoneSpan[]): Case => ({
      trip: testTrip({ route: flatRoute(300, { stageEnds: [100, 200] }), departureDate: wed, stay: 'accommodation' }), now: `${wed} 07:00`, positions: [], zones: z,
      holidays: { 'DE-BW': ['2026-06-04'] }, opts: { fetchedAt: `${wed} 05:00`, from: '2026-06-02 01:00' },
      spots: [{ b: restaurant(OPEN), km: 99.5 }, { b: kiosk(OPEN), km: 25 }, { b: kiosk(OPEN), km: 50 }, { b: kiosk(OPEN), km: 75 }],
    });
    const bw = setup(c(zones('DE-BW', 'DE')));
    expect(bw.lb.closure).toBe(true);
    expect(stopIdeas(bw.f, bw.plans, bw.lb, null, null).title?.trigger).toBe('last-chance');
    expect(stopIdeas(bw.f, bw.plans, bw.lb, null, null).title?.reason).toContain('the public holiday');
    const alsace = setup(c(zones('FR-67', 'FR')));
    expect(alsace.lb.closure).toBe(false);
    expect(stopIdeas(alsace.f, alsace.plans, alsace.lb, null, null).title?.trigger).not.toBe('last-chance');
  });
});

describe('T2 Gap', () => {
  // The day from km 40 to km 130: a place open at the stop, so T1 is out.
  const gapTrip = (flatKph = 25): Trip => testTrip({ route: flatRoute(500, { stageEnds: [40, 130, 320] }), departureDate: FRI, stay: 'accommodation', flatKph });
  const base = (spots: Spot[], flatKph = 25): Case => ({ trip: gapTrip(flatKph), positions: [pos({ km: 40, at: `${FRI} 19:00` })], spots: [{ b: restaurant(OPEN), km: 129.8, id: 'n500' }, ...spots] });

  test('[STOP-T2] nothing open for 42 km after a 24/7 fuel-station shop at km 81: T2 names it', () => {
    const r = ideas(base([{ b: fuelShop('24/7'), km: 81 }, { b: kiosk(OPEN), km: 123 }, { b: kiosk(OPEN), km: 60 }]));
    expect(r.title?.trigger).toBe('gap');
    expect(r.title?.status).toBe('action');
    expect(r.title?.km).toBe(81);
    expect(r.title?.reason).toContain('No food place mapped as open for 42 km after the fuel-station shop at km 81');
    expect(r.title?.reason).toContain('Consider stocking up there');
    expect(r.title?.reason).toContain('open 24/7');
    expect(r.title?.reason).toContain('toilets not mapped');
  });

  test('[STOP-T2] if a supermarket at km 72 is open: T2 names the supermarket, and the shop as the last open place', () => {
    const r = ideas(base([{ b: fuelShop('24/7'), km: 81 }, { b: supermarket(OPEN), km: 72 }, { b: kiosk(OPEN), km: 123 }]));
    expect(r.title?.trigger).toBe('gap');
    expect(r.title?.km).toBe(72);
    expect(r.title?.lines.join(' ')).toContain('fuel-station shop at km 81');
  });

  test('[STOP-T2-NONE] no candidate: "No food place mapped as open for the next 42 km, about 2 h 10 min", action', () => {
    // A stretch starting here. 2 h 10 min for 42 km is a flat speed of 27 km/h: the row's figure is a shape of the example.
    const r = ideas({ trip: testTrip({ route: flatRoute(500, { stageEnds: [40, 90, 320] }), departureDate: FRI, stay: 'accommodation', flatKph: 27 }), positions: [pos({ km: 40, at: `${FRI} 19:00` })], spots: [{ b: kiosk(OPEN), km: 82 }, { b: restaurant(OPEN), km: 89.8 }] });
    expect(r.title?.trigger).toBe('gap');
    expect(r.title?.reason).toBe('No food place mapped as open for the next 42 km, about 2 h 10 min');
    expect(r.title?.status).toBe('action');
    expect(r.title?.placeId).toBeNull();
  });

  const twoHoursKm = 120 / kmToMin(1);
  test('[STOP-T2-BOUND] a gap of exactly 2 h of riding fires', () => {
    expect(ideas(base([{ b: kiosk(OPEN), km: 50 }, { b: kiosk(OPEN), km: 50 + twoHoursKm }, { b: kiosk(OPEN), km: 110 }])).title?.trigger).toBe('gap');
  });
  test('[STOP-T2-BOUND] 1 h 59 min does not; nor does 119.9 min', () => {
    const just = 119.9 / kmToMin(1);
    expect(ideas(base([{ b: kiosk(OPEN), km: 50 }, { b: kiosk(OPEN), km: 50 + just }, { b: kiosk(OPEN), km: 110 }])).title?.trigger).not.toBe('gap');
    const km = 119 / kmToMin(1);
    expect(ideas(base([{ b: kiosk(OPEN), km: 50 }, { b: kiosk(OPEN), km: 50 + km }, { b: kiosk(OPEN), km: 110 }])).title?.trigger).not.toBe('gap');
  });
  test('[STOP-T2-BOUND] the gap counts from here, and to the stop', () => {
    expect(ideas(base([{ b: kiosk(OPEN), km: 40 + twoHoursKm + 1 }])).title?.trigger).toBe('gap');
    expect(ideas(base([{ b: kiosk(OPEN), km: 60 }, { b: kiosk(OPEN), km: 90 }, { b: kiosk(OPEN), km: 110 }])).title?.trigger).not.toBe('gap');
    expect(ideas(base([{ b: kiosk(OPEN), km: 60 }, { b: kiosk(OPEN), km: 90 }])).title?.trigger).toBe('gap');
  });
  test('[STOP-T2] a shop closed on arrival leaves the gap', () => {
    expect(ideas(base([{ b: kiosk(OPEN), km: 50 }, { b: kiosk('Mo-Su 05:00-06:00'), km: 70 }, { b: kiosk(OPEN), km: 100 }])).title?.trigger).toBe('gap');
  });
  test('[STOP-T2] a water source open on arrival is no gap: INV-03', () => {
    const r = ideas(base([{ b: kiosk(OPEN), km: 60 }, { b: cafe(OPEN), km: 80 }, { b: kiosk(OPEN), km: 100 }]));
    expect(r.title?.trigger).not.toBe('gap');
  });
});

describe('T3 Rain', () => {
  const RAIN_HERE = { range: [90, 145] as [number, number], stamps: stamps(SAT, 14, 15), pp: 80, mm: 1 };
  const moved: Case = { trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 125, at: `${SAT} 14:20` })], now: `${SAT} 14:20` };

  test('[STOP-EXAMPLE] km 125 at 14:20: "Stop idea: Café Lindenhof, open until 18:00", "+6 km · 14:40", fine', () => {
    const trip = testTrip({ route: flatRoute(400, { stageEnds: [70, 165, 300] }), departureDate: FRI, stay: 'accommodation' });
    const c: Case = {
      trip: { ...trip, departureDate: REAL_FRI }, positions: [pos({ km: 60, at: `${REAL_FRI} 19:00` }), pos({ km: 125, at: `${REAL_SAT} 14:20` })], now: `${REAL_SAT} 14:20`,
      opts: { fetchedAt: `${REAL_SAT} 07:10`, from: `${REAL_FRI} 01:00` }, spells: [{ ...RAIN_HERE, stamps: stamps(REAL_SAT, 14, 15) }],
      spots: [{ b: cafe('Mo-Su 08:00-18:00', { name: 'Café Lindenhof' }), km: 131 }, { b: restaurant(OPEN), km: 164.5, id: 'n500' }, { b: restaurant(OPEN), km: 170, id: 'n501' }],
    };
    const a = answer(c);
    expect(a.title).toBe('Stop idea: Café Lindenhof, open until 18:00');
    expect(stampLine(a.stamp, 125, 'Europe/Berlin')).toBe('+6 km · 14:40');
    expect(a.status).toBe('fine');
  });

  test('[STOP-T3] rain at the start: a seated place within 30 min of riding; 31 min is too far', () => {
    const near = (minutes: number): Ideas => ideas({ ...moved, spells: [RAIN_HERE], spots: [...NO_GAP(125, 200), { b: cafe(OPEN), km: 125 + minutes / kmToMin(1), id: 'n1' }] });
    expect(near(29).title?.trigger).toBe('rain');
    expect(near(29).title?.placeId).toBe('n1');
    expect(near(31).title?.placeId).not.toBe('n1');
  });

  test('[STOP-T3] rain at the start: a kiosk is no seated place', () => {
    expect(ideas({ ...moved, spells: [RAIN_HERE], spots: [...NO_GAP(125, 200)] }).title?.trigger).not.toBe('rain');
  });

  test('[STOP-T3] a likely window reached within 3 h of riding: the plan\'s covers of classes 1-2', () => {
    const c: Case = { spells: [{ range: [150, 170], stamps: stamps(SAT, 8, 22), pp: 80, mm: 1 }], spots: [...NO_GAP(), { b: cafe(OPEN), km: 140, id: 'n1' }] };
    const r = ideas({ ...c, trip: dayFrom100() });
    expect(r.title?.trigger).toBe('rain');
    expect(r.title?.placeId).toBe('n1');
  });

  test('[STOP-T3] a likely window beyond 3 h of riding: no idea, a thunderstorm window anywhere on the ride: yes', () => {
    const far = { range: [170, 195] as [number, number], stamps: stamps(SAT, 8, 22), pp: 80, mm: 1 };
    const c = (spell: Spell): Ideas => ideas({ spells: [spell], spots: [...NO_GAP(), { b: cafe(OPEN), km: 165, id: 'n1' }] });
    // km 100 + 3 h on the clock is km 153.
    expect(c(far).title?.trigger).not.toBe('rain');
    expect(c({ ...far, code: 95, pp: 40 }).title?.trigger).toBe('rain');
  });

  test('[STOP-T3] possible rain never gets an idea', () => {
    const r = ideas({ spells: [{ range: [100, 200], stamps: stamps(SAT, 8, 22), pp: 30, mm: 0.2 }], spots: [...NO_GAP(), { b: cafe(OPEN), km: 140, id: 'n1' }] });
    expect(r.title?.trigger).not.toBe('rain');
    expect(r.timeline.map((i) => i.trigger)).not.toContain('rain');
  });

  test('[STOP-T3] a roof is no idea, and a plan of roofs alone passes on with its line in the timeline', () => {
    const r = ideas({ spells: [{ range: [150, 170], stamps: stamps(SAT, 8, 22), pp: 80, mm: 1 }], spots: [...SAFE_STOP.map((s) => s), ...NO_GAP().filter((s) => s.km !== 145), { b: shelter(), km: 142, id: 'n1' }] });
    expect(r.title?.placeId).not.toBe('n1');
    expect(r.timeline.some((i) => i.trigger === 'rain' && i.placeId === null)).toBe(true);
  });

  test('[STOP-LINES] "you could wait it out there until about 15:00" only when wait or go suggests that place', () => {
    const c: Case = {
      trip: testTrip({ route: flatRoute(400, { stageEnds: [70, 165, 300] }), departureDate: FRI, stay: 'accommodation' }), positions: moved.positions!, now: moved.now!,
      spots: [{ b: cafe('Mo-Su 08:00-18:00'), km: 131, id: 'n1' }, { b: restaurant(OPEN), km: 164.5, id: 'n500' }], spells: [{ range: [135, 200], stamps: stamps(SAT, 15, 16), pp: 80, mm: 1 }],
    };
    const x = setup(c);
    expect(x.wg?.d).not.toBeNull();
    expect(x.wg?.where).not.toBe('here');
    const r = stopIdeas(x.f, x.plans, x.lb, null, x.wg);
    expect(r.title?.lines.join(' ')).toContain('you could wait it out there until about 15:30');
    expect(stopIdeas(x.f, x.plans, x.lb, null, null).title?.lines.join(' ')).not.toContain('wait it out');
    expect(stopIdeas(x.f, x.plans, x.lb, null, { ...x.wg!, where: 'here' }).title?.lines.join(' ')).not.toContain('wait it out');
  });

  test('[STOP-LINES] "Later times assume a short stop here." when the idea sits out rain or heat', () => {
    const r = answer({ ...moved, spells: [RAIN_HERE], spots: [...NO_GAP(125, 200), { b: cafe(OPEN), km: 130, id: 'n1' }] });
    expect(r.detail).toContain('Later times assume a short stop here.');
    expect(answer({ spots: NO_GAP() }).detail).not.toContain('Later times');
  });

});

describe('T4 Heat', () => {
  const at13 = 100 + (4.5 * 60) / kmToMin(1); // leaving km 100 at 08:30, reached at 13:00
  const hot = (t: number, stampsList: string[] = [`${SAT} 13:00`, `${SAT} 14:00`], km = at13): Spell => ({ km: [km], stamps: stampsList, t });
  const c = (t: Spell, spots: Spot[] = []): Case => ({ spells: [t], opts: { extraKms: [at13, 100 + (7 * 60) / kmToMin(1)] }, spots: [...NO_GAP().filter((s) => !(typeof s.km === 'number' && s.km > 150 && s.km < 199)), { b: kiosk(OPEN), km: 165 }, { b: kiosk(OPEN), km: 190 }, ...spots] });

  test('[STOP-T4] raw forecast 30.0 °C at 13:00 fires', () => {
    expect(ideas(c(hot(30), [{ b: cafe(OPEN), km: 165, id: 'n1' }])).title?.trigger).not.toBe('last-chance');
    expect(ideas(c(hot(30), [{ b: restaurant(OPEN), km: at13 - 10, id: 'n1' }])).title?.trigger).toBe('heat');
  });
  test('[STOP-T4] 29.9 °C does not', () => {
    expect(ideas(c(hot(29.9), [{ b: restaurant(OPEN), km: at13 - 10, id: 'n1' }])).title?.trigger).not.toBe('heat');
  });
  test('[STOP-T4] 30.0 °C at 15:30 does not; at 14:30 it does', () => {
    const hotAt = (minutes: number): Ideas => {
      const km = 100 + minutes / kmToMin(1);
      const stampsNear = minutes === 210 ? [`${SAT} 15:00`, `${SAT} 16:00`] : [`${SAT} 14:00`, `${SAT} 15:00`];
      return ideas({ now: `${SAT} 12:00`, opts: { extraKms: [km] }, spells: [{ km: [km], stamps: stampsNear, t: 30 }], spots: [...NO_GAP(), { b: restaurant(OPEN), km: km - 20, id: 'n1' }] });
    };
    expect(hotAt(210).title?.trigger).not.toBe('heat');
    expect(hotAt(150).title?.trigger).toBe('heat');
  });
  test('[STOP-T4] a temperature that is no number never fires', () => {
    expect(ideas(c(hot(Number.NaN), [{ b: restaurant(OPEN), km: at13 - 10, id: 'n1' }])).title?.trigger).not.toBe('heat');
  });
  test('[STOP-T4] candidates seated, reached 11:00-15:00, before the first hot hour', () => {
    // km at13 - 40 is reached before 11:00 at about 10:50... and at13 - 10 inside; a kiosk is never seated.
    const early = at13 - (130 / kmToMin(1)); // reached 10:50: too early
    const inWindow = at13 - (60 / kmToMin(1)) ; // 12:00, before the hot hour from 12:00: at the edge
    const r = ideas(c(hot(30), [{ b: restaurant(OPEN), km: early, id: 'n1' }, { b: restaurant(OPEN), km: inWindow - 3, id: 'n2' }]));
    expect(r.title?.trigger).toBe('heat');
    expect(r.title?.placeId).toBe('n2');
  });
  test('[STOP-T4] if none: the last seated place before it', () => {
    const early = at13 - (130 / kmToMin(1));
    const r = ideas(c(hot(30), [{ b: restaurant(OPEN), km: early - 5, id: 'n1' }, { b: restaurant(OPEN), km: early, id: 'n2' }]));
    expect(r.title?.placeId).toBe('n2');
  });
  test('[STOP-T4] the first hot hour already begun at the departure: open seated places reached before 15:00, earliest first', () => {
    const c2: Case = { trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 120, at: `${SAT} 12:30` })], now: `${SAT} 12:30`, spells: [{ range: [100, 200], stamps: stamps(SAT, 12, 15), t: 31 }], spots: [...NO_GAP(120, 200), { b: restaurant(OPEN), km: 125, id: 'n1' }, { b: restaurant(OPEN), km: 135, id: 'n2' }] };
    const r = ideas(c2);
    expect(r.title?.trigger).toBe('heat');
    expect(r.title?.placeId).toBe('n1');
  });
  test('[STOP-LINES] a hot day: the salty-food line', () => {
    const r = answer({ ...c(hot(30), [{ b: restaurant(OPEN), km: at13 - 10, id: 'n1' }]), spells: [hot(30), { range: [100, 200], stamps: stamps(SAT, 9, 20), t: 28 }] });
    expect(r.detail).toContain('On a long hot ride, have some salty food.');
    expect(answer({ spots: NO_GAP() }).detail).not.toContain('salty');
  });
});

describe('T5 Meal', () => {
  const at1230 = 100 + 180 / kmToMin(1); // leaving km 100 at 09:30, reached at 12:30
  const seatedStop = [...NO_GAP()];
  test('[STOP-T5] an open meal place reached 11:30-13:30 within 3 h of riding, at least 45 min away; target 12:30', () => {
    // Leaving at 09:30, 3 h ends at 12:30.
    const c: Case = { now: `${SAT} 09:30`, spots: [...seatedStop, { b: restaurant(OPEN), km: 100 + (170 / kmToMin(1)), id: 'n1' }] };
    const r = ideas(c);
    expect(r.title?.trigger).toBe('meal');
    expect(r.title?.placeId).toBe('n1');
    expect(r.title?.reason).toMatch(/^Lunch stop idea: /);
  });

  test('[STOP-LINES] the worked line', () => {
    const km = 100 + 18;
    const r = ideas({ trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 100, at: `${SAT} 11:34` })], now: `${SAT} 11:34`, spots: [...seatedStop.filter((s) => s.km !== 115), { b: cafe('Mo-Su 08:00-18:00', { name: 'Café Lindenhof', ...SEATS(true) }), km, id: 'n1' }] });
    expect(r.title?.reason).toBe('Lunch stop idea: Café Lindenhof, +18 km, about 12:35 · open until 18:00 · indoor seating mapped · toilets not mapped.');
  });

  test('[STOP-T5] restaurant open all afternoon with kitchen hours 11:30-14:00: no meal idea at 14:10', () => {
    const km = at1230;
    const place = restaurant(OPEN, { ...SEATS(null, { kitchenHours: 'Mo-Su 11:30-14:00' }) });
    const spotsHere: Spot[] = [...seatedStop, { b: place, km, id: 'n1' }];
    const x = setup({ spots: spotsHere, now: `${SAT} 09:30` });
    const p = x.f.places.find((q) => q.id === 'n1')!;
    const withKitchen = [...x.f.hours, { ...preparedHours(p, 'Mo-Su 11:30-14:00'), placeId: kitchenHoursId('n1') }];
    const facts: typeof x.f = { ...x.f, hours: withKitchen };
    // Reached 13:40 leaving at 09:30 + ...: outside the window. 13:20: kitchen closes before +45.
    const reachedAt = (d: string): FoodFacts & LeaveFacts => ({ ...facts, ride: { ...facts.ride, departure: at(d) }, schedule: facts.schedule.withDeparture(at(d)) });
    const seen = (d: string): boolean => stopIdeas(reachedAt(d), [], x.lb, null, null).title?.placeId === 'n1';
    expect(seen(`${SAT} 09:30`)).toBe(true); // 12:30, kitchen open for 45 minutes
    expect(seen(`${SAT} 10:20`)).toBe(false); // 13:20: the kitchen closes 40 minutes on
  });

  test('[STOP-T5] beyond 3 h of riding it does not fire', () => {
    const r = ideas({ now: `${SAT} 08:30`, spots: [...seatedStop, { b: restaurant(OPEN), km: 100 + 240 / kmToMin(1), id: 'n1' }] });
    expect(r.title?.trigger).not.toBe('meal');
  });

  test('[STOP-T5] kitchen hours mapped but not prepared: never open for a meal', () => {
    const r = ideas({ now: `${SAT} 09:30`, spots: [...seatedStop, { b: restaurant(OPEN, { ...SEATS(null, { kitchenHours: 'Mo-Su 11:30-14:00' }) }), km: at1230, id: 'n1' }] });
    expect(r.title?.placeId).not.toBe('n1');
  });

  test('[STOP-T5] at 44 min of riding it is no candidate; the line joins the timeline; at 45 it is', () => {
    const near = (minutes: number): Ideas => ideas({ trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 100, at: `${SAT} 11:40` })], now: `${SAT} 11:40`, spots: [...seatedStop, { b: restaurant(OPEN), km: 100 + minutes / kmToMin(1), id: 'n1' }] });
    expect(near(46).title?.placeId).toBe('n1');
    expect(near(44).title?.placeId).not.toBe('n1');
    expect(near(44).timeline.some((i) => i.trigger === 'meal')).toBe(true);
  });

  test('[STOP-T5] kinds: restaurant and café before fast food; a bakery only with indoor_seating=yes', () => {
    const c = (b: Spot['b'], other: Spot['b']): string | null | undefined => ideas({ now: `${SAT} 09:30`, spots: [...seatedStop, { b, km: 100 + 170 / kmToMin(1), id: 'n1' }, { b: other, km: 100 + 171 / kmToMin(1), id: 'n2' }] }).title?.placeId;
    expect(c(restaurant(OPEN), fastFood(OPEN))).toBe('n1');
    expect(c(fastFood(OPEN), cafe(OPEN))).toBe('n2');
    expect(c(bakery(OPEN), fastFood(OPEN))).toBe('n2');
    expect(c(bakery(OPEN, SEATS(true)), kiosk(OPEN))).toBe('n1');
  });
});

describe('T6 Rhythm', () => {
  test('[STOP-T6] a bakery 15 min ahead is never the T6 idea; it stays as the nearest open place', () => {
    const r = ideas({ trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 100, at: `${SAT} 15:00` })], now: `${SAT} 15:00`, spots: [...NO_GAP(), { b: bakery(OPEN), km: 100 + 15 / kmToMin(1), id: 'n1' }] });
    expect(r.title?.placeId).not.toBe('n1');
    expect(r.nearestOpen?.placeId).toBe('n1');
    expect(r.timeline.map((i) => i.placeId)).toContain('n1');
  });

  test('[STOP-T6] open places 1.5-2.5 h ahead, nearest 2 h; bakery and café first', () => {
    const when: Case = { trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 140, at: `${SAT} 15:00` })], now: `${SAT} 15:00` };
    const km = (m: number): number => 140 + m / kmToMin(1);
    const base: Spot[] = [{ b: restaurant(OPEN), km: 199.5, id: 'n500' }, { b: kiosk(OPEN), km: km(70), id: 'n504' }];
    const r = ideas({ ...when, spots: [...base, { b: kiosk(OPEN), km: km(100), id: 'n3' }, { b: bakery(OPEN), km: km(125), id: 'n2' }, { b: bakery(OPEN), km: km(145), id: 'n1' }] });
    expect(r.title?.trigger).toBe('rhythm');
    expect(r.title?.placeId).toBe('n2');
    const list = (mins: number[]): string | null | undefined => ideas({ ...when, spots: [...base, ...mins.map((m, i) => ({ b: kiosk(OPEN), km: km(m), id: `n${i + 1}` }))] }).title?.placeId;
    expect(list([90])).toBe('n1');
    expect(list([150])).toBe('n1');
    expect(list([89])).toBeNull();
    expect(list([151])).toBeNull();
  });

  test('[H-QUESTIONS] the card\'s list reads "open at arrival, closes 20:00"; a shop closing 10 min after arrival is in the list, and no idea', () => {
    // Leaving km 100 at 08:30: reached at 09:25, closing 10 minutes on.
    const km = 100 + 55 / kmToMin(1);
    const a = answer({ spots: [...NO_GAP(), { b: supermarket('Mo-Su 08:00-09:35'), km, id: 'n1' }, { b: supermarket('Mo-Su 08:00-20:00'), km: km + 1, id: 'n2' }] });
    const details = a.items.map((i) => `${i.label} ${i.detail ?? ''}`);
    expect(details.some((d) => d.includes('open at arrival, closes 09:35'))).toBe(true);
    expect(details.some((d) => d.includes('open at arrival, closes 20:00'))).toBe(true);
    expect(a.items.some((i) => i.stamp?.km === km && i.label.startsWith('Stop idea'))).toBe(false);
    expect(a.title).not.toContain('09:25');
  });

  test('[H-QUESTIONS] the next place open at arrival is named when T6 finds none', () => {
    const r = answer({ trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 195, at: `${SAT} 15:00` })], now: `${SAT} 15:00`, spots: [{ b: restaurant(OPEN), km: 199.5, id: 'n500' }] });
    expect(r.title).toContain('Next place open at arrival');
    expect(r.title).toContain('km');
    expect(r.status).toBe('fine');
  });
});

describe('ranking', () => {
  const when: Case = { trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 140, at: `${SAT} 15:00` })], now: `${SAT} 15:00` };
  const km = (m: number): number => 140 + m / kmToMin(1);
  const stopAt = [{ b: restaurant(OPEN), km: 199.5, id: 'n500' }, { b: kiosk(OPEN), km: km(70), id: 'n504' }];
  const pick = (spots: Spot[], water: string | null = null, c: Partial<Case> = {}): string | null | undefined => ideas({ ...when, ...c, water, spots: [...stopAt, ...spots] }).title?.placeId;

  test('[STOP-RANK] kind first', () => {
    expect(pick([{ b: kiosk(OPEN), km: km(120), id: 'n1' }, { b: bakery(OPEN), km: km(145), id: 'n2' }])).toBe('n2');
  });
  test('[STOP-RANK] then the arrival nearest the target, in 15-minute steps', () => {
    expect(pick([{ b: bakery(OPEN), km: km(110), id: 'n2' }, { b: bakery(OPEN), km: km(125), id: 'n1' }])).toBe('n1');
  });
  test('[STOP-RANK] then, in rain or heat, indoor seating; on a plain day it does not count', () => {
    const list: Spot[] = [{ b: cafe(OPEN), km: km(120), id: 'n1' }, { b: cafe(OPEN, SEATS(true)), km: km(121), id: 'n2' }];
    expect(pick(list)).toBe('n1');
    expect(pick(list, null, { spells: [{ range: [198, 200], stamps: stamps(SAT, 12, 23), pp: 80, mm: 1 }] })).toBe('n2');
  });
  test('[STOP-RANK] then the shorter detour', () => {
    expect(pick([{ b: bakery(OPEN), km: km(120), off: 500, id: 'n1' }, { b: bakery(OPEN), km: km(121), off: 100, id: 'n2' }])).toBe('n2');
  });
  test('[STOP-RANK] then Water\'s refill target', () => {
    expect(pick([{ b: bakery(OPEN), km: km(120), id: 'n1' }, { b: bakery(OPEN), km: km(121), id: 'n2' }], 'n2')).toBe('n2');
  });
  test('[STOP-RANK] then toilets mapped', () => {
    expect(pick([{ b: bakery(OPEN), km: km(120), id: 'n1' }, { b: bakery(OPEN, SEATS(null, { toilets: true })), km: km(121), id: 'n2' }])).toBe('n2');
  });
  test('[STOP-RANK] then bike parking within 50 m', () => {
    expect(pick([{ b: bakery(OPEN), km: km(120), id: 'n1' }, { b: bakery(OPEN, SEATS(null, { bikeParking50m: true })), km: km(121), id: 'n2' }])).toBe('n2');
  });
  test('[STOP-RANK] for meals, no climb starting within 2 km', () => {
    const climbs: Climb[] = [{ startKm: 151, topKm: 153, gainM: 100, avgGradePct: 5, steepest500mPct: 7 }];
    const route = { ...flatRoute(500, { stageEnds: [100, 200, 320] }), climbs };
    const r = ideas({ trip: dayFrom100({ route }), now: `${SAT} 09:30`, spots: [...NO_GAP(), { b: restaurant(OPEN), km: 147, id: 'n1' }, { b: restaurant(OPEN), km: 149, id: 'n0' }] });
    expect(r.title?.placeId).toBe('n1');
  });
  test('[STOP-RANK] then another open place in the settlement', () => {
    expect(pick([{ b: bakery(OPEN), km: km(108), id: 'n2' }, { b: bakery(OPEN), km: km(132), id: 'n3' }, { b: settlement('Bühl'), km: km(132) }, { b: kiosk(OPEN), km: km(132.5), id: 'n4' }])).toBe('n3');
  });
  test('[STOP-RANK] then the final tie-break: place id as text', () => {
    expect(pick([{ b: bakery(OPEN), km: km(120), id: 'n9' }, { b: bakery(OPEN), km: km(120), id: 'n10' }])).toBe('n10');
  });
  test('[STOP-RANK] the order of places in the input decides nothing', () => {
    const list: Spot[] = [{ b: bakery(OPEN), km: km(120), id: 'n9' }, { b: bakery(OPEN), km: km(120), id: 'n10' }, { b: cafe(OPEN), km: km(130), id: 'n11' }];
    expect(pick([...list].reverse())).toBe(pick(list));
  });
});

describe('the Food card', () => {
  test('[STOP-FOOD-UNKNOWN] no data on the ride: unknown, missing places', () => {
    const a = answer({ savedKm: [], spots: NO_GAP() });
    expect(a.status).toBe('unknown');
    expect(a.missing).toContain('places');
    expect(answer({ savedKm: [{ fromKm: 0, toKm: 150 }], spots: NO_GAP() }).status).toBe('unknown');
    expect(answer({ savedKm: [{ fromKm: Number.NaN, toKm: Number.NaN }], spots: NO_GAP() }).status).toBe('unknown');
  });

  test('[STOP-FOOD-UNKNOWN] food places, none with known hours: "No stop idea: hours unknown for the next 4 food places"', () => {
    const a = answer({ spots: [20, 30, 40, 50].map((k) => ({ b: supermarket(null), km: 100 + k })) });
    expect(a.title).toBe('No stop idea: hours unknown for the next 4 food places');
    expect(a.status).toBe('unknown');
    expect(a.missing).toContain('hours');
  });

  test('[STOP-FOOD-UNKNOWN] one with known hours: the triggers run', () => {
    const a = answer({ spots: [{ b: supermarket(null), km: 120 }, { b: supermarket(OPEN), km: 150 }] });
    expect(a.status).not.toBe('unknown');
  });

  test('[STOP-FOOD-UNKNOWN] no food place at all: triggers run, T1 or T2 states the gap', () => {
    const a = answer({ spots: [{ b: tap(), km: 110 }] });
    expect(a.status).toBe('action');
    expect(a.title).toContain('No food place mapped as open');
  });

  test('[STOP-FOOD-UNKNOWN] no date, a bad speed, a bad clock: unknown, and nothing throws', () => {
    const noDate = answer({ trip: dayFrom100({ departureDate: null }), positions: [] });
    expect(noDate.status).toBe('unknown');
    expect(noDate.missing).toContain('date');
    expect(answer({ trip: dayFrom100({ flatKph: 0 }), spots: NO_GAP() }).status).toBe('unknown');
    expect(answer({ trip: dayFrom100({ flatKph: Number.NaN }), spots: NO_GAP() }).status).toBe('unknown');
    expect(answer({ now: new Date(Number.NaN), positions: [] }).status).toBe('unknown');
  });

  test('[STOP-FOOD-STATUS] action from T1 or T2, otherwise fine', () => {
    expect(answer({ spots: [{ b: supermarket(OPEN), km: 150 }] }).status).toBe('action');
    expect(answer({ spots: NO_GAP() }).status).toBe('fine');
  });

  test('[STOP-DRINK] without drink places in the packs, ranking and classes skip them without error', () => {
    const r = ideas({ spots: NO_GAP() });
    expect(r.title).not.toBeNull();
  });

  test('[STOP-DRINK] with them, a pub is the last kind T6 reaches for', () => {
    const when: Case = { trip: dayFrom100(), positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 140, at: `${SAT} 15:00` })], now: `${SAT} 15:00` };
    const km = 140 + 120 / kmToMin(1);
    const pub: Spot = { b: restaurant(OPEN, { kind: 'drink', tags: { amenity: 'pub' } }), km, id: 'n1' };
    const base = [{ b: restaurant(OPEN), km: 199.5, id: 'n500' }, { b: kiosk(OPEN), km: 140 + 85 / kmToMin(1), id: 'n504' }];
    expect(ideas({ ...when, spots: [...base, pub] }).title?.placeId).toBe('n1');
    expect(ideas({ ...when, spots: [...base, pub, { b: fastFood(OPEN), km: km + 1, id: 'n2' }] }).title?.placeId).toBe('n2');
  });

  test('[STOP-DRINK] tags from strangers do not throw: constructor, __proto__', () => {
    const odd: Spot[] = [{ b: kiosk(OPEN, { tags: { shop: 'constructor' } }), km: 120 }, { b: cafe(OPEN, { tags: { amenity: '__proto__' } }), km: 130 }];
    expect(() => answer({ spots: [...NO_GAP(), ...odd] })).not.toThrow();
  });

  test('[STOP-DRINK] broken matches and a broken first one decide nothing', () => {
    const x = setup({ spots: NO_GAP() });
    const id = x.f.places[0]!.id;
    const broken = { ...x.f, matches: [{ placeId: id, km: Number.NaN, offRouteM: 0 }, ...x.f.matches] };
    expect(stopIdeas(broken, x.plans, x.lb, null, null).title?.placeId).toBe(stopIdeas(x.f, x.plans, x.lb, null, null).title?.placeId);
  });

  test('[STOP-FOOD-STATUS] the card has a basis with the map attribution', () => {
    const a = answer({ spots: NO_GAP() });
    expect(a.basis).toContain('© OpenStreetMap contributors');
    expect(a.topic).toBe('food');
  });

  test('[STOP-OPEN-ALL] no weather shelter is ever an idea, in the timeline or the title', () => {
    const r = ideas({ spells: [{ range: [150, 170], stamps: stamps(SAT, 8, 22), pp: 80, mm: 1 }], spots: [...NO_GAP(), { b: shelter(), km: 142, id: 'n1' }] });
    expect([r.title, ...r.timeline].map((i) => i?.placeId)).not.toContain('n1');
  });

  // ---- properties ----------------------------------------------------------------------------------------------------

  const genStops = fc.record({
    start: fc.integer({ min: 100, max: 150 }), time: fc.integer({ min: 7, max: 16 }),
    places: fc.array(fc.record({ km: fc.double({ min: 100, max: 201, noNaN: true }), off: fc.constantFrom(0, 0, 200, 600), tag: hoursValue(), kind: fc.integer({ min: 0, max: 6 }) }), { maxLength: 6 }),
    rain: fc.constantFrom(0, 1, 2), hot: fc.boolean(),
  });
  const BUILD = [supermarket, kiosk, bakery, cafe, restaurant, fuelShop, fastFood];
  type G = { start: number; time: number; places: { km: number; off: number; tag: string; kind: number }[]; rain: number; hot: boolean };
  const fromGen = (g: G): Case => ({
    trip: dayFrom100(), now: `${SAT} ${String(g.time).padStart(2, '0')}:00`,
    positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: g.start, at: `${SAT} ${String(g.time).padStart(2, '0')}:00` })],
    spots: g.places.map((p, i) => ({ b: BUILD[p.kind]!(p.tag), km: p.km, off: p.off, id: `n${i + 1}` })),
    spells: [
      ...(g.rain === 1 ? [{ range: [100, 200] as [number, number], stamps: stamps(SAT, 8, 23), pp: 80, mm: 1 }] : []),
      ...(g.rain === 2 ? [{ range: [100, 200] as [number, number], stamps: stamps(SAT, 12, 18), pp: 50, code: 95 }] : []),
      ...(g.hot ? [{ range: [100, 200] as [number, number], stamps: stamps(SAT, 10, 16), t: 32 }] : []),
    ],
  });

  fcTest.prop([genStops])('[STOP-FOOD-STATUS] never warning, and only T1 or T2 make it action', (g) => {
    const a = answer(fromGen(g));
    expect(a.status).not.toBe('warning');
  }, 60_000);

  fcTest.prop([genStops])('[STOP-OPEN-ALL] every idea is open from arrival to +30 min (+45 for meals); T5 and T6 at least 45 min away (T6 90); weather shelters never', (g) => {
    const x = setup(fromGen(g));
    const r = stopIdeas(x.f, x.plans, x.lb, null, x.wg);
    const hoursOf = new Map(x.f.hours.map((h) => [h.placeId, h] as [string, PlaceHours]));
    for (const idea of [r.title, ...r.timeline, r.nearestOpen]) {
      if (!idea || idea.placeId === null || idea.arrival === null) continue;
      const place = x.f.places.find((p) => p.id === idea.placeId);
      expect(place?.kind).not.toBe('shelter');
      if (place?.kind === 'station') continue;
      const h = hoursOf.get(idea.placeId);
      expect(openOnArrival(h, idea.arrival)).toBe(true);
      if (idea.trigger === 'meal') {
        expect(openOver(h, idea.arrival, new Date(idea.arrival.getTime() + 45 * 60_000))).toBe(true);
        expect((idea.arrival.getTime() - x.f.ride.departure.getTime()) / 60_000).toBeGreaterThanOrEqual(45);
      }
      if (idea.trigger === 'rhythm' && idea !== r.nearestOpen) expect((idea.arrival.getTime() - x.f.ride.departure.getTime()) / 60_000).toBeGreaterThanOrEqual(45);
    }
  }, 60_000);
});

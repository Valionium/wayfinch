// What review found: data from strangers, broken numbers that stick, and water reckoned too kindly.
import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { sunFromSuncalc } from '../../../../src/core/engines/daylight.ts';
import { buffer, findS1S2, sourceAt, use, waterAnswer, waterNow, type Target, type WaterFacts } from '../../../../src/core/engines/water.ts';
import { updateCarrying, updateDrinking, type Ride } from '../../../../src/core/engines/water-learning.ts';
import { planningWeather } from '../../../../src/core/engines/water-model.ts';
import { isPublicHoliday } from '../../../../src/core/hours/check.ts';
import type { Answer, Baseline, GridHour, Place, Route, StoredForecast } from '../../../../src/core/types.ts';
import { at, flatRoute, pos, shop, tap, testTrip } from '../../../fixtures/build.ts';
import { factsOf, hoursOf, SAT, steady, type Case, type Spot } from './water-helpers.ts';

const textOf = (a: Answer): string => [a.title, a.detail, ...a.basis, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
const near = (x: number, want: number, tol = 0.01): void => { expect(Math.abs(x - want)).toBeLessThanOrEqual(tol); };
const tapAt = (km: number, name?: string): Spot => ({ b: tap(name ? { name } : {}), km });
const JULY = at('2026-07-11 12:00');

describe('fading of k', () => {
  const NOW = new Date('2026-10-17T12:00:00Z');
  const DAY = 86_400_000;
  const later = (days: number): Date => new Date(NOW.getTime() + days * DAY);
  const weighed = (r: number, ago: number): Ride => ({ at: new Date(NOW.getTime() - ago * DAY), predictedL: 1, intakeL: 0, feel: null, massLossKg: r });
  const six = (r: number): Ride[] => [6, 5, 4, 3, 2, 1].map((d) => weighed(r, d));
  const avg = { thirst: 'average' as const };

  test('[W-K-BOUNDS] a k below the prior comes back to it as its rides fade', () => {
    const low = six(0.5);
    const today = updateCarrying(avg, low, NOW).k;
    expect(today).toBeLessThan(0.8);
    const month = updateCarrying(avg, low, later(30)).k;
    expect(month).toBeGreaterThan(today);
    expect(updateCarrying(avg, low, later(365)).k).toBeCloseTo(1, 2);
    expect(updateCarrying(avg, low, later(365)).k).toBeLessThanOrEqual(1);
  });

  test('[W-K-BOUNDS] the careful side: a k above the prior does not fall from time alone, and U rises instead', () => {
    const high = six(1.5);
    const today = updateCarrying(avg, high, NOW);
    expect(today.k).toBeGreaterThan(1.1);
    const year = updateCarrying(avg, high, later(365));
    expect(year.k).toBe(today.k);
    expect(year.U).toBe(1.4);
  });

  test('[W-K-BOUNDS] with "more" the prior it returns to is 1.2', () => {
    expect(updateCarrying({ thirst: 'more' }, six(0.5), later(365)).k).toBeCloseTo(1.2, 2);
  });

  test('[W-K-BOUNDS] a ride after a long gap starts from the faded k', () => {
    const low = six(0.5);
    const faded = updateCarrying(avg, low, later(365)).k;
    const ride: Ride = { at: later(365), predictedL: 2, intakeL: 2, feel: 'C' };
    const after = updateCarrying(avg, [...low, ride], later(365)).k;
    expect(after).toBeGreaterThanOrEqual(faded);
    expect(Math.abs(Math.log(after / faded))).toBeLessThanOrEqual(Math.log(1.1) + 1e-9);
  });

  test('[W-KDRINK] k_drink does not fade: only weighed rides move it', () => {
    const low = six(0.5);
    expect(updateDrinking(low, later(365))).toBe(updateDrinking(low, NOW));
  });
});

describe('water since the confirmation', () => {
  const climbing = (): Route => {
    const flat = flatRoute(100, { stageEnds: [50] });
    return { ...flat, ascentM: 3000, points: flat.points.map((p) => ({ ...p, ele: 100 + Math.min(p.km, 50) * 60 })) };
  };
  const hot = steady({ t: 29, rh: 40, ghi: 800 });
  const planRateAt = (f: WaterFacts, km: number): number => {
    const ahead: Target = { kind: 'end', km: km + 5 };
    return buffer(f, km, ahead) / Math.max(0.5, 0.2 * (f.schedule.ridingMinBetween(km, km + 5) / 60));
  };

  test('[W-UNCONFIRMED] reckoned at the rate of the climb the rider is on, not a flat one', () => {
    const c: Case = {
      trip: testTrip({ route: climbing() }), forecast: hot, litres: 3, confirmedAt: `${SAT} 09:00`, now: `${SAT} 11:30`,
      positions: [pos({ km: 10, at: `${SAT} 09:00` }), pos({ km: 25, at: `${SAT} 11:30` })], spots: [tapAt(40), tapAt(45)],
    };
    const f = factsOf(c);
    const rate = planRateAt(f, 20);
    expect(rate).toBeGreaterThan(0.8);
    const now = waterNow(f);
    expect(now.confirmed).toBe(true);
    near(now.confirmed ? now.litres : -1, Math.max(0, 3 - 2.5 * rate), 0.2);
    expect(waterAnswer(f).status).toBe('warning');
  });

  test('[W-UNCONFIRMED] the same with no later position: the road around the rider', () => {
    const f = factsOf({
      trip: testTrip({ route: climbing() }), forecast: hot, litres: 3, confirmedAt: `${SAT} 09:00`, now: `${SAT} 11:00`,
      positions: [pos({ km: 10, at: `${SAT} 09:00` })],
    });
    const now = waterNow(f);
    near(now.confirmed ? now.litres : -1, Math.max(0, 3 - 2 * planRateAt(f, 10)), 0.15);
  });

  test('[W-UNCONFIRMED] no position before the confirmation: a source the rider may have passed drops it', () => {
    const c: Case = { litres: 3, confirmedAt: `${SAT} 09:00`, now: `${SAT} 11:00`, positions: [pos({ km: 50, at: `${SAT} 11:00` })] };
    expect(waterNow(factsOf({ ...c, spots: [tapAt(20), tapAt(60), tapAt(70)] }))).toEqual({ confirmed: false, stillAbout: null });
    expect(waterAnswer(factsOf({ ...c, spots: [tapAt(20), tapAt(60), tapAt(70)] })).status).toBe('unknown');
    // Nothing reliable on the way: the value stands.
    expect(waterNow(factsOf({ ...c, spots: [tapAt(60), tapAt(70)] })).confirmed).toBe(true);
  });

  test('[W-UNCONFIRMED] a position with a broken kilometre or time is left out, and does not hide a passed source', () => {
    const c: Case = {
      litres: 3, confirmedAt: `${SAT} 09:00`, now: `${SAT} 11:00`, spots: [tapAt(20), tapAt(60)],
      positions: [pos({ km: 10, at: `${SAT} 09:00` }), pos({ km: 30, at: `${SAT} 10:00` })],
    };
    const f = factsOf(c);
    const broken = { ...pos({ km: 40, at: `${SAT} 10:30` }), km: NaN };
    expect(waterNow({ ...f, positions: [...f.positions, broken] })).toEqual({ confirmed: false, stillAbout: null });
  });
});

describe('tags are data from strangers', () => {
  const HOSTILE = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'prototype', 'isPrototypeOf', 'constructor-__proto__', 'mayhem', 'marble-augur', '-', '--', ';', ',,', 'apr-', '-oct'];

  test('[W-SOURCE-OUTDOOR] a seasonal value that names an object property gives no window and no crash', () => {
    for (const seasonal of HOSTILE) {
      const p = tap({ seasonal }).atKm(30);
      expect(sourceAt(p, { placeId: p.id, km: 30, offRouteM: 0 }, JULY, factsOf())).toEqual({ reliable: true, reason: null });
      expect(() => waterAnswer(factsOf({ spots: [{ b: tap({ seasonal }), km: 30 }, tapAt(60)] }))).not.toThrow();
    }
  });

  test('[W-SOURCE-OUTDOOR] words that merely start like a month are no month', () => {
    const p = tap({ seasonal: 'mayhem' }).atKm(30);
    const winter = at('2026-12-15 12:00');
    expect(sourceAt(p, { placeId: p.id, km: 30, offRouteM: 0 }, winter, factsOf())).toEqual({ reliable: false, reason: 'may be switched off for winter' });
    const full = tap({ seasonal: 'April-October' }).atKm(30);
    expect(sourceAt(full, { placeId: full.id, km: 30, offRouteM: 0 }, JULY, factsOf()).reliable).toBe(true);
    expect(sourceAt(full, { placeId: full.id, km: 30, offRouteM: 0 }, winter, factsOf()).reason).toBe('seasonal: April–October');
  });

  test('[W-LABELS] a place with a time zone no one knows is judged on the route\'s zone, and takes nothing down', () => {
    const f = factsOf({ spots: [{ b: tap({ timeZone: 'Not/AZone', name: 'Odd' }), km: 30 }, tapAt(60)] });
    const a = waterAnswer(f);
    expect(a.status).not.toBe('unknown');
    expect(textOf(a)).toContain('Odd');
  });

  test('[H-WINDOW-END] a holiday zone that names an object property is no holiday', () => {
    for (const zone of ['constructor', '__proto__', 'toString']) expect(isPublicHoliday('2026-10-17', zone, {})).toBe(false);
  });

  fcTest.prop([
    fc.oneof(fc.string(), fc.constantFrom(...HOSTILE)), fc.oneof(fc.string(), fc.constantFrom(...HOSTILE)),
    fc.oneof(fc.string(), fc.constantFrom('Europe/Berlin', 'Mars/Base')), fc.oneof(fc.string(), fc.constantFrom('2020-01-01')),
  ])('[W-LABELS] property: whatever the tags say, the card is an answer', (seasonal, fee, timeZone, checkDate) => {
    const tags: Record<string, string> = { fee, shop: seasonal, automated: fee, [seasonal]: fee };
    const list: Spot[] = [
      { b: tap({ seasonal, tags, timeZone, checkDate }), km: 30 },
      { b: shop(seasonal, { seasonal, tags, timeZone, checkDate }), km: 40 },
      { b: tap({ waterClass: 'C', seasonal, tags, name: seasonal }), km: 50 },
    ];
    const a = waterAnswer(factsOf({ spots: list }));
    expect(['fine', 'action', 'warning', 'unknown']).toContain(a.status);
    expect(textOf(a)).not.toMatch(/NaN|undefined/);
  });
});

describe('a broken first item never sticks', () => {
  const hour = (when: Date, t: number): GridHour => ({ at: when, t, rh: 40, ghi: 300, pp: 0, mm: 0, code: 0, windMs: 0, windFrom: 0, gustMs: 0 });
  const hours = (): GridHour[] => Array.from({ length: 48 }, (_, i) => hour(new Date(at(`${SAT} 00:00`).getTime() + i * 3_600_000), 35));
  const forecastWith = (first: GridHour): StoredForecast => ({ fetchedAt: at(`${SAT} 06:00`), runs: [], grid: [{ km: 0, lat: 49, lon: 8.4, hours: [first, ...hours()] }], has15: false });
  const here = { route: flatRoute(100), timeZone: 'Europe/Berlin' };

  test('[W-MARGIN] a first forecast hour with an invalid time is not read', () => {
    const f = forecastWith(hour(new Date(NaN), 5));
    expect(planningWeather(f, null, 0, at(`${SAT} 12:00`), here).planT).toBe(36);
  });

  test('[W-MARGIN] a card on that forecast reads the same as on a clean one', () => {
    const c: Case = { spots: [tapAt(41), tapAt(60)], litres: 2 };
    const clean = factsOf({ ...c, forecast: { ...forecastWith(hour(at(`${SAT} 00:00`), 35)) } });
    const broken = factsOf({ ...c, forecast: forecastWith(hour(new Date(NaN), 5)) });
    near(use(broken, 'now', findS1S2(broken).s1, 'plan'), use(clean, 'now', findS1S2(clean).s1, 'plan'), 1e-9);
  });

  test('[W-MARGIN] a grid point with a broken kilometre is not read', () => {
    const f = forecastWith(hour(at(`${SAT} 00:00`), 35));
    const grid: StoredForecast = { ...f, grid: [{ km: NaN, lat: 49, lon: 8.4, hours: [hour(at(`${SAT} 12:00`), 5)] }, ...f.grid] };
    expect(planningWeather(grid, null, 0, at(`${SAT} 12:00`), here).planT).toBe(36);
  });

  const point = (over: Partial<Baseline['points'][number]>): Baseline['points'][number] => ({ km: 0, eleM: 100, month: 10, p10LowC: 5, meanLowC: 7, p90HighC: 30, meanHighC: 20, rainDays: 8, ...over });
  test('[W-FALLBACK] a baseline point with a broken kilometre is not read', () => {
    const b: Baseline = { years: 'x', points: [point({ km: NaN, p90HighC: 5 }), point({ km: 0, p90HighC: 30 })] };
    expect(planningWeather(null, b, 0, at(`${SAT} 12:00`), here).planT).toBe(31);
    const only: Baseline = { years: 'x', points: [point({ km: NaN, p90HighC: 5 })] };
    expect(planningWeather(null, only, 0, at(`${SAT} 12:00`), here).label).toBe('assumed-hot');
  });

  test('[W-WINTER] so too for the night low; with only a broken point left, the tap needs proof that it is on', () => {
    const p = tap().atKm(30);
    const judge = (b: Baseline) => sourceAt(p, { placeId: p.id, km: 30, offRouteM: 0 }, at('2026-10-10 12:00'), factsOf({ baseline: b }));
    expect(judge({ years: 'x', points: [point({ km: NaN, p10LowC: 5 }), point({ km: 0, p10LowC: -2 })] }).reliable).toBe(false);
    expect(judge({ years: 'x', points: [point({ km: NaN, p10LowC: -2 }), point({ km: 0, p10LowC: 5 })] }).reliable).toBe(true);
    expect(judge({ years: 'x', points: [point({ km: NaN, p10LowC: 5 })] }).reliable).toBe(false);
  });
});

describe('saved place data', () => {
  test('[W-REACH-EDGE] a range that does not end in a real kilometre is no data', () => {
    for (const r of [{ fromKm: 0, toKm: Infinity }, { fromKm: -Infinity, toKm: 300 }, { fromKm: 0, toKm: NaN }]) {
      const f = factsOf({ spots: [tapAt(10), tapAt(30)], litres: 14, savedKm: [r] });
      expect(findS1S2(f).s1).toEqual({ kind: 'edge', km: 0 });
      const a = waterAnswer(f);
      expect(a.status).not.toBe('fine');
      expect(a.missing).toContain('places');
    }
  });

  test('[W-NO-SOURCE] an edge at the rider has no "next 0 km"', () => {
    expect(textOf(waterAnswer(factsOf({ litres: 3, savedKm: [] })))).not.toContain('next 0 km');
  });
});

describe('standing at the end of the route', () => {
  const atEnd: Case = { now: `${SAT} 20:00`, positions: [pos({ km: 300, at: `${SAT} 19:00` })], litres: 0.2, spots: [tapAt(299.8, 'Last tap')] };

  test('[W-NO-SOURCE] the phase Route end reached: the warning stands, and the tap behind is shown with its distance', () => {
    const f = factsOf(atEnd);
    expect(f.ride.phase).toBe('route-end');
    const a = waterAnswer(f);
    expect(a.status).toBe('warning');
    expect(textOf(a)).not.toContain('next 0 km');
    const item = a.items.find((i) => i.label === 'Last tap')!;
    expect(item.detail).toContain('0.2 km back');
    expect(item.detail).toContain('mapped as drinking water');
  });

  test('[W-NO-SOURCE] with enough water the card stays fine, and still shows it', () => {
    const a = waterAnswer(factsOf({ ...atEnd, litres: 1 }));
    expect(a.status).toBe('fine');
    expect(a.items.some((i) => i.label === 'Last tap')).toBe(true);
  });

  test('[W-NO-SOURCE] a source that is not reliable is listed as uncertain, not as the tap behind', () => {
    const a = waterAnswer(factsOf({ ...atEnd, spots: [{ b: tap({ waterClass: 'C', name: 'Spring' }), km: 299.8 }] }));
    expect(a.items.find((i) => i.label === 'Spring')?.status).toBe('unknown');
  });

  test('[W-NO-SOURCE] the no-ride branch: tonight\'s stop is the route end', () => {
    const f = factsOf({ trip: testTrip({ route: flatRoute(50) }), now: `${SAT} 19:30`, litres: 0.2, spots: [tapAt(49.8, 'Last tap')] });
    expect(f.ride.noRide).toBe(true);
    const a = waterAnswer(f);
    expect(a.status).toBe('warning');
    expect(a.items.find((i) => i.label === 'Last tap')?.detail).toContain('0.2 km back');
  });
});

describe('small things', () => {
  test('[W-VALID-SUN] sun times that are not times read as day, the higher rate', () => {
    const f = factsOf({ spots: [tapAt(41)], forecast: steady({ t: 29, rh: 40, ghi: 800 }) });
    const bad = new Date(NaN);
    const broken = { ...f, sun: () => ({ dawn: bad, sunrise: bad, sunset: bad, dusk: bad, lightAllNight: false }) };
    const { s1 } = findS1S2(f);
    near(use(broken, 'now', s1, 'plan'), use(f, 'now', s1, 'plan'), 1e-9);
  });

  test('[W-NEVER-CLAIM] a forecast that holds nothing usable names weather as missing', () => {
    const empty: StoredForecast = { fetchedAt: at(`${SAT} 06:00`), runs: [], grid: [], has15: false };
    expect(waterAnswer(factsOf({ forecast: empty })).missing).toContain('weather');
    expect(waterAnswer(factsOf({ forecast: steady({ t: NaN }) })).missing).toContain('weather');
    expect(waterAnswer(factsOf()).missing).not.toContain('weather');
  });

  test('[W-OUTBACK] a turnaround tap as S1 and S2 does not read as two places', () => {
    const route = flatRoute(100);
    const a = waterAnswer(factsOf({ trip: testTrip({ route }), spots: [{ b: tap({ name: 'Turn' }), km: [49.9, 50.1], id: 'n5' }], litres: 3 }));
    expect(a.status).toBe('fine');
    expect(a.title).toBe('Enough to come back to Turn — refilling there is optional.');
  });

  test('[W-NEVER-CLAIM] an item is never "fine" on a card that is not', () => {
    const cases: Case[] = [
      { spots: [tapAt(41, 'Kehl'), tapAt(60)], litres: 0.5 },
      { spots: [tapAt(10, 'Kehl'), tapAt(77)], profile: { capacityL: 1.25 } },
      { spots: [tapAt(10, 'Kehl'), tapAt(50)], litres: 1.2 },
      { spots: [tapAt(10, 'Kehl'), tapAt(30)], litres: null },
      { spots: [tapAt(10, 'Kehl'), tapAt(30)], profile: { capacityL: null } },
    ];
    for (const c of cases) {
      const a = waterAnswer(factsOf(c));
      expect(a.status).not.toBe('fine');
      expect(a.items.length).toBeGreaterThan(0);
      expect(a.items.map((i) => i.status)).not.toContain('fine');
    }
    const fine = waterAnswer(factsOf({ spots: [tapAt(10, 'Kehl'), tapAt(30)], litres: 3 }));
    expect(fine.status).toBe('fine');
    expect(fine.items[0]!.status).toBe('fine');
  });
});

test('[W-WINTER] hours, too, are read at the arrival on the real sun function without trouble', () => {
  const p: Place = shop('x').atKm(30);
  const f = factsOf({ spots: [{ b: shop('x'), km: 30 }], hours: [hoursOf(p, [{ from: '08:00', to: '20:00' }])] });
  expect(waterAnswer({ ...f, sun: sunFromSuncalc }).topic).toBe('water');
});

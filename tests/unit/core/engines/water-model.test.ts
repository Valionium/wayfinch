import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { masses, outsideRange, planningWeather, riderPower, stopRate, sweatRate, type Section } from '../../../../src/core/engines/water-model.ts';
import type { Baseline, GridHour, LoadSummary, Profile, Route, StoredForecast } from '../../../../src/core/types.ts';
import { at, flatRoute } from '../../../fixtures/build.ts';

const satVp = (t: number): number => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
const rhOf = (t: number, eKpa: number): number => (eKpa / satVp(t)) * 100;
const moving = (powerW: number, planT: number, rhPct: number, airflow: number, ghi = 0, elevM = 0): Omit<Section, 'hours'> =>
  ({ powerW, planT, rhPct, airflow, ghi, day: true, elevM });
const inBand = (x: number, lo: number, hi: number): void => { expect(x).toBeGreaterThanOrEqual(lo); expect(x).toBeLessThanOrEqual(hi); };
const near = (x: number, want: number, tol = 0.01): void => { expect(Math.abs(x - want)).toBeLessThanOrEqual(tol); };

describe('validation', () => {
  test('[W-VALID-JENKINS] the four Jenkins 2023 cases', () => {
    const cases: [number, number, number, number, number, number][] = [
      [180, 18.1, 1.75, 0.46, 0.24, 0.58], [180, 27.1, 1.99, 0.80, 0.42, 0.98],
      [175, 36.1, 2.00, 1.11, 0.72, 1.42], [168, 36.2, 3.99, 1.17, 0.67, 1.39],
    ];
    for (const [p, t, e, want, lo, hi] of cases) {
      const sr = sweatRate(moving(p, t, rhOf(t, e), 4.5), 67, true);
      near(sr, want);
      inBand(sr, lo, hi);
    }
  });

  test('[W-VALID-MAUGHAN] 214 W, 30.2 °C, 1 m/s, 72 kg', () => {
    const dry = sweatRate(moving(214, 30.2, 24, 1), 72, true);
    const humid = sweatRate(moving(214, 30.2, 80, 1), 72, true);
    near(dry, 1.18); inBand(dry, 1.08, 1.56);
    near(humid, 1.75); inBand(humid, 1.44, 2.16);
  });

  test('[W-VALID-OTHERS] Montain & Coyle, Armstrong, Capitan', () => {
    const mc = sweatRate(moving(212, 33, 50, 2.5), 72, true);
    const ar = sweatRate(moving(130, 35.5, 29, 7.5, 650), 84, true);
    const ca = sweatRate(moving(220, 23.8, 71, 3.0, 300), 82, true);
    near(mc, 1.40); inBand(mc, 1.2, 1.6);
    near(ar, 0.98); inBand(ar, 0.80, 1.25);
    near(ca, 1.10); inBand(ca, 1.0, 1.8);
  });

  test('[W-VALID-SUN] 30 °C, flat 90 W, 40% RH, 5 m/s, 75 kg, 800 vs 0 W/m²', () => {
    const delta = sweatRate(moving(90, 30, 40, 5, 800), 75, true) - sweatRate(moving(90, 30, 40, 5, 0), 75, true);
    near(delta, 0.216, 0.005);
    inBand(delta, 0.2, 0.3);
  });

  test('[W-VALID-SUN] night has no sun, whatever the radiation says', () => {
    const night = { ...moving(160, 30, 40, 2.5, 800), day: false };
    expect(sweatRate(night, 75, true)).toBeCloseTo(sweatRate(moving(160, 30, 40, 2.5, 0), 75, true), 12);
    expect(sweatRate(night, 75, true)).toBeLessThan(sweatRate(moving(160, 30, 40, 2.5, 800), 75, true));
  });

  test('[W-UNIT] E_req = 1,000 W with f_h = 1', () => {
    near(sweatRate(moving(250, 35, 20, 4.5), 75, true), 1.48);
  });

  test('[W-HUMID] the humid/dry ratio', () => {
    const ratio = (v: number): number => sweatRate(moving(214, 30.2, 80, v), 72, true) / sweatRate(moving(214, 30.2, 24, v), 72, true);
    expect(ratio(1)).toBeGreaterThanOrEqual(1.2);
    expect(ratio(4.5)).toBeLessThanOrEqual(1.15);
    expect(ratio(4.5)).toBeGreaterThan(1);
  });
});

const sectionArb = fc.record({
  powerW: fc.double({ min: 0, max: 400, noNaN: true }), planT: fc.double({ min: -5, max: 34, noNaN: true }),
  rhPct: fc.double({ min: 5, max: 100, noNaN: true }), airflow: fc.double({ min: 1, max: 15, noNaN: true }),
  ghi: fc.double({ min: 0, max: 1000, noNaN: true }), day: fc.constant(true), elevM: fc.double({ min: 0, max: 3000, noNaN: true }),
});
const bump = fc.double({ min: 0.01, max: 20, noNaN: true });
const mass = fc.double({ min: 45, max: 120, noNaN: true });
const TOL = 1e-9;

describe('direction of effects', () => {
  for (const isMoving of [true, false]) {
    fcTest.prop([sectionArb, bump, mass])(`[W-DIRECTION] rises with temperature (moving ${isMoving})`, (s, d, m) => {
      expect(sweatRate({ ...s, planT: s.planT + d }, m, isMoving)).toBeGreaterThanOrEqual(sweatRate(s, m, isMoving) - TOL);
    });
    fcTest.prop([sectionArb, bump, mass])(`[W-DIRECTION] rises with power (moving ${isMoving})`, (s, d, m) => {
      expect(sweatRate({ ...s, powerW: s.powerW + d * 10 }, m, isMoving)).toBeGreaterThanOrEqual(sweatRate(s, m, isMoving) - TOL);
    });
    fcTest.prop([sectionArb, bump, mass])(`[W-DIRECTION] rises with sun (moving ${isMoving})`, (s, d, m) => {
      expect(sweatRate({ ...s, ghi: s.ghi + d * 10 }, m, isMoving)).toBeGreaterThanOrEqual(sweatRate(s, m, isMoving) - TOL);
    });
    fcTest.prop([sectionArb, bump, mass])(`[W-DIRECTION] rises with humidity (moving ${isMoving})`, (s, d, m) => {
      expect(sweatRate({ ...s, rhPct: Math.min(100, s.rhPct + d) }, m, isMoving)).toBeGreaterThanOrEqual(sweatRate(s, m, isMoving) - TOL);
    });
    fcTest.prop([sectionArb, bump, mass])(`[W-DIRECTION] falls with airflow below 35 °C (moving ${isMoving})`, (s, d, m) => {
      expect(sweatRate({ ...s, airflow: s.airflow + d }, m, isMoving)).toBeLessThanOrEqual(sweatRate(s, m, isMoving) + TOL);
    });
  }

  fcTest.prop([sectionArb, mass])('[W-DIRECTION] never below the floor', (s, m) => {
    expect(sweatRate(s, m, true)).toBeGreaterThanOrEqual(0.25);
    const h = Math.max(4 * s.powerW, 1.2 * m);
    expect(sweatRate(s, m, false)).toBeGreaterThanOrEqual((0.5 * h) / 1000 - TOL);
  });

  test('[W-DIRECTION] the floors bite: a cold descent 0.25 L/h, a cold stop 0.5 x H / 1000', () => {
    expect(sweatRate(moving(20, 5, 50, 10), 75, true)).toBe(0.25);
    expect(sweatRate(moving(0, 5, 50, 1), 75, false)).toBeCloseTo(0.045, 12);
  });

  test('[W-DIRECTION] above 35 °C more airflow brings in heat: it is not assumed to help', () => {
    expect(sweatRate(moving(100, 38, 10, 8), 75, true)).toBeGreaterThan(sweatRate(moving(100, 38, 10, 2), 75, true));
  });
});

test("[W-DIRECTION] the stop rate: P = 0, 1 m/s, stop floor, at the section's temperature and sun", () => {
  const s: Section = { hours: 1, powerW: 160, planT: 31, rhPct: 38, airflow: 2.5, ghi: 850, day: true, elevM: 0 };
  near(stopRate(s, 75), 0.2960, 0.0005);
  near(stopRate({ ...s, powerW: 90, planT: 30, rhPct: 40, airflow: 5, ghi: 800 }, 75), 0.2605, 0.0005);
  near(stopRate({ ...s, powerW: 20, planT: 28, rhPct: 45, airflow: 10, ghi: 800 }, 75), 0.2192, 0.0005);
  expect(stopRate({ ...s, planT: 5, ghi: 0 }, 75)).toBeCloseTo(0.045, 12);
});

test('[W-ALT] +0.03 L/h above 2,000 m, not at 2,000 m', () => {
  const base = sweatRate(moving(160, 25, 50, 3), 75, true);
  expect(sweatRate(moving(160, 25, 50, 3, 0, 2000), 75, true)).toBe(base);
  expect(sweatRate(moving(160, 25, 50, 3, 0, 2000.5), 75, true)).toBeCloseTo(base + 0.03, 12);
  expect(base).toBeGreaterThan(0.25);
});

describe('rider power', () => {
  test('[W-DIRECTION] CdA 0.5, Crr 0.007, 3% drivetrain loss, by hand', () => {
    near(riderPower({ totalKg: 100, speedMs: 5, grade: 0 }), 74.86, 0.05);
    near(riderPower({ totalKg: 100, speedMs: 2.5, grade: 0.06 }), 174.03, 0.05);
  });
  test('[W-DIRECTION] never below 0 on a descent', () => {
    expect(riderPower({ totalKg: 100, speedMs: 10, grade: -0.1 })).toBe(0);
  });
});

const hour = (text: string, o: Partial<GridHour> = {}): GridHour => ({
  at: at(text), t: 20, rh: 60, ghi: 300, pp: 0, mm: 0, code: 0, windMs: 2, windFrom: 180, gustMs: 3, ...o,
});
const SAT = '2026-10-17';
const forecastOf = (hours: GridHour[], km = 0): StoredForecast => ({ fetchedAt: at(`${SAT} 07:00`), runs: [], grid: [{ km, lat: 49, lon: 8.4, hours }], has15: false });
const baselineOf = (over: Partial<Baseline['points'][number]> = {}): Baseline => ({
  years: '2021-2025', points: [{ km: 0, eleM: 100, month: 10, p10LowC: 4, meanLowC: 7, p90HighC: 21, meanHighC: 16, rainDays: 8, ...over }],
});
const here = { route: flatRoute(100), timeZone: 'Europe/Berlin' };
const noon = at(`${SAT} 13:00`);
const midnight = at(`${SAT} 23:30`);

describe('planning weather', () => {
  test('[W-MARGIN] adds 1 °C to the raw forecast and leaves the forecast object alone', () => {
    const f = forecastOf([hour(`${SAT} 12:00`, { t: 18 }), hour(`${SAT} 13:00`, { t: 20.5, rh: 55, ghi: 410 }), hour(`${SAT} 14:00`, { t: 22 })]);
    const copy = JSON.stringify(f);
    expect(planningWeather(f, null, 0, noon, here)).toMatchObject({ planT: 21.5, rhPct: 55, ghi: 410, label: 'forecast' });
    expect(JSON.stringify(f)).toBe(copy);
  });

  test('[W-MARGIN] radiation is the hour that covers the moment; temperature the nearest stamp', () => {
    const f = forecastOf([hour(`${SAT} 13:00`, { t: 20, ghi: 100 }), hour(`${SAT} 14:00`, { t: 26, ghi: 700 })]);
    const w = planningWeather(f, null, 0, at(`${SAT} 13:10`), here);
    expect(w.ghi).toBe(700);
    expect(w.planT).toBe(21);
  });

  test("[W-MARGIN] temperature is moved to the section's height at 0.65 °C per 100 m", () => {
    const route: Route = { ...flatRoute(100), points: flatRoute(100).points.map((p) => ({ ...p, ele: p.km > 50 ? 1100 : 100 })) };
    const f = forecastOf([hour(`${SAT} 13:00`, { t: 20 })]);
    expect(planningWeather(f, null, 90, noon, { route, timeZone: 'Europe/Berlin' }).planT).toBeCloseTo(21 - 6.5, 9);
  });

  test('[W-MARGIN] the nearest grid point by kilometre answers', () => {
    const f: StoredForecast = { ...forecastOf([]), grid: [
      { km: 0, lat: 49, lon: 8.4, hours: [hour(`${SAT} 13:00`, { t: 10 })] },
      { km: 50, lat: 49.4, lon: 8.4, hours: [hour(`${SAT} 13:00`, { t: 30 })] },
    ] };
    expect(planningWeather(f, null, 20, noon, here).planT).toBe(11);
    expect(planningWeather(f, null, 30, noon, here).planT).toBe(31);
  });

  test("[W-FALLBACK] beyond the forecast: the baseline's 90th-percentile high + 1 °C, 50% RH, clear sky", () => {
    const f = forecastOf([hour(`${SAT} 09:00`)]);
    const w = planningWeather(f, baselineOf(), 0, noon, here);
    expect(w).toMatchObject({ planT: 22, rhPct: 50, label: 'seasonal' });
    expect(Math.abs(w.ghi - 516)).toBeLessThan(10);
    expect(planningWeather(f, baselineOf(), 0, midnight, here).ghi).toBe(0);
  });

  test('[W-FALLBACK] no forecast or baseline: 30 °C, 50%, clear sky', () => {
    const w = planningWeather(null, null, 0, noon, here);
    expect(w).toMatchObject({ planT: 30, rhPct: 50, label: 'assumed-hot' });
    expect(Math.abs(w.ghi - 516)).toBeLessThan(10);
    expect(planningWeather(null, null, 0, midnight, here).ghi).toBe(0);
  });

  test('[W-FALLBACK] a baseline without this month is no baseline', () => {
    expect(planningWeather(null, baselineOf({ month: 7 }), 0, noon, here).label).toBe('assumed-hot');
  });

  test('[W-FALLBACK] a forecast hour with a broken number is not used, so a NaN can never look cool', () => {
    for (const bad of [{ t: NaN }, { rh: NaN }, { ghi: NaN }, { t: Infinity }]) {
      const f = forecastOf([hour(`${SAT} 13:00`, bad)]);
      expect(planningWeather(f, baselineOf(), 0, noon, here).label).toBe('seasonal');
      expect(planningWeather(f, null, 0, noon, here).planT).toBe(30);
    }
    expect(planningWeather(null, baselineOf({ p90HighC: NaN }), 0, noon, here).label).toBe('assumed-hot');
  });
});

const profile = (over: Partial<Profile> = {}): Profile => ({ weightKg: null, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 1, weighedRides: 0, ...over });
const contract = (name: string): LoadSummary => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../contracts/load-summary/${name}.json`, import.meta.url)), 'utf8')) as LoadSummary;

describe('masses', () => {
  test('[W-MASSES] a full summary: carried + empty luggage, its bike', () => {
    expect(masses(profile({ weightKg: 68 }), contract('full'))).toEqual({ riderKg: 68, loadKg: 10.2 + 2.4, bikeKg: 14 });
  });
  test('[W-MASSES] a bike weight of null is 15 kg', () => {
    expect(masses(profile(), contract('no-bike-weight')).bikeKg).toBe(15);
  });
  test('[W-MASSES] empty.json and no summary: 10 kg, 15 kg, rider 75 kg', () => {
    expect(masses(profile(), contract('empty'))).toEqual({ riderKg: 75, loadKg: 10, bikeKg: 15 });
    expect(masses(profile(), null)).toEqual({ riderKg: 75, loadKg: 10, bikeKg: 15 });
  });
  test('[W-MASSES] broken numbers fall back to the defaults, never NaN or zero', () => {
    const full = contract('full') as Extract<LoadSummary, { weight: unknown }>;
    const broken = { ...full, weight: { ...full.weight, carriedKg: NaN, bikeKg: Infinity, emptyLuggageKg: NaN } };
    expect(masses(profile({ weightKg: NaN }), broken)).toEqual({ riderKg: 75, loadKg: 10, bikeKg: 15 });
    expect(masses(profile({ weightKg: 0 }), null).riderKg).toBe(75);
  });
});

describe('the validated range', () => {
  const ok = { planT: 20, elevM: 500, ridingHours: 4 };
  test('[W-RANGE] above 40 °C, below 0 °C, above 3,000 m, beyond 12 h of riding', () => {
    expect(outsideRange({ ...ok, planT: 40.1 })).toBe(true);
    expect(outsideRange({ ...ok, planT: -0.1 })).toBe(true);
    expect(outsideRange({ ...ok, elevM: 3000.5 })).toBe(true);
    expect(outsideRange({ ...ok, ridingHours: 12.01 })).toBe(true);
  });
  test('[W-RANGE] at the limits exactly, none', () => {
    expect(outsideRange(ok)).toBe(false);
    expect(outsideRange({ ...ok, planT: 40 })).toBe(false);
    expect(outsideRange({ ...ok, planT: 0 })).toBe(false);
    expect(outsideRange({ ...ok, elevM: 3000 })).toBe(false);
    expect(outsideRange({ ...ok, ridingHours: 12 })).toBe(false);
  });
  test('[W-RANGE] a non-finite input never reads as inside', () => {
    for (const over of [{ planT: NaN }, { elevM: NaN }, { ridingHours: NaN }, { planT: Infinity }]) expect(outsideRange({ ...ok, ...over })).toBe(true);
  });
});

test('[W-DIRECTION] a non-finite input stays visible: the model never turns it into a number', () => {
  for (const over of [{ planT: NaN }, { powerW: NaN }, { rhPct: NaN }, { airflow: NaN }, { ghi: NaN }]) {
    expect(sweatRate({ ...moving(160, 25, 50, 3, 300), ...over }, 75, true)).toBeNaN();
  }
  expect(sweatRate(moving(160, 25, 50, 3), NaN, true)).toBeNaN();
  expect(riderPower({ totalKg: NaN, speedMs: 5, grade: 0 })).toBeNaN();
});

// Forecasts (spec section 12.2): moving rain cells, codes 80-82 and the thunderstorm codes, 15-minute arrays, stale fetches;
// and what a real store can hold: empty, partial, out of order, ending mid-ride, a broken first hour.
import fc from 'fast-check';
import { pointAtRouteKm } from '../../src/core/geo/project.ts';
import type { Baseline, GridHour, Route, StoredForecast } from '../../src/core/types.ts';
import { ageH, chancePct, gustKmh, rainMm, tempC } from './thresholds.ts';

const HOUR = 3_600_000;

type Cell = { nearRider: boolean; fromFraction: number; kmPerHour: number; radiusKm: number; startH: number; hours: number; code: number; pp: number; mm: number; gust: number };
export type ForecastChoice = {
  form: 'null' | 'no-grid' | 'no-hours' | 'whole' | 'every-other' | 'first-half' | 'short' | 'out-of-order' | 'broken-first' | 'partial-values' | 'broken-grid';
  age: number; days: number; has15: boolean; t: number; rh: number; ghi: number; wind: number; windFrom: number; cells: Cell[]; rainHere: boolean; future: boolean;
};

const cell = (): fc.Arbitrary<Cell> => fc.record({
  nearRider: fc.integer({ min: 0, max: 3 }).map((n) => n > 0),
  fromFraction: fc.integer({ min: 0, max: 100 }).map((n) => n / 100),
  kmPerHour: fc.integer({ min: -30, max: 30 }),
  radiusKm: fc.constantFrom(3, 8, 20, 60),
  startH: fc.oneof({ weight: 5, arbitrary: fc.integer({ min: -2, max: 10 }) }, { weight: 1, arbitrary: fc.integer({ min: -6, max: 72 }) }),
  hours: fc.constantFrom(1, 2, 3, 6, 12),
  code: fc.constantFrom(51, 61, 63, 65, 71, 80, 81, 82, 95, 96, 97, 99),
  pp: chancePct(),
  mm: rainMm(),
  gust: gustKmh(),
});

export const forecastChoice = (): fc.Arbitrary<ForecastChoice> => fc.record({
  form: fc.oneof({ weight: 3, arbitrary: fc.constant<ForecastChoice['form']>('whole') }, { weight: 2, arbitrary: fc.constantFrom<ForecastChoice['form']>('null', 'no-grid', 'no-hours', 'every-other', 'first-half', 'short', 'out-of-order', 'broken-first', 'partial-values', 'broken-grid') }),
  age: ageH(),
  days: fc.constantFrom(2, 3, 7, 7, 7, 7),
  has15: fc.boolean(),
  t: tempC(),
  rh: fc.integer({ min: 20, max: 100 }),
  ghi: fc.integer({ min: 0, max: 900 }),
  wind: fc.integer({ min: 0, max: 15 }),
  windFrom: fc.integer({ min: 0, max: 359 }),
  cells: fc.array(cell(), { maxLength: 4, size: 'max' }),
  rainHere: fc.integer({ min: 0, max: 3 }).map((n) => n === 0),
  future: fc.boolean(),
});

const NOT_A_TIME = new Date(Number.NaN);

/** `riderKm` is where the rider about is: most cells start from there, so the ride meets them. Cell times count from now. */
export function forecastOf(route: Route, now: Date, c: ForecastChoice, riderKm = 0): StoredForecast | null {
  if (c.form === 'null') return null;
  const fetchedAt = new Date(now.getTime() - c.age * HOUR);
  if (c.form === 'no-grid') return { fetchedAt, runs: [], grid: [], has15: false };
  const firstHour = Math.ceil((fetchedAt.getTime() - 2 * HOUR) / HOUR) * HOUR;
  const count = c.form === 'short' ? 3 + Math.round(c.age) : c.days * 24;
  const grid: StoredForecast['grid'] = route.sampleGrid.map((km) => {
    const p = pointAtRouteKm(route, km);
    const hours: GridHour[] = [];
    if (c.form !== 'no-hours') {
      for (let n = 0; n < count; n++) {
        const at = new Date(firstHour + n * HOUR);
        let hour: GridHour = { at, t: c.t, rh: c.rh, ghi: c.ghi, pp: 0, mm: 0, code: 1, windMs: c.wind, windFrom: c.windFrom, gustMs: c.wind * 1.5 };
        // Rain over the rider now and for a while, so a good share of stops have a wet start.
        const cells: Cell[] = c.rainHere ? [{ nearRider: true, fromFraction: 0, kmPerHour: 0, radiusKm: 25, startH: -1, hours: 3, code: 61, pp: 80, mm: 1, gust: 20 }, ...c.cells] : c.cells;
        for (const x of cells) {
          const since = (at.getTime() - now.getTime()) / HOUR - x.startH;
          if (since < 0 || since >= x.hours) continue;
          const centre = (x.nearRider ? riderKm + x.fromFraction * 60 : x.fromFraction * route.lengthKm) + x.kmPerHour * since;
          if (Math.abs(km - centre) > x.radiusKm) continue;
          hour = { ...hour, pp: x.pp, mm: x.mm, code: x.code, gustMs: x.gust / 3.6 };
        }
        hours.push(hour);
      }
    }
    // Rounded as the weather service's own grid is, inside the request's 0.02 degrees.
    const rain15 = c.has15 && c.form !== 'no-hours'
      ? hours.slice(0, 48).flatMap((h) => [0, 1, 2, 3].map((q) => ({ at: new Date(h.at.getTime() - HOUR + (q + 1) * HOUR / 4), mm: h.mm / 4 })))
      : undefined;
    return { km, lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100, hours, ...(rain15 ? { rain15 } : {}) };
  });

  let kept = grid;
  switch (c.form) {
    case 'every-other': kept = grid.filter((_, i) => i % 2 === 0); break;
    case 'first-half': kept = grid.slice(0, Math.ceil(grid.length / 2)); break;
    case 'out-of-order': kept = [...grid].reverse().map((g) => ({ ...g, hours: [...g.hours].reverse() })); break;
    case 'broken-first': kept = grid.map((g, i) => (i > 0 || !g.hours[0] ? g : { ...g, hours: [{ ...g.hours[0], at: NOT_A_TIME, pp: Number.NaN, mm: Infinity, t: Number.NaN }, ...g.hours.slice(1)] })); break;
    case 'partial-values': kept = grid.map((g) => ({ ...g, hours: g.hours.map((h, n) => (n % 2 === 0 ? { ...h, pp: null } : { ...h, gustMs: Number.NaN })) })); break;
    case 'broken-grid': kept = grid.map((g, i) => (i === 0 ? { ...g, km: Number.NaN, lat: Number.NaN } : g)); break;
    default: break;
  }
  return { fetchedAt: c.future ? new Date(now.getTime() + 300_000) : fetchedAt, runs: [{ model: 'icon_d2', run: new Date(fetchedAt.getTime() - 3 * HOUR), availableAt: new Date(fetchedAt.getTime() - HOUR) }], grid: kept, has15: c.has15 };
}

export const baselineChoice = (): fc.Arbitrary<'none' | 'stage-ends' | 'broken'> => fc.constantFrom<'none' | 'stage-ends' | 'broken'>('none', 'none', 'stage-ends', 'stage-ends', 'broken');

export function baselineOf(route: Route, month: number, c: 'none' | 'stage-ends' | 'broken'): Baseline | null {
  if (c === 'none') return null;
  const point = (km: number, eleM: number | null): Baseline['points'][number] => ({ km, eleM, month, p10LowC: 3, meanLowC: 7, p90HighC: 24, meanHighC: 19, rainDays: 9 });
  const points = route.stages.map((s) => point(s.endKm, 300));
  return { years: '2021-2025', points: c === 'broken' ? [{ ...point(Number.NaN, null), month: Number.NaN, meanLowC: Number.NaN }, ...points] : points };
}

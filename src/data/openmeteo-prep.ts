// Heights and the five-year archive (spec sections 5 and 6.6), asked for only by Get ready offline: a chunk of its own, reached
// through openmeteo.ts's fetchElevation and fetchBaseline, so the first screen does not carry them (9 Nov 2026).
import type { Baseline } from '../core/types.ts';
import { getJson, isRecord, list, SMALL_TIMEOUT_MS, usable, WeatherServiceError } from './openmeteo.ts';
import type { FetchLike, GridPoint, Retry } from './openmeteo.ts';

/** Up to this much more, so riders refused in the same second don't all ask again in the same second (review of PR 98, M1). */
const MINUTE_SPREAD_MS = 5_000;

/** As getJson; with `retry`, asked once more after the wait the refusal calls for. */
export async function askPolitely(f: FetchLike, url: string, timeoutMs: number, retry: Retry | undefined): Promise<unknown> {
  try {
    return await politeJson(f, url, timeoutMs);
  } catch (e) {
    if (!retry || !(e instanceof WeatherServiceError) || e.againInMs === null) throw e;
    const ms = e.limited ? e.againInMs + Math.floor((retry.random ?? Math.random)() * MINUTE_SPREAD_MS) : e.againInMs;
    retry.onWait?.(new Date((retry.now?.() ?? new Date()).getTime() + ms));
    await retry.sleep(ms);
    retry.onWait?.(null);
    return politeJson(f, url, timeoutMs);
  }
}

const MINUTE_LIMIT_WAIT_MS = 61_000;
const SERVER_WAIT_MS = 3_000;

async function refusalOf(response: Response): Promise<WeatherServiceError> {
  if (response.status === 429) {
    let reason = '';
    try {
      const body = (await response.json()) as unknown;
      if (isRecord(body) && typeof body['reason'] === 'string') reason = body['reason'];
    } catch {
      /* no reason given */
    }
    // "Minutely API request limit exceeded. Please try again in one minute." The others name an hour, a day or a month.
    const minute = reason === '' || /minute/i.test(reason);
    return new WeatherServiceError('HTTP 429', 'refused', { limited: true, againInMs: minute ? MINUTE_LIMIT_WAIT_MS : null });
  }
  return new WeatherServiceError(`HTTP ${response.status}`, 'refused', { againInMs: response.status >= 500 ? SERVER_WAIT_MS : null });
}

/** getJson that reads the service's limit and a lost answer, for waiting and asking again. */
const politeJson = (f: FetchLike, url: string, timeoutMs: number): Promise<unknown> =>
  getJson(f, url, timeoutMs, refusalOf, () => new WeatherServiceError('no answer', 'refused', { againInMs: SERVER_WAIT_MS }));

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const ELEVATION_BATCH = 100;
const BASELINE_YEARS = 5;
const MIN_BASELINE_DAYS = 20;
const RAIN_DAY_MM = 1;

/**
 * Heights, 3 decimals, at most 100 per request, one request at a time. A failed batch leaves nulls, never zeros. The service
 * counts each coordinate as a call: once it says its limit is reached, nothing more is sent. With `retry`, a minute's limit is
 * waited out and that batch asked once more, and the rest follow.
 */
export async function fetchElevation(points: { lat: number; lon: number }[], f: FetchLike, retry?: Retry): Promise<(number | null)[]> {
  const out: (number | null)[] = new Array<number | null>(points.length).fill(null);
  for (let start = 0; start < points.length; start += ELEVATION_BATCH) {
    const batch = points.slice(start, start + ELEVATION_BATCH);
    try {
      const body = await askPolitely(f, `${ELEVATION_URL}?latitude=${list(batch, 'lat', 3)}&longitude=${list(batch, 'lon', 3)}`, SMALL_TIMEOUT_MS, retry);
      const heights = isRecord(body) ? body['elevation'] : null;
      if (!Array.isArray(heights) || heights.length !== batch.length) continue;
      heights.forEach((h: unknown, i) => { if (usable(h)) out[start + i] = h; });
    } catch (e) {
      // This batch stays unknown; past the service's limit, so do the rest.
      if (e instanceof WeatherServiceError && e.limited) break;
    }
  }
  return out;
}

const percentile = (values: number[], q: number): number => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(q * (s.length - 1))))]!;
};
const mean = (values: number[]): number => values.reduce((x, y) => x + y, 0) / values.length;
const numbers = (x: unknown): number[] => (Array.isArray(x) ? x.filter(usable) : []);

type Tally = { lows: number[]; highs: number[]; rain: number[]; years: Set<number> };

/**
 * Load Check's five-year archive method (`fetchNormals`): the five years before this one, measured figures only. One request
 * per year and month for all points, one at a time. A year that fails is left out of the years named; a point with too few
 * days has no baseline. `months` are 1 to 12, as the engines compare them. Throws when nothing at all came.
 */
export async function fetchBaseline(points: GridPoint[], months: number[], f: FetchLike, now: Date = new Date()): Promise<Baseline> {
  const thisYear = now.getUTCFullYear();
  // The archive takes "elevation ... used for statistical downscaling ... comma separated" for several points, and answers with
  // the elevation its figures are adapted to (open-meteo.com/en/docs/historical-weather-api): the route's, when all are known.
  const heights = points.every((p) => p.ele !== null) ? `&elevation=${points.map((p) => Math.round(p.ele!)).join(',')}` : '';
  const answered: (number | null)[] = points.map(() => null);
  const out: Baseline['points'] = [];
  const sampled = new Set<number>();
  let limited = false;
  for (const month of months) {
    if (limited) break;
    const tallies: Tally[] = points.map(() => ({ lows: [], highs: [], rain: [], years: new Set() }));
    for (let back = 1; back <= BASELINE_YEARS; back++) {
      const year = thisYear - back;
      const mm = String(month).padStart(2, '0');
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const url = `${ARCHIVE_URL}?latitude=${list(points, 'lat', 2)}&longitude=${list(points, 'lon', 2)}${heights}&start_date=${year}-${mm}-01&end_date=${year}-${mm}-${lastDay}`
        + '&daily=temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto';
      let body: unknown;
      try {
        body = await politeJson(f, url, SMALL_TIMEOUT_MS);
      } catch (e) {
        // Past the service's limit nothing more is sent (review of PR 98, M2); another failure leaves that year out.
        if (e instanceof WeatherServiceError && e.limited) {
          limited = true;
          break;
        }
        continue;
      }
      const locations = Array.isArray(body) ? body : [body];
      if (locations.length !== points.length) continue;
      locations.forEach((location: unknown, i) => {
        const daily = isRecord(location) ? location['daily'] : null;
        if (!isRecord(daily)) return;
        const [lows, highs, rain] = [numbers(daily['temperature_2m_min']), numbers(daily['temperature_2m_max']), numbers(daily['precipitation_sum'])];
        if (lows.length === 0 || highs.length === 0 || rain.length === 0) return;
        const t = tallies[i]!;
        const ele = (location as Record<string, unknown>)['elevation'];
        if (usable(ele)) answered[i] = ele;
        t.lows.push(...lows);
        t.highs.push(...highs);
        t.rain.push(...rain);
        t.years.add(year);
      });
    }
    points.forEach((p, i) => {
      const t = tallies[i]!;
      if (t.lows.length < MIN_BASELINE_DAYS || t.years.size === 0) return;
      for (const y of t.years) sampled.add(y);
      out.push({
        km: p.km, eleM: answered[i] ?? (heights ? Math.round(p.ele!) : null), month,
        p10LowC: Math.round(percentile(t.lows, 0.1)), meanLowC: Math.round(mean(t.lows)),
        p90HighC: Math.round(percentile(t.highs, 0.9)), meanHighC: Math.round(mean(t.highs)),
        rainDays: Math.round(t.rain.filter((v) => v >= RAIN_DAY_MM).length / t.years.size),
      });
    });
  }
  if (out.length === 0) throw new WeatherServiceError('no baseline');
  return { years: `${Math.min(...sampled)}–${Math.max(...sampled)}`, points: out };
}

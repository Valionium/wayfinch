// The requests to Open-Meteo (spec sections 5 and 6.6). Each request is the same for every moment of a day: nothing here
// knows where the rider is, only the route's fixed points. An answer is checked whole before anything is handed on, so a
// refused or partial one can't take the place of a good forecast. The answer's shape was checked against the service's
// real answers, kept in tests/fixtures/openmeteo/.
import { addDaysIso } from '../core/answers/time.ts';
import { pointAtRouteKm } from '../core/geo/project.ts';
import type { Baseline, GridHour, Km, ModelRun, Route, StoredForecast } from '../core/types.ts';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One point to ask about: rounded coordinates, and the route's height there. */
export type GridPoint = { km: Km; lat: number; lon: number; ele: number | null };

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const META_URL = (path: string): string => `https://api.open-meteo.com/data/${path}/static/meta.json`;

const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'shortwave_radiation', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;
const STEPS_15_MIN = 192;
const MAX_FORECAST_DAYS = 16;
const DAY = 86_400_000;
const HOUR_MS = 3_600_000;
const DETAIL_MS = 48 * HOUR_MS; // the hours the rain answers lean on most
const FORECAST_TIMEOUT_MS = 30_000;
export const SMALL_TIMEOUT_MS = 12_000;

/** The fixed list of five models, by the names of `weather-classes.ts`'s table, with Open-Meteo's path for each. */
export const MODEL_PATHS: Record<string, string> = {
  'ICON-D2': 'dwd_icon_d2',
  'AROME France HD': 'meteofrance_arome_france_hd',
  'KNMI HARMONIE-AROME': 'knmi_harmonie_arome_europe',
  'MET Nordic': 'metno_nordic_pp',
  'DMI HARMONIE-AROME': 'dmi_harmonie_arome_europe',
};

/** The service refused or failed (`refused`), or answered with less than a whole forecast (`incomplete`). */
export class WeatherServiceError extends Error {
  readonly kind: 'refused' | 'incomplete';
  /** How long to wait before asking once more, or null when asking again soon would not help (or is not polite). */
  readonly againInMs: number | null;
  /** The service's limit was reached (HTTP 429): nothing more is sent until the wait, if any, is over. */
  readonly limited: boolean;
  constructor(reason: string, kind: 'refused' | 'incomplete' = 'refused', o: { againInMs?: number | null; limited?: boolean } = {}) {
    super(reason);
    this.name = 'WeatherServiceError';
    this.kind = kind;
    this.againInMs = o.againInMs ?? null;
    this.limited = o.limited ?? false;
  }
}
const incomplete = (reason: string): WeatherServiceError => new WeatherServiceError(reason, 'incomplete');

/**
 * Waiting and asking again, for Get ready offline (9 Nov 2026). The free service's limits count for all riders together, and a
 * minute's limit ends a minute later: one more try after that minute, or a few seconds after a server error or a lost answer.
 * An hourly, daily or monthly limit is never waited for. Without it, each request is sent once (Update weather has its own spacing).
 */
export type Retry = { sleep: (ms: number) => Promise<void> };
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

const requestInit = (timeoutMs: number): RequestInit => ({
  // A copy from a cache, stamped with the time of this fetch, would be an old forecast shown as new.
  cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(timeoutMs),
});

export async function getJson(f: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  let response: Response;
  try {
    response = await f(url, requestInit(timeoutMs));
  } catch {
    throw new WeatherServiceError('no answer', 'refused', { againInMs: SERVER_WAIT_MS });
  }
  if (!response.ok) throw await refusalOf(response);
  try {
    return await response.json();
  } catch {
    throw new WeatherServiceError('not JSON');
  }
}

/** As getJson; with `retry`, asked once more after the wait the refusal calls for. */
export async function askPolitely(f: FetchLike, url: string, timeoutMs: number, retry: Retry | undefined): Promise<unknown> {
  try {
    return await getJson(f, url, timeoutMs);
  } catch (e) {
    if (!retry || !(e instanceof WeatherServiceError) || e.againInMs === null) throw e;
    await retry.sleep(e.againInMs);
    return getJson(f, url, timeoutMs);
  }
}

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const round2 = (n: number): number => Math.round(n * 100) / 100;
export const list = (points: { lat: number; lon: number }[], key: 'lat' | 'lon', decimals: number): string => points.map((p) => p[key].toFixed(decimals)).join(',');
export const usable = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function heightAt(route: Route, km: Km): number | null {
  const pts = route.points;
  let i = 1;
  while (i < pts.length - 1 && pts[i]!.km < km) i++;
  const a = pts[i - 1];
  const b = pts[i];
  if (!a) return null;
  if (!b) return a.ele;
  if (a.ele === null || b.ele === null) return null;
  const span = b.km - a.km;
  return span > 0 ? a.ele + ((b.ele - a.ele) * (km - a.km)) / span : a.ele;
}

const roundedPoint = (route: Route, km: Km): GridPoint | null => {
  const p = pointAtRouteKm(route, km);
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { km, lat: round2(p.lat), lon: round2(p.lon), ele: heightAt(route, km) } : null;
};

/** The route's fixed sample grid as points to ask about. Nothing about the rider goes in, so nothing about the rider comes out. */
export const gridPoints = (route: Route): GridPoint[] => route.sampleGrid.map((km) => roundedPoint(route, km)).filter((p) => p !== null);

/** The stage ends and the route's high point, rounded (section 5 step 4). */
export function baselinePoints(route: Route): GridPoint[] {
  const kms = new Set<Km>(route.stages.map((s) => s.endKm));
  const known = route.points.filter((p) => p.ele !== null);
  if (known.length === route.points.length && known.length > 0) {
    let high = known[0]!;
    for (const p of known) if (p.ele! > high.ele!) high = p;
    kms.add(high.km);
  }
  return [...kms].sort((a, b) => a - b).map((km) => roundedPoint(route, km)).filter((p) => p !== null);
}

const dayNumber = (iso: string): number => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY : Number.NaN;
};

/**
 * Forecast days: min(16, days to the end + 1). The end is the plan's, the departure date plus its stages, never a date
 * worked out from how far the rider has come: every request of a day stays the same (spec's privacy table, criterion 9).
 */
export function forecastDaysFor(route: Route, departureDate: string | null, today: string): number {
  if (departureDate === null) return MAX_FORECAST_DAYS;
  const lastDay = route.stages.reduce((most, s) => Math.max(most, s.day), 1);
  const left = dayNumber(addDaysIso(departureDate, lastDay - 1)) - dayNumber(today);
  if (!Number.isFinite(left)) return MAX_FORECAST_DAYS;
  // On and after the planned last day: today and tomorrow, so a rider behind the plan still has tomorrow (the coordinator's
  // ruling on spec 6.6's "end"). Never from reaching the route end, or the day's request would change mid-day and tell.
  return Math.min(MAX_FORECAST_DAYS, Math.max(2, left + 1));
}

const forecastUrl = (grid: GridPoint[], days: number, with15: boolean): string => {
  // All or none: the service takes one height per point, and "nan" for one would turn its height correction off there.
  const heights = grid.every((g) => g.ele !== null) ? `&elevation=${grid.map((g) => Math.round(g.ele!)).join(',')}` : '';
  const rain = with15 ? `&minutely_15=precipitation&forecast_minutely_15=${STEPS_15_MIN}` : '';
  return `${FORECAST_URL}?latitude=${list(grid, 'lat', 2)}&longitude=${list(grid, 'lon', 2)}${heights}&hourly=${HOURLY.join(',')}${rain}`
    + `&wind_speed_unit=ms&timeformat=unixtime&timezone=auto&forecast_days=${days}`;
};

/** An empty value stays unknown: NaN fails every comparison, where null would pass `>= 0` and read as dry. */
const orNaN = (x: unknown): number => (usable(x) ? x : Number.NaN);

function hoursOf(location: unknown, index: number): GridHour[] {
  // A body that isn't a forecast at all is a refusal; one that is, but short or empty, is incomplete.
  if (!isRecord(location) || !isRecord(location['hourly'])) throw new WeatherServiceError('no hours');
  if ('location_id' in location && location['location_id'] !== index) throw new WeatherServiceError('out of order');
  const h = location['hourly'];
  const time = h['time'];
  if (!Array.isArray(time) || time.length === 0 || !time.every(usable)) throw new WeatherServiceError('no hour stamps');
  const column = (name: (typeof HOURLY)[number]): unknown[] => {
    const c = h[name];
    if (!Array.isArray(c) || c.length !== time.length) throw new WeatherServiceError(`no ${name}`);
    return c;
  };
  const [t, rh, ghi, pp, mm, code, wind, from, gust] = HOURLY.map(column) as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]];
  if (!t.some(usable)) throw incomplete('no temperatures');
  return time.map((stamp: number, i) => ({
    at: new Date(stamp * 1000), t: orNaN(t[i]), rh: orNaN(rh[i]), ghi: orNaN(ghi[i]), pp: usable(pp[i]) ? pp[i] : null, mm: orNaN(mm[i]), code: orNaN(code[i]),
    windMs: orNaN(wind[i]), windFrom: orNaN(from[i]), gustMs: orNaN(gust[i]),
  }));
}

function rain15Of(location: unknown): { at: Date; mm: number }[] {
  const m = isRecord(location) ? location['minutely_15'] : null;
  if (!isRecord(m) || !Array.isArray(m['time']) || !Array.isArray(m['precipitation'])) return [];
  const mm = m['precipitation'] as unknown[];
  const out: { at: Date; mm: number }[] = [];
  (m['time'] as unknown[]).forEach((stamp, i) => { // a step with no value is no step: it must not read as dry
    const value = mm[i];
    if (usable(stamp) && usable(value)) out.push({ at: new Date(stamp * 1000), mm: value });
  });
  return out;
}

/**
 * A whole answer, or none: it reaches now (the last stamp covers the hour before it), starts by tomorrow, holds the days
 * asked for (a day of a clock change has 23 or 25 hours), and has its rain, code and gusts for most of the next 48 hours.
 * Anything less would replace a good forecast with a gap.
 */
function checkWhole(hours: GridHour[], now: Date, days: number): void {
  const first = hours[0]!.at.getTime();
  const last = hours[hours.length - 1]!.at.getTime();
  if (last < now.getTime() - HOUR_MS || first > now.getTime() + DAY) throw new WeatherServiceError('not this forecast');
  if (last - first < (days * 24 - 2) * HOUR_MS) throw incomplete('fewer days than asked for');
  const soon = hours.filter((x) => x.at.getTime() >= now.getTime() - HOUR_MS && x.at.getTime() <= now.getTime() + DETAIL_MS);
  const gaps = soon.filter((x) => x.pp === null || !Number.isFinite(x.mm) || !Number.isFinite(x.code) || !Number.isFinite(x.gustMs)).length;
  if (soon.length === 0 || gaps * 2 > soon.length) throw incomplete('mostly empty');
}

/**
 * One request for the whole grid. Throws `WeatherServiceError` on anything but a whole answer for every point. `fetchedAt`
 * is when the request set out, so it never reads newer than it is. `runs` are the model runs read just before.
 */
export async function fetchForecast(grid: GridPoint[], o: { days: number; with15: boolean; fetch: FetchLike; now?: () => Date; runs?: ModelRun[]; retry?: Retry }): Promise<StoredForecast> {
  const fetchedAt = (o.now ?? (() => new Date()))();
  const body = await askPolitely(o.fetch, forecastUrl(grid, o.days, o.with15), FORECAST_TIMEOUT_MS, o.retry);
  const locations = Array.isArray(body) ? body : [body]; // one location comes back as a bare object
  if (isRecord(body) && body['error'] === true) throw new WeatherServiceError('error answer');
  if (locations.length !== grid.length) throw incomplete('wrong number of points');
  const stored = grid.map((g, i) => {
    const hours = hoursOf(locations[i], i);
    checkWhole(hours, fetchedAt, o.days);
    const rain15 = o.with15 ? rain15Of(locations[i]) : [];
    return { km: g.km, lat: g.lat, lon: g.lon, hours, ...(rain15.length > 0 ? { rain15 } : {}) };
  });
  return { fetchedAt, runs: o.runs ?? [], grid: stored, has15: stored.some((g) => g.rain15 !== undefined) };
}

async function runOf(f: FetchLike, model: string, path: string): Promise<ModelRun | null> {
  try {
    const m = await getJson(f, META_URL(path), SMALL_TIMEOUT_MS);
    if (!isRecord(m) || !usable(m['last_run_initialisation_time']) || !usable(m['last_run_availability_time'])) return null;
    const interval = m['update_interval_seconds'];
    return {
      model, run: new Date(m['last_run_initialisation_time'] * 1000), availableAt: new Date(m['last_run_availability_time'] * 1000),
      ...(usable(interval) && interval > 0 ? { intervalS: interval } : {}),
    };
  } catch {
    return null;
  }
}

/** The model-run check: always the same five, no coordinates. A model that doesn't answer is left out. */
export async function fetchModelRuns(f: FetchLike): Promise<ModelRun[]> {
  const runs = await Promise.all(Object.entries(MODEL_PATHS).map(([model, path]) => runOf(f, model, path)));
  return runs.filter((r) => r !== null);
}

// Heights and the archive are asked for only by Get ready offline: their bodies are a chunk of their own (openmeteo-prep.ts), so the
// first screen does not carry them (9 Nov 2026). The same functions, the same answers.

/** Heights at the points, as openmeteo-prep.ts's fetchElevation. */
export const fetchElevation = (points: { lat: number; lon: number }[], f: FetchLike, retry?: Retry): Promise<(number | null)[]> =>
  import('./openmeteo-prep.ts').then((m) => m.fetchElevation(points, f, retry));

/** The five-year baseline, as openmeteo-prep.ts's fetchBaseline. */
export const fetchBaseline = (points: GridPoint[], months: number[], f: FetchLike, now: Date = new Date()): Promise<Baseline> =>
  import('./openmeteo-prep.ts').then((m) => m.fetchBaseline(points, months, f, now));

// Built Open-Meteo answers, in the shape of the real ones recorded beside this file in tests/fixtures/openmeteo/ on
// 3 November 2026 (forecast, archive, elevation and model metadata). A test in openmeteo.test.ts holds the two together.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./openmeteo/', import.meta.url));
export const recorded = (name: string): unknown => JSON.parse(readFileSync(`${DIR}${name}.json`, 'utf8'));

export const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'shortwave_radiation', 'precipitation_probability', 'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m'] as const;
type Variable = (typeof HOURLY)[number];
const CALM: Record<Variable, number> = { temperature_2m: 12, relative_humidity_2m: 60, shortwave_radiation: 100, precipitation_probability: 0, precipitation: 0, weather_code: 0, wind_speed_10m: 2, wind_direction_10m: 180, wind_gusts_10m: 5 };

export type HourOverride = Partial<Record<Variable, number | null>>;
export type BodyOptions = {
  /** Seconds since 1970 of the first hour. */
  from: number; hours: number;
  /** Values at a location and stamp (seconds). */
  at?: (location: number, stamp: number) => HourOverride | undefined;
  rain15?: (location: number) => { time: number[]; precipitation: (number | null)[] } | undefined;
};

const location = (i: number, o: BodyOptions): unknown => {
  const time = Array.from({ length: o.hours }, (_, n) => o.from + n * 3600);
  const hourly: Record<string, unknown[]> = { time };
  for (const v of HOURLY) hourly[v] = time.map((t) => { const set = o.at?.(i, t); return set && v in set ? set[v] : CALM[v]; });
  const rain = o.rain15?.(i);
  return {
    latitude: 49.42275, longitude: 8.69481, generationtime_ms: 0.19, utc_offset_seconds: 3600, timezone: 'Europe/Berlin', timezone_abbreviation: 'GMT+1', elevation: 114,
    ...(i > 0 ? { location_id: i } : {}),
    ...(rain ? { minutely_15_units: { time: 'unixtime', precipitation: 'mm' }, minutely_15: rain } : {}),
    hourly_units: { time: 'unixtime' }, hourly,
  };
};

/** What the service sends for `count` locations: a list, or one bare object for one location. */
export const forecastBody = (count: number, o: BodyOptions): unknown => (count === 1 ? location(0, o) : Array.from({ length: count }, (_, i) => location(i, o)));

/** A stub `fetch`: answers each request from `answer`, and keeps the addresses asked for. */
export type Stub = ((url: string, init?: RequestInit) => Promise<Response>) & { urls: string[]; inits: (RequestInit | undefined)[] };
export function stubFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>): Stub {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    inits.push(init);
    return answer(url, init);
  }) as Stub;
  f.urls = urls;
  f.inits = inits;
  return f;
}
export const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const metaBody = (o: { run: number; available: number; interval?: number }): unknown => ({
  chunk_time_length: 121, crs_wkt: 'GEOGCRS["WGS 84"]', data_end_time: o.run + 172_800, last_run_availability_time: o.available, last_run_initialisation_time: o.run,
  last_run_modification_time: o.available - 99, temporal_resolution_seconds: 3600, update_interval_seconds: o.interval ?? 10800,
});

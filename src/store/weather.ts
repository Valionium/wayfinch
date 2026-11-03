// What the weather refresh keeps (spec section 6.6). A forecast goes in by one `put` in one transaction, so a failure of any
// kind leaves the one before it whole. A forecast is only ever written over its own route, and never over a newer one.
import type { Route, StoredForecast, ZoneSpan } from '../core/types.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX } from './db.ts';
import { ZONES_META } from './inputs.ts';
import { usableTrip, usableZones } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';

/** When a forecast request last set out, whatever became of it: the service counts a refused request too. */
export const WEATHER_ATTEMPT_META = `${ROUTE_META_PREFIX}weatherAttempt`;
/** Set when Get ready's steps end, also partly (Decision 2). No prepared trip: no request to the weather service. */
export const PREPARED_META = `${ROUTE_META_PREFIX}prepared`;

export type WeatherState = {
  route: Route; departureDate: string | null; prepared: boolean; forecast: StoredForecast | null; lastAttemptAt: Date | null; routeZones: ZoneSpan[];
};

/** A fetch time this far ahead of another can't be compared with it: the clock was wrong when it was stamped (as `isStale`). */
const AHEAD_MS = 3_600_000;

export type SaveResult = 'saved' | 'gone' | 'older';

const goodDate = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime());
const goodForecast = (f: unknown): f is StoredForecast => typeof f === 'object' && f !== null && goodDate((f as StoredForecast).fetchedAt) && Array.isArray((f as StoredForecast).runs);

/** Null with no trip. A damaged forecast or date counts as none. */
export async function readWeatherState(): Promise<WeatherState | null> {
  const local = readLocalSettings().settings;
  const read = await inTx(['trip', 'forecast', 'meta'], 'readonly', async (tx) => ({
    trip: (await tx.objectStore('trip').get(CURRENT)) as unknown,
    forecast: (await tx.objectStore('forecast').get(CURRENT)) as unknown,
    attempt: (await tx.objectStore('meta').get(WEATHER_ATTEMPT_META)) as unknown,
    prepared: (await tx.objectStore('meta').get(PREPARED_META)) as unknown,
    zones: (await tx.objectStore('meta').get(ZONES_META)) as unknown,
  }));
  const trip = usableTrip(read.trip, local);
  if (!trip) return null;
  return {
    route: trip.route, departureDate: trip.departureDate, prepared: read.prepared === trip.route.id, forecast: goodForecast(read.forecast) ? read.forecast : null,
    lastAttemptAt: goodDate(read.attempt) ? read.attempt : null, routeZones: usableZones(read.zones),
  };
}

const sameRoute = async (tx: Parameters<Parameters<typeof inTx>[2]>[0], routeId: string): Promise<boolean> => {
  const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), readLocalSettings().settings);
  return trip !== null && trip.route.id === routeId;
};

/**
 * Takes the turn to ask, in one transaction, so two windows can't both go. False when the last request set out less than
 * `gapMs` ago, or the route has changed. A stamp ahead of now (the clock moved back) holds nothing up. Throws when storage
 * refuses: nothing could be kept of an answer then anyway, and an unrecorded request would escape the spacing.
 */
export function reserveWeatherFetch(routeId: string, now: Date, gapMs: number): Promise<boolean> {
  return tracked(inTx(['trip', 'meta'], 'readwrite', async (tx) => {
    if (!(await sameRoute(tx, routeId))) return false;
    const before = (await tx.objectStore('meta').get(WEATHER_ATTEMPT_META)) as unknown;
    if (goodDate(before)) {
      const since = now.getTime() - before.getTime();
      if (since >= 0 && since < gapMs) return false;
    }
    await tx.objectStore('meta').put(now, WEATHER_ATTEMPT_META);
    return true;
  }));
}

/**
 * Keeps a forecast. False, with nothing written, when the route it was fetched for has been replaced meanwhile, or a newer
 * forecast is already stored. Throws when storage refuses, and the forecast before it stays.
 */
export function saveForecast(routeId: string, forecast: StoredForecast, now: Date = new Date()): Promise<SaveResult> {
  return tracked(saving(routeId, forecast, now));
}

async function saving(routeId: string, forecast: StoredForecast, now: Date): Promise<SaveResult> {
  const result = await inTx(['trip', 'forecast'], 'readwrite', async (tx): Promise<SaveResult> => {
    if (!(await sameRoute(tx, routeId))) return 'gone';
    const stored = (await tx.objectStore('forecast').get(CURRENT)) as unknown;
    if (goodForecast(stored)) {
      // A newer one stays, however much newer. One stamped far ahead of now (a wrong clock) is no newer, or it would hold every
      // later forecast out.
      const storedAt = stored.fetchedAt.getTime();
      if (storedAt > forecast.fetchedAt.getTime() && storedAt <= now.getTime() + AHEAD_MS) return 'older';
    }
    await tx.objectStore('forecast').put(forecast, CURRENT);
    return 'saved';
  });
  if (result === 'saved') markChanged('weather');
  return result;
}

/** Marks the trip prepared: Get ready's last step (Task 9). Only for the route it was prepared for, and it goes with that route. */
export function markPrepared(routeId: string): Promise<boolean> {
  return tracked(inTx(['trip', 'meta'], 'readwrite', async (tx) => {
    if (!(await sameRoute(tx, routeId))) return false;
    await tx.objectStore('meta').put(routeId, PREPARED_META);
    return true;
  }));
}

export const weatherStore = { read: readWeatherState, reserve: reserveWeatherFetch, save: saveForecast };

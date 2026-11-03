// What Get ready offline writes (spec sections 4.4 and 5). Every write says which route it's for, and is refused when that
// isn't the stored one any more, so a route replaced during preparation gets nothing of the old. Route-bound records in `meta`
// carry the route's prefix, so replacing the route removes them.
import type { Baseline, Place, PlaceHours, RescuePoint, Roof, RouteMatch, StoredForecast, ZoneSpan } from '../core/types.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX } from './db.ts';
import type { Tx } from './db.ts';
import { HOLIDAYS_META, SAVED_KM_META, ZONES_META } from './inputs.ts';
import { usableHolidays, usableZones } from './rules.ts';
import { readPackRun, readTrip, RouteGoneError, saveTiles, savedTileKeys, saveTrip, startPackRun } from './trip.ts';
import { PREPARED_META, reserveWeatherFetch, saveForecast as keepForecast } from './weather.ts';

/** The steps' record. That the trip is prepared at all is weather.ts's mark (PREPARED_META), set in the same transaction. */
export const PREPARED_STEPS_META = `${ROUTE_META_PREFIX}preparedSteps`;
/** The browser's answer to the request for persistent storage: of this device, so it stays when the route goes. */
export const PERSIST_META = 'storagePersist';

export type PreparedStep = { step: string; ok: boolean; note: string | null };
/** That the steps have ended, also partly, and the dates of what they saved (section 5, step 5). */
export type PreparedRecord = {
  at: Date; steps: PreparedStep[];
  build: { id: string; builtAt: string; countries: Record<string, string | null> } | null;
  forecastFetchedAt: Date | null; baselineYears: string | null;
};

async function guarded<T>(routeId: string, stores: string[], work: (tx: Tx) => Promise<T>): Promise<T> {
  return tracked(inTx([...stores, 'trip'], 'readwrite', async (tx) => {
    const trip = (await tx.objectStore('trip').get(CURRENT)) as { route?: { id?: unknown } } | undefined;
    if (trip?.route?.id !== routeId) throw new RouteGoneError();
    return work(tx);
  }));
}

export type TileData = { places: Place[]; roofs: Roof[]; rescuePoints: RescuePoint[] };

/** Everything the saved tiles hold, for matching to the route. */
export function readTileData(): Promise<TileData> {
  return inTx(['places', 'roofs', 'rescuePoints'], 'readonly', async (tx) => ({
    places: (await tx.objectStore('places').getAll()) as Place[],
    roofs: (await tx.objectStore('roofs').getAll()) as Roof[],
    rescuePoints: (await tx.objectStore('rescuePoints').getAll()) as RescuePoint[],
  }));
}

export type Matched = TileData & { matches: RouteMatch[]; savedKm: { fromKm: number; toKm: number }[] };

/** The route's matches and what stays of the tiles, in one transaction: a place never reads as matched without its record. */
export function saveMatched(routeId: string, m: Matched): Promise<void> {
  return guarded(routeId, ['places', 'roofs', 'rescuePoints', 'matches', 'meta'], async (tx) => {
    for (const name of ['places', 'roofs', 'rescuePoints', 'matches']) await tx.objectStore(name).clear();
    for (const p of m.places) await tx.objectStore('places').put(p);
    for (const r of m.roofs) await tx.objectStore('roofs').add(r);
    for (const r of m.rescuePoints) await tx.objectStore('rescuePoints').add(r);
    for (const x of m.matches) await tx.objectStore('matches').add(x);
    await tx.objectStore('meta').put(m.savedKm, SAVED_KM_META);
  });
}

export const saveZones = (routeId: string, zones: ZoneSpan[]): Promise<void> =>
  guarded(routeId, ['meta'], async (tx) => { await tx.objectStore('meta').put(zones, ZONES_META); });

export const saveHolidays = (routeId: string, holidays: Record<string, string[]>): Promise<void> =>
  guarded(routeId, ['meta'], async (tx) => { await tx.objectStore('meta').put(holidays, HOLIDAYS_META); });

/** One batch of hour records, whole. */
export const saveHours = (routeId: string, batch: PlaceHours[]): Promise<void> =>
  guarded(routeId, ['hours'], async (tx) => { for (const h of batch) await tx.objectStore('hours').put(h); });

/** Through Update weather's own write: never over a newer forecast, never over another route. */
export async function saveForecast(routeId: string, forecast: StoredForecast, now: Date): Promise<void> {
  if ((await keepForecast(routeId, forecast, now)) === 'gone') throw new RouteGoneError();
}

/** The turn to ask the weather service, shared with Update weather. */
export const reserveWeather = (routeId: string, now: Date, gapMs: number): Promise<boolean> => reserveWeatherFetch(routeId, now, gapMs);

export const saveBaseline = (routeId: string, baseline: Baseline): Promise<void> =>
  guarded(routeId, ['baseline'], async (tx) => { await tx.objectStore('baseline').put(baseline, CURRENT); });

export async function savePrepared(routeId: string, record: PreparedRecord): Promise<void> {
  await guarded(routeId, ['meta'], async (tx) => {
    await tx.objectStore('meta').put(record, PREPARED_STEPS_META);
    // As weather.ts's markPrepared: from now on Update weather may send.
    await tx.objectStore('meta').put(routeId, PREPARED_META);
  });
  markChanged('day');
}

export async function readPrepared(): Promise<PreparedRecord | null> {
  const raw = (await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(PREPARED_STEPS_META))) as PreparedRecord | undefined;
  return raw && Array.isArray(raw.steps) ? raw : null;
}

export const savePersist = (granted: boolean, at: Date): Promise<void> =>
  tracked(inTx(['meta'], 'readwrite', async (tx) => { await tx.objectStore('meta').put({ granted, at }, PERSIST_META); }));

export async function readMatchedIds(): Promise<string[]> {
  const matches = (await inTx(['matches'], 'readonly', (tx) => tx.objectStore('matches').getAll())) as RouteMatch[];
  return matches.map((m) => m.placeId);
}

export const readStoredZones = async (): Promise<ZoneSpan[]> => usableZones(await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(ZONES_META)));

export const readHeldHolidays = async (): Promise<Record<string, string[]>> => usableHolidays(await inTx(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(HOLIDAYS_META)));

export async function readForecastDate(): Promise<Date | null> {
  const f = (await inTx(['forecast'], 'readonly', (tx) => tx.objectStore('forecast').get(CURRENT))) as StoredForecast | undefined;
  return f?.fetchedAt ?? null;
}

export async function readBaselineYears(): Promise<string | null> {
  const b = (await inTx(['baseline'], 'readonly', (tx) => tx.objectStore('baseline').get(CURRENT))) as Baseline | undefined;
  return b?.years ?? null;
}

export const readHours = (): Promise<PlaceHours[]> =>
  inTx(['hours'], 'readonly', async (tx) => (await tx.objectStore('hours').getAll()) as PlaceHours[]);

/** The store as preparation sees it. Tests put a full disk in its place. */
export const preparedStore = {
  readTrip, saveTrip, readRun: readPackRun, startRun: startPackRun, savedTileKeys, saveTiles, readTileData, saveMatched,
  saveZones, saveHolidays, saveHours, saveForecast, reserveWeather, saveBaseline, savePrepared, savePersist,
};
export type PreparedStore = typeof preparedStore;

// What Refresh this stretch keeps (spec sections 4.4 and 5). A stretch goes in whole, in one transaction, over its own route
// only: a refused or interrupted save leaves no place, match or kilometre of it behind.
import type { Place } from '../core/places/types.ts';
import type { Km, PlaceHours, RescuePoint, Roof, Route, RouteMatch, ZoneSpan } from '../core/types.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX } from './db.ts';
import type { Tx } from './db.ts';
import { HOLIDAYS_META, SAVED_KM_META, ZONES_META } from './inputs.ts';
import { usableHolidays, usableSavedKm, usableTrip, usableZones } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';

/** The refreshed stretches with their dates. It goes with the route. */
export const STRETCHES_META = `${ROUTE_META_PREFIX}refreshedStretches`;

export type StretchRecord = { fromKm: Km; toKm: Km; date: string };
export type StretchBatch = {
  fromKm: Km; toKm: Km; date: string; places: Place[]; matches: RouteMatch[]; roofs: Roof[]; rescuePoints: RescuePoint[]; hours: PlaceHours[]; holidays: Record<string, string[]>;
};
export type StretchState = { route: Route; departureDate: string | null; routeZones: ZoneSpan[] };

export async function readStretchState(): Promise<StretchState | null> {
  const local = readLocalSettings().settings;
  const read = await inTx(['trip', 'meta'], 'readonly', async (tx) => ({
    trip: (await tx.objectStore('trip').get(CURRENT)) as unknown,
    zones: (await tx.objectStore('meta').get(ZONES_META)) as unknown,
  }));
  const trip = usableTrip(read.trip, local);
  return trip ? { route: trip.route, departureDate: trip.departureDate, routeZones: usableZones(read.zones) } : null;
}

/** The stored places among these ids. */
export function readKnownPlaces(ids: string[]): Promise<Map<string, Place>> {
  return inTx(['places'], 'readonly', async (tx) => {
    const found = await Promise.all(ids.map((id) => tx.objectStore('places').get(id) as Promise<Place | undefined>));
    return new Map(found.filter((p) => p !== undefined).map((p) => [p.id, p]));
  });
}

/** Ranges in order, with those that touch made one. */
export function mergeRanges(ranges: { fromKm: Km; toKm: Km }[]): { fromKm: Km; toKm: Km }[] {
  const sorted = [...ranges].sort((a, b) => a.fromKm - b.fromKm);
  const out: { fromKm: Km; toKm: Km }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.fromKm <= last.toKm) last.toKm = Math.max(last.toKm, r.toKm);
    else out.push({ fromKm: r.fromKm, toKm: r.toKm });
  }
  return out;
}

async function replaceMatches(tx: Tx, batch: StretchBatch): Promise<void> {
  const store = tx.objectStore('matches');
  const fresh = new Set(batch.matches.map((m) => m.placeId));
  const keys = await store.getAllKeys();
  const rows = (await store.getAll()) as RouteMatch[];
  await Promise.all(rows.map((row, i) => (fresh.has(row.placeId) ? store.delete(keys[i]!) : undefined)));
  await Promise.all(batch.matches.map((m) => store.add(m)));
}

/** Adds what isn't stored yet. These lists have no ids, so a refreshed stretch over a saved one must not double them. */
async function addNew<T>(tx: Tx, name: string, list: T[], keyOf: (x: T) => string): Promise<void> {
  const store = tx.objectStore(name);
  const seen = new Set(((await store.getAll()) as T[]).map(keyOf));
  await Promise.all(list.map((x) => {
    const key = keyOf(x);
    if (seen.has(key)) return undefined;
    seen.add(key);
    return store.add(x);
  }));
}

/** Saves one stretch. False, with nothing written, when the route has been replaced meanwhile. Throws when storage refuses. */
export function saveStretch(routeId: string, batch: StretchBatch): Promise<boolean> {
  return tracked(saving(routeId, batch));
}

async function saving(routeId: string, batch: StretchBatch): Promise<boolean> {
  const saved = await inTx(['trip', 'places', 'matches', 'roofs', 'rescuePoints', 'hours', 'meta'], 'readwrite', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), readLocalSettings().settings);
    if (!trip || trip.route.id !== routeId) return false;
    await Promise.all(batch.places.map((p) => tx.objectStore('places').put(p)));
    await replaceMatches(tx, batch);
    await addNew(tx, 'roofs', batch.roofs, (r) => `${r.kind}|${r.lat}|${r.lon}`);
    await addNew(tx, 'rescuePoints', batch.rescuePoints, (r) => `${r.ref}|${r.lat}|${r.lon}`);
    await Promise.all(batch.hours.map((h) => tx.objectStore('hours').put(h)));
    const meta = tx.objectStore('meta');
    const savedKm = usableSavedKm(await meta.get(SAVED_KM_META));
    await meta.put(mergeRanges([...savedKm, { fromKm: batch.fromKm, toKm: batch.toKm }]), SAVED_KM_META);
    const stretches = (await meta.get(STRETCHES_META)) as StretchRecord[] | undefined;
    await meta.put([...(Array.isArray(stretches) ? stretches : []), { fromKm: batch.fromKm, toKm: batch.toKm, date: batch.date }], STRETCHES_META);
    const holidays = usableHolidays(await meta.get(HOLIDAYS_META));
    await meta.put({ ...holidays, ...batch.holidays }, HOLIDAYS_META);
    return true;
  });
  if (saved) markChanged('trip');
  return saved;
}

export const stretchStore = { read: readStretchState, known: readKnownPlaces, save: saveStretch };

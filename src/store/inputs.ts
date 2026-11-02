// The one place `screen()`'s inputs are put together.
import { sunFromSuncalc } from '../core/engines/daylight.ts';
import type { Baseline, DayStart, Place, PlaceHours, Position, Profile, RescuePoint, Roof, RouteMatch, ScreenInputs, StoredForecast, ZoneSpan } from '../core/types.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX, ROUTE_STORES } from './db.ts';
import { readLoadSummary } from './loadcheck-read.ts';
import { readProfile } from './profile.ts';
import { usableTrip } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';

export const SAVED_KM_META = `${ROUTE_META_PREFIX}savedKm`;
export const ZONES_META = `${ROUTE_META_PREFIX}zones`;
export const HOLIDAYS_META = `${ROUTE_META_PREFIX}holidays`;
export const ROUTE_END_META = `${ROUTE_META_PREFIX}routeEnd`;

/** Everything `screen()` needs, read in one transaction, so a route replaced meanwhile can't mix in. Null with no trip. */
export async function readInputs(now: Date): Promise<ScreenInputs | null> {
  const local = readLocalSettings().settings;
  const profile: Profile = await readProfile();
  const read = await inTx([...ROUTE_STORES, 'trip', 'meta'], 'readonly', async (tx) => {
    const all = async <T>(name: string): Promise<T[]> => (await tx.objectStore(name).getAll()) as T[];
    const one = async <T>(name: string, key: string): Promise<T | undefined> => (await tx.objectStore(name).get(key)) as T | undefined;
    return {
      trip: await one<unknown>('trip', CURRENT),
      matches: await all<RouteMatch>('matches'), places: await all<Place>('places'), roofs: await all<Roof>('roofs'),
      hours: await all<PlaceHours>('hours'), rescuePoints: await all<RescuePoint>('rescuePoints'),
      forecast: await one<StoredForecast>('forecast', CURRENT), baseline: await one<Baseline>('baseline', CURRENT),
      positions: await all<Position>('positions'), dayStarts: await all<DayStart>('dayStarts'),
      waterLeft: await one<NonNullable<ScreenInputs['waterLeft']>>('waterLeft', CURRENT),
      savedKm: await one<ScreenInputs['savedKm']>('meta', SAVED_KM_META),
      routeZones: await one<ZoneSpan[]>('meta', ZONES_META), holidays: await one<ScreenInputs['holidays']>('meta', HOLIDAYS_META),
      routeEndDate: await one<string>('meta', ROUTE_END_META),
    };
  });
  const trip = usableTrip(read.trip, local);
  if (!trip) return null;
  return {
    trip, matches: read.matches, places: read.places, roofs: read.roofs, hours: read.hours, rescuePoints: read.rescuePoints,
    savedKm: read.savedKm ?? [], forecast: read.forecast ?? null, baseline: read.baseline ?? null,
    positions: read.positions, dayStarts: read.dayStarts, routeEndDate: read.routeEndDate ?? null, planTomorrow: null,
    profile, loadSummary: readLoadSummary(), waterLeft: read.waterLeft ?? null,
    settings: { campWaterL: trip.campWaterL, keepFresh: local.keepFresh },
    now, sun: sunFromSuncalc, routeZones: read.routeZones ?? [], holidays: read.holidays ?? {}, demo: null,
  };
}

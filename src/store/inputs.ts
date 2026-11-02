// The one place `screen()`'s inputs are put together, and what the store keeps from each screen (spec sections 4.4 and 6.2a).
import { addDaysIso } from '../core/answers/time.ts';
import { sunFromSuncalc } from '../core/engines/daylight.ts';
import { positionOrder } from '../core/engines/locate.ts';
import { ridingDate, zoneLookupOf } from '../core/engines/tripday.ts';
import { DEFAULT_FOR_MS } from '../core/engines/water.ts';
import type { Screen } from '../core/screen/screen.ts';
import type { Baseline, DayStart, Place, PlaceHours, Position, Profile, RescuePoint, Roof, Route, RouteMatch, ScreenInputs, StoredForecast, Trip, ZoneSpan } from '../core/types.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx, ROUTE_META_PREFIX, ROUTE_STORES } from './db.ts';
import type { Tx } from './db.ts';
import { readLoadSummary } from './loadcheck-read.ts';
import { keptPositions, readPlanTomorrow, sweepPositions, ZONES_KEY } from './positions.ts';
import { readProfile } from './profile.ts';
import { usableTrip } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';

// What preparation writes (Tasks 7 to 9), in `meta`, under the prefix that replacing the route removes.
export const SAVED_KM_META = `${ROUTE_META_PREFIX}savedKm`;
export const ZONES_META = ZONES_KEY;
export const HOLIDAYS_META = `${ROUTE_META_PREFIX}holidays`;
export const ROUTE_END_META = `${ROUTE_META_PREFIX}routeEnd`;

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());
const routeToken = (r: Route): string => `${r.id}|${r.hash}`;

/** The route of the inputs last read, so that a screen built on a route since replaced leaves nothing behind. */
let routeOfLastInputs: string | null = null;

const dayStartsKept = (list: DayStart[], now: Date, zones: ZoneSpan[]): DayStart[] => {
  const today = ridingDate(now, zoneLookupOf(zones)(0).timeZone);
  const yesterday = addDaysIso(today, -1);
  return list.filter((s) => s.day === today || s.day === yesterday);
};

/**
 * Everything `screen()` needs, read in one transaction, so a route replaced meanwhile can't mix in. What has expired is
 * removed from the phone on the way, and never passed on. Null with no trip.
 */
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
  routeOfLastInputs = routeToken(trip.route);

  const routeZones = read.routeZones ?? [];
  // Without a clock nothing can be judged, so nothing is deleted, and the engines plan from the route start.
  const clock = validDate(now);
  const positions = clock ? keptPositions(read.positions, now, trip, routeZones).sort(positionOrder) : [];
  const dayStarts = clock ? dayStartsKept(read.dayStarts, now, routeZones) : read.dayStarts;
  const waterGone = clock && read.waterLeft !== undefined && now.getTime() - read.waterLeft.at.getTime() > DEFAULT_FOR_MS;
  if (clock) await sweep(now, trip, routeZones, positions.length !== read.positions.length, dayStarts.length !== read.dayStarts.length, waterGone);

  return {
    trip, matches: read.matches, places: read.places, roofs: read.roofs, hours: read.hours, rescuePoints: read.rescuePoints,
    savedKm: read.savedKm ?? [], forecast: read.forecast ?? null, baseline: read.baseline ?? null,
    positions, dayStarts, routeEndDate: read.routeEndDate ?? null, planTomorrow: readPlanTomorrow(),
    profile, loadSummary: readLoadSummary(), waterLeft: waterGone ? null : read.waterLeft ?? null,
    settings: { campWaterL: trip.campWaterL, keepFresh: local.keepFresh },
    now, sun: sunFromSuncalc, routeZones, holidays: read.holidays ?? {}, demo: null,
  };
}

/** Removes what has expired. The screen has its answer either way, so a failure here stops nothing; the next read tries again. */
async function sweep(now: Date, trip: Trip, zones: ZoneSpan[], positions: boolean, dayStarts: boolean, water: boolean): Promise<void> {
  if (!positions && !dayStarts && !water) return;
  try {
    await inTx(['positions', 'dayStarts', 'waterLeft'], 'readwrite', async (tx) => {
      if (positions) await sweepPositions(tx, now, trip, zones);
      if (dayStarts) await sweepDayStarts(tx, now, zones);
      if (water) {
        const left = (await tx.objectStore('waterLeft').get(CURRENT)) as { at: Date } | undefined;
        if (left && now.getTime() - left.at.getTime() > DEFAULT_FOR_MS) await tx.objectStore('waterLeft').delete(CURRENT);
      }
    });
  } catch {
    // Kept back from the screen all the same.
  }
}

async function sweepDayStarts(tx: Tx, now: Date, zones: ZoneSpan[]): Promise<void> {
  const store = tx.objectStore('dayStarts');
  const all = (await store.getAll()) as DayStart[];
  const kept = new Set(dayStartsKept(all, now, zones).map((s) => s.day));
  await Promise.all(all.filter((s) => !kept.has(s.day)).map((s) => store.delete(s.day)));
}

type Kept = { ride: Pick<Screen['ride'], 'keepDayStart' | 'routeEndReachedOn'> };

/**
 * What the store keeps from a screen once it's shown: the day start, and the riding date the route end was reached on. A
 * provisional result (null) saves nothing. The date is saved once, and kept until the trip is replaced.
 */
export function keepAfterScreen(s: Kept, now: Date): Promise<void> {
  return tracked(keeping(s, now));
}

async function keeping(s: Kept, now: Date): Promise<void> {
  const { keepDayStart, routeEndReachedOn } = s.ride;
  if ((keepDayStart === null && routeEndReachedOn === null) || !validDate(now)) return;
  const local = readLocalSettings().settings;
  const changed = await inTx(['trip', 'dayStarts', 'meta'], 'readwrite', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local);
    if (!trip || (routeOfLastInputs !== null && routeOfLastInputs !== routeToken(trip.route))) return false;
    const zones = ((await tx.objectStore('meta').get(ZONES_META)) as ZoneSpan[] | undefined) ?? [];
    if (keepDayStart !== null) {
      await tx.objectStore('dayStarts').put(keepDayStart);
      await sweepDayStarts(tx, now, zones);
    }
    if (routeEndReachedOn !== null) {
      const stored = (await tx.objectStore('meta').get(ROUTE_END_META)) as string | undefined;
      // A date from before a departure moved later counts for nothing with the engines: it can't hold the place.
      const stale = stored !== undefined && trip.departureDate !== null && stored < trip.departureDate;
      if (stored === undefined || stale) await tx.objectStore('meta').put(routeEndReachedOn, ROUTE_END_META);
    }
    return true;
  });
  if (changed) markChanged('day');
}

// The one place `screen()`'s inputs are put together, and what the store keeps from each screen (spec sections 4.4 and 6.2a).
import { addDaysIso } from '../core/answers/time.ts';
import { sunFromSuncalc } from '../core/engines/daylight.ts';
import { positionOrder } from '../core/engines/locate.ts';
import { ridingDate, zoneLookupOf } from '../core/engines/tripday.ts';
import { DEFAULT_FOR_MS } from '../core/engines/water.ts';
import type { Screen } from '../core/screen/screen.ts';
import type { Baseline, DayStart, Place, PlaceHours, Position, RescuePoint, Roof, RouteMatch, ScreenInputs, StoredForecast, Trip, ZoneSpan } from '../core/types.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inExistingTx, inTx, ROUTE_META_PREFIX, ROUTE_STORES } from './db.ts';
import type { Tx } from './db.ts';
import { readLoadSummary } from './loadcheck-read.ts';
import { keptPositions, readPlanTomorrow, sweepPositions, withoutStampedAhead, ZONES_KEY } from './positions.ts';
import { PROFILE_META, usableProfile } from './profile.ts';
import { goodDate, goodDayStart, usableHolidays, usableSavedKm, usableTrip, usableWater, usableZones } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';

// What preparation writes (Tasks 7 to 9), in `meta`, under the prefix that replacing the route removes.
export const SAVED_KM_META = `${ROUTE_META_PREFIX}savedKm`;
export const ZONES_META = ZONES_KEY;
export const HOLIDAYS_META = `${ROUTE_META_PREFIX}holidays`;
export const ROUTE_END_META = `${ROUTE_META_PREFIX}routeEnd`;

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

const todayAndYesterday = (now: Date, zones: ZoneSpan[]): { today: string; yesterday: string } => {
  const today = ridingDate(now, zoneLookupOf(zones)(0).timeZone);
  return { today, yesterday: addDaysIso(today, -1) };
};

const dayStartsKept = (list: unknown[], now: Date, zones: ZoneSpan[]): DayStart[] => {
  const { today, yesterday } = todayAndYesterday(now, zones);
  return list.filter(goodDayStart).filter((s) => s.day === today || s.day === yesterday);
};

/**
 * Everything `screen()` needs, read in one transaction, so a route replaced meanwhile can't mix in. What has expired is
 * removed from the phone on the way, and never passed on. A damaged record counts as none and never stops the read, or the
 * rider would have no answers at all. Null with no trip.
 */
export async function readInputs(now: Date): Promise<ScreenInputs | null> {
  const local = readLocalSettings().settings;
  const read = await inTx([...ROUTE_STORES, 'trip', 'meta'], 'readonly', async (tx) => {
    const all = async <T>(name: string): Promise<T[]> => (await tx.objectStore(name).getAll()) as T[];
    const one = async <T>(name: string, key: string): Promise<T | undefined> => (await tx.objectStore(name).get(key)) as T | undefined;
    return {
      trip: await one<unknown>('trip', CURRENT), profile: await one<unknown>('meta', PROFILE_META),
      matches: await all<RouteMatch>('matches'), places: await all<Place>('places'), roofs: await all<Roof>('roofs'),
      hours: await all<PlaceHours>('hours'), rescuePoints: await all<RescuePoint>('rescuePoints'),
      forecast: await one<StoredForecast>('forecast', CURRENT), baseline: await one<Baseline>('baseline', CURRENT),
      positions: await all<Position>('positions'), dayStarts: await all<unknown>('dayStarts'),
      waterLeft: await one<unknown>('waterLeft', CURRENT),
      savedKm: await one<unknown>('meta', SAVED_KM_META),
      routeZones: await one<unknown>('meta', ZONES_META), holidays: await one<unknown>('meta', HOLIDAYS_META),
      routeEndDate: await one<unknown>('meta', ROUTE_END_META),
    };
  });
  const trip = usableTrip(read.trip, local);
  if (!trip) return null;

  const routeZones = usableZones(read.routeZones);
  const water = usableWater(read.waterLeft);
  // Without a clock nothing can be judged, so nothing is deleted, and the engines plan from the route start.
  const clock = validDate(now);
  const positions = clock ? keptPositions(withoutStampedAhead(read.positions, now), now, trip, routeZones).sort(positionOrder) : [];
  const dayStarts = clock ? dayStartsKept(read.dayStarts, now, routeZones) : read.dayStarts.filter(goodDayStart);
  const waterOver = water !== null && clock && now.getTime() - water.at.getTime() > DEFAULT_FOR_MS;
  const waterBad = read.waterLeft !== undefined && water === null;
  if (clock) await sweep(now, trip, routeZones, positions.length !== read.positions.length, dayStarts.length !== read.dayStarts.length, waterOver || waterBad);

  return {
    trip, matches: read.matches, places: read.places, roofs: read.roofs, hours: read.hours, rescuePoints: read.rescuePoints,
    savedKm: usableSavedKm(read.savedKm), forecast: read.forecast ?? null, baseline: read.baseline ?? null,
    positions, dayStarts, routeEndDate: goodDate(read.routeEndDate) ? read.routeEndDate : null, planTomorrow: readPlanTomorrow(),
    profile: usableProfile(read.profile), loadSummary: readLoadSummary(), waterLeft: waterOver ? null : water,
    settings: { campWaterL: trip.campWaterL, keepFresh: local.keepFresh },
    now, sun: sunFromSuncalc, routeZones, holidays: usableHolidays(read.holidays), demo: null,
  };
}

/** Removes what has expired. The screen has its answer either way, so a failure here stops nothing; the next read tries again. */
async function sweep(now: Date, trip: Trip, zones: ZoneSpan[], positions: boolean, dayStarts: boolean, water: boolean): Promise<void> {
  if (!positions && !dayStarts && !water) return;
  try {
    await inExistingTx(['positions', 'dayStarts', 'waterLeft'], async (tx) => {
      if (positions) await sweepPositions(tx, now, trip, zones);
      if (dayStarts) await sweepDayStarts(tx, now, zones);
      if (water) {
        const left = usableWater(await tx.objectStore('waterLeft').get(CURRENT));
        if (!left || now.getTime() - left.at.getTime() > DEFAULT_FOR_MS) await tx.objectStore('waterLeft').delete(CURRENT);
      }
    });
  } catch {
    // Kept back from the screen all the same.
  }
}

/** A day after today isn't passed on, yet stays stored: the clock may be what's wrong. Past days and damaged rows go. */
async function sweepDayStarts(tx: Tx, now: Date, zones: ZoneSpan[]): Promise<void> {
  const store = tx.objectStore('dayStarts');
  const { yesterday } = todayAndYesterday(now, zones);
  const keys = await store.getAllKeys();
  const rows = (await store.getAll()) as unknown[];
  await Promise.all(rows.map((s, i) => (goodDayStart(s) && s.day >= yesterday ? undefined : store.delete(keys[i]!))));
}

type Kept = { ride: Pick<Screen['ride'], 'keepDayStart' | 'routeEndReachedOn'> };

/**
 * What the store keeps from a screen once it's shown: the day start, and the riding date the route end was reached on. A
 * provisional result (null) saves nothing. The date is saved once, and kept until the trip is replaced. `routeId` is the
 * route the screen was built on (`inputs.trip.route.id`): a screen of a route since replaced leaves nothing behind.
 *
 * Other windows are told only when something changed. Each window calls this after each screen and re-reads what it hears
 * about, so telling them every time would keep two open windows waking each other for good.
 */
export function keepAfterScreen(s: Kept, now: Date, routeId: string): Promise<void> {
  return tracked(keeping(s, now, routeId));
}

async function keeping(s: Kept, now: Date, routeId: string): Promise<void> {
  const { keepDayStart, routeEndReachedOn } = s.ride;
  if ((keepDayStart === null && routeEndReachedOn === null) || !validDate(now)) return;
  const local = readLocalSettings().settings;
  const changed = await inExistingTx(['trip', 'dayStarts', 'meta'], async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local);
    if (!trip || trip.route.id !== routeId) return false;
    let wrote = false;
    if (keepDayStart !== null) {
      const stored: unknown = await tx.objectStore('dayStarts').get(keepDayStart.day);
      if (!goodDayStart(stored) || stored.km !== keepDayStart.km) {
        await tx.objectStore('dayStarts').put(keepDayStart);
        wrote = true;
      }
      await sweepDayStarts(tx, now, usableZones(await tx.objectStore('meta').get(ZONES_META)));
    }
    if (routeEndReachedOn !== null) {
      const stored: unknown = await tx.objectStore('meta').get(ROUTE_END_META);
      // A date from before a departure moved later counts for nothing with the engines: it can't hold the place.
      const holds = goodDate(stored) && (trip.departureDate === null || stored >= trip.departureDate);
      if (!holds) {
        await tx.objectStore('meta').put(routeEndReachedOn, ROUTE_END_META);
        wrote = true;
      }
    }
    return wrote;
  });
  if (changed) markChanged('day');
}

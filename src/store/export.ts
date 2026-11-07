// Export, import and Delete co-pilot data (spec sections 3.5 and 4.4). The file holds the co-pilot's own data: profile, trip,
// settings, calibration and tyre details. It never holds positions, check-ins, day starts, the route-end date, water left,
// Plan tomorrow, or anything of the bag planner. Sections are built field by field, so nothing else can travel in or out.
import { deleteDB } from 'idb';
import type { Climb, Profile, Route, RoutePoint, Stage, Trip } from '../core/types.ts';
import type { Ride } from '../core/engines/water-learning.ts';
import { W } from '../core/wording/en.ts';
import { exportTyres, importTyres } from '../tools/tyre/storage.ts';
import { clearCopies, flushWrites, markChanged, noteCopy, tracked } from './changed.ts';
import { closeDb, CURRENT, DB_NAME, inTx } from './db.ts';
import type { Tx } from './db.ts';
import { DEFAULT_PROFILE, PROFILE_META, usableProfile } from './profile.ts';
import { DEFAULT_SETTINGS, settingProblem, tripProblem, usableTrip } from './rules.ts';
import type { Settings } from './rules.ts';
import { readLocalSettings, SETTINGS_KEY } from './settings-local.ts';
import { clearRouteData, forgetPlanTomorrow, forgetRouteChoices, readStamp, ROUTE_TX, sameLine, stampKey } from './trip.ts';

export const TYRES_META = 'tyres';

/** A pending request to delete the bag planner's data outlives Delete co-pilot data (Contract 3). */
const DELETE_REQUEST_KEY = 'copilot:delete-request:v1';

type Stamped = { updatedAt: string | null };
export type JsonRide = Omit<Ride, 'at'> & { at: string };
export type ExportFile = {
  app: 'copilot'; kind: 'export'; v: 1;
  profile: Stamped & Profile;
  trip: (Stamped & Trip) | null;
  settings: Stamped & Settings;
  calibration: Stamped & { rides: JsonRide[] };
  tyres: Stamped & { byBike: Record<string, unknown> };
};
/** `ridesLeftOut`: rides of the file that couldn't be read, when others could. */
export type ImportResult = { ok: boolean; reason: string | null; routeChanged: boolean; ridesLeftOut: number };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// ---- The sections, in one fixed order of fields, so export and import are byte-identical ------------------------------

const pointOf = ({ lat, lon, ele, km }: RoutePoint): RoutePoint => ({ lat, lon, ele, km });
const stageOf = ({ day, startKm, endKm, ridingHours, ascentM }: Stage): Stage => ({ day, startKm, endKm, ridingHours, ascentM });
const climbOf = ({ startKm, topKm, gainM, avgGradePct, steepest500mPct }: Climb): Climb => ({ startKm, topKm, gainM, avgGradePct, steepest500mPct });
const routeOf = (r: Route): Route => ({
  id: r.id, name: r.name, points: r.points.map(pointOf), lengthKm: r.lengthKm, ascentM: r.ascentM,
  stages: r.stages.map(stageOf), climbs: r.climbs.map(climbOf), source: r.source, sampleGrid: r.sampleGrid, hash: r.hash,
});
const tripOf = (t: Trip): Trip => ({
  route: routeOf(t.route), departureDate: t.departureDate, startTime: t.startTime, flatKph: t.flatKph, stay: t.stay, campWaterL: t.campWaterL,
  ...(t.pace === undefined ? {} : { pace: t.pace }),
});
// The chosen bike is read leniently: an export from before it, or a bad id, comes in as none and never stops the file.
const settingsOf = (s: Settings): Settings => {
  const out = {} as Record<string, unknown>;
  for (const field of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) out[field] = field === 'toolBike' && settingProblem(field, s[field]) !== null ? null : (s[field] ?? DEFAULT_SETTINGS[field]);
  return out as Settings;
};
const profileOf = (p: Profile): Profile => {
  const { weightKg, thirst, ebike, capacityL, k, sumW, kDrink, weighedRides } = p;
  return { weightKg, thirst, ebike, capacityL, k, sumW, kDrink, weighedRides };
};
const rideOf = <T extends Ride | JsonRide>(r: T): Omit<T, never> => ({
  at: r.at, predictedL: r.predictedL, intakeL: r.intakeL, feel: r.feel,
  ...(r.massLossKg === undefined ? {} : { massLossKg: r.massLossKg }),
  ...(r.toiletStops === undefined ? {} : { toiletStops: r.toiletStops }),
}) as T;

export function exportAll(): Promise<ExportFile> {
  const local = readLocalSettings();
  const mine = exportTyres(localStorage);
  return inTx(['trip', 'calibration', 'meta'], 'readonly', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local.settings);
    const rides = (await tx.objectStore('calibration').getAll()) as unknown[];
    const tyres: unknown = await tx.objectStore('meta').get(TYRES_META);
    const stamp = async (section: string): Promise<string | null> => cleanStamp(await readStamp(tx, section));
    return {
      app: 'copilot' as const, kind: 'export' as const, v: 1 as const,
      profile: { updatedAt: await stamp(PROFILE_META), ...profileOf(usableProfile(await tx.objectStore('meta').get(PROFILE_META))) },
      trip: trip && { updatedAt: await stamp('trip'), ...tripOf(trip) },
      settings: { updatedAt: cleanStamp(local.stamp), ...settingsOf(local.settings) },
      calibration: { updatedAt: await stamp('calibration'), rides: rides.flatMap(jsonRide) },
      // The tyre tool keeps its details in its own key; they travel here. Older data in the database still goes when the tool has none.
      tyres: { updatedAt: mine?.updatedAt || (await stamp(TYRES_META)), byBike: mine ? mine.entries : isObject(tyres) && isObject(tyres.byBike) ? tyres.byBike : {} },
    };
  });
}

// ---- Reading a file: everything is checked before anything is written -----------------------------------------------

const goodStamp = (x: unknown): boolean => x === null || (typeof x === 'string' && Number.isFinite(Date.parse(x)));
const cleanStamp = (x: string | null): string | null => (goodStamp(x) ? x : null);

const profileReads = (p: unknown): boolean => {
  if (!isObject(p) || !goodStamp(p.updatedAt)) return false;
  // Every field there, and each one as the reader would take it.
  const usable = usableProfile(p) as Record<string, unknown>;
  return Object.keys(profileOf(usableProfile({}))).every((k) => p[k] === usable[k]);
};
const settingsRead = (s: unknown): boolean => isObject(s) && goodStamp(s.updatedAt)
  && (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((k) => k === 'toolBike' || settingProblem(k, s[k]) === null);
const tripReads = (t: unknown): boolean => t === null || (isObject(t) && goodStamp(t.updatedAt) && tripProblem(t as unknown as Trip) === null);
const finiteOrMissing = (x: unknown): boolean => x === undefined || (typeof x === 'number' && Number.isFinite(x));
const rideReads = (r: unknown): boolean => isObject(r) && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at))
  && typeof r.predictedL === 'number' && Number.isFinite(r.predictedL)
  && (r.intakeL === null || (typeof r.intakeL === 'number' && Number.isFinite(r.intakeL)))
  && (r.feel === null || r.feel === 'A' || r.feel === 'B' || r.feel === 'C')
  && finiteOrMissing(r.massLossKg) && finiteOrMissing(r.toiletStops);
/** A ride that can't be read stays out of the file, and out of the phone: one bad ride never costs a rider the backup. */
const jsonRide = (r: unknown): JsonRide[] => {
  if (!isObject(r) || !(r.at instanceof Date) || !Number.isFinite(r.at.getTime())) return [];
  // A hilly report stays on the phone: the file's format has no place for it, and a flat reading of it would mislead.
  if (r.hilly === true) return [];
  const ride = { ...r, at: r.at.toISOString() };
  return rideReads(ride) ? [rideOf(ride as unknown as JsonRide)] : [];
};
/** One bad ride is left out, but a list with none readable is a damaged file: taking it would wipe the rides on this phone. */
const calibrationReads = (c: unknown): boolean => isObject(c) && goodStamp(c.updatedAt) && Array.isArray(c.rides) && (c.rides.length === 0 || c.rides.some(rideReads));
const tyresRead = (t: unknown): boolean => isObject(t) && goodStamp(t.updatedAt) && isObject(t.byBike);

function fileProblem(file: unknown): string | null {
  if (!isObject(file) || file.app !== 'copilot' || file.kind !== 'export') return W.appStoreImportNotOurs;
  if (typeof file.v === 'number' && file.v > 1) return W.appStoreImportNewer;
  if (file.v !== 1) return W.appStoreImportNotOurs;
  if (!tripReads(file.trip)) return W.appStoreImportTrip;
  if (!profileReads(file.profile)) return W.appStoreImportProfile;
  if (!settingsRead(file.settings)) return W.appStoreImportSettings;
  if (!calibrationReads(file.calibration)) return W.appStoreImportCalibration;
  if (!tyresRead(file.tyres)) return W.appStoreImportTyres;
  return null;
}

/**
 * Takes a file's sections in, in one go: a bad file writes nothing. A section that's empty and unstamped leaves what's here;
 * what a section holds decides, not its stamp, so data that never got a stamp still comes back. Another route brings the same as replacing it: nothing of the old route stays. Reading a file is the
 * rider's own step, so it may be older than what's here, and other windows must then read again before they write.
 */
export function importAll(file: unknown): Promise<ImportResult> {
  return tracked(importing(file));
}

const putStamp = async (tx: Tx, section: string, stamp: string | null): Promise<void> => {
  const meta = tx.objectStore('meta');
  await (stamp === null ? meta.delete(stampKey(section)) : meta.put(stamp, stampKey(section)));
};

async function importing(file: unknown): Promise<ImportResult> {
  const problem = fileProblem(file);
  if (problem) return { ok: false, reason: problem, routeChanged: false, ridesLeftOut: 0 };
  const f = file as ExportFile;
  const { updatedAt: tripStamp = null, ...tripFields } = f.trip ?? {};
  const trip = f.trip ? tripOf(tripFields as Trip) : null;

  // Settings go first: this is the step the browser can refuse outright, and it can be put back.
  const settingsBefore = localStorage.getItem(SETTINGS_KEY);
  const settingsStamp = f.settings.updatedAt;
  const bringSettings = settingsStamp !== null || JSON.stringify(settingsOf(f.settings)) !== JSON.stringify(settingsOf(DEFAULT_SETTINGS));
  const bringProfile = f.profile.updatedAt !== null || JSON.stringify(profileOf(usableProfile(f.profile))) !== JSON.stringify(profileOf(DEFAULT_PROFILE));
  const rides = (f.calibration.rides as unknown[]).filter(rideReads) as JsonRide[];
  const bringRides = f.calibration.updatedAt !== null || rides.length > 0;
  const bringTyres = f.tyres.updatedAt !== null || Object.keys(f.tyres.byBike).length > 0;
  if (bringSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ updatedAt: settingsStamp, ...settingsOf(f.settings) }));
    } catch {
      return { ok: false, reason: W.appStoreNotKept, routeChanged: false, ridesLeftOut: 0 };
    }
  }

  let routeChanged = false;
  let hadTrip = false;
  try {
    await inTx([...ROUTE_TX, 'calibration'], 'readwrite', async (tx) => {
      const meta = tx.objectStore('meta');
      if (trip) {
        const before = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
        hadTrip = Boolean(before);
        routeChanged = !sameLine(before?.route, trip.route);
        if (routeChanged) await clearRouteData(tx);
        await tx.objectStore('trip').put(trip, CURRENT);
        await putStamp(tx, 'trip', tripStamp as string | null);
      }
      if (bringProfile) {
        await meta.put(profileOf(usableProfile(f.profile)), PROFILE_META);
        await putStamp(tx, PROFILE_META, f.profile.updatedAt);
      }
      if (bringRides) {
        const store = tx.objectStore('calibration');
        // The flat rides are replaced; the hilly reports, which the file cannot hold, stay.
        let cursor = await store.openCursor();
        while (cursor) {
          if ((cursor.value as { hilly?: unknown }).hilly !== true) await cursor.delete();
          cursor = await cursor.continue();
        }
        for (const r of rides) await store.add(rideOf({ ...r, at: new Date(r.at) }));
        await putStamp(tx, 'calibration', f.calibration.updatedAt);
      }
      if (bringTyres) {
        await meta.put({ byBike: f.tyres.byBike }, TYRES_META);
        await putStamp(tx, TYRES_META, f.tyres.updatedAt);
      }
    });
  } catch {
    try {
      if (settingsBefore === null) localStorage.removeItem(SETTINGS_KEY);
      else localStorage.setItem(SETTINGS_KEY, settingsBefore);
    } catch { /* it was just written, so this is not expected */ }
    return { ok: false, reason: W.appStoreNotKept, routeChanged: false, ridesLeftOut: 0 };
  }

  if (trip) {
    noteCopy('trip', tripStamp as string | null);
    noteCopy('trip-settings', tripStamp as string | null);
  }
  if (bringSettings) noteCopy('settings', settingsStamp);
  if (bringProfile) noteCopy('profile', f.profile.updatedAt);
  if (bringRides) noteCopy('calibration', f.calibration.updatedAt);
  if (bringTyres) noteCopy('tyres', f.tyres.updatedAt);
  // The tyre tool's own key, read as the tool reads it: a damaged entry is dropped, and none of it can stop the file.
  if (bringTyres) {
    const mineIn = Object.fromEntries(Object.entries(f.tyres.byBike).filter(([, e]) => isObject(e) && isObject(e.details)));
    const stamp = f.tyres.updatedAt === null ? new Date() : new Date(f.tyres.updatedAt);
    // An empty section replaces too: a phone that kept tyre details for a bike the file does not hold no longer shows them.
    try { importTyres(localStorage, { v: 1, entries: mineIn }, stamp); } catch { /* the file is already in */ }
  }
  // The old route's nights go with it, unless the file brought its own.
  if (routeChanged && hadTrip) {
    if (bringSettings) forgetPlanTomorrow();
    else forgetRouteChoices();
  }
  markChanged('all');
  return { ok: true, reason: null, routeChanged, ridesLeftOut: f.calibration.rides.length - rides.length };
}

// ---- Delete --------------------------------------------------------------------------------------------------------

/**
 * Removes the database and every `copilot:*` key but a pending request to delete the bag planner's data, key by key, and no other: never the whole storage at once, because the bag
 * planner's plans live beside them. Other windows let go of the database on its request, and hear of it through the event
 * this fires before its own key goes too.
 */
export async function deleteCopilotData(): Promise<void> {
  await flushWrites();
  closeDb();
  clearCopies();
  await deleteDB(DB_NAME);
  markChanged('all');
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith('copilot:') && key !== DELETE_REQUEST_KEY) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

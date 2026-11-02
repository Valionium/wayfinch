// Export, import and Delete co-pilot data (spec sections 3.5 and 4.4). The file holds the co-pilot's own data: profile, trip,
// settings, calibration and tyre details. It never holds positions, check-ins, day starts, the route-end date, water left,
// Plan tomorrow, or anything of the bag planner. Sections are built field by field, so nothing else can travel in or out.
import { deleteDB } from 'idb';
import type { Climb, Profile, Route, RoutePoint, Stage, Trip } from '../core/types.ts';
import type { Ride } from '../core/engines/water-learning.ts';
import { W } from '../core/wording/en.ts';
import { clearCopies, flushWrites, markChanged, noteCopy, tracked } from './changed.ts';
import { closeDb, CURRENT, DB_NAME, inTx } from './db.ts';
import { PROFILE_META, usableProfile } from './profile.ts';
import { DEFAULT_SETTINGS, settingProblem, tripProblem, usableTrip } from './rules.ts';
import type { Settings } from './rules.ts';
import { readLocalSettings, SETTINGS_KEY } from './settings-local.ts';
import { clearRouteData, forgetPlanTomorrow, readStamp, ROUTE_TX, sameLine, stampKey } from './trip.ts';

export const TYRES_META = 'tyres';

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
export type ImportResult = { ok: boolean; reason: string | null; routeChanged: boolean };

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
const settingsOf = (s: Settings): Settings => {
  const out = {} as Record<string, unknown>;
  for (const field of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) out[field] = s[field];
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
  return inTx(['trip', 'calibration', 'meta'], 'readonly', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local.settings);
    const rides = (await tx.objectStore('calibration').getAll()) as Ride[];
    const tyres = (await tx.objectStore('meta').get(TYRES_META)) as { byBike?: Record<string, unknown> } | undefined;
    return {
      app: 'copilot' as const, kind: 'export' as const, v: 1 as const,
      profile: { updatedAt: await readStamp(tx, PROFILE_META), ...profileOf(usableProfile(await tx.objectStore('meta').get(PROFILE_META))) },
      trip: trip && { updatedAt: await readStamp(tx, 'trip'), ...tripOf(trip) },
      settings: { updatedAt: local.stamp, ...settingsOf(local.settings) },
      calibration: { updatedAt: await readStamp(tx, 'calibration'), rides: rides.map((r) => rideOf({ ...r, at: r.at.toISOString() })) },
      tyres: { updatedAt: await readStamp(tx, TYRES_META), byBike: tyres?.byBike ?? {} },
    };
  });
}

// ---- Reading a file: everything is checked before anything is written -----------------------------------------------

const goodStamp = (x: unknown): boolean => x === null || (typeof x === 'string' && Number.isFinite(Date.parse(x)));

const profileReads = (p: unknown): boolean => {
  if (!isObject(p) || !goodStamp(p.updatedAt)) return false;
  // Every field there, and each one as the reader would take it.
  const usable = usableProfile(p) as Record<string, unknown>;
  return Object.keys(profileOf(usableProfile({}))).every((k) => p[k] === usable[k]);
};
const settingsRead = (s: unknown): boolean => isObject(s) && goodStamp(s.updatedAt)
  && (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((k) => settingProblem(k, s[k]) === null);
const tripReads = (t: unknown): boolean => t === null || (isObject(t) && goodStamp(t.updatedAt) && tripProblem(t as unknown as Trip) === null);
const finiteOrMissing = (x: unknown): boolean => x === undefined || (typeof x === 'number' && Number.isFinite(x));
const rideReads = (r: unknown): boolean => isObject(r) && typeof r.at === 'string' && Number.isFinite(Date.parse(r.at))
  && typeof r.predictedL === 'number' && Number.isFinite(r.predictedL)
  && (r.intakeL === null || (typeof r.intakeL === 'number' && Number.isFinite(r.intakeL)))
  && (r.feel === null || r.feel === 'A' || r.feel === 'B' || r.feel === 'C')
  && finiteOrMissing(r.massLossKg) && finiteOrMissing(r.toiletStops);
const calibrationReads = (c: unknown): boolean => isObject(c) && goodStamp(c.updatedAt) && Array.isArray(c.rides) && c.rides.every(rideReads);
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
 * Takes a file's sections in, in one go: a bad file writes nothing. A section the file never had (no `updatedAt`) leaves
 * what's here. Another route brings the same as replacing it: nothing of the old route stays. Reading a file is the
 * rider's own step, so it may be older than what's here, and other windows must then read again before they write.
 */
export function importAll(file: unknown): Promise<ImportResult> {
  return tracked(importing(file));
}

async function importing(file: unknown): Promise<ImportResult> {
  const problem = fileProblem(file);
  if (problem) return { ok: false, reason: problem, routeChanged: false };
  const f = file as ExportFile;
  const { updatedAt: tripStamp = null, ...tripFields } = f.trip ?? {};
  const trip = f.trip ? tripOf(tripFields as Trip) : null;

  // Settings go first: this is the step the browser can refuse outright, and it can be put back.
  const settingsBefore = localStorage.getItem(SETTINGS_KEY);
  const settingsStamp = f.settings.updatedAt;
  if (settingsStamp !== null) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ updatedAt: settingsStamp, ...settingsOf(f.settings) }));
    } catch {
      return { ok: false, reason: W.appStoreNotKept, routeChanged: false };
    }
  }

  let routeChanged = false;
  try {
    await inTx([...ROUTE_TX, 'calibration'], 'readwrite', async (tx) => {
      const meta = tx.objectStore('meta');
      if (trip) {
        const before = (await tx.objectStore('trip').get(CURRENT)) as Trip | undefined;
        routeChanged = !sameLine(before?.route, trip.route);
        if (before && routeChanged) await clearRouteData(tx);
        await tx.objectStore('trip').put(trip, CURRENT);
        await meta.put(tripStamp, stampKey('trip'));
      }
      if (f.profile.updatedAt !== null) {
        await meta.put(profileOf(usableProfile(f.profile)), PROFILE_META);
        await meta.put(f.profile.updatedAt, stampKey(PROFILE_META));
      }
      if (f.calibration.updatedAt !== null) {
        const store = tx.objectStore('calibration');
        await store.clear();
        for (const r of f.calibration.rides) await store.add(rideOf({ ...r, at: new Date(r.at) }));
        await meta.put(f.calibration.updatedAt, stampKey('calibration'));
      }
      if (f.tyres.updatedAt !== null) {
        await meta.put({ byBike: f.tyres.byBike }, TYRES_META);
        await meta.put(f.tyres.updatedAt, stampKey(TYRES_META));
      }
    });
  } catch {
    try {
      if (settingsBefore === null) localStorage.removeItem(SETTINGS_KEY);
      else localStorage.setItem(SETTINGS_KEY, settingsBefore);
    } catch { /* it was just written, so this is not expected */ }
    return { ok: false, reason: W.appStoreNotKept, routeChanged: false };
  }

  if (trip) noteCopy('trip', tripStamp as string | null);
  if (settingsStamp !== null) noteCopy('settings', settingsStamp);
  if (f.profile.updatedAt !== null) noteCopy('profile', f.profile.updatedAt);
  if (f.calibration.updatedAt !== null) noteCopy('calibration', f.calibration.updatedAt);
  if (f.tyres.updatedAt !== null) noteCopy('tyres', f.tyres.updatedAt);
  if (routeChanged) forgetPlanTomorrow();
  markChanged('all');
  return { ok: true, reason: null, routeChanged };
}

// ---- Delete --------------------------------------------------------------------------------------------------------

/**
 * Removes the database and every `copilot:*` key, key by key, and no other: never the whole storage at once, because the bag
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
    if (key !== null && key.startsWith('copilot:')) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

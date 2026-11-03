// What the You screen reads and does, in one object, so the components hold no store of their own and a test can put a fake in
// its place (as Trip does). `browserYouServices()` is the real one.
import { reportRide } from '../../core/engines/ride-report.ts';
import type { RideOutcome, RideReport } from '../../core/engines/ride-report.ts';
import type { Profile } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import { Y } from '../../core/wording/en-you.ts';
import { WEATHER_MODE } from '../../data/weather-mode.ts';
import type { WeatherMode } from '../../data/weather-mode.ts';
import { RefusedError } from '../../store/changed.ts';
import { deleteCopilotData, exportAll, importAll } from '../../store/export.ts';
import type { ImportResult } from '../../store/export.ts';
import { DEFAULT_PROFILE, readProfile } from '../../store/profile.ts';
import { DEFAULT_SETTINGS } from '../../store/rules.ts';
import type { Settings } from '../../store/rules.ts';
import { readSettings } from '../../store/settings.ts';
import { readTrip } from '../../store/trip.ts';
import { logRide, readRides, writeProfile } from '../../store/you.ts';
import type { ProfileField, ProfileWrite } from '../../store/you.ts';
import { loadRiderKg } from '../rider-kg.ts';
import { browserTripServices } from '../trip/services.ts';
import type { SettingsOutcome } from '../trip/services.ts';

export type YouSnapshot = {
  /** False when the browser would not open the database: nothing can be read or kept. */
  available: boolean;
  profile: Profile;
  settings: Settings;
  rides: number;
  /** The bag plan's bottle capacity, when there is a plan with water in it. */
  planBottleL: number | null;
};

export type PendingBagDelete = { id: string };

/** What an export file would bring, worked out without writing anything. */
export type ImportPreview = { ok: true; lines: string[] } | { ok: false; reason: string };

export type YouServices = {
  now: () => Date;
  weatherMode: WeatherMode;
  load: () => Promise<YouSnapshot>;
  writeProfile: (partial: Partial<Record<ProfileField, unknown>>) => Promise<ProfileWrite>;
  writeSettings: (partial: Partial<Record<keyof Settings, unknown>>) => Promise<SettingsOutcome>;
  report: (report: RideReport, profile: Profile, flatKph: number) => Promise<{ outcome: RideOutcome; refused: string | null }>;
  exportFile: () => Promise<{ name: string; text: string }>;
  save: (name: string, text: string) => void;
  preview: (text: string) => ImportPreview;
  applyImport: (text: string) => Promise<ImportResult>;
  deleteAll: (alsoBags: boolean) => Promise<{ ok: boolean }>;
  /** A request to delete the bag planner's data that the bag planner has not applied yet. */
  pendingBagDelete: () => PendingBagDelete | null;
};

export const DELETE_REQUEST_KEY = 'copilot:delete-request:v1';
const APPLIED_KEY = 'loadcheck:delete-applied';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const readJson = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

/** The request that is waiting; gone from the phone once the bag planner has written its id (Contract 3). Never writes `loadcheck:*`. */
export function pendingBagDelete(): PendingBagDelete | null {
  const request = readJson(DELETE_REQUEST_KEY);
  if (!isObject(request) || request.app !== 'copilot' || request.kind !== 'delete-request' || request.v !== 1 || typeof request.id !== 'string' || !/^[0-9a-f]{32}$/.test(request.id)) return null;
  const applied = readJson(APPLIED_KEY);
  if (isObject(applied) && applied.id === request.id) {
    try { localStorage.removeItem(DELETE_REQUEST_KEY); } catch { /* it stays, and shows, until it can go */ }
    return null;
  }
  return { id: request.id };
}

const randomId = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Stores Contract 3's request; its id, or null when the browser would not keep it. */
function storeDeleteRequest(now: Date): string | null {
  const id = randomId();
  try {
    localStorage.setItem(DELETE_REQUEST_KEY, JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1, id, createdAt: now.toISOString() }));
    return id;
  } catch {
    return null;
  }
}

export const bagDeleteHref = (id: string): string => `/tools/bags/#copilot-delete=${id}`;

/** What a file would bring, in the words of the screen. Checks the shape only: the store checks the rest before it writes anything. */
export function describeImport(text: string): ImportPreview {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, reason: Y.youImportUnreadable };
  }
  if (!isObject(file) || file.app !== 'copilot' || file.kind !== 'export') return { ok: false, reason: W.appStoreImportNotOurs };
  if (typeof file.v === 'number' && file.v > 1) return { ok: false, reason: W.appStoreImportNewer };
  const lines: string[] = [];
  const trip = file.trip;
  if (isObject(trip) && isObject(trip.route) && typeof trip.route.name === 'string' && typeof trip.route.lengthKm === 'number') {
    lines.push(Y.youImportTrip(trip.route.name.slice(0, 80), String(Math.round(trip.route.lengthKm * 10) / 10)));
  }
  if (isObject(file.profile) && file.profile.updatedAt != null) lines.push(Y.youImportRider);
  if (isObject(file.settings) && file.settings.updatedAt != null) lines.push(Y.youImportSettings);
  const rides = isObject(file.calibration) && Array.isArray(file.calibration.rides) ? file.calibration.rides.length : 0;
  if (rides > 0) lines.push(Y.youImportRides(rides));
  const bikes = isObject(file.tyres) && isObject(file.tyres.byBike) ? Object.keys(file.tyres.byBike).length : 0;
  if (bikes > 0) lines.push(Y.youImportTyres(bikes));
  return { ok: true, lines };
}

function bottleL(): number | null {
  const summary = readJson('loadcheck:summary:v1');
  if (!isObject(summary) || summary.empty === true || !isObject(summary.water)) return null;
  const total = summary.water.totalL;
  return typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : null;
}

const refusal = (e: unknown): string => (e instanceof RefusedError ? e.message : W.appStoreNotKept);

export function browserYouServices(now: () => Date = () => new Date(), navigate: (href: string) => void = (href) => window.location.assign(href)): YouServices {
  const trip = browserTripServices(now);
  return {
    now,
    weatherMode: WEATHER_MODE,
    load: async () => {
      try {
        const settings = await readSettings();
        const profile = await readProfile();
        const rides = (await readRides()).length;
        return { available: true, profile, settings, rides, planBottleL: bottleL() };
      } catch {
        return { available: false, profile: DEFAULT_PROFILE, settings: DEFAULT_SETTINGS, rides: 0, planBottleL: bottleL() };
      }
    },
    writeProfile: async (partial) => {
      try {
        // A window writes only over the version it has read.
        await readProfile();
        const result = await writeProfile(partial, now());
        await loadRiderKg();
        return result;
      } catch (e) {
        return { ok: false, profile: DEFAULT_PROFILE, reasons: {}, newerReason: refusal(e) };
      }
    },
    writeSettings: (partial) => trip.writeSettings(partial),
    report: async (report, profile, flatKph) => {
      const outcome = reportRide(report, profile, flatKph);
      if (!outcome.ok) return { outcome, refused: null };
      try {
        await readProfile();
        await readRides();
        const done = await logRide(outcome.ride, now());
        return { outcome, refused: done.ok ? null : done.newerReason };
      } catch (e) {
        return { outcome, refused: refusal(e) };
      }
    },
    exportFile: async () => {
      const file = await exportAll();
      return { name: `wayfinch-data-${now().toISOString().slice(0, 10)}.json`, text: `${JSON.stringify(file, null, 2)}\n` };
    },
    save: (name, text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    preview: describeImport,
    applyImport: async (text) => {
      let file: unknown;
      try {
        file = JSON.parse(text);
      } catch {
        return { ok: false, reason: Y.youImportUnreadable, routeChanged: false, ridesLeftOut: 0 };
      }
      // Read what is here first, so this window may write over it (the store's rule).
      await Promise.all([readProfile(), readSettings(), readRides(), readTrip()]).catch(() => undefined);
      const result = await importAll(file);
      await loadRiderKg();
      return result;
    },
    deleteAll: async (alsoBags) => {
      try {
        await deleteCopilotData();
        await loadRiderKg();
      } catch {
        return { ok: false };
      }
      if (alsoBags) {
        // The request outlives the deletion above; the bag planner applies it as it opens, in this window.
        const id = storeDeleteRequest(now());
        if (id === null) return { ok: false };
        navigate(bagDeleteHref(id));
      }
      return { ok: true };
    },
    pendingBagDelete,
  };
}

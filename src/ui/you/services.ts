// What the You screen reads and does, in one object, so the components hold no store of their own and a test can put a fake in
// its place (as Trip does). `browserYouServices()` is the real one.
import { reportRide } from '../../core/engines/ride-report.ts';
import type { RideOutcome, RideReport } from '../../core/engines/ride-report.ts';
import type { Profile } from '../../core/types.ts';
import { shortMapDate, W } from '../../core/wording/en.ts';
import { Y } from '../../core/wording/en-you.ts';
import { WEATHER_MODE } from '../../data/weather-mode.ts';
import type { WeatherMode } from '../../data/weather-mode.ts';
import { RefusedError } from '../../store/changed.ts';
import { deleteCopilotData, exportAll, importAll } from '../../store/export.ts';
import type { ExportFile, ImportResult } from '../../store/export.ts';
import { DEFAULT_PROFILE, readProfile } from '../../store/profile.ts';
import { DEFAULT_SETTINGS } from '../../store/rules.ts';
import type { Settings } from '../../store/rules.ts';
import { readSettings } from '../../store/settings.ts';
import { readLocalSettings, SETTINGS_KEY } from '../../store/settings-local.ts';
import { readTrip } from '../../store/trip.ts';
import { logRide, readRides, writeProfile } from '../../store/you.ts';
import type { ProfileField, ProfileWrite } from '../../store/you.ts';
import { forgetRiderKg, loadRiderKg } from '../rider-kg.ts';
import { applyTheme } from '../theme-apply.ts';
import { noteThemeChoice, themeNow } from '../theme-choice.ts';
import { browserTripServices } from '../trip/services.ts';
import type { SettingsOutcome } from '../trip/services.ts';

export type YouSnapshot = {
  /** False when the browser would not open the database: nothing can be read or kept. */
  available: boolean;
  profile: Profile;
  settings: Settings;
  rides: number;
  /** Hilly reports: kept on the phone, outside every factor and the count above. */
  hillyRides: number;
  /** The bag plan's bottle capacity, when there is a plan with water in it. */
  planBottleL: number | null;
};

export type PendingBagDelete = { id: string };

/** What an export file would bring, worked out without writing anything. */
export type ImportPreview = { ok: true; lines: string[]; warnings: string[] } | { ok: false; reason: string };

export type YouServices = {
  now: () => Date;
  weatherMode: WeatherMode;
  load: () => Promise<YouSnapshot>;
  writeProfile: (partial: Partial<Record<ProfileField, unknown>>) => Promise<ProfileWrite>;
  writeSettings: (partial: Partial<Record<keyof Settings, unknown>>) => Promise<SettingsOutcome>;
  report: (report: RideReport, profile: Profile, flatKph: number) => Promise<{ outcome: RideOutcome; refused: string | null }>;
  exportFile: () => Promise<{ name: string; text: string }>;
  save: (name: string, text: string) => void;
  preview: (text: string) => Promise<ImportPreview>;
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

const isStamp = (x: unknown): x is string => typeof x === 'string' && Number.isFinite(Date.parse(x));
const dayOf = (stamp: string): string => shortMapDate(stamp.slice(0, 10)) ?? stamp.slice(0, 10);
const sameFields = (a: unknown, b: Record<string, unknown>): boolean => isObject(a) && Object.keys(b).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

/**
 * What a file would bring, in the words of the screen, set against what this phone holds (`here`, its own export). `lines` is what
 * arrives; `warnings` is what would be lost or is newer here, which needs a second, explicit confirm. The shape only: the store
 * checks the rest before it writes anything. Sections without a date are listed too, when their values differ from the defaults.
 */
export function describeImport(text: string, here: ExportFile | null = null): ImportPreview {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, reason: Y.youImportUnreadable };
  }
  if (!isObject(file) || file.app !== 'copilot' || file.kind !== 'export') return { ok: false, reason: W.appStoreImportNotOurs };
  if (typeof file.v === 'number' && file.v > 1) return { ok: false, reason: W.appStoreImportNewer };
  const lines: string[] = [];
  const warnings: string[] = [];
  const trip = file.trip;
  if (isObject(trip) && isObject(trip.route) && typeof trip.route.name === 'string' && typeof trip.route.lengthKm === 'number') {
    lines.push(Y.youImportTrip(trip.route.name.slice(0, 80), String(Math.round(trip.route.lengthKm * 10) / 10)));
    const mine = here?.trip?.route;
    if (mine && !(isObject(trip.route) && trip.route.hash === mine.hash)) warnings.push(Y.youImportRouteClears(mine.name.slice(0, 80)));
  }
  const dated = (part: string, mineStamp: string | null | undefined, theirs: unknown): void => {
    if (!isStamp(mineStamp)) return;
    if (!isStamp(theirs)) warnings.push(Y.youImportUndated(part));
    else if (Date.parse(theirs) < Date.parse(mineStamp)) warnings.push(Y.youImportOlder(part, dayOf(theirs)));
  };
  const profile = file.profile;
  if (isObject(profile) && (profile.updatedAt != null || !sameFields(profile, { ...DEFAULT_PROFILE }))) {
    lines.push(Y.youImportRider);
    dated(Y.youImportPartRider, here?.profile.updatedAt, profile.updatedAt);
  }
  const settings = file.settings;
  if (isObject(settings) && (settings.updatedAt != null || !sameFields(settings, { ...DEFAULT_SETTINGS }))) {
    lines.push(Y.youImportSettings);
    dated(Y.youImportPartSettings, here?.settings.updatedAt, settings.updatedAt);
  }
  const cal = file.calibration;
  const rides = isObject(cal) && Array.isArray(cal.rides) ? cal.rides.length : 0;
  if (isObject(cal) && (rides > 0 || cal.updatedAt != null)) lines.push(Y.youImportRides(rides));
  const mineRides = here?.calibration.rides.length ?? 0;
  if (isObject(cal) && (rides > 0 || cal.updatedAt != null) && mineRides > rides) warnings.push(Y.youImportRidesLose(mineRides, rides));
  const tyres = isObject(file.tyres) && isObject(file.tyres.byBike) ? Object.keys(file.tyres.byBike).length : 0;
  const mineTyres = here ? Object.keys(here.tyres.byBike).length : 0;
  if (tyres > 0) lines.push(Y.youImportTyres(tyres));
  if (isObject(file.tyres) && (tyres > 0 || file.tyres.updatedAt != null) && mineTyres > tyres) warnings.push(Y.youImportTyresLose(mineTyres, tyres));
  return { ok: true, lines, warnings };
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
      // Nothing is kept yet, or it was just deleted: the reads below make no database and find nothing.
      try {
        const settings = await readSettings();
        const profile = await readProfile();
        const all = await readRides();
        const hillyRides = all.filter((r) => r.hilly === true).length;
        return { available: true, profile, settings, rides: all.length - hillyRides, hillyRides, planBottleL: bottleL() };
      } catch {
        return { available: false, profile: DEFAULT_PROFILE, settings: DEFAULT_SETTINGS, rides: 0, hillyRides: 0, planBottleL: bottleL() };
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
      // The one theme both apps show, which may be the bag planner's newer choice (theme-choice.ts)
      const stored = await exportAll();
      const file = { ...stored, settings: { ...stored.settings, theme: themeNow() } };
      return { name: `wayfinch-data-${now().toISOString().slice(0, 10)}.json`, text: `${JSON.stringify(file, null, 2)}\n` };
    },
    save: (name, text) => {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      // Taken away after the click has been handled: some browsers cancel a download whose link is gone at once.
      setTimeout(() => a.remove(), 1000);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    preview: async (text) => describeImport(text, await exportAll().catch(() => null)),
    applyImport: async (text) => {
      let file: unknown;
      try {
        file = JSON.parse(text);
      } catch {
        return { ok: false, reason: Y.youImportUnreadable, routeChanged: false, ridesLeftOut: 0 };
      }
      // Read what is here first, so this window may write over it (the store's rule).
      await Promise.all([readProfile(), readSettings(), readRides(), readTrip()]).catch(() => undefined);
      const before = localStorage.getItem(SETTINGS_KEY);
      const result = await importAll(file);
      // Settings that came with the file are a choice made now: the bag planner shows their theme too.
      if (result.ok && localStorage.getItem(SETTINGS_KEY) !== before) noteThemeChoice(readLocalSettings().settings.theme);
      await loadRiderKg();
      applyTheme(themeNow());
      return result;
    },
    deleteAll: async (alsoBags) => {
      try {
        await deleteCopilotData();
        forgetRiderKg();
        applyTheme(themeNow());
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

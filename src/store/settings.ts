// Reading and writing the rider's settings (spec section 3.3). Those that belong to the trip live in the trip while there is
// one, so `trip.campWaterL` and the setting can never differ; without a trip, and for the next one, they stay here too.
import type { Trip } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { holdsCopy, markChanged, nextStamp, noteCopy, tracked } from './changed.ts';
import type { Section } from './changed.ts';
import { CURRENT, inTx } from './db.ts';
import { DEFAULT_CAMP_WATER_L, isSetting, settingProblem, usableTrip } from './rules.ts';
import type { Settings } from './rules.ts';
import { readLocalSettings, SETTINGS_KEY, writeLocalSettings } from './settings-local.ts';
import { readStamp, stampKey } from './trip.ts';

export type { Settings } from './rules.ts';

export type WriteResult = {
  ok: boolean;
  settings: Settings; // what now holds
  reasons: Partial<Record<keyof Settings, string>>; // why a value was refused; the last good one stays
  newer: Section[]; // sections another window changed first: then nothing at all was written
  newerReason: string | null;
};

/** What the rider had for camp water before accommodation set it to 0: this device's alone, and it never travels. */
const CAMP_BEFORE_KEY = 'copilot:camp-water-before';

/** The settings with the trip's values over the stored ones. */
const overlay = (settings: Settings, trip: Trip | null): Settings => (trip
  ? { ...settings, startTime: trip.startTime, flatKph: trip.flatKph, stay: trip.stay, campWaterL: trip.campWaterL, pace: trip.pace ?? settings.pace }
  : settings);

/** A database that won't open costs the trip's values here, not the settings of this phone. */
const readTripRecord = (): Promise<{ raw: unknown; stamp: string | null }> => inTx(['trip', 'meta'], 'readonly', async (tx) => ({
  raw: (await tx.objectStore('trip').get(CURRENT)) as unknown,
  stamp: await readStamp(tx, 'trip'),
})).catch(() => ({ raw: null, stamp: null }));

async function current(): Promise<{ settings: Settings; localStamp: string | null; tripStamp: string | null }> {
  const { settings, stamp: localStamp } = readLocalSettings();
  const { raw, stamp: tripStamp } = await readTripRecord();
  return { settings: overlay(settings, usableTrip(raw, settings)), localStamp, tripStamp };
}

/** Counts as having read these settings, and the trip's fields among them; not as having read the whole trip. */
export async function readSettings(): Promise<Settings> {
  const { settings, localStamp, tripStamp } = await current();
  noteCopy('settings', localStamp);
  noteCopy('trip-settings', tripStamp);
  return settings;
}

const TRIP_FIELDS = ['startTime', 'flatKph', 'stay', 'campWaterL', 'pace'] as const;

function campBefore(): number | null {
  try {
    const value = Number(localStorage.getItem(CAMP_BEFORE_KEY) ?? Number.NaN);
    return settingProblem('campWaterL', value) === null ? value : null;
  } catch {
    return null;
  }
}

/**
 * Stay decides camp water's default: 0 for accommodation. Leaving it with 0 still there gives back what the rider had before,
 * or the default. `remember` is what to keep for that, or null to forget it; undefined leaves it.
 */
function withStayDefault(accepted: Partial<Settings>, before: Settings): { fields: Partial<Settings>; remember: number | null | undefined } {
  if (accepted.stay === undefined || accepted.stay === before.stay) return { fields: accepted, remember: undefined };
  if (accepted.stay === 'accommodation') {
    return accepted.campWaterL === undefined ? { fields: { ...accepted, campWaterL: 0 }, remember: before.campWaterL } : { fields: accepted, remember: null };
  }
  if (before.stay !== 'accommodation') return { fields: accepted, remember: undefined };
  const backTo = accepted.campWaterL === undefined && before.campWaterL === 0 ? (campBefore() ?? DEFAULT_CAMP_WATER_L) : undefined;
  return { fields: backTo === undefined ? accepted : { ...accepted, campWaterL: backTo }, remember: null };
}

function keepCampBefore(remember: number | null | undefined): void {
  if (remember === undefined) return;
  try {
    if (remember === null) localStorage.removeItem(CAMP_BEFORE_KEY);
    else localStorage.setItem(CAMP_BEFORE_KEY, String(remember));
  } catch {
    // Storage full: going back then gives the default, which is what the table says anyway.
  }
}

/**
 * Applies what's valid, and says why the rest isn't: an invalid value keeps the last good one. It writes the trip and the
 * settings both or neither. If another window has changed either since this one read it, nothing is written, and `newer`
 * names which.
 */
export function writeSettings(partial: Partial<Record<keyof Settings, unknown>>): Promise<WriteResult> {
  return tracked(writing(partial));
}

async function writing(partial: Partial<Record<keyof Settings, unknown>>): Promise<WriteResult> {
  const reasons: WriteResult['reasons'] = {};
  const checked: Partial<Settings> = {};
  for (const [field, value] of Object.entries(partial)) {
    if (!isSetting(field)) continue;
    const problem = settingProblem(field, value);
    if (problem) reasons[field] = problem;
    else (checked as Record<string, unknown>)[field] = value;
  }
  const { fields: accepted, remember } = withStayDefault(checked, (await current()).settings);
  const newer = Object.keys(accepted).length > 0 ? await writeBoth(accepted) : [];
  if (newer.length === 0) keepCampBefore(remember);
  return {
    ok: Object.keys(reasons).length === 0 && newer.length === 0,
    settings: (await current()).settings, reasons, newer,
    newerReason: newer.length > 0 ? W.appStoreChangedElsewhere : null,
  };
}

/** Writes the settings, and the trip's fields when there are any and a trip. Returns which sections stopped it. */
async function writeBoth(accepted: Partial<Settings>): Promise<Section[]> {
  const local = readLocalSettings();
  const settingsNewer: Section[] = holdsCopy('settings', local.stamp) ? [] : ['settings'];
  const writeLocal = (): string => {
    const stamp = writeLocalSettings(accepted);
    if (stamp === null) throw new Error(W.appStoreNotKept);
    return stamp;
  };

  const fields = TRIP_FIELDS.filter((f) => accepted[f] !== undefined);
  // A setting of this phone alone needs no database, so it works also when the database won't open.
  if (fields.length === 0) {
    if (settingsNewer.length > 0) return settingsNewer;
    noteCopy('settings', writeLocal());
    markChanged('settings');
    return [];
  }

  const before = rawLocal();
  let tripStamp: string | null = null;
  let localStamp: string | null = null;
  try {
    const refused = await inTx(['trip', 'meta'], 'readwrite', async (tx): Promise<Section[]> => {
      const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local.settings);
      const stored = await readStamp(tx, 'trip');
      const stopped: Section[] = trip && !holdsCopy('trip-settings', stored) ? ['trip', ...settingsNewer] : settingsNewer;
      if (stopped.length > 0) return stopped;
      if (trip) {
        const next: Trip = { ...trip };
        for (const f of fields) (next as Record<string, unknown>)[f] = accepted[f];
        tripStamp = nextStamp(stored);
        await tx.objectStore('trip').put(next, CURRENT);
        await tx.objectStore('meta').put(tripStamp, stampKey('trip'));
      }
      // Last and inside: refused here, the transaction is undone with it.
      localStamp = writeLocal();
      return [];
    });
    if (refused.length > 0) return refused;
  } catch (e) {
    restoreLocal(before);
    throw e;
  }
  noteCopy('settings', localStamp);
  markChanged('settings');
  if (tripStamp !== null) {
    // Not `trip`: a whole trip this window read before this change is now out of date, and must be read again.
    noteCopy('trip-settings', tripStamp);
    markChanged('trip');
  }
  return [];
}

const rawLocal = (): string | null => {
  try {
    return localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
};

function restoreLocal(before: string | null): void {
  try {
    if (before === null) localStorage.removeItem(SETTINGS_KEY);
    else localStorage.setItem(SETTINGS_KEY, before);
  } catch {
    // It can't be written, so it wasn't changed.
  }
}

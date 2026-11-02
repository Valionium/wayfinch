// Reading and writing the rider's settings (spec section 3.3). Those that belong to the trip live in the trip while there is
// one, so `trip.campWaterL` and the setting can never differ; without a trip, and for the next one, they stay here too.
import type { Trip } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { holdsCopy, markChanged, nextStamp, noteCopy, tracked } from './changed.ts';
import type { Section } from './changed.ts';
import { CURRENT, inTx } from './db.ts';
import { DEFAULT_CAMP_WATER_L, isSetting, settingProblem, usableTrip } from './rules.ts';
import type { Settings } from './rules.ts';
import { readLocalSettings, writeLocalSettings } from './settings-local.ts';
import { readStamp, stampKey } from './trip.ts';

export type { Settings } from './rules.ts';

export type WriteResult = {
  ok: boolean;
  settings: Settings; // what now holds
  reasons: Partial<Record<keyof Settings, string>>; // why a value was refused; the last good one stays
  newer: Section[]; // sections another window changed first: nothing was written over them
  newerReason: string | null;
};

/** The settings with the trip's values over the stored ones. */
const overlay = (settings: Settings, trip: Trip | null): Settings => (trip
  ? { ...settings, startTime: trip.startTime, flatKph: trip.flatKph, stay: trip.stay, campWaterL: trip.campWaterL, pace: trip.pace ?? settings.pace }
  : settings);

const readTripRecord = (): Promise<{ raw: unknown; stamp: string | null }> => inTx(['trip', 'meta'], 'readonly', async (tx) => ({
  raw: (await tx.objectStore('trip').get(CURRENT)) as unknown,
  stamp: await readStamp(tx, 'trip'),
}));

async function current(): Promise<{ settings: Settings; localStamp: string | null; tripStamp: string | null }> {
  const { settings, stamp: localStamp } = readLocalSettings();
  const { raw, stamp: tripStamp } = await readTripRecord();
  return { settings: overlay(settings, usableTrip(raw, settings)), localStamp, tripStamp };
}

export async function readSettings(): Promise<Settings> {
  const { settings, localStamp, tripStamp } = await current();
  noteCopy('settings', localStamp);
  noteCopy('trip', tripStamp);
  return settings;
}

const TRIP_FIELDS = ['startTime', 'flatKph', 'stay', 'campWaterL', 'pace'] as const;

/** Stay decides camp water's default: 0 for accommodation, and back again when leaving it with nothing set. */
function withStayDefault(accepted: Partial<Settings>, before: Settings): Partial<Settings> {
  if (accepted.stay === undefined || accepted.campWaterL !== undefined || accepted.stay === before.stay) return accepted;
  if (accepted.stay === 'accommodation') return { ...accepted, campWaterL: 0 };
  return before.stay === 'accommodation' && before.campWaterL === 0 ? { ...accepted, campWaterL: DEFAULT_CAMP_WATER_L } : accepted;
}

/**
 * Applies what's valid, and says why the rest isn't: an invalid value keeps the last good one. A section another window
 * has changed since this one read it is left alone, and named in `newer`.
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
  const newer: Section[] = [];
  const accepted = withStayDefault(checked, (await current()).settings);

  const forTrip = TRIP_FIELDS.filter((f) => accepted[f] !== undefined);
  if (forTrip.length > 0) await writeTripFields(accepted, forTrip, newer);

  if (Object.keys(accepted).length > 0) {
    if (holdsCopy('settings', readLocalSettings().stamp)) {
      const stamp = writeLocalSettings(accepted);
      if (stamp === null) throw new Error(W.appStoreNotKept);
      noteCopy('settings', stamp);
      markChanged('settings');
    } else newer.push('settings');
  }
  return {
    ok: Object.keys(reasons).length === 0 && newer.length === 0,
    settings: (await current()).settings, reasons, newer,
    newerReason: newer.length > 0 ? W.appStoreChangedElsewhere : null,
  };
}

async function writeTripFields(accepted: Partial<Settings>, fields: readonly (typeof TRIP_FIELDS)[number][], newer: Section[]): Promise<void> {
  const local = readLocalSettings().settings;
  const outcome = await inTx(['trip', 'meta'], 'readwrite', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local);
    if (!trip) return 'none' as const;
    const stored = await readStamp(tx, 'trip');
    if (!holdsCopy('trip', stored)) return 'newer' as const;
    const next: Trip = { ...trip };
    for (const f of fields) (next as Record<string, unknown>)[f] = accepted[f];
    const stamp = nextStamp(stored);
    await tx.objectStore('trip').put(next, CURRENT);
    await tx.objectStore('meta').put(stamp, stampKey('trip'));
    return stamp;
  });
  if (outcome === 'none') return;
  if (outcome === 'newer') { newer.push('trip'); return; }
  noteCopy('trip', outcome);
  markChanged('trip');
}

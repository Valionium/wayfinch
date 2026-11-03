// What You writes (spec sections 3.5 and 6.3): the rider's profile and the logged rides of water learning. Apart from profile.ts so
// that the first screen does not carry the writers. The store's rule holds: a window writes only over the version it read.
import { updateCarrying, updateDrinking } from '../core/engines/water-factors.ts';
import type { Ride } from '../core/engines/water-base.ts';
import type { Profile } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { markChanged, holdsCopy, nextStamp, noteCopy, tracked } from './changed.ts';
import { inTx } from './db.ts';
import type { Tx } from './db.ts';
import { DEFAULT_PROFILE, PROFILE_META, usableProfile } from './profile.ts';
import { readStamp, stampKey } from './trip.ts';

export type ProfileField = 'weightKg' | 'thirst' | 'ebike' | 'capacityL';
export type ProfileWrite = {
  ok: boolean;
  profile: Profile;
  reasons: Partial<Record<ProfileField, string>>;
  /** Another window changed the profile first: nothing was written. */
  newerReason: string | null;
};

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const CHECKS: Record<ProfileField, (x: unknown) => string | null> = {
  weightKg: (x) => (x === null || (finite(x) && x >= 20 && x <= 350) ? null : W.appStoreWeightRange),
  capacityL: (x) => (x === null || (finite(x) && x >= 0 && x <= 20) ? null : W.appStoreCapacityRange),
  thirst: (x) => (x === 'less' || x === 'average' || x === 'more' ? null : W.appStoreThirstChoice),
  ebike: (x) => (typeof x === 'boolean' ? null : W.appStoreEbikeChoice),
};

/** The rides in the order they were added; a ride that cannot be read is left out. */
export async function ridesOf(tx: Tx): Promise<Ride[]> {
  const rows = (await tx.objectStore('calibration').getAll()) as unknown[];
  return rows.flatMap((r): Ride[] => {
    const x = r as Partial<Ride> | null;
    if (!x || !(x.at instanceof Date) || !Number.isFinite(x.at.getTime()) || !finite(x.predictedL)) return [];
    return [x as Ride];
  });
}

const weighedCount = (rides: Ride[]): number => rides.filter((r) => finite(r.massLossKg) && r.intakeL !== null).length;

/** The factors the rides give, with the prior the thirst answer sets. */
function factorsOf(profile: Profile, all: Ride[], now: Date): Pick<Profile, 'k' | 'sumW' | 'kDrink' | 'weighedRides'> {
  // Hilly reports are kept but stand outside every factor and every count: the estimate they were set against is for flat ground.
  const rides = all.filter((r) => r.hilly !== true);
  const carrying = updateCarrying({ thirst: profile.thirst }, rides, now);
  return { k: carrying.k, sumW: carrying.sumW, kDrink: updateDrinking(rides, now), weighedRides: weighedCount(rides) };
}

export function writeProfile(partial: Partial<Record<ProfileField, unknown>>, now: Date = new Date()): Promise<ProfileWrite> {
  return tracked(writing(partial, now));
}

async function writing(partial: Partial<Record<ProfileField, unknown>>, now: Date): Promise<ProfileWrite> {
  const reasons: ProfileWrite['reasons'] = {};
  const accepted: Partial<Profile> = {};
  for (const [field, value] of Object.entries(partial)) {
    if (!Object.hasOwn(CHECKS, field)) continue;
    const problem = CHECKS[field as ProfileField](value);
    if (problem) reasons[field as ProfileField] = problem;
    else (accepted as Record<string, unknown>)[field] = value;
  }
  const done = await inTx(['meta', 'calibration'], 'readwrite', async (tx) => {
    const stored = await readStamp(tx, PROFILE_META);
    const before = usableProfile(await tx.objectStore('meta').get(PROFILE_META));
    if (Object.keys(accepted).length === 0) return { stamp: null as string | null, profile: before, newer: false };
    if (!holdsCopy('profile', stored)) return { stamp: null, profile: before, newer: true };
    let next: Profile = { ...before, ...accepted };
    // The prior of carrying follows the thirst answer; the rides on this phone stay what they were.
    if (accepted.thirst !== undefined && accepted.thirst !== before.thirst) next = { ...next, ...factorsOf(next, await ridesOf(tx), now) };
    const stamp = nextStamp(stored);
    await tx.objectStore('meta').put(next, PROFILE_META);
    await tx.objectStore('meta').put(stamp, stampKey(PROFILE_META));
    return { stamp, profile: next, newer: false };
  });
  if (done.stamp !== null) {
    noteCopy('profile', done.stamp);
    markChanged('profile');
  }
  return { ok: Object.keys(reasons).length === 0 && !done.newer, profile: done.profile, reasons, newerReason: done.newer ? W.appStoreChangedElsewhere : null };
}

/** The rides on this phone, and the stamp this window now holds for them. */
export async function readRides(): Promise<Ride[]> {
  const { rides, stamp } = await inTx(['calibration', 'meta'], 'readonly', async (tx) => ({ rides: await ridesOf(tx), stamp: await readStamp(tx, 'calibration') }));
  noteCopy('calibration', stamp);
  return rides;
}

export type LogResult = { ok: boolean; profile: Profile; newerReason: string | null };

/** Adds a ride and takes the factors in again, in one transaction. */
export function logRide(ride: Ride, now: Date): Promise<LogResult> {
  return tracked(logging(ride, now));
}

async function logging(ride: Ride, now: Date): Promise<LogResult> {
  const done = await inTx(['calibration', 'meta'], 'readwrite', async (tx) => {
    const profileStamp = await readStamp(tx, PROFILE_META);
    const ridesStamp = await readStamp(tx, 'calibration');
    const before = usableProfile(await tx.objectStore('meta').get(PROFILE_META));
    if (!holdsCopy('profile', profileStamp) || !holdsCopy('calibration', ridesStamp)) return { stamps: null, profile: before };
    await tx.objectStore('calibration').add(ride);
    const next: Profile = { ...before, ...factorsOf(before, await ridesOf(tx), now) };
    const stamps = { profile: nextStamp(profileStamp), rides: nextStamp(ridesStamp) };
    await tx.objectStore('meta').put(next, PROFILE_META);
    await tx.objectStore('meta').put(stamps.profile, stampKey(PROFILE_META));
    await tx.objectStore('meta').put(stamps.rides, stampKey('calibration'));
    return { stamps, profile: next };
  });
  if (done.stamps === null) return { ok: false, profile: done.profile, newerReason: W.appStoreChangedElsewhere };
  noteCopy('profile', done.stamps.profile);
  noteCopy('calibration', done.stamps.rides);
  markChanged('profile');
  markChanged('calibration');
  return { ok: true, profile: done.profile, newerReason: null };
}

export { DEFAULT_PROFILE };

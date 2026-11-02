// Positions, the water left and Plan tomorrow (spec sections 4.4, 6.2, 6.2a and 3.2).
import { addDaysIso } from '../core/answers/time.ts';
import { isFarOff, latestPosition, usablePosition } from '../core/engines/locate.ts';
import { ridingDate, zoneLookupOf } from '../core/engines/tripday.ts';
import type { PlanTomorrow, Position, ScreenInputs, Trip, ZoneSpan } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx } from './db.ts';
import type { Tx } from './db.ts';
import { goodDate } from './rules.ts';
import { PLAN_TOMORROW_KEY } from './trip.ts';

const MS_48H = 48 * 3_600_000;
const CHECK_IN_ACCURACY_M = 100; // section 6.2
/** Decision 4 of the plan: a confirmed amount stops being "confirmed" on a position more than this after it. */
const WATER_CONFIRMED_MS = 15 * 60_000;
const MAX_WATER_L = 20;

const validDate = (d: Date): boolean => d instanceof Date && Number.isFinite(d.getTime());

/**
 * Which positions stay (section 4.4): each for at most 48 hours, and of those the check-ins of the current and the previous
 * riding day, the other day positions of the current one, the latest day position, and the latest accepted one.
 */
export function keptPositions(all: Position[], now: Date, trip: Trip | null, zones: ZoneSpan[]): Position[] {
  const fresh = all.filter((p) => usablePosition(p) && now.getTime() - p.at.getTime() <= MS_48H);
  // Without the zones no riding date can be told: nothing is dropped by date until Get ready has found them.
  if (zones.length === 0) return fresh;

  const startZone = zoneLookupOf(zones)(0).timeZone;
  // A position stamped after now counts as now, as the engines read it.
  const dateOf = (p: Position): string => ridingDate(p.at.getTime() > now.getTime() ? now : p.at, startZone);
  const today = ridingDate(now, startZone);
  const yesterday = addDaysIso(today, -1);
  const departure = trip?.departureDate ?? null;
  const isDay = (p: Position): boolean => departure !== null && dateOf(p) >= departure && !isFarOff(p);
  const isCheckIn = (p: Position): boolean => p.source === 'gps' && p.accuracyM <= CHECK_IN_ACCURACY_M;

  const latest = latestPosition(fresh);
  const latestDay = latestPosition(fresh.filter(isDay));
  return fresh.filter((p) => {
    if (p === latest || p === latestDay) return true;
    const date = dateOf(p);
    if (isCheckIn(p) && (date === today || date === yesterday)) return true;
    return date === today && isDay(p);
  });
}

/** Deletes every position not kept. Inside the caller's transaction. */
export async function sweepPositions(tx: Tx, now: Date, trip: Trip | null, zones: ZoneSpan[]): Promise<void> {
  const store = tx.objectStore('positions');
  const keys = await store.getAllKeys();
  const rows = (await store.getAll()) as Position[];
  const kept = new Set(keptPositions(rows, now, trip, zones));
  await Promise.all(rows.map((p, i) => (kept.has(p) ? undefined : store.delete(keys[i]!))));
}

/** Keeps an accepted position, and sweeps. A position that can't be read is no position: it's dropped, and flips nothing. */
export function addPosition(p: Position, now: Date): Promise<void> {
  return tracked(adding(p, now));
}

async function adding(p: Position, now: Date): Promise<void> {
  if (!usablePosition(p)) return;
  await inTx(['positions', 'waterLeft', 'trip', 'meta'], 'readwrite', async (tx) => {
    await tx.objectStore('positions').add(p);
    if (!validDate(now)) return;
    await flip(tx, now);
    const trip = ((await tx.objectStore('trip').get(CURRENT)) as Trip | undefined) ?? null;
    const zones = ((await tx.objectStore('meta').get(ZONES_KEY)) as ZoneSpan[] | undefined) ?? [];
    await sweepPositions(tx, now, trip, zones);
  });
  markChanged('positions');
}

export const ZONES_KEY = 'route:zones';

async function flip(tx: Tx, now: Date): Promise<void> {
  const store = tx.objectStore('waterLeft');
  const left = (await store.get(CURRENT)) as ScreenInputs['waterLeft'] | undefined;
  if (left?.confirmed && now.getTime() - left.at.getTime() > WATER_CONFIRMED_MS) await store.put({ ...left, confirmed: false }, CURRENT);
}

/** The rider's own amount. 0 is an amount. */
export function confirmWater(litres: number, now: Date): Promise<{ ok: boolean; reason: string | null }> {
  return tracked(confirming(litres, now));
}

async function confirming(litres: number, now: Date): Promise<{ ok: boolean; reason: string | null }> {
  if (typeof litres !== 'number' || !(litres >= 0 && litres <= MAX_WATER_L) || !validDate(now)) return { ok: false, reason: W.appStoreWaterRange };
  await inTx(['waterLeft'], 'readwrite', (tx) => tx.objectStore('waterLeft').put({ litres, at: now, confirmed: true }, CURRENT));
  markChanged('water');
  return { ok: true, reason: null };
}

// ---- Plan tomorrow: one date, or the time of a Back to today tap (section 4.4) ---------------------------------------

export function readPlanTomorrow(): PlanTomorrow | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_TOMORROW_KEY) ?? 'null') as { date?: unknown; at?: unknown } | null;
    if (typeof raw !== 'object' || raw === null) return null;
    if (goodDate(raw.date)) return { date: raw.date, backToTodayAt: null };
    const at = typeof raw.at === 'string' ? new Date(raw.at) : null;
    return at && validDate(at) ? { date: '', backToTodayAt: at } : null;
  } catch {
    return null;
  }
}

const writePlan = (value: { date: string } | { at: string }): void => {
  try {
    localStorage.setItem(PLAN_TOMORROW_KEY, JSON.stringify(value));
    markChanged('plan-tomorrow');
  } catch {
    // Storage blocked: the choice lasts as long as the screen that made it.
  }
};

export function setPlanTomorrow(date: string): void {
  if (goodDate(date)) writePlan({ date });
}

export function backToToday(now: Date): void {
  if (validDate(now)) writePlan({ at: now.toISOString() });
}

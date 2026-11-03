// Positions, the water left and Plan tomorrow (spec sections 4.4, 6.2, 6.2a and 3.2).
import { addDaysIso } from '../core/answers/time.ts';
import { isFarOff, latestPosition, positionOrder } from '../core/engines/locate.ts';
import { ridingDate, zoneLookupOf } from '../core/engines/tripday.ts';
import type { PlanTomorrow, Position, Trip, ZoneSpan } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { markChanged, tracked } from './changed.ts';
import { CURRENT, inTx } from './db.ts';
import type { Tx } from './db.ts';
import { goodDate, readablePosition, usableTrip, usableWater, usableZones } from './rules.ts';
import { readLocalSettings } from './settings-local.ts';
import { PLAN_TOMORROW_KEY } from './trip.ts';

const MS_48H = 48 * 3_600_000;
const CHECK_IN_ACCURACY_M = 100; // section 6.2
/** Decision 4 of the plan: a confirmed amount stops being "confirmed" on a position more than this after it. */
const WATER_CONFIRMED_MS = 15 * 60_000;
const MAX_WATER_L = 20;
/** Fixes this close can arrive out of order. Further apart, the one kept first with the later stamp had a clock running ahead. */
const OUT_OF_ORDER_MS = 5 * 60_000;
/** A kilometre this far outside the route was not measured on it. */
const OUTSIDE_ROUTE_KM = 1;

const validDate = (d: Date): boolean => d instanceof Date && Number.isFinite(d.getTime());

/**
 * Which positions stay (section 4.4): each for at most 48 hours, and of those the check-ins of the current and the previous
 * riding day, the other day positions of the current one, the latest day position, and the latest accepted one. Also, so
 * that dropping none of them moves the day start (section 6.2a): the last position before today, near and far off, and the
 * first far-off one of today, which section 6.2a's fallback reads. Section 4.4's list leaves these out.
 */
export function keptPositions(all: Position[], now: Date, trip: Trip | null, zones: ZoneSpan[]): Position[] {
  const fresh = all.filter((p) => readablePosition(p) && now.getTime() - p.at.getTime() <= MS_48H);
  // Without the zones no riding date can be told: nothing is dropped by date until Get ready has found them.
  if (zones.length === 0) return fresh;

  const startZone = zoneLookupOf(zones)(0).timeZone;
  // A position stamped after now counts as now, as the engines read it.
  const dateOf = (p: Position): string => ridingDate(p.at.getTime() > now.getTime() ? now : p.at, startZone);
  const today = ridingDate(now, startZone);
  const yesterday = addDaysIso(today, -1);
  const departure = trip?.departureDate ?? null;
  const onTrip = (p: Position): boolean => departure !== null && dateOf(p) >= departure;
  const isDay = (p: Position): boolean => onTrip(p) && !isFarOff(p);
  const isCheckIn = (p: Position): boolean => p.source === 'gps' && p.accuracyM <= CHECK_IN_ACCURACY_M;

  const before = fresh.filter((p) => onTrip(p) && dateOf(p) < today);
  const needed = new Set<Position | null | undefined>([
    latestPosition(fresh),
    latestPosition(fresh.filter(isDay)),
    latestPosition(before.filter((p) => !isFarOff(p))),
    latestPosition(before.filter(isFarOff)),
    fresh.filter((p) => onTrip(p) && isFarOff(p) && dateOf(p) === today).sort(positionOrder)[0],
  ]);
  return fresh.filter((p) => {
    if (needed.has(p)) return true;
    const date = dateOf(p);
    if (isCheckIn(p) && (date === today || date === yesterday)) return true;
    return date === today && isDay(p);
  });
}

/**
 * Leaves out a row stamped ahead: one kept before a true fix, yet stamped later than it. Sorted by stamp it would count as the
 * latest until real time passed it, and no new fix would change the answers. `rows` come in the order they were kept, which
 * tells what came first where the stamps can't. Only a fix under 48 hours old and not after now counts as true, so a fix from
 * a clock far behind hides nothing once the clock is right. Stamps aren't rewritten, as the clock may be wrong at this moment.
 */
export function withoutStampedAhead(rows: Position[], now: Date): Position[] {
  let earliestLater = Infinity;
  const shown: Position[] = [];
  for (const p of [...rows].reverse()) {
    if (!readablePosition(p)) continue;
    const t = p.at.getTime();
    if (t - earliestLater > OUT_OF_ORDER_MS) continue;
    shown.unshift(p);
    if (t <= now.getTime() && now.getTime() - t <= MS_48H) earliestLater = Math.min(earliestLater, t);
  }
  return shown;
}

/**
 * Deletes what's past its time, and what can't be read, inside the caller's transaction. A position stamped after now stays
 * on the phone whatever the screen is shown: the clock may be what's wrong, and a delete can't be taken back.
 */
export async function sweepPositions(tx: Tx, now: Date, trip: Trip | null, zones: ZoneSpan[]): Promise<void> {
  const store = tx.objectStore('positions');
  const keys = await store.getAllKeys();
  const rows = (await store.getAll()) as Position[];
  const kept = new Set(keptPositions(withoutStampedAhead(rows, now), now, trip, zones));
  const afterNow = (p: Position): boolean => readablePosition(p) && p.at.getTime() > now.getTime();
  await Promise.all(rows.map((p, i) => (kept.has(p) || afterNow(p) ? undefined : store.delete(keys[i]!))));
}

/**
 * Keeps an accepted position, and sweeps. `routeId` is the route its kilometre was measured on: the route may have been
 * replaced while the fix was on its way, and a kilometre of another route must never count on this one. So that's checked
 * in the transaction that writes. Refused, or unreadable, it isn't kept, flips nothing, and the answer says so.
 */
export function addPosition(p: Position, now: Date, routeId: string): Promise<{ kept: boolean }> {
  return tracked(adding(p, now, routeId));
}

async function adding(p: Position, now: Date, routeId: string): Promise<{ kept: boolean }> {
  if (!readablePosition(p)) return { kept: false };
  const local = readLocalSettings().settings;
  const outcome = await inTx(['positions', 'waterLeft', 'trip', 'meta'], 'readwrite', async (tx) => {
    const trip = usableTrip(await tx.objectStore('trip').get(CURRENT), local);
    if (!trip || trip.route.id !== routeId) return null;
    if (p.km < -OUTSIDE_ROUTE_KM || p.km > trip.route.lengthKm + OUTSIDE_ROUTE_KM) return null;
    await tx.objectStore('positions').add(p);
    if (!validDate(now)) return { flipped: false };
    const flipped = await flip(tx, now);
    await sweepPositions(tx, now, trip, usableZones(await tx.objectStore('meta').get(ZONES_KEY)));
    return { flipped };
  });
  if (outcome === null) return { kept: false };
  markChanged('positions');
  if (outcome.flipped) markChanged('water');
  return { kept: true };
}

export const ZONES_KEY = 'route:zones';

async function flip(tx: Tx, now: Date): Promise<boolean> {
  const store = tx.objectStore('waterLeft');
  const left = usableWater(await store.get(CURRENT));
  if (!left?.confirmed || now.getTime() - left.at.getTime() <= WATER_CONFIRMED_MS) return false;
  await store.put({ ...left, confirmed: false }, CURRENT);
  return true;
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

const writePlan = (value: { date: string } | { at: string }): boolean => {
  try {
    localStorage.setItem(PLAN_TOMORROW_KEY, JSON.stringify(value));
  } catch {
    return false;
  }
  markChanged('plan-tomorrow');
  return true;
};

/** False when the choice wasn't kept: the date made no sense, or the browser refused it, and the next read won't have it. */
export function setPlanTomorrow(date: string): boolean {
  return goodDate(date) && writePlan({ date });
}

/** False when the tap wasn't kept, as for `setPlanTomorrow`. */
export function backToToday(now: Date): boolean {
  return validDate(now) && writePlan({ at: now.toISOString() });
}

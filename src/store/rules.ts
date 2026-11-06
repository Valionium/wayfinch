// What the store accepts (spec section 3.3's settings table), in one place. A bad flat speed or start time must never reach
// `screen()`: the time formatters throw on an Invalid Date, and an unusable speed reads as unknown.
import { usablePosition } from '../core/engines/locate.ts';
import { usableFlatKph } from '../core/engines/pace.ts';
import type { DayStart, Position, Route, ScreenInputs, Stay, Trip, ZoneSpan } from '../core/types.ts';
import { W } from '../core/wording/en.ts';

export type Pace = NonNullable<Trip['pace']>;

export type Settings = {
  theme: 'auto' | 'light' | 'dark'; units: 'metric' | 'imperial'; keepFresh: boolean; slashKey: boolean;
  startTime: string; nights: number | null /* null: the stage model's suggestion */; pace: Pace; flatKph: number; stay: Stay; campWaterL: number;
  /** The bike every tool starts with, as chosen in either app (sub-project 11); it only travels in an export, the live choice is src/ui/tools/bike-choice.ts. */
  toolBike: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto', units: 'metric', keepFresh: true, slashKey: true,
  startTime: '08:30', nights: null, pace: 'sporting', flatKph: 25, stay: 'camping', campWaterL: 2, toolBike: null,
};
export const DEFAULT_CAMP_WATER_L = DEFAULT_SETTINGS.campWaterL;

export const isIn = <T extends string>(value: unknown, list: readonly T[]): value is T => list.includes(value as T);
const PACES = ['steady', 'sporting', 'hard'] as const;
const STAYS = ['camping', 'mixed', 'accommodation'] as const;
const inRange = (x: unknown, lo: number, hi: number): boolean => typeof x === 'number' && x >= lo && x <= hi; // NaN fails

const goodStartTime = (x: unknown): boolean => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x) && x >= '04:00' && x <= '14:00';

export const goodFlatKph = (x: unknown): x is number => typeof x === 'number' && usableFlatKph(x);

/** A real calendar date: `2026-02-30` is none. */
export function goodDate(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

const CHECKS: { [K in keyof Settings]: (value: unknown) => string | null } = {
  theme: (x) => (isIn(x, ['auto', 'light', 'dark'] as const) ? null : W.appStoreThemeChoice),
  units: (x) => (isIn(x, ['metric', 'imperial'] as const) ? null : W.appStoreUnitsChoice),
  keepFresh: (x) => (typeof x === 'boolean' ? null : W.appStoreOnOrOff),
  slashKey: (x) => (typeof x === 'boolean' ? null : W.appStoreOnOrOff),
  startTime: (x) => (goodStartTime(x) ? null : W.appStoreStartTimeRange),
  nights: (x) => (x === null || (inRange(x, 0, 30) && Number.isInteger(x)) ? null : W.appStoreNightsRange),
  pace: (x) => (isIn(x, PACES) ? null : W.appStorePaceChoice),
  flatKph: (x) => (goodFlatKph(x) ? null : W.appStoreFlatKphRange),
  stay: (x) => (isIn(x, STAYS) ? null : W.appStoreStayChoice),
  campWaterL: (x) => (inRange(x, 0, 5) ? null : W.appStoreCampWaterRange),
  toolBike: (x) => (x === null || (typeof x === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x)) ? null : W.appStoreBikeChoice),
};

export const settingProblem = <K extends keyof Settings>(field: K, value: unknown): string | null => CHECKS[field](value);
export const isSetting = (field: string): field is keyof Settings => Object.hasOwn(CHECKS, field);

/** The fields of a stored record that are still good, over the defaults: a damaged field never spoils the others. */
export function goodSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return out;
  for (const field of Object.keys(CHECKS) as (keyof Settings)[]) {
    const value = (raw as Record<string, unknown>)[field];
    if (value !== undefined && settingProblem(field, value) === null) (out as Record<string, unknown>)[field] = value;
  }
  return out;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nullOr = (x: unknown, check: (v: unknown) => boolean): boolean => x === null || check(x);

/** Why a route can't be stored, or null. Every number a later reader divides by or compares is looked at. */
export function routeProblem(route: unknown): string | null {
  const r = route as Partial<Route> | null;
  const good = typeof r === 'object' && r !== null
    && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.hash === 'string'
    && (r.source === 'gpx' || r.source === 'planned')
    && finite(r.lengthKm) && r.lengthKm >= 0 && nullOr(r.ascentM, finite)
    && Array.isArray(r.points) && r.points.length >= 2
    && r.points.every((p) => typeof p === 'object' && p !== null && finite(p.lat) && finite(p.lon) && finite(p.km) && nullOr(p.ele, finite))
    && Array.isArray(r.stages) && r.stages.every((s) => typeof s === 'object' && s !== null && finite(s.startKm) && finite(s.endKm) && finite(s.day) && finite(s.ridingHours))
    && Array.isArray(r.climbs) && r.climbs.every((c) => typeof c === 'object' && c !== null && finite(c.startKm) && finite(c.topKm))
    && Array.isArray(r.sampleGrid) && r.sampleGrid.every(finite);
  return good ? null : W.appStoreRouteNotReadable;
}

/** Why a trip can't be stored, or null. */
export function tripProblem(trip: Trip): string | null {
  if (typeof trip !== 'object' || trip === null) return W.appStoreRouteNotReadable;
  return routeProblem(trip.route)
    ?? settingProblem('flatKph', trip.flatKph) ?? settingProblem('startTime', trip.startTime)
    ?? settingProblem('stay', trip.stay) ?? settingProblem('campWaterL', trip.campWaterL)
    ?? (trip.pace === undefined ? null : settingProblem('pace', trip.pace))
    ?? (trip.departureDate === null || goodDate(trip.departureDate) ? null : W.appStoreDepartureDate);
}

/**
 * A stored trip as it may be used. A newer build's record can lack a field, and a damaged field takes the rider's last
 * good setting or the default, so nothing unreadable reaches the screen. No readable route: no trip.
 */
export function usableTrip(raw: unknown, last: Settings): Trip | null {
  if (typeof raw !== 'object' || raw === null || routeProblem((raw as Trip).route) !== null) return null;
  const t = raw as Trip;
  const stay = settingProblem('stay', t.stay) === null ? t.stay : DEFAULT_SETTINGS.stay;
  const out: Trip = {
    ...t,
    departureDate: goodDate(t.departureDate) ? t.departureDate : null,
    startTime: settingProblem('startTime', t.startTime) === null ? t.startTime : last.startTime,
    flatKph: goodFlatKph(t.flatKph) ? t.flatKph : last.flatKph,
    stay,
    campWaterL: settingProblem('campWaterL', t.campWaterL) === null ? t.campWaterL : (stay === 'accommodation' ? 0 : last.campWaterL),
  };
  if (t.pace !== undefined && !isIn(t.pace, PACES)) delete out.pace;
  return out;
}

// ---- Stored records as they may be used. One damaged record never blocks a read: it counts as none, and the others stand. --

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const goodInstant = (x: unknown): x is Date => x instanceof Date && Number.isFinite(x.getTime());

export const readablePosition = (x: unknown): x is Position => isRecord(x) && goodInstant(x.at) && usablePosition(x as unknown as Position);

export function usableWater(raw: unknown): NonNullable<ScreenInputs['waterLeft']> | null {
  if (!isRecord(raw) || !goodInstant(raw.at) || !finite(raw.litres) || raw.litres < 0 || typeof raw.confirmed !== 'boolean') return null;
  return { litres: raw.litres, at: raw.at, confirmed: raw.confirmed };
}

const knownZones = new Map<string, boolean>();
function knownZone(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  let known = knownZones.get(name);
  if (known === undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: name });
      known = true;
    } catch {
      known = false;
    }
    knownZones.set(name, known);
  }
  return known;
}

const goodZone = (z: unknown): z is ZoneSpan => isRecord(z) && finite(z.fromKm) && (finite(z.toKm) || z.toKm === Infinity) && knownZone(z.timeZone)
  && typeof z.country === 'string' && (z.holidayZone === null || typeof z.holidayZone === 'string');

/** All or none: without one span the next would quietly become the zone of that stretch, or of the riding date. The route then reads as not prepared. */
export const usableZones = (raw: unknown): ZoneSpan[] => (Array.isArray(raw) && raw.every(goodZone) ? raw : []);

export const usableSavedKm = (raw: unknown): ScreenInputs['savedKm'] => (Array.isArray(raw)
  ? raw.filter((s): s is ScreenInputs['savedKm'][number] => isRecord(s) && finite(s.fromKm) && finite(s.toKm))
  : []);

export function usableHolidays(raw: unknown): ScreenInputs['holidays'] {
  if (!isRecord(raw)) return {};
  const good = Object.entries(raw).filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((d) => typeof d === 'string'));
  return Object.fromEntries(good);
}

export const goodDayStart = (x: unknown): x is DayStart => isRecord(x) && goodDate(x.day) && finite(x.km);

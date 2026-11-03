// What the co-pilot reads of the bag planner's storage (spec sections 4.4 and 7.1). Read-only: the app never writes a
// `loadcheck:*` key. A record it can't read, or of a major version it doesn't know, reads as none.
import { normaliseBike } from '../core/bike/normalise.ts';
import type { BikeRecord } from '../core/bike/normalise.ts';
import type { LoadSummary } from '../core/types.ts';

export type { BikeRecord };

const SUMMARY_KEY = 'loadcheck:summary:v1';
const BIKES_KEY = 'loadcheck:bikeProfiles';
const BIKE_KEY = 'loadcheck:bikeProfile';

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNumber = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);
const numberOrNull = (x: unknown): boolean => x === null || isNumber(x);

/** The parts of contract 1 the engines read: without them a figure would quietly turn into NaN. */
function fullSummaryReads(s: Record<string, unknown>): boolean {
  const { water, weight, bags, decks, kit } = s;
  if (!isObject(water) || !isObject(weight) || !isObject(bags) || !isObject(decks) || !isObject(kit)) return false;
  return Array.isArray(water.bottles) && isNumber(water.cageL) && isNumber(water.extraL) && isNumber(water.totalL)
    && isNumber(weight.kitKg) && isNumber(weight.cageWaterKg) && isNumber(weight.carriedKg) && numberOrNull(weight.bikeKg) && numberOrNull(weight.emptyLuggageKg)
    && isNumber(bags.count) && Array.isArray(bags.items) && isNumber(s.nights) && isNumber(s.month);
}

export function readLoadSummary(): LoadSummary | null {
  const s = readJson(SUMMARY_KEY);
  if (!isObject(s) || s.app !== 'load-check' || s.kind !== 'load-summary' || s.v !== 1) return null;
  if (s.empty === true) return s as unknown as LoadSummary;
  return fullSummaryReads(s) ? (s as unknown as LoadSummary) : null;
}

/** The bike of the current plan, every field of section 7.1 through the ported normaliser. */
export const readBike = (): BikeRecord | null => normaliseBike(readJson(BIKE_KEY));

/** The bike library. The co-pilot reads every format and ignores unknown fields (section 7.1); a bad row drops only itself. */
export function readBikes(): BikeRecord[] {
  const list = readJson(BIKES_KEY);
  return Array.isArray(list) ? list.map(normaliseBike).filter((b): b is BikeRecord => b !== null) : [];
}

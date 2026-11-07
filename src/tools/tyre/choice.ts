// Which bike the tyre tool opens on, and which bikes may be chosen. Only the tyre screen imports this, so it is in the tool's own chunk
// and the first screen does not carry it. Only bikes in the bag planner's saved list count: it keeps its current-bike record and the
// plan's bike id after a bike is removed ("Plans using it keep their own copy"), and a removed bike is never offered or preselected.
import { choiceAmong } from '../../ui/tools/bike-choice.ts';
import type { HostData, ReadOnlyStore } from './host.ts';

// Nothing is imported from host.ts at run time: its names would join the first screen's export list. A bike record is read by id only,
// as parseBike does (the same id rule).
const BIKES_KEY = 'loadcheck:bikeProfiles';
const CURRENT_BIKE_KEY = 'loadcheck:bikeProfile';
const idOf = (raw: unknown): string | null => (isObject(raw) && typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ? raw.id : null);
const SAVED_AT_KEY = 'loadcheck:saved-at:v1';
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const json = (kv: ReadOnlyStore, key: string): unknown => {
  try {
    const text = kv.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch { return undefined; }
};

/** The ids of the bikes in the bag planner's saved list, in its order. */
export function savedBikeIds(kv: ReadOnlyStore): string[] {
  const library = json(kv, BIKES_KEY);
  return Array.isArray(library) ? library.flatMap((b) => { const id = idOf(b); return id ? [id] : []; }) : [];
}

/**
 * The bike in use: the plan's, else the one the bag planner saved last (by its ledger of save times), else its current one, else the
 * last in its list; always one of `saved`. Null with no saved bike.
 */
export function bikeInUse(kv: ReadOnlyStore, host: HostData, saved: string[]): string | null {
  if (host.planBikeId && saved.includes(host.planBikeId)) return host.planBikeId;
  const ledger = json(kv, SAVED_AT_KEY);
  const items = isObject(ledger) && isObject(ledger.items) && isObject(ledger.items[BIKES_KEY]) ? ledger.items[BIKES_KEY] : {};
  let best: { id: string; at: number } | null = null;
  for (const id of saved) {
    const at = typeof items[id] === 'string' ? Date.parse(items[id]) : NaN;
    if (Number.isFinite(at) && (!best || at > best.at)) best = { id, at };
  }
  if (best) return best.id;
  const current = idOf(json(kv, CURRENT_BIKE_KEY));
  if (current && saved.includes(current)) return current;
  return saved[saved.length - 1] ?? null;
}

/**
 * The one chosen bike (sub-project 11): what the rider chose in either app, if that bike is still saved, else the bike in use. `picked` is
 * true when a record chose it, "No bike" (id null) included; "No bike" that only meant "no bike was saved" is never a pick. Also the bike
 * line in Tools, so both read it one way.
 */
export function toolBike(kv: ReadOnlyStore, host: HostData, saved: string[]): { id: string | null; picked: boolean } {
  const c = choiceAmong((k) => kv.getItem(k), saved);
  return c ? { id: c.id, picked: true } : { id: bikeInUse(kv, host, saved), picked: false };
}

// One chosen bike for every tool (sub-project 11), the twin of theme-choice.ts. Each app writes only its own record,
// {app, kind: 'bike-choice', v: 1, bikeId, at}: Wayfinch copilot:bikeChoice:v1 (the bike line, the tyre tool, an import that brings
// settings), the bag planner loadcheck:bikeChoice:v1. Both read both and use the newer; at the same moment Wayfinch's. A null bikeId is
// "No bike", and is a choice only when the rider picked it. Loaded after the first screen (the Tools and tyre chunks, You, and a
// ?bike= address), so the first screen does not carry it.
import { signal } from '@preact/signals';

export const BIKE_CHOICE_KEY = 'copilot:bikeChoice:v1';
export const PAGE_BIKE_CHOICE_KEY = 'loadcheck:bikeChoice:v1';
const ID = /^[a-zA-Z0-9_-]{1,100}$/;

export interface ChoiceStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
const local: ChoiceStore = {
  getItem: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** A bike-choice record of that app, checked: [when, which bike or null], or null when it is not one. */
export function choiceRecord(get: (key: string) => string | null, key: string, app: string): [number, string | null] | null {
  try {
    const v = JSON.parse(get(key)!);
    const at = typeof v.at === 'string' ? Date.parse(v.at) : NaN;
    const id = v.bikeId === null || (typeof v.bikeId === 'string' && ID.test(v.bikeId)) ? v.bikeId : undefined;
    return v.app === app && v.kind === 'bike-choice' && v.v === 1 && id !== undefined && !Number.isNaN(at) ? [at, id] : null;
  } catch {
    return null;
  }
}

/** The newer of the two apps' records, Wayfinch's at the same moment; null with neither. */
export function newerChoice(get: (key: string) => string | null): { bikeId: string | null } | null {
  const mine = choiceRecord(get, BIKE_CHOICE_KEY, 'copilot');
  const theirs = choiceRecord(get, PAGE_BIKE_CHOICE_KEY, 'load-check');
  const win = theirs && !(mine && mine[0] >= theirs[0]) ? theirs : mine;
  return win ? { bikeId: win[1] } : null;
}

/** Which app made the newer choice, by the same rule: 'load-check' when the bag planner's record wins, else 'copilot'; null with neither. */
export function choiceMadeIn(get: (key: string) => string | null): 'copilot' | 'load-check' | null {
  const mine = choiceRecord(get, BIKE_CHOICE_KEY, 'copilot');
  const theirs = choiceRecord(get, PAGE_BIKE_CHOICE_KEY, 'load-check');
  return theirs && !(mine && mine[0] >= theirs[0]) ? 'load-check' : mine ? 'copilot' : null;
}

/**
 * What the rider chose among the saved bikes: `{id}` for a saved bike or for No bike (null), null when no record chose anything usable
 * (none, or a bike no saved bike has). Only a saved bike counts, as in the tyre tool's rule: a removed bike is never chosen.
 */
export function choiceAmong(get: (key: string) => string | null, saved: readonly string[]): { id: string | null } | null {
  const c = newerChoice(get);
  return c && (c.bikeId === null || saved.includes(c.bikeId)) ? { id: c.bikeId } : null;
}

/** Bumped by every choice written here and by a change of either record in another window: what shows the choice reads it. */
export const choiceVersion = signal(0);

/** Wayfinch's record of a choice, stamped just after the bag planner's when that one is dated later (a clock set wrong). */
export function noteBikeChoice(bikeId: string | null, at: Date = new Date(), kv: ChoiceStore = local): void {
  if (bikeId !== null && !ID.test(bikeId)) return;
  const theirs = choiceRecord(kv.getItem.bind(kv), PAGE_BIKE_CHOICE_KEY, 'load-check');
  try {
    kv.setItem(BIKE_CHOICE_KEY, JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId, at: new Date(Math.max(at.getTime(), theirs ? theirs[0] + 1 : -Infinity)).toISOString() }));
  } catch {
    // Storage refused: the choice is not kept; the bag planner keeps its own.
  }
  choiceVersion.value += 1;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === BIKE_CHOICE_KEY || e.key === PAGE_BIKE_CHOICE_KEY) choiceVersion.value += 1;
  });
}

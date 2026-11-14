// Trip prep's ticks (design of 15 November 2026): one `copilot:*` key on this phone, for one route. Nothing stored, unreadable, the wrong
// shape or another route's reads as no ticks, so old data loads unchanged; Delete co-pilot data removes it with every copilot:* key.

export const PREP_TICKS_KEY = 'copilot:tripPrep:v1';

const ITEM_ID = /^[a-z0-9-]{1,40}$/;

/** This route's ticks, in the order they were made; none when there are none to read. */
export function readTicks(routeId: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PREP_TICKS_KEY) ?? 'null') as { route?: unknown; ticked?: unknown } | null;
    if (!raw || typeof raw !== 'object' || raw.route !== routeId || !Array.isArray(raw.ticked)) return [];
    return [...new Set(raw.ticked.filter((x): x is string => typeof x === 'string' && ITEM_ID.test(x)))];
  } catch {
    return [];
  }
}

/**
 * Ticks or unticks one item of this route, starting from what is stored (so ticks removed elsewhere do not come back with it). Another
 * route's list is replaced. Returns this route's ticks, or null when the browser refused to keep them.
 */
export function setTick(routeId: string, id: string, on: boolean): string[] | null {
  const now = readTicks(routeId);
  const ticked = on ? (now.includes(id) ? now : [...now, id]) : now.filter((x) => x !== id);
  try {
    localStorage.setItem(PREP_TICKS_KEY, JSON.stringify({ route: routeId, ticked }));
    return ticked;
  } catch {
    return null;
  }
}

// The one hours check (spec section 12.4). It reads prepared spans and imports no library. Every engine asks here,
// so unknown, may-be-open and possibly-closed hours can never pass as open (INV-05). Times are compared unrounded.
import type { HoursSpan, PlaceHours } from '../types';
import { W } from '../wording/en';

type StateNow = { state: HoursSpan['state']; reason?: string; until: Date | null };

const MIN = 60_000;
const OUTSIDE: StateNow = { state: 'unknown', reason: W.foodHoursUpdate, until: null };

/** The span holding instant `ms`, or null outside the spans. Spans are in order and do not overlap. */
function spanAt(spans: HoursSpan[], ms: number): HoursSpan | null {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = spans[mid]!;
    if (ms < s.from.getTime()) hi = mid - 1;
    else if (ms >= s.to.getTime()) lo = mid + 1;
    else return s;
  }
  return null;
}

/** The state of a place at instant `t`, and when that state ends (null: not known within the window). */
export function stateAt(h: PlaceHours | undefined, t: Date): StateNow {
  if (!h) return { state: 'unknown', reason: W.foodHoursUnknown, until: null };
  const ms = t.getTime();
  // Written so that an invalid date, whose comparisons are all false, lands outside.
  if (!(ms >= h.windowStart.getTime() && ms < h.windowEnd.getTime())) return { ...OUTSIDE };
  const s = spanAt(h.spans, ms);
  if (!s) return { ...OUTSIDE };
  const until = s.to.getTime() >= h.windowEnd.getTime() ? null : s.to;
  return s.reason === undefined ? { state: s.state, until } : { state: s.state, reason: s.reason, until };
}

/** True only if the place is 'open' for the whole of [from, to). An empty span asks about its one instant. */
export function openOver(h: PlaceHours | undefined, from: Date, to: Date): boolean {
  if (!h) return false;
  const start = from.getTime();
  const end = to.getTime();
  // Written so that an invalid date, whose comparisons are all false, fails.
  if (!(start <= end && start >= h.windowStart.getTime() && end <= h.windowEnd.getTime())) return false;
  if (start === end) return stateAt(h, from).state === 'open';
  for (let at = start; at < end;) {
    const s = spanAt(h.spans, at);
    if (s?.state !== 'open') return false;
    at = s.to.getTime();
  }
  return true;
}

const after = (t: Date, minutes: number): Date => new Date(t.getTime() + minutes * MIN);

/** Section 6.4: open at the arrival itself. */
export const openAtArrival = (h: PlaceHours | undefined, t: Date): boolean => stateAt(h, t).state === 'open';

/** Section 6.11: open from arrival until 30 minutes after, or 45 for a meal. */
export const openOnArrival = (h: PlaceHours | undefined, t: Date, forMeal = false): boolean => openOver(h, t, after(t, forMeal ? 45 : 30));

/** Section 6.0: open from 30 minutes before to 30 minutes after. */
export const openWaterWindow = (h: PlaceHours | undefined, t: Date): boolean => openOver(h, after(t, -30), after(t, 30));

/** Whether an ISO date is a public holiday in a holiday zone, from the prepared list. */
export const isPublicHoliday = (date: string, holidayZone: string | null, holidays: Record<string, string[]>): boolean =>
  holidayZone !== null && (holidays[holidayZone]?.includes(date) ?? false);

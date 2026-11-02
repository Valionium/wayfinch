// The one hours check (spec section 12.4). It reads prepared spans and imports no library. Every engine asks here,
// so unknown, may-be-open and possibly-closed hours can never pass as open (INV-05). Times are compared unrounded.
import type { HoursSpan, PlaceHours } from '../types';
import { W } from '../wording/en';

type StateNow = { state: HoursSpan['state']; reason?: string; until: Date | null };

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
  if (ms < h.windowStart.getTime() || ms >= h.windowEnd.getTime()) return { ...OUTSIDE };
  const s = spanAt(h.spans, ms);
  if (!s) return { ...OUTSIDE };
  const until = s.to.getTime() >= h.windowEnd.getTime() ? null : s.to;
  return s.reason === undefined ? { state: s.state, until } : { state: s.state, reason: s.reason, until };
}

// The opening-hours wrapper (spec section 6.4, plan Decision 8). The only file that imports the library, which is a
// lazy chunk used at preparation, never at the stop.
//
// `opening_hours` reads and returns the device-local fields of a Date and knows no zones. So all work here is on
// "naive" wall-clock numbers: milliseconds as Date.UTC would give for the place's wall clock.
// - In: a naive number becomes a Date whose device-local fields show that wall clock.
// - Out: the library's Dates are read back by their local fields, and the naive spans are laid onto true instants
//   stretch by stretch of the place's constant UTC offset. So an hour the place skips has no spans, and an hour it
//   repeats has them twice, exactly as a clock on its wall reads.
// - The device's own skipped hour can't be put to the library at all. It reads unknown (Decision 8). A time inside it
//   also comes back from the library one hour late, so the same length after it is read minute by minute with
//   getState, which goes by the fields of the Date and is not moved (found by trying it: see device-zones.test.ts).
import OpeningHours from 'opening_hours';
import { wallClock, zoneOffsetMin, type WallClock } from '../answers/time';
import type { HoursSpan } from '../types';
import { W } from '../wording/en';

export type WallTime = WallClock;
export type RuleClass = { kind: 'food-shop' | 'kiosk' | 'bakery' | 'fuel-shop' | 'other-shop' | 'other'; nearStation: boolean };
export type HolidayOverrides = Record<string, string[]>;
export type HoursPlace = { timeZone: string; hoursRegionKey: string | null; holidayZone: string | null; country: string };

type State = HoursSpan['state'];
type Seg = { from: number; to: number; state: State; reason?: string };

const MIN = 60_000;
const DAY = 86_400_000;

const naiveOf = (t: Date, tz: string): number => t.getTime() + zoneOffsetMin(t, tz) * MIN;
const offsetMs = (ms: number, tz: string): number => zoneOffsetMin(new Date(ms), tz) * MIN;

/** The true instant of a wall-clock time. A skipped time moves forward to the change; a repeated one is its first pass. */
export function wallToInstant(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const n = Date.UTC(y, mo - 1, d, h, mi);
  const a = offsetMs(n - DAY, tz);
  const b = offsetMs(n + DAY, tz);
  const candidates = [n - Math.max(a, b), n - Math.min(a, b)].filter((t) => naiveOf(new Date(t), tz) === n);
  if (candidates[0] !== undefined) return new Date(candidates[0]);
  let lo = n - Math.max(a, b);
  let hi = n - Math.min(a, b);
  while (hi - lo > MIN) {
    const mid = Math.floor((lo + hi) / 2 / MIN) * MIN;
    if (offsetMs(mid, tz) === a) lo = mid; else hi = mid;
  }
  return new Date(hi);
}

export const instantToWall = (t: Date, tz: string): WallTime => wallClock(t, tz);

// ---- The device's clock: the only place that reads device-local fields. ----

const toDevice = (n: number): Date => {
  const u = new Date(n);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
};
const fromDevice = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());

/** The wall-clock stretches the device's clock skips between two naive times. */
function deviceGaps(n0: number, n1: number): [number, number][] {
  const gaps: [number, number][] = [];
  for (let day = Math.floor(n0 / DAY) * DAY - DAY; day < n1; day += DAY) {
    if (toDevice(day).getTimezoneOffset() === toDevice(day + DAY).getTimezoneOffset()) continue;
    for (let n = day; n <= day + DAY; n += MIN) {
      if (fromDevice(toDevice(n)) === n) continue;
      let end = n;
      while (fromDevice(toDevice(end)) !== end) end += MIN;
      gaps.push([n, end]);
      n = end;
    }
  }
  return gaps;
}

// ---- The library ----

/** No clock time this wrapper can honour: sun times need a position it does not have, and the library guesses them. */
const NO_CLOCK = /\b(?:sunrise|sunset|dawn|dusk)\b|^\s*open\s*$/i;

const regionOf = (country: string, key: string | null) => ({
  lat: 0, lon: 0,
  address: { country_code: country.toLowerCase(), state: '', ...(key ? { 'ISO3166-2-lvl4': key } : {}) },
});

const stateOf = (o: OpeningHours, d: Date): State => (o.getUnknown(d) ? 'unknown' : o.getState(d) ? 'open' : 'closed');

/** Replaces [from, to) in ordered segments with the given ones. */
function overlay(segs: Seg[], from: number, to: number, inserted: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (s.to <= from || s.from >= to) { out.push(s); continue; }
    if (s.from < from) out.push({ ...s, to: from });
    if (s.to > to) out.push({ ...s, from: to });
  }
  return [...out, ...inserted].sort((a, b) => a.from - b.from);
}

/** The tag's segments between two naive times, closed included, or null when the library rejects it. */
function readTag(tag: string, region: ReturnType<typeof regionOf>, n0: number, n1: number): Seg[] | null {
  if (NO_CLOCK.test(tag)) return null;
  let o: OpeningHours;
  let intervals: [Date, Date, boolean, string | undefined][];
  try {
    o = new OpeningHours(tag, region);
    intervals = o.getOpenIntervals(toDevice(n0), toDevice(n1));
  } catch {
    return null;
  }
  let segs: Seg[] = [];
  let at = n0;
  for (const [from, to, unknown] of intervals) {
    const a = Math.max(fromDevice(from), n0);
    const b = Math.min(fromDevice(to), n1);
    if (a > at) segs.push({ from: at, to: a, state: 'closed' });
    if (b > a) segs.push({ from: a, to: b, state: unknown ? 'unknown' : 'open' });
    at = Math.max(at, b);
  }
  if (at < n1) segs.push({ from: at, to: n1, state: 'closed' });

  for (const [gapFrom, gapTo] of deviceGaps(n0, n1)) {
    const after = gapTo + (gapTo - gapFrom);
    const reread: Seg[] = [];
    for (let n = Math.max(gapTo, n0); n < Math.min(after, n1); n += MIN) {
      const state = stateOf(o, toDevice(n));
      const last = reread.at(-1);
      if (last?.state === state) last.to = n + MIN; else reread.push({ from: n, to: n + MIN, state });
    }
    if (reread.length) segs = overlay(segs, reread[0]!.from, reread.at(-1)!.to, reread);
    const a = Math.max(gapFrom, n0);
    const b = Math.min(gapTo, n1);
    if (b > a) segs = overlay(segs, a, b, [{ from: a, to: b, state: 'unknown', reason: W.foodHoursUnknown }]);
  }
  return segs;
}

// ---- Onto true instants ----

/** The stretches of constant UTC offset of `tz` between two instants. */
function offsetStretches(t0: number, t1: number, tz: string): { from: number; to: number; offset: number }[] {
  const out: { from: number; to: number; offset: number }[] = [];
  let from = t0;
  let offset = offsetMs(t0, tz);
  for (let probe = t0 + DAY; ; probe += DAY) {
    const at = Math.min(probe, t1);
    if (offsetMs(at, tz) !== offset) {
      // Zones change on a whole minute, so the search steps by minutes.
      let lo = Math.ceil((at - DAY) / MIN) * MIN;
      let hi = Math.ceil(at / MIN) * MIN;
      while (hi - lo > MIN) {
        const mid = Math.floor((lo + hi) / 2 / MIN) * MIN;
        if (offsetMs(mid, tz) === offset) lo = mid; else hi = mid;
      }
      const change = hi;
      out.push({ from, to: change, offset });
      from = change;
      offset = offsetMs(change, tz);
    }
    if (at >= t1) break;
  }
  out.push({ from, to: t1, offset });
  return out;
}

function toSpans(segs: Seg[], t0: number, t1: number, tz: string): HoursSpan[] {
  const spans: HoursSpan[] = [];
  for (const stretch of offsetStretches(t0, t1, tz)) {
    for (const s of segs) {
      const from = Math.max(s.from - stretch.offset, stretch.from);
      const to = Math.min(s.to - stretch.offset, stretch.to);
      if (to <= from) continue;
      const last = spans.at(-1);
      if (last && last.state === s.state && last.reason === s.reason && last.to.getTime() === from) last.to = new Date(to);
      else spans.push({ from: new Date(from), to: new Date(to), state: s.state, ...(s.reason === undefined ? {} : { reason: s.reason }) });
    }
  }
  return spans;
}

/**
 * The hour spans of one place over a window. They cover the window in order. Results are kept in `cache` by what the
 * rules read (spec section 4.5), and by the window, so a recomputed window is never served an older one.
 */
export function placeSpans(tag: string | null, place: HoursPlace, rule: RuleClass, windowStart: Date, windowEnd: Date,
  _extraHolidays: HolidayOverrides, cache?: Map<string, HoursSpan[]>): HoursSpan[] {
  const key = cache && JSON.stringify([tag, place.holidayZone, place.hoursRegionKey, place.country, place.timeZone, rule.kind, rule.nearStation,
    windowStart.getTime(), windowEnd.getTime()]);
  const kept = key === undefined ? undefined : cache?.get(key);
  if (kept) return kept;

  const t0 = windowStart.getTime();
  const t1 = windowEnd.getTime();
  const n0 = naiveOf(windowStart, place.timeZone);
  const n1 = naiveOf(windowEnd, place.timeZone);
  const whole: Seg[] = [{ from: n0, to: n1, state: 'unknown', reason: W.foodHoursUnknown }];
  const segs = (tag === null ? null : readTag(tag, regionOf(place.country, place.hoursRegionKey), n0, n1)) ?? whole;
  const spans = toSpans(segs, t0, t1, place.timeZone);
  if (key !== undefined) cache?.set(key, spans);
  return spans;
}

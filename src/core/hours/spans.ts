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
// - The library finds the day a time over midnight began on by going 24 hours back. On the night after the device's skipped
//   hour that lands two days back, for as long as the gap: found by the simulator. A tag of weekdays and times alone reads
//   the same a week later, where the library is right. Any other tag with a time over midnight reads unknown then.
import OpeningHours from 'opening_hours';
import { wallClock, zoneOffsetMin, type WallClock } from '../answers/time';
import type { HoursSpan } from '../types';
import { W } from '../wording/en';
import { applyRules, holidayEdits, mentionsPh, saysWhen, selectsHoliday, zoneParts, type RuleClass, type Seg } from './rules';

export type { RuleClass };
export type WallTime = WallClock;
export type HolidayOverrides = Record<string, string[]>;
export type HoursPlace = { timeZone: string; hoursRegionKey: string | null; holidayZone: string | null; country: string };

type State = HoursSpan['state'];

const MIN = 60_000;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

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

/** Sun times need a position this wrapper does not have, and the library guesses them. */
const SUN_TIMES = /\b(?:sunrise|sunset|dawn|dusk)\b/i;

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

/** The tag as the library reads it, or null when it rejects it or when any rule gives no time this wrapper can honour. */
function parseTag(tag: string, region: ReturnType<typeof regionOf>): OpeningHours | null {
  if (SUN_TIMES.test(tag)) return null;
  try {
    const o = new OpeningHours(tag, region);
    // The library's own form of each rule, so 9-17 and 09.00-17.00 count as the clock times they are.
    for (let i = 0; ; i++) {
      const rule = o.prettifyValue({ rule_index: i });
      if (!rule) return i === 0 ? null : o;
      if (!saysWhen(rule)) return null;
    }
  } catch {
    return null;
  }
}

const minutesOf = (hours: string, minutes: string): number => Number(hours) * 60 + Number(minutes);

/** Whether any rule holds a time over midnight: an end at or before its start, past 24:00, or an open end. */
function runsOverMidnight(text: string): boolean {
  if (/\d\+/.test(text)) return true;
  return [...text.matchAll(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/g)].some(([, h0, m0, h1, m1]) => {
    const end = minutesOf(h1!, m1!);
    return end > 24 * 60 || end <= minutesOf(h0!, m0!);
  });
}

/**
 * Rules of plain weekdays and times, which read the same a week later. Listed this way round, so that any selector not
 * named here (Su[1], week 13, Mar, PH, easter, +1 days, a comment) counts as looking at the calendar.
 */
const WEEKDAYS_AND_TIMES = /^(?:\b(?:Mo|Tu|We|Th|Fr|Sa|Su|off|closed|open)\b|\d{1,2}:\d{2}\+?|24\/7|[-,;\s]|\|\|)*$/;

/** The tag's segments between two naive times, closed included, or null when the library rejects it. */
function readTag(o: OpeningHours, n0: number, n1: number): Seg[] | null {
  let intervals: [Date, Date, boolean, string | undefined][];
  try {
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

  const pretty = o.prettifyValue();
  const overMidnight = runsOverMidnight(pretty);
  const calendar = !WEEKDAYS_AND_TIMES.test(pretty);
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
    if (!overMidnight) continue;
    const midnight = Math.floor(gapFrom / DAY) * DAY + DAY;
    const nextNight: Seg[] = [];
    for (let n = Math.max(midnight, n0); n < Math.min(midnight + (gapTo - gapFrom), n1); n += MIN) {
      const state: State = calendar ? 'unknown' : stateOf(o, toDevice(n + WEEK));
      const last = nextNight.at(-1);
      if (last?.state === state) last.to = n + MIN;
      else nextNight.push({ from: n, to: n + MIN, state, ...(state === 'unknown' ? { reason: W.foodHoursUnknown } : {}) });
    }
    if (nextNight.length) segs = overlay(segs, nextNight[0]!.from, nextNight.at(-1)!.to, nextNight);
  }
  return segs;
}

/** What this phone can't read stays unknown, whatever a place's rules make of an unknown stretch. */
function stillUnknown(segs: Seg[], o: OpeningHours, n0: number, n1: number): Seg[] {
  const pretty = o.prettifyValue();
  const nightToo = runsOverMidnight(pretty) && !WEEKDAYS_AND_TIMES.test(pretty);
  let out = segs;
  const blank = (from: number, to: number): void => {
    const a = Math.max(from, n0);
    const b = Math.min(to, n1);
    if (b > a) out = overlay(out, a, b, [{ from: a, to: b, state: 'unknown', reason: W.foodHoursUnknown }]);
  };
  for (const [gapFrom, gapTo] of deviceGaps(n0, n1)) {
    blank(gapFrom, gapTo);
    const midnight = Math.floor(gapFrom / DAY) * DAY + DAY;
    if (nightToo) blank(midnight, midnight + (gapTo - gapFrom));
  }
  return out;
}

// ---- Holidays ----

const yearHolidays = new Map<string, string[]>();

/** The library's public holidays for a region and year. Asked at noon, which no clock change skips. */
function libraryHolidays(country: string, key: string | null, year: number): string[] {
  const id = `${country}|${key ?? ''}|${year}`;
  let dates = yearHolidays.get(id);
  if (dates) return dates;
  dates = [];
  try {
    const o = new OpeningHours('PH', regionOf(country, key));
    for (let n = Date.UTC(year, 0, 1, 12); new Date(n).getUTCFullYear() === year; n += DAY) {
      if (o.getState(toDevice(n))) dates.push(new Date(n).toISOString().slice(0, 10));
    }
  } catch {
    dates = [];   // a country the library has no holidays for
  }
  yearHolidays.set(id, dates);
  return dates;
}

/** A holiday zone's public holidays for a year, with the overrides of section 6.4. */
export function zoneHolidayDates(zone: string, year: number): string[] {
  const { country, key } = zoneParts(zone);
  const { added, removed } = holidayEdits(zone, year);
  return [...new Set([...libraryHolidays(country, key, year), ...added])].filter((d) => !removed.includes(d)).sort();
}

const yearsBetween = (n0: number, n1: number): number[] => {
  const years: number[] = [];
  for (let y = new Date(n0).getUTCFullYear(); y <= new Date(n1).getUTCFullYear(); y++) years.push(y);
  return years;
};

/** Days the library wrongly calls holidays in this zone are read again as the country alone, where a PH rule can't fire. */
function withoutRemovedHolidays(segs: Seg[], tag: string, place: HoursPlace, zone: string, n0: number, n1: number): Seg[] {
  let out = segs;
  for (const year of yearsBetween(n0, n1)) {
    for (const date of holidayEdits(zone, year).removed) {
      const from = Math.max(Date.parse(`${date}T00:00:00Z`), n0);
      const to = Math.min(Date.parse(`${date}T00:00:00Z`) + DAY, n1);
      if (to <= from) continue;
      const country = parseTag(tag, regionOf(place.country, null));
      const day = (country && readTag(country, from, to)) ?? [{ from, to, state: 'unknown' as const, reason: W.foodHoursUnknown }];
      out = overlay(out, from, to, day);
    }
  }
  return out;
}

/** Marks the open stretches of holidays that a PH rule decides. The library says which rule decides each minute. */
function markPhRules(o: OpeningHours, segs: Seg[], holidays: Set<string>): Seg[] {
  const selects = new Map<number, boolean>();
  const decidedByPh = (d: Date): boolean => {
    const i = o.getMatchingRule(d);
    if (i === undefined) return false;
    let yes = selects.get(i);
    if (yes === undefined) {
      yes = selectsHoliday(o.prettifyValue({ rule_index: i }));
      selects.set(i, yes);
    }
    return yes;
  };
  const out: Seg[] = [];
  for (const s of segs) {
    if (s.state !== 'open') { out.push(s); continue; }
    for (let from = s.from; from < s.to;) {
      const dayEnd = Math.floor(from / DAY) * DAY + DAY;
      const to = Math.min(dayEnd, s.to);
      if (!holidays.has(new Date(from).toISOString().slice(0, 10))) {
        out.push({ ...s, from, to });
      } else {
        for (let n = from; n < to; n += MIN) {
          const phRule = decidedByPh(toDevice(n));
          const last = out.at(-1);
          if (last && last.to === n && last.state === 'open' && last.phRule === phRule) last.to = Math.min(n + MIN, to);
          else out.push({ from: n, to: Math.min(n + MIN, to), state: 'open', phRule });
        }
      }
      from = to;
    }
  }
  return out;
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
  extraHolidays: HolidayOverrides, cache?: Map<string, HoursSpan[]>): HoursSpan[] {
  const zone = place.holidayZone ?? place.hoursRegionKey ?? place.country;
  const extra = Object.hasOwn(extraHolidays, zone) ? extraHolidays[zone]! : [];
  const key = cache && JSON.stringify([tag, place.holidayZone, place.hoursRegionKey, place.country, place.timeZone, rule.kind, rule.nearStation,
    windowStart.getTime(), windowEnd.getTime(), extra]);
  const kept = key === undefined ? undefined : cache?.get(key);
  if (kept) return kept;

  const t0 = windowStart.getTime();
  const t1 = windowEnd.getTime();
  const n0 = naiveOf(windowStart, place.timeZone);
  const n1 = naiveOf(windowEnd, place.timeZone);
  const whole: Seg[] = [{ from: n0, to: n1, state: 'unknown', reason: W.foodHoursUnknown }];
  const parsed = tag === null ? null : parseTag(tag, regionOf(place.country, place.hoursRegionKey));
  const read = parsed && readTag(parsed, n0, n1);
  const ph = read !== null && mentionsPh(tag!);
  let segs = read && ph ? withoutRemovedHolidays(read, tag!, place, zone, n0, n1) : read ?? whole;
  const needsHolidays = rule.kind !== 'other' && (place.country === 'DE' || place.country === 'AT');
  const years = needsHolidays ? yearsBetween(n0, n1) : [];
  const holidays = new Set([...years.flatMap((y) => zoneHolidayDates(zone, y)), ...extra]);
  if (parsed && read && ph && needsHolidays) segs = markPhRules(parsed, segs, holidays);
  const ruled = applyRules(segs, {
    country: place.country, zone, rule, tagged: read !== null,
    holidays,
    unseenHolidays: new Set([...years.flatMap((y) => holidayEdits(zone, y).added), ...extra]),
  });
  const spans = toSpans(parsed && read ? stillUnknown(ruled, parsed, n0, n1) : ruled, t0, t1, place.timeZone);
  if (key !== undefined) cache?.set(key, spans);
  return spans;
}

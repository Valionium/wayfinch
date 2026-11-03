// The one time formatter (spec section 12.4, INV-20). Every time shown to the rider goes through here, always with
// the place's own zone: nothing reads the device zone. Comparisons elsewhere use unrounded times.

const MIN = 60_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

const zonesKnown = new Map<string, boolean>();
/** Whether the time-zone data know this name. Formatting with an unknown one throws. */
export function isKnownZone(tz: string): boolean {
  let known = zonesKnown.get(tz);
  if (known === undefined) {
    try {
      formatterFor(tz);
      known = true;
    } catch {
      known = false;
    }
    zonesKnown.set(tz, known);
  }
  return known;
}

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The zone's own formatter, asked directly: the source of truth for every wall clock below. */
function formattedWall(t: Date, tz: string): WallClock {
  const w: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(t)) if (p.type !== 'literal') w[p.type] = Number(p.value);
  return { year: w['year']!, month: w['month']!, day: w['day']!, hour: w['hour']!, minute: w['minute']!, second: w['second']! };
}

// Zones change their offset only on a quarter hour, so every instant of a quarter hour has the offset of its first second. One
// screen asks for thousands of wall clocks (PERF-SCREEN); the zone's formatter is asked once per quarter hour and zone, the rest is
// arithmetic. A bounded number of offsets is kept.
const QUARTER_MS = 15 * 60_000;
const OFFSETS = new Map<string, number>();
const OFFSETS_MAX = 8192;

function quarterOffsetMin(ms: number, tz: string): number {
  const quarter = Math.floor(ms / QUARTER_MS) * QUARTER_MS;
  const key = `${tz}|${quarter}`;
  const kept = OFFSETS.get(key);
  if (kept !== undefined) return kept;
  const w = formattedWall(new Date(quarter), tz);
  const out = Math.round((Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - quarter) / MIN);
  if (OFFSETS.size >= OFFSETS_MAX) OFFSETS.clear();
  OFFSETS.set(key, out);
  return out;
}

/** The wall-clock fields of instant `t` in zone `tz`. */
export function wallClock(t: Date, tz: string): WallClock {
  const ms = t.getTime();
  // A date that is no date goes to the formatter, which says so as it always has.
  if (!Number.isFinite(ms)) return formattedWall(t, tz);
  const d = new Date(Math.floor(ms / 1000) * 1000 + quarterOffsetMin(ms, tz) * MIN);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
}

/** The zone's offset from UTC at instant `t`, in minutes, east positive. */
export function zoneOffsetMin(t: Date, tz: string): number {
  const ms = t.getTime();
  if (!Number.isFinite(ms)) {
    const w = formattedWall(t, tz);
    return Math.round((Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000) / MIN);
  }
  return quarterOffsetMin(ms, tz);
}

/** The ISO date (YYYY-MM-DD) of instant `t` in zone `tz`. */
export function localIsoDate(t: Date, tz: string): string {
  const w = wallClock(t, tz);
  return `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** "HH:MM" of instant `t` in zone `tz`, not rounded. */
export function formatHm(t: Date, tz: string): string {
  const w = wallClock(t, tz);
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}

/** The instant of wall-clock time `hm` ("HH:MM") on ISO date `date` in zone `tz`. Zone data decide, not the device. */
export function instantAt(date: string, hm: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hm.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - zoneOffsetMin(new Date(wall), tz) * MIN;
  return new Date(wall - zoneOffsetMin(new Date(first), tz) * MIN);
}

/** The ISO date `n` days after `date`. */
export function addDaysIso(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

type Rounding = 'nearest' | 'down' | 'up';

/** Rounds `t` to a multiple of `stepMin` minutes of the zone's own clock, also where its offset is not a whole hour. */
function roundLocal(t: Date, tz: string, stepMin: number, how: Rounding): Date {
  const off = zoneOffsetMin(t, tz) * MIN;
  const step = stepMin * MIN;
  const q = (t.getTime() + off) / step;
  const n = how === 'down' ? Math.floor(q) : how === 'up' ? Math.ceil(q) : Math.floor(q + 0.5);
  return new Date(n * step - off);
}

const about = (t: Date, tz: string): string => `about ${formatHm(t, tz)}`;

/** "about 14:40": the nearest 5 minutes, half up. */
export const formatAbout = (t: Date, tz: string): string => about(roundLocal(t, tz, 5, 'nearest'), tz);
/** The same nearest 5 minutes, as plain "14:40". */
export const formatNearestHm = (t: Date, tz: string): string => formatHm(roundLocal(t, tz, 5, 'nearest'), tz);
/** Leave-by is rounded down to 5 minutes, so the shown time is never later than the real limit. */
export const formatLeaveBy = (t: Date, tz: string): string => about(roundLocal(t, tz, 5, 'down'), tz);
/** The instant leave-by shows: rounded down to 5 minutes of the zone's own clock. */
export const roundedLeaveBy = (t: Date, tz: string): Date => roundLocal(t, tz, 5, 'down');
/** A rain onset is rounded down to :00 or :30. */
export const formatRainOnset = (t: Date, tz: string): string => about(roundLocal(t, tz, 30, 'down'), tz);
/** A rain end is rounded up to :00 or :30. */
export const formatRainEnd = (t: Date, tz: string): string => about(roundLocal(t, tz, 30, 'up'), tz);

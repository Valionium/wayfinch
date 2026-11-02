// Rain windows along the route, rain here now and rain at the start (spec section 6.6). Every hour is read through
// `gridOf`, which drops what cannot be read and puts the rest in order, so no broken first item decides anything.
import { formatRainEnd, formatRainOnset } from '../answers/index.ts';
import { formatHm, localIsoDate, wallClock } from '../answers/time.ts';
import { haversineKm } from '../geo/haversine.ts';
import type { DayRide, GridHour, Km, Position, RainWindow, StoredForecast, ZoneLookup } from '../types.ts';
import { W } from '../wording/en.ts';
import { adjusted, isFarOff } from './locate.ts';
import type { Schedule } from './pace.ts';
import { detailFor, fifteenMinuteHours, hourClass, type HourClass } from './weather-classes.ts';

const HOUR = 3_600_000;
const MIN = 60_000;
const STEP_15 = 15 * MIN;
const STEP_MM = 0.1;
const QUIET_MS = 2 * HOUR;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

// ---- the grid as it can be read ------------------------------------------------------------------------------------

export type GridPoint = { km: Km; lat: number; lon: number; hours: GridHour[]; rain15: { at: Date; mm: number }[] };

const grids = new WeakMap<StoredForecast, GridPoint[]>();

/** The readable grid points in route order, their readable hours in time order. Empty for a forecast with no fetch time. */
export function gridOf(f: StoredForecast): GridPoint[] {
  let grid = grids.get(f);
  if (!grid) {
    grid = !validDate(f.fetchedAt) ? [] : f.grid
      .filter((g) => Number.isFinite(g.km))
      .map((g) => ({
        km: g.km, lat: g.lat, lon: g.lon,
        hours: g.hours.filter((h) => validDate(h.at)).sort((a, b) => a.at.getTime() - b.at.getTime()),
        rain15: (f.has15 ? g.rain15 ?? [] : []).filter((s) => validDate(s.at)).sort((a, b) => a.at.getTime() - b.at.getTime()),
      }))
      .filter((g) => g.hours.length > 0)
      .sort((a, b) => a.km - b.km);
    grids.set(f, grid);
  }
  return grid;
}

/** The hour holding instant `t`: the stamp at most an hour after it. Null where the forecast has none. */
export function hourAt(hours: GridHour[], t: Date): GridHour | null {
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return null;
  let lo = 0;
  let hi = hours.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const stamp = hours[mid]!.at.getTime();
    if (ms >= stamp) lo = mid + 1;
    else if (ms < stamp - HOUR) hi = mid - 1;
    else return hours[mid]!;
  }
  return null;
}

/** The hours touching [from, to]. The band is closed: at exactly one hour a storm still counts, the careful side. */
export const hoursTouching = (hours: GridHour[], from: number, to: number): GridHour[] =>
  hours.filter((h) => h.at.getTime() >= from && h.at.getTime() - HOUR <= to);

const nearestByKm = (grid: GridPoint[], km: Km): GridPoint | null => {
  let best: GridPoint | null = null;
  for (const g of grid) if (!best || Math.abs(g.km - km) < Math.abs(best.km - km)) best = g;
  return best;
};

/** The stored grid point nearest a kilometre of the route. */
export const pointNearKm = (f: StoredForecast, km: Km): GridPoint | null => nearestByKm(gridOf(f), km);

/** The stored grid point nearest a position on the ground. A tie goes to the one nearer on the route. */
export function pointNearPosition(f: StoredForecast, p: Position): GridPoint | null {
  let best: GridPoint | null = null;
  let bestKm = Infinity;
  for (const g of gridOf(f)) {
    const d = haversineKm(p, g);
    if (!(d < Infinity)) continue;
    if (d < bestKm || (d === bestKm && best && Math.abs(g.km - p.km) < Math.abs(best.km - p.km))) {
      best = g;
      bestKm = d;
    }
  }
  return best;
}

// ---- the points of a ride ------------------------------------------------------------------------------------------

export type RidePoint = { km: Km; g: GridPoint; t: Date };

/**
 * The grid points the rider will pass, in route order, with the arrival at each. When the nearest point to the start lies
 * just behind it, that point stands for the start ("from here"), so a rain here is a window here.
 */
export function ridePoints(f: StoredForecast, schedule: Schedule): RidePoint[] {
  const grid = gridOf(f);
  const start = schedule.startKm;
  const nearest = nearestByKm(grid, start);
  const out: RidePoint[] = [];
  if (nearest && nearest.km < start) out.push({ km: start, g: nearest, t: schedule.atKm(start) });
  for (const g of grid) if (g.km >= start) out.push({ km: g.km, g, t: schedule.atKm(g.km) });
  return out;
}

/** The day's stop and the later days' stops. */
export function dayStopsOf(schedule: Schedule, lengthKm: Km): Km[] {
  const stops: Km[] = [];
  let km = schedule.rideOf(schedule.startKm).stopKm;
  while (Number.isFinite(km)) {
    stops.push(km);
    if (km >= lengthKm) break;
    const next = schedule.rideOf(km + 1e-6).stopKm;
    if (!(next > km)) break;
    km = next;
  }
  return stops;
}

// ---- windows -------------------------------------------------------------------------------------------------------

type Met = RidePoint & { rain: GridHour[]; band: GridHour[] };
type Run = { met: Met[]; bridged: boolean };

const classOf = (hours: GridHour[], pick: (c: HourClass) => boolean): GridHour[] => hours.filter((h) => pick(hourClass(h)));
const isLikelyOrStorm = (c: HourClass): boolean => c.cls === 'likely' || c.thunder;
const isPossible = (c: HourClass): boolean => c.cls === 'possible' && !c.thunder;

/** Consecutive met points of one ride. One unmet point between met points is bridged; a ride's stop ends the run. */
function runsOf(points: (Met | { km: Km; unmet: true })[], stops: Km[]): Run[] {
  const rideOfKm = (km: Km): number => stops.filter((s) => s < km).length;
  const runs: Run[] = [];
  let run: Run | null = null;
  let gap = 0;
  let runRide = -1;
  for (const p of points) {
    const ride = rideOfKm(p.km);
    if (run && ride !== runRide) run = null;
    if ('unmet' in p) {
      gap++;
      if (gap > 1) run = null;
      continue;
    }
    if (!run) {
      run = { met: [], bridged: false };
      runs.push(run);
      runRide = ride;
    } else if (gap === 1) run.bridged = true;
    run.met.push(p);
    gap = 0;
  }
  return runs;
}

/** Where the 15-minute steps of a point narrow its rain to, inside the hours it was found in. Hour boundaries otherwise. */
function periodOf(m: Met, f: StoredForecast, zoneAt: ZoneLookup): { from: number; to: number } {
  const from = Math.min(...m.rain.map((h) => h.at.getTime() - HOUR));
  const to = Math.max(...m.rain.map((h) => h.at.getTime()));
  const limitH = fifteenMinuteHours(zoneAt(m.g.km).country, m.g.lon);
  const limit = f.fetchedAt.getTime() + limitH * HOUR;
  // Each step holds the 15 minutes before its stamp. A 15-minute value stands only inside the model's reach.
  const steps = m.g.rain15.filter((s) => s.mm >= STEP_MM && s.at.getTime() > from && s.at.getTime() <= to);
  if (limitH === 0 || steps.length === 0) return { from, to };
  const first = steps[0]!.at.getTime();
  return { from: first <= limit ? first - STEP_15 : from, to: to <= limit ? steps[steps.length - 1]!.at.getTime() : to };
}

/** Whether the two hours after `end` are known to be unlikely at every met point. */
function quietAfter(end: number, met: Met[], rainHours: Set<GridHour>): boolean {
  return met.every((m) => {
    const hours = m.g.hours;
    for (let t = end; t < end + QUIET_MS; t += HOUR) if (!hourAt(hours, new Date(t))) return false;
    return hours.every((h) => {
      const stamp = h.at.getTime();
      if (rainHours.has(h) || stamp <= end || stamp - HOUR >= end + QUIET_MS) return true;
      const c = hourClass(h);
      return c.known && c.cls === 'unlikely' && !c.thunder;
    });
  });
}

function windowOf(run: Run, cls: 'likely' | 'possible', f: StoredForecast, zoneAt: ZoneLookup): RainWindow {
  const { met } = run;
  const rain = met.flatMap((m) => m.rain);
  const inBand = met.flatMap((m) => m.band);
  const classes = rain.map(hourClass);
  const thunderKms = met.filter((m) => classOf(m.rain, (c) => c.thunder).length > 0).map((m) => m.km);
  const kind = thunderKms.length > 0 ? 'thunder' : classes.some((c) => c.showers) ? 'showers' : 'rain';
  const periods = met.map((m) => periodOf(m, f, zoneAt));
  const from = Math.min(...periods.map((p) => p.from));
  const to = Math.max(...periods.map((p) => p.to));
  const hoursFrom = Math.min(...rain.map((h) => h.at.getTime() - HOUR));
  const hoursTo = Math.max(...rain.map((h) => h.at.getTime()));
  const chances = rain.map((h) => h.pp).filter((pp): pp is number => typeof pp === 'number' && pp >= 0 && pp <= 100);
  const amounts = inBand.map((h) => h.mm).filter((mm) => mm >= 0 && mm < Infinity);
  const reachAt = met[0]!.t;
  const detail = detailFor(new Date(Math.max(reachAt.getTime(), hoursTo)), f.fetchedAt);
  return {
    kind, cls, fromKm: met[0]!.km, toKm: met[met.length - 1]!.km, reachAt,
    onset: kind === 'rain' ? new Date(from) : null,
    end: kind !== 'thunder' && quietAfter(to, met, new Set(rain)) ? new Date(to) : null,
    chancePct: chances.length > 0 ? Math.max(...chances) : null,
    maxMm: amounts.length > 0 ? Math.max(...amounts) : 0,
    heavy: inBand.some((h) => hourClass(h).heavy),
    detail: detail === 'seasonal' ? 'trend' : detail,
    metKms: met.map((m) => m.km), thunderKms, onAndOff: run.bridged, hoursFrom: new Date(hoursFrom), hoursTo: new Date(hoursTo),
  };
}

/** Every window along the whole route, likely and possible, in route order. */
export function rainWindows(f: StoredForecast, schedule: Schedule, dayStops: Km[], zoneAt: ZoneLookup): RainWindow[] {
  const read = ridePoints(f, schedule).map((p) => {
    const ms = p.t.getTime();
    const band = Number.isFinite(ms) ? hoursTouching(p.g.hours, ms - HOUR, ms + HOUR) : [];
    return { ...p, band, likely: classOf(band, isLikelyOrStorm), possible: classOf(band, isPossible) };
  });
  const select = (hoursOf: (p: (typeof read)[number]) => GridHour[]): (Met | { km: Km; unmet: true })[] =>
    read.map((p) => (hoursOf(p).length > 0 ? { km: p.km, g: p.g, t: p.t, band: p.band, rain: hoursOf(p) } : { km: p.km, unmet: true as const }));
  const stops = [...dayStops].sort((a, b) => a - b);
  const likely = runsOf(select((p) => p.likely), stops).map((r) => windowOf(r, 'likely', f, zoneAt));
  const possible = runsOf(select((p) => (p.likely.length > 0 ? [] : p.possible)), stops).map((r) => windowOf(r, 'possible', f, zoneAt));
  return [...likely, ...possible].sort((a, b) => a.fromKm - b.fromKm || Number(a.cls === 'possible') - Number(b.cls === 'possible'));
}

/** The windows of the day's ride: those whose first met point lies at or before the day's stop. */
export const onTheRide = (windows: RainWindow[], ride: DayRide): RainWindow[] => windows.filter((w) => w.fromKm <= ride.stopKm);

/** Whether a window's first met point is reached within 48 hours of the forecast: only those get a plan. */
export const within48h = (w: RainWindow, f: StoredForecast): boolean => w.reachAt.getTime() - f.fetchedAt.getTime() <= 48 * HOUR;

// ---- here and at the start -----------------------------------------------------------------------------------------

/**
 * The current hour at the stored point nearest the position, whatever its class: read `hourClass` for that. Null when it
 * is not known. It never comes from a request containing the position.
 */
export function rainHereNow(f: StoredForecast | null, position: Position | null, now: Date): GridHour | null {
  if (!f || !position) return null;
  const g = pointNearPosition(f, position);
  return g && hourAt(g.hours, now);
}

/** Whether a ride starts at this position, and not at a stop or at day 1's start somewhere else. */
const startsAt = (ride: DayRide, p: Position): boolean => !isFarOff(p) && adjusted(p).aheadFromKm === ride.startKm;

/**
 * Rain likely in the hour of the ride's departure, at the point nearest its start. With `position`, a ride that starts
 * there reads the same point as rain here now, so the two agree. An unknown hour is no rain at the start; the Weather card
 * says what it doesn't know.
 */
export function rainAtStart(f: StoredForecast | null, ride: DayRide, position: Position | null = null): boolean {
  if (!f) return false;
  const g = position && startsAt(ride, position) ? pointNearPosition(f, position) : pointNearKm(f, ride.startKm);
  const hour = g && hourAt(g.hours, ride.departure);
  return hour ? hourClass(hour).cls === 'likely' : false;
}

// ---- what a window says --------------------------------------------------------------------------------------------

const KM_STEP = 5;

/** A window's kilometres as shown: rounded outward to 5 km, held to the route. */
export const shownKm = (w: RainWindow, lengthKm: Km): [Km, Km] => [
  Math.max(0, Math.floor(w.fromKm / KM_STEP) * KM_STEP),
  Math.min(lengthKm, Math.ceil(w.toKm / KM_STEP) * KM_STEP),
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The day of the week of an instant, on the zone's clock. */
export const weekdayOf = (t: Date, tz: string): string => WEEKDAYS[new Date(`${localIsoDate(t, tz)}T00:00:00Z`).getUTCDay()]!;

const dayPartOf = (t: Date, tz: string): string => {
  const { hour } = wallClock(t, tz);
  if (hour < 6) return W.rainPartNight;
  if (hour < 12) return W.rainPartMorning;
  return hour < 18 ? W.rainPartAfternoon : W.rainPartEvening;
};

/** A window's time, to the detail its range allows. An area gives whole hours and no onset. */
export function windowWhen(w: RainWindow, tz: string): string {
  const area = w.kind === 'rain' ? '' : `. ${W.weatherCantForecastExact}`;
  const start = w.onset ?? w.hoursFrom;
  if (w.detail === 'trend') return `${weekdayOf(start, tz)}${area}`;
  if (w.detail === 'daypart') return `${W.rainDayPart(weekdayOf(start, tz), dayPartOf(start, tz))}${area}`;
  if (w.kind !== 'rain') return `${W.rainHours(formatHm(w.hoursFrom, tz), formatHm(w.hoursTo, tz))}${area}`;
  const parts = [W.rainFrom(formatRainOnset(w.onset!, tz))];
  if (w.onAndOff) parts.push(W.rainOnAndOff);
  if (w.end) parts.push(W.rainDryAgain(formatRainEnd(w.end, tz)));
  return parts.join(', ');
}

/** The chance as a reference class, rounded to tens. Empty when no hour gives a chance. */
export const chanceLine = (w: RainWindow): string => (w.chancePct === null ? '' : W.rainChance(Math.round(w.chancePct / 10)));

/** The largest hourly amount, labelled. */
export const amountLine = (w: RainWindow): string =>
  (w.maxMm < 0.1 ? W.rainUnderAmount : W.rainAmount((Math.round(w.maxMm * 10) / 10).toFixed(1)));

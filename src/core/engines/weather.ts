// The Weather card (spec sections 6.6, 3.2 and 8): status, title, what it shows and its basis. Windows and plans come in
// as arguments, so the screen computes each once. Whatever the forecast does not cover is named, never read as calm.
import { formatAbout, formatRainEnd, makeAnswer } from '../answers/index.ts';
import { addDaysIso, formatHm, instantAt, isKnownZone, localIsoDate, wallClock } from '../answers/time.ts';
import { bearingDeg } from '../geo/bearing.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import type { Answer, AnswerItem, Baseline, Cover, DayRide, GridHour, Km, Missing, Position, RainPlan, RainWindow, RoutePoint, ScreenInputs, Status, StoredForecast } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { usablePosition } from './locate.ts';
import { usableFlatKph, type Schedule } from './pace.ts';
import { noteFor, zoneLookupOf } from './tripday.ts';
import { detailFor, hourClass, modelsForRoute } from './weather-classes.ts';
import { amountLine, chanceLine, dayStopsOf, gridOf, hourAt, hoursTouching, onTheRide, pointNearKm, pointNearPosition, rainWindows, ridePoints, routeForecast, shownKm, weekdayOf, windowWhen, type RidePoint } from './weather-windows.ts';

export type WeatherFacts = Pick<ScreenInputs, 'forecast' | 'baseline' | 'trip' | 'now' | 'routeZones'> & { ride: DayRide; schedule: Schedule; position: Position | null };

export type WeatherReason =
  | { kind: 'thunder'; window: RainWindow }
  | { kind: 'night-thunder'; km: Km; from: Date; to: Date; hail: boolean }
  | { kind: 'heavy'; window: RainWindow }
  | { kind: 'gusts'; km: Km; at: Date; kmh: number }
  | { kind: 'low'; km: Km; lowC: number };

/** Wait or go's result (Task 18). */
export type WaitOrGo = { where: 'here' | Cover; d: Date | null; savedMin: number; arrivalNow: Date; arrivalWait: Date | null; lines: string[] };

export type NightLow = {
  lowC: number | null; thunderHours: { from: Date; to: Date } | null;
  known: boolean; // the forecast covers the whole night, with real figures
  seasonal: boolean; // the low comes from the baseline, in whole or in part
  km: Km; hail: boolean;
};

const HOUR = 3_600_000;
const STALE_MS = 12 * HOUR;
const GUST_LIMIT_MS = 60 / 3.6;
const MS_TO_KMH = 3.6;
const GRID_STEP_KM = 15.01; // the grid is at most 15 km apart: wider means points are missing
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());
const later = (a: Date, b: Date): Date => (a.getTime() > b.getTime() ? a : b);

/** Over 12 hours old. No fetch time or no clock can't read as fresh. */
const AHEAD_MS = 3_600_000; // a fetch time this far past the clock: one of the two is wrong, and the age is not known
export const isStale = (f: StoredForecast, now: Date): boolean => {
  const age = now.getTime() - f.fetchedAt.getTime();
  return !(age <= STALE_MS && age >= -AHEAD_MS);
};

/** The headwind component; negative means a tailwind. */
export const headwind = (speed: number, fromDeg: number, routeBearingDeg: number): number =>
  speed * Math.cos(((fromDeg - routeBearingDeg) * Math.PI) / 180);

const zoneAt = (f: WeatherFacts, km: Km): string => {
  const tz = zoneLookupOf(f.routeZones)(km).timeZone;
  return isKnownZone(tz) ? tz : 'UTC';
};
const dated = (f: WeatherFacts): boolean => f.trip.departureDate !== null;
const usableInputs = (f: WeatherFacts): boolean => usableFlatKph(f.trip.flatKph) && validDate(f.now) && validDate(f.ride.departure);
/** A forecast there is something to read in. */
const held = (f: WeatherFacts): StoredForecast | null => {
  const forecast = f.forecast && routeForecast(f.forecast, f.trip.route);
  return forecast && gridOf(forecast).length > 0 ? forecast : null;
};

/** Every window along the route, or none when a ride can't be matched to the forecast: no date, no clock, no speed. */
export function weatherWindows(f: Pick<WeatherFacts, 'forecast' | 'trip' | 'now' | 'routeZones' | 'ride' | 'schedule'> & Partial<WeatherFacts>): RainWindow[] {
  if (!f.forecast || f.trip.departureDate === null || !usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !validDate(f.ride.departure)) return [];
  return rainWindows(routeForecast(f.forecast, f.trip.route), f.schedule, dayStopsOf(f.schedule, f.trip.route.lengthKm), zoneLookupOf(f.routeZones));
}

const onRide = (f: WeatherFacts): RidePoint[] => {
  const forecast = held(f);
  return forecast ? ridePoints(forecast, f.schedule).filter((p) => p.km <= f.ride.stopKm) : [];
};

const gustKnown = (h: GridHour): boolean => h.gustMs >= 0 && h.gustMs < Infinity;

/** Whether the forecast sees the whole band of T plus or minus 1 h. Hours from before it began, and before its fetch, hide nothing ahead. */
function bandSeen(p: RidePoint, fetchedAt: Date): boolean {
  const T = p.t.getTime();
  const began = p.g.hours[0]!.at.getTime() - HOUR;
  for (const t of [T - HOUR, T, T + HOUR]) {
    if (t < began && t < fetchedAt.getTime()) continue;
    const hour = hourAt(p.g.hours, new Date(t));
    if (!hour || !hourClass(hour).known) return false;
  }
  return true;
}

/** The first kilometre of the day's ride the forecast says nothing about; null when it covers the whole ride. */
function firstGap(f: WeatherFacts): Km | null {
  const start = f.ride.startKm;
  const points = onRide(f);
  if (points.length === 0) return start;
  let previous = start;
  for (const p of points) {
    if (p.km - previous > GRID_STEP_KM || Math.abs(p.g.km - p.km) > GRID_STEP_KM) return previous;
    const hour = hourAt(p.g.hours, p.t);
    if (!hour || !gustKnown(hour) || !bandSeen(p, f.forecast!.fetchedAt)) return p.km;
    previous = p.km;
  }
  return f.ride.stopKm - previous > GRID_STEP_KM ? previous : null;
}

// ---- the seasonal baseline -----------------------------------------------------------------------------------------

function seasonalPoint(baseline: Baseline | null, km: Km, at: Date, tz: string): Baseline['points'][number] | null {
  if (!baseline || !validDate(at)) return null;
  const month = wallClock(at, tz).month;
  let best: Baseline['points'][number] | null = null;
  for (const p of baseline.points) {
    if (p.month !== month || ![p.km, p.p10LowC, p.meanLowC, p.meanHighC, p.rainDays].every(Number.isFinite)) continue;
    if (!best || Math.abs(p.km - km) < Math.abs(best.km - km)) best = p;
  }
  return best;
}

// ---- the night -----------------------------------------------------------------------------------------------------

/** From the arrival at tonight's stop (after the day's ride: now) to the next departure. Before the trip, day 1's night. */
function nightSpan(f: WeatherFacts, ride: DayRide): { km: Km; from: Date; to: Date } {
  const km = ride.tonightKm ?? ride.stopKm;
  const here = ride.phase === 'after-ride' || ride.phase === 'route-end' || ride.noRide;
  const from = here ? f.now : f.schedule.atKm(km);
  if (ride.phase === 'after-ride' && !ride.noRide) return { km, from, to: ride.departure };
  const date = here ? ride.date : f.schedule.rideOf(km).date;
  return { km, from, to: later(from, instantAt(addDaysIso(date, 1), f.trip.startTime, zoneAt(f, km))) };
}

/** The night's low (raw) and thunderstorm hours at the grid point nearest tonight's stop. */
export function nightLow(f: WeatherFacts, ride: DayRide, baseline: Baseline | null): NightLow {
  const { km, from, to } = nightSpan(f, ride);
  const none: NightLow = { lowC: null, thunderHours: null, known: false, seasonal: false, km, hail: false };
  const seasonal = validDate(from) ? seasonalPoint(baseline, km, from, zoneAt(f, km)) : null;
  const forecast = held(f);
  const g = forecast && validDate(from) && validDate(to) ? pointNearKm(forecast, km) : null;
  if (!g || Math.abs(g.km - km) > GRID_STEP_KM) return seasonal ? { ...none, lowC: seasonal.p10LowC, seasonal: true } : none;

  const ms0 = from.getTime();
  const ms1 = to.getTime();
  const storms = hoursTouching(g.hours, ms0, ms1).filter((h) => hourClass(h).thunder);
  const inNight = g.hours.filter((h) => h.at.getTime() >= ms0 && h.at.getTime() <= ms1);
  const temps = inNight.map((h) => h.t).filter(Number.isFinite);
  let known = temps.length === inNight.length;
  for (let t = ms0; t < ms1 && known; t += HOUR) {
    const hour = hourAt(g.hours, new Date(t));
    known = hour !== null && Number.isFinite(hour.code);
  }
  // Part of the night unseen: the baseline's low stands beside what was seen, the careful side.
  const seen = temps.length > 0 ? Math.min(...temps) : null;
  const useSeasonal = !known && seasonal !== null;
  const lowC = useSeasonal ? Math.min(seen ?? Infinity, seasonal.p10LowC) : seen;
  return {
    lowC, known, seasonal: useSeasonal, km,
    thunderHours: storms.length === 0 ? null : {
      from: new Date(Math.min(...storms.map((h) => h.at.getTime() - HOUR))), to: new Date(Math.max(...storms.map((h) => h.at.getTime()))),
    },
    hail: storms.some((h) => h.code === 96 || h.code === 99),
  };
}

const outdoorStay = (f: WeatherFacts): boolean => f.trip.stay === 'camping' || f.trip.stay === 'mixed';

// ---- the status ----------------------------------------------------------------------------------------------------

/** The status and its reasons, in the title's order. */
export function weatherStatus(f: WeatherFacts, windows: RainWindow[]): { status: Status; reasons: WeatherReason[] } {
  if (!dated(f) || !usableInputs(f)) return { status: 'unknown', reasons: [] };
  const today = onTheRide(windows.filter((w) => w.cls === 'likely'), f.ride);
  const night = nightLow(f, f.ride, f.baseline);
  const reasons: WeatherReason[] = [];

  for (const w of today) if (w.thunderKms.length > 0) reasons.push({ kind: 'thunder', window: w });
  if (outdoorStay(f) && night.thunderHours) reasons.push({ kind: 'night-thunder', km: night.km, ...night.thunderHours, hail: night.hail });
  const warning = reasons.length > 0;

  for (const w of today) if (w.heavy) reasons.push({ kind: 'heavy', window: w });
  let gust: { km: Km; at: Date; kmh: number; ms: number } | null = null;
  for (const p of onRide(f)) {
    const hour = hourAt(p.g.hours, p.t);
    if (hour && gustKnown(hour) && hour.gustMs >= GUST_LIMIT_MS && (!gust || hour.gustMs > gust.ms)) {
      gust = { km: p.km, at: p.t, kmh: Math.round(hour.gustMs * MS_TO_KMH), ms: hour.gustMs };
    }
  }
  if (gust) reasons.push({ kind: 'gusts', km: gust.km, at: gust.at, kmh: gust.kmh });
  if (outdoorStay(f) && night.lowC !== null && night.lowC <= 0) reasons.push({ kind: 'low', km: night.km, lowC: night.lowC });

  if (warning) return { status: 'warning', reasons };
  if (reasons.length > 0) return { status: 'action', reasons };
  const nightUnseen = outdoorStay(f) && !night.known;
  return { status: firstGap(f) !== null || nightUnseen ? 'unknown' : 'fine', reasons };
}

// ---- wording -------------------------------------------------------------------------------------------------------

/** A fetch time: its clock time today, with its day on any other day, so that yesterday's 07:10 can't read as this morning's. */
export function fetchedLabel(fetched: Date, now: Date, tz: string): string {
  const sameDay = validDate(now) && localIsoDate(fetched, tz) === localIsoDate(now, tz);
  return sameDay ? formatHm(fetched, tz) : W.timeDayAt(shortDay(fetched, tz), formatHm(fetched, tz));
}

const shortDay = (t: Date, tz: string): string => {
  const w = wallClock(t, tz);
  return W.timeShortDay(weekdayOf(t, tz), w.day, W.timeMonth(w.month - 1));
};
const degrees = (c: number): string => String(Math.round(c) + 0);

const kmRange = (w: RainWindow, lengthKm: Km): string => {
  const [a, b] = shownKm(w, lengthKm);
  return W.rainKm(a, b);
};

/** A moment on the ride, to the detail the forecast's range allows. */
function timeText(f: WeatherFacts, t: Date, tz: string): string {
  const detail = f.forecast ? detailFor(t, f.forecast.fetchedAt) : 'seasonal';
  return detail === '30min' ? formatAbout(t, tz) : weekdayOf(t, tz);
}

function windowLabel(w: RainWindow, f: WeatherFacts): string {
  const km = kmRange(w, f.trip.route.lengthKm);
  const when = windowWhen(w, zoneAt(f, w.fromKm));
  if (w.kind === 'thunder') return W.weatherThunder(km, when);
  if (w.cls === 'possible') return w.kind === 'showers' ? W.rainShowersPossible(km, when) : W.rainPossible(km, when);
  return w.kind === 'showers' ? W.rainShowersLikely(km, when) : W.rainLikely(when);
}

function windowStamp(w: RainWindow): Answer['stamp'] {
  return w.detail === '30min' ? { km: w.fromKm, at: w.reachAt } : { km: w.fromKm };
}

/** "+17 km · 14:40" or "here · 14:20". */
export function stampLine(stamp: Answer['stamp'], startKm: Km, tz: string): string | null {
  if (!stamp) return null;
  const at = stamp.at && validDate(stamp.at) ? stamp.at : null;
  if (stamp.km === undefined) return at ? W.weatherStampHere(formatHm(at, tz)) : null;
  const where = W.weatherStampAhead(showKm(stamp.km - startKm));
  return at ? `${where} · ${formatAbout(at, tz).replace('about ', '')}` : where;
}

const rideName = (ride: DayRide): string => {
  if (ride.phase === 'before-trip') return W.weatherRideDayOne;
  if (ride.phase === 'after-ride' && !ride.noRide) return W.weatherRideTomorrow;
  return ride.phase === 'route-end' || ride.noRide ? W.weatherRideRest : W.weatherRideToday;
};

/** When the rain here eases: the end of the likely hours from now. Null when the next hours can't tell, or lie too far off. */
function easesAt(hours: GridHour[], current: GridHour, fetchedAt: Date): Date | null {
  let t = current.at;
  for (;;) {
    const next = hourAt(hours, t);
    if (!next || !hourClass(next).known) return null;
    if (hourClass(next).cls !== 'likely') return detailFor(t, fetchedAt) === '30min' ? t : null;
    t = next.at;
  }
}

type Here = { title: string; line: string | null };

/** "Rain likely here", never before the trip. */
function rainHereTitle(f: WeatherFacts): Here | null {
  const forecast = held(f);
  const p = f.position;
  if (!forecast || !p || f.ride.phase === 'before-trip' || !usablePosition(p)) return null;
  const g = pointNearPosition(forecast, p);
  const hour = g && hourAt(g.hours, f.now);
  if (!g || !hour || hourClass(hour).cls !== 'likely') return null;
  const tz = zoneAt(f, p.km);
  const until = easesAt(g.hours, hour, forecast.fetchedAt);
  const n = Math.round((hour.pp as number) / 10);
  return { title: until ? W.weatherRainHereUntil(formatRainEnd(until, tz)) : W.weatherRainHere, line: detailFor(f.now, forecast.fetchedAt) === '30min' ? W.weatherScenariosShowRain(n, formatRainEnd(f.now, tz).replace('about ', '')) : null };
}

function nightStormTitle(f: WeatherFacts, r: WeatherReason & { kind: 'night-thunder' }): string {
  const tz = zoneAt(f, r.km);
  const hours = f.forecast && detailFor(r.to, f.forecast.fetchedAt) === '30min' ? W.rainHours(formatHm(r.from, tz), formatHm(r.to, tz)) : null;
  const when = f.ride.phase === 'before-trip' ? W.weatherOnTheNightOf(shortDay(r.from, tz)) : W.weatherTonight;
  return W.weatherThunderNight(showKm(r.km), when, hours);
}

function seasonalLine(f: WeatherFacts, gap: Km): string | null {
  const tz = zoneAt(f, gap);
  const p = seasonalPoint(f.baseline, gap, f.ride.departure, tz);
  if (!p) return null;
  const from = gap > f.ride.startKm ? W.weatherSeasonalFromKm(showKm(gap)) : '';
  return W.weatherSeasonalTitle(from, degrees(p.meanHighC), degrees(p.meanLowC), String(Math.round(p.rainDays)));
}

function gapTitle(f: WeatherFacts, gap: Km): string {
  return seasonalLine(f, gap) ?? (gap > f.ride.startKm ? W.weatherNoForecastFrom(showKm(gap)) : W.weatherNoForecastFor(rideName(f.ride)));
}

// ---- the card ------------------------------------------------------------------------------------------------------

function windowItem(w: RainWindow, f: WeatherFacts, plan: RainPlan | undefined): AnswerItem {
  const parts = [kmRange(w, f.trip.route.lengthKm), chanceLine(w), amountLine(w)];
  if (w.hail) parts.push(W.weatherHail);
  if (w.kind === 'thunder') parts.push(W.weatherNoLightningProtection);
  if (plan) {
    for (const line of plan.listLines) parts.push(line);
    parts.push(plan.firstCoverLine ?? '', plan.none ?? '', plan.behind ?? '');
  }
  return {
    label: windowLabel(w, f), stamp: windowStamp(w),
    status: w.kind === 'thunder' && w.cls === 'likely' ? 'warning' : w.heavy && w.cls === 'likely' ? 'action' : 'fine',
    detail: parts.filter(Boolean).join(' · '),
  };
}

function windItem(f: WeatherFacts): AnswerItem | null {
  const hours = onRide(f).flatMap((p) => {
    const hour = hourAt(p.g.hours, p.t);
    return hour ? [{ p, hour }] : [];
  });
  const route = f.trip.route;
  const heads = hours.flatMap(({ p, hour }) => {
    const a = pointAtRouteKm(route, p.km);
    const b = pointAtRouteKm(route, p.km + 0.5);
    const same = a.lat === b.lat && a.lon === b.lon;
    const bearing = same ? bearingDeg(pointAtRouteKm(route, p.km - 0.5), a) : bearingDeg(a, b);
    const h = headwind(hour.windMs, hour.windFrom, bearing);
    return Number.isFinite(h) ? [h] : [];
  });
  if (heads.length === 0) return null;
  const mean = heads.reduce((s, h) => s + h, 0) / heads.length;
  const size = String(Math.round(Math.abs(mean)));
  const wind = size === '0' ? W.weatherWindAcross : mean > 0 ? W.weatherHeadwind(size) : W.weatherTailwind(size);
  const gusts = hours.map(({ hour }) => hour.gustMs).filter((g) => g >= 0 && g < Infinity);
  const temps = hours.map(({ hour }) => hour.t).filter(Number.isFinite);
  return {
    label: gusts.length > 0 ? `${wind} · ${W.weatherGustsUpTo(String(Math.round(Math.max(...gusts) * MS_TO_KMH)))}` : wind,
    stamp: null, status: 'fine', detail: temps.length > 0 ? W.weatherTemps(degrees(Math.min(...temps)), degrees(Math.max(...temps))) : '',
  };
}

function nightItem(f: WeatherFacts, night: NightLow): AnswerItem {
  const label = night.lowC === null ? W.weatherLowUnknown(showKm(night.km)) : W.weatherLow(degrees(night.lowC), showKm(night.km));
  const parts: string[] = [];
  if (night.seasonal) parts.push(W.waterBasisSeasonal);
  if (outdoorStay(f) && night.thunderHours) {
    const tz = zoneAt(f, night.km);
    const within = f.forecast && detailFor(night.thunderHours.to, f.forecast.fetchedAt) === '30min';
    parts.push(W.weatherThunderNight(showKm(night.km), f.ride.phase === 'before-trip' ? W.weatherOnTheNightOf(shortDay(night.thunderHours.from, tz)) : W.weatherTonight, within ? W.rainHours(formatHm(night.thunderHours.from, tz), formatHm(night.thunderHours.to, tz)) : null));
    if (night.hail) parts.push(W.weatherHail);
  }
  const status: Status = outdoorStay(f) && night.thunderHours ? 'warning' : outdoorStay(f) && night.lowC !== null && night.lowC <= 0 ? 'action' : 'fine';
  return { label, stamp: { km: night.km }, status, detail: parts.join(' · ') };
}

function basisOf(f: WeatherFacts, usesBaseline: boolean): string[] {
  const basis: string[] = [];
  const forecast = held(f);
  if (forecast) {
    const tz = zoneAt(f, f.ride.startKm);
    const fetched = forecast.fetchedAt;
    const route = f.trip.route;
    const zone = zoneLookupOf(f.routeZones);
    const models = new Set(modelsForRoute(route.points, (p) => zone((p as RoutePoint).km).country));
    const latest = new Map<string, number>();
    for (const r of forecast.runs) {
      if (!models.has(r.model) || !validDate(r.run)) continue;
      latest.set(r.model, Math.max(latest.get(r.model) ?? -Infinity, r.run.getTime()));
    }
    const run = latest.size > 0 ? formatHm(new Date(Math.min(...latest.values())), tz) : null;
    basis.push(W.weatherBasis(fetchedLabel(fetched, f.now, tz), run));
    // Never more than the stored hours hold: a short forecast says so.
    const lastHour = Math.max(...forecast.grid.flatMap((g) => g.hours.map((h) => h.at.getTime()).filter(Number.isFinite)), fetched.getTime());
    const half = new Date(Math.min(fetched.getTime() + 48 * HOUR, lastHour));
    const parts = new Date(Math.min(fetched.getTime() + 120 * HOUR, lastHour));
    basis.push(W.weatherDetailRange(W.timeWeekdayAt(weekdayOf(half, tz), formatHm(half, tz)), weekdayOf(parts, tz)));
    if (isStale(forecast, f.now)) basis.push(W.weatherStale);
  }
  if (usesBaseline && f.baseline) basis.push(W.weatherSeasonalBasis(f.baseline.years));
  if (forecast || usesBaseline) basis.push(W.weatherAttribution);
  else basis.push(W.weatherNothingSaved);
  basis.push(W.weatherNoOfficialWarnings);
  return basis;
}

function freshnessOf(f: WeatherFacts): Answer['freshness'] {
  const forecast = f.forecast && validDate(f.forecast.fetchedAt) ? f.forecast : null;
  return {
    dataDates: forecast ? { weather: forecast.fetchedAt.toISOString() } : {},
    stale: forecast !== null && isStale(forecast, f.now),
  };
}

export function weatherAnswer(f: WeatherFacts, windows: RainWindow[], plans: RainPlan[], waitOrGo: WaitOrGo | null): Answer {
  const anyWeather = held(f) !== null || seasonalPoint(f.baseline, f.ride.startKm, validDate(f.ride.departure) ? f.ride.departure : f.now, zoneAt(f, f.ride.startKm)) !== null;
  const simple = (title: string, missing: Missing[]): Answer => makeAnswer({
    topic: 'weather', status: 'unknown', title, stamp: null, detail: '', items: [], basis: basisOf({ ...f, position: null }, false), freshness: freshnessOf(f), missing,
  });
  if (!usableInputs(f)) return simple(W.weatherCantWorkOut, anyWeather ? [] : ['weather']);
  if (!dated(f)) return simple(W.weatherSetDate, anyWeather ? ['date'] : ['date', 'weather']);
  if (!anyWeather) return simple(W.weatherUnknown, ['weather']);

  const { status, reasons } = weatherStatus(f, windows);
  const gap = firstGap(f);
  const night = nightLow(f, f.ride, f.baseline);
  const today = onTheRide(windows, f.ride);
  const likely = today.filter((w) => w.cls === 'likely');
  const possible = today.filter((w) => w.cls === 'possible');
  const here = rainHereTitle(f);

  // The title: the first that applies (section 3.2).
  let title: string;
  let stamp: Answer['stamp'] = null;
  const thunder = reasons.find((r) => r.kind === 'thunder');
  const nightStorm = reasons.find((r) => r.kind === 'night-thunder');
  const heavy = reasons.find((r) => r.kind === 'heavy');
  const gusts = reasons.find((r) => r.kind === 'gusts');
  const low = reasons.find((r) => r.kind === 'low');
  if (thunder?.kind === 'thunder') {
    title = windowLabel(thunder.window, f);
    stamp = windowStamp(thunder.window);
  } else if (nightStorm?.kind === 'night-thunder') {
    title = nightStormTitle(f, nightStorm);
    stamp = { km: nightStorm.km };
  } else if (here) {
    title = here.title;
    stamp = { at: f.now };
  } else if (heavy?.kind === 'heavy') {
    title = W.rainHeavy(kmRange(heavy.window, f.trip.route.lengthKm), windowWhen(heavy.window, zoneAt(f, heavy.window.fromKm)));
    stamp = windowStamp(heavy.window);
  } else if (gusts?.kind === 'gusts') {
    title = W.weatherGustsTitle(String(gusts.kmh), showKm(gusts.km), timeText(f, gusts.at, zoneAt(f, gusts.km)));
    stamp = f.forecast && detailFor(gusts.at, f.forecast.fetchedAt) === '30min' ? { km: gusts.km, at: gusts.at } : { km: gusts.km };
  } else if (low?.kind === 'low') {
    title = W.weatherLow(degrees(low.lowC), showKm(low.km));
    stamp = { km: low.km };
  } else if (likely[0]) {
    title = windowLabel(likely[0], f);
    stamp = windowStamp(likely[0]);
  } else if (gap !== null) {
    title = gapTitle(f, gap);
  } else if (possible[0]) {
    title = windowLabel(possible[0], f);
  } else {
    const temps = onRide(f).flatMap((p) => {
      const h = hourAt(p.g.hours, p.t);
      return h && Number.isFinite(h.t) ? [h.t] : [];
    });
    title = W.weatherSummary(rideName(f.ride), temps.length > 0 ? W.weatherTemps(degrees(Math.min(...temps)), degrees(Math.max(...temps))) : '');
  }

  const items: AnswerItem[] = [];
  for (const line of waitOrGo?.lines ?? []) items.push({ label: line, stamp: null, status: 'fine' });
  for (const w of likely) items.push(windowItem(w, f, plans.find((p) => p.window.fromKm === w.fromKm && p.window.toKm === w.toKm)));
  for (const w of possible) items.push(windowItem(w, f, undefined));
  if (gap !== null) items.push({ label: gapTitle(f, gap), stamp: { km: gap }, status: 'unknown' });
  const wind = windItem(f);
  if (wind) items.push(wind);
  items.push(nightItem(f, night));
  items.push({ label: W.weatherRainingAnyway, stamp: null, status: 'fine' });

  const needsWeather = (gap !== null && seasonalPoint(f.baseline, gap, f.ride.departure, zoneAt(f, gap)) === null)
    || (outdoorStay(f) && !night.known && !night.seasonal);
  const missing = new Set<Missing>(plans.flatMap((p) => p.missing));
  if (needsWeather) missing.add('weather');

  const note = noteFor(f.ride);
  const detail = [here?.line ?? '', note ?? ''].filter(Boolean).join(' ');
  return makeAnswer({
    topic: 'weather', status, title, stamp, detail, items, basis: basisOf(f, gap !== null || night.seasonal),
    freshness: freshnessOf(f), missing: [...missing],
  });
}

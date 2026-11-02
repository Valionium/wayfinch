// Wait or go (spec section 6.6): could waiting save riding in likely rain, and at what cost in time and daylight. It tries
// at most seven departures. Always an option, never an instruction. What the forecast can't tell is said, never read as
// "it won't help".
import { formatAbout, formatHm, formatLeaveBy } from '../answers/index.ts';
import { isKnownZone, zoneOffsetMin } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import type { Cover, Km, RainPlan, RainWindow, RouteMatch, ScreenInputs, StoredForecast } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { arrivalStatus } from './daylight.ts';
import { sunReadable, type LeaveBy, type Via } from './leaveby.ts';
import { usablePosition } from './locate.ts';
import { BREAKS, usableFlatKph, type Schedule } from './pace.ts';
import { ridingDate, zoneLookupOf } from './tripday.ts';
import { hourClass } from './weather-classes.ts';
import { hourAt, hoursTouching, onTheRide, pointNearKm, gridOf, rainAtStart, ridePoints, routeForecast } from './weather-windows.ts';
import { isStale, type WaitOrGo, type WeatherFacts } from './weather.ts';

/** `sun` goes beyond the plan's WeatherFacts: the cost is judged in daylight. */
export type WaitFacts = WeatherFacts & Pick<ScreenInputs, 'sun'>;

const MIN = 60_000;
const HOUR = 3_600_000;
const TRIES_AFTER_MIN = 180;
const STEP_MIN = 30;
const SHOWN_WITHIN_MIN = 120;
const SAVE_AT_LEAST_MIN = 30;
const SLACK_MIN = 1e-6; // "exactly 2 h" and "exactly half" must not fall to rounding
const CUT_KM = 2;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

type Stamped = { km: Km; t: number };

/** Clock minutes in likely hours along a path of the rider, each stretch read at its nearest grid point. NaN where an hour isn't known. */
function clockInRain(forecast: StoredForecast, path: Stamped[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (!(b.t >= a.t)) return Number.NaN;
    if (b.t === a.t) continue;
    const g = pointNearKm(forecast, (a.km + b.km) / 2);
    if (!g) return Number.NaN;
    for (let t = a.t; t < b.t;) {
      const hour = hourAt(g.hours, new Date(t));
      if (!hour || !hourClass(hour).known) return Number.NaN;
      const end = Math.min(hour.at.getTime(), b.t);
      if (hourClass(hour).cls === 'likely') sum += end - t;
      t = end;
    }
  }
  return sum / MIN;
}

/** Where a stretch of the path is cut: every 2 km, and half way between grid points, where the nearest one changes. */
function cutsOf(forecast: StoredForecast, from: Km, to: Km): Km[] {
  const cuts = new Set<Km>([from, to]);
  for (let k = from + CUT_KM; k < to; k += CUT_KM) cuts.add(k);
  const grid = gridOf(forecast);
  for (let i = 0; i + 1 < grid.length; i++) {
    const mid = (grid[i]!.km + grid[i + 1]!.km) / 2;
    if (mid > from && mid < to) cuts.add(mid);
  }
  return [...cuts].sort((a, b) => a - b);
}

function pathOn(forecast: StoredForecast, s: Schedule, from: Km, to: Km, startAt: number): Stamped[] {
  return [{ km: from, t: startAt }, ...cutsOf(forecast, from, to).map((km) => ({ km, t: Math.max(startAt, s.atKm(km).getTime()) }))];
}

/** Riding minutes (no breaks) in likely hours, leaving at the schedule's departure and riding to `toKm`. No band. */
export function exposureMin(f: StoredForecast, s: Schedule, toKm: Km): number {
  return clockInRain(f, pathOn(f, s, s.startKm, toKm, s.departure.getTime())) / BREAKS;
}

/** The departures tried: dep, then each full and half hour on the zone's clock, up to 3 hours after it. Seven at most. */
export function waitTries(dep: Date, tz: string): Date[] {
  const step = STEP_MIN * MIN;
  const off = zoneOffsetMin(dep, tz) * MIN;
  const out: Date[] = [dep];
  const limit = dep.getTime() + TRIES_AFTER_MIN * MIN;
  for (let t = (Math.floor((dep.getTime() + off) / step) + 1) * step - off; t <= limit; t += step) out.push(new Date(t));
  return out;
}

const zoneAt = (f: WaitFacts, km: Km): string => {
  const tz = zoneLookupOf(f.routeZones)(km).timeZone;
  return isKnownZone(tz) ? tz : 'UTC';
};
const usual = (t: Date, tz: string): string => formatAbout(t, tz).replace('about ', '');

/** How one departure is ridden: leaving here at d, or leaving the cover at d. */
type Ride = { atKm(km: Km): number; exposure: number; stopAt: Date };

function rideFrom(f: WaitFacts, forecast: StoredForecast, d: Date, cover: { match: RouteMatch; at: number } | null): Ride {
  const s = f.schedule;
  const stop = f.ride.stopKm;
  if (!cover) {
    const leave = s.withDeparture(d);
    return { atKm: (km) => leave.atKm(km).getTime(), exposure: exposureMin(forecast, leave, stop), stopAt: leave.atKm(stop) };
  }
  // Up to the cover the ride is the one leaving at dep; beyond it, the same ride later by the wait, with the round trip.
  const wait = d.getTime() - cover.at;
  const on = s.through(cover.match).withDeparture(new Date(s.departure.getTime() + wait));
  const coverKm = cover.match.km;
  const toCover = [...pathOn(forecast, s, s.startKm, coverKm, s.departure.getTime()), { km: coverKm, t: cover.at }];
  const fromCover = pathOn(forecast, on, coverKm, stop, d.getTime());
  return {
    atKm: (km) => (km <= coverKm ? s.atKm(km).getTime() : on.atKm(km).getTime()),
    exposure: (clockInRain(forecast, toCover) + clockInRain(forecast, fromCover)) / BREAKS,
    stopAt: on.atKm(stop),
  };
}

/** The thunderstorm hours within 1 hour of the rider's time at any point of the day's ride, its stop included. */
function stormsMet(f: WaitFacts, forecast: StoredForecast, ride: Ride): Set<string> {
  const met = new Set<string>();
  for (const p of ridePoints(forecast, f.schedule)) {
    if (p.km > f.ride.stopKm) continue;
    const t = ride.atKm(p.km);
    for (const h of hoursTouching(p.g.hours, t - HOUR, t + HOUR)) if (hourClass(h).thunder) met.add(`${p.g.km}|${h.at.getTime()}`);
  }
  return met;
}

const coverMatch = (c: Cover): RouteMatch => ({ placeId: c.placeId ?? '', km: c.km, offRouteM: c.offRouteM });

export function waitOrGo(f: WaitFacts, windows: RainWindow[], plans: RainPlan[], lb: LeaveBy): WaitOrGo | null {
  const { ride } = f;
  if (ride.phase !== 'before-ride' && ride.phase !== 'riding') return null;
  if (ride.noRide || !usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !validDate(ride.departure) || !f.forecast) return null;
  if (ride.date !== ridingDate(f.now, zoneLookupOf(f.routeZones)(0).timeZone) || isStale(f.forecast, f.now)) return null;
  const forecast = routeForecast(f.forecast, f.trip.route);
  if (gridOf(forecast).length === 0) return null;

  const position = f.position && usablePosition(f.position) ? f.position : null;
  const startsWet = rainAtStart(forecast, ride, position, f.trip.route);
  const likely = onTheRide(windows, ride).filter((w) => w.cls === 'likely');
  const soon = likely.some((w) => (w.reachAt.getTime() - ride.departure.getTime()) / MIN <= SHOWN_WITHIN_MIN + SLACK_MIN);
  if (!startsWet && !soon) return null;

  const stop = ride.stopKm;
  const { lat, lon } = pointAtRouteKm(f.trip.route, stop);
  const sun = f.sun(lat, lon, ride.date);
  if (!sunReadable(sun)) return null;
  const stopTz = zoneAt(f, stop);
  const startTz = zoneAt(f, ride.startKm);
  const ridingMin = f.schedule.ridingMinTo(stop);

  const first = plans.find((p) => p.window.cls === 'likely')?.covers[0];
  const where: 'here' | Cover = startsWet || !first ? 'here' : first;
  const cover = where === 'here' ? null : { match: coverMatch(where), at: f.schedule.atPlace(coverMatch(where)).getTime(), until: where.openUntil };

  const dep = ride.departure;
  const arrivalNow = f.schedule.atKm(stop);
  const base = rideFrom(f, forecast, dep, null);
  const stormsAtDep = stormsMet(f, forecast, base);
  const threshold = Math.max(SAVE_AT_LEAST_MIN, base.exposure / 2);
  const via: Via | undefined = cover ? { cover: cover.match, dep } : undefined;

  let chosen: { d: Date; ride: Ride; saved: number } | null = null;
  let notKnown = !Number.isFinite(base.exposure);
  const ruledOut = { dark: false, storm: false, limit: null as string | null, limitHit: false };
  for (const d of waitTries(dep, startTz).slice(1)) {
    if (cover && d.getTime() < cover.at) continue;
    if (cover?.until && d.getTime() > cover.until.getTime()) continue;
    const r = rideFrom(f, forecast, d, cover);
    if (!Number.isFinite(r.exposure)) notKnown = true;
    const saved = base.exposure - r.exposure;
    if (!(saved >= threshold - SLACK_MIN)) continue;

    const judged = arrivalStatus(r.stopAt, sun, ridingMin, stopTz);
    const dark = judged.status === 'warning' || judged.status === 'unknown';
    const storms = stormsMet(f, forecast, r);
    const storm = [...storms].some((k) => !stormsAtDep.has(k));
    const broken = lb.checks.find((c) => c.meets(dep) && !c.meets(d, via));
    if (!dark && !storm && !broken) {
      chosen = { d, ride: r, saved };
      break;
    }
    ruledOut.dark ||= dark;
    ruledOut.storm ||= storm;
    if (broken) {
      ruledOut.limitHit = true;
      ruledOut.limit ??= broken.missLine;
    }
  }

  const result = { where, arrivalNow };
  if (!chosen) {
    let line: string | null;
    if (ruledOut.dark && !ruledOut.storm && !ruledOut.limitHit) {
      line = W.waitAfterDark(arrivalStatus(new Date(sun.dusk?.getTime() ?? Infinity), sun, ridingMin, stopTz).line ?? W.daylightDarkAllDay);
    } else if (ruledOut.limitHit && !ruledOut.dark && !ruledOut.storm) line = ruledOut.limit;
    else if (notKnown) line = W.waitCantJudge;
    else line = stormsAtDep.size > 0 ? null : W.waitNoHelp;
    return { ...result, d: null, savedMin: 0, arrivalWait: null, lines: line ? [line] : [] };
  }

  const { d, saved } = chosen;
  const arrivalWait = chosen.ride.stopAt;
  const statusOf = (arrival: Date): { fine: boolean; text: string } => {
    const j = arrivalStatus(arrival, sun, ridingMin, stopTz);
    if (j.line && j.status !== 'fine') return { fine: false, text: j.line };
    if (j.line) return { fine: true, text: j.line };
    return { fine: true, text: sun.sunset ? W.daylightBeforeSunset(formatHm(sun.sunset, stopTz)) : '' };
  };
  const now = statusOf(arrivalNow);
  const wait = statusOf(arrivalWait);
  const instead = now.fine ? usual(arrivalNow, stopTz) : `${usual(arrivalNow, stopTz)} (${now.text})`;
  const whereWord = cover ? W.waitAtCover(showKm(cover.match.km)) : W.waitHere;
  const lines = [W.waitCould(formatAbout(d, startTz), String(Math.round(saved / 5) * 5), whereWord, formatAbout(arrivalWait, stopTz), instead, wait.text)];
  if (lb.unrounded && d.getTime() > lb.unrounded.getTime()) lines.push(W.waitLaterThanLeaveBy(formatLeaveBy(lb.unrounded, startTz)));
  if (likely.some((w) => w.kind !== 'rain')) lines.push(W.weatherCantForecastExact);
  return { ...result, d, savedMin: saved, arrivalWait, lines };
}


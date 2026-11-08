// What Trip shows of a route, as plain data (spec sections 3.1 and 3.3). Nothing here works out an answer: the days are the stage
// model's, the leave-by time comes from the engines through the services, and the words are the wording file's.
import { addDaysIso } from '../../core/answers/time.ts';
import { sampleGrid } from '../../core/route/grid.ts';
import { planStages, shownAscentM } from '../../core/route/stages.ts';
import type { Pace } from '../../core/route/stages.ts';
import type { Route, Trip } from '../../core/types.ts';
import { shortIsoDay, shortMapDate, showKm, W } from '../../core/wording/en.ts';

/** 1214 as "1,214". */
export const thousands = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export type PlanSettings = { flatKph: number; pace: Pace; nights: number | null };

/** The route with its days and forecast grid, as Get ready offline makes them. Nights not chosen: the stage model's suggestion. */
export function planned(route: Route, o: PlanSettings): Route {
  const nights = o.nights ?? planStages(route, { flatKph: o.flatKph, pace: o.pace, nights: 0 }).suggestedNights;
  const stages = [...planStages(route, { flatKph: o.flatKph, pace: o.pace, nights })];
  return { ...route, stages, sampleGrid: sampleGrid(route, route.climbs, stages) };
}

export type Profile = { path: string; minM: number; maxM: number };
const PROFILE_W = 300;
const PROFILE_H = 72;
const PROFILE_POINTS = 120;

/** The points the profile draws (at most about 120) and its height scale; null while any height is unknown. */
function drawnPoints(route: Route): { picked: Route['points']; lo: number; hi: number; y: (ele: number) => number } | null {
  const pts = route.points;
  if (pts.length < 2 || route.lengthKm <= 0 || pts.some((p) => p.ele === null)) return null;
  const heights = pts.map((p) => p.ele!);
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const span = Math.max(hi - lo, 20);
  const step = Math.max(1, Math.ceil(pts.length / PROFILE_POINTS));
  const picked = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return { picked, lo, hi, y: (ele) => PROFILE_H - ((ele - lo) / span) * (PROFILE_H - 4) - 2 };
}

/** The heights along the route as a line in a 300 x 72 box; null while any height is unknown. */
export function profileOf(route: Route): Profile | null {
  const d = drawnPoints(route);
  if (!d) return null;
  const path = d.picked
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((p.km / route.lengthKm) * PROFILE_W).toFixed(1)},${d.y(p.ele!).toFixed(1)}`)
    .join('');
  return { path, minM: Math.round(d.lo), maxM: Math.round(d.hi) };
}

/**
 * Where the drawn profile line is at a kilometre, in the profile's 300 x 72 box: between the very points the path is drawn
 * through, so a stop's icon sits on the line as drawn (TRIP-STOPS; review of PR 73, M1). Null while any height is unknown.
 */
export function profileY(route: Route, km: number): number | null {
  const d = drawnPoints(route);
  if (!d) return null;
  const pts = d.picked;
  let after = pts.findIndex((p) => p.km >= km);
  if (after <= 0) after = after === 0 ? 1 : pts.length - 1;
  const [a, b] = [pts[after - 1]!, pts[after]!];
  const t = b.km > a.km ? Math.max(0, Math.min(1, (km - a.km) / (b.km - a.km))) : 0;
  return d.y(a.ele! + (b.ele! - a.ele!) * t);
}

/** Which line a route follows: it stays the same when looked-up heights change the route's own id. */
export const lineKey = (route: Route): string => {
  const first = route.points[0]!;
  const last = route.points[route.points.length - 1]!;
  return `${route.points.length}:${first.lat},${first.lon}:${last.lat},${last.lon}`;
};

export const PROFILE_BOX = { w: PROFILE_W, h: PROFILE_H };

export type Summary = {
  name: string; distance: string; climbing: string; profile: Profile | null;
  stages: { text: string; detail: string }[]; note: string | null;
};

const hoursText = (h: number): string => (Math.round(h * 10) / 10).toFixed(1);

/**
 * The summary of §3.3. The days are the stored ones, which are what Ahead, the forecast grid and the leave-by time read: Trip
 * works out no days of its own. Changing pace, speed or nights makes the engine plan them again and stores them.
 */
export function summaryOf(trip: Trip, o: { day1LeaveBy: string | null }): Summary {
  const { route } = trip;
  const plan = route.stages;
  const unknown = route.ascentM === null;
  return {
    name: route.name,
    distance: W.appTripDistance(showKm(route.lengthKm)),
    climbing: unknown ? W.appTripClimbingUnknown : W.appTripClimbing(thousands(route.ascentM!)),
    profile: profileOf(route),
    stages: plan.map((s) => {
      const lead = W.appTripDayRow(s.day, showKm(s.endKm - s.startKm));
      return {
        text: s.day === 1 && o.day1LeaveBy ? `${lead} · ${W.appTripDayLeaveBy(o.day1LeaveBy)}` : lead,
        detail: W.appTripDayDetail(hoursText(s.ridingHours), s.ascentM === null ? null : thousands(shownAscentM(s.ascentM))),
      };
    }),
    note: unknown ? W.appTripByDistance : null,
  };
}

const DAY_MS = 86_400_000;

/**
 * Whether the trip runs (section 3.1): it is prepared and either today lies between the departure date and the day after the
 * planned end, or a position was accepted in the last 24 hours.
 * `today` is the date in the time zone of the route's start.
 */
export function tripRuns(f: { prepared: boolean; departureDate: string | null; days: number; today: string; lastPositionAt: Date | null; now: Date }): boolean {
  if (!f.prepared) return false;
  // No date and no month: nothing says the trip is on, so the app opens on Trip.
  if (f.departureDate === null) return false;
  const lastDay = addDaysIso(f.departureDate, Math.max(0, f.days - 1));
  if (f.today >= f.departureDate && f.today <= addDaysIso(lastDay, 1)) return true;
  const age = f.lastPositionAt === null ? Infinity : f.now.getTime() - f.lastPositionAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= DAY_MS;
}

/** The nights the stage model suggests for this trip's speed and pace. */
export const suggestedNights = (trip: Trip): number =>
  planStages(trip.route, { flatKph: trip.flatKph, pace: trip.pace ?? 'sporting', nights: 0 }).suggestedNights;

/** "just now", "12 min ago", "2 h ago", "3 days ago": how long since `at`. A time ahead of now reads as now. */
export function agoText(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return W.appTripJustNow;
  if (minutes < 60) return W.routeAgeMin(String(minutes));
  if (minutes < 48 * 60) return W.routeAgeHours(String(Math.floor(minutes / 60)));
  return W.routeAgeDays(String(Math.floor(minutes / 1440)));
}

/** The date of the map data: the pack's own source date when it gives one, else its build date, and which it is. */
export function packDate(build: { builtAt: string; countries: Record<string, string | null> } | null | undefined): { date: string; fromSource: boolean } | null {
  if (!build) return null;
  const sources = Object.values(build.countries).filter((d): d is string => typeof d === 'string' && d !== '').sort();
  const newest = sources[sources.length - 1];
  const shown = shortMapDate(newest ?? build.builtAt);
  return shown === null ? null : { date: shown, fromSource: newest !== undefined };
}

const daysApart = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * The trip line at the top of Trip (guided Trip design, §2.1): the route's name and where the rider is in time. `today` is the date
 * in the route's start zone; the days are the stored stage plan's.
 */
export function tripLineOf(trip: Trip | null, today: string): { name: string; when: string | null } {
  if (!trip) return { name: W.appTripNoTrip, when: null };
  const { departureDate } = trip;
  if (departureDate === null) return { name: trip.route.name, when: W.appTripLineNoDate };
  const days = Math.max(1, trip.route.stages.length);
  const apart = daysApart(today, departureDate);
  const lastDay = addDaysIso(departureDate, days - 1);
  const when = apart >= 0 ? W.appTripLineStarts(shortIsoDay(departureDate) ?? departureDate, apart)
    : today <= lastDay ? W.appTripLineDay(1 - apart, days)
      : W.appTripLineEnded(shortIsoDay(lastDay) ?? lastDay);
  return { name: trip.route.name, when };
}

/** The Route step's folded line: "165 km · 1,240 m up · 2 days". */
export const routeDoneLine = (trip: Trip): string => W.appTripRouteDone(
  showKm(trip.route.lengthKm), trip.route.ascentM === null ? null : thousands(trip.route.ascentM), Math.max(1, trip.route.stages.length),
);

// The trip day (spec section 6.2a): the one source for the phase, the stops and the ride that every card plans. The
// phase is derived from the positions, the clock, the Plan tomorrow choice and the stored route-end date, never stored.
import { addDaysIso, instantAt, localIsoDate } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import type { Status, DayPhase, DayRide, DayNote, DayStart, Km, PlanTomorrow, Position, SunSource, Trip, ZoneLookup, ZoneSpan } from '../types.ts';
import { W } from '../wording/en.ts';
import { arrivalStatus, fineLimit } from './daylight.ts';
import { adjusted, isFarOff, isOffRoute, rejoinKm, usablePosition } from './locate.ts';
import { buildSchedule, correction, MIN_FLAT_KPH, stopRule, usableFlatKph, type Schedule } from './pace.ts';

export type DayEnv = { sun: SunSource; routeZones: ZoneSpan[] };

const MS_48H = 48 * 3_600_000;
const MOVED_KM = 2;
const NEAR_KM = 3; // a stage end, the day's stop, the route end
const RIDING_ON_KM = 5;

/** The zone of a route kilometre. Beyond the listed stretches, the nearest one; with none at all, UTC. */
export function zoneLookupOf(spans: ZoneSpan[]): ZoneLookup {
  return (km) => {
    const inside = spans.find((s) => km >= s.fromKm && km <= s.toKm);
    if (inside) return inside;
    const nearest = [...spans].sort((a, b) => distanceTo(a, km) - distanceTo(b, km))[0];
    return nearest ?? { fromKm: 0, toKm: Infinity, timeZone: 'UTC', holidayZone: null, country: '' };
  };
}
const distanceTo = (s: ZoneSpan, km: Km): number => Math.min(Math.abs(km - s.fromKm), Math.abs(km - s.toKm));

/** A riding date is a calendar date in the time zone of the route's start point. */
export const ridingDate = (t: Date, startZone: string): string => localIsoDate(t, startZone);

const last = <T>(list: T[]): T | null => list[list.length - 1] ?? null;

/** Whether a position lies more than 2 km of route from a kilometre; an approximate one needs its accuracy on top. */
const beyondMoved = (p: Position, km: Km): boolean => Math.abs(p.km - km) > MOVED_KM + (p.approximate ? p.accuracyM / 1000 : 0);

/** What dayRide knows before it judges anything. All position times are at most `now`, in order, manual ones last. */
type Day = {
  trip: Trip; env: DayEnv; zone: ZoneLookup; now: Date; today: string; startZone: string;
  everything: Position[]; // accepted positions, any age: day 1's start reads them
  latest: Position | null; // the latest on a trip day, at most 48 hours old, wherever it lies
  dayPositions: Position[]; todayPositions: Position[]; farPositions: Position[];
  fromStage: boolean; dayStartKm: Km; nightKm: Km | null; keepDayStart: DayStart | null;
};

function readDay(tripAsSet: Trip, positions: Position[], now: Date, env: DayEnv, dayStarts: DayStart[]): Day {
  // An unusable flat speed gives no times on the cards (scheduleFor). The phase must still be judged, so it is judged at
  // the slowest speed, on which a ride ends soonest.
  const trip = usableFlatKph(tripAsSet.flatKph) ? tripAsSet : { ...tripAsSet, flatKph: MIN_FLAT_KPH };
  const zone = zoneLookupOf(env.routeZones);
  const startZone = zone(0).timeZone;
  const today = ridingDate(now, startZone);
  const dateOf = (p: Position): string => ridingDate(p.at, startZone);

  // A bad value from the phone is no position. A position stamped after now (the phone's clock moved back) counts, with
  // age 0, in the order of its own stamp, so the input's order decides nothing.
  const everything = positions
    .filter(usablePosition)
    .sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.source === 'manual') - Number(b.source === 'manual')
      || a.km - b.km || a.lat - b.lat || a.lon - b.lon)
    .map((p) => (p.at.getTime() > now.getTime() ? { ...p, at: now } : p));

  const departureDate = trip.departureDate;
  const onTrip = departureDate === null ? [] : everything.filter((p) => dateOf(p) >= departureDate && now.getTime() - p.at.getTime() <= MS_48H);
  const dayPositions = onTrip.filter((p) => !isFarOff(p));
  const farPositions = onTrip.filter(isFarOff);
  const todayPositions = dayPositions.filter((p) => dateOf(p) === today);

  // The night kilometre: the latest day position; when none is left, the fallback.
  const nightKm = (last(dayPositions) ?? last(farPositions))?.km ?? null;

  // The day start.
  const route = trip.route;
  const first = todayPositions[0] ?? null;
  let dayStartKm: Km;
  let fromStage = false;
  const isDayOne = departureDate === null || today <= departureDate;
  const before = last(dayPositions.filter((p) => dateOf(p) < today)) ?? last(farPositions.filter((p) => dateOf(p) < today));
  // The day start is kept (sections 4.4 and 6.2a): the position it came from may expire during the day, and a fresher one
  // far off the route must not replace it. A first position before the daily start can still move it.
  const kept = dayStarts.find((s) => s.day === today && Number.isFinite(s.km))?.km;
  const base: Km | null = isDayOne ? 0 : kept ?? before?.km ?? null;
  const settled = base !== null || first !== null;
  if (base !== null) {
    const nightFurther = first !== null && beyondMoved(first, base) && first.at.getTime() < instantAt(today, trip.startTime, zone(first.km).timeZone).getTime();
    dayStartKm = nightFurther ? first.km : base;
  } else if (first) dayStartKm = first.km;
  else {
    const farToday = farPositions.find((p) => dateOf(p) === today);
    if (farToday) dayStartKm = farToday.km;
    else {
      const n = departureDate === null ? 1 : Math.round((Date.parse(today) - Date.parse(departureDate)) / 86_400_000) + 1;
      dayStartKm = route.stages[Math.min(n, route.stages.length) - 1]?.startKm ?? 0;
      fromStage = true;
    }
  }

  return { trip, env, zone, now, today, startZone, everything, latest: last(onTrip), dayPositions, todayPositions, farPositions, fromStage, dayStartKm, nightKm, keepDayStart: settled ? { day: today, km: dayStartKm } : null };
}

const movedBy = (d: Day, t: Date): boolean => d.todayPositions.some((p) => p.at.getTime() <= t.getTime() && beyondMoved(p, d.dayStartKm));

/** Today's correction as it stood at `t`. */
const rAt = (d: Day, t: Date): number =>
  correction(d.todayPositions.filter((p) => p.at.getTime() <= t.getTime()), d.dayStartKm, d.trip.route, d.trip.flatKph);

/** Today's stop, given the latest of today's day positions at the time: the next stage end once that reaches it. */
function todaysStop(d: Day, latest: Position | null): Km {
  const { route } = d.trip;
  let stop = stopRule(route.stages, d.dayStartKm, route.lengthKm);
  if (latest) {
    while (latest.km >= stop && stop < route.lengthKm) {
      stop = route.stages.find((s) => s.endKm > stop)?.endKm ?? route.lengthKm;
    }
  }
  return Math.min(stop, route.lengthKm);
}

/** Leaving position `from` at `t` for `km` at the correction `r`: through the one arrival function. */
function leavingNow(d: Day, from: Position, t: Date, km: Km, r: number): { arrival: Date; ridingMin: number } {
  const s = buildSchedule(d.trip, {
    startKm: adjusted(from).aheadFromKm, startLegKm: isOffRoute(from) ? rejoinKm(from.offRouteM) : 0,
    departure: t, dayStopKm: km, date: d.today,
  }, r, d.zone);
  return { arrival: s.ridingOnAt(km), ridingMin: s.ridingMinTo(km) };
}

const sunAtKm = (d: Day, km: Km) => {
  const p = pointAtRouteKm(d.trip.route, km);
  return d.env.sun(p.lat, p.lon, d.today);
};

/**
 * Whether end 2 or 3 of the ride holds at moment `t`, with `at` the latest of today's day positions then and today's
 * correction as it stood then. Every judgement of an end goes through here.
 */
function endsAt(d: Day, t: Date, at: Position | null): boolean {
  const { route } = d.trip;
  const moved = movedBy(d, t);
  const r = rAt(d, t);

  // End 2: within 3 km of a stage end, and the next one would be reached after the fine limit.
  if (moved && at) {
    const near = route.stages
      .map((s) => s.endKm)
      .filter((end) => Math.abs(at.km - end) <= NEAR_KM)
      .sort((a, b) => Math.abs(at.km - a) - Math.abs(at.km - b))[0];
    const next = near === undefined ? undefined : route.stages.find((s) => s.endKm > near)?.endKm;
    if (next !== undefined) {
      const go = leavingNow(d, at, t, next, r);
      const limit = fineLimit(sunAtKm(d, next), go.ridingMin);
      if (limit && go.arrival.getTime() > limit.getTime()) return true;
    }
  }

  // End 3: after sunset at the position, unless still on the way and able to reach today's stop before civil dusk.
  const where = at ?? last(d.dayPositions) ?? pointAtRouteKm(route, d.dayStartKm);
  const sunset = d.env.sun(where.lat, where.lon, d.today).sunset;
  if (!sunset || t.getTime() <= sunset.getTime()) return false;
  if (moved && at) {
    const stop = todaysStop(d, at);
    if (stop - at.km > NEAR_KM) {
      const dusk = sunAtKm(d, stop).dusk;
      if (!dusk || leavingNow(d, at, t, stop, r).arrival.getTime() < dusk.getTime()) return false;
    }
  }
  return true;
}

/** Whether the ride has ended today: Plan tomorrow, or an end judged along today's positions and now. */
function rideEnded(d: Day, plan: PlanTomorrow | null): boolean {
  if (plan && plan.date === d.today && !plan.backToTodayAt) return true;
  const tap = plan?.backToTodayAt && Number.isFinite(plan.backToTodayAt.getTime()) && ridingDate(plan.backToTodayAt, d.startZone) === d.today && plan.backToTodayAt.getTime() <= d.now.getTime() ? plan.backToTodayAt : null;

  let heldKm: Km | null = null; // the last day position at which end 2 or 3 held
  let asideStopKm: Km | null = null; // ends set aside by Back to today, until a position near this stop
  let tapDone = tap === null;

  const atTap = (latest: Position | null): void => {
    tapDone = true;
    if (heldKm !== null || endsAt(d, tap!, latest)) {
      asideStopKm = todaysStop(d, latest);
      heldKm = null;
    }
  };

  let latest: Position | null = null;
  for (const p of d.todayPositions) {
    if (!tapDone && p.at.getTime() > tap!.getTime()) atTap(latest);
    latest = p;
    if (asideStopKm !== null) {
      if (tapDone && p.km >= asideStopKm - NEAR_KM) asideStopKm = null;
      else continue;
    }
    if (heldKm !== null && p.km - heldKm > RIDING_ON_KM) heldKm = null;
    if (endsAt(d, p.at, p)) heldKm = p.km;
  }
  if (!tapDone) atTap(latest);
  if (asideStopKm !== null) return false;
  return heldKm !== null || endsAt(d, d.now, latest);
}

/** The riding date on which a day position first lay within 3 km of the route end, or the stored one. */
function routeEndDateOf(d: Day, stored: string | null): string | null {
  const departureDate = d.trip.departureDate;
  if (departureDate === null) return null;
  const length = d.trip.route.lengthKm;
  const reaching = d.dayPositions.find((p) => length - (p.km - (p.approximate ? p.accuracyM / 1000 : 0)) <= NEAR_KM);
  const seen = reaching ? ridingDate(reaching.at, d.startZone) : null;
  const kept = stored !== null && stored >= departureDate ? stored : null;
  if (seen === null) return kept;
  return kept === null || seen < kept ? seen : kept;
}

/** Where a position starts the ride: never beyond its stop, so a ride never runs backwards. */
function startFrom(p: Position, stopKm: Km, lengthKm: Km): { startKm: Km; startOffRouteM: number; behindFromKm: Km; past: boolean } {
  const a = adjusted(p, lengthKm);
  const past = a.aheadFromKm >= stopKm;
  return {
    startKm: past ? stopKm : a.aheadFromKm, startOffRouteM: isOffRoute(p) ? p.offRouteM : 0,
    behindFromKm: a.behindFromKm, past,
  };
}

/** Day 1's start: the day start, or a camp beside it, with its rejoin leg. A position elsewhere gets the note. */
function dayOneStart(d: Day, stopKm: Km): { startKm: Km; startOffRouteM: number; behindFromKm: Km; note: DayNote | null } {
  const p = last(d.everything);
  if (p && !isFarOff(p) && Math.abs(p.km - d.dayStartKm) <= MOVED_KM) {
    const s = startFrom(p, stopKm, d.trip.route.lengthKm);
    return { startKm: s.startKm, startOffRouteM: s.startOffRouteM, behindFromKm: s.behindFromKm, note: null };
  }
  return { startKm: d.dayStartKm, startOffRouteM: 0, behindFromKm: d.dayStartKm, note: p ? { kind: 'day1-route-start' } : null };
}

const later = (a: Date, b: Date): Date => (a.getTime() > b.getTime() ? a : b);

/**
 * `dayStarts` are the day starts the store kept from earlier results' `keepDayStart` (section 4.4); `screen()` passes its
 * input of that name. Without a clock (`now` is no date) no position can be judged: day 1 is planned from the route start.
 */
export function dayRide(trip: Trip, positions: Position[], planTomorrow: PlanTomorrow | null, routeEndDate: string | null, now: Date, env: DayEnv, dayStarts: DayStart[] = []): DayRide {
  const { route, departureDate, startTime } = trip;
  const length = route.lengthKm;
  if (!Number.isFinite(now.getTime())) {
    const stopKm = stopRule(route.stages, 0, length);
    return {
      phase: 'before-trip', date: departureDate ?? '', startKm: 0, startOffRouteM: 0,
      departure: departureDate === null ? now : instantAt(departureDate, startTime, zoneLookupOf(env.routeZones)(0).timeZone),
      stopKm, tonightKm: null, tomorrowKm: null, dayStartKm: 0, nightKm: null, r: 1, behindFromKm: 0, noRide: false,
      routeEndReachedOn: null, note: null, keepDayStart: null,
    };
  }
  const d = readDay(trip, positions, now, env, dayStarts);
  const dailyStart = (date: string, km: Km): Date => instantAt(date, startTime, d.zone(km).timeZone);
  const stopAfter = (km: Km): Km => stopRule(route.stages, km, length);

  // Before the trip. Without a departure date there are no trip days, and the same plan is made from now.
  if (departureDate === null || d.today < departureDate) {
    const stopKm = stopAfter(0);
    const dayOne = dayOneStart({ ...d, dayStartKm: 0 }, stopKm);
    const date = departureDate ?? d.today;
    return {
      phase: 'before-trip', date, ...dayOne,
      departure: departureDate === null ? now : dailyStart(date, dayOne.startKm), stopKm,
      tonightKm: null, tomorrowKm: addDaysIso(d.today, 1) === departureDate ? stopKm : null,
      dayStartKm: 0, nightKm: null, r: 1, noRide: false, routeEndReachedOn: null, keepDayStart: null,
    };
  }

  const common = { dayStartKm: d.dayStartKm, nightKm: d.nightKm, r: rAt(d, now), keepDayStart: d.keepDayStart };
  const reachedOn = routeEndDateOf(d, routeEndDate);

  // Route end reached.
  if (reachedOn !== null && d.today >= reachedOn) {
    const s = d.latest ? startFrom(d.latest, length, length) : null;
    return {
      phase: 'route-end', date: d.today, startKm: s?.startKm ?? length, startOffRouteM: s?.startOffRouteM ?? 0,
      departure: now, stopKm: length, tonightKm: d.nightKm ?? length, tomorrowKm: null,
      ...common, behindFromKm: s?.behindFromKm ?? length, noRide: false, routeEndReachedOn: reachedOn, note: null,
    };
  }

  const stop = todaysStop(d, last(d.todayPositions));

  // After the day's ride: tomorrow's ride.
  if (rideEnded(d, planTomorrow)) {
    const tonightKm = d.nightKm ?? stop;
    const base = { phase: 'after-ride' as DayPhase, tonightKm, ...common, routeEndReachedOn: reachedOn };
    if (tonightKm >= length) {
      return {
        ...base, date: d.today, startKm: tonightKm, startOffRouteM: 0, departure: now, stopKm: tonightKm, tomorrowKm: null,
        behindFromKm: tonightKm, noRide: true, note: { kind: 'tonight-route-end', km: tonightKm },
      };
    }
    const stopKm = stopAfter(tonightKm);
    const s = d.latest ? startFrom(d.latest, stopKm, length) : null;
    const date = addDaysIso(d.today, 1);
    const startKm = s?.startKm ?? tonightKm;
    const note: DayNote | null = s === null ? { kind: 'no-position', km: tonightKm } : s.past ? { kind: 'past-stop', stopKm, tomorrow: true } : null;
    return {
      ...base, date, startKm, startOffRouteM: s?.startOffRouteM ?? 0, departure: dailyStart(date, startKm), stopKm, tomorrowKm: stopKm,
      behindFromKm: s?.behindFromKm ?? startKm, noRide: false, note,
    };
  }

  // Before the day's ride, or riding.
  const moved = movedBy(d, now);
  const phase: DayPhase = moved ? 'riding' : 'before-ride';
  const tomorrowKm = stop >= length ? null : stopAfter(stop);
  const base = { phase, date: d.today, stopKm: stop, tonightKm: stop, tomorrowKm, ...common, noRide: false, routeEndReachedOn: reachedOn };
  const isDayOne = d.today === departureDate;

  if (!moved && isDayOne) {
    const dayOne = dayOneStart(d, stop);
    return { ...base, ...dayOne, departure: later(dailyStart(d.today, dayOne.startKm), now) };
  }
  if (d.latest) {
    const s = startFrom(d.latest, stop, length);
    return {
      ...base, startKm: s.startKm, startOffRouteM: s.startOffRouteM, behindFromKm: s.behindFromKm,
      departure: moved ? now : later(dailyStart(d.today, s.startKm), now),
      note: s.past ? { kind: 'past-stop', stopKm: stop, tomorrow: false } : null,
    };
  }
  return {
    ...base, startKm: d.dayStartKm, startOffRouteM: 0, behindFromKm: d.dayStartKm,
    departure: later(dailyStart(d.today, d.dayStartKm), now), note: d.fromStage ? { kind: 'stage-start', km: d.dayStartKm } : null,
  };
}

const scheduleWith = (ride: DayRide, trip: Trip, r: number, env: DayEnv, departure: Date): Schedule =>
  buildSchedule(trip, {
    startKm: ride.startKm, startLegKm: rejoinKm(ride.startOffRouteM), departure, dayStopKm: ride.stopKm, date: ride.date,
    behindFromKm: ride.behindFromKm,
  }, r, zoneLookupOf(env.routeZones));

/** The schedule of the ride the cards plan. Today's correction scales today's riding; every later day uses r = 1. */
export function scheduleFor(ride: DayRide, trip: Trip, env: DayEnv): Schedule {
  const today = ride.phase === 'before-ride' || ride.phase === 'riding' || ride.phase === 'route-end' || ride.noRide;
  return scheduleWith(ride, trip, today ? ride.r : 1, env, ride.departure);
}

/**
 * Riding there now from the ride's start point, at today's correction: the chips, and Sleep after the day's ride. Its one
 * ride runs to the route end with no night in it, so atKm and atPlace mean tonight, at any kilometre, and rideOf gives
 * today's date for the sun. Places behind go through `behind`. The start is the ride's, so a position past the day's stop
 * counts from that stop.
 */
export function nowSchedule(ride: DayRide, trip: Trip, now: Date, env: DayEnv): Schedule {
  const zone = zoneLookupOf(env.routeZones);
  const date = Number.isFinite(now.getTime()) ? ridingDate(now, zone(0).timeZone) : ride.date;
  return buildSchedule(trip, {
    startKm: ride.startKm, startLegKm: rejoinKm(ride.startOffRouteM), departure: now, dayStopKm: trip.route.lengthKm, date,
    behindFromKm: ride.behindFromKm,
  }, ride.r, zone);
}

/** The daylight status of the arrival at `km` on a schedule: judged on the sun of the date of the ride it lies on (section 6.2a). */
export function daylightAt(s: Schedule, km: Km, trip: Trip, env: DayEnv): { status: Status; line: string | null } {
  const p = pointAtRouteKm(trip.route, km);
  const sun = env.sun(p.lat, p.lon, s.rideOf(km).date);
  return arrivalStatus(s.atKm(km), sun, s.ridingMinTo(km), zoneLookupOf(env.routeZones)(km).timeZone);
}

/**
 * Tomorrow's ride, before and while riding: from tonight's stop at the daily start on the next date, never before the
 * arrival there. After the day's ride the ride already is tomorrow's. With no tomorrow, the result has `noRide`.
 */
export function tomorrowRide(ride: DayRide, trip: Trip, env: DayEnv): DayRide {
  if (ride.phase === 'after-ride') return ride;
  const { route, startTime } = trip;
  const from = ride.tonightKm ?? ride.stopKm;
  if (ride.phase === 'route-end' || from >= route.lengthKm) return { ...ride, tomorrowKm: null, noRide: true };
  const zone = zoneLookupOf(env.routeZones);
  const startAt = instantAt(addDaysIso(ride.date, 1), startTime, zone(from).timeZone);
  const departure = later(startAt, scheduleFor(ride, trip, env).atKm(from));
  const stopKm = stopRule(route.stages, from, route.lengthKm);
  return {
    ...ride, date: ridingDate(departure, zone(0).timeZone), startKm: from, startOffRouteM: 0, departure, stopKm,
    tomorrowKm: stopKm, r: 1, behindFromKm: from, note: null,
  };
}

/** The text of the ride's start note. */
export function noteFor(ride: DayRide): string | null {
  const n = ride.note;
  if (!n) return null;
  switch (n.kind) {
    case 'day1-route-start': return W.routeDayOneAtStart;
    case 'past-stop': return W.routePastStop(n.tomorrow ? 'tomorrow' : 'today', n.stopKm);
    case 'no-position': return W.routeFromTonightNoPosition(n.km);
    case 'stage-start': return W.routeFromStageStart(n.km);
    case 'tonight-route-end': return W.routeTonightIsEnd(n.km);
  }
}

/** Plan tomorrow is offered before and while riding. */
export const offersPlanTomorrow = (ride: DayRide): boolean => ride.phase === 'before-ride' || ride.phase === 'riding';

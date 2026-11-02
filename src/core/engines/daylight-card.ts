// The Daylight card (spec sections 6.5 and 6.12). Before the trip and before and after the day's ride, its title is the
// day's leave-by and its status is leave-by's. While riding it judges the arrival at the day's stop. At the route end it
// judges the arrival there on the riding date it was reached, and otherwise gives the daylight left.
// It lives apart from daylight.ts because the trip day reads daylight.ts, and this card reads the trip day.
import { formatAbout, makeAnswer } from '../answers/index.ts';
import { addDaysIso, formatHm, instantAt, isKnownZone, localIsoDate, roundedLeaveBy, wallClock } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import type { Answer, AnswerItem, DayRide, Km, Missing, Status, SunTimes } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { newestMapDate, savedCovers, shortMapDate } from './covers.ts';
import { arrivalStatus, daylightLeft } from './daylight.ts';
import { bindingPlace, closingDay, closingWord, leaveBy, sunReadable, type LeaveBy, type LeaveFacts } from './leaveby.ts';
import { adjusted, latestPosition, usablePosition } from './locate.ts';
import { usableFlatKph } from './pace.ts';
import { noteFor, offersPlanTomorrow, ridingDate, zoneLookupOf } from './tripday.ts';
import { weekdayOf } from './weather-windows.ts';

const MIN = 60_000;
const SOON_MIN = 30;
const validDate = (d: Date | null): d is Date => d !== null && Number.isFinite(d.getTime());

const zoneAt = (f: LeaveFacts, km: Km): string => {
  const tz = zoneLookupOf(f.routeZones)(km).timeZone;
  return isKnownZone(tz) ? tz : 'UTC';
};

const sunAt = (f: LeaveFacts, km: Km, date: string): SunTimes => {
  const { lat, lon } = pointAtRouteKm(f.trip.route, km);
  return f.sun(lat, lon, date);
};

const noHeights = (f: LeaveFacts): boolean => f.trip.route.points.some((p) => !Number.isFinite(p.ele));

// ---- the basis -----------------------------------------------------------------------------------------------------

function fromText(f: LeaveFacts, ride: DayRide): string {
  const km = showKm(ride.startKm);
  const p = latestPosition(f.positions.filter(usablePosition));
  if (!p || adjusted(p).aheadFromKm !== ride.startKm || !validDate(f.now)) return W.leavebyFromKm(km);
  const tz = zoneAt(f, p.km);
  const time = formatHm(p.at, tz);
  const day = localIsoDate(p.at, tz);
  const today = localIsoDate(f.now, tz);
  if (day === today) return W.leavebyFromPosition(km, time);
  if (addDaysIso(day, 1) === today) return W.leavebyFromPosition(km, W.leavebyYesterday(time));
  return W.leavebyFromPosition(km, W.timeDayAt(shortDay(p.at, tz), time));
}

const shortDay = (t: Date, tz: string): string => {
  const w = wallClock(t, tz);
  return W.timeShortDay(weekdayOf(t, tz), w.day, W.timeMonth(w.month - 1));
};

function basisOf(f: LeaveFacts, ride: DayRide, r: LeaveBy | null): string[] {
  const kph = String(f.trip.flatKph);
  const pace = f.trip.pace ? W.leavebyPaceNamed(f.trip.pace, kph) : W.leavebyPaceBare(kph);
  const parts = [W.leavebyBasis(pace, fromText(f, ride)), W.leavebyExclusions];
  if (r?.closure) parts.push(closingDay(f, ride) === 'holiday' ? W.leavebyHolidayAssumed : W.leavebySundayAssumed);
  const date = shortMapDate(newestMapDate(f));
  if (date) parts.push(W.leavebyMapDate(date));
  return [parts.join(' '), ...(f.places.length > 0 ? [W.waterBasisOsm] : [])];
}

const freshnessOf = (f: LeaveFacts): Answer['freshness'] => {
  const newest = newestMapDate(f);
  return { dataDates: newest === null ? {} : { places: newest }, stale: false };
};

// ---- leave-by's title ----------------------------------------------------------------------------------------------

/** What the title names: the binding limit (section 6.12). */
function reasonOf(f: LeaveFacts, ride: DayRide, r: LeaveBy): string {
  const stopTz = zoneAt(f, ride.stopKm);
  const sunset = sunAt(f, ride.stopKm, ride.date).sunset;
  if (r.binding === 'daylight' && validDate(sunset)) return W.leavebyToReach(showKm(ride.stopKm), formatHm(sunset, stopTz));
  const at = bindingPlace(f, ride, r);
  if (!at) return r.limits[0]?.place ?? W.leavebyToReachBare(showKm(ride.stopKm));
  const place = W.leavebyPlaceAtKm(at.word, showKm(at.km));
  if (r.binding === 'water') return W.leavebyWaterTitle(place, at.closes);
  if (!r.closure) return W.leavebyTonight(place, at.closes);
  const day = closingWord(closingDay(f, ride));
  return ride.phase === 'after-ride' ? W.leavebyPlaceBefore(place, day, at.closes) : W.leavebyLastShop(day, place, at.closes);
}

const usualStart = (f: LeaveFacts, ride: DayRide): Date => instantAt(ride.date, f.trip.startTime, zoneAt(f, ride.startKm));

function titleOf(f: LeaveFacts, ride: DayRide, r: LeaveBy, sun: SunTimes): { title: string; detail: string[] } {
  const stopTz = zoneAt(f, ride.stopKm);
  const startTz = zoneAt(f, ride.startKm);
  const km = showKm(ride.stopKm);
  const judged = r.earliestArrival ? arrivalStatus(r.earliestArrival, sun, ridingTo(f, ride), stopTz) : null;
  const leavingNow = validDate(r.earliest) && validDate(f.now) && r.earliest.getTime() === f.now.getTime();
  const nowAt = r.earliestArrival && judged ? W.leavebyLeavingNow(formatAbout(r.earliestArrival, stopTz), judged.line ?? '') : '';

  if (leavingNow && judged?.status === 'warning') return { title: W.leavebyAfterDark(km, judged.line!), detail: [nowAt] };
  if (r.unrounded === null) {
    if (r.lightAllNight) return { title: W.leavebyNoLimit, detail: [] };
    const when = leavingNow ? W.leavebyNow : W.leavebyAtTime(formatHm(r.earliest!, startTz));
    const about = r.earliestArrival ? formatAbout(r.earliestArrival, stopTz) : '';
    return { title: W.leavebyEven(when, km, about, sun.sunset ? formatHm(sun.sunset, stopTz) : null), detail: [] };
  }

  const shown = roundedLeaveBy(r.unrounded, startTz);
  const about = `about ${formatHm(shown, startTz)}`;
  if (validDate(f.now) && r.unrounded.getTime() < f.now.getTime()) {
    const needed = r.binding === 'daylight' ? W.leavebyNeeded(about, W.leavebyToReachBare(km)) : W.leavebyNeededAt(about, reasonOf(f, ride, r));
    return { title: `${needed} ${nowAt}`, detail: [] };
  }

  const usual = usualStart(f, ride);
  const early = r.unrounded.getTime() < usual.getTime();
  const parts: string[] = [];
  if (validDate(sun.dawn ?? null)) {
    const dawn = dawnAt(f, ride);
    if (validDate(dawn) && r.unrounded.getTime() < dawn.getTime()) parts.push(W.leavebyBeforeFirstLight(formatHm(dawn, startTz)));
  }
  if (early) parts.push(W.leavebyMinBeforeUsual(Math.round((usual.getTime() - shown.getTime()) / MIN)));
  if (ride.phase === 'after-ride' && !early) {
    parts.push(W.leavebyUsualStart(formatHm(usual, startTz)));
    if (r.binding === 'daylight') return { title: [`${W.leavebyTomorrow}: ${W.leavebyLeaveByLower(about)}`, ...parts].join(' · '), detail: [] };
  }
  parts.push(reasonOf(f, ride, r));
  const lead = ride.phase === 'before-trip' ? `${W.leavebyDayOne(shortDay(ride.departure, startTz))}: ${W.leavebyLeaveByLower(about)}`
    : ride.phase === 'after-ride' ? (early ? `${W.leavebyTomorrowDated(shortDay(ride.departure, startTz))}: ${W.leavebyLeaveByLower(about)}` : `${W.leavebyTomorrow}: ${W.leavebyLeaveByLower(about)}`)
      : W.leavebyLeaveBy(about);
  return { title: `${[lead, ...parts].join(' · ')}.`, detail: [] };
}

const ridingTo = (f: LeaveFacts, ride: DayRide): number => (ride === f.ride ? f.schedule.ridingMinTo(ride.stopKm) : Number.NaN);

/** Civil dawn at the start point on the ride's date. */
const dawnAt = (f: LeaveFacts, ride: DayRide): Date | null => sunAt(f, ride.startKm, ride.date).dawn;

/** Section 6.12's status. Every "fine" is reached by a positive test, so a time that is no time is never calm. */
function statusOf(f: LeaveFacts, ride: DayRide, r: LeaveBy, sun: SunTimes): Status {
  const judged = r.earliestArrival ? arrivalStatus(r.earliestArrival, sun, ridingTo(f, ride), zoneAt(f, ride.stopKm)) : null;
  if (judged?.status === 'warning' && !r.lightAllNight) return 'warning';
  if (noHeights(f)) return 'action';
  if (r.unrounded === null) return r.lightAllNight ? 'fine' : 'action';
  const d = r.unrounded.getTime();
  const dawn = dawnAt(f, ride);
  const onTime = d >= ride.departure.getTime();
  const notSoon = d - f.now.getTime() >= SOON_MIN * MIN;
  const light = !validDate(dawn) || d >= dawn.getTime();
  return onTime && notSoon && light ? 'fine' : 'action';
}

// ---- the expanded view ---------------------------------------------------------------------------------------------

function limitItems(f: LeaveFacts, ride: DayRide, r: LeaveBy): AnswerItem[] {
  const startTz = zoneAt(f, ride.startKm);
  const stopTz = zoneAt(f, ride.stopKm);
  const sunset = sunAt(f, ride.stopKm, ride.date).sunset;
  const items: AnswerItem[] = [];
  for (const l of r.limits) {
    const when = l.latest ? `about ${formatHm(roundedLeaveBy(l.latest, startTz), startTz)}` : null;
    const by = when ? W.leavebyLeaveBy(when) : '';
    if (l.id === 'daylight') {
      if (when && validDate(sunset)) items.push({ label: `${by} · ${W.leavebyToReach(showKm(ride.stopKm), formatHm(sunset, stopTz))}`, stamp: { km: ride.stopKm }, status: 'fine' });
      continue;
    }
    if (l.place === null) continue;
    if (l.id === 'water') items.push({ label: W.leavebyWaterLine(l.place, l.closes ?? ''), stamp: null, status: 'fine', detail: by });
    else items.push({ label: l.closes ? `${l.place}, closes ${l.closes}` : l.place, stamp: null, status: 'fine', detail: by });
  }
  for (const s of r.setAside) items.push({ label: s.why, stamp: null, status: 'fine' });
  const foodKept = r.kept.includes('food-closure') || r.kept.includes('food-tonight');
  if (foodKept && r.notCounted > 0) items.push({ label: W.leavebyNotIncluded(r.notCounted === 1 ? W.leavebyOneUnknown : W.leavebyManyUnknown(r.notCounted)), stamp: null, status: 'fine' });
  return items;
}

function sunItems(f: LeaveFacts, ride: DayRide): AnswerItem[] {
  const tz = zoneAt(f, ride.stopKm);
  const sun = sunAt(f, ride.stopKm, ride.date);
  if (sun.lightAllNight) return [{ label: W.daylightAllNight, stamp: { km: ride.stopKm }, status: 'fine' }];
  if (!sun.sunset) return [];
  return [{ label: W.daylightSunsetItem(showKm(ride.stopKm), formatHm(sun.sunset, tz), sun.dusk ? formatHm(sun.dusk, tz) : null), stamp: { km: ride.stopKm }, status: 'fine' }];
}

const usualItem = (f: LeaveFacts, ride: DayRide): AnswerItem => ({ label: W.leavebyUsualStartItem(formatHm(usualStart(f, ride), zoneAt(f, ride.startKm))), stamp: null, status: 'fine' });

/** The data whose absence this answer states. Later stretches count only where the closure limit reads them. */
function missingOf(f: LeaveFacts, ride: DayRide, r: LeaveBy | null): Missing[] {
  const missing: Missing[] = [];
  if (noHeights(f)) missing.push('heights');
  if (r?.dataNote === W.leavebyNeedsGetReady) missing.push('hours');
  if (r?.dataNote === W.leavebyNoPlaceData) missing.push('places');
  if (r && r.notCounted > 0) missing.push('hours');
  if (r?.closure && !savedCovers(f, ride.stopKm, f.schedule.rideOf(ride.stopKm + 1e-6).stopKm) && !missing.includes('places')) missing.push('places');
  return [...new Set(missing)];
}

// ---- the card ------------------------------------------------------------------------------------------------------

function daylightLeftNow(f: LeaveFacts, ride: DayRide): string {
  const today = ridingDate(f.now, zoneLookupOf(f.routeZones)(0).timeZone);
  const p = latestPosition(f.positions.filter(usablePosition));
  const at = p ?? pointAtRouteKm(f.trip.route, ride.startKm);
  const tz = zoneAt(f, p?.km ?? ride.startKm);
  return daylightLeft(f.now, f.sun(at.lat, at.lon, today), f.sun(at.lat, at.lon, addDaysIso(today, 1)), tz);
}

const arrivalTitle = (f: LeaveFacts, ride: DayRide, arrival: Date, line: string | null, sun: SunTimes): string => {
  const tz = zoneAt(f, ride.stopKm);
  const what = line ?? (sun.sunset ? W.daylightBeforeSunset(formatHm(sun.sunset, tz)) : '');
  return W.daylightArrival(showKm(ride.stopKm), formatAbout(arrival, tz), what);
};

const atLeastAction = (status: Status): Status => (status === 'fine' ? 'action' : status);

export function daylightAnswer(f: LeaveFacts): Answer {
  const ride = f.ride;
  const simple = (title: string, status: Status, missing: Missing[], items: AnswerItem[] = []): Answer => makeAnswer({
    topic: 'daylight', status, title, stamp: null, detail: noteFor(ride) ?? '', items, basis: [W.daylightBasis], freshness: freshnessOf(f), missing,
  });
  if (!usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !validDate(ride.departure)) return simple(W.daylightCantWorkOut, 'unknown', []);
  const stopSun = sunAt(f, ride.stopKm, ride.date);
  if (!sunReadable(stopSun) || !sunReadable(dawnOnly(f, ride))) return simple(W.daylightCantWorkOut, 'unknown', []);

  if (f.trip.departureDate === null) {
    return simple(daylightLeftNow(f, ride), 'unknown', ['date'], [{ label: W.leavebyNeedsDate, stamp: null, status: 'unknown' }]);
  }

  // The route end: the arrival there on the riding date it was reached, else the daylight left.
  if (ride.phase === 'route-end' || ride.noRide) {
    if (ride.phase === 'route-end' && ride.routeEndReachedOn === ride.date && ride.startKm < ride.stopKm) {
      const arrival = f.schedule.atKm(ride.stopKm);
      const j = arrivalStatus(arrival, stopSun, f.schedule.ridingMinTo(ride.stopKm), zoneAt(f, ride.stopKm));
      return makeAnswer({
        topic: 'daylight', status: noHeights(f) ? atLeastAction(j.status) : j.status, title: arrivalTitle(f, ride, arrival, j.line, stopSun), stamp: { km: ride.stopKm, at: arrival },
        detail: noHeights(f) ? W.leavebyNoHeights : '', items: sunItems(f, ride), basis: basisOf(f, ride, null), freshness: freshnessOf(f), missing: noHeights(f) ? ['heights'] : [],
      });
    }
    return simple(daylightLeftNow(f, ride), 'fine', []);
  }

  const r = leaveBy(f, ride);
  const offers: AnswerItem[] = offersPlanTomorrow(ride) ? [{ label: W.daylightPlanTomorrow, stamp: null, status: 'fine' }]
    : ride.phase === 'after-ride' ? [{ label: W.daylightBackToToday, stamp: null, status: 'fine' }] : [];
  const notes = [noteFor(ride) ?? '', r.dataNote ?? '', noHeights(f) ? W.leavebyNoHeights : ''];

  // While riding: the arrival at the day's stop.
  if (ride.phase === 'riding') {
    const arrival = f.schedule.atKm(ride.stopKm);
    const j = arrivalStatus(arrival, stopSun, f.schedule.ridingMinTo(ride.stopKm), zoneAt(f, ride.stopKm));
    const here: AnswerItem[] = r.unrounded ? [{ label: W.leavebyHereBy(`about ${formatHm(roundedLeaveBy(r.unrounded, zoneAt(f, ride.startKm)), zoneAt(f, ride.startKm))}`), stamp: null, status: 'fine' }] : [];
    return makeAnswer({
      topic: 'daylight', status: noHeights(f) ? atLeastAction(j.status) : j.status, title: arrivalTitle(f, ride, arrival, j.line, stopSun), stamp: { km: ride.stopKm, at: arrival },
      detail: notes.filter(Boolean).join(' '), items: [...here, ...limitItems(f, ride, r), usualItem(f, ride), ...sunItems(f, ride), ...offers], basis: basisOf(f, ride, r), freshness: freshnessOf(f), missing: missingOf(f, ride, r),
    });
  }

  const { title, detail } = titleOf(f, ride, r, stopSun);
  return makeAnswer({
    topic: 'daylight', status: statusOf(f, ride, r, stopSun), title, stamp: { km: ride.stopKm },
    detail: [...detail, ...notes].filter(Boolean).join(' '),
    items: [...limitItems(f, ride, r), usualItem(f, ride), ...sunItems(f, ride), ...offers], basis: basisOf(f, ride, r), freshness: freshnessOf(f), missing: missingOf(f, ride, r),
  });
}

const dawnOnly = (f: LeaveFacts, ride: DayRide): SunTimes => {
  const s = sunAt(f, ride.startKm, ride.date);
  return { ...s, sunset: s.dawn, dusk: s.sunrise, lightAllNight: false };
};

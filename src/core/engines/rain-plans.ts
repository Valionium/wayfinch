// Rain plans (spec section 6.11): for each likely window on the day's ride within 48 hours, where the rider could shelter
// before the rain. A thunderstorm plan lists open buildings only. Every arrival is the one arrival of the schedule.
import { formatAbout, formatHm } from '../answers/index.ts';
import type { Cover, Km, Missing, RainPlan, RainWindow } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { coverOfSpot, finalOrder, hoursLookup, hoursNotWorkedOut, insideRadius, isCover, missingFor, reachKm, savedCovers, seatingLine, spotName, spotsOf, zoneOfSpot, hoursDecide, type NotCover, type Spot, type StopFacts } from './covers.ts';
import { shelterEntries, stormAroundStart, latestUsable } from './shelter.ts';
import { onTheRide, rainAtStart, ridePoints, routeForecast, within48h } from './weather-windows.ts';

const MIN = 60_000;
const BAND_MIN = 15;
const BAND_MAX = 60;
const SLACK = 1e-6; // minutes: "exactly 15" must not fall to rounding
const MAX_COVERS = 3;

type Found = { spot: Spot; cover: Cover };

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

const toSecond = (d: Date): number => Math.floor(d.getTime() / 1000);

/** Class, then latest arrival (arrivals in one second tie: the rest is rounding), then shorter detour, then the final tie-break. */
export const planOrder = (a: Found, b: Found): number =>
  a.cover.coverClass - b.cover.coverClass
  || toSecond(b.cover.arrival) - toSecond(a.cover.arrival)
  || a.cover.offRouteM - b.cover.offRouteM
  || finalOrder(a.spot, b.spot);

/** One place on two passes of the route is one cover: its best pass. */
function onePassEach<T extends Found>(list: T[]): T[] {
  const seen = new Set<unknown>();
  return list.filter((x) => {
    const key = x.spot.place ?? x.spot.roof;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const counts = (thunder: boolean, c: Cover): boolean => !thunder || c.coverClass <= 2;

function firstCoverLine(found: Found, thunder: boolean, f: StopFacts): string {
  const { spot, cover } = found;
  const tz = zoneOfSpot(spot, f);
  const km = showKm(cover.km);
  const until = cover.openUntil ? formatHm(cover.openUntil, tz) : null;
  if (thunder) return W.stopOpenBefore(spotName(spot), km, until);
  const more: string[] = [];
  if (cover.coverClass <= 2) more.push(until ? W.stopOpenUntil(until) : W.stopOpenOnArrival, seatingLine(spot.place!));
  return W.stopCouldShelter(spotName(spot), km, formatAbout(cover.arrival, tz), more);
}

function behindLine(w: RainWindow, thunder: boolean, spots: Spot[], f: StopFacts, hoursOf: ReturnType<typeof hoursLookup>): string {
  const from = f.ride.behindFromKm;
  const found = spots
    .filter((s) => s.match.km < from && !insideRadius(f.ride, s.match.km))
    .map((spot) => ({ spot, arrival: f.schedule.behind(spot.match) }))
    .map(({ spot, arrival }) => ({ spot, r: coverOfSpot(spot, arrival, w.end, hoursOf) }))
    .filter((x): x is { spot: Spot; r: Cover } => isCover(x.r) && counts(thunder, x.r))
    .sort((a, b) => reachKm(a.spot, from) - reachKm(b.spot, from) || finalOrder(a.spot, b.spot))[0];
  if (!found) return thunder ? W.stopNoOpenBehind : W.stopNoneBehind;
  const about = formatAbout(found.r.arrival, zoneOfSpot(found.spot, f));
  const back = showKm(Math.abs(from - found.spot.match.km));
  const km = showKm(found.spot.match.km);
  return thunder ? W.stopOpenBehind(spotName(found.spot), km, back, about) : W.stopCoverBehind(spotName(found.spot), km, back, about);
}

/**
 * The plan of one likely window. With rain at the start, the Shelter list stands in its place, as the chip would find it
 * at the ride's start at its departure; a thunderstorm further on in that window still gets its plan, with m there.
 */
export function rainPlan(w: RainWindow, f: StopFacts): RainPlan {
  const start = f.ride.startKm;
  const position = latestUsable(f);
  // The window the ride starts in holds the first point of the ride. A separate window further on keeps its own plan.
  const forecast = f.forecast && routeForecast(f.forecast, f.trip.route);
  const startsHere = forecast !== null && rainAtStart(forecast, f.ride, position) && w.fromKm === ridePoints(forecast, f.schedule)[0]?.km;
  const firstMet = w.metKms[0] ?? w.fromKm;
  const stormLater = startsHere ? w.thunderKms.find((k) => k > firstMet) : undefined;

  const list = startsHere ? shelterEntries(f, f.ride.departure, stormAroundStart(f)) : null;
  const listInstead = list ? list.filter((e) => e.cover !== null).map((e) => e.cover!) : null;
  const listLines = list ? list.map((e) => e.text) : [];
  const empty = { window: w, covers: [], firstCoverLine: null, none: null, behind: null, listInstead, listLines, notCounted: [] };
  if (startsHere && stormLater === undefined) {
    return { ...empty, m: firstMet, missing: list ? missingFor(f, Math.min(start, f.ride.behindFromKm), Math.max(start, f.ride.behindFromKm), list.some((e) => e.unworked)) : [] };
  }

  const m: Km = stormLater ?? firstMet;
  const thunder = w.kind === 'thunder';
  const tm = f.schedule.atKm(m);
  const hoursOf = hoursLookup(f);
  const spots = spotsOf(f);
  const ahead = spots.filter((s) => s.match.km >= start && s.match.km <= m && !insideRadius(f.ride, s.match.km));
  const lead = (arrival: Date): number => (tm.getTime() - arrival.getTime()) / MIN;

  const judged = ahead.map((spot) => {
    const arrival = f.schedule.atPlace(spot.match);
    return { spot, arrival, lead: lead(arrival), r: coverOfSpot(spot, arrival, w.end, hoursOf) };
  });
  const reached = judged.filter((j) => j.lead >= BAND_MIN - SLACK);
  const counted = reached.flatMap((j) => (isCover(j.r) && counts(thunder, j.r) ? [{ spot: j.spot, cover: j.r, lead: j.lead }] : []));
  const inBand = counted.filter((c) => c.lead <= BAND_MAX + SLACK);
  const covers: Found[] = inBand.length > 0
    ? onePassEach([...inBand].sort(planOrder)).slice(0, MAX_COVERS)
    : counted.sort((a, b) => b.cover.arrival.getTime() - a.cover.arrival.getTime() || planOrder(a, b)).slice(0, 1);

  // Marked and never counted: what lies in the band, or just before m when the band holds nothing.
  const marked = (j: (typeof judged)[number]): j is (typeof judged)[number] & { r: NotCover } =>
    !isCover(j.r) && j.r.listed && (!thunder || hoursDecide(j.spot));
  const scope = reached.filter((j) => inBand.length === 0 || j.lead <= BAND_MAX + SLACK);
  const listed = new Set<unknown>();
  const notCounted = scope.filter(marked)
    .sort((a, b) => a.spot.match.km - b.spot.match.km || finalOrder(a.spot, b.spot))
    .filter((j) => {
      const key = j.spot.place ?? j.spot.roof;
      if (listed.has(key)) return false;
      listed.add(key);
      return true;
    })
    .slice(0, MAX_COVERS)
    .map((j) => ({ placeId: j.spot.place?.id ?? '', km: j.spot.match.km, reason: j.r.notCover }));

  const unworked = judged.some((j) => hoursNotWorkedOut(j.spot, j.arrival, hoursOf));
  const missing: Missing[] = missingFor(f, start, m, unworked);
  const zone = zoneOfSpotKm(f, m);
  const known = savedCovers(f, start, m);
  const about = validDate(tm) && w.detail === '30min' ? formatAbout(tm, zone) : null;
  // A cover the rule doesn't count because it is reached under 15 minutes before m is still there: the words say so, rather than
  // that none is mapped (the rider would be sent back past an open building 600 m on).
  const close = judged
    .filter((j) => j.lead < BAND_MIN - SLACK && j.lead >= 0 && isCover(j.r) && counts(thunder, j.r))
    .sort((a, b) => a.arrival.getTime() - b.arrival.getTime() || finalOrder(a.spot, b.spot))[0];
  const none = covers.length > 0 ? null
    : !known ? W.stopNoPlaceData(showKm(m))
    : close ? `${W.stopNoCoverInBand(showKm(m), about)} · ${W.stopCoverClose(spotName(close.spot), showKm(close.spot.match.km), formatAbout(close.arrival, zoneOfSpot(close.spot, f)))}`
    : W.stopNoCover(showKm(m), about);
  return {
    ...empty, m, covers: covers.map((c) => c.cover),
    firstCoverLine: covers[0] ? firstCoverLine(covers[0], thunder, f) : null,
    none, behind: covers.length > 0 ? null : behindLine(w, thunder, spots, f, hoursOf),
    notCounted, missing,
  };
}

const zoneOfSpotKm = (f: StopFacts, km: Km): string => zoneOfSpot({ place: null, roof: null, match: { placeId: '', km, offRouteM: 0 } }, f);

/**
 * One plan for each likely window on the day's ride within 48 hours. Section 6.11 does not say 48 hours from what: they are
 * counted from now, so an old forecast keeps its plans (section 8). A thunderstorm window always gets one, because a warning
 * promises a plan (INV-07), though section 8's table says "rain beyond 48 h: no plan". An owner question.
 */
export function rainPlans(windows: RainWindow[], f: StopFacts): RainPlan[] {
  if (!f.forecast) return [];
  return onTheRide(windows, f.ride).filter((w) => w.cls === 'likely' && (w.kind === 'thunder' || within48h(w, f.now))).map((w) => rainPlan(w, f));
}

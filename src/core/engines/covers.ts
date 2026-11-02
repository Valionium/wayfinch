// What counts as cover at an arrival time (spec sections 6.0 and 6.11). Tag values come from strangers: they are compared
// or looked up in Maps and Sets, never used as object keys.
import { compareFinal } from '../answers/index.ts';
import { formatHm, isKnownZone } from '../answers/time.ts';
import { openOver, stateAt } from '../hours/check.ts';
import { matchRoofs } from '../route/matches.ts';
import type { Cover, DayRide, Km, Missing, Place, PlaceHours, PlaceKind, Roof, RouteMatch, ScreenInputs } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { rejoinKm } from './locate.ts';
import type { Schedule } from './pace.ts';
import { zoneLookupOf } from './tripday.ts';

export type StopFacts = Pick<ScreenInputs, 'trip' | 'places' | 'matches' | 'roofs' | 'hours' | 'savedKm' | 'forecast' | 'positions' | 'now' | 'routeZones' | 'sun'> & { ride: DayRide; schedule: Schedule };

/** Why something is no cover. `listed`: it is shown after the covers, marked, and never counted. */
export type NotCover = { notCover: string; listed: boolean };

const MIN = 60_000;
const OPEN_MIN = 30;
const SEATED_NO_END_MIN = 60;
const ROOF_M = 300;

const never: NotCover = { notCover: W.stopNotCover, listed: false };
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());
const closedAccess = (p: Place): boolean => p.tags['access'] === 'private' || p.tags['access'] === 'no';

const seatsYes = (p: Place): boolean => p.stop?.indoorSeating === true || p.tags['indoor_seating'] === 'yes';
const seatsNo = (p: Place): boolean => p.stop?.indoorSeating === false || p.tags['indoor_seating'] === 'no';

/** Seats are claimed only with indoor_seating=yes. A missing tag reads "not mapped", never "no". */
export const seatingLine = (p: Place): string => (seatsYes(p) ? W.stopIndoorSeats : W.stopSeatsNotMapped);

const SHOPS_INDOOR: ReadonlySet<string> = new Set(['supermarket', 'convenience', 'bakery']);

/** How an indoor place takes its class. */
function indoorKind(p: Place): 'seated' | 'indoor' | 'seat-only' | null {
  switch (p.kind) {
    case 'restaurant': return 'seated';
    case 'cafe': return p.tags['amenity'] === 'fast_food' ? 'indoor' : 'seated';
    case 'drink': return p.tags['amenity'] === 'biergarten' ? 'seat-only' : 'seated';
    case 'ice_cream': return 'seat-only';
    case 'fuel_shop': return 'indoor';
    case 'shop':
      if (p.tags['shop'] === 'kiosk') return null;
      return SHOPS_INDOOR.has(p.tags['shop'] ?? '') ? 'indoor' : 'seat-only';
    default: return null;
  }
}

const SHELTER_CLASS = new Map<string, (p: Place) => 3 | 4 | 5>([
  ['lean_to', () => 3],
  ['basic_hut', () => 3],
  ['picnic_shelter', () => 4],
  ['weather_shelter', (p) => (p.tags['bench'] === 'yes' ? 4 : 5)],
  ['wetterpilz', (p) => (p.tags['bench'] === 'yes' ? 4 : 5)],
]);

/** The first thing that keeps a place from being open from `t` for `minutes`. */
function whyNot(h: PlaceHours | undefined, t: Date, minutes: number): NotCover {
  const end = t.getTime() + minutes * MIN;
  let at = t;
  for (;;) {
    const s = stateAt(h, at);
    if (s.state === 'closed') return { notCover: W.stopClosedOnArrival, listed: false };
    if (s.state !== 'open') return { notCover: s.reason ?? W.foodHoursUnknown, listed: true };
    if (!s.until || s.until.getTime() >= end || s.until.getTime() <= at.getTime()) return never;
    at = s.until;
  }
}

/** Cover at arrival time `arrival`, or why not. `windowEnd` is the end the window shows, if any. */
export function coverAt(c: { place?: Place; match?: RouteMatch; roof?: Roof }, arrival: Date, windowEnd: Date | null, hours: PlaceHours | undefined): Cover | NotCover {
  const { place, match, roof } = c;
  if (!match || !validDate(arrival)) return never;
  const base = { km: match.km, offRouteM: match.offRouteM, arrival, openUntil: null, lightning: false };
  if (roof) {
    if (!(match.offRouteM <= ROOF_M)) return never;
    return { ...base, placeId: null, roof, coverClass: roof.kind === 'bus_stop' && roof.bench ? 4 : 5 };
  }
  if (!place || closedAccess(place)) return never;
  const near = match.offRouteM <= ROOF_M;

  if (place.kind === 'station') {
    if (!near) return never;
    return place.platformRoof === true ? { ...base, placeId: place.id, roof: null, coverClass: 5 } : { notCover: W.stopStationNoShelter, listed: true };
  }
  if (place.kind === 'shelter') {
    const classOf = SHELTER_CLASS.get(place.tags['shelter_type'] ?? '');
    if (!classOf || !near) return never;
    return { ...base, placeId: place.id, roof: null, coverClass: classOf(place) };
  }

  const kind = indoorKind(place);
  if (!kind || seatsNo(place) || (kind === 'seat-only' && !seatsYes(place))) return never;
  const t = arrival.getTime();
  if (!openOver(hours, arrival, new Date(t + OPEN_MIN * MIN))) return whyNot(hours, arrival, OPEN_MIN);
  const end = windowEnd && validDate(windowEnd) ? Math.max(t + OPEN_MIN * MIN, windowEnd.getTime()) : t + SEATED_NO_END_MIN * MIN;
  const seated = kind === 'seated' || seatsYes(place);
  const coverClass = seated && openOver(hours, arrival, new Date(end)) ? 1 : 2;
  return { ...base, placeId: place.id, roof: null, coverClass, openUntil: stateAt(hours, arrival).until };
}

export const isCover = (r: Cover | NotCover): r is Cover => 'coverClass' in r;

// ---- places and roofs along the route ------------------------------------------------------------------------------

/** One pass of a place or roof along the route. */
export type Spot = { place: Place | null; roof: Roof | null; match: RouteMatch };

const MAY_COVER: ReadonlySet<PlaceKind> = new Set<PlaceKind>(['shop', 'cafe', 'restaurant', 'fuel_shop', 'drink', 'ice_cream', 'shelter', 'station']);

/** Every place and roof that could shelter, one per pass, with readable kilometres and distances. */
export function spotsOf(f: StopFacts): Spot[] {
  const byId = new Map(f.places.map((p) => [p.id, p]));
  const out: Spot[] = [];
  for (const m of f.matches) {
    const place = byId.get(m.placeId);
    if (place && MAY_COVER.has(place.kind) && Number.isFinite(m.km) && m.offRouteM >= 0 && m.offRouteM < Infinity) out.push({ place, roof: null, match: m });
  }
  for (const r of matchRoofs(f.roofs, f.trip.route)) out.push({ place: null, roof: r.roof, match: { placeId: '', km: r.km, offRouteM: r.offRouteM } });
  return out;
}

export const hoursLookup = (f: StopFacts): ((id: string) => PlaceHours | undefined) => {
  const map = new Map(f.hours.map((h) => [h.placeId, h]));
  return (id) => map.get(id);
};

export const coverOfSpot = (s: Spot, arrival: Date, end: Date | null, hoursOf: (id: string) => PlaceHours | undefined): Cover | NotCover =>
  (s.roof ? coverAt({ roof: s.roof, match: s.match }, arrival, end, undefined) : coverAt({ place: s.place!, match: s.match }, arrival, end, hoursOf(s.place!.id)));

/** The final tie-break of section 6, for a place or a roof. */
export const finalOrder = (a: Spot, b: Spot): number => compareFinal((a.place ?? a.roof)!, (b.place ?? b.roof)!);

/** Inside an approximate position's radius: it may already be behind. */
export const insideRadius = (ride: DayRide, km: Km): boolean => ride.startKm < ride.behindFromKm && km >= ride.startKm && km <= ride.behindFromKm;

/** How far a spot lies along the route and off it. */
export const reachKm = (s: Spot, fromKm: Km): number => Math.abs(s.match.km - fromKm) + rejoinKm(s.match.offRouteM);

/** An indoor place, whose cover depends on its hours. */
export const hoursDecide = (s: Spot): boolean => s.place !== null && indoorKind(s.place) !== null;

/** Whether its hours were not worked out for this arrival (section 8 rule 2). */
export function hoursNotWorkedOut(s: Spot, arrival: Date, hoursOf: (id: string) => PlaceHours | undefined): boolean {
  if (!hoursDecide(s)) return false;
  const h = hoursOf(s.place!.id);
  return !h || !(arrival.getTime() >= h.windowStart.getTime() && arrival.getTime() < h.windowEnd.getTime());
}

/** Whether the saved place data covers the stretch from `fromKm` to `toKm`. Broken ranges count for nothing. */
export function savedCovers(f: StopFacts, fromKm: Km, toKm: Km): boolean {
  const ranges = f.savedKm.filter((r) => r.fromKm <= r.toKm).sort((a, b) => a.fromKm - b.fromKm);
  let reached = fromKm;
  let touched = false;
  for (const r of ranges) {
    if (r.fromKm > reached) break;
    if (r.toKm < reached) continue;
    touched = true;
    reached = r.toKm;
  }
  return touched && reached >= toKm;
}

/** What an answer resting on these spots must name as missing. */
export function missingFor(f: StopFacts, fromKm: Km, toKm: Km, unworked: boolean): Missing[] {
  const missing: Missing[] = [];
  if (!savedCovers(f, fromKm, toKm)) missing.push('places');
  if (unworked) missing.push('hours');
  return missing;
}

// ---- what a cover says ---------------------------------------------------------------------------------------------

/** The place's zone, or the route's there when the pack's name is one the phone doesn't know. */
export function zoneOfSpot(s: Spot, f: StopFacts): string {
  if (s.place && isKnownZone(s.place.timeZone)) return s.place.timeZone;
  const tz = zoneLookupOf(f.routeZones)(s.match.km).timeZone;
  return isKnownZone(tz) ? tz : 'UTC';
}

const KIND_WORDS = new Map<PlaceKind, string>([
  ['shop', W.stopWordShop], ['cafe', W.stopWordCafe], ['restaurant', W.stopWordRestaurant], ['fuel_shop', W.stopWordFuel],
  ['drink', W.stopWordDrink], ['ice_cream', W.stopWordIceCream], ['station', W.stopWordStation],
]);
const SHELTER_WORDS = new Map<string, string>([
  ['weather_shelter', W.shelterWordWeather], ['wetterpilz', W.shelterWordWetterpilz], ['picnic_shelter', W.shelterWordPicnic],
  ['lean_to', W.shelterWordLeanTo], ['basic_hut', W.shelterWordHut],
]);

/** What is mapped there, for "Mapped as ..., not checked". */
function whatMapped(s: Spot): string {
  if (s.roof) return s.roof.kind === 'bus_stop' ? W.shelterWordBus : W.shelterWordBike;
  if (s.place!.kind === 'station') return W.shelterWordStation;
  return SHELTER_WORDS.get(s.place!.tags['shelter_type'] ?? '') ?? W.shelterWordRoof;
}

function detailsMapped(s: Spot): string[] {
  if (s.roof) return s.roof.bench ? [W.stopMappedBench] : [];
  const p = s.place!;
  if (p.kind !== 'shelter') return [];
  const type = p.tags['shelter_type'];
  const out: string[] = [];
  if (type === 'lean_to' || type === 'basic_hut') out.push(W.stopMappedWalls);
  if (p.tags['bench'] === 'yes') out.push(W.stopMappedBench);
  if (type === 'picnic_shelter') out.push(W.stopMappedTable);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Oct" from an ISO date. Anything else is no date. */
export function shortMapDate(iso: string | null | undefined): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso ?? '');
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  const day = m ? Number(m[2]) : 0;
  return month && day >= 1 && day <= 31 ? `${day} ${month}` : null;
}

/** The newest date of the map data, for a roof: roofs carry none of their own. */
export const newestMapDate = (f: StopFacts): string | null =>
  f.places.reduce<string | null>((max, p) => (shortMapDate(p.dataDate) && (max === null || p.dataDate > max) ? p.dataDate : max), null);

const kmOff = (s: Spot): string => {
  const off = Math.round(s.match.offRouteM);
  return off > 0 ? W.stopKmOff(showKm(s.match.km), String(off)) : W.stopKm(showKm(s.match.km));
};

export const spotName = (s: Spot): string => s.place?.name ?? (s.place ? KIND_WORDS.get(s.place.kind) ?? W.shelterWordRoof : whatMapped(s));

/** The one line of a cover or marked place, for the chip and the list in a plan's place. */
export function coverLine(s: Spot, r: Cover | NotCover, f: StopFacts): string {
  const date = shortMapDate(s.place?.dataDate ?? newestMapDate(f));
  const dated = date ? [W.stopMapDate(date)] : [];
  const covered = isCover(r);
  const indoor = hoursDecide(s);
  const head = !covered || indoor
    ? [spotName(s), ...(covered ? [openLine(r, s, f), seatingLine(s.place!)] : [])]
    : [W.shelterMappedAs(whatMapped(s)).replace(/\.$/, ''), ...detailsMapped(s)];
  return `${[...head, kmOff(s), ...dated].join(' · ')}.`;
}

const openLine = (c: Cover, s: Spot, f: StopFacts): string =>
  (c.openUntil ? W.stopOpenUntil(formatHm(c.openUntil, zoneOfSpot(s, f))) : W.stopOpenOnArrival);

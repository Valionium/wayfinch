// Leave-by (spec section 6.12): the latest departure that still meets the day's limits. Arrivals move one-for-one with the
// departure, so each limit is a set of departures, worked out from the places' open stretches and never by trying minutes.
// The ride is a parameter, so tomorrow's ride and Trip's chosen day need no change here.
import { compareFinal } from '../answers/index.ts';
import { addDaysIso, instantAt, isKnownZone, formatHm } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { isPublicHoliday, openOnArrival, openOver, openRuns, stateAt } from '../hours/check.ts';
import type { DayRide, Km, LimitId, Place, PlaceHours, RouteMatch, ScreenInputs, SunTimes } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { savedCovers } from './covers.ts';
import { fineLimit } from './daylight.ts';
import { rejoinKm } from './locate.ts';
import { flatLegClockMin, usableFlatKph, type Schedule } from './pace.ts';
import { ridingDate, scheduleFor, zoneLookupOf } from './tripday.ts';
import { findS1S2, hasFuelShop, type WaterFacts } from './water.ts';

export type LeaveFacts = WaterFacts & Pick<ScreenInputs, 'holidays'>;

/** Waiting at a cover: places up to it are reached leaving at `dep`, those beyond it leaving it at the departure tried. */
export type Via = { cover: RouteMatch; dep: Date };

/** A kept food or water limit, as wait or go asks it. */
export type LimitCheck = { id: LimitId; meets(d: Date, via?: Via): boolean; missLine: string | null };

export type LeaveBy = {
  unrounded: Date | null; binding: 'daylight' | 'water' | 'food' | null; kept: LimitId[]; setAside: { id: LimitId; why: string }[];
  limits: { id: LimitId; latest: Date | null; place: string | null; closes: string | null }[]; earliestArrival: Date | null; notCounted: number;
  // The plan's additions, so the card, wait or go and the stop ideas need not recompute them:
  closure: boolean; // the closure limit applies: T1's second clause reads this, so the two can't differ (INV-16)
  stops: RouteMatch[]; // the places the kept limits are met at off the route, before the stop: they add a round trip
  earliest: Date | null; // the earliest departure: now or 04:00
  checks: LimitCheck[]; // the kept food and water limits
  lightAllNight: boolean;
  dataNote: string | null; // why this is daylight only
  waterSources: string[]; // the place ids the water plan limits
};

const MIN = 60_000;
const OPEN_MIN = 30; // open on arrival, and either side of it for water
const AT_STOP_KM = 1;
const LATEST_START = '04:00';

const validDate = (d: Date | null): d is Date => d !== null && Number.isFinite(d.getTime());
type Span = [number, number];

// Tag values come from strangers: they are compared through a Map or Set, never used as object keys.
const FOOD_SHOP_WORDS = new Map<string, string>([
  ['supermarket', W.leavebyWordSupermarket], ['convenience', W.leavebyWordConvenience], ['bakery', W.leavebyWordBakery], ['kiosk', W.leavebyWordKiosk],
]);

/** A food shop of section 6.12: supermarket, convenience store, bakery, kiosk or fuel-station shop. */
export const isFoodShop = (p: Place): boolean =>
  (p.kind === 'shop' && FOOD_SHOP_WORDS.has(p.tags['shop'] ?? '')) || (p.kind === 'fuel_shop' && hasFuelShop(p));

/** A food place or restaurant (section 6.0's food and restaurant rows). Drink places are not. */
export const isFoodPlace = (p: Place): boolean => isFoodShop(p) || p.kind === 'cafe' || p.kind === 'restaurant' || p.kind === 'ice_cream';

/** "supermarket", "bakery", "fuel-station shop": what a place is, in a word. */
export function placeWord(p: Place): string {
  if (p.kind === 'fuel_shop') return W.leavebyWordFuel;
  if (p.kind === 'restaurant') return W.leavebyWordRestaurant;
  if (p.kind === 'cafe') return p.tags['amenity'] === 'fast_food' ? W.leavebyWordFastFood : W.leavebyWordCafe;
  if (p.kind === 'ice_cream') return W.leavebyWordIceCream;
  if (p.kind === 'drink') return W.leavebyWordPub;
  return FOOD_SHOP_WORDS.get(p.tags['shop'] ?? '') ?? W.leavebyWordShop;
}
const namedAt = (p: Place, km: Km): string => W.leavebyPlaceAtKm(placeWord(p), showKm(km));

/** A place has one route match per pass: this tells two passes of one place apart. */
const passKey = (m: RouteMatch): string => `${m.placeId}|${m.km}`;

/** "Open 24/7" only for a place tagged so. A span that merely reaches the prepared window's end says nothing beyond it. */
export const open247 = (p: Place): boolean => p.openingHours?.trim() === '24/7';

/** One pass of a place along the route, with readable figures. */
export type Pass = { place: Place; match: RouteMatch };

// Every engine of one screen asks for the same passes and hours (PERF-SCREEN): worked out once per pair of lists, frozen, so no
// caller can change what the next one reads.
const PASSES = new WeakMap<readonly unknown[], WeakMap<readonly unknown[], readonly Pass[]>>();

export function passesOf(f: Pick<ScreenInputs, 'places' | 'matches'>): readonly Pass[] {
  const kept = PASSES.get(f.places)?.get(f.matches);
  if (kept) return kept;
  const byId = new Map(f.places.map((p) => [p.id, p]));
  const out: Pass[] = [];
  for (const match of f.matches) {
    const place = byId.get(match.placeId);
    if (place && Number.isFinite(match.km) && match.offRouteM >= 0 && match.offRouteM < Infinity) out.push({ place, match });
  }
  const frozen = Object.freeze(out);
  let inner = PASSES.get(f.places);
  if (!inner) PASSES.set(f.places, (inner = new WeakMap()));
  inner.set(f.matches, frozen);
  return frozen;
}

const knownZone = (tz: string): string => (isKnownZone(tz) ? tz : 'UTC');
/** The route's zone at a kilometre, or UTC when its name is one the phone doesn't know. */
export const routeZoneAt = (f: Pick<ScreenInputs, 'routeZones'>, km: Km): string => knownZone(zoneLookupOf(f.routeZones)(km).timeZone);
export const zoneOfPass = (x: Pass, f: Pick<ScreenInputs, 'routeZones'>): string =>
  (isKnownZone(x.place.timeZone) ? x.place.timeZone : routeZoneAt(f, x.match.km));

export const insideRadius = (ride: DayRide, km: Km): boolean => ride.startKm < ride.behindFromKm && km >= ride.startKm && km <= ride.behindFromKm;

const HOURS = new WeakMap<readonly unknown[], (id: string) => PlaceHours | undefined>();

export const hoursIndex = (f: Pick<ScreenInputs, 'hours'>): ((id: string) => PlaceHours | undefined) => {
  const kept = HOURS.get(f.hours);
  if (kept) return kept;
  const map = new Map(f.hours.map((h) => [h.placeId, h]));
  const look = (id: string): PlaceHours | undefined => map.get(id);
  HOURS.set(f.hours, look);
  return look;
};

/** The schedule of a ride. The ride the facts already plan keeps its own, so a place has one arrival on every card. */
const scheduleOf = (f: LeaveFacts, ride: DayRide): Schedule => (ride === f.ride ? f.schedule : scheduleFor(ride, f.trip, { sun: f.sun, routeZones: f.routeZones }));

const isSunday = (date: string): boolean => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** The stop of the ride after this one. */
const nextStopOf = (s: Schedule, stopKm: Km): Km => s.rideOf(stopKm + 1e-6).stopKm;

/** Why the date after the ride counts as closed, if it does: T1 and the closure limit read this one answer. */
export function closingDay(f: LeaveFacts, ride: DayRide): 'sunday' | 'holiday' | null {
  const next = addDaysIso(ride.date, 1);
  if (isSunday(next)) return 'sunday';
  return isPublicHoliday(next, zoneLookupOf(f.routeZones)(ride.stopKm).holidayZone, f.holidays) ? 'holiday' : null;
}

/** The closure limit's condition, which is T1's second clause (INV-16). Never when the day's stop is the route end. */
export function closureApplies(f: LeaveFacts, ride: DayRide): boolean {
  const length = f.trip.route.lengthKm;
  if (!(ride.stopKm < length) || closingDay(f, ride) === null) return false;
  const s = scheduleOf(f, ride);
  const hoursOf = hoursIndex(f);
  const next = nextStopOf(s, ride.stopKm);
  return !passesOf(f).some((x) => isFoodPlace(x.place) && x.match.km > ride.stopKm && x.match.km <= next && openOnArrival(hoursOf(x.place.id), s.atPlace(x.match)));
}

// ---- sets of departures --------------------------------------------------------------------------------------------

const intersect = (a: Span[], b: Span[]): Span[] => {
  const out: Span[] = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) {
    const from = Math.max(a0, b0);
    const to = Math.min(a1, b1);
    if (from <= to) out.push([from, to]);
  }
  return out;
};
const latestOf = (spans: Span[]): number | null => (spans.length === 0 ? null : Math.max(...spans.map((s) => s[1])));
const shifted = (spans: Span[], by: number): Span[] => spans.map(([a, b]) => [a - by, b - by]);

type Source = Pass & { arrivals: Span[]; runs: Span[] };
/** Food: the arrivals that are open from arrival until 30 minutes after. */
const foodArrivals = (runs: Span[]): Span[] => runs.flatMap(([a, b]) => (b - OPEN_MIN * MIN >= a ? [[a, b - OPEN_MIN * MIN] as Span] : []));
/** Water: open from 30 minutes before arrival to 30 minutes after. */
const waterArrivals = (runs: Span[]): Span[] => runs.flatMap(([a, b]) => (b - OPEN_MIN * MIN >= a + OPEN_MIN * MIN ? [[a + OPEN_MIN * MIN, b - OPEN_MIN * MIN] as Span] : []));

/** What leave-by works from, for one ride. */
type Plan = {
  f: LeaveFacts; ride: DayRide; s: Schedule; stop: Km; sun: SunTimes; limit: Date | null; window: Span; earliest: Date;
  water: Source[]; food: Source[]; foodId: LimitId | null; notCounted: number; closure: boolean; dataNote: string | null;
};

/** Stopping at these places: the ones before the day's stop add their round trip, each once. */
function through(p: Plan, stops: RouteMatch[]): Schedule {
  let s = p.s;
  const seen = new Set<string>();
  for (const m of stops) {
    const key = passKey(m);
    if (m.km < p.stop && !seen.has(key)) s = s.through(m);
    seen.add(key);
  }
  return s;
}

/** The arrival at a place on a schedule. One past the day's stop is reached riding on from it, that evening (section 6.2a). */
function arrivalOn(p: Plan, s: Schedule, m: RouteMatch): Date {
  return arrivalRidingOn(s, p.stop, p.f.trip.flatKph, m);
}

const offsetOf = (p: Plan, s: Schedule, m: RouteMatch): number => arrivalOn(p, s, m).getTime() - p.s.departure.getTime();
const stopOffset = (p: Plan, s: Schedule): number => s.atKm(p.stop).getTime() - p.s.departure.getTime();

/** Which limits a try keeps. */
type Keep = { daylight: boolean; water: boolean; food: boolean };

/** The latest departure that meets these limits, stopping at this food place; null when none does. */
function latestWith(p: Plan, keep: Keep, food: Source | null): number | null {
  const stops = [...(keep.water ? p.water.map((w) => w.match) : []), ...(food ? [food.match] : [])];
  const s = through(p, stops);
  let spans: Span[] = [p.window];
  if (keep.daylight) {
    if (!validDate(p.limit)) return null;
    spans = intersect(spans, [[-Infinity, p.limit.getTime() - stopOffset(p, s)]]);
  }
  if (keep.water) for (const w of p.water) spans = intersect(spans, shifted(w.arrivals, offsetOf(p, s, w.match)));
  if (food) spans = intersect(spans, shifted(food.arrivals, offsetOf(p, s, food.match)));
  return latestOf(spans);
}

/** The best departure for these limits, and the food place it is met at. On a tie, the shorter detour, then route order. */
function bestWith(p: Plan, keep: Keep): { d: number; food: Source | null } | null {
  if (!keep.food) {
    const d = latestWith(p, keep, null);
    return d === null ? null : { d, food: null };
  }
  let best: { d: number; food: Source } | null = null;
  for (const food of p.food) {
    const d = latestWith(p, keep, food);
    if (d === null) continue;
    if (!best || d > best.d || (d === best.d && food.match.offRouteM < best.food.match.offRouteM)) best = { d, food };
  }
  return best;
}

const openRunsOf = (h: PlaceHours | undefined): Span[] => openRuns(h).map((r) => [r.from.getTime(), r.to.getTime()]);

/** The arrival at a place on the day's ride, or riding on from its stop: what every card says for that place. */
export function arrivalRidingOn(s: Schedule, stop: Km, flatKph: number, m: RouteMatch): Date {
  if (m.km <= stop) return s.atPlace(m);
  return new Date(s.ridingOnAt(m.km).getTime() + flatLegClockMin(rejoinKm(m.offRouteM), flatKph, s.r) * MIN);
}

/** The closing of the open stretch holding an arrival, on the place's clock. */
const closesAt = (src: Source, arrival: number): number | null => src.runs.find(([a, b]) => arrival >= a && arrival < b)?.[1] ?? null;

// ---- the plan of a ride --------------------------------------------------------------------------------------------

function sunOfStop(f: LeaveFacts, ride: DayRide): SunTimes {
  const { lat, lon } = pointAtRouteKm(f.trip.route, ride.stopKm);
  return f.sun(lat, lon, ride.date);
}

/** Written so that a time that is no time fails. */
export const sunReadable = (sun: SunTimes): boolean =>
  sun.lightAllNight || ([sun.sunset, sun.dusk].every((t) => t === null || validDate(t)));


function dataNoteOf(f: LeaveFacts, ride: DayRide): string | null {
  const nothingSaved = f.savedKm.length === 0 || (f.places.length > 0 && f.hours.length === 0);
  if (nothingSaved) return W.leavebyNeedsGetReady;
  return savedCovers(f, ride.startKm, ride.stopKm) ? null : W.leavebyNoPlaceData;
}

function planOf(f: LeaveFacts, ride: DayRide): Plan {
  const s = scheduleOf(f, ride);
  const stop = ride.stopKm;
  const sun = sunOfStop(f, ride);
  const tz = routeZoneAt(f, ride.startKm);
  const from = instantAt(ride.date, LATEST_START, tz).getTime();
  const to = instantAt(addDaysIso(ride.date, 1), '00:00', tz).getTime();
  const today = validDate(f.now) && ridingDate(f.now, zoneLookupOf(f.routeZones)(0).timeZone) === ride.date;
  const earliest = new Date(today ? Math.max(from, f.now.getTime()) : from);
  const hoursOf = hoursIndex(f);
  const dataNote = dataNoteOf(f, ride);
  const base: Plan = {
    f, ride, s, stop, sun, limit: sun.lightAllNight ? null : fineLimit(sun, s.ridingMinTo(stop)), window: [from, to], earliest,
    water: [], food: [], foodId: null, notCounted: 0, closure: false, dataNote,
  };
  if (dataNote !== null) return base;

  // The water plan: S1 and S2 as the Water card finds them, on tomorrow's ride alone after the day's ride.
  const facts: WaterFacts = { ...f, ride, schedule: s };
  const { s1, s2 } = findS1S2(facts, { tomorrowOnly: ride.phase === 'after-ride' });
  const seen = new Set<string>(); // one per pass: a place passed twice is two sources, each judged at its own arrival
  const water: Source[] = [];
  for (const t of [s1, s2]) {
    if (t.kind !== 'place' || !(t.km < stop) || (t.place.waterClass === 'A' && !t.place.indoorOrLimited) || seen.has(passKey(t.match))) continue;
    seen.add(passKey(t.match));
    const runs = openRunsOf(hoursOf(t.place.id));
    water.push({ place: t.place, match: t.match, runs, arrivals: waterArrivals(runs) });
  }

  // The food limit that applies, and the places that can meet it.
  const closure = closureApplies(f, ride);
  const outdoors = f.trip.stay === 'camping' || f.trip.stay === 'mixed';
  const foodId: LimitId | null = closure ? 'food-closure' : outdoors ? 'food-tonight' : null;
  const onRide = (x: Pass): boolean => x.match.km >= ride.startKm && x.match.km <= stop + AT_STOP_KM && !insideRadius(ride, x.match.km);
  const nearStop = (x: Pass): boolean => Math.abs(x.match.km - stop) <= AT_STOP_KM;
  const counts = (x: Pass): boolean => onRide(x) && (isFoodShop(x.place) || (foodId === 'food-tonight' && isFoodPlace(x.place) && nearStop(x)));
  const food: Source[] = [];
  const unknown = new Set<string>();
  if (foodId !== null) {
    for (const x of passesOf(f)) {
      if (!counts(x)) continue;
      const h = hoursOf(x.place.id);
      const runs = openRunsOf(h);
      const state = stateAt(h, arrivalOn(base, s, x.match)).state;
      if (state === 'unknown' || state === 'possibly-closed') unknown.add(x.place.id);
      // Food before the closing day, or for tonight, is bought that day: tomorrow morning's opening meets neither.
      if (runs.length > 0) food.push({ ...x, runs, arrivals: intersect(foodArrivals(runs), [[-Infinity, to]]) });
    }
  }
  // Route order, then the final tie-break: places that tie on their latest departure come out the same however the list came.
  food.sort((a, b) => a.match.km - b.match.km || compareFinal(a.place, b.place));
  return { ...base, water, food, foodId, notCounted: unknown.size, closure };
}

// ---- wording of the limits -----------------------------------------------------------------------------------------

export const closingWord = (day: 'sunday' | 'holiday' | null): string => (day === 'holiday' ? W.leavebyTheHoliday : W.leavebySunday);

const rideWord = (ride: DayRide): string => {
  if (ride.phase === 'before-trip') return W.leavebyRideDayOne;
  return ride.phase === 'after-ride' ? W.leavebyRideTomorrow : W.leavebyRideToday;
};

const notCountedLine = (n: number): string => (n === 1 ? W.leavebyOneUnknown : W.leavebyManyUnknown(n));

function noFoodLine(p: Plan): string {
  const base = p.foodId === 'food-closure'
    ? W.leavebyNoFoodBefore(rideWord(p.ride), closingWord(closingDay(p.f, p.ride)))
    : W.leavebyNoFoodTonight(rideWord(p.ride));
  return p.notCounted > 0 ? `${base} · ${notCountedLine(p.notCounted)}` : base;
}

const until = (src: Source, end: number | null, f: LeaveFacts): string | null => (end === null ? null : formatHm(new Date(end), zoneOfPass(src, f)));

/** When it closes on the ride's date: the last open stretch of that day, not of the whole prepared window. */
function latestEnd(p: Plan, src: Source): number | null {
  const today = src.runs.filter(([a, b]) => a < p.window[1] && b > p.window[0]);
  return today[today.length - 1]?.[1] ?? null;
}

// ---- leaveBy -------------------------------------------------------------------------------------------------------

const nothing = (earliest: Date | null, dataNote: string | null): LeaveBy => ({
  unrounded: null, binding: null, kept: [], setAside: [], limits: [], earliestArrival: null, notCounted: 0, closure: false, stops: [],
  earliest, checks: [], lightAllNight: false, dataNote, waterSources: [],
});

function checkOf(p: Plan, id: LimitId, sources: Source[], allOf: boolean, stops: RouteMatch[], isOpenAt: (src: Source, arrival: Date) => boolean, missLine: string | null): LimitCheck {
  return {
    id, missLine,
    meets(d, via) {
      if (!validDate(d)) return false;
      const reach = (src: Source): Date => {
        const plain = through(p, stops).withDeparture(d);
        if (!via) return arrivalOn(p, plain, src.match);
        const atDep = through(p, stops).withDeparture(via.dep);
        const arrivedCover = atDep.atPlace(via.cover).getTime();
        if (src.match.km <= via.cover.km) return arrivalOn(p, atDep, src.match);
        const waited = d.getTime() - arrivedCover;
        return arrivalOn(p, through(p, [...stops, via.cover]).withDeparture(new Date(via.dep.getTime() + waited)), src.match);
      };
      return allOf ? sources.every((src) => isOpenAt(src, reach(src))) : sources.some((src) => isOpenAt(src, reach(src)));
    },
  };
}

const waterOpen = (h: (id: string) => PlaceHours | undefined) => (src: Source, t: Date): boolean => openOver(h(src.place.id), new Date(t.getTime() - OPEN_MIN * MIN), new Date(t.getTime() + OPEN_MIN * MIN));
const foodOpen = (h: (id: string) => PlaceHours | undefined, dayEnd: number) => (src: Source, t: Date): boolean => t.getTime() <= dayEnd && openOnArrival(h(src.place.id), t);

/** The best two food places by their own latest departure, a supermarket first. */
function bestTwo(p: Plan, keep: Keep): { src: Source; latest: number }[] {
  const scored = p.food.flatMap((src) => {
    const latest = latestWith(p, { ...keep, food: true }, src);
    return latest === null ? [] : [{ src, latest }];
  }).sort((a, b) => b.latest - a.latest);
  const seen = new Set<string>();
  const two = scored.filter(({ src }) => {
    if (seen.has(src.place.id)) return false;
    seen.add(src.place.id);
    return true;
  }).slice(0, 2);
  return two.sort((a, b) => Number(b.src.place.tags['shop'] === 'supermarket') - Number(a.src.place.tags['shop'] === 'supermarket'));
}

/** The latest departure for a ride, with what it keeps and what it sets aside. */
export function leaveBy(f: LeaveFacts, ride: DayRide): LeaveBy {
  if (f.trip.departureDate === null || !usableFlatKph(f.trip.flatKph) || !validDate(ride.departure) || ride.phase === 'route-end' || ride.noRide) return nothing(null, null);
  const p = planOf(f, ride);
  if (!sunReadable(p.sun)) return nothing(p.earliest, p.dataNote);

  const light = p.sun.lightAllNight;
  const earliestArrival = p.s.withDeparture(p.earliest).atKm(p.stop);
  const common = { earliestArrival, notCounted: p.notCounted, closure: p.closure, earliest: p.earliest, lightAllNight: light, dataNote: p.dataNote };

  const hasWater = p.water.length > 0;
  const hasFood = p.foodId !== null;
  const tries: Keep[] = [
    { daylight: !light, water: hasWater, food: hasFood },
    { daylight: !light, water: hasWater, food: false },
    { daylight: !light, water: false, food: hasFood },
    { daylight: !light, water: false, food: false },
  ];

  // Daylight is never set aside: with no departure that meets it, there is no leave-by.
  if (!light && bestWith(p, tries[3]!) === null) {
    return { ...nothing(p.earliest, p.dataNote), ...common, limits: [{ id: 'daylight', latest: null, place: null, closes: null }], waterSources: [...new Set(p.water.map((w) => w.place.id))] };
  }

  let keep = tries[3]!;
  let found: { d: number; food: Source | null } = { d: p.window[1], food: null };
  for (const t of tries) {
    const r = bestWith(p, t);
    if (r) {
      keep = t;
      found = r;
      break;
    }
  }

  const kept: LimitId[] = [];
  if (keep.daylight) kept.push('daylight');
  if (keep.water) kept.push('water');
  if (keep.food) kept.push(p.foodId!);

  const stopsAll = [...(keep.water ? p.water.map((w) => w.match) : []), ...(found.food ? [found.food.match] : [])];
  const planned = through(p, stopsAll);
  const stops = dedupeStops(stopsAll.filter((m) => m.km < p.stop && m.offRouteM > 0));
  const hoursOf = hoursIndex(f);

  // Which limit binds: the first, in the order of ties, that a moment later breaks.
  const after = found.d + 1000;
  const daylightBreaks = keep.daylight && p.limit !== null && after > p.limit.getTime() - stopOffset(p, planned);
  const waterBreaks = keep.water && !p.water.every((w) => inSpans(shifted(w.arrivals, offsetOf(p, planned, w.match)), after));
  const foodBreaks = keep.food && !p.food.some((src) => latestAtLeast(p, keep, src, after));
  // A moment later breaks them only together (each food place then needs its own round trip): name the one that is left.
  const together: LeaveBy['binding'] = found.d >= p.window[1] ? null : keep.food ? 'food' : keep.water ? 'water' : keep.daylight ? 'daylight' : null;
  const binding: LeaveBy['binding'] = daylightBreaks ? 'daylight' : waterBreaks ? 'water' : foodBreaks ? 'food' : together;
  const unrounded = binding === null ? null : new Date(found.d);

  // Each limit's own latest start: no later than daylight allows, or a window after dark would read as the limit.
  const ceiling = keep.daylight && p.limit !== null ? p.limit.getTime() - stopOffset(p, planned) : p.window[1];
  const limits: LeaveBy['limits'] = [];
  if (!light) limits.push({ id: 'daylight', latest: p.limit === null ? null : new Date(p.limit.getTime() - stopOffset(p, planned)), place: null, closes: null });
  for (const w of p.water) {
    const own = latestOf(intersect(intersect([p.window], shifted(w.arrivals, offsetOf(p, planned, w.match))), [[-Infinity, ceiling]]));
    limits.push({ id: 'water', latest: own === null ? null : new Date(own), place: namedAt(w.place, w.match.km), closes: own === null ? until(w, latestEnd(p, w), f) : until(w, closesAt(w, closesFor(p, planned, w, own)), f) });
  }
  if (p.foodId !== null) {
    const two = bestTwo(p, { ...keep, water: keep.water });
    if (two.length === 0) limits.push({ id: p.foodId, latest: null, place: null, closes: null });
    for (const { src, latest } of two) {
      const sched = through(p, [...(keep.water ? p.water.map((w) => w.match) : []), src.match]);
      limits.push({ id: p.foodId, latest: new Date(latest), place: namedAt(src.place, src.match.km), closes: until(src, closesAt(src, closesFor(p, sched, src, latest)), f) });
    }
  }
  limits.sort((a, b) => Number(isBinding(b.id, binding)) - Number(isBinding(a.id, binding)));

  // What was set aside, and why.
  const setAside: LeaveBy['setAside'] = [];
  const noDepartures = (src: Source): boolean => latestWith(p, { daylight: false, water: false, food: true }, src) === null;
  if (hasFood && !keep.food) {
    const reason = p.food.length === 0 || p.food.every(noDepartures)
      ? noFoodLine(p)
      : cantTogether(p, bestAlone(p), keep);
    setAside.push({ id: p.foodId!, why: reason });
  }
  if (hasWater && !keep.water) {
    const w = p.water[0]!;
    setAside.push({ id: 'water', why: cantTogether(p, w, keep) });
  }

  const checks: LimitCheck[] = [];
  if (keep.water) {
    for (const w of p.water) {
      const line = W.waitMissing(placeWord(w.place), showKm(w.match.km), until(w, closesAt(w, closesFor(p, planned, w, found.d)), f) ?? until(w, latestEnd(p, w), f) ?? '');
      checks.push(checkOf(p, 'water', [w], true, p.water.map((x) => x.match), waterOpen(hoursOf), line));
    }
  }
  if (keep.food) {
    const src = found.food!;
    const line = W.waitMissing(placeWord(src.place), showKm(src.match.km), until(src, closesAt(src, closesFor(p, planned, src, found.d)), f) ?? until(src, latestEnd(p, src), f) ?? '');
    checks.push(checkOf(p, p.foodId!, p.food, false, keep.water ? p.water.map((x) => x.match) : [], foodOpen(hoursOf, p.window[1]), line));
  }

  return {
    ...common, unrounded, binding, kept, setAside, limits, stops, checks,
    waterSources: [...new Set(p.water.map((w) => w.place.id))],
  };
}

const closesFor = (p: Plan, s: Schedule, src: Source, d: number): number => d + offsetOf(p, s, src.match);
const inSpans = (spans: Span[], t: number): boolean => spans.some(([a, b]) => t >= a && t <= b);
const latestAtLeast = (p: Plan, keep: Keep, src: Source, t: number): boolean => {
  const stops = [...(keep.water ? p.water.map((w) => w.match) : []), src.match];
  return inSpans(shifted(src.arrivals, offsetOf(p, through(p, stops), src.match)), t);
};
const isBinding = (id: LimitId, binding: LeaveBy['binding']): boolean =>
  (binding === 'daylight' && id === 'daylight') || (binding === 'water' && id === 'water') || (binding === 'food' && (id === 'food-closure' || id === 'food-tonight'));

function dedupeStops(list: RouteMatch[]): RouteMatch[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = passKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The food place that can be left for latest, on its own. */
function bestAlone(p: Plan): Source {
  let best = p.food[0]!;
  let at = -Infinity;
  for (const src of p.food) {
    const d = latestWith(p, { daylight: false, water: false, food: true }, src);
    if (d !== null && d > at) {
      at = d;
      best = src;
    }
  }
  return best;
}

function cantTogether(p: Plan, src: Source, keep: Keep): string {
  const end = latestEnd(p, src);
  const closes = end === null ? '' : formatHm(new Date(end), zoneOfPass(src, p.f));
  return W.leavebyCantTogether(placeWord(src.place), showKm(src.match.km), closes, keep.water ? W.leavebyTheWaterPlan : W.leavebyDaylightName);
}

/** One limit on its own: what a card or wait or go asks of it. */
export function limitFor(id: LimitId, f: LeaveFacts): { meets(d: Date): boolean; latest: Date | null } {
  const none = { meets: () => false, latest: null };
  if (f.trip.departureDate === null || !usableFlatKph(f.trip.flatKph) || !validDate(f.ride.departure)) return none;
  const p = planOf(f, f.ride);
  const hoursOf = hoursIndex(f);
  if (id === 'daylight') {
    if (p.sun.lightAllNight) return { meets: () => true, latest: null };
    if (!sunReadable(p.sun)) return none;
    const latest = latestWith(p, { daylight: true, water: false, food: false }, null);
    if (latest === null || !validDate(p.limit)) return none;
    const limit = p.limit;
    return { meets: (d) => p.s.withDeparture(d).atKm(p.stop).getTime() <= limit.getTime(), latest: new Date(latest) };
  }
  if (id === 'water') {
    if (p.water.length === 0) return none;
    const latest = latestWith(p, { daylight: false, water: true, food: false }, null);
    const check = checkOf(p, 'water', p.water, true, p.water.map((x) => x.match), waterOpen(hoursOf), null);
    return { meets: (d) => check.meets(d), latest: latest === null ? null : new Date(latest) };
  }
  if (p.foodId !== id || p.food.length === 0) return none;
  const latest = bestWith(p, { daylight: false, water: false, food: true });
  const check = checkOf(p, id, p.food, false, [], foodOpen(hoursOf, p.window[1]), null);
  return { meets: (d) => check.meets(d), latest: latest === null ? null : new Date(latest.d) };
}

/** "km 150 · 72 km": the day's stop and its distance, with the rejoin leg. */
export const stopStamp = (ride: DayRide): string => W.leavebyStamp(showKm(ride.stopKm), showKm(ride.stopKm - ride.startKm + rejoinKm(ride.startOffRouteM)));

/** The closing of the place a kept limit binds at, for the title. */
export function bindingPlace(f: LeaveFacts, ride: DayRide, r: LeaveBy): { word: string; km: Km; closes: string } | null {
  if (r.unrounded === null || (r.binding !== 'water' && r.binding !== 'food')) return null;
  const p = planOf(f, ride);
  const all = r.binding === 'water' ? p.water : p.food;
  const s = through(p, r.kept.includes('water') ? p.water.map((w) => w.match) : []);
  const at = r.unrounded.getTime();
  for (const src of all) {
    const sched = r.binding === 'water' ? s : through(p, [...(r.kept.includes('water') ? p.water.map((w) => w.match) : []), src.match]);
    const arrival = at + offsetOf(p, sched, src.match);
    const end = closesAt(src, arrival);
    if (end !== null && inSpans(src.arrivals, arrival) && !inSpans(src.arrivals, arrival + 1000)) {
      return { word: placeWord(src.place), km: src.match.km, closes: formatHm(new Date(end), zoneOfPass(src, f)) };
    }
  }
  return null;
}

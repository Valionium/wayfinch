// Reliable sources, the reach rule and the Water card (spec sections 6.0, 6.3, 3.2 and 6.2a). This is the rider's safety
// margin, so every "good" answer is reached by a positive test: anything non-finite stops at `finite()` or fails a
// comparison written so that NaN lands on the careful side.
import { compareFinal, formatAbout, makeAnswer } from '../answers/index.ts';
import { isKnownZone, localIsoDate } from '../answers/time.ts';
import { bearingDeg } from '../geo/bearing.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { openWaterWindow, stateAt } from '../hours/check.ts';
import type { Answer, AnswerItem, DayRide, Km, Missing, Place, PlaceHours, RouteMatch, ScreenInputs, SunSource, Trip } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { LOAD_PENALTY } from '../route/stages.ts';
import { newestMapDate } from './covers.ts';
import { isFarOff, latestPosition, positionOrder, rejoinKm } from './locate.ts';
import { flatLegClockMin, flatLegRidingMin, usableFlatKph, type Schedule } from './pace.ts';
import { nowSchedule, ridingDate, zoneLookupOf } from './tripday.ts';
import { uncertainty } from './water-learning.ts';
import { capacityFrom, lapse, masses, outsideRange, planningWeather, riderPower, routeHeight, stopRate, sweatRate, type PlanningWeather, type Section } from './water-model.ts';

/** `positions`, `now` and `routeZones` go beyond the plan's list: the default's expiry and tonight's water need them. */
export type WaterFacts = Pick<ScreenInputs, 'places' | 'matches' | 'hours' | 'savedKm' | 'forecast' | 'baseline' | 'profile' | 'loadSummary' | 'waterLeft' | 'positions' | 'now' | 'routeZones'>
  & { trip: Trip; ride: DayRide; schedule: Schedule; sun: SunSource };

/** A place, or point E: the route end or the edge of the place data. `tonight` is timed for riding there now. */
export type Target =
  | { kind: 'place'; place: Place; match: RouteMatch; km: Km; arrival: Date; tonight: boolean; back: boolean }
  | { kind: 'end'; km: Km }
  | { kind: 'edge'; km: Km };

const MIN = 60_000;
const HOUR = 3_600_000;
const BREAK_SHARE = 0.15;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

// ---- Sources (section 6.0) -----------------------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// A Map, not an object: these values are tags from strangers, and "constructor" must find nothing.
const SEASONS = new Map([['spring', [3, 4, 5]], ['summer', [6, 7, 8]], ['autumn', [9, 10, 11]], ['winter', [12, 1, 2]]]);
const monthOf = (word: string): number | null => {
  const w = word.trim().toLowerCase();
  const i = Math.max(MONTHS.indexOf(w), FULL_MONTHS.indexOf(w));
  return i < 0 ? null : i + 1;
};

/** A seasonal tag's window: 'year-round' for "no"; months and how to show them; null when it gives no window. */
export function seasonalWindow(value: string | null): 'year-round' | { months: Set<number>; label: string } | null {
  const text = value?.trim();
  if (!text) return null;
  if (text.toLowerCase() === 'no') return 'year-round';
  const months = new Set<number>();
  for (const token of text.split(/[;,]/)) {
    const word = token.trim().toLowerCase();
    const season = SEASONS.get(word);
    if (season) { season.forEach((m) => months.add(m)); continue; }
    const [from, to, extra] = word.split('-').map((w) => monthOf(w));
    if (from === null || from === undefined || to === null || extra !== undefined) return null;
    const end = to ?? from;
    for (let m = from; ; m = (m % 12) + 1) {
      months.add(m);
      if (m === end) break;
    }
  }
  return { months, label: text.replace(/-/g, '–') };
}

const monthIn = (t: Date, tz: string): number => Number(localIsoDate(t, tz).slice(5, 7));
/** The place's zone; one the time-zone data don't know gives way to the route's, so it can't take the card down. */
const zoneOf = (place: Place, km: Km, f: WaterFacts): string => (isKnownZone(place.timeZone) ? place.timeZone : zoneLookupOf(f.routeZones)(km).timeZone);
const WINTER_MONTHS = new Set([11, 12, 1, 2, 3]);

/** 1 November-31 March on the place's calendar, or a month whose 10th-percentile low at the route's height is at or below 0 °C. */
function isWinter(place: Place, match: RouteMatch, arrival: Date, f: WaterFacts): boolean {
  const month = monthIn(arrival, zoneOf(place, match.km, f));
  if (WINTER_MONTHS.has(month)) return true;
  const points = (f.baseline?.points ?? []).filter((p) => p.month === month);
  let nearest: (typeof points)[number] | null = null;
  for (const p of points) {
    if (Number.isFinite(p.km) && (!nearest || Math.abs(p.km - match.km) < Math.abs(nearest.km - match.km))) nearest = p;
  }
  // A month the baseline has, but only with broken points: the point needs proof that it is on.
  if (!nearest) return points.length > 0;
  // Written so that a low that is no number counts as winter: the point then needs proof that it is on.
  return !(nearest.p10LowC + lapse(nearest.eleM, routeHeight(f.trip.route, match.km)) > 0);
}

const hoursIndex = new WeakMap<PlaceHours[], Map<string, PlaceHours>>();
function hoursOf(place: Place, f: WaterFacts): PlaceHours | undefined {
  let index = hoursIndex.get(f.hours);
  if (!index) {
    index = new Map(f.hours.map((h) => [h.placeId, h]));
    hoursIndex.set(f.hours, index);
  }
  return index.get(place.id);
}

type Verdict = { reliable: boolean; reason: string | null };
const RELIABLE: Verdict = { reliable: true, reason: null };
const uncertain = (reason: string): Verdict => ({ reliable: false, reason });

function byHours(place: Place, arrival: Date, f: WaterFacts): Verdict {
  if (f.trip.departureDate === null) return uncertain(W.waterNoDate);
  const h = hoursOf(place, f);
  if (openWaterWindow(h, arrival)) return RELIABLE;
  const at = stateAt(h, arrival);
  if (at.state === 'closed') return uncertain(at.reason ?? W.waterClosedAtArrival);
  if (at.state === 'open') return uncertain(W.waterNotOpenAllWindow);
  return uncertain(at.reason ?? W.foodHoursUnknown);
}

function outdoorA(place: Place, match: RouteMatch, arrival: Date, f: WaterFacts): Verdict {
  const window = seasonalWindow(place.seasonal);
  if (window === 'year-round') return RELIABLE;
  if (f.trip.departureDate === null) return window ? uncertain(W.waterNoDate) : RELIABLE;
  if (window) return window.months.has(monthIn(arrival, zoneOf(place, match.km, f))) ? RELIABLE : uncertain(W.waterSeasonal(window.label));
  if (!isWinter(place, match, arrival, f)) return RELIABLE;
  return openWaterWindow(hoursOf(place, f), arrival) ? RELIABLE : uncertain(W.waterMaybeOffForWinter);
}

export const hasFuelShop = (place: Place): boolean => {
  const shop = place.tags['shop'];
  return shop !== undefined && shop !== 'no' && place.tags['automated'] !== 'yes';
};
const SHOP_KINDS = new Set<Place['kind']>(['shop', 'cafe', 'fuel_shop']);
/** The shops of section 6.0. Any other shop tag is nothing Food would count, so Water can't count it either (INV-03). */
const FOOD_SHOP_TAGS: ReadonlySet<string> = new Set(['supermarket', 'convenience', 'bakery', 'kiosk']);
const filterCarried = (f: WaterFacts): boolean => f.loadSummary !== null && !('empty' in f.loadSummary) && f.loadSummary.kit.waterFilter === true;

/** Whether this place is a reliable source at this arrival, or why not. The class decides, not the kind. */
export function sourceAt(place: Place, match: RouteMatch, arrival: Date, f: WaterFacts): Verdict {
  if (!validDate(arrival) && f.trip.departureDate !== null) return uncertain(W.foodHoursUnknown);
  switch (place.waterClass) {
    case 'B': return uncertain(W.waterClassB);
    case 'C': return uncertain(filterCarried(f) ? W.waterWithFilter : W.waterClassC);
    case 'D': return uncertain(W.waterClassD);
    default: break;
  }
  if (place.kind === 'fuel_shop' && !hasFuelShop(place)) return uncertain(W.waterNoShop);
  if (place.waterClass === 'A') return place.indoorOrLimited ? byHours(place, arrival, f) : outdoorA(place, match, arrival, f);
  if (place.kind === 'shop' && !FOOD_SHOP_TAGS.has(place.tags['shop'] ?? '')) return uncertain(W.waterNotASource);
  return SHOP_KINDS.has(place.kind) ? byHours(place, arrival, f) : uncertain(W.waterNotASource);
}

/** Whether a place may give water at all: what the card lists and the walk looks at. */
const mayGiveWater = (p: Place): boolean => (p.waterClass !== null && p.waterClass !== 'D') || SHOP_KINDS.has(p.kind);

// ---- S1 and S2 -----------------------------------------------------------------------------------------------------

/** The saved stretches that are real numbers. A range without a real end is no data. */
const savedRanges = (f: WaterFacts): WaterFacts['savedKm'] => f.savedKm.filter((r) => Number.isFinite(r.fromKm) && Number.isFinite(r.toKm) && r.fromKm <= r.toKm);

/** E: the route end, or the first kilometre from `fromKm` without saved place data, whichever comes first. */
function pointE(f: WaterFacts, fromKm: Km): Target {
  const length = f.trip.route.lengthKm;
  let cursor = fromKm;
  const ranges = savedRanges(f).sort((a, b) => a.fromKm - b.fromKm);
  for (const r of ranges) if (r.fromKm <= cursor && r.toKm > cursor) cursor = r.toKm;
  const inside = ranges.some((r) => r.fromKm <= fromKm && r.toKm >= fromKm);
  if (!inside) return fromKm >= length ? { kind: 'end', km: length } : { kind: 'edge', km: fromKm };
  return cursor >= length ? { kind: 'end', km: length } : { kind: 'edge', km: cursor };
}

type Candidate = { place: Place; match: RouteMatch };

/** Water-giving places by route kilometre, one entry per pass; broken matches are left out. */
const candidateCache = new WeakMap<RouteMatch[], { places: Place[]; list: Candidate[] }>();
function candidatesOf(f: WaterFacts): Candidate[] {
  const cached = candidateCache.get(f.matches);
  if (cached?.places === f.places) return cached.list;
  const byId = new Map(f.places.filter(mayGiveWater).map((p) => [p.id, p]));
  const list: Candidate[] = [];
  for (const match of f.matches) {
    const place = byId.get(match.placeId);
    if (place && Number.isFinite(match.km) && Number.isFinite(match.offRouteM)) list.push({ place, match });
  }
  list.sort((a, b) => a.match.km - b.match.km || compareFinal(a.place, b.place));
  candidateCache.set(f.matches, { places: f.places, list });
  return list;
}

const insideRadius = (ride: DayRide, km: Km): boolean => ride.startKm < ride.behindFromKm && km >= ride.startKm && km <= ride.behindFromKm;
const afterTheRide = (f: WaterFacts): boolean => f.ride.phase === 'after-ride' && !f.ride.noRide;
const atRouteEnd = (f: WaterFacts): boolean => f.ride.phase === 'route-end' || f.ride.noRide;

const nowEnv = (f: WaterFacts): Schedule => nowSchedule(f.ride, f.trip, f.now, { sun: f.sun, routeZones: f.routeZones });

/** The arrival for riding there now: ahead or back along the route, plus the detour. */
function arrivalNow(f: WaterFacts, c: Candidate): { arrival: Date; back: boolean } {
  const s = nowEnv(f);
  if (c.match.km < f.ride.startKm) return { arrival: s.behind(c.match), back: true };
  const detourMin = flatLegClockMin(rejoinKm(c.match.offRouteM), f.trip.flatKph, s.r);
  return { arrival: new Date(s.ridingOnAt(c.match.km).getTime() + detourMin * MIN), back: false };
}

const TONIGHT_KM = 1;

/** After the day's ride: the nearest reliable source within 1 km of tonight's stop, ahead or behind, timed for riding there now. */
function tonightsWater(f: WaterFacts, list: Candidate[]): Target | null {
  const tonight = f.ride.tonightKm;
  if (tonight === null) return null;
  const distance = (c: Candidate): number => Math.abs(c.match.km - tonight);
  const near = list.filter((c) => distance(c) <= TONIGHT_KM).sort((a, b) => distance(a) - distance(b) || compareFinal(a.place, b.place));
  for (const c of near) {
    const { arrival, back } = arrivalNow(f, c);
    if (sourceAt(c.place, c.match, arrival, f).reliable) return { kind: 'place', place: c.place, match: c.match, km: c.match.km, arrival, tonight: true, back };
  }
  return null;
}

/** The next two reliable sources in route order, the missing ones replaced by E. */
export function findS1S2(f: WaterFacts, opts: { tomorrowOnly?: boolean } = {}): { s1: Target; s2: Target } {
  const start = f.ride.startKm;
  const e = pointE(f, start);
  const list = candidatesOf(f);
  const tonight = afterTheRide(f) && !opts.tomorrowOnly ? tonightsWater(f, list) : null;
  const found: Target[] = tonight ? [tonight] : [];
  for (const c of list) {
    if (found.length === 2) break;
    if (c.match.km < start || c.match.km > e.km || insideRadius(f.ride, c.match.km)) continue;
    if (tonight?.kind === 'place' && tonight.place.id === c.place.id) continue;
    const arrival = f.schedule.atPlace(c.match);
    if (sourceAt(c.place, c.match, arrival, f).reliable) found.push({ kind: 'place', place: c.place, match: c.match, km: c.match.km, arrival, tonight: false, back: false });
  }
  return { s1: found[0] ?? e, s2: found[1] ?? e };
}

// ---- Sections and the four terms -----------------------------------------------------------------------------------

const MAX_SECTION_KM = 5;

type Sec = Section & { label: PlanningWeather['label'] };

function isDay(f: WaterFacts, km: Km, at: Date, tz: string): boolean {
  const { lat, lon } = pointAtRouteKm(f.trip.route, km);
  const s = f.sun(lat, lon, localIsoDate(at, tz));
  if (s.lightAllNight) return true;
  if (s.sunrise === null || s.sunset === null) return false;
  // Written so that sun times that are no times read as day: the higher rate.
  return !(at.getTime() < s.sunrise.getTime()) && !(at.getTime() >= s.sunset.getTime());
}

function weatherAt(f: WaterFacts, km: Km, at: Date, tz: string): PlanningWeather {
  // Without a departure date the moment is not known, so neither is the weather: plan for a hot day.
  const known = f.trip.departureDate !== null;
  return planningWeather(known ? f.forecast : null, known ? f.baseline : null, km, at, { route: f.trip.route, timeZone: tz });
}

function sectionOf(f: WaterFacts, a: Km, b: Km, hours: number, at: Date, speedKph: number): Sec {
  const route = f.trip.route;
  const mid = (a + b) / 2;
  const tz = zoneLookupOf(f.routeZones)(mid).timeZone;
  const w = weatherAt(f, mid, at, tz);
  const { riderKg, loadKg, bikeKg } = masses(f.profile, f.loadSummary);
  const speedMs = speedKph / 3.6;
  const eleA = routeHeight(route, a);
  const eleB = routeHeight(route, b);
  const grade = eleA === null || eleB === null || b <= a ? 0 : (eleB - eleA) / ((b - a) * 1000);
  // Airflow: ground speed less 0.6 x the tailwind component; a headwind is ignored.
  let tail = 0;
  if (w.windMs !== null && w.windFrom !== null && b > a) {
    const course = bearingDeg(pointAtRouteKm(route, a), pointAtRouteKm(route, b));
    tail = Math.max(0, w.windMs * Math.cos((((w.windFrom + 180 - course) % 360) * Math.PI) / 180));
  }
  return {
    hours, powerW: riderPower({ totalKg: riderKg + loadKg + bikeKg, speedMs, grade }), planT: w.planT, rhPct: w.rhPct,
    airflow: Math.max(1, speedMs - 0.6 * tail), ghi: w.ghi, day: isDay(f, mid, at, tz), elevM: routeHeight(route, mid) ?? 0, label: w.label,
  };
}

type Way = { fromKm: Km; toKm: Km; startLegKm: number; endLegKm: number; schedule: Schedule; at: ((km: Km) => Date) | null };

const kmOf = (f: WaterFacts, a: Km | 'now' | Target): Km => (a === 'now' ? f.ride.startKm : typeof a === 'number' ? a : a.km);
const legOf = (a: Target): number => (a.kind === 'place' ? rejoinKm(a.match.offRouteM) : 0);

function wayOf(f: WaterFacts, a: Km | 'now' | Target, b: Target): Way {
  if (a === 'now' && b.kind === 'place' && b.tonight) {
    const from = b.back ? f.ride.behindFromKm : f.ride.startKm;
    return { fromKm: from, toKm: b.km, startLegKm: rejoinKm(f.ride.startOffRouteM), endLegKm: legOf(b), schedule: nowEnv(f), at: () => f.now };
  }
  const startLegKm = a === 'now' ? rejoinKm(f.ride.startOffRouteM) : typeof a === 'number' ? 0 : legOf(a);
  return { fromKm: kmOf(f, a), toKm: b.km, startLegKm, endLegKm: legOf(b), schedule: f.schedule, at: null };
}

/** Where a stretch is cut: the grid, the climbs, the ride ends, and at most 5 km apart. */
function cutsOf(f: WaterFacts, lo: Km, hi: Km, s: Schedule): Km[] {
  const route = f.trip.route;
  const cuts = new Set<Km>([lo, hi]);
  const add = (km: Km): void => { if (km > lo && km < hi) cuts.add(km); };
  route.sampleGrid.forEach(add);
  for (const c of route.climbs) { add(c.startKm); add(c.topKm); }
  let guard = 0;
  for (let x = lo; x < hi && guard < 1000; guard++) {
    const stop = s.rideOf(x).stopKm;
    add(stop);
    if (!(stop > x) || stop >= route.lengthKm) break;
    x = stop + 1e-6;
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: Km[] = [];
  for (const km of sorted) {
    const prev = out[out.length - 1];
    if (prev !== undefined) for (let k = prev + MAX_SECTION_KM; k < km; k += MAX_SECTION_KM) out.push(k);
    out.push(km);
  }
  return out;
}

/** The riding sections of a stretch. The rejoin leg and the detour count at the rate of the section where they meet the route. */
function sections(f: WaterFacts, way: Way): Sec[] {
  const lo = Math.min(way.fromKm, way.toKm);
  const hi = Math.max(way.fromKm, way.toKm);
  const s = way.schedule;
  const flatLoaded = (km: number, r: number): number => flatLegRidingMin(km, f.trip.flatKph, r) / 60;
  const startR = s.rideOf(lo).r;
  const legSpeed = (f.trip.flatKph * LOAD_PENALTY) / startR;
  const list: Sec[] = [];
  if (hi > lo) {
    const cuts = cutsOf(f, lo, hi, s);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i]!;
      const b = cuts[i + 1]!;
      const hours = s.ridingMinBetween(a, b) / 60;
      const mid = (a + b) / 2;
      list.push(sectionOf(f, a, b, hours, way.at ? way.at(mid) : s.atKm(mid), (b - a) / hours));
    }
  }
  const startH = flatLoaded(way.startLegKm, startR);
  const endH = flatLoaded(way.endLegKm, s.rideOf(hi).r);
  if (startH + endH > 0 && list.length === 0) list.push(sectionOf(f, lo, lo, 0, way.at ? way.at(lo) : s.atKm(lo), legSpeed));
  if (startH > 0) list[0]!.hours += startH;
  if (endH > 0) list[list.length - 1]!.hours += endH;
  return list;
}

const ridingHours = (list: Section[]): number => list.reduce((sum, s) => sum + s.hours, 0);

/** Use at a factor (k x U, or k): riding, plus break time (15% of riding) at the stop rate when `breaks`. */
export function useOfSections(list: Section[], bodyKg: number, factor: number, breaks: boolean): number {
  return list.reduce((sum, s) => sum + factor * s.hours * (sweatRate(s, bodyKg, true) + (breaks ? BREAK_SHARE * stopRate(s, bodyKg) : 0)), 0);
}

/** The worst section's rate over max(0.5 h, 20% of the riding time). 0 over an empty stretch. */
export function bufferOfSections(list: Section[], bodyKg: number, factor: number): number {
  const total = ridingHours(list);
  if (list.length === 0 || total === 0) return 0;
  const worst = list.reduce((max, s) => Math.max(max, sweatRate(s, bodyKg, true)), 0);
  return factor * worst * Math.max(0.5, 0.2 * total);
}

/** 1.0 L if any section reaches 30 °C planning or the stretch has over 2 h between settlements, else 0.5 L. A broken temperature reads as hot. */
export const reserveOfSections = (list: Section[], longGap: boolean): 0.5 | 1.0 => (longGap || list.some((s) => !(s.planT < 30)) ? 1.0 : 0.5);

const TWO_HOURS_MIN = 120 + 1e-6; // exactly 2 h stays 0.5 L, whatever floating point makes of the sum

function longGap(f: WaterFacts, way: Way): boolean {
  const lo = Math.min(way.fromKm, way.toKm);
  const hi = Math.max(way.fromKm, way.toKm);
  const towns = new Set(f.places.filter((p) => p.kind === 'settlement').map((p) => p.id));
  const kms = f.matches.filter((m) => towns.has(m.placeId) && m.km > lo && m.km < hi).map((m) => m.km).sort((a, b) => a - b);
  let previous = lo;
  for (const km of [...kms, hi]) {
    if (way.schedule.ridingMinBetween(previous, km) > TWO_HOURS_MIN) return true;
    previous = km;
  }
  return false;
}

const bodyOf = (f: WaterFacts): number => masses(f.profile, f.loadSummary).riderKg;
const planFactor = (f: WaterFacts): number => f.profile.k * uncertainty(f.profile.sumW);

/** Use(A→B): at the plan rate (k x U x SR_model) or the median rate (k x SR_model), breaks included. */
export function use(f: WaterFacts, a: Km | 'now' | Target, b: Target, mode: 'plan' | 'median'): number {
  return useOfSections(sections(f, wayOf(f, a, b)), bodyOf(f), mode === 'plan' ? planFactor(f) : f.profile.k, true);
}
export function buffer(f: WaterFacts, a: Km | 'now' | Target, b: Target): number {
  return bufferOfSections(sections(f, wayOf(f, a, b)), bodyOf(f), planFactor(f));
}
export function reserve(f: WaterFacts, a: Km | 'now' | Target, b: Target): 0.5 | 1.0 {
  const way = wayOf(f, a, b);
  return reserveOfSections(sections(f, way), longGap(f, way));
}

/** Camp water for each trip night between A and B at a camping or mixed stop. After the day's ride, tonight is first. */
export function camp(f: WaterFacts, a: Km | 'now' | Target, b: Target): number {
  if (f.trip.stay === 'accommodation') return 0;
  const fromTonight = typeof a === 'object' && a.kind === 'place' && a.tonight;
  const toTonight = b.kind === 'place' && b.tonight;
  let nights = afterTheRide(f) && !toTonight && (a === 'now' || fromTonight) ? 1 : 0;
  const from = kmOf(f, a);
  const length = f.trip.route.lengthKm;
  let guard = 0;
  for (let x = from; x <= b.km && guard < 1000; guard++) {
    const stop = f.schedule.rideOf(x).stopKm;
    if (stop >= from && stop < b.km && stop < length) nights++;
    if (!(stop >= x) || stop >= length) break;
    x = stop + 1e-6;
  }
  return f.trip.campWaterL * nights;
}

/** Capacity C: the summary's total, else "Water you can carry", else none. Anything that is no positive number is none. */
export const capacityOf = (f: WaterFacts): number | null => capacityFrom(f.profile, f.loadSummary);

// ---- Water now (section 3.2) ---------------------------------------------------------------------------------------

const DEFAULT_FOR_MS = 3 * HOUR;

/** Fixes that say where on the route the rider was. One over 5 km off, at home for instance, says nothing of that. */
const positionsOf = (f: WaterFacts): WaterFacts['positions'] => f.positions.filter((p) => Number.isFinite(p.km) && validDate(p.at) && !isFarOff(p));

/** The last position at or before a moment. */
const positionAt = (f: WaterFacts, t: Date): WaterFacts['positions'][number] | null =>
  latestPosition(positionsOf(f).filter((p) => p.at.getTime() <= t.getTime()));

/** Whether the rider has passed a reliable source since. With no position from before then, any source behind may be it. */
function passedSource(f: WaterFacts, since: Date): boolean {
  const later = positionsOf(f).filter((p) => p.at.getTime() > since.getTime()).sort(positionOrder);
  if (later.length === 0) return false;
  const from = positionAt(f, since)?.km ?? -Infinity;
  const reach = later.reduce((max, p) => Math.max(max, p.km), from);
  return candidatesOf(f).some((c) => {
    if (c.match.km <= from || c.match.km > reach) return false;
    const passedAt = later.find((p) => p.km >= c.match.km)?.at ?? f.now;
    return sourceAt(c.place, c.match, passedAt, f).reliable;
  });
}

const ROAD_AROUND_KM = 5;

/**
 * The riding rate at the plan factor that the water since a confirmation is reckoned at, on the real road: the stretch
 * ridden since, by time; not known to have moved, the worst of the road around the rider. No discount for breaks.
 */
function planRateSince(f: WaterFacts, since: Date): number {
  const km = f.ride.startKm;
  const body = bodyOf(f);
  const was = positionAt(f, since)?.km;
  const moved = was !== undefined && was < km;
  const way: Way = {
    fromKm: moved ? was : Math.max(0, km - ROAD_AROUND_KM), toKm: moved ? km : Math.min(f.trip.route.lengthKm, km + ROAD_AROUND_KM),
    startLegKm: 0, endLegKm: 0, schedule: f.schedule, at: () => f.now,
  };
  const list = sections(f, way);
  if (list.length === 0) return planFactor(f) * sweatRate(sectionOf(f, km, km, 1, f.now, f.trip.flatKph * LOAD_PENALTY), body, true);
  if (!moved) return planFactor(f) * list.reduce((max, s) => Math.max(max, sweatRate(s, body, true)), 0);
  return (planFactor(f) * list.reduce((sum, s) => sum + s.hours * sweatRate(s, body, true), 0)) / ridingHours(list);
}

/**
 * W0, or why there is none. The last confirmed value less the use since, at SR_plan, never below 0, and dropped after
 * 3 hours, after a night, or past a reliable source, because refills are then unknown. This holds for a value still
 * marked confirmed too: what is confirmed at 14:20 is not what is carried at 15:00.
 */
export function waterNow(f: WaterFacts): { confirmed: true; litres: number } | { confirmed: false; stillAbout: number | null } {
  const left = f.waterLeft;
  const gone = { confirmed: false as const, stillAbout: null };
  if (!left || !Number.isFinite(left.litres) || left.litres < 0 || !validDate(left.at)) return gone;
  const ageMs = Math.max(0, f.now.getTime() - left.at.getTime());
  const startZone = zoneLookupOf(f.routeZones)(0).timeZone;
  const sameDate = ridingDate(left.at, startZone) === ridingDate(f.now, startZone);
  if (!(ageMs <= DEFAULT_FOR_MS) || !sameDate || passedSource(f, left.at)) return gone;
  const used = ageMs === 0 ? 0 : (ageMs / HOUR) * planRateSince(f, left.at);
  if (!Number.isFinite(used)) return gone;
  const litres = Math.max(0, left.litres - used);
  return left.confirmed ? { confirmed: true, litres } : { confirmed: false, stillAbout: litres };
}

// ---- The card ------------------------------------------------------------------------------------------------------

const trim = (x: number): string => String(Math.round(x * 100) / 100);
/** Litres the rider needs: rounded up to 0.1 L, so a shown amount is never short. */
const upToTenth = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;
const showUp = (x: number): string => trim(upToTenth(x));
const showNear = (x: number): string => trim(Math.round(x * 10) / 10);

const nameOf = (t: Target): string => {
  if (t.kind === 'end') return W.waterRouteEnd;
  if (t.kind === 'edge') return W.waterAtKm(showKm(t.km));
  return t.place.name ?? W.waterAtKm(showKm(t.km));
};

const labelsOf = (place: Place, km: Km, f: WaterFacts): string[] => {
  const out: string[] = [];
  if (place.waterClass === 'A') out.push(W.waterMappedAsDrinking);
  const today = localIsoDate(f.now, zoneOf(place, km, f));
  const threeYearsAgo = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  if (place.checkDate !== null && /^\d{4}/.test(place.checkDate) && place.checkDate < threeYearsAgo) out.push(W.waterUnverifiedSince(place.checkDate.slice(0, 4)));
  const fee = place.tags['fee'];
  if (fee !== undefined && fee !== 'no') out.push(W.waterFee);
  return out;
};

const dated = (f: WaterFacts): boolean => f.trip.departureDate !== null;

function whereOf(f: WaterFacts, t: Target & { kind: 'place' }): string {
  const distance = t.back ? W.waterBack(showKm(Math.abs(f.ride.behindFromKm - t.km))) : W.waterAhead(showKm(Math.abs(t.km - f.ride.startKm)));
  return dated(f) && validDate(t.arrival) ? `${distance} · ${formatAbout(t.arrival, zoneOf(t.place, t.km, f))}` : distance;
}

function itemFor(f: WaterFacts, t: Target & { kind: 'place' }): AnswerItem {
  const stamp = dated(f) ? { km: t.km, at: t.arrival } : { km: t.km };
  const detail = [whereOf(f, t), ...labelsOf(t.place, t.km, f)].join(' · ');
  return { label: nameOf(t), stamp, status: 'fine', detail };
}

const UNCERTAIN_SHOWN = 5;

/** Places inside an approximate position's radius, and sources that are not reliable, up to `toKm`. */
function otherItems(f: WaterFacts, toKm: Km, targets: Target[], strict: boolean): AnswerItem[] {
  const used = new Set(targets.map((t) => (t.kind === 'place' ? `${t.place.id}@${t.km}` : '')));
  const near: AnswerItem[] = [];
  const unsure: AnswerItem[] = [];
  for (const c of candidatesOf(f)) {
    if (used.has(`${c.place.id}@${c.match.km}`)) continue;
    if (insideRadius(f.ride, c.match.km)) {
      near.push({ label: c.place.name ?? W.waterAtKm(showKm(c.match.km)), stamp: { km: c.match.km }, status: 'unknown', detail: W.waterNearYou });
      continue;
    }
    const backAtEnd = atRouteEnd(f) && c.match.km < f.ride.startKm && c.match.km >= f.ride.startKm - TONIGHT_KM;
    if ((c.match.km < f.ride.startKm && !backAtEnd) || (strict ? c.match.km >= toKm : c.match.km > toKm) || unsure.length === UNCERTAIN_SHOWN) continue;
    const arrival = backAtEnd ? arrivalNow(f, c).arrival : f.schedule.atPlace(c.match);
    const v = sourceAt(c.place, c.match, arrival, f);
    if (v.reliable) continue;
    const stamp = dated(f) && validDate(arrival) ? { km: c.match.km, at: arrival } : { km: c.match.km };
    unsure.push({ label: c.place.name ?? W.waterAtKm(showKm(c.match.km)), stamp, status: 'unknown', detail: [v.reason ?? '', ...labelsOf(c.place, c.match.km, f)].filter(Boolean).join(' · ') });
  }
  return [...near, ...unsure];
}

function hoursMissing(f: WaterFacts, toKm: Km): boolean {
  return candidatesOf(f).some((c) => {
    if (c.match.km < f.ride.startKm || c.match.km > toKm) return false;
    const decides = SHOP_KINDS.has(c.place.kind) || (c.place.waterClass === 'A' && c.place.indoorOrLimited);
    if (!decides || c.place.waterClass === 'B' || c.place.waterClass === 'C') return false;
    const h = hoursOf(c.place, f);
    if (!h) return true;
    const t = f.schedule.atPlace(c.match).getTime();
    return !(t >= h.windowStart.getTime() && t < h.windowEnd.getTime());
  });
}

const STALE_MS = 12 * HOUR;

function freshnessOf(f: WaterFacts): Answer['freshness'] {
  const dataDates: Record<string, string> = {};
  const newest = newestMapDate(f);
  if (newest !== null) dataDates['places'] = newest;
  if (f.forecast && validDate(f.forecast.fetchedAt)) dataDates['weather'] = f.forecast.fetchedAt.toISOString();
  const stale = f.forecast !== null && !(f.now.getTime() - f.forecast.fetchedAt.getTime() <= STALE_MS);
  return { dataDates, stale };
}

function basisOf(list: Sec[]): string[] {
  const basis = [W.waterBasisEstimate];
  if (list.some((s) => s.label === 'seasonal')) basis.push(W.waterBasisSeasonal);
  if (list.some((s) => s.label === 'assumed-hot')) basis.push(W.waterBasisAssumedHot);
  basis.push(W.waterBasisOsm);
  return basis;
}

const calibrationOf = (f: WaterFacts): string => {
  const u = uncertainty(f.profile.sumW);
  if (u === 1.2) return W.waterCalibrated;
  return u === 1.3 ? W.waterPartlyCalibrated : W.waterNotCalibrated;
};

function cantWorkOut(f: WaterFacts): Answer {
  const missing: Missing[] = capacityOf(f) === null ? ['capacity'] : [];
  return makeAnswer({ topic: 'water', status: 'unknown', title: W.waterCantWorkOut, stamp: null, detail: '', items: [], basis: [W.waterBasisEstimate], freshness: freshnessOf(f), missing });
}

/** What the engine needs before any figure can mean something. Written so that non-finite values fail. */
const inputsUsable = (f: WaterFacts): boolean =>
  usableFlatKph(f.trip.flatKph)
  && f.profile.k > 0 && f.profile.k < Infinity
  && f.trip.campWaterL >= 0 && f.trip.campWaterL < Infinity
  && f.trip.route.lengthKm >= 0 && f.trip.route.lengthKm < Infinity
  && validDate(f.now) && validDate(f.ride.departure) && Number.isFinite(f.ride.startKm);

export function waterAnswer(f: WaterFacts): Answer {
  if (!inputsUsable(f)) return cantWorkOut(f);

  const { s1, s2 } = findS1S2(f);
  const now = waterNow(f);
  const capacity = capacityOf(f);
  const wayS1 = wayOf(f, 'now', s1);
  const wayS2 = wayOf(f, 'now', s2);
  const listS1 = sections(f, wayS1);
  const listS2 = sections(f, wayS2);
  const body = bodyOf(f);
  const factor = planFactor(f);

  const useS1 = useOfSections(listS1, body, factor, true);
  const expectedS1 = useOfSections(listS1, body, f.profile.k, true);
  const asideS1 = bufferOfSections(listS1, body, factor) + reserveOfSections(listS1, longGap(f, wayS1)) + camp(f, 'now', s1);
  const useS2 = useOfSections(listS2, body, factor, true);
  const asideS2 = bufferOfSections(listS2, body, factor) + reserveOfSections(listS2, longGap(f, wayS2)) + camp(f, 'now', s2);
  const wayOn = wayOf(f, s1, s2);
  const listOn = s1.kind === 'place' ? sections(f, wayOn) : [];
  const needS1S2 = s1.kind === 'place'
    ? useOfSections(listOn, body, factor, true) + bufferOfSections(listOn, body, factor) + reserveOfSections(listOn, longGap(f, wayOn)) + camp(f, s1, s2)
    : 0;
  if (![useS1, expectedS1, asideS1, useS2, asideS2, needS1S2, s1.km, s2.km].every(Number.isFinite)) return cantWorkOut(f);

  const edge = s1.kind === 'edge' || s2.kind === 'edge';
  const missing: Missing[] = [];
  if (!dated(f)) missing.push('date');
  if (edge) missing.push('places');
  if (hoursMissing(f, s2.km)) missing.push('hours');
  if (f.trip.route.points.some((p) => p.ele === null)) missing.push('heights');
  if (capacity === null) missing.push('capacity');
  const weatherHeld = (f.forecast?.grid.some((g) => g.hours.length > 0) ?? false) || (f.baseline?.points.length ?? 0) > 0;
  if (!weatherHeld || (dated(f) && [...listS1, ...listS2].some((s) => s.label === 'assumed-hot'))) missing.push('weather');

  const targetItems = [s1, s2].flatMap((t) => (t.kind === 'place' ? [itemFor(f, t)] : []));
  // At the route end no source is ahead to refill at, but one close by still is one: it is shown, ahead or back.
  const close = atRouteEnd(f) ? tonightsWater(f, candidatesOf(f)) : null;
  const closeShown = close?.kind === 'place' && ![s1, s2].some((t) => t.kind === 'place' && t.place.id === close.place.id) ? close : null;
  const stamp = s1.kind === 'place' ? (dated(f) ? { km: s1.km, at: s1.arrival } : { km: s1.km }) : { km: s1.km };

  // The lines every card carries.
  const lines: string[] = [];
  if (s1.kind !== 'place' && s1.km - f.ride.startKm >= 0.05) lines.push(W.waterNoSource(showKm(s1.km - f.ride.startKm)));
  lines.push(W.waterExpectedPlanned(nameOf(s1), showNear(expectedS1), showNear(useS1)), calibrationOf(f));
  const rideHours = f.schedule.ridingMinTo(f.ride.stopKm) / 60;
  if (f.profile.ebike || listS2.some((s) => outsideRange({ planT: s.planT, elevM: s.elevM, ridingHours: rideHours }))) lines.push(W.waterOutsideRange);

  const card = (status: Answer['status'], title: string, extra: string[], items: AnswerItem[]): Answer => makeAnswer({
    topic: 'water', status, title, stamp, detail: [...extra, ...lines].join(' '),
    // A target is as good as the card it is on: it never reads "fine" on a card that isn't.
    items: items.map((i) => (i.status === 'fine' ? { ...i, status } : i)), basis: basisOf(listS2.length > 0 ? listS2 : listS1), freshness: freshnessOf(f), missing,
  });
  const nearby = (strict = false): AnswerItem[] => [
    ...(closeShown ? [itemFor(f, closeShown)] : []),
    ...otherItems(f, s1.km, closeShown ? [s1, s2, closeShown] : [s1, s2], strict),
  ];

  if (!now.confirmed) {
    const asks = now.stillAbout === null ? [] : [W.waterStillAbout(showNear(now.stillAbout))];
    return card('unknown', W.waterConfirm, asks, [...targetItems, ...nearby()]);
  }

  const w0 = now.litres;
  const needS1 = useS1 + asideS1;
  const shortS1 = w0 - useS1 < asideS1;
  const shortS2 = w0 - useS2 < asideS2;

  if (shortS1) {
    const beyondBottles = capacity !== null && needS1 > capacity;
    return card('warning', W.waterNotEnough(nameOf(s1), showUp(needS1)), [W.waterTips], [...targetItems.slice(0, 1), ...nearby(beyondBottles)]);
  }
  if (capacity === null) return card('unknown', W.waterEnterCapacity, [], [...targetItems, ...nearby()]);

  if (s1.kind === 'place') {
    if (needS1S2 > capacity) {
      const extra = showUp(needS1S2 - capacity);
      const title = W.waterFillUp(nameOf(s1), showKm(Math.abs(s2.km - s1.km)), extra);
      return card('action', title, [W.waterBottlesHold(trim(capacity), extra, nameOf(s1))], [...targetItems, ...nearby()]);
    }
    if (shortS2) {
      const fill = Math.min(capacity, upToTenth(needS1S2));
      return card('action', W.waterRefill(nameOf(s1), whereOf(f, s1), trim(fill)), [], [...targetItems, ...nearby()]);
    }
  }
  if (edge) {
    const at = s1.kind === 'edge' ? s1.km : s2.km;
    const resumes = savedRanges(f).filter((r) => r.fromKm > at && r.fromKm < f.trip.route.lengthKm).reduce((min, r) => Math.min(min, r.fromKm), f.trip.route.lengthKm);
    return card('action', W.waterRefreshOrCarry(showKm(at), showKm(resumes - at)), [], [...targetItems, ...nearby()]);
  }
  // The last row, reached only by a positive test.
  if (!(w0 - useS2 >= asideS2)) return cantWorkOut(f);
  if (!dated(f)) return card('unknown', W.waterSetDate, [], [...targetItems, ...nearby()]);
  const title = s2.kind !== 'place' || s1.kind !== 'place' ? W.waterEnoughToEnd
    : s1.place.id === s2.place.id ? W.waterEnoughToComeBack(nameOf(s1)) : W.waterEnoughToReach(nameOf(s2), nameOf(s1));
  return card('fine', title, [], [...targetItems, ...nearby()]);
}

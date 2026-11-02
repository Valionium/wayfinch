// Stop ideas (spec section 6.11): the Food card's title and timeline. Every idea is a suggestion with its arrival, and
// every arrival is the schedule's own. Only known hours count: unknown, may-be-open and possibly-closed never do.
import { compareFinal, formatAbout, formatHm } from '../answers/index.ts';
import { instantAt, localIsoDate, wallClock } from '../answers/time.ts';
import { kitchenHoursId, openAtArrival, openOnArrival, openRuns, stateAt } from '../hours/check.ts';
import type { Km, Missing, Place, RainPlan, ScreenInputs, Status, StopIdea } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { isCover, coverOfSpot, savedCovers, seatedKind, seatingLine, spotName, type Spot as CoverSpot, type StopFacts } from './covers.ts';
import { arrivalRidingOn, closingDay, closingWord, hoursIndex, routeZoneAt, isFoodPlace, passesOf, placeWord, zoneOfPass, type LeaveBy, type LeaveFacts, type Pass } from './leaveby.ts';
import { usableFlatKph } from './pace.ts';
import { planOrder } from './rain-plans.ts';
import { latestUsable } from './shelter.ts';
import { heatRule } from './water-learning.ts';
import { planningWeather } from './water-model.ts';
import { rainAtStart, hourAt, pointNearKm, ridePoints, routeForecast, weekdayOf } from './weather-windows.ts';
import type { WaitOrGo } from './weather.ts';

export type FoodFacts = StopFacts & Pick<ScreenInputs, 'holidays'>;

/** What stopIdeas found. `line` is the card's title when there is no idea at all: an unknown status says why here. */
export type Ideas = { title: StopIdea | null; timeline: StopIdea[]; nearestOpen: StopIdea | null; status: Status; missing: Missing[]; line: string | null };

const MIN = 60_000;
const SLACK_MS = 2; // arrivals are whole milliseconds: "exactly 2 h" must not fall to their rounding
const AT_STOP_KM = 1;
const GAP_MIN = 120;
const LOOK_BACK_MIN = 60;
const RAIN_WITHIN_MIN = 180;
const SEATED_WITHIN_MIN = 30;
const MEAL_WITHIN_MIN = 180;
const MEAL_AWAY_MIN = 45;
const RHYTHM_FROM_MIN = 90;
const RHYTHM_TO_MIN = 150;
const RHYTHM_TARGET_MIN = 120;
const STEP_MIN = 15;
const HOT_C = 30;
const NOON_FROM_MIN = 11 * 60;
const NOON_TO_MIN = 15 * 60;
const MEAL_FROM_MIN = 11 * 60 + 30;
const MEAL_TO_MIN = 13 * 60 + 30;
const CLIMB_KM = 2;
const SETTLEMENT_KM = 1;

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());
const asLeave = (f: FoodFacts): LeaveFacts => f as unknown as LeaveFacts;

/** One pass of a place on the day's ride, with its arrival and what its hours say then. */
type Visit = Pass & { arrival: Date; open: boolean; atArrival: boolean; until: Date | null; tz: string };

const minutesOf = (t: Date, tz: string): number => {
  const w = wallClock(t, tz);
  return w.hour * 60 + w.minute + w.second / 60;
};
const spanWords = (ms: number): string => {
  const total = Math.round(ms / MIN / 5) * 5;
  const h = Math.floor(total / 60);
  return h > 0 ? W.stopSpanHours(h, total % 60) : W.stopSpanMinutes(total);
};

// ---- ranking -------------------------------------------------------------------------------------------------------

type Rank = { kind: (p: Place) => number; target: (v: Visit) => number; wet: boolean; meal: boolean };

const tiesBy = (f: FoodFacts, waterTarget: string | null, open: Visit[], settlements: Pass[]): ((a: Visit, b: Visit, meal: boolean) => number) => {
  const settlementOf = (km: Km): string | null => {
    let best: Pass | null = null;
    for (const s of settlements) {
      const d = Math.abs(s.match.km - km);
      if (d <= SETTLEMENT_KM && (!best || d < Math.abs(best.match.km - km))) best = s;
    }
    return best?.place.id ?? null;
  };
  const inSettlement = (v: Visit): boolean => {
    const here = settlementOf(v.match.km);
    return here !== null && open.some((o) => o.place.id !== v.place.id && settlementOf(o.match.km) === here);
  };
  const climbNear = (v: Visit): boolean => f.trip.route.climbs.some((c) => c.startKm >= v.match.km && c.startKm <= v.match.km + CLIMB_KM);
  return (a, b, meal) => {
    const pairs: [boolean, boolean][] = [
      [a.place.id === waterTarget, b.place.id === waterTarget],
      [a.place.stop?.toilets === true, b.place.stop?.toilets === true],
      [a.place.stop?.bikeParking50m === true, b.place.stop?.bikeParking50m === true],
      ...(meal ? [[!climbNear(a), !climbNear(b)] as [boolean, boolean]] : []),
      [inSettlement(a), inSettlement(b)],
    ];
    for (const [x, y] of pairs) if (x !== y) return x ? -1 : 1;
    return 0;
  };
};

function rankOf(list: Visit[], r: Rank, ties: (a: Visit, b: Visit, meal: boolean) => number): Visit[] {
  const step = (v: Visit): number => Math.floor(Math.abs(v.arrival.getTime() - r.target(v)) / (STEP_MIN * MIN));
  const seats = (v: Visit): boolean => v.place.stop?.indoorSeating === true || v.place.tags['indoor_seating'] === 'yes';
  return [...list].sort((a, b) => r.kind(a.place) - r.kind(b.place) || step(a) - step(b)
    || (r.wet ? Number(seats(b)) - Number(seats(a)) : 0) || a.match.offRouteM - b.match.offRouteM || ties(a, b, r.meal) || compareFinal(a.place, b.place));
}

const lastChanceKind = (p: Place): number => {
  const shop = p.tags['shop'];
  if (p.kind === 'shop' && shop === 'supermarket') return 0;
  return p.kind === 'fuel_shop' || (p.kind === 'shop' && shop === 'convenience') ? 1 : 2;
};
const fastFoodPlace = (p: Place): boolean => p.kind === 'cafe' && p.tags['amenity'] === 'fast_food';
const seatsYes = (p: Place): boolean => p.stop?.indoorSeating === true || p.tags['indoor_seating'] === 'yes';
/** Null: no meal place. */
const mealKind = (p: Place): number | null => {
  if (p.kind === 'restaurant' || (p.kind === 'cafe' && !fastFoodPlace(p))) return 0;
  if (fastFoodPlace(p)) return 1;
  return p.kind === 'shop' && p.tags['shop'] === 'bakery' && seatsYes(p) ? 1 : null;
};
const rhythmKind = (p: Place): number => {
  if ((p.kind === 'shop' && p.tags['shop'] === 'bakery') || (p.kind === 'cafe' && !fastFoodPlace(p))) return 0;
  if (p.kind === 'fuel_shop' || (p.kind === 'shop' && (p.tags['shop'] === 'kiosk' || p.tags['shop'] === 'convenience'))) return 1;
  return p.kind === 'drink' ? 3 : 2;
};

// ---- wording -------------------------------------------------------------------------------------------------------

const ahead = (v: Visit, startKm: Km): string => W.waterAhead(showKm(Math.abs(v.match.km - startKm)));
const toiletsLine = (p: Place): string => (p.stop?.toilets === true ? W.stopToiletsMapped : W.stopToiletsNotMapped);
const untilLine = (v: Visit): string => (v.until ? W.stopOpenUntil(formatHm(v.until, v.tz)) : W.stopOpen247);
const about = (v: Visit): string => formatAbout(v.arrival, v.tz);
const nameOf = (v: Visit): string => spotName({ place: v.place, roof: null, match: v.match });
const asCoverSpot = (v: Visit): CoverSpot => ({ place: v.place, roof: null, match: v.match });
const shownAt = (v: Visit): string => W.leavebyPlaceAtKm(placeWord(v.place), showKm(v.match.km));

/** "Café Lindenhof, +18 km, about 12:35 · open until 18:00 · indoor seating mapped · toilets not mapped." */
const fullLine = (v: Visit, start: Km): string => `${[`${nameOf(v)}, ${ahead(v, start)}, ${about(v)}`, untilLine(v), seatingLine(v.place), toiletsLine(v.place)].join(' · ')}.`;

const idea = (trigger: StopIdea['trigger'], status: Status, v: Visit | null, reason: string, lines: string[] = [], km: Km | null = v?.match.km ?? null): StopIdea => ({
  trigger, placeId: v?.place.id ?? null, arrival: v?.arrival ?? null, status, reason, km, lines,
});

// ---- the triggers --------------------------------------------------------------------------------------------------

/** The kilometres, the visits and what the triggers need. Null when there is no ride to judge. */
type Ride = {
  f: FoodFacts; start: Km; stop: Km; dep: Date; stopAt: Date; zone: (km: Km) => string;
  visits: Visit[]; // places that may feed the rider, up to 1 km past the stop, by arrival
  open: Visit[]; // food places open on arrival, by arrival
  hoursOf: ReturnType<typeof hoursIndex>;
  wet: boolean; hot: boolean; ties: (a: Visit, b: Visit, meal: boolean) => number;
};

const distanceSpan = (fromKm: Km, toKm: Km, ms: number): { km: string; span: string } => ({ km: showKm(toKm - fromKm), span: spanWords(ms) });

function lastChance(r: Ride, lb: LeaveBy): StopIdea | null {
  const { f, stop, start } = r;
  const here = r.open.some((v) => Math.abs(v.match.km - stop) <= AT_STOP_KM);
  if (here && !lb.closure) return null;
  const last = r.open[r.open.length - 1];
  if (!last) {
    const { km, span } = distanceSpan(start, stop, r.stopAt.getTime() - r.dep.getTime());
    return idea('last-chance', 'action', null, W.stopNoFoodNext(km, span));
  }
  const near = r.open.filter((v) => last.arrival.getTime() - v.arrival.getTime() <= LOOK_BACK_MIN * MIN + SLACK_MS);
  const best = rankOf(near, { kind: lastChanceKind, target: () => last.arrival.getTime(), wet: r.wet, meal: false }, r.ties)[0]!;
  const lines = best.place.id === last.place.id ? [] : [W.stopLastOpen(shownAt(last))];
  const where = settledName(best, r);
  const closes = best.until ? formatHm(best.until, best.tz) : null;
  if (!lb.closure) return idea('last-chance', 'action', best, W.stopLastTonight(where, ahead(best, start), about(best), closes), lines);
  const day = closingDay(asLeave(f), f.ride);
  const text = [W.stopLastShop(closingWord(day), where, ahead(best, start), about(best), closes), W.stopNothingAfter(nextOpening(r, best)), day === 'holiday' ? W.leavebyHolidayAssumed : W.leavebySundayAssumed].join(' ');
  return idea('last-chance', 'action', best, text, lines);
}

/** "supermarket in Ettlingen", where a settlement is mapped there, else "supermarket at km 69". */
function settledName(v: Visit, r: Ride): string {
  let best: Pass | null = null;
  for (const s of passesOf(r.f)) {
    if (s.place.kind !== 'settlement' || !s.place.name) continue;
    const d = Math.abs(s.match.km - v.match.km);
    if (d <= SETTLEMENT_KM && (!best || d < Math.abs(best.match.km - v.match.km))) best = s;
  }
  return best ? W.stopWordIn(placeWord(v.place), best.place.name!) : shownAt(v);
}

/** The first time a food place past the stop opens, after this arrival: when "nothing open" ends. */
function nextOpening(r: Ride, after: Visit): string | null {
  let first: { at: Date; tz: string } | null = null;
  for (const x of passesOf(r.f)) {
    if (!isFoodPlace(x.place) || x.match.km <= r.stop) continue;
    for (const run of openRuns(r.hoursOf(x.place.id))) {
      if (run.from.getTime() <= after.arrival.getTime()) continue;
      if (!first || run.from.getTime() < first.at.getTime()) first = { at: run.from, tz: zoneOfPass(x, r.f) };
      break;
    }
  }
  return first ? `${weekdayOf(first.at, first.tz)} ${formatHm(first.at, first.tz)}` : null;
}

function gap(r: Ride): StopIdea | null {
  const onRide = r.open.filter((v) => v.match.km <= r.stop);
  type Anchor = { km: Km; t: number; v: Visit | null };
  const anchors: Anchor[] = [{ km: r.start, t: r.dep.getTime(), v: null }, ...onRide.map((v) => ({ km: v.match.km, t: v.arrival.getTime(), v })), { km: r.stop, t: r.stopAt.getTime(), v: null }];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    if (b.t - a.t < GAP_MIN * MIN - SLACK_MS) continue;
    const { km, span } = distanceSpan(a.km, b.km, b.t - a.t);
    const last = a.v;
    if (!last) return idea('gap', 'action', null, W.stopNoFoodNext(km, span));
    const near = onRide.filter((v) => v.arrival.getTime() <= last.arrival.getTime() && last.arrival.getTime() - v.arrival.getTime() <= LOOK_BACK_MIN * MIN + SLACK_MS);
    const best = rankOf(near, { kind: lastChanceKind, target: () => last.arrival.getTime(), wet: r.wet, meal: false }, r.ties)[0]!;
    const head = W.stopNoFoodAfter(km, shownAt(last), span);
    const openWord = best.until ? W.stopClosesAt(formatHm(best.until, best.tz)) : W.stopOpen247;
    const same = best.place.id === last.place.id;
    const consider = same ? W.stopStockUpThere(ahead(best, r.start), about(best), openWord, toiletsLine(best.place)) : W.stopStockUpAt(shownAt(best), ahead(best, r.start), about(best), openWord, toiletsLine(best.place));
    return idea('gap', 'action', best, `${head} ${consider}`, same ? [] : [W.stopLastOpen(shownAt(last))]);
  }
  return null;
}

const shortIdea = (v: Visit): string => W.stopIdeaShort(nameOf(v), untilLine(v));

function rain(r: Ride, plans: RainPlan[], wg: WaitOrGo | null, startsWet: boolean): StopIdea | null {
  const { dep } = r;
  const dueIn = (p: RainPlan): number => (p.window.reachAt.getTime() - dep.getTime()) / MIN;
  const stormPlan = plans.find((p) => p.window.kind === 'thunder');
  const plan = startsWet ? plans.find((p) => p.window.thunderKms.length > 0 && p.covers.length > 0) ?? null
    : plans.find((p) => dueIn(p) <= RAIN_WITHIN_MIN) ?? stormPlan ?? null;
  if (!startsWet && !plan) return null;

  const byId = new Map(r.visits.map((v) => [v.place.id, v]));
  const fromPlan = (plan?.covers ?? []).flatMap((c) => {
    const v = c.placeId !== null && c.coverClass <= 2 ? byId.get(c.placeId) : undefined;
    return v ? [{ spot: asCoverSpot(v), cover: c, v }] : [];
  });
  const seated = !startsWet ? [] : r.visits.flatMap((v) => {
    if (!v.open || !seatedKind(v.place) || v.match.km > r.stop || v.arrival.getTime() - dep.getTime() > SEATED_WITHIN_MIN * MIN + SLACK_MS) return [];
    const cover = coverOfSpot(asCoverSpot(v), v.arrival, null, r.hoursOf);
    return isCover(cover) ? [{ spot: asCoverSpot(v), cover, v }] : [];
  });
  const best = [...seated, ...fromPlan].sort(planOrder)[0];
  if (!best) return idea('rain', 'fine', null, plan?.none ?? plan?.firstCoverLine ?? W.stopNoSeatedNear, [], plan?.m ?? r.start);
  const lines: string[] = [];
  if (wg?.d && wg.where !== 'here' && wg.where.placeId === best.v.place.id) lines.push(W.stopWaitItOut(formatAbout(wg.d, best.v.tz)));
  return idea('rain', 'fine', best.v, shortIdea(best.v), lines);
}

/** The first hour at or over 30 °C at the rider's place and time, 11:00-15:00 on the place's clock. */
function firstHotHour(r: Ride): Date | null {
  const { f } = r;
  if (!f.forecast) return null;
  const forecast = routeForecast(f.forecast, f.trip.route);
  const startPoint = pointNearKm(forecast, r.start);
  const points = [...(startPoint ? [{ km: r.start, g: startPoint, t: r.dep }] : []), ...ridePoints(forecast, f.schedule).filter((p) => p.km <= r.stop)];
  for (const p of points) {
    const clock = minutesOf(p.t, r.zone(p.km));
    if (clock < NOON_FROM_MIN || clock >= NOON_TO_MIN) continue;
    const hour = hourAt(p.g.hours, p.t);
    if (hour && hour.t >= HOT_C) return new Date(hour.at.getTime() - 60 * MIN);
  }
  return null;
}

function heat(r: Ride): StopIdea | null {
  const hotFrom = firstHotHour(r);
  if (!hotFrom) return null;
  const seatedOpen = r.visits.filter((v) => v.open && v.match.km <= r.stop && seatedKind(v.place));
  const begun = hotFrom.getTime() <= r.dep.getTime();
  const rank = (list: Visit[], target: number): Visit | undefined => rankOf(list, { kind: () => 0, target: () => target, wet: true, meal: false }, r.ties)[0];
  const clock = (v: Visit): number => minutesOf(v.arrival, v.tz);
  const inNoon = (v: Visit): boolean => clock(v) >= NOON_FROM_MIN && clock(v) <= NOON_TO_MIN;
  let best: Visit | undefined;
  if (begun) best = rank(seatedOpen.filter((v) => clock(v) < NOON_TO_MIN), r.dep.getTime());
  else {
    const before = seatedOpen.filter((v) => v.arrival.getTime() < hotFrom.getTime());
    best = rank(before.filter(inNoon), hotFrom.getTime()) ?? before[before.length - 1];
  }
  if (!best) return idea('heat', 'fine', null, W.stopNoSeatedBeforeHeat(formatHm(hotFrom, r.zone(r.start))));
  return idea('heat', 'fine', best, `${W.stopHeatIdea} ${fullLine(best, r.start)}`);
}

/** Open for a meal: 45 minutes, and the kitchen's own hours where mapped. Mapped but not prepared never counts. */
function mealOpen(r: Ride, v: Visit): boolean {
  if (!openOnArrival(r.hoursOf(v.place.id), v.arrival, true)) return false;
  return !v.place.stop?.kitchenHours || openOnArrival(r.hoursOf(kitchenHoursId(v.place.id)), v.arrival, true);
}

function meal(r: Ride): StopIdea | null {
  const reached = r.visits.filter((v) => {
    const m = minutesOf(v.arrival, v.tz);
    return v.match.km <= r.stop && mealKind(v.place) !== null && m >= MEAL_FROM_MIN && m <= MEAL_TO_MIN
      && v.arrival.getTime() - r.dep.getTime() <= MEAL_WITHIN_MIN * MIN + SLACK_MS && mealOpen(r, v);
  });
  if (reached.length === 0) return null;
  const far = reached.filter((v) => v.arrival.getTime() - r.dep.getTime() >= MEAL_AWAY_MIN * MIN - SLACK_MS);
  const target = (v: Visit): number => instantAt(localIsoDate(v.arrival, v.tz), '12:30', v.tz).getTime();
  const best = rankOf(far, { kind: (p) => mealKind(p) ?? 9, target, wet: r.wet, meal: true }, r.ties)[0];
  if (!best) return idea('meal', 'fine', null, W.stopMealClose(nameOf(reached[0]!)), [], reached[0]!.match.km);
  return idea('meal', 'fine', best, `${W.stopLunchIdea} ${fullLine(best, r.start)}`);
}

function rhythm(r: Ride): StopIdea | null {
  const inBand = r.visits.filter((v) => {
    const away = (v.arrival.getTime() - r.dep.getTime()) / MIN;
    return v.open && v.match.km <= r.stop && away >= RHYTHM_FROM_MIN - SLACK_MS / MIN && away <= RHYTHM_TO_MIN + SLACK_MS / MIN;
  });
  const best = rankOf(inBand, { kind: rhythmKind, target: () => r.dep.getTime() + RHYTHM_TARGET_MIN * MIN, wet: r.wet, meal: false }, r.ties)[0];
  return best ? idea('rhythm', 'fine', best, `${W.stopIdeaPlain} ${fullLine(best, r.start)}`) : null;
}

// ---- the whole card's ideas ----------------------------------------------------------------------------------------

function visitsOf(f: FoodFacts): Visit[] {
  const leave = asLeave(f);
  const hoursOf = hoursIndex(f);
  const { startKm, stopKm, behindFromKm } = f.ride;
  const out: Visit[] = [];
  for (const x of passesOf(f)) {
    if (!isFoodPlace(x.place) && x.place.kind !== 'drink') continue;
    const km = x.match.km;
    if (km < startKm || km > stopKm + AT_STOP_KM || (startKm < behindFromKm && km >= startKm && km <= behindFromKm)) continue;
    const arrival = arrivalRidingOn(f.schedule, stopKm, f.trip.flatKph, x.match);
    const h = hoursOf(x.place.id);
    const state = stateAt(h, arrival);
    out.push({ ...x, arrival, open: openOnArrival(h, arrival), atArrival: openAtArrival(h, arrival), until: state.state === 'open' ? state.until : null, tz: zoneOfPass(x, leave) });
  }
  return out.sort((a, b) => a.arrival.getTime() - b.arrival.getTime() || compareFinal(a.place, b.place));
}

/** Whether the heat rule of section 6.3 holds on the day's ride: the salty-food line. */
function hotDay(r: Ride): boolean {
  const { f } = r;
  if (!f.forecast) return false;
  const forecast = routeForecast(f.forecast, f.trip.route);
  let max = -Infinity;
  for (const p of ridePoints(forecast, f.schedule)) {
    if (p.km > r.stop) continue;
    const w = planningWeather(forecast, null, p.km, p.t, { route: f.trip.route, timeZone: r.zone(p.km) });
    if (w.planT > max) max = w.planT;
  }
  return heatRule(max, f.schedule.ridingMinTo(r.stop));
}

const nothing = (status: Status, line: string, missing: Missing[]): Ideas => ({ title: null, timeline: [], nearestOpen: null, status, missing, line });

export function stopIdeas(f: FoodFacts, plans: RainPlan[], lb: LeaveBy, waterTarget: string | null, wg: WaitOrGo | null): Ideas {
  const { ride } = f;
  if (f.trip.departureDate === null) return nothing('unknown', W.stopSetDate, ['date']);
  if (!usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !validDate(ride.departure)) return nothing('unknown', W.stopCantWorkOut, []);
  if (ride.noRide || ride.startKm >= ride.stopKm) return nothing('fine', W.stopAtRouteEnd, []);
  if (!savedCovers(f, ride.startKm, ride.stopKm)) return nothing('unknown', W.stopNoPlaceDataHere, ['places']);

  const visits = visitsOf(f);
  const foodOnRide = visits.filter((v) => v.match.km <= ride.stopKm && isFoodPlace(v.place));
  const hoursOf = hoursIndex(f);
  const known = (v: Visit): boolean => {
    const state = stateAt(hoursOf(v.place.id), v.arrival).state;
    return state === 'open' || state === 'closed';
  };
  if (foodOnRide.length > 0 && !foodOnRide.some(known)) return nothing('unknown', W.stopHoursUnknown(foodOnRide.length), ['hours']);

  const position = latestUsable(f);
  const startsWet = f.forecast !== null && rainAtStart(f.forecast, ride, position, f.trip.route);
  const zone = (km: Km): string => routeZoneAt(f, km);
  const stopAt = f.schedule.atKm(ride.stopKm);
  const open = visits.filter((v) => v.open && isFoodPlace(v.place));
  const settlements = passesOf(f).filter((x) => x.place.kind === 'settlement');
  const r: Ride = {
    f, start: ride.startKm, stop: ride.stopKm, dep: ride.departure, stopAt, zone, visits, open, hoursOf,
    wet: startsWet || plans.length > 0, hot: false, ties: tiesBy(f, waterTarget, open, settlements),
  };
  r.hot = firstHotHour(r) !== null;
  r.wet ||= r.hot;

  const found = [lastChance(r, lb), gap(r), rain(r, plans, wg, startsWet), heat(r), meal(r)].flatMap((x) => (x ? [x] : []));
  const first = found.find((x) => x.placeId !== null || x.trigger === 'last-chance' || x.trigger === 'gap') ?? rhythm(r) ?? nextOpenTitle(r);
  const nearest = open[0];
  const nearestOpen = nearest ? idea('rhythm', 'fine', nearest, W.stopNearestOpen(fullLine(nearest, r.start))) : null;

  const others = found.filter((x) => x !== first);
  if (nearestOpen && nearestOpen.placeId !== first.placeId && !others.some((x) => x.placeId === nearestOpen.placeId)) others.push(nearestOpen);
  const timeline = others.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

  const title: StopIdea = { ...first, lines: [...first.lines] };
  if ((title.trigger === 'rain' || title.trigger === 'heat') && title.placeId !== null) title.lines.push(W.stopLaterTimes);
  if (hotDay(r)) title.lines.push(W.waterSaltyFood);

  const nextUnsaved = lb.closure && !savedCovers(f, ride.stopKm, f.schedule.rideOf(ride.stopKm + 1e-6).stopKm);
  return {
    title, timeline, nearestOpen, status: title.trigger === 'last-chance' || title.trigger === 'gap' ? 'action' : 'fine',
    missing: nextUnsaved ? ['places'] : [], line: null,
  };
}

/** T6 with no idea: section 6.4's next place open at arrival, which may close too soon for an idea, so it names no idea's place. */
function nextOpenTitle(r: Ride): StopIdea {
  const next = r.visits.find((v) => v.atArrival && isFoodPlace(v.place) && v.match.km <= r.stop + AT_STOP_KM);
  if (!next) return idea('rhythm', 'fine', null, W.stopNoneAtArrival);
  const closes = next.until ? W.stopOpenAtArrivalCloses(formatHm(next.until, next.tz)) : W.stopOpen247;
  return { ...idea('rhythm', 'fine', null, W.stopNextOpen(nameOf(next), ahead(next, r.start), about(next), closes), [], next.match.km), arrival: next.arrival };
}


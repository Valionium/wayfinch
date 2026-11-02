// The invariants the simulator runs after each scenario (spec section 11.2), in my own words beside each. They judge the
// screen against the values it was built on, and work out again by hand what can be worked out apart from the engines.
// INV-27, INV-28 and INV-35 wait for later sub-projects, and so do the ask-box clauses of the others (the plan's Decision 1).
import { addDaysIso, formatAbout, formatLeaveBy, formatNearestHm, instantAt, isKnownZone, localIsoDate, roundedLeaveBy, wallClock } from '../../src/core/answers/time.ts';

import { spotsOf, coverOfSpot, isCover, hoursLookup } from '../../src/core/engines/covers.ts';
import { fineLimit } from '../../src/core/engines/daylight.ts';
import { arrivalRidingOn, closingDay, hoursIndex, insideRadius, isFoodPlace, isFoodShop, passesOf, routeZoneAt, stopStamp, sunReadable, zoneOfPass } from '../../src/core/engines/leaveby.ts';
import { adjusted, isFarOff, isOffRoute, rejoinKm } from '../../src/core/engines/locate.ts';
import { distanceText } from '../../src/core/engines/rescue.ts';
import type { Schedule } from '../../src/core/engines/pace.ts';
import { ridingDate, nowSchedule, zoneLookupOf } from '../../src/core/engines/tripday.ts';
import { buffer, camp, findS1S2, seasonalWindow, use, waterNow, type Target } from '../../src/core/engines/water.ts';
import { hourClass } from '../../src/core/engines/weather-classes.ts';
import { gridOf, hourAt, hoursTouching, onTheRide, rainAtStart, rainHereNow, ridePoints } from '../../src/core/engines/weather-windows.ts';
import { haversineKm } from '../../src/core/geo/haversine.ts';
import { pointAtRouteKm } from '../../src/core/geo/project.ts';
import { openOnArrival, openOver, stateAt } from '../../src/core/hours/check.ts';
import { placeSpans } from '../../src/core/hours/spans.ts';
import { telLink, websiteLink } from '../../src/core/places/contact.ts';
import type { CountryCode } from '../../src/core/places/countries.ts';
import { GRID_KM_ROUNDING } from '../../src/core/route/grid.ts';
import { matchRoofs } from '../../src/core/route/matches.ts';
import type { Screen, ScreenParts } from '../../src/core/screen/screen.ts';
import type { Answer, Km, Place, PlaceHours, Position, RainWindow, RouteMatch, ScreenInputs, StopIdea } from '../../src/core/types.ts';
import { showKm, W } from '../../src/core/wording/en.ts';
import { bannedHits } from '../fixtures/banned.ts';
import { DEVICE_ZONES, withDeviceZone } from '../fixtures/zones.ts';
import { ruleOf } from '../gen/scenario.ts';
import type { Check } from './harness.ts';
import { allTexts, answersOf, HOUR, hm, MIN, must, riding, SECOND, textOf, textsOf, usable, validDate, within1s, world } from './world.ts';

type Ride = Screen['ride'];
type PlaceTarget = Target & { kind: 'place' };

const AT_STOP_KM = 1;
const NIGHT_RADIUS_KM = 3;
const EPS_KM = GRID_KM_ROUNDING;
const isPlace = (t: Target | undefined): t is PlaceTarget => t?.kind === 'place';
const targetsOf = (w: ScreenParts): PlaceTarget[] => (w.targets ? [w.targets.s1, w.targets.s2].filter(isPlace) : []);
const outdoorA = (p: Place): boolean => p.waterClass === 'A' && !p.indoorOrLimited;
const hoursOf = (i: ScreenInputs, id: string): PlaceHours | undefined => i.hours.find((h) => h.placeId === id);
const ideasOf = (w: ScreenParts): StopIdea[] => (w.ideas ? [...(w.ideas.title ? [w.ideas.title] : []), ...w.ideas.timeline] : []);
const onRideWindows = (w: ScreenParts, s: Screen): RainWindow[] => onTheRide(w.windows, s.ride);
const latestUsablePosition = (w: ScreenParts): Position | null => w.position;
const usableRide = (i: ScreenInputs, s: Screen): boolean => riding(i, s) && Number.isFinite(s.ride.startKm) && Number.isFinite(s.ride.stopKm);
const startZoneDate = (i: ScreenInputs): string => ridingDate(i.now, zoneLookupOf(i.routeZones)(0).timeZone);
const sunAtStop = (i: ScreenInputs, ride: Ride) => {
  const { lat, lon } = pointAtRouteKm(i.trip.route, ride.stopKm);
  return i.sun(lat, lon, ride.date);
};

/** What the Share message says about the stop it plans: the last kilometre named after "planning to stop". */
function shareStopKm(text: string | null): number | null {
  if (text === null) return null;
  const at = text.search(/planning to stop/i);
  if (at < 0) return null;
  const all = [...text.slice(at).matchAll(/km (\d+)/g)];
  const last = all[all.length - 1];
  return last ? Number(last[1]) : null;
}

const waitTexts = (s: Screen): string[] => s.cards.weather.items.map((x) => x.label).filter((l) => /^Waiting|^That is later than your leave-by|Waiting up to 3 hours|whether waiting could help/.test(l));

// ---- INV-01, INV-02 ------------------------------------------------------------------------------------------------

const INV01: Check = {
  id: 'INV-01',
  appliesTo: usableRide,
  check(i, s) {
    const w = world(i);
    const { ride } = s;
    const stop = ride.stopKm;
    must(s.strip.endKm === stop, `strip ends at ${s.strip.endKm}, the day's stop is ${stop}`);
    const daylightStamp = s.cards.daylight.stamp?.km;
    if (daylightStamp !== undefined) must(daylightStamp === stop, `Daylight says km ${daylightStamp}, the day's stop is ${stop}`);
    const climbStamp = s.cards.climbing.stamp?.km;
    if (climbStamp !== undefined) must(climbStamp === Math.min(stop, i.trip.route.lengthKm), `Climbing says km ${climbStamp}, the day's stop is ${stop}`);
    for (const b of s.strip.bands) must(b.fromKm <= stop, `a band starts at ${b.fromKm}, past the day's stop ${stop}`);
    for (const p of w.plans) {
      must(p.window.fromKm <= stop, `a rain plan's window starts at ${p.window.fromKm}, past the day's stop ${stop}`);
      must(p.m <= stop + EPS_KM || p.m <= p.window.toKm, `a rain plan's m ${p.m} lies past the day's stop ${stop}`);
    }
    const food = s.cards.food;
    for (const km of [food.stamp?.km, ...food.items.map((x) => x.stamp?.km)]) {
      if (km !== undefined) must(km <= stop + AT_STOP_KM + EPS_KM, `Food names km ${km}, past the day's stop ${stop}`);
    }
    const shared = shareStopKm(s.shareText);
    if (shared !== null && ride.phase !== 'after-ride') must(Math.abs(shared - stop) <= 0.5 + 1e-9, `Share plans to stop at km ${shared}, the day's stop is ${stop}`);
    if (ride.phase === 'after-ride') must(ride.tomorrowKm === stop, `tomorrow's stop is ${ride.tomorrowKm}, tomorrow's ride ends at ${stop}`);

    // One tonight's stop.
    if (ride.phase === 'before-ride' || ride.phase === 'riding') must(ride.tonightKm === stop, `before and while riding tonight's stop ${ride.tonightKm} is the day's stop ${stop}`);
    const tonight = ride.tonightKm ?? stop;
    const low = s.cards.weather.items.find((x) => x.label.startsWith("Night's low"));
    if (low) must(low.stamp?.km === tonight, `the night's low is at km ${low.stamp?.km}, tonight's stop is ${tonight}`);
    for (const t of targetsOf(w)) if (t.tonight) must(Math.abs(t.km - tonight) <= AT_STOP_KM + EPS_KM, `tonight's water at km ${t.km}, tonight's stop is ${tonight}`);
    if (ride.phase === 'after-ride') {
      const near = passesOf(i).filter((x) => ['campsite', 'lodging', 'hut'].includes(x.place.kind) && Math.abs(x.match.km - tonight) <= NIGHT_RADIUS_KM);
      if (near.length > 0) {
        for (const x of s.cards.sleep.items) {
          if (x.stamp?.km !== undefined) must(Math.abs(x.stamp.km - tonight) <= NIGHT_RADIUS_KM + 1e-6, `Sleep names km ${x.stamp.km}, tonight's stop is ${tonight}`);
        }
      }
      // Camp water: tonight counts, once, towards anything but tonight's own water.
      const end: Target = { kind: 'end', km: ride.startKm };
      if (i.trip.stay !== 'accommodation' && Number.isFinite(i.trip.campWaterL)) must(camp(w.water, 'now', end) === i.trip.campWaterL, `camp water ${camp(w.water, 'now', end)} L for tonight, the setting is ${i.trip.campWaterL} L`);
    }
  },
};

const INV02: Check = {
  id: 'INV-02',
  appliesTo: (i, s) => usableRide(i, s) && shareStopKm(s.shareText) !== null && s.cards.daylight.stamp?.km !== undefined,
  check(_i, s) {
    const shared = shareStopKm(s.shareText)!;
    const stamped = s.cards.daylight.stamp!.km!;
    must(Math.abs(shared - stamped) <= 0.5 + 1e-9, `leave-by names km ${stamped}, Share names km ${shared}`);
    must(s.cards.daylight.detail.includes(stopStamp(s.ride)), `leave-by's card does not name the stop as "${stopStamp(s.ride)}"`);
  },
};

// ---- INV-03 to INV-05: water and hours -------------------------------------------------------------------------------

const SHOPLIKE: ReadonlySet<Place['kind']> = new Set(['shop', 'cafe', 'fuel_shop']);

const FOOD_SHOP_TAGS: ReadonlySet<string> = new Set(['supermarket', 'convenience', 'bakery', 'kiosk']);
/** Food places by section 6.0's table, worked out apart from the engines. */
const countsAsFood = (p: Place): boolean => (p.kind === 'shop' && FOOD_SHOP_TAGS.has(p.tags['shop'] ?? ''))
  || (p.kind === 'fuel_shop' && p.tags['shop'] !== undefined && p.tags['shop'] !== 'no' && p.tags['automated'] !== 'yes')
  || p.kind === 'cafe' || p.kind === 'restaurant' || p.kind === 'ice_cream';

/** The first stretch of 2 hours or more on the day's ride with no food place open on arrival: T2, by hand. */
function firstFoodGap(i: ScreenInputs, s: Screen, w: ScreenParts): { from: number; to: number } | null {
  const { ride } = s;
  const open = passesOf(i)
    .filter((x) => countsAsFood(x.place) && x.match.km >= ride.startKm && x.match.km <= ride.stopKm && !insideRadius(ride, x.match.km))
    .map((x) => ({ km: x.match.km, t: w.schedule.atPlace(x.match), place: x.place }))
    .filter((x) => openOnArrival(hoursOf(i, x.place.id), x.t))
    .sort((a, b) => a.t.getTime() - b.t.getTime())
    .map((x) => ({ km: x.km, t: x.t.getTime() }));
  const anchors = [{ km: ride.startKm, t: ride.departure.getTime() }, ...open, { km: ride.stopKm, t: w.schedule.atKm(ride.stopKm).getTime() }];
  for (let n = 0; n + 1 < anchors.length; n++) {
    if (anchors[n + 1]!.t - anchors[n]!.t >= 120 * MIN - 2) return { from: anchors[n]!.t, to: anchors[n + 1]!.t };
  }
  return null;
}

const INV03: Check = {
  id: 'INV-03',
  // Every ride: T2 is compared with the gap worked out by hand whether or not a shop is the water target today.
  appliesTo: usableRide,
  check(i, s) {
    const w = world(i);
    for (const t of targetsOf(w)) {
      if (!SHOPLIKE.has(t.place.kind)) continue;
      must(openOnArrival(hoursOf(i, t.place.id), t.arrival), `Water uses ${t.place.id} at km ${t.km}, not open on arrival for Food at ${t.arrival.toISOString()}`);
      if (t.tonight || t.km > s.ride.stopKm) continue;
      // Food's own arrival, the same one, makes it an anchor of the gaps: no T2 gap can hold it.
      must(countsAsFood(t.place), `Water uses ${t.place.id} (shop=${t.place.tags['shop']}), which Food doesn't count, so a T2 gap could contain it`);
      must(within1s(arrivalRidingOn(w.schedule, s.ride.stopKm, i.trip.flatKph, t.match), t.arrival), `Water and Food reach ${t.place.id} at different times`);
    }
    if (!w.ideas?.title) return; // Food had no ride to judge
    const gap = firstFoodGap(i, s, w);
    const said = ideasOf(w).find((x) => x.trigger === 'gap');
    must((said !== undefined) === (gap !== null), `T2 says ${said ? `"${said.reason.slice(0, 70)}"` : 'no gap'}; by hand the first gap is ${JSON.stringify(gap)}`);
    if (gap) for (const t of targetsOf(w)) {
      if (SHOPLIKE.has(t.place.kind) && !t.tonight && t.km <= s.ride.stopKm) must(!(t.arrival.getTime() > gap.from && t.arrival.getTime() < gap.to), `a T2 gap contains the water source at km ${t.km}, reached ${t.arrival.toISOString()}`);
    }
  },
};

const RIDING_GAP_MIN = 120;

/** R0 by hand: 1 L over any stretch of more than 2 hours of riding without a town; at the least 0.5 L. Heat can only add. */
function reserveAtLeast(i: ScreenInputs, s: Screen, w: ScreenParts, toKm: Km): number {
  const from = s.ride.startKm;
  const towns = passesOf(i).filter((x) => x.place.kind === 'settlement' && x.match.km > from && x.match.km < toKm).map((x) => x.match.km).sort((a, b) => a - b);
  let previous = from;
  for (const km of [...towns, toKm]) {
    if (w.schedule.ridingMinBetween(previous, km) > RIDING_GAP_MIN + 1e-6) return 1;
    previous = km;
  }
  return 0.5;
}

/** Camp water by hand: each night at a stop before the target, and tonight's, unless the target is tonight's own water. */
function campByHand(i: ScreenInputs, s: Screen, w: ScreenParts, target: Target): number {
  if (i.trip.stay === 'accommodation') return 0;
  let nights = s.ride.phase === 'after-ride' && !s.ride.noRide && !(target.kind === 'place' && target.tonight) ? 1 : 0;
  const length = i.trip.route.lengthKm;
  const from = s.ride.startKm;
  for (let x = from, guard = 0; x <= target.km && guard < 1000; guard++) {
    const stop = w.schedule.rideOf(x).stopKm;
    if (stop >= from && stop < target.km && stop < length) nights++;
    if (!(stop >= x) || stop >= length) break;
    x = stop + 1e-6;
  }
  return i.trip.campWaterL * nights;
}

const INV04: Check = {
  id: 'INV-04',
  appliesTo: (i, s) => s.cards.water.status === 'fine' || targetsOf(world(i)).length > 0,
  check(i, s) {
    const w = world(i);
    // Section 6.0: class B and C are never the target, and only shops, cafés and fuel-station shops count without a class.
    for (const t of targetsOf(w)) {
      must(t.place.waterClass === 'A' || (t.place.waterClass === null && SHOPLIKE.has(t.place.kind)), `Water targets ${t.place.id} (${t.place.kind}, class ${t.place.waterClass}), no reliable source`);
    }
    if (s.cards.water.status !== 'fine') return;
    const targets = w.targets;
    must(targets !== null, 'Water is fine with no targets');
    const { s1, s2 } = targets!;
    must(s1.kind !== 'edge' && s2.kind !== 'edge', `Water is fine with a target at the edge of the place data (${s1.kind}, ${s2.kind})`);
    const now = waterNow(w.water);
    must(now.confirmed, 'Water is fine while the amount is unconfirmed');
    if (!now.confirmed) return;
    const left = now.litres - use(w.water, 'now', s2, 'plan');
    const r0 = reserveAtLeast(i, s, w, s2.km);
    const aside = buffer(w.water, 'now', s2) + r0 + campByHand(i, s, w, s2);
    must(left >= aside - 1e-9, `Water is fine with ${left.toFixed(3)} L on arrival at S2, ${aside.toFixed(3)} L needed (reserve ${r0})`);
  },
};

const notKnownSpans = (i: ScreenInputs): boolean => i.hours.some((h) => h.spans.some((x) => x.state === 'unknown' || x.state === 'possibly-closed'));

/** The same moment with every unknown, may-be-open and possibly-closed stretch read as closed: what counted must not change. */
const closedForUnknown = (i: ScreenInputs): ScreenInputs => ({
  ...i, hours: i.hours.map((h) => ({ ...h, spans: h.spans.map((x) => (x.state === 'unknown' || x.state === 'possibly-closed' ? { from: x.from, to: x.to, state: 'closed' as const } : x)) })),
});

/** An outdoor class A point with no season to go by, between 1 November and 31 March: only its hours can make it count. */
function reliesOnItsHours(i: ScreenInputs, t: PlaceTarget): boolean {
  if (seasonalWindow(t.place.seasonal) !== null) return false;
  const month = wallClock(t.arrival, routeZoneAt(i, t.km)).month;
  return month >= 11 || month <= 3;
}

const INV05: Check = {
  id: 'INV-05',
  appliesTo: (i, s) => usable(i, s) && i.trip.departureDate !== null && notKnownSpans(i),
  check(i, s) {
    const w = world(i);
    for (const t of targetsOf(w)) {
      if (outdoorA(t.place) && !reliesOnItsHours(i, t)) continue;
      const st = stateAt(hoursOf(i, t.place.id), t.arrival).state;
      must(st === 'open', `water target ${t.place.id} counts while its hours read ${st}`);
    }
    for (const p of w.plans) {
      for (const c of [...p.covers, ...(p.listInstead ?? [])]) {
        if (c.coverClass > 2) continue;
        const st = stateAt(hoursOf(i, c.placeId ?? ''), c.arrival).state;
        must(st === 'open', `cover ${c.placeId} of class ${c.coverClass} counts while its hours read ${st}`);
      }
    }
    for (const x of ideasOf(w)) {
      if (x.placeId === null || x.arrival === null) continue;
      const st = stateAt(hoursOf(i, x.placeId), x.arrival).state;
      must(st === 'open', `stop idea ${x.placeId} (${x.trigger}) counts while its hours read ${st}`);
    }
    if (s.ride.noRide || s.ride.phase === 'route-end') return;
    // Leave-by, S1 and S2, and the covers stand on known hours alone, so these stretches being closed changes none of them.
    const other = world(closedForUnknown(i));
    const a = w.lb;
    const b = other.lb;
    must((a?.unrounded?.getTime() ?? null) === (b?.unrounded?.getTime() ?? null), `leave-by moves when unknown hours read closed: ${a?.unrounded?.toISOString()} against ${b?.unrounded?.toISOString()}`);
    must(JSON.stringify(a?.kept) === JSON.stringify(b?.kept), `leave-by keeps ${JSON.stringify(a?.kept)} with unknown hours, ${JSON.stringify(b?.kept)} with them closed`);
    const ids = (x: ScreenParts): string => JSON.stringify(targetsOf(x).map((t) => [t.place.id, t.km]));
    must(ids(w) === ids(other), `S1 and S2 change when unknown hours read closed: ${ids(w)} against ${ids(other)}`);
    const covers = (x: ScreenParts): string => JSON.stringify(x.plans.map((p) => p.covers.filter((c) => c.coverClass <= 2).map((c) => [c.placeId, c.km])));
    must(covers(w) === covers(other), `class 1-2 covers change when unknown hours read closed: ${covers(w)} against ${covers(other)}`);
  },
};

// ---- INV-06 to INV-12: rain ------------------------------------------------------------------------------------------

const INV06: Check = {
  id: 'INV-06',
  appliesTo: (i, s) => usable(i, s) && (world(i).plans.some((p) => p.covers.length > 0) || ideasOf(world(i)).some((x) => x.placeId !== null)),
  check(i, s) {
    const w = world(i);
    const of = hoursLookup(w.stop);
    for (const p of w.plans) {
      const tm = w.schedule.atKm(p.m).getTime();
      const thunder = p.window.kind === 'thunder';
      for (const c of p.covers) {
        const lead = (tm - c.arrival.getTime()) / MIN;
        must(lead >= 15 - 1e-3, `cover at km ${c.km} is reached ${lead.toFixed(2)} min before m, under 15`);
        if (lead > 60 + 1e-3) {
          // Only as the latest cover that counts.
          must(p.covers.length === 1, `${p.covers.length} covers past the band`);
          const later = spotsOf(w.stop).filter((x) => x.match.km >= s.ride.startKm && x.match.km <= p.m && !insideRadius(s.ride, x.match.km)).filter((x) => {
            const arrival = w.schedule.atPlace(x.match);
            const r = coverOfSpot(x, arrival, p.window.end, of);
            return isCover(r) && (!thunder || r.coverClass <= 2) && (tm - arrival.getTime()) / MIN >= 15 - 1e-3 && arrival.getTime() > c.arrival.getTime() + SECOND;
          });
          must(later.length === 0, `cover at km ${c.km} is ${lead.toFixed(1)} min before m, and a later one counts at km ${later[0]?.match.km}`);
        }
        if (c.coverClass <= 2) {
          must(openOver(hoursOf(i, c.placeId ?? ''), c.arrival, new Date(c.arrival.getTime() + 30 * MIN)), `class ${c.coverClass} cover ${c.placeId} is not open from arrival for 30 min`);
        }
      }
    }
    for (const x of ideasOf(w)) {
      if (x.placeId === null || x.arrival === null) continue;
      const minutes = x.trigger === 'meal' ? 45 : 30;
      must(openOver(hoursOf(i, x.placeId), x.arrival, new Date(x.arrival.getTime() + minutes * MIN)), `stop idea ${x.placeId} (${x.trigger}) is not open for ${minutes} min from arrival`);
    }
  },
};

const stormsOnRide = (w: ScreenParts, s: Screen): RainWindow[] => onRideWindows(w, s).filter((x) => x.thunderKms.length > 0);

const ROOF_LABEL = /^Mapped as /;

/** How many sides, ahead and behind, have an open building for riding there now. */
function openBuildingSides(i: ScreenInputs, s: Screen): number {
  const w = world(i);
  const ride = chipRideByHand(i, s);
  const sched = chipSchedule(i, s);
  const of = hoursLookup(w.stop);
  const inside = (km: Km): boolean => insideRadius(ride, km);
  const open = (x: ReturnType<typeof spotsOf>[number], arrival: Date): boolean => {
    const r = coverOfSpot(x, arrival, null, of);
    return isCover(r) && r.coverClass <= 2;
  };
  const spots = spotsOf(w.stop).filter((x) => !inside(x.match.km));
  const ahead = spots.some((x) => x.match.km >= ride.startKm && open(x, sched.atPlace(x.match)));
  const behind = spots.some((x) => x.match.km < ride.behindFromKm && open(x, sched.behind(x.match)));
  return Number(ahead) + Number(behind);
}

const INV07: Check = {
  id: 'INV-07',
  appliesTo: (i, s) => usableRide(i, s) && stormsOnRide(world(i), s).length > 0,
  check(i, s) {
    const w = world(i);
    const position = latestUsablePosition(w);
    const wet = rainAtStart(w.forecast, s.ride, position);
    const first = w.forecast ? ridePoints(w.forecast, w.schedule)[0]?.km : undefined;
    must(s.cards.weather.status === 'warning', `a thunderstorm on the ride, Weather is ${s.cards.weather.status}`);
    for (const x of stormsOnRide(w, s)) {
      must(s.strip.bands.some((b) => b.kind === 'thunder' && b.fromKm <= x.fromKm && b.toKm >= x.toKm), `no red band over km ${x.fromKm}-${x.toKm}`);
      const plan = w.plans.find((p) => p.window.fromKm === x.fromKm && p.window.toKm === x.toKm);
      must(plan !== undefined, `no plan for the thunderstorm at km ${x.fromKm}`);
      if (!plan) continue;
      for (const c of plan.covers) must(c.coverClass <= 2, `class ${c.coverClass} cover in a thunderstorm plan`);
      const metFirst = x.metKms[0] ?? x.fromKm;
      const startsHere = wet && x.fromKm === first;
      const later = x.thunderKms.find((k) => k > metFirst);
      if (startsHere) {
        must(plan.listInstead !== null, 'rain at the start, and no Shelter list in the plan\'s place');
        if (later !== undefined) must(plan.m === later, `a storm further on: m is ${plan.m}, the first such point is ${later}`);
        else must(plan.covers.length === 0, 'a storm at the start gets the list, not a plan');
        for (const line of plan.listLines) if (ROOF_LABEL.test(line)) must(line.includes(W.weatherNoLightningProtection), `a roof in the list lacks the lightning line: ${line}`);
      } else {
        must(plan.listInstead === null, 'no rain at the start, yet a list in the plan\'s place');
      }
      const row = s.cards.weather.items.find((y) => y.stamp?.km === x.fromKm && y.detail?.includes(W.weatherNoLightningProtection));
      must(row !== undefined, `the thunderstorm at km ${x.fromKm} has no row with the lightning line`);
    }
    const shelter = s.chips.shelter;
    must(shelter.status === 'warning', `a storm on the ride, the Shelter chip is ${shelter.status}`);
    const rows = shelter.items.filter((x) => x.status === 'fine');
    for (const x of shelter.items) if (ROOF_LABEL.test(x.label) && x.status === 'fine') must(x.detail?.includes(W.weatherNoLightningProtection) === true, `a roof under Shelter lacks the lightning line: ${x.label}`);
    if (rows.some((x) => !ROOF_LABEL.test(x.label))) must(!ROOF_LABEL.test(rows[0]!.label), `a roof heads the Shelter list before the open buildings: ${rows[0]!.label}`);
    const heads = openBuildingSides(i, s);
    must(rows.length >= heads, `${heads} sides have an open building, the Shelter list shows ${rows.length} covers`);
    for (const x of rows.slice(0, heads)) must(!ROOF_LABEL.test(x.label), `an open building on each side should head the Shelter list, and "${x.label}" stands among them`);
    for (const x of s.chips.emergency.items) {
      if (/Mapped as /.test(`${x.label} ${x.detail ?? ''}`)) must(x.detail?.includes(W.weatherNoLightningProtection) === true, `a roof on the Emergency card lacks the lightning line: ${x.label}`);
    }
  },
};

const INV08: Check = {
  id: 'INV-08',
  appliesTo: (i, s) => usableRide(i, s) && world(i).forecast !== null,
  check(i, s) {
    const w = world(i);
    const position = latestUsablePosition(w);
    const hour = rainHereNow(w.forecast, position, i.now);
    const here = hour !== null && hourClass(hour).cls === 'likely' && s.ride.phase !== 'before-trip';
    const title = s.cards.weather.title;
    const says = title.startsWith(W.weatherRainHere);
    if (says) must(here, `the title says "${title}", and the hour here is not likely`);
    const firstGoes = stormsOnRide(w, s).length > 0 || title.includes('hunderstorm');
    if (here && !firstGoes) must(says, `rain likely here now, and the title says "${title}"`);

    const wet = rainAtStart(w.forecast, s.ride, position);
    const idea = ideasOf(w).find((x) => x.trigger === 'rain');
    if (wet && w.ideas?.title) must(idea !== undefined, 'rain at the start, and no T3 idea');
    if (w.wg?.where !== undefined && w.wg.where !== 'here') must(!wet, 'rain at the start, and wait or go waits at a cover');
    const first = w.forecast ? ridePoints(w.forecast, w.schedule)[0]?.km : undefined;
    for (const p of w.plans) {
      const atStart = p.window.fromKm === first;
      if (atStart) must((p.listInstead !== null) === wet, `rule 5's list is ${p.listInstead !== null}, rain at the start is ${wet}`);
      else must(p.listInstead === null, 'a list in place of a plan away from the start');
    }
    const startsAtPosition = position !== null && !isFarOff(position) && adjusted(position).aheadFromKm === s.ride.startKm;
    if (startsAtPosition && s.ride.departure.getTime() === i.now.getTime() && s.ride.phase !== 'before-trip') {
      must(here === wet, `the ride departs now from the position: rain here is ${here}, rain at the start is ${wet}`);
    }
  },
};

const INV09: Check = {
  id: 'INV-09',
  appliesTo: (i, s) => usableRide(i, s) && onRideWindows(world(i), s).some((x) => x.cls === 'possible'),
  check(i, s) {
    const w = world(i);
    for (const p of w.plans) must(p.window.cls === 'likely', `possible rain at km ${p.window.fromKm} got a plan`);
    const allowed = new Set(w.plans.flatMap((p) => [...(p.covers[0] ? [p.covers[0].km] : []), ...(p.listInstead?.[0] ? [p.listInstead[0].km] : [])]));
    for (const c of s.strip.icons) if (c.kind === 'cover') must(allowed.has(c.km), `a cover icon at km ${c.km} that no likely plan names`);
    const wet = rainAtStart(w.forecast, s.ride, latestUsablePosition(w));
    if (!wet && w.plans.length === 0) must(!ideasOf(w).some((x) => x.trigger === 'rain'), 'a T3 idea with possible rain only');
  },
};

const covering = (s: Screen, from: Km, to: Km, cls: 'thunder' | 'likely' | 'possible'): boolean => s.strip.bands.some((b) => b.kind === cls && b.fromKm <= from && b.toKm >= to);
const listedOn = (a: Answer, km: Km): boolean => a.stamp?.km === km || a.items.some((x) => x.stamp?.km === km);

/** How often a run met the ruling below: a check that never meets it proves nothing about it. */
export const INV10_REACH = { roofsUndrawn: 0 };

const INV10: Check = {
  id: 'INV-10',
  appliesTo: (i, s) => usable(i, s) && i.trip.departureDate !== null && (onRideWindows(world(i), s).length > 0 || s.strip.icons.length > 0),
  check(i, s) {
    const w = world(i);
    for (const x of onRideWindows(w, s)) {
      must(covering(s, x.fromKm, x.toKm, x.kind === 'thunder' ? 'thunder' : x.cls), `no ${x.kind} band over the window at km ${x.fromKm}-${x.toKm}`);
    }
    const title = s.cards.weather.title;
    const stamped = s.cards.weather.stamp?.km;
    // A title about rain on the ride, not the night's thunderstorm at tonight's stop, not rain here now.
    if (stamped !== undefined && onRideWindows(w, s).some((x) => s.cards.weather.items.some((y) => y.label === title && y.stamp?.km === x.fromKm))) {
      must(s.strip.bands.some((b) => b.fromKm <= stamped && b.toKm >= stamped), `the title's stamp at km ${stamped} has no band`);
    }
    for (const p of w.plans) {
      const c = p.covers[0];
      if (!c) continue;
      const drawn = s.strip.icons.some((x) => x.kind === 'cover' && x.km === c.km);
      // Owner's ruling, 2 Nov 2026: the storm rule wins over "first cover is always drawn". A plain roof (class 3 to 5) in a
      // thunderstorm band or up to 5 km before it is not drawn. This is the one first cover that may go without an icon.
      const stormy = c.coverClass > 2 && s.strip.bands.some((b) => b.kind === 'thunder' && c.km >= b.fromKm - 5 && c.km <= b.toKm);
      const alsoBuilding = w.plans.some((q) => { const o = q.covers[0] ?? q.listInstead?.[0]; return o !== undefined && o.km === c.km && o.coverClass <= 2; });
      if (stormy && !alsoBuilding) {
        INV10_REACH.roofsUndrawn++;
        must(!drawn, `a plain roof at km ${c.km} is drawn in or just before a thunderstorm band`);
      }
      if (!stormy) must(drawn, `plan's first cover at km ${c.km} has no icon`);
    }
    const weather = textOf(s.cards.weather);
    for (const icon of s.strip.icons) {
      must(icon.km >= s.strip.startKm - EPS_KM && icon.km <= s.strip.endKm + EPS_KM, `${icon.kind} icon at km ${icon.km} off the strip`);
      if (icon.kind === 'water') must(icon.opens === 'water' && listedOn(s.cards.water, icon.km), `water icon at km ${icon.km} opens a card that doesn't list it`);
      if (icon.kind === 'food') must(icon.opens === 'food' && listedOn(s.cards.food, icon.km), `food icon at km ${icon.km} opens a card that doesn't list it`);
      if (icon.kind === 'sleep') must(icon.opens === 'sleep' && listedOn(s.cards.sleep, icon.km), `sleep icon at km ${icon.km} opens a card that doesn't list it`);
      if (icon.kind === 'cover') must(icon.opens === 'weather' && weather.includes(`km ${showKm(icon.km)}`), `cover icon at km ${icon.km} opens a card that doesn't list it`);
    }
    for (const b of s.strip.bands) must(b.opens === 'weather' && s.cards.weather.items.some((x) => x.stamp?.km === b.fromKm), `the band at km ${b.fromKm} opens a card that doesn't list it`);
  },
};

const INV11: Check = {
  id: 'INV-11',
  appliesTo: (i, s) => usable(i, s) && i.forecast !== null && validDate(i.forecast.fetchedAt) && gridOf(i.forecast).length > 0 && i.now.getTime() - i.forecast.fetchedAt.getTime() > 12 * HOUR,
  check(i, s) {
    must(world(i).wg === null, 'a forecast over 12 hours old, and wait or go worked out');
    const shown = waitTexts(s);
    must(shown.length === 0, `a forecast over 12 hours old, and the card says: ${shown[0]}`);
    must(s.cards.weather.freshness.stale, 'a forecast over 12 hours old does not read stale');
  },
};

/** The thunderstorm hours within 1 hour of the rider at each point of the day's ride, for one way of riding it. */
function stormHours(w: ScreenParts, stop: Km, atKm: (km: Km) => number): Set<string> {
  const met = new Set<string>();
  if (!w.forecast) return met;
  for (const p of ridePoints(w.forecast, w.schedule)) {
    if (p.km > stop) continue;
    const t = atKm(p.km);
    for (const h of hoursTouching(p.g.hours, t - HOUR, t + HOUR)) if (hourClass(h).thunder) met.add(`${p.g.km}|${h.at.getTime()}`);
  }
  return met;
}

const INV12: Check = {
  id: 'INV-12',
  appliesTo: (i) => world(i).wg?.d != null,
  check(i, s) {
    const w = world(i);
    const wg = w.wg!;
    const d = wg.d!;
    const dep = s.ride.departure;
    const stop = s.ride.stopKm;
    const arrivalNow = w.schedule.atKm(stop);
    must(within1s(wg.arrivalNow, arrivalNow), `wait or go's arrival now ${wg.arrivalNow.toISOString()} is not the schedule's ${arrivalNow.toISOString()}`);
    const tz = routeZoneAt(i, stop);
    const line = wg.lines[0] ?? '';
    must(line.includes(`instead of ${formatNearestHm(arrivalNow, tz)}`), `"instead of" differs from the arrival ${formatNearestHm(arrivalNow, tz)}: ${line}`);
    must(s.strip.endText.includes(formatAbout(arrivalNow, tz)), `the strip's arrival (${s.strip.endText}) differs from ${formatAbout(arrivalNow, tz)}`);
    const dusk = sunAtStop(i, s.ride).dusk;
    if (dusk) must(wg.arrivalWait!.getTime() < dusk.getTime(), `waiting arrives at ${hm(wg.arrivalWait!, tz)}, at or after civil dusk ${hm(dusk, tz)}`);
    let wayOut: (km: Km) => number;
    if (wg.where === 'here') {
      must(Math.abs(wg.arrivalWait!.getTime() - arrivalNow.getTime() - (d.getTime() - dep.getTime())) <= SECOND, 'waiting here does not move the arrival by exactly the wait');
      const leave = w.schedule.withDeparture(d);
      wayOut = (km) => leave.atKm(km).getTime();
    } else {
      const cover: RouteMatch = { placeId: wg.where.placeId ?? '', km: wg.where.km, offRouteM: wg.where.offRouteM };
      const waited = d.getTime() - w.schedule.atPlace(cover).getTime();
      must(waited >= -SECOND, 'wait or go leaves the cover before reaching it');
      const on = w.schedule.through(cover).withDeparture(new Date(dep.getTime() + waited));
      wayOut = (km) => (km <= cover.km ? w.schedule.atKm(km).getTime() : on.atKm(km).getTime());
      must(within1s(on.atKm(stop), wg.arrivalWait!), 'waiting at a cover: the arrival is not the wait plus the round trip');
    }
    const before = stormHours(w, stop, (km) => w.schedule.atKm(km).getTime());
    for (const k of stormHours(w, stop, wayOut)) must(before.has(k), `waiting meets a thunderstorm hour leaving at the departure does not: ${k}`);
    const via = wg.where === 'here' ? undefined : { cover: { placeId: wg.where.placeId ?? '', km: wg.where.km, offRouteM: wg.where.offRouteM }, dep };
    for (const c of w.lb?.checks ?? []) if (c.meets(dep)) must(c.meets(d, via), `waiting breaks the ${c.id} limit`);
  },
};

// ---- INV-13 to INV-16: leave-by --------------------------------------------------------------------------------------

/** Worked out apart from the engine: does leaving at `d` meet the limits leave-by says it keeps? */
function meetsKept(i: ScreenInputs, s: Screen, w: ScreenParts, d: Date): { ok: boolean; why: string } {
  const lb = w.lb!;
  const { ride } = s;
  const stop = ride.stopKm;
  const keepWater = lb.kept.includes('water');
  const foodId = lb.kept.find((k) => k === 'food-closure' || k === 'food-tonight');
  const water = keepWater ? targetsForLimit(w, s).map((t) => t.match) : [];
  const sun = sunAtStop(i, ride);
  const limit = lb.kept.includes('daylight') ? fineLimit(sun, w.schedule.ridingMinTo(stop)) : null;
  const endOfDay = instantAt(addDaysIso(ride.date, 1), '00:00', routeZoneAt(i, ride.startKm)).getTime();
  if (d.getTime() > endOfDay) return { ok: false, why: 'past midnight' };

  const tryWith = (stops: RouteMatch[]): { s: Schedule; why: string | null } => {
    let sched = w.schedule;
    const seen = new Set<string>();
    for (const m of stops) {
      const key = `${m.placeId}|${m.km}`;
      if (m.km < stop && !seen.has(key)) sched = sched.through(m);
      seen.add(key);
    }
    sched = sched.withDeparture(d);
    if (limit && sched.atKm(stop).getTime() > limit.getTime()) return { s: sched, why: 'daylight' };
    for (const m of water) {
      const t = sched.atPlace(m).getTime();
      if (!openOver(hoursOf(i, m.placeId), new Date(t - 30 * MIN), new Date(t + 30 * MIN))) return { s: sched, why: `water ${m.placeId}` };
    }
    return { s: sched, why: null };
  };
  if (!foodId) {
    const r = tryWith(water);
    return { ok: r.why === null, why: r.why ?? '' };
  }
  const counts = passesOf(i).filter((x) => {
    const km = x.match.km;
    if (km < ride.startKm || km > stop + AT_STOP_KM || insideRadius(ride, km)) return false;
    return isFoodShop(x.place) || (foodId === 'food-tonight' && isFoodPlace(x.place) && Math.abs(km - stop) <= AT_STOP_KM);
  });
  let why = 'no food place';
  for (const x of counts) {
    const r = tryWith([...water, x.match]);
    if (r.why !== null) {
      why = r.why;
      continue;
    }
    const t = arrivalRidingOn(r.s, stop, i.trip.flatKph, x.match);
    if (t.getTime() <= endOfDay && openOnArrival(hoursOf(i, x.place.id), t)) return { ok: true, why: '' };
    why = `food ${x.place.id}`;
  }
  return { ok: false, why };
}

const LATER_MIN = [1 / 30, 1, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 360];

/** S1 and S2 of the day's ride as a water limit reads them: found on tomorrow's ride alone after the day's ride. */
function targetsForLimit(w: ScreenParts, s: Screen): PlaceTarget[] {
  const found = s.ride.phase === 'after-ride' ? findS1S2(w.water, { tomorrowOnly: true }) : w.targets;
  if (!found) return [];
  const seen = new Set<string>();
  return [found.s1, found.s2].filter(isPlace).filter((t) => {
    const key = `${t.place.id}|${t.km}`;
    if (t.km >= s.ride.stopKm || outdoorA(t.place) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const INV13: Check = {
  id: 'INV-13',
  appliesTo: (i, s) => usableRide(i, s) && world(i).lb?.unrounded != null,
  check(i, s) {
    const w = world(i);
    const d = w.lb!.unrounded!;
    const tz = routeZoneAt(i, s.ride.startKm);
    const at = meetsKept(i, s, w, d);
    const justBefore = meetsKept(i, s, w, new Date(d.getTime() - SECOND));
    must(at.ok || justBefore.ok, `leaving at the unrounded leave-by ${hm(d, tz)} breaks: ${at.why}`);
    for (const later of LATER_MIN) {
      const t = new Date(d.getTime() + later * MIN);
      const r = meetsKept(i, s, w, t);
      must(!r.ok, `leaving ${later} min after the leave-by ${hm(d, tz)} still meets every kept limit`);
    }
    const shown = roundedLeaveBy(d, tz);
    const gap = d.getTime() - shown.getTime();
    must(gap >= 0 && gap < 5 * MIN, `shown ${hm(shown, tz)} is ${gap / MIN} min before the unrounded ${hm(d, tz)}`);
    const text = textOf(s.cards.daylight);
    must(text.includes(formatLeaveBy(d, tz).replace('about ', '')), `the Daylight card does not show ${formatLeaveBy(d, tz)}`);
  },
};

const INV14: Check = {
  id: 'INV-14',
  appliesTo: (i, s) => usableRide(i, s) && world(i).lb !== null && sunReadable(sunAtStop(i, s.ride)) && !sunAtStop(i, s.ride).lightAllNight && sunAtStop(i, s.ride).sunset !== null,
  check(i, s) {
    const w = world(i);
    const lb = w.lb!;
    const stop = s.ride.stopKm;
    const limit = fineLimit(sunAtStop(i, s.ride), w.schedule.ridingMinTo(stop))!;
    const tz = routeZoneAt(i, stop);
    if (lb.unrounded) {
      must(lb.kept.includes('daylight'), 'daylight was set aside');
      const stops = lb.stops.filter((m) => m.km < stop);
      let sched = w.schedule;
      for (const m of stops) sched = sched.through(m);
      const arrival = sched.withDeparture(lb.unrounded).atKm(stop);
      must(arrival.getTime() <= limit.getTime() + SECOND, `leaving at leave-by reaches the stop at ${hm(arrival, tz)}, past the fine limit ${hm(limit, tz)}`);
    } else {
      const fromFour = instantAt(s.ride.date, '04:00', routeZoneAt(i, s.ride.startKm));
      const arrival = w.schedule.withDeparture(fromFour).atKm(stop);
      must(arrival.getTime() > limit.getTime() - SECOND, `no leave-by, yet leaving at 04:00 reaches the stop at ${hm(arrival, tz)}, before the fine limit ${hm(limit, tz)}`);
    }
  },
};

const INV15: Check = {
  id: 'INV-15',
  appliesTo: (i, s) => usableRide(i, s) && world(i).lb !== null && world(i).lb!.dataNote === null && (world(i).lb!.waterSources.length > 0 || targetsForLimit(world(i), s).length > 0),
  check(i, s) {
    const w = world(i);
    const lb = w.lb!;
    const named = targetsForLimit(w, s).map((t) => t.place.id);
    if (lb.waterSources.length === 0 && lb.limits.length === 0) return; // the sun can't be read: no limits at all
    for (const id of lb.waterSources) must(named.includes(id), `a water limit names ${id}, not S1 or S2 before the stop: ${JSON.stringify(named)}`);
    for (const id of named) must(lb.waterSources.includes(id), `S1 or S2 ${id} before the stop adds no water limit`);
    for (const p of i.places) if (outdoorA(p)) must(!lb.waterSources.includes(p.id), `outdoor class A point ${p.id} adds a limit`);
  },
};

const nextIsClosing = (i: ScreenInputs, s: Screen): boolean => {
  const next = addDaysIso(s.ride.date, 1);
  if (new Date(`${next}T00:00:00Z`).getUTCDay() === 0) return true;
  const zone = zoneLookupOf(i.routeZones)(s.ride.stopKm).holidayZone;
  return zone !== null && Object.hasOwn(i.holidays, zone) && i.holidays[zone]!.includes(next);
};

const INV16: Check = {
  id: 'INV-16',
  appliesTo: (i, s) => usableRide(i, s) && world(i).lb !== null,
  check(i, s) {
    const w = world(i);
    const lb = w.lb!;
    const { stopKm } = s.ride;
    const atEnd = stopKm >= i.trip.route.lengthKm;
    const last = ideasOf(w).find((x) => x.trigger === 'last-chance');
    if (atEnd) must(!lb.closure, 'the closure limit applies at the route end');
    if (last && last.placeId !== null) must(last.reason.startsWith('Last open shop before') === lb.closure, `T1 says "${last.reason.slice(0, 60)}", the closure limit is ${lb.closure}`);
    if (atEnd && last) must(!/^Last open shop before/.test(last.reason), 'T1\'s closing clause at the route end');
    if (lb.dataNote !== null || lb.limits.length === 0) return; // no plan was made from places
    const nextStop = w.schedule.rideOf(stopKm + 1e-6).stopKm;
    const of = hoursIndex(i);
    const openNext = passesOf(i).some((x) => isFoodPlace(x.place) && x.match.km > stopKm && x.match.km <= nextStop && openOnArrival(of(x.place.id), w.schedule.atPlace(x.match)));
    const clause = !atEnd && nextIsClosing(i, s) && !openNext;
    must(lb.closure === clause, `the closure limit is ${lb.closure}, T1's clause is ${clause} (closing day ${closingDay(w.leave, s.ride)}, open next ${openNext})`);
  },
};

const SHELTER_NOT_SLEEP = (p: Place): boolean => p.kind === 'shelter' && p.tags['shelter_type'] !== 'lean_to' && p.tags['shelter_type'] !== 'basic_hut';
const LEAN_TO = (p: Place): boolean => p.kind === 'shelter' && (p.tags['shelter_type'] === 'lean_to' || p.tags['shelter_type'] === 'basic_hut');

const INV17: Check = {
  id: 'INV-17',
  appliesTo: (i, s) => usable(i, s) && s.cards.sleep.items.length > 0,
  check(i, s) {
    const beforeNight = s.ride.phase === 'before-trip' || s.ride.phase === 'before-ride' || s.ride.phase === 'riding';
    if (beforeNight) {
      for (const x of s.cards.sleep.items) {
        if (x.stamp?.km !== undefined && x.stamp.km > s.ride.stopKm + EPS_KM) must(x.status !== 'warning', `a Sleep candidate beyond the stop reads warning: ${x.label}`);
      }
    }
    const passes = passesOf(i);
    for (const x of s.cards.sleep.items) {
      const km = x.stamp?.km;
      if (km === undefined) continue;
      const here = passes.filter((p) => p.match.km === km && x.label.startsWith(`${p.place.name ?? ''}`) && p.place.name);
      if (here.length > 0) must(!here.every((p) => SHELTER_NOT_SLEEP(p.place)), `a weather shelter is a sleep candidate: ${x.label}`);
    }
    const km = s.cards.sleep.stamp?.km;
    if (km !== undefined && s.cards.sleep.status === 'fine') {
      const title = s.cards.sleep.title;
      const here = passes.filter((p) => p.match.km === km && p.place.name && title.includes(p.place.name) && ['campsite', 'lodging', 'hut', 'shelter'].includes(p.place.kind));
      if (here.length > 0) must(!here.every((p) => LEAN_TO(p.place)), `a lean-to is tonight's stop: ${title}`);
    }
  },
};

// ---- INV-18 to INV-25 ------------------------------------------------------------------------------------------------

const INV18: Check = {
  id: 'INV-18',
  appliesTo: () => true,
  check(_i, s) {
    for (const [name, a] of Object.entries(s.cards)) {
      if (name !== 'water' && name !== 'weather' && name !== 'daylight') must(a.status !== 'warning', `${name} card reads warning: ${a.title}`);
    }
  },
};

const rideLegKm = (ride: Ride): number => rejoinKm(ride.startOffRouteM);
const homeAway = (s: Screen, p: Position | null, i: ScreenInputs): boolean =>
  p !== null && isFarOff(p) && i.trip.departureDate !== null && (s.ride.phase === 'before-trip' || (s.ride.phase === 'before-ride' && s.ride.date === i.trip.departureDate));

/** The ride a chip rides, worked out apart from it: from the position, least favourably when approximate, with its own leg. */
function chipRideByHand(i: ScreenInputs, s: Screen): Ride {
  const p = latestUsablePosition(world(i));
  if (!p) return s.ride;
  const length = i.trip.route.lengthKm;
  const held = (km: Km): Km => Math.max(0, Math.min(length, km));
  const accKm = p.approximate ? p.accuracyM / 1000 : 0;
  return { ...s.ride, startKm: held(p.km - accKm), behindFromKm: held(p.km + accKm), startOffRouteM: isOffRoute(p) ? p.offRouteM : 0 };
}
const chipSchedule = (i: ScreenInputs, s: Screen): Schedule => nowSchedule(chipRideByHand(i, s), i.trip, i.now, { sun: i.sun, routeZones: i.routeZones });

/** A body factor that is a number: with none, the card says it can't work water out. */
const usableWaterFigures = (i: ScreenInputs): boolean => i.profile.k > 0 && i.profile.k < Infinity;

const LOADED = 0.82;
const WITH_BREAKS = 1.15;

/** Emergency measures from the position itself: its distances, worked out from the coordinates. */
function emergencyDistances(i: ScreenInputs, s: Screen, p: Position): void {
  const e = s.chips.emergency;
  const metres = (q: { lat: number; lon: number }): number => haversineKm(p, q) * 1000;
  if (e.rescue) {
    const m = metres(e.rescue);
    must(Math.abs(e.rescue.distanceM - m) <= 1, `Emergency's rescue point is ${e.rescue.distanceM} m away, from the position ${m.toFixed(0)} m`);
    must(e.rescue.where.startsWith(distanceText(m)), `Emergency says "${e.rescue.where}" for the rescue point, from the position ${distanceText(m)}`);
  }
  const towns = i.places.filter((q) => q.kind === 'settlement' && typeof q.name === 'string' && q.name.trim() !== '' && Math.abs(q.lat) <= 90 && Math.abs(q.lon) <= 180);
  const near = towns.map((q) => ({ q, m: metres(q) })).sort((a, b) => a.m - b.m)[0];
  if (near) must(e.items.some((x) => x.label.includes(near.q.name!) && x.label.includes(distanceText(near.m))), `Emergency does not say ${near.q.name} is ${distanceText(near.m)} from the position`);
  for (const q of i.places) {
    if (q.kind !== 'shelter' || typeof q.name !== 'string' || q.name.trim() === '' || !(Math.abs(q.lat) <= 90) || !(Math.abs(q.lon) <= 180)) continue;
    const access = q.tags['access'];
    const m = metres(q);
    if (access === 'private' || access === 'no' || m > 2990) continue;
    must(e.items.some((x) => x.label.startsWith(`${q.name} · ${distanceText(m)}`)), `Emergency does not say the shelter ${q.name} is ${distanceText(m)} from the position`);
  }
}

const INV19: Check = {
  id: 'INV-19',
  appliesTo: (i, s) => usable(i, s) && latestUsablePosition(world(i)) !== null,
  check(i, s, again) {
    const w = world(i);
    const p = latestUsablePosition(w)!;
    const { ride } = s;
    const length = i.trip.route.lengthKm;
    const startsThere = Math.abs(ride.startKm - Math.min(adjusted(p, length).aheadFromKm, ride.stopKm)) < 1e-9;
    if (ride.startOffRouteM > 0) {
      must(isOffRoute(p) && p.offRouteM === ride.startOffRouteM, `the ride's rejoin leg is ${ride.startOffRouteM} m, the position is ${p.offRouteM} m off`);
      must(startsThere || ride.startKm === ride.stopKm, `a rejoin leg on a ride that doesn't start at the position: from ${ride.startKm}, position ${p.km}`);
    }
    if (ride.note?.kind === 'day1-route-start') must(ride.startOffRouteM === 0, 'day 1 starts at the route start, with a rejoin leg');
    if (riding(i, s)) {
      const leg = rideLegKm(ride);
      const distance = showKm(ride.stopKm - ride.startKm + leg);
      if (ride.stopKm > ride.startKm || leg > 0) must(s.strip.endText.startsWith(`${distance} km`), `the strip says "${s.strip.endText}", the distance with the rejoin leg is ${distance} km`);
      const atStart = w.schedule.atKm(ride.startKm).getTime() - ride.departure.getTime();
      // The leg by hand: 1.3 x the distance off, at the loaded flat speed, with breaks.
      const legMs = ((1.3 * ride.startOffRouteM) / 1000 / (i.trip.flatKph * LOADED)) * w.schedule.r * WITH_BREAKS * HOUR;
      must(Math.abs(atStart - legMs) <= SECOND, `the rejoin leg takes ${(atStart / MIN).toFixed(1)} min on the schedule, by hand ${(legMs / MIN).toFixed(1)} min`);
      // And it costs water: the same ride with no leg uses less on the way to the same target.
      const target = targetsOf(w).find((t) => !t.tonight);
      if (leg > 0 && target && usableWaterFigures(i)) {
        const withLeg = use(w.water, 'now', target, 'plan');
        const noLeg = use({ ...w.water, ride: { ...ride, startOffRouteM: 0 } }, 'now', target, 'plan');
        must(withLeg > noLeg, `the water need to km ${target.km} ignores the rejoin leg: ${withLeg} L with it, ${noLeg} L without`);
      }
    }
    // Home, 40 km off, before the trip or on the morning of day 1: nothing changes.
    if (homeAway(s, p, i)) {
      const without = again({ ...i, positions: i.positions.filter((x) => x !== p && !isFarOff(x)) });
      if (i.positions.every((x) => isFarOff(x) || !Number.isFinite(x.km))) {
        must(JSON.stringify(without.strip) === JSON.stringify(s.strip), `a position at home changes the strip: ${s.strip.endText} against ${without.strip.endText}`);
        must(without.cards.daylight.title === s.cards.daylight.title, 'a position at home changes leave-by');
        must(without.cards.water.title === s.cards.water.title, `a position at home changes Water: ${s.cards.water.title} against ${without.cards.water.title}`);
      }
    }
    // The chips add the position's own leg.
    const chip = chipSchedule(i, s);
    const accKm = p.approximate ? p.accuracyM / 1000 : 0;
    const aheadFrom = Math.max(0, Math.min(length, p.km - accKm));
    const behindFrom = Math.max(0, Math.min(length, p.km + accKm));
    for (const name of ['bike', 'pharmacy', 'train', 'toilets'] as const) {
      for (const x of s.chips[name].items) {
        const at = x.stamp?.at;
        const km = x.stamp?.km;
        if (!at || km === undefined) continue;
        const expected = i.matches.filter((m) => m.km === km).flatMap((m) => [chip.atPlace(m), chip.behind(m)]);
        must(expected.some((t) => within1s(t, at)), `the ${name} chip's time at km ${km} is not riding there now from the position`);
        const where = km >= aheadFrom ? W.weatherStampAhead(showKm(km - aheadFrom)) : W.waterBack(showKm(behindFrom - km));
        must(x.detail?.startsWith(where) === true, `the ${name} chip says "${x.detail}", from the position it is ${where}`);
      }
    }
    if (startsThere && ride.note?.kind !== 'day1-route-start' && i.now.getTime() - p.at.getTime() <= 48 * HOUR && ride.startKm < ride.stopKm && ride.phase !== 'route-end' && !ride.noRide && adjusted(p, length).aheadFromKm < ride.stopKm) {
      must(Math.abs(ride.startKm - Math.max(0, p.km - accKm)) < 1e-9, `what is measured from the position starts at ${ride.startKm}, not ${p.km - accKm}`);
      must(Math.abs(ride.behindFromKm - Math.min(length, p.km + accKm)) < 1e-9, `places behind are measured from ${ride.behindFromKm}, not ${p.km + accKm}`);
    }
    // Accuracy worse than 500 m.
    if (p.approximate && !isFarOff(p) && ride.behindFromKm > ride.startKm) {
      const inside = (km: Km): boolean => insideRadius(ride, km);
      for (const t of targetsOf(w)) if (!t.tonight) must(!inside(t.km), `S1 or S2 at km ${t.km} lies inside the radius`);
      for (const pl of w.plans) for (const c of pl.covers) must(!inside(c.km), `a rain-plan cover at km ${c.km} lies inside the radius`);
      for (const x of ideasOf(w)) if (x.placeId !== null && x.km !== null) must(!inside(x.km), `a stop idea at km ${x.km} lies inside the radius`);
      for (const l of w.lb?.limits ?? []) {
        const m = l.place ? /km ([\d.]+)/.exec(l.place) : null;
        if (m) must(!(Number(m[1]) > ride.startKm + 0.05 && Number(m[1]) < ride.behindFromKm - 0.05), `a leave-by limit at km ${m[1]} lies inside the radius`);
      }
    }
    const e = s.chips.emergency;
    must(e.coords !== null && e.coords.includes(p.lat === 0 ? '0.00000' : Math.abs(p.lat).toFixed(5)), `Emergency's coordinates ${e.coords} are not the position's`);
    emergencyDistances(i, s, p);
  },
};

const ABOUT = /about (\d\d:\d\d)/;

const INV20: Check = {
  id: 'INV-20',
  appliesTo: usableRide,
  check(i, s) {
    const w = world(i);
    const { ride } = s;
    const stop = ride.stopKm;
    const tz = routeZoneAt(i, stop);
    const arrival = w.schedule.atKm(stop);
    const about = formatAbout(arrival, tz);
    if (ride.stopKm > ride.startKm) must(s.strip.endText.endsWith(about), `the strip says "${s.strip.endText}", the arrival is ${about}`);
    const planned = s.shareText !== null && ride.phase !== 'after-ride' ? /Planning to stop .* at (about \d\d:\d\d)\./.exec(s.shareText) : null;
    if (planned) must(planned[1] === about, `Share says ${planned[1]}, the strip ${about}`);
    if (ride.phase === 'riding') {
      must(s.cards.daylight.stamp?.at === undefined || within1s(s.cards.daylight.stamp.at, arrival), 'Daylight\'s arrival differs from the schedule\'s');
      must(s.cards.daylight.title.includes(about) || !ABOUT.test(s.cards.daylight.title), `Daylight says "${s.cards.daylight.title}", the arrival is ${about}`);
    }

    // A place has one arrival on every card of the ride. Past the stop the riding-on times differ, by the rule.
    const atKm = new Map<Km, RouteMatch[]>();
    for (const { match: m } of passesOf(i)) atKm.set(m.km, [...(atKm.get(m.km) ?? []), m]);
    const tonightKms = new Set(targetsOf(w).filter((t) => t.tonight).map((t) => t.km));
    const night = ride.phase === 'after-ride';
    const judge = (name: string, a: Answer, exempt: (km: Km) => boolean): void => {
      for (const x of a.items) {
        const km = x.stamp?.km;
        const at = x.stamp?.at;
        if (km === undefined || !at || km > stop || exempt(km)) continue;
        const list = atKm.get(km);
        if (!list) continue;
        must(list.some((m) => within1s(w.schedule.atPlace(m), at)), `${name} says ${at.toISOString()} for km ${km}; the schedule says ${list.map((m) => w.schedule.atPlace(m).toISOString()).join(' or ')}`);
        const zones = passesOf(i).filter((y) => y.match.km === km).map((y) => zoneOfPass(y, i));
        const said = `${x.label} ${x.detail ?? ''}`.replace(/until about \d\d:\d\d/g, ''); // waiting it out names its own time
        if (zones.length > 0 && ABOUT.test(said)) must(zones.some((z) => said.includes(formatAbout(at, z))), `${name} at km ${km}: its text does not say ${formatAbout(at, zones[0]!)}`);
      }
    };
    judge('Water', s.cards.water, (km) => tonightKms.has(km));
    judge('Food', s.cards.food, () => false);
    if (!night) judge('Sleep', s.cards.sleep, () => false);
    for (const p of w.plans) {
      for (const c of p.covers) {
        const m: RouteMatch = { placeId: c.placeId ?? '', km: c.km, offRouteM: c.offRouteM };
        must(within1s(w.schedule.atPlace(m), c.arrival), `a rain-plan cover at km ${c.km} has its own arrival`);
      }
      const first = p.covers[0];
      if (first && p.window.kind !== 'thunder' && p.firstCoverLine !== null) {
        const place = i.places.find((x) => x.id === first.placeId);
        const zone = place && /^[A-Z]/.test(place.timeZone) ? place.timeZone : routeZoneAt(i, first.km);
        const expected = formatAbout(w.schedule.atPlace({ placeId: first.placeId ?? '', km: first.km, offRouteM: first.offRouteM }), zone);
        must(p.firstCoverLine.includes(expected), `Weather says "${p.firstCoverLine}" of its first cover, the schedule ${expected}`);
      }
    }
    // The chips ride there now, each from the position, and so agree with each other and with Shelter.
    const chip = chipSchedule(i, s);
    const roofs = matchRoofs(i.roofs, i.trip.route);
    for (const x of s.chips.shelter.items) {
      const km = x.stamp?.km;
      const at = x.stamp?.at;
      if (km === undefined || !at) continue;
      const list: RouteMatch[] = [...(atKm.get(km) ?? []), ...roofs.filter((r) => r.km === km).map((r) => ({ placeId: '', km: r.km, offRouteM: r.offRouteM }))];
      must(list.some((m) => within1s(chip.atPlace(m), at)), `the Shelter chip says ${at.toISOString()} for km ${km}, not riding there now`);
    }
  },
};

const degreesIn = (text: string): number[] => [...text.matchAll(/(-?\d+)(?:–(-?\d+))? °C/g)].flatMap((m) => [Number(m[1]), ...(m[2] === undefined ? [] : [Number(m[2])])]);
const shown = (t: number): number => Math.round(t) + 0;

const INV21: Check = {
  id: 'INV-21',
  appliesTo: (i, s) => riding(i, s) && world(i).forecast !== null && gridOf(world(i).forecast!).length > 0,
  check(i, s) {
    const w = world(i);
    const forecast = w.forecast!;
    must(!/°C/.test(textOf(s.cards.water).replace(/[^\n]*\b(below|under|Below|Under)\b[^\n]*/g, '')) || !hasRawMismatch(s.cards.water, forecast), 'the Water card shows a temperature that is no raw forecast');
    const raw = new Set(gridOf(forecast).flatMap((g) => g.hours.map((h) => h.t)).filter(Number.isFinite).map(shown));
    const seasonal = new Set((i.baseline?.points ?? []).flatMap((p) => [p.p10LowC, p.meanLowC, p.meanHighC, p.p90HighC]).filter(Number.isFinite).map(shown));
    for (const c of s.cards.weather.items.flatMap((x) => degreesIn(`${x.label} ${x.detail ?? ''}`))) {
      must(raw.has(c) || seasonal.has(c), `Weather shows ${c} °C, no raw forecast says so`);
    }
    // The ride's range, worked out by hand.
    const temps = ridePoints(forecast, w.schedule).filter((p) => p.km <= s.ride.stopKm).flatMap((p) => {
      const h = hourAt(p.g.hours, p.t);
      return h && Number.isFinite(h.t) ? [h.t] : [];
    });
    const row = s.cards.weather.items.find((x) => x.stamp === null && /°C/.test(x.detail ?? ''));
    if (row && temps.length > 0) must(row.detail === W.weatherTemps(String(shown(Math.min(...temps))), String(shown(Math.max(...temps)))), `the ride's temperatures read "${row.detail}", the raw forecast ${Math.min(...temps)} to ${Math.max(...temps)}`);
  },
};
function hasRawMismatch(a: Answer, forecast: NonNullable<ScreenParts['forecast']>): boolean {
  const raw = new Set(gridOf(forecast).flatMap((g) => g.hours.map((h) => h.t)).filter(Number.isFinite).map(shown));
  return degreesIn(textOf(a)).some((c) => !raw.has(c));
}

const ISO_DAY = /^\d{4}(-\d{2}(-\d{2}(T.*)?)?)?/;

const INV22: Check = {
  id: 'INV-22',
  appliesTo: () => true,
  check(i, s) {
    for (const a of answersOf(s)) {
      must(a.basis.some((b) => b.trim() !== ''), `no basis on ${a.topic}: ${a.title}`);
      const places = a.freshness.dataDates['places'];
      if (places !== undefined) must(ISO_DAY.test(places), `a data date that is no date on ${a.topic}: ${places}`);
    }
    const weatherHeld = world(i).forecast !== null && gridOf(world(i).forecast!).length > 0;
    if (weatherHeld && usable(i, s) && i.trip.departureDate !== null) {
      const basis = s.cards.weather.basis.join(' ');
      must(basis.includes(W.weatherAttribution), `Weather without the Open-Meteo attribution: ${basis}`);
      must(s.cards.weather.freshness.dataDates['weather'] === world(i).forecast!.fetchedAt.toISOString(), 'Weather without its forecast\'s age');
      must(s.chips.shelter.basis.includes(W.weatherAttribution), `Shelter reads the forecast without the Open-Meteo attribution: ${s.chips.shelter.basis.join(' ')}`);
      must(s.cards.food.basis.includes(W.weatherAttribution), `Food reads the forecast without the Open-Meteo attribution: ${s.cards.food.basis.join(' ')}`);
    }
    for (const a of [s.cards.water, s.cards.food, s.cards.sleep, s.chips.bike, s.chips.pharmacy, s.chips.train, s.chips.toilets, s.chips.shelter]) {
      if (a.items.some((x) => x.stamp?.km !== undefined) && i.places.length > 0) {
        must(a.basis.includes(W.waterBasisOsm), `${a.topic} lists places without the OpenStreetMap attribution: ${a.basis.join(' ')}`);
        if (i.places.some((p) => /^\d{4}-\d{2}-\d{2}/.test(p.dataDate))) must(a.freshness.dataDates['places'] !== undefined, `${a.topic} lists places without their data's date`);
      }
    }
    if (!weatherHeld || !usable(i, s)) return;
    const fetched = world(i).forecast!.fetchedAt;
    const beyond = (t: Date): boolean => t.getTime() - fetched.getTime() > 48 * HOUR;
    for (const w of onRideWindows(world(i), s)) {
      if (w.detail === '30min') {
        must(!beyond(w.reachAt) && !beyond(w.hoursTo), `a half-hour rain time beyond 48 hours at km ${w.fromKm}`);
        continue;
      }
      for (const x of s.cards.weather.items) if (x.stamp?.km === w.fromKm && (x.label.includes(' likely') || x.label.includes(' possible') || x.label.includes('hunderstorm'))) {
        must(!/\d\d:\d\d/.test(x.label) && x.stamp.at === undefined, `a rain time to the half hour beyond 48 hours: ${x.label}`);
      }
    }
    if (/^Rain likely here until/.test(s.cards.weather.title)) must(!beyond(i.now), `rain's end told to the half hour beyond 48 hours: ${s.cards.weather.title}`);
  },
};

const INV23: Check = {
  id: 'INV-23',
  appliesTo: (i) => i.trip.route.points.some((p) => !Number.isFinite(p.ele)),
  check(i, s) {
    must(s.cards.climbing.status === 'unknown', `heights are missing, Climbing reads ${s.cards.climbing.status}`);
    for (const t of textsOf(s.cards.climbing)) must(!/(^|\D)0 m\b/.test(t), `heights are missing, Climbing reads 0 m: ${t}`);
    if (usableRide(i, s) && s.cards.daylight.title !== W.daylightCantWorkOut) must(s.cards.daylight.status !== 'fine', `heights are missing, leave-by reads fine: ${s.cards.daylight.title}`);
  },
};

const NO_RELATIVE = /\bago\b|\bminutes?\b|\bmin\b|\bhours?\b|\byesterday\b|\btoday\b|\bjust now\b/i;
const NOT_IN_PROGRESS = /water|litre|\d\s?L\b|sweat|thirst|health|heart|weight|\bkg\b|hydrat|calorie|wayfinch|load[\s-]*check/i;
const COORDINATES = /-?\d{1,3}\.\d{3,}/;

const INV24: Check = {
  id: 'INV-24',
  appliesTo: (_i, s) => s.chips.emergency.share !== null || s.shareText !== null,
  check(i, s) {
    const e = s.chips.emergency;
    if (e.share !== null) {
      const hasRescue = /rescue/i.test(e.share);
      must(hasRescue === (e.rescue !== null), `Share my location says rescue: ${hasRescue}, the card shows a rescue line: ${e.rescue !== null}`);
      if (e.rescue) must(e.share.includes(e.rescue.shareLine), 'Share my location carries another rescue line than the card');
      must(!NO_RELATIVE.test(e.share.replace(COORDINATES, '')), `Share my location holds a relative time: ${e.share}`);
      must(e.updatePosition === e.share.includes(W.shareLastFix), `an old position and the sender's words disagree: ${e.share}`);
      const p = latestUsablePosition(world(i));
      if (p) must((p.source === 'manual') === e.share.includes(W.shareManual), `a manual position and the sender's words disagree: ${e.share}`);
      if (p) must((p.source !== 'manual' && (p.approximate || p.accuracyM > 500)) === e.share.includes(W.shareApproximate), `an approximate position and the sender's words disagree: ${e.share}`);
    }
    const names = i.places.filter((p) => p.kind === 'settlement').flatMap((p) => (p.name ? [p.name] : []));
    const masked = (t: string): string => names.reduce((x, n) => x.split(n).join('Town'), t);
    if (s.shareText !== null) {
      const text = masked(s.shareText);
      must(!NOT_IN_PROGRESS.test(text), `Share progress holds what it must not: ${text}`);
      must(!COORDINATES.test(text), `Share progress holds coordinates: ${text}`);
    }
    if (s.shareMapText !== null) {
      const lines = masked(s.shareMapText).split('\n');
      for (const line of lines) if (!line.startsWith('Map: ')) must(!COORDINATES.test(line), `Share progress holds coordinates outside the map link: ${line}`);
    }
  },
};

const CALL_KINDS: ReadonlySet<Place['kind']> = new Set(['campsite', 'lodging', 'hut', 'bike_shop']);

const INV25: Check = {
  id: 'INV-25',
  appliesTo: (i, s) => answersOf(s).some((a) => a.items.some((x) => x.contact || /(^| · )Call /.test(x.detail ?? ''))) || i.places.some((p) => (p.contact?.phones.length ?? 0) > 0 && !CALL_KINDS.has(p.kind)),
  check(i, s) {
    const passes = passesOf(i);
    for (const a of answersOf(s)) {
      for (const x of a.items) {
        const calls = [...(x.detail ?? '').matchAll(/(?:^| · )Call ([^·]+?)(?= · |$)/g)].map((m) => m[1]!);
        if (!x.contact && calls.length === 0) continue;
        const km = x.stamp?.km;
        const named = passes.filter((p) => p.match.km === km);
        must(named.some((p) => CALL_KINDS.has(p.place.kind)), `a call button on a place that may have none: ${x.label}`);
        for (const number of calls) {
          const country = named.find((p) => CALL_KINDS.has(p.place.kind))?.place.country ?? 'DE';
          let tel: string | null = null;
          try {
            tel = telLink(number, country as CountryCode);
          } catch {
            tel = null;
          }
          must(tel !== null, `a call button on a number that can't be called: ${number}`);
        }
      }
    }
  },
};

// ---- INV-26, INV-29: the same screen ----------------------------------------------------------------------------------

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let n = 0; n < text.length; n++) h = Math.imul(h ^ text.charCodeAt(n), 0x01000193) >>> 0;
  return h;
}

/** How often the two allowances below were reached in a run: a check that never meets them proves nothing about them. */
export const INV26_REACH = { skippedHour: 0, nightAfter: 0 }; // moments
export const INV26_GATE = 10;

/** A rule that is only weekdays and times. Anything else looks at the calendar, and a week later can't stand in for it. */
const ONLY_WEEKDAYS_AND_TIMES = /^(?:\b(?:Mo|Tu|We|Th|Fr|Sa|Su|off|closed|open)\b|\d{1,2}:\d{2}\+?|24\/7|[-,;\s]|\|\|)*$/;
const runsOverMidnightByHand = (tag: string): boolean => /\d\+/.test(tag) || [...tag.matchAll(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/g)].some(([, a, b, c, d]) => {
  const end = Number(c) * 60 + Number(d);
  return end > 24 * 60 || end <= Number(a) * 60 + Number(b);
});

/** The phones with a spring clock change, and its date in 2026. */
const SPRING_CHANGE: { zone: string; date: string }[] = [
  { zone: 'Europe/Berlin', date: '2026-03-29' }, { zone: 'Europe/Lisbon', date: '2026-03-29' }, { zone: 'Europe/Helsinki', date: '2026-03-29' }, { zone: 'America/New_York', date: '2026-03-08' },
];

const STEP_15 = 15 * MIN;
const PREPARED_PER_SCENARIO = 3;

/**
 * Owner's ruling, 2 Nov 2026: these two allowances are approved as they stand. The screen comparison has none.
 * The same tag prepared on two phones reads the same at every step, with exactly two allowances, each of which must read
 * exactly unknown and nothing else (the plan's Decision 8 and the ruling in the PR):
 * - a wall-clock minute the phone skips;
 * - the first hour of the day after it skips, for a tag with a time over midnight that looks at the calendar.
 */
function sameHoursOnBothPhones(p: Place, tag: string, zone: string, from: Date, to: Date, holidays: ScreenInputs['holidays']): void {
  const spansOf = () => placeSpans(tag, p, ruleOf(p), from, to, holidays);
  const reference = withDeviceZone('UTC', spansOf);
  const hoursWith = (spans: PlaceHours['spans']): PlaceHours => ({ placeId: p.id, windowStart: from, windowEnd: to, spans });
  const asked = !ONLY_WEEKDAYS_AND_TIMES.test(tag) && runsOverMidnightByHand(tag);
  let sawSkipped = false;
  let sawNight = false;
  withDeviceZone(zone, () => {
    const there = spansOf();
    for (let t = from.getTime(); t < to.getTime(); t += STEP_15) {
      const when = new Date(t);
      const a = stateAt(hoursWith(reference), when).state;
      const b = stateAt(hoursWith(there), when).state;
      const c = wallClock(when, p.timeZone);
      const device = new Date(c.year, c.month - 1, c.day, c.hour, c.minute);
      const skipped = device.getHours() !== c.hour || device.getMinutes() !== c.minute;
      const dayMs = new Date(c.year, c.month - 1, c.day).getTime() - new Date(c.year, c.month - 1, c.day - 1).getTime();
      const nightAfter = asked && dayMs < 24 * HOUR && c.hour * 60 + c.minute < (24 * HOUR - dayMs) / MIN;
      // A tag the library refuses reads alike everywhere, under the rules of its place: nothing to allow.
      if (a === b && !nightAfter) continue;
      if (skipped || nightAfter) {
        must(b === 'unknown', `${p.id} (${tag}) reads ${b} on a phone set to ${zone} at ${when.toISOString()}, where only unknown is allowed`);
        if (skipped) sawSkipped = true;
        else sawNight = true;
        continue;
      }
      must(a === b, `${p.id} (${tag}) reads ${a} on one phone and ${b} on one set to ${zone}, at ${when.toISOString()}`);
    }
  });
  if (sawSkipped) INV26_REACH.skippedHour++;
  if (sawNight) INV26_REACH.nightAfter++;
}

const INV26: Check = {
  id: 'INV-26',
  every: 5,
  appliesTo: () => true,
  check(i, s, again) {
    const first = JSON.stringify(s);
    const n = hash(`${i.trip.route.id}|${String(i.now.getTime())}`);
    const zone = DEVICE_ZONES[n % DEVICE_ZONES.length]!.zone;
    const other = withDeviceZone(zone, () => JSON.stringify(again(i)));
    if (other !== first) {
      let at = 0;
      while (at < first.length && first[at] === other[at]) at++;
      throw new Error(`the screen differs on a phone set to ${zone}: "${first.slice(Math.max(0, at - 60), at + 60)}" against "${other.slice(Math.max(0, at - 60), at + 60)}"`);
    }
    if (!validDate(i.now)) return;
    // Hours are prepared on the phone. Whole days on the place's clock, around now and around a phone's spring change.
    const known = i.places.filter((p) => typeof p.openingHours === 'string' && /^[A-Z]/.test(p.timeZone) && isKnownZone(p.timeZone));
    const chosen = [...known.filter((p) => runsOverMidnightByHand(p.openingHours!) && !ONLY_WEEKDAYS_AND_TIMES.test(p.openingHours!)).slice(0, 1), ...known.slice(0, PREPARED_PER_SCENARIO - 1)];
    const spring = SPRING_CHANGE[n % SPRING_CHANGE.length]!;
    for (const p of chosen) {
      const today = localIsoDate(i.now, p.timeZone);
      const day = (date: string, by: number): Date => instantAt(addDaysIso(date, by), '00:00', p.timeZone);
      sameHoursOnBothPhones(p, p.openingHours!, zone, day(today, -1), day(today, 2), i.holidays);
      sameHoursOnBothPhones(p, p.openingHours!, spring.zone, day(spring.date, -1), day(spring.date, 3), i.holidays);
    }
  },
};

/** A fixed shuffle that really moves things: reversed, then turned by a third. */
function shuffled<T>(list: T[]): T[] {
  const r = [...list].reverse();
  const turn = Math.floor(r.length / 3);
  return [...r.slice(turn), ...r.slice(0, turn)];
}

const INV29: Check = {
  id: 'INV-29',
  every: 5,
  appliesTo: (i) => i.places.length + i.roofs.length + i.rescuePoints.length > 1,
  check(i, s, again) {
    const first = JSON.stringify(s);
    const other = JSON.stringify(again({ ...i, places: shuffled(i.places), roofs: shuffled(i.roofs), matches: shuffled(i.matches), rescuePoints: shuffled(i.rescuePoints) }));
    if (other !== first) {
      let at = 0;
      while (at < first.length && first[at] === other[at]) at++;
      throw new Error(`shuffling the lists changes the screen: "${first.slice(Math.max(0, at - 80), at + 60)}" against "${other.slice(Math.max(0, at - 80), at + 60)}"`);
    }
  },
};

// ---- INV-30, INV-31: all the words ------------------------------------------------------------------------------------

const BROKEN = /NaN|undefined|\bnull\b|Infinity|\[object/;
const NEGATIVE = /(?:^|[\s(+·,])[-−]\d/;
const FIGURES_BELOW_ZERO_MAY = /-?\d+(?:–-?\d+)? °C|-?\d{1,3}\.\d{5}, -?\d{1,3}\.\d{5}|geo:\S+/g; // only temperatures and coordinates

/** Names and tag values come from strangers: they may say anything, and are masked before the text is judged. */
function maskerOf(i: ScreenInputs): (t: string) => string {
  const strangers = new Set<string>();
  const add = (x: unknown): void => {
    if (typeof x === 'string' && x.trim() !== '') strangers.add(x);
  };
  for (const p of i.places) {
    add(p.name);
    add(p.openingHours);
    add(p.seasonal);
    add(p.contact?.website);
    const site = typeof p.contact?.website === 'string' ? websiteLink(p.contact.website) : null;
    if (site !== null) add(URL.canParse(site) ? new URL(site).hostname : site);
    for (const v of Object.values(p.tags ?? {})) add(v);
    for (const v of p.contact?.phones ?? []) add(v);
  }
  for (const r of i.rescuePoints) add(r.ref);
  const list = [...strangers].sort((a, b) => b.length - a.length);
  // Whole words only: a place named "l" must not hide the words around it.
  const word = (n: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
  const res = list.map(word);
  return (t) => res.reduce((x, re) => x.replace(re, '∎'), t);
}

const INV30: Check = {
  id: 'INV-30',
  appliesTo: () => true,
  check(i, s) {
    const mask = maskerOf(i);
    for (const { where, text } of allTexts(s)) {
      const t = mask(text.replace(FIGURES_BELOW_ZERO_MAY, ''));
      must(!BROKEN.test(t), `${where} reads: ${text}`);
      must(!NEGATIVE.test(t), `a negative figure in ${where}: ${text}`);
    }
    for (const a of answersOf(s)) {
      for (const km of [a.stamp?.km, ...a.items.map((x) => x.stamp?.km)]) if (km !== undefined) must(Number.isFinite(km) && km >= 0, `a stamp at km ${km} on ${a.topic}`);
    }
    const w = world(i);
    if (!usable(i, s) || i.trip.departureDate === null) return;
    const inOrder = (kms: Km[], what: string): void => {
      for (let n = 1; n < kms.length; n++) must(kms[n]! >= kms[n - 1]!, `${what} out of route order: ${kms.join(', ')}`);
    };
    inOrder(s.strip.icons.map((x) => x.km), 'strip icons');
    inOrder(s.strip.bands.map((x) => x.fromKm), 'strip bands');
    inOrder((w.ideas?.timeline ?? []).flatMap((x) => (x.km === null ? [] : [x.km])), 'the Food timeline');
    inOrder(s.cards.sleep.items.flatMap((x) => (x.stamp?.km === undefined ? [] : [x.stamp.km])), 'Sleep');
    if (s.ride.noRide || s.ride.phase === 'route-end') return;
    // The arrival at a route kilometre never decreases with the kilometre, on the day's ride and the later days.
    const length = i.trip.route.lengthKm;
    const kms = [...new Set([s.ride.startKm, s.ride.stopKm, length, ...i.trip.route.stages.map((x) => x.endKm), ...Array.from({ length: 40 }, (_, n) => s.ride.startKm + ((length - s.ride.startKm) * n) / 40)])].filter((k) => k >= s.ride.startKm && k <= length).sort((a, b) => a - b);
    let previous = -Infinity;
    for (const km of kms) {
      const t = w.schedule.atKm(km).getTime();
      must(t >= previous, `the arrival at km ${km} is before the arrival at an earlier kilometre`);
      previous = t;
    }
  },
};

const STRICT: ReadonlySet<string> = new Set(['weather', 'food', 'shelter']);

const INV31: Check = {
  id: 'INV-31',
  appliesTo: () => true,
  check(i, s) {
    const mask = maskerOf(i);
    for (const { where, text } of allTexts(s)) {
      const hits = bannedHits(mask(text), STRICT.has(where));
      must(hits.length === 0, `${where} uses "${hits[0]}": ${text}`);
    }
  },
};

// ---- INV-32 to INV-34: the trip day -----------------------------------------------------------------------------------

const INV32: Check = {
  id: 'INV-32',
  appliesTo: (i, s) => usable(i, s) && i.trip.departureDate !== null,
  check(i, s) {
    const { ride } = s;
    const length = i.trip.route.lengthKm;
    if (ride.phase === 'before-trip') must(ride.tonightKm === null, `before the trip tonight's stop is ${ride.tonightKm}`);
    if (ride.phase === 'route-end' || ride.noRide) must(ride.tomorrowKm === null, `at the route end tomorrow's stop is ${ride.tomorrowKm}`);
    if (ride.tonightKm !== null && ride.tonightKm >= length) must(ride.tomorrowKm === null, `tonight's stop is the route end, tomorrow's is ${ride.tomorrowKm}`);
    if (ride.tomorrowKm !== null && ride.tonightKm !== null) must(ride.tomorrowKm > ride.tonightKm, `tomorrow's stop ${ride.tomorrowKm} is not beyond tonight's ${ride.tonightKm}`);
  },
};

const INV33: Check = {
  id: 'INV-33',
  appliesTo: (i, s) => usable(i, s) && i.trip.departureDate !== null && !s.ride.noRide && (s.ride.phase === 'after-ride' || s.ride.phase === 'before-trip'),
  check(i, s) {
    const w = world(i);
    const { ride } = s;
    const today = startZoneDate(i);
    must(ride.date > today, `${ride.phase}: the cards plan the ride of ${ride.date}, today is ${today}`);
    must(w.wg === null && waitTexts(s).length === 0, `${ride.phase}: wait or go is shown`);
    must(s.strip.label !== W.routeStripToday, `${ride.phase}: the strip says Today`);
    const dep = ride.departure.getTime();
    must(dep > i.now.getTime(), `${ride.phase}: the ride departs at or before now`);
    const tonightKms = new Set(targetsOf(w).filter((t) => t.tonight).map((t) => t.km));
    const judge = (name: string, a: Answer, exempt: (km: Km | undefined) => boolean): void => {
      for (const x of a.items) {
        const at = x.stamp?.at;
        if (at && !exempt(x.stamp?.km)) must(at.getTime() >= dep - SECOND, `${name} plans ${x.label} at ${at.toISOString()}, before the ride departs`);
      }
    };
    judge('Water', s.cards.water, (km) => km !== undefined && tonightKms.has(km));
    judge('Food', s.cards.food, () => false);
    judge('Weather', s.cards.weather, () => false);
    judge('Climbing', s.cards.climbing, () => false);
    if (ride.phase === 'before-trip') judge('Sleep', s.cards.sleep, () => false);
  },
};

const INV34: Check = {
  id: 'INV-34',
  appliesTo: (i, s) => usable(i, s) && i.trip.departureDate !== null && (startZoneDate(i) < i.trip.departureDate || i.positions.some((p) => Number.isFinite(p.offRouteM) && isFarOff(p))),
  check(i, s, again) {
    const dep = i.trip.departureDate!;
    const today = startZoneDate(i);
    if (today < dep) must(s.ride.phase === 'before-trip', `${today} is before the departure ${dep}, and the phase is ${s.ride.phase}`);
    const near = i.positions.filter((p) => !(Number.isFinite(p.offRouteM) && isFarOff(p)));
    if (near.length !== i.positions.length) {
      const phase = again({ ...i, positions: near }).phase;
      must(phase === s.phase, `positions over 5 km off change the phase: ${s.phase} with them, ${phase} without`);
    }
  },
};

export const CHECKS: Check[] = [
  INV01, INV02, INV03, INV04, INV05, INV06, INV07, INV08, INV09, INV10, INV11, INV12, INV13, INV14, INV15, INV16, INV17,
  INV18, INV19, INV20, INV21, INV22, INV23, INV24, INV25, INV26, INV29, INV30, INV31, INV32, INV33, INV34,
];


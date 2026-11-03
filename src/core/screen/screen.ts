// screen(inputs) builds the whole stop screen (spec section 11.1): what Ahead shows, from one plain object. It builds the
// ride and the schedule once, passes them on and assembles. Every rule of a card lives in its engine.
//
// It never throws: each part is built on its own, and a part that fails answers "can't be worked out" while the rest
// stands. Emergency depends on nothing else, so its numbers and fallback line show in every state. `buildScreen` also
// says which parts failed, so the simulator can tell a guarded failure from a good answer.
import { compareFinal, formatAbout, formatHm, makeAnswer } from '../answers/index.ts';
import { formatNearestHm } from '../answers/time.ts';
import { climbingAnswer } from '../engines/climbing.ts';
import type { StopFacts } from '../engines/covers.ts';
import { daylightAnswer } from '../engines/daylight-card.ts';
import { emergencyCard, type EmergencyCard } from '../engines/emergency.ts';
import { foodAnswer } from '../engines/food.ts';
import { helpChip, type HelpKind } from '../engines/help.ts';
import { leaveBy, routeZoneAt, type LeaveBy, type LeaveFacts } from '../engines/leaveby.ts';
import { isFarOff, isOffRoute, rejoinKm } from '../engines/locate.ts';
import type { Schedule } from '../engines/pace.ts';
import { rainPlans } from '../engines/rain-plans.ts';
import { progressText, townNear } from '../engines/share.ts';
import { latestUsable, shelterChip, thunderNear } from '../engines/shelter.ts';
import { sleepAnswer } from '../engines/sleep.ts';
import { stopIdeas, type Ideas } from '../engines/stop-ideas.ts';
import { chipStart, dayRide, noteFor, scheduleFor, zoneLookupOf, type DayEnv } from '../engines/tripday.ts';
import { waitOrGo } from '../engines/wait-or-go.ts';
import { findS1S2, waterAnswer, type WaterFacts } from '../engines/water.ts';
import { onTheRide, routeForecast } from '../engines/weather-windows.ts';
import { weatherAnswer, weatherWindows, type WaitOrGo, type WeatherFacts } from '../engines/weather.ts';
import { haversineKm } from '../geo/haversine.ts';
import { GRID_KM_ROUNDING } from '../route/grid.ts';
import type { Answer, Cover, DayPhase, DayRide, Km, Place, Position, RainPlan, RainWindow, ScreenInputs, StoredForecast, Topic } from '../types.ts';
import { shortIsoDay, showKm, W } from '../wording/en.ts';

export type StripIcon = { kind: 'water' | 'food' | 'sleep' | 'cover'; km: Km; opens: Topic };
export type StripBand = { fromKm: Km; toKm: Km; kind: 'likely' | 'possible' | 'thunder'; opens: 'weather' };
export type Strip = { label: string; startKm: Km; endKm: Km; endText: string; icons: StripIcon[]; bands: StripBand[] };
export type CardName = 'water' | 'food' | 'daylight' | 'weather' | 'climbing' | 'sleep';
export type ChipName = 'bike' | 'pharmacy' | 'train' | 'toilets' | 'shelter';
/**
 * `shareMapText` is the same message with the map link the rider can add (section 6.14), and `stamps` each card's and chip's
 * stamp as the rider reads it ("+6 km · 14:40", "here · 14:20"), so the UI computes nothing.
 */
export type Screen = {
  positionLine: string | null; strip: Strip; cards: Record<CardName, Answer>; chips: Record<ChipName, Answer> & { emergency: EmergencyCard };
  shareText: string | null; shareMapText: string | null; phase: DayPhase; ride: DayRide; notes: string[];
  stamps: Record<CardName | ChipName | 'emergency', string | null>;
};

const MIN = 60_000;
const HOUR_MIN = 60;
const DAY_MIN = 24 * HOUR_MIN;
const COVER_BEFORE_KM = 5; // a cover icon up to 5 km before a band (section 3.2)
const KIND_ORDER: StripIcon['kind'][] = ['water', 'food', 'sleep', 'cover'];
const ICONS_PER_KIND = 2;
const FOOD_ICONS = 3;
const SETTLEMENT_COUNTRY_KM = 10; // far off the route: a nearer settlement says which country this is
const LIST_FIELDS = ['matches', 'places', 'roofs', 'hours', 'rescuePoints', 'savedKm', 'positions', 'dayStarts', 'routeZones'] as const;

const validDate = (d: unknown): d is Date => d instanceof Date && Number.isFinite(d.getTime());
const isObject = (x: unknown): boolean => typeof x === 'object' && x !== null;

/** A list that is no list is an empty one, and an item that is no object is no item. Nothing else is judged here. */
function cleaned(raw: ScreenInputs): ScreenInputs {
  const out = { ...raw } as ScreenInputs & Record<string, unknown>;
  for (const key of LIST_FIELDS) {
    const list: unknown = raw?.[key];
    out[key] = (Array.isArray(list) ? list.filter(isObject) : []) as never;
  }
  return out;
}

/** The stand-in ride when even the trip day can't be worked out: the numbers stay readable and every card says so. */
function fallbackRide(i: ScreenInputs): DayRide {
  const length = i.trip?.route?.lengthKm;
  const stopKm = Number.isFinite(length) ? length : 0;
  return {
    phase: 'before-trip', date: '', startKm: 0, startOffRouteM: 0, departure: validDate(i.now) ? i.now : new Date(NaN), stopKm, tonightKm: null, tomorrowKm: null,
    dayStartKm: 0, nightKm: null, r: 1, behindFromKm: 0, noRide: false, routeEndReachedOn: null, note: null, keepDayStart: null,
  };
}

const fallbackAnswer = (topic: Topic, title: string): Answer => makeAnswer({
  topic, status: 'unknown', title, stamp: null, detail: '', items: [], basis: [W.routeFallbackBasis], freshness: { dataDates: {}, stale: false },
});

// ---- the position line and the notes -------------------------------------------------------------------------------

function accuracyText(p: Position): string {
  if (p.source === 'manual') return W.routePositionManual;
  if (!Number.isFinite(p.accuracyM) || p.accuracyM < 0) return W.routeAccuracyUnknown;
  const shown = p.accuracyM < 1000 ? W.routeAccuracyM(String(Math.round(p.accuracyM))) : W.routeAccuracyKm(showKm(p.accuracyM / 1000));
  return p.approximate ? W.routeAccuracyApproximate(shown) : shown;
}

function ageText(p: Position, now: Date, tz: string): string {
  const time = formatHm(p.at, tz);
  // A clock behind the position: no negative age, the position counts as now (section 6.2a's review focus).
  const minutes = validDate(now) ? Math.floor((now.getTime() - p.at.getTime()) / MIN) : 0;
  if (minutes < 1) return time;
  if (minutes < HOUR_MIN) return W.routeAsOf(time, W.routeAgeMin(String(minutes)));
  if (minutes < 2 * DAY_MIN) return W.routeAsOf(time, W.routeAgeHours(String(Math.floor(minutes / HOUR_MIN))));
  return W.routeAsOf(time, W.routeAgeDays(String(Math.floor(minutes / DAY_MIN))));
}

function positionLineOf(i: ScreenInputs, p: Position | null): string | null {
  if (!p || !validDate(p.at) || !Number.isFinite(p.km)) return null;
  const { route } = i.trip;
  const km = Math.max(0, Math.min(route.lengthKm, p.km));
  const town = townNear(i.places, i.matches, km);
  return [
    W.routePositionKm(showKm(km), showKm(route.lengthKm)),
    ...(town === null ? [] : [W.routePositionNear(town)]),
    accuracyText(p),
    ...(isOffRoute(p) ? [W.routePositionOff(showKm(p.offRouteM / 1000))] : []),
    ageText(p, i.now, routeZoneAt(i, km)),
  ].join(' · ');
}

function notesOf(i: ScreenInputs, ride: DayRide, p: Position | null): string[] {
  const note = noteFor(ride);
  // "Day 1 starts at the route start" replaces the off-route banner and the rejoin note (section 6.2a).
  const dayOneElsewhere = ride.note?.kind === 'day1-route-start';
  const out: string[] = note ? [note] : [];
  if (!dayOneElsewhere && ride.startOffRouteM > 0) out.push(W.routeRejoinNote(showKm(rejoinKm(ride.startOffRouteM))));
  if (!dayOneElsewhere && p && isFarOff(p)) out.push(W.routeFarOffNote);
  // With no position the cards plan from the route start: said in words, so no distance passes for one from the rider.
  if (p === null && ride.note === null && ride.startKm === 0 && ride.phase !== 'route-end' && !ride.noRide) out.push(W.routeNoPositionFromStart);
  if (i.trip.departureDate === null) out.push(W.routeNoDateNote);
  return out;
}

// ---- the strip -----------------------------------------------------------------------------------------------------

function labelOf(ride: DayRide): string {
  if (ride.phase === 'route-end' || ride.noRide) return W.routeStripEnd;
  if (ride.phase === 'before-trip') return W.routeStripDayOne;
  if (ride.phase === 'after-ride') return W.routeStripTomorrow(shortIsoDay(ride.date) ?? '');
  return W.routeStripToday;
}

function endTextOf(i: ScreenInputs, ride: DayRide, schedule: Schedule): string {
  const distance = ride.stopKm - ride.startKm + rejoinKm(ride.startOffRouteM);
  if (ride.noRide || ride.phase === 'route-end' || !(distance > 0)) return W.routeStripAtEnd;
  const km = W.routeStripKm(showKm(distance));
  if (i.trip.departureDate === null) return km;
  const arrival = schedule.atKm(ride.stopKm);
  return validDate(arrival) ? W.routeStripEndText(km, formatAbout(arrival, routeZoneAt(i, ride.stopKm))) : km;
}

const bandOf = (w: RainWindow): StripBand => ({ fromKm: w.fromKm, toKm: w.toKm, kind: w.kind === 'thunder' ? 'thunder' : w.cls, opens: 'weather' });

/** Whether a kilometre lies in a thunderstorm band or up to 5 km before it, where only open buildings are drawn. */
const inStormReach = (km: Km, windows: RainWindow[]): boolean =>
  windows.some((w) => w.kind === 'thunder' && km >= w.fromKm - COVER_BEFORE_KM && km <= w.toKm);

/**
 * Cover icons: each plan's first cover, which the Weather card lists, or with rain at the start the first of the list that
 * stands in its place. Owner's ruling, 2 Nov 2026: the storm rule wins over "first cover is always drawn". In a thunderstorm
 * band and up to 5 km before it only open buildings are drawn, so a plain roof is not, though the card still names it.
 */
function coverIcons(plans: RainPlan[], windows: RainWindow[]): Km[] {
  return plans.flatMap((p) => {
    const cover: Cover | undefined = p.covers[0] ?? p.listInstead?.[0];
    return cover && (cover.coverClass <= 2 || !inStormReach(cover.km, windows)) ? [cover.km] : [];
  });
}

/** The kilometres a card names, so an icon is drawn only where tapping it finds the place. */
const namedKms = (a: Answer): Km[] => [a.stamp?.km, ...a.items.map((x) => x.stamp?.km)].filter((km): km is Km => typeof km === 'number');

function stripOf(i: ScreenInputs, ride: DayRide, schedule: Schedule, windows: RainWindow[], plans: RainPlan[], water: { s1: Km | null; s2: Km | null }, ideas: Ideas | null, cards: Record<CardName, Answer>): Strip {
  const onStrip = (km: Km): boolean => km >= ride.startKm - GRID_KM_ROUNDING && km <= ride.stopKm + GRID_KM_ROUNDING;
  const icons: StripIcon[] = [];
  const add = (kind: StripIcon['kind'], km: Km, opens: Topic): void => {
    if (onStrip(km) && !icons.some((x) => x.kind === kind && x.km === km)) icons.push({ kind, km, opens });
  };
  const waterNamed = namedKms(cards.water);
  for (const km of [water.s1, water.s2]) if (km !== null && waterNamed.includes(km)) add('water', km, 'water');
  const foodNamed = namedKms(cards.food);
  const ideaKms = ideas ? [ideas.title?.km ?? null, ...ideas.timeline.map((x) => x.km)] : [];
  for (const km of [...ideaKms, ...foodNamed].flatMap((k) => (k === null ? [] : [k])).filter(onStrip).slice(0, FOOD_ICONS)) add('food', km, 'food');
  for (const km of cards.sleep.items.flatMap((x) => (typeof x.stamp?.km === 'number' ? [x.stamp.km] : [])).filter(onStrip).sort((a, b) => a - b).slice(0, ICONS_PER_KIND)) add('sleep', km, 'sleep');
  for (const km of coverIcons(plans, onTheRide(windows, ride))) add('cover', km, 'weather');
  icons.sort((a, b) => a.km - b.km || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return {
    label: labelOf(ride), startKm: ride.startKm, endKm: ride.stopKm, endText: endTextOf(i, ride, schedule), icons,
    bands: onTheRide(windows, ride).map(bandOf).sort((a, b) => a.fromKm - b.fromKm),
  };
}

// ---- stamps --------------------------------------------------------------------------------------------------------

/** Under this, a stamp's kilometre is the rider's own: "+0.0 km" would say nothing. */
const HERE_KM = 0.05;

/** Where answers measure from, as the engines do (section 6.1): ahead from the near edge, behind from the far edge. */
type From = { aheadKm: Km; behindKm: Km };

/**
 * A stamp as the rider reads it (section 3.2), in the very terms its item uses: "+6 km · 14:40" ahead, measured from the near
 * edge of an approximate position; "9 km back · 14:50" behind, from its far edge; "near you, may be behind" inside the radius,
 * with no time, as the item has none; "here" at the rider's own kilometre; "here · 14:20" for a time alone. A time is shown to
 * the nearest 5 minutes in the place's zone, as arrivals are.
 */
function stampTextOf(i: ScreenInputs, from: From, stamp: Answer['stamp']): string | null {
  if (!stamp) return null;
  const at = validDate(stamp.at) ? stamp.at : null;
  const km = typeof stamp.km === 'number' && Number.isFinite(stamp.km) ? stamp.km : null;
  const near = Number.isFinite(from.aheadKm) ? from.aheadKm : 0;
  const far = Number.isFinite(from.behindKm) ? Math.max(from.behindKm, near) : near;
  if (km === null) return at ? W.weatherStampHere(formatHm(at, routeZoneAt(i, near))) : null;
  if (far > near && km >= near && km <= far) return W.waterNearYou;
  let where: string;
  if (km < near) {
    const back = far - km;
    where = back < HERE_KM ? W.routeStampHere : W.waterBack(showKm(back));
  } else {
    const ahead = km - near;
    where = ahead < HERE_KM ? W.routeStampHere : W.weatherStampAhead(showKm(ahead));
  }
  return at ? `${where} · ${formatNearestHm(at, routeZoneAt(i, km))}` : where;
}

function stampsOf(i: ScreenInputs, ride: DayRide, cards: Record<CardName, Answer>, chips: Screen['chips']): Screen['stamps'] {
  // Cards ride the day's ride; the chips ride from the position now, in every phase (section 6.9), as their engines do.
  const card: From = { aheadKm: ride.startKm, behindKm: ride.behindFromKm };
  let chip: From = card;
  try {
    const s = chipStart(ride, i.trip, i.positions);
    chip = { aheadKm: s.aheadKm, behindKm: s.behindKm };
  } catch {
    chip = card;
  }
  const one = (a: Answer, from: From): string | null => {
    try {
      return stampTextOf(i, from, a.stamp);
    } catch {
      return null;
    }
  };
  return {
    water: one(cards.water, card), food: one(cards.food, card), daylight: one(cards.daylight, card), weather: one(cards.weather, card),
    climbing: one(cards.climbing, card), sleep: one(cards.sleep, card),
    bike: one(chips.bike, chip), pharmacy: one(chips.pharmacy, chip), train: one(chips.train, chip), toilets: one(chips.toilets, chip),
    shelter: one(chips.shelter, chip), emergency: one(chips.emergency, chip),
  };
}

// ---- Emergency -----------------------------------------------------------------------------------------------------

/**
 * The country follows the position (section 6.9): the route's own stretch while the rider is near it. Far off the route
 * that says little, so the nearest settlement within 10 km says it, else no country: 112 only.
 */
function countryAt(i: ScreenInputs, p: Position | null): string | null {
  if (!p) return null;
  if (!isFarOff(p)) return zoneLookupOf(i.routeZones)(p.km).country;
  let best: { d: number; place: Place } | null = null;
  for (const place of i.places) {
    if (place.kind !== 'settlement') continue;
    const d = haversineKm(p, place);
    if (d <= SETTLEMENT_COUNTRY_KM && (best === null || d < best.d || (d === best.d && compareFinal(place, best.place) < 0))) best = { d, place };
  }
  return best?.place.country ?? null;
}

function newestDataDate(places: Place[]): string {
  let newest = '';
  for (const p of places) if (typeof p.dataDate === 'string' && p.dataDate > newest) newest = p.dataDate;
  return newest;
}

// ---- the screen ----------------------------------------------------------------------------------------------------

const describe = (e: unknown): string => {
  try {
    return e instanceof Error ? e.message : String(e);
  } catch {
    return 'unreadable error';
  }
};

/** What the screen was assembled from, for the simulator's checks: they judge a screen against the very values it was built on. */
export type ScreenParts = {
  schedule: Schedule; position: Position | null; forecast: StoredForecast | null; stop: StopFacts; water: WaterFacts; leave: LeaveFacts; weather: WeatherFacts; food: StopFacts & Pick<ScreenInputs, 'holidays'>;
  windows: RainWindow[]; plans: RainPlan[]; lb: LeaveBy | null; wg: WaitOrGo | null; targets: ReturnType<typeof findS1S2> | null; ideas: Ideas | null;
};

export function buildScreen(raw: ScreenInputs): { screen: Screen; faults: string[]; parts: ScreenParts } {
  const faults: string[] = [];
  const part = <T>(name: string, build: () => T, otherwise: () => T): T => {
    try {
      return build();
    } catch (e) {
      faults.push(`${name}: ${describe(e)}`);
      return otherwise();
    }
  };

  const i = cleaned(raw);
  const { trip, places, matches, roofs, hours, savedKm, positions, routeZones, now, sun } = i;
  const env: DayEnv = { sun, routeZones };
  const ride = part('ride', () => dayRide(trip, positions, i.planTomorrow, i.routeEndDate, now, env, i.dayStarts), () => fallbackRide(i));
  // A schedule that could not be built leaves every engine that reads it to fail on its own, in its own part.
  const schedule = part('schedule', () => scheduleFor(ride, trip, env), () => null as unknown as Schedule);
  const position = part('position', () => latestUsable({ positions }), () => null);
  const forecast: StoredForecast | null = part('forecast', () => (i.forecast ? routeForecast(i.forecast, trip.route) : null), () => null);

  const stop: StopFacts = { trip, places, matches, roofs, hours, savedKm, forecast, positions, now, routeZones, sun, ride, schedule };
  const water: WaterFacts = { ...stop, baseline: i.baseline, profile: i.profile, loadSummary: i.loadSummary, waterLeft: i.waterLeft };
  const leave: LeaveFacts = { ...water, holidays: i.holidays };
  const weather: WeatherFacts = { forecast, baseline: i.baseline, trip, now, routeZones, ride, schedule, position };

  const windows = part('windows', () => weatherWindows(weather), () => []);
  const plans = part('plans', () => rainPlans(windows, stop), () => []);
  // Leave-by comes first: T1's second clause reads its closure (INV-16), and wait or go its limits.
  const lb: LeaveBy | null = part('leave-by', () => leaveBy(leave, ride), () => null);
  const wg: WaitOrGo | null = lb ? part('wait-or-go', () => waitOrGo({ ...weather, sun }, windows, plans, lb), () => null) : null;
  const targets = part('water-targets', () => findS1S2(water), () => null);
  const placeKm = (t: NonNullable<typeof targets>['s1'] | undefined): Km | null => (t?.kind === 'place' ? t.km : null);
  const s1 = targets?.s1;
  const waterTarget = s1?.kind === 'place' ? s1.place.id : null;
  const food = { ...stop, holidays: i.holidays };
  const ideas: Ideas | null = lb ? part('ideas', () => stopIdeas(food, plans, lb, waterTarget, wg), () => null) : null;

  const cards: Record<CardName, Answer> = {
    water: part('water', () => waterAnswer(water), () => fallbackAnswer('water', W.waterCantWorkOut)),
    food: part('food', () => {
      if (!ideas) throw new Error('no stop ideas');
      return foodAnswer(food, ideas);
    }, () => fallbackAnswer('food', W.stopCantWorkOut)),
    daylight: part('daylight', () => daylightAnswer(leave), () => fallbackAnswer('daylight', W.daylightCantWorkOut)),
    weather: part('weather', () => weatherAnswer(weather, windows, plans, wg), () => fallbackAnswer('weather', W.weatherCantWorkOut)),
    climbing: part('climbing', () => climbingAnswer({ route: trip.route, ride, schedule, climbs: trip.route.climbs, routeZones }), () => fallbackAnswer('climbing', W.climbCantWorkOut)),
    sleep: part('sleep', () => sleepAnswer({ trip, places, matches, hours, savedKm, now, routeZones, sun, ride, schedule }), () => fallbackAnswer('sleep', W.sleepCantWorkOut)),
  };

  const help = { trip, places, matches, hours, savedKm, positions, now, routeZones, sun, ride };
  const chip = (kind: HelpKind): Answer => part(kind, () => helpChip(kind, help), () => fallbackAnswer('help', W.helpCantWorkOut));
  const thunder = part('thunder', () => thunderNear(stop), () => false);
  const emergency = part('emergency', () => emergencyCard({
    position, now, country: part('country', () => countryAt(i, position), () => null),
    settlements: places.filter((p) => p.kind === 'settlement'), shelters: places.filter((p) => p.kind === 'shelter'),
    rescuePoints: i.rescuePoints, thunderNear: thunder, dataDate: newestDataDate(places),
    timeZone: part('country-zone', () => (position ? zoneLookupOf(routeZones)(position.km).timeZone : null), () => null),
  }), () => emergencyCard({ position: null, now: new Date(NaN), country: null, settlements: [], shelters: [], rescuePoints: [], thunderNear: false, dataDate: '' }));
  const chips: Screen['chips'] = {
    bike: chip('bike'), pharmacy: chip('pharmacy'), train: chip('train'), toilets: chip('toilets'),
    shelter: part('shelter', () => shelterChip(stop, thunder), () => fallbackAnswer('help', W.shelterCantWorkOut)),
    emergency,
  };

  const share = (addMapLink: boolean): string | null => part('share', () => progressText({
    ride, position, schedule, trip, settlements: places.filter((p) => p.kind === 'settlement'), matches, addMapLink, now, routeZones, planTomorrow: i.planTomorrow,
  }), () => null);

  const screen: Screen = {
    positionLine: part('position-line', () => positionLineOf(i, position), () => null),
    strip: part('strip', () => stripOf(i, ride, schedule, windows, plans, { s1: placeKm(targets?.s1), s2: placeKm(targets?.s2) }, ideas, cards),
      () => ({ label: labelOf(ride), startKm: ride.startKm, endKm: ride.stopKm, endText: W.routeStripAtEnd, icons: [], bands: [] })),
    cards, chips, shareText: share(false), shareMapText: share(true), phase: ride.phase, ride,
    notes: part('notes', () => notesOf(i, ride, position), () => []),
    stamps: stampsOf(i, ride, cards, chips),
  };
  return { screen, faults, parts: { schedule, position, forecast, stop, water, leave, weather, food, windows, plans, lb, wg, targets, ideas } };
}

export const screen = (inputs: ScreenInputs): Screen => buildScreen(inputs).screen;

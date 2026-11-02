// Core types of spec section 4.3, plus the screen's inputs (section 11.1). Pure types: nothing runs here.
// Place types come from sub-project 2 and are re-exported unchanged.
import type { PackRescuePoint, Place, PlaceKind, Roof, StopFlags, Contact } from './places/types.ts';

export type { Contact, Place, PlaceKind, Roof, StopFlags };
export { ALL_KINDS } from './places/types.ts';

/** Route kilometre, from haversine running totals. */
export type Km = number;

/**
 * 'route': position, off route, towns, borders, stages and trip days. 'bike': tyre pressure, the bike's details
 * and maximum weight. An honest card takes its subject's topic; a statement takes the topic of the card it offers.
 */
export type Topic =
  | 'water' | 'food' | 'daylight' | 'weather' | 'climbing' | 'sleep' | 'help' | 'time' | 'route' | 'bike'
  | 'packing' | 'meta';

export type Status = 'fine' | 'action' | 'warning' | 'unknown';

export type RoutePoint = { lat: number; lon: number; ele: number | null; km: Km };
export type Stage = { day: number; startKm: Km; endKm: Km; ridingHours: number; ascentM: number | null };
export type Climb = { startKm: Km; topKm: Km; gainM: number; avgGradePct: number; steepest500mPct: number };
export type Route = {
  id: string; name: string; points: RoutePoint[]; lengthKm: Km; ascentM: number | null;
  stages: Stage[]; climbs: Climb[]; source: 'gpx' | 'planned'; sampleGrid: Km[];
  /** SHA-256 of the canonical encoding (Contract 5), fixed once heights are final (section 5). */
  hash: string;
};
export type Position = {
  lat: number; lon: number; accuracyM: number; at: Date; km: Km; offRouteM: number;
  source: 'gps' | 'manual'; approximate: boolean;
};

/** One route kilometre per pass of the route. */
export type RouteMatch = { placeId: string; km: Km; offRouteM: number };

/**
 * 'possibly-closed' covers every "probably closed" and "local holiday" case. "May be open" (bakeries and
 * fuel-station shops on Sundays and holidays) is 'unknown' with that reason, so it never counts as 'open'.
 */
export type HoursSpan = { from: Date; to: Date; state: 'open' | 'closed' | 'unknown' | 'possibly-closed'; reason?: string };
export type PlaceHours = { placeId: string; windowStart: Date; windowEnd: Date; spans: HoursSpan[] };

/** The data whose absence an answer names (section 8 rule 2). Codes, never shown. */
export type Missing = 'date' | 'places' | 'hours' | 'weather' | 'heights' | 'capacity';

export type AnswerItem = { label: string; stamp: { km?: Km; at?: Date } | null; status: Status; detail?: string; contact?: Contact };
export type Freshness = { dataDates: Record<string, string>; stale: boolean };
export type Answer = {
  topic: Topic; status: Status; title: string; stamp: { km?: Km; at?: Date } | null;
  detail: string; items: AnswerItem[]; basis: string[]; freshness: Freshness;
  missing: Missing[];
};

/** A rescue point as the engines use it: the pack's record plus one route kilometre per pass within 300 m. */
export type RescuePoint = PackRescuePoint & { kms: Km[] };

export type ModelRun = { model: string; run: Date; availableAt: Date };
export type RainWindow = {
  kind: 'rain' | 'showers' | 'thunder'; cls: 'likely' | 'possible'; fromKm: Km; toKm: Km; // first and last met point, unrounded
  reachAt: Date; // rider's arrival at the first met point
  onset: Date | null; // null for showers and thunderstorms
  end: Date | null; // null unless followed by 2 unlikely hours; always null for a thunderstorm (no all-clear)
  chancePct: number | null; // null when no hour of the window gives a chance
  maxMm: number; heavy: boolean; detail: '30min' | 'daypart' | 'trend';
  // The plan's additions, so plans and the card need not recompute them:
  metKms: Km[]; // the met points, in route order
  thunderKms: Km[]; // those with a thunderstorm hour in their band
  onAndOff: boolean; // an unmet point was bridged
  hoursFrom: Date; hoursTo: Date; // the rain periods on whole hours, for an area's wording
};
export type Cover = {
  placeId: string | null; roof: Roof | null; km: Km; offRouteM: number; arrival: Date;
  coverClass: 1 | 2 | 3 | 4 | 5; openUntil: Date | null; lightning: boolean;
};
export type StopIdea = {
  trigger: 'last-chance' | 'gap' | 'rain' | 'heat' | 'meal' | 'rhythm';
  placeId: string | null; arrival: Date | null; status: Status; reason: string;
};

/** Riding date (ISO) and the kilometre its ride began at (section 6.2a). */
export type DayStart = { day: string; km: Km };
/** Derived, never stored (section 6.2a). */
export type DayPhase = 'before-trip' | 'before-ride' | 'riding' | 'after-ride' | 'route-end';
export type DayRide = {
  phase: DayPhase; date: string; // the ride the cards plan, and its riding date (ISO)
  startKm: Km; startOffRouteM: number; // its start point; the rejoin leg is 1.3 x startOffRouteM (section 6.1)
  departure: Date; stopKm: Km; // its departure and the day's stop
  tonightKm: Km | null; // null before the trip
  tomorrowKm: Km | null; // null at the route end, or when tomorrow is no trip day
  // The plan's additions (Task 7), so engines need not recompute them:
  dayStartKm: Km; // where today's ride began (section 6.2a); the store keeps it for later days
  nightKm: Km | null; // where the rider spent the last night or stops tonight; null without a position
  r: number; // today's correction (section 6.2); scheduleFor applies 1 to tomorrow's ride
  behindFromKm: Km; // where places behind are measured from: the far edge of an approximate position
  noRide: boolean; // after the day's ride with tonight's stop at the route end: the cards answer as at the route end
  routeEndReachedOn: string | null; // the riding date to store (section 4.4); null until a day position reaches the end
  note: DayNote | null; // the start note the cards show; noteFor gives its text
  keepDayStart: DayStart | null; // what the store keeps in `dayStarts` (section 4.4); null while the start is provisional
};
/** Why the day's ride does not simply start at the rider (section 6.2a). */
export type DayNote =
  | { kind: 'day1-route-start' } // the position is elsewhere, and day 1 starts at the route start
  | { kind: 'past-stop'; stopKm: Km; tomorrow: boolean } // the position lies past the day's stop
  | { kind: 'no-position'; km: Km } // after the ride with no position: from tonight's stop
  | { kind: 'stage-start'; km: Km } // no night kilometre: from the plan's stage start
  | { kind: 'tonight-route-end'; km: Km }; // tonight's stop is the route end, not reached by any position

// The ask box (section 6.10) is not in the first version; its types are kept so engines can take a ride as an argument.
export type QuestionTypeId = string; // catalogue id, e.g. 'WA-02'
export type Limit = {
  kind: 'here' | 'km' | 'place' | 'stop' | 'end' | 'time' | 'dark' | 'rain' | 'storm' | 'heat' | 'climb' | 'top' | 'closure';
  km: Km | null; at: Date | null; label: string;
};
export type Slots = {
  places?: string[]; km?: Km; from?: Limit; until?: Limit;
  range?: { fromKm: Km; toKm: Km }; window?: { from: Date; to: Date };
  day?: string; at?: Date; depart?: Date; dir?: 'ahead' | 'behind';
  kinds?: PlaceKind[]; flags?: (keyof StopFlags)[];
  subkinds?: string[]; service?: string;
  litres?: number; bottles?: number; item?: string; topic?: Topic;
  help?: string;
  surface?: 'paved' | 'rough' | 'unpaved'; wet?: boolean;
};
export type AskContext = {
  type: QuestionTypeId; slots: Slots; items: { placeId: string | null; km: Km }[];
  setAt: Date; questionsSince: number;
};
export type AskResult = {
  cards: Answer[]; readings: string[];
  clarify: { text: string; options: { label: string; type: QuestionTypeId; slots: Slots }[] } | null;
  didYouMean: QuestionTypeId[]; language: 'en' | 'de'; context: AskContext | null;
};

// Readiness (section 9.10) is not in the first version either.
export type ReadyStatus = 'checked' | 'not-yet' | 'note' | 'not-needed';
export type ReadyStepId =
  | 'date' | 'install' | 'app' | 'clock' | 'get-ready' | 'refresh-stretch' | 'hours' | 'water' | 'weather' | 'flight-test';
export type ReadyStep = { id: ReadyStepId; range: { fromKm: Km; toKm: Km } | null };
export type ReadyCheck = { id: string; status: ReadyStatus; text: string; step: ReadyStep | null; day: number | null };
export type Readiness = { result: 'go' | 'not-yet' | 'checking'; steps: ReadyStep[]; checks: ReadyCheck[] };

/** The recording's ISO date; null outside the demo trip. */
export type DemoMarker = { recordedOn: string };

// ---- Added by sub-project 3 -------------------------------------------------------------------------------------

/** One stretch of the route with its time zone, holiday zone and country, from the bundled boundary file. */
export type ZoneSpan = { fromKm: Km; toKm: Km; timeZone: string; holidayZone: string | null; country: string };
export type ZoneLookup = (km: Km) => ZoneSpan;

/** The seasonal baseline (section 6.6): five years of archive weather at the stage ends and the high point. */
export type Baseline = {
  years: string;
  points: { km: Km; eleM: number | null; month: number; p10LowC: number; meanLowC: number; p90HighC: number; meanHighC: number; rainDays: number }[];
};

/** Sun times of one riding date at one point. A null means the event does not happen that day. */
export type SunTimes = { dawn: Date | null; sunrise: Date | null; sunset: Date | null; dusk: Date | null; lightAllNight: boolean };
export type SunSource = (lat: number, lon: number, ridingDate: string) => SunTimes;

/** Section 3.3's stay types. */
export type Stay = 'camping' | 'mixed' | 'accommodation';

export type Trip = {
  route: Route; departureDate: string | null; startTime: string /* HH:MM */; flatKph: number; stay: Stay; campWaterL: number;
};

export type Profile = {
  weightKg: number | null; thirst: 'less' | 'average' | 'more'; ebike: boolean; capacityL: number | null;
  k: number; sumW: number; kDrink: number; weighedRides: number;
};

/** The load summary of Contract 1 (bag planner to co-pilot), as Load Check writes it. */
export type LoadSummaryFull = {
  app: 'load-check'; kind: 'load-summary'; v: 1; at: string; planUpdatedAt: string;
  nights: number; month: number; departureDate: string | null; mode: string; foodDays: number; bikeId: string | null;
  bags: {
    count: number; positions: string[];
    items: { pos: string; L: number; shape?: number; slot?: 'front' | 'rear'; pair?: boolean; fill: number | [number, number] }[];
  };
  decks: { bar: 'empty' | 'loaded' | null; rack: 'empty' | 'loaded' | null };
  water: { bottles: { slot: 'st' | 'dt' | 'un'; L: number }[]; cageL: number; extraL: number; totalL: number };
  weight: {
    kitKg: number; cageWaterKg: number; carriedKg: number; bikeKg: number | null; emptyLuggageKg: number | null;
    byPositionKg: { fork: number; bar: number; top: number; frame: number; bottle: number; seat: number; rack: number; pack: number };
    unplacedKg: number;
  };
  kit: { waterFilter: boolean };
};
/** A plan without any bag writes this; readers treat it as no summary. */
export type LoadSummaryEmpty = { app: 'load-check'; kind: 'load-summary'; v: 1; at: string; empty: true };
export type LoadSummary = LoadSummaryFull | LoadSummaryEmpty;

/** The Plan tomorrow choice (section 6.2a): one date, or the time of a Back to today tap. */
export type PlanTomorrow = { date: string; backToTodayAt: Date | null };

/** One hour of a stored forecast at one grid point (section 6.6). `pp` is the precipitation probability, if given. */
export type GridHour = {
  at: Date; t: number; rh: number; ghi: number; pp: number | null; mm: number; code: number;
  windMs: number; windFrom: number; gustMs: number;
};
/** The stored forecast: its fetch time, the model runs read before the fetch, and whether 15-minute rain is present. */
export type StoredForecast = {
  fetchedAt: Date; runs: ModelRun[];
  grid: { km: Km; lat: number; lon: number; hours: GridHour[]; rain15?: { at: Date; mm: number }[] }[];
  has15: boolean;
};

/**
 * Everything `screen()` needs (section 11.1). `routeZones` and `holidays` are not in section 11.1's list: the screen
 * is pure and `opening_hours` is a lazy chunk, so the zone of each stretch and the public holidays by zone come in
 * as plain data.
 */
export type ScreenInputs = {
  trip: Trip; matches: RouteMatch[]; places: Place[]; roofs: Roof[]; hours: PlaceHours[]; rescuePoints: RescuePoint[];
  savedKm: { fromKm: Km; toKm: Km }[]; forecast: StoredForecast | null; baseline: Baseline | null;
  positions: Position[]; dayStarts: DayStart[];
  routeEndDate: string | null; planTomorrow: PlanTomorrow | null; profile: Profile; loadSummary: LoadSummary | null;
  waterLeft: { litres: number; at: Date; confirmed: boolean } | null;
  settings: { campWaterL: number; keepFresh: boolean };
  now: Date; sun: SunSource;
  routeZones: ZoneSpan[]; holidays: Record<string, string[]>; demo: DemoMarker | null;
};

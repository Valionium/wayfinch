// One generated trip and one moment (spec section 11.1), made from the generators of section 12.2.
import fc from 'fast-check';
import { addDaysIso, instantAt, localIsoDate } from '../../src/core/answers/time.ts';
import { dayRide, scheduleFor } from '../../src/core/engines/tripday.ts';
import { buildSegmentIndex } from '../../src/core/geo/index.ts';
import { placeSpans, type RuleClass } from '../../src/core/hours/spans.ts';
import { matchPlaces } from '../../src/core/route/matches.ts';
import { pointAtRouteKm } from '../../src/core/geo/project.ts';
import type { DayStart, HoursSpan, Place, PlaceHours, PlanTomorrow, Position, Route, RouteMatch, ScreenInputs, Stay, Trip, ZoneSpan } from '../../src/core/types.ts';
import { placesAlong } from './along.ts';
import { clock, departureDate, startTime, sunOf, sunSpec, type Moment, type SunSpec } from './clocks.ts';
import { baselineChoice, baselineOf, forecastChoice, forecastOf, type ForecastChoice } from './forecasts.ts';
import { plannedKm, positions as positionsGen } from './positions.ts';
import { loadSummary, profile, waterLeft } from './profiles.ts';
import { route as routeGen } from './routes.ts';
import { stageChoice, stagesOf, withStages } from './stages.ts';
import { edgeMin } from './thresholds.ts';

const MIN = 60_000;

// ---- zones ---------------------------------------------------------------------------------------------------------

type ZoneForm = 'germany' | 'germany-bavaria' | 'border-austria' | 'border-france' | 'portugal' | 'none' | 'odd-zone' | 'odd-country';
const zoneForm = (): fc.Arbitrary<ZoneForm> => fc.oneof(
  { weight: 40, arbitrary: fc.constantFrom<ZoneForm>('germany', 'germany', 'germany', 'germany', 'germany-bavaria', 'germany-bavaria', 'border-austria', 'border-france', 'portugal', 'none') },
  { weight: 1, arbitrary: fc.constantFrom<ZoneForm>('odd-zone', 'odd-country') },
);

function zonesFor(form: ZoneForm, route: Route): ZoneSpan[] {
  const L = route.lengthKm;
  const span = (fromKm: number, toKm: number, timeZone: string, holidayZone: string | null, country: string): ZoneSpan => ({ fromKm, toKm, timeZone, holidayZone, country });
  switch (form) {
    case 'germany': return [span(0, L, 'Europe/Berlin', 'DE-BW', 'DE')];
    case 'germany-bavaria': return [span(0, L, 'Europe/Berlin', 'DE-BY-Augsburg', 'DE')];
    case 'border-austria': return [span(0, L / 2, 'Europe/Berlin', 'DE-BY', 'DE'), span(L / 2, L, 'Europe/Vienna', 'AT-7', 'AT')];
    case 'border-france': return [span(0, L * 0.7, 'Europe/Berlin', 'DE-BW', 'DE'), span(L * 0.7, L, 'Europe/Paris', 'FR-67', 'FR')];
    case 'portugal': return [span(0, L, 'Europe/Lisbon', null, 'PT')];
    case 'none': return [];
    case 'odd-zone': return [span(0, L, 'constructor', '__proto__', 'DE')];
    case 'odd-country': return [span(0, L, 'Europe/Berlin', 'constructor', '__proto__')];
  }
}

// ---- hours ---------------------------------------------------------------------------------------------------------

export function ruleOf(p: Place): RuleClass {
  const shop = p.tags['shop'];
  if (p.kind === 'fuel_shop') return { kind: 'fuel-shop', nearStation: false };
  if (p.kind !== 'shop') return { kind: 'other', nearStation: false };
  if (shop === 'bakery') return { kind: 'bakery', nearStation: false };
  if (shop === 'kiosk') return { kind: 'kiosk', nearStation: false };
  return { kind: 'food-shop', nearStation: false };
}

/** Real preparation costs milliseconds, so one tag and window is worked out once per run; values stay deterministic. */
const prepared = new Map<string, HoursSpan[]>();
function realSpans(p: Place, from: Date, to: Date, holidays: Record<string, string[]>): HoursSpan[] {
  const key = `${p.openingHours}|${p.kind}|${p.tags['shop']}|${p.timeZone}|${p.country}|${p.holidayZone}|${from.getTime()}|${to.getTime()}`;
  const seen = prepared.get(key);
  if (seen) return seen;
  const spans = placeSpans(p.openingHours, p, ruleOf(p), from, to, holidays);
  prepared.set(key, spans);
  return spans;
}

function dailySpans(from: Date, to: Date, tz: string, opens: string, closes: string, state: HoursSpan['state']): HoursSpan[] {
  const out: HoursSpan[] = [];
  let cursor = from;
  let date = localIsoDate(from, tz);
  for (let n = 0; n < 20 && cursor < to; n++) {
    const open = instantAt(date, opens, tz);
    const shut = instantAt(date, closes, tz);
    if (open > cursor && open < to) {
      out.push({ from: cursor, to: open, state: 'closed' });
      cursor = open;
    }
    if (shut > cursor && shut < to) {
      out.push({ from: cursor, to: shut, state });
      cursor = shut;
    }
    date = addDaysIso(date, 1);
  }
  if (cursor < to) out.push({ from: cursor, to, state: 'closed' });
  return out;
}

type HoursForm = 'worked' | 'none' | 'part' | 'expired';
type HoursChoice = { form: HoursForm; edges: number[]; states: number[] };
const hoursChoice = (): fc.Arbitrary<HoursChoice> => fc.record({
  form: fc.constantFrom<HoursForm>('worked', 'worked', 'worked', 'worked', 'worked', 'worked', 'none', 'part', 'expired'),
  edges: fc.array(edgeMin(), { minLength: 8, maxLength: 8 }),
  states: fc.array(fc.nat(11), { minLength: 8, maxLength: 8 }),
});

const SKIPS_HOURS: ReadonlySet<string> = new Set(['settlement', 'shelter', 'air', 'repair_station']);
const REAL_TAGS_PER_SCENARIO = 3;

/** Hour spans of the moment: daily hours, stretches closing or opening right at the rider's arrival, and real tags worked out. */
function hoursFor(i: Pick<ScreenInputs, 'trip' | 'places' | 'matches' | 'now' | 'holidays'>, tz: string, zones: ZoneSpan[], sun: ScreenInputs['sun'], pos: Position[], c: HoursChoice, base: string): PlaceHours[] {
  if (c.form === 'none') return [];
  const startDate = addDaysIso(base, -3);
  const windowStart = instantAt(startDate, '00:00', tz);
  const windowEnd = instantAt(addDaysIso(base, 21), '00:00', tz);
  if (c.form === 'expired') {
    const end = new Date(i.now.getTime() - 3_600_000);
    return i.places.slice(0, 5).map((p) => ({ placeId: p.id, windowStart: new Date(end.getTime() - 86_400_000), windowEnd: end, spans: [{ from: new Date(end.getTime() - 86_400_000), to: end, state: 'open' as const }] }));
  }
  let schedule: ReturnType<typeof scheduleFor> | null = null;
  try {
    const env = { sun, routeZones: zones };
    schedule = scheduleFor(dayRide(i.trip, pos, null, null, i.now, env), i.trip, env);
  } catch {
    schedule = null;
  }
  const firstMatch = new Map<string, RouteMatch>();
  for (const m of i.matches) if (!firstMatch.has(m.placeId)) firstMatch.set(m.placeId, m);
  let real = 0;
  const out: PlaceHours[] = [];
  i.places.forEach((p, n) => {
    if (SKIPS_HOURS.has(p.kind) || (c.form === 'part' && n % 2 === 0)) return;
    const pick = c.states[n % c.states.length]!;
    const placeZone = /^[A-Z]/.test(p.timeZone) ? p.timeZone : tz;
    let spans: HoursSpan[];
    const m = firstMatch.get(p.id);
    if (p.openingHours !== null && real < REAL_TAGS_PER_SCENARIO && pick <= 2 && /^[A-Z]/.test(p.timeZone)) {
      real++;
      spans = realSpans(p, windowStart, windowEnd, i.holidays);
    } else if (pick <= 5 && m && schedule) {
      // Its closing or opening sits on a threshold of the arrival.
      const arrival = schedule.atPlace(m).getTime();
      const edge = Number.isFinite(arrival) ? arrival + c.edges[n % c.edges.length]! * MIN : Number.NaN;
      if (!Number.isFinite(edge) || edge <= windowStart.getTime() || edge >= windowEnd.getTime()) spans = [{ from: windowStart, to: windowEnd, state: 'open' }];
      else if (pick % 2 === 0) spans = [{ from: windowStart, to: new Date(edge), state: 'open' }, { from: new Date(edge), to: windowEnd, state: 'closed' }];
      else spans = [{ from: windowStart, to: new Date(edge), state: 'closed' }, { from: new Date(edge), to: windowEnd, state: 'open' }];
    } else if (pick === 6) spans = [{ from: windowStart, to: windowEnd, state: 'unknown', reason: 'hours unknown' }];
    else if (pick === 7) spans = [{ from: windowStart, to: windowEnd, state: 'possibly-closed', reason: 'possibly closed' }];
    else spans = dailySpans(windowStart, windowEnd, placeZone, pick === 8 ? '06:00' : '09:00', pick === 9 ? '13:00' : '19:00', 'open');
    out.push({ placeId: p.id, windowStart, windowEnd, spans });
  });
  return out;
}

// ---- breakage ------------------------------------------------------------------------------------------------------

/** Family (a) of the reviews: NaN, Infinity and dates that are none, one field at a time. The screen must stand all of them. */
const NOT_A_TIME = new Date(Number.NaN);
const MESSES: ((i: ScreenInputs) => ScreenInputs)[] = [
  (i) => ({ ...i, trip: { ...i.trip, flatKph: Number.NaN } }),
  (i) => ({ ...i, trip: { ...i.trip, flatKph: 0 } }),
  (i) => ({ ...i, trip: { ...i.trip, flatKph: 14 } }),
  (i) => ({ ...i, trip: { ...i.trip, flatKph: Infinity } }),
  (i) => ({ ...i, now: NOT_A_TIME }),
  (i) => ({ ...i, trip: { ...i.trip, startTime: '25:99' } }),
  (i) => ({ ...i, trip: { ...i.trip, campWaterL: Number.NaN } }),
  (i) => ({ ...i, matches: i.matches.map((m, n) => (n === 0 ? { ...m, km: Number.NaN } : m)) }),
  (i) => ({ ...i, matches: i.matches.map((m, n) => (n === 0 ? { ...m, offRouteM: Infinity } : m)) }),
  (i) => ({ ...i, hours: i.hours.map((h, n) => (n === 0 ? { ...h, windowStart: NOT_A_TIME, spans: [{ from: NOT_A_TIME, to: NOT_A_TIME, state: 'open' as const }, ...h.spans] } : h)) }),
  (i) => ({ ...i, savedKm: [{ fromKm: Number.NaN, toKm: Infinity }, ...i.savedKm] }),
  (i) => ({ ...i, profile: { ...i.profile, k: Number.NaN } }),
  (i) => ({ ...i, profile: { ...i.profile, capacityL: Infinity } }),
  (i) => ({ ...i, dayStarts: [{ day: 'not a date', km: Number.NaN }, ...i.dayStarts] }),
  (i) => ({ ...i, planTomorrow: { date: 'not a date', backToTodayAt: NOT_A_TIME } }),
  (i) => ({ ...i, routeEndDate: 'not a date' }),
  (i) => ({ ...i, holidays: { ...i.holidays, ['constructor']: ['not a date'] } }),
];

// ---- the scenario --------------------------------------------------------------------------------------------------

type Base = { route: Route; trip: Trip; form: ZoneForm; zones: ZoneSpan[]; tz: string; spec: SunSpec };

const baseScenario = (): fc.Arbitrary<Base & { moment: Moment }> =>
  fc.record({
    route: routeGen(), stages: stageChoice(), date: departureDate(), start: startTime(), form: zoneForm(),
    stay: fc.constantFrom<Stay>('camping', 'camping', 'mixed', 'accommodation'), camp: fc.constantFrom(2, 2, 0, 5, 1.5),
  }).chain((r) => {
    const route = withStages(r.route, stagesOf(r.route, r.stages));
    const trip: Trip = { route, departureDate: r.date, startTime: r.start, flatKph: r.stages.flatKph, stay: r.stay, campWaterL: r.stay === 'accommodation' ? 0 : r.camp, pace: r.stages.pace };
    const zones = zonesFor(r.form, route);
    const tz = zones[0] && /^[A-Z]/.test(zones[0].timeZone) ? zones[0].timeZone : 'Europe/Berlin';
    return sunSpec(tz).chain((spec) => {
      const first = pointAtRouteKm(route, 0);
      const stage0 = route.stages[0];
      return clock({ departureDate: r.date, startTime: r.start, days: route.stages.length, tz, sun: sunOf(spec), lat: first.lat, lon: first.lon, halfwayMin: stage0 ? (stage0.ridingHours * 60 * 1.15) / 2 : 0 })
        .map((moment) => ({ route, trip, form: r.form, zones, tz, spec, moment }));
    });
  });

const holidaysFor = (date: string | null, zones: ZoneSpan[], n: number): Record<string, string[]> => {
  if (date === null || n > 2) return {};
  const zone = zones[0]?.holidayZone ?? 'DE-BW';
  // A local holiday on a day of the trip, in the zone of the route's start.
  return { [zone]: [addDaysIso(date, n)] };
};

function savedOf(form: number, length: number): ScreenInputs['savedKm'] {
  switch (form) {
    case 0: return [];
    case 1: return [{ fromKm: 0, toKm: length / 2 }];
    case 2: return [{ fromKm: length / 3, toKm: length }];
    case 3: return [{ fromKm: 0, toKm: length / 4 }, { fromKm: length / 2, toKm: length }];
    default: return [{ fromKm: 0, toKm: length }];
  }
}

export function scenario(): fc.Arbitrary<ScreenInputs> {
  return baseScenario().chain((b) => {
    const now = b.moment.now;
    return fc.record({
      along: placesAlong(b.route),
      positions: positionsGen(b.trip, now, b.tz),
      forecast: forecastChoice(),
      baseline: baselineChoice(),
      hours: hoursChoice(),
      profile: profile(),
      summary: loadSummary(),
      water: waterLeft(now),
      saved: fc.integer({ min: 0, max: 15 }),
      stormRoof: fc.integer({ min: 0, max: 3 }),
      holiday: fc.integer({ min: 0, max: 9 }),
      plan: fc.integer({ min: 0, max: 15 }),
      dayStart: fc.integer({ min: 0, max: 5 }),
      endDate: fc.integer({ min: 0, max: 9 }),
      mess: fc.oneof({ weight: 12, arbitrary: fc.constant(-1) }, { weight: 1, arbitrary: fc.nat(MESSES.length - 1) }),
    }).map((r): ScreenInputs => {
      const today = localIsoDate(now, b.tz);
      const zoneOf = (km: number): ZoneSpan | undefined => b.zones.find((z) => km >= z.fromKm && km <= z.toKm) ?? b.zones[0];
      // Each place belongs to the zone of the route where it lies; a broken one keeps what it had.
      const idx = buildSegmentIndex(b.route);
      const located = r.along.places.map((p) => {
        const z = zoneOf(0);
        return z && !/^[A-Z]/.test(z.timeZone) ? { ...p, timeZone: z.timeZone } : p;
      });
      const usable = located.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      const matches = matchPlaces(usable, b.route, idx);
      const firstKm = new Map<string, number>();
      for (const m of matches) if (!firstKm.has(m.placeId)) firstKm.set(m.placeId, m.km);
      const places = located.map((p) => {
        const z = zoneOf(firstKm.get(p.id) ?? 0);
        return z && /^[A-Z]/.test(z.timeZone) ? { ...p, timeZone: z.timeZone, country: z.country, holidayZone: z.holidayZone, hoursRegionKey: z.holidayZone, subdivision: z.holidayZone } : p;
      });
      const sun = sunOf(b.spec);
      const holidays = holidaysFor(b.trip.departureDate, b.zones, r.holiday);
      // A storm ahead, rain beyond it, and with no other cover worked out, a plain roof in the band as the plan's first cover.
      const riderKm = plannedKm(b.trip, now, b.tz);
      const stormAhead = r.stormRoof === 0 && riderKm + 40 < b.route.lengthKm;
      const hours = hoursFor({ trip: b.trip, places, matches, now, holidays }, b.tz, b.zones, sun, r.positions, stormAhead ? { ...r.hours, form: 'none' } : r.hours, b.trip.departureDate ?? today);
      const dayStarts: DayStart[] = r.dayStart === 0 ? [{ day: today, km: b.trip.route.lengthKm / 3 }] : [];
      const planTomorrow: PlanTomorrow | null = r.plan === 0 ? { date: today, backToTodayAt: null } : r.plan === 1 ? { date: today, backToTodayAt: new Date(now.getTime() - 5 * MIN) } : null;
      const month = Number(today.slice(5, 7));
      const cellOf = (fromFraction: number, code: number): ForecastChoice['cells'][number] => ({ nearRider: true, fromFraction, kmPerHour: 0, radiusKm: 8, startH: -2, hours: 24, code, pp: 80, mm: 1, gust: 20 });
      const forecastChosen: ForecastChoice = stormAhead ? { ...r.forecast, form: 'whole', days: 7, rainHere: false, future: false, cells: [cellOf(0.5, 95), cellOf(1.4, 61)] } : r.forecast;
      const at = stormAhead ? pointAtRouteKm(b.route, Math.min(b.route.lengthKm, riderKm + 34)) : null;
      const roofs = at ? [{ kind: 'bus_stop' as const, bench: false, lat: at.lat, lon: at.lon }] : r.along.roofs;
      const inputs: ScreenInputs = {
        trip: b.trip, matches, places, roofs, hours, rescuePoints: r.along.rescuePoints,
        savedKm: savedOf(r.saved, b.route.lengthKm), forecast: forecastOf(b.route, now, forecastChosen, riderKm), baseline: baselineOf(b.route, month, r.baseline),
        positions: r.positions, dayStarts, routeEndDate: r.endDate === 0 && r.plan % 2 === 0 ? today : null, planTomorrow, profile: r.profile, loadSummary: r.summary, waterLeft: r.water,
        settings: { campWaterL: b.trip.campWaterL, keepFresh: false }, now, sun, routeZones: b.zones, holidays, demo: null,
      };
      const mess = MESSES[r.mess];
      return mess ? mess(inputs) : inputs;
    });
  });
}

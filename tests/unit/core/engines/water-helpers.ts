// What the water tests share: facts built from one-line place builders, a steady forecast, and prepared hours.
import { dayRide, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import type { WaterFacts } from '../../../../src/core/engines/water.ts';
import type { Baseline, GridHour, HoursSpan, Km, LoadSummary, Place, PlaceHours, PlanTomorrow, Position, Profile, RouteMatch, StoredForecast, Trip } from '../../../../src/core/types.ts';
import { at, sun, testTrip, zonesOf, type PlaceBuilder } from '../../../fixtures/build.ts';

export const SAT = '2026-10-17';
export const SUN = '2026-10-18';

/** A place on the route: its builder, its kilometre(s), and how far off the route it lies. */
export type Spot = { b: PlaceBuilder; km: Km | Km[]; off?: number; id?: string; side?: 'east' | 'west' };

export function spots(list: Spot[]): { places: Place[]; matches: RouteMatch[] } {
  const places: Place[] = [];
  const matches: RouteMatch[] = [];
  for (const s of list) {
    const kms = Array.isArray(s.km) ? s.km : [s.km];
    const o: { off?: number; id?: string; side?: 'east' | 'west' } = {};
    if (s.off !== undefined) o.off = s.off;
    if (s.id !== undefined) o.id = s.id;
    if (s.side !== undefined) o.side = s.side;
    const place = s.b.atKm(kms[0]!, o);
    places.push(place);
    for (const km of kms) matches.push({ placeId: place.id, km, offRouteM: s.off ?? 0 });
  }
  return { places, matches };
}

/** The same weather at every hour of a week, at one grid point, starting at `from` in UTC hours. */
export function steady(o: { t?: number; rh?: number; ghi?: number; from?: string; days?: number; windMs?: number; windFrom?: number } = {}): StoredForecast {
  const start = at(o.from ?? '2026-10-16 00:00').getTime();
  const hours: GridHour[] = [];
  for (let h = 0; h < 24 * (o.days ?? 8); h++) {
    hours.push({ at: new Date(start + h * 3_600_000), t: o.t ?? 19, rh: o.rh ?? 50, ghi: o.ghi ?? 300, pp: 0, mm: 0, code: 0, windMs: o.windMs ?? 0, windFrom: o.windFrom ?? 0, gustMs: 0 });
  }
  return { fetchedAt: new Date(start), runs: [], grid: [{ km: 0, lat: 49, lon: 8.4, hours }], has15: false };
}

export const profileOf = (over: Partial<Profile> = {}): Profile => ({
  weightKg: null, thirst: 'average', ebike: false, capacityL: 3, k: 1, sumW: 0, kDrink: 1, weighedRides: 0, ...over,
});

export type Case = {
  trip?: Trip; spots?: Spot[]; positions?: Position[]; now?: string | Date; plan?: PlanTomorrow | null; litres?: number | null; confirmed?: boolean;
  confirmedAt?: string | Date; forecast?: StoredForecast | null; baseline?: Baseline | null; profile?: Partial<Profile>;
  summary?: LoadSummary | null; hours?: PlaceHours[]; savedKm?: { fromKm: Km; toKm: Km }[];
};

const dateOf = (t: string | Date): Date => (t instanceof Date ? t : at(t));

/** Facts for the water engine. By default: the standard trip, Saturday 09:00, 3 L of bottles, 2 L confirmed now. */
export function factsOf(c: Case = {}): WaterFacts {
  const trip = c.trip ?? testTrip();
  const now = dateOf(c.now ?? `${SAT} 09:00`);
  const routeZones = zonesOf(trip.route.lengthKm);
  const env = { sun: sun(), routeZones };
  const positions = c.positions ?? [];
  const ride = dayRide(trip, positions, c.plan ?? null, null, now, env);
  const { places, matches } = spots(c.spots ?? []);
  const litres = c.litres === undefined ? 2 : c.litres;
  return {
    trip, ride, schedule: scheduleFor(ride, trip, env), sun: env.sun, places, matches, hours: c.hours ?? [],
    savedKm: c.savedKm ?? [{ fromKm: 0, toKm: trip.route.lengthKm }],
    forecast: c.forecast === undefined ? steady() : c.forecast, baseline: c.baseline ?? null,
    profile: profileOf(c.profile), loadSummary: c.summary ?? null,
    waterLeft: litres === null ? null : { litres, at: dateOf(c.confirmedAt ?? now), confirmed: c.confirmed ?? true },
    positions, now, routeZones,
  };
}

/** Prepared hours: whole-day windows either side of `date`, with the given stretches and closed between them. */
export function hoursOf(place: Place, stretches: { from: string; to: string; state?: HoursSpan['state']; reason?: string }[], date = SAT): PlaceHours {
  const windowStart = at('2026-01-01 00:00');
  const windowEnd = at('2027-01-01 00:00');
  const spans: HoursSpan[] = [];
  let cursor = windowStart;
  for (const s of stretches) {
    const from = at(s.from.length > 8 ? s.from : `${date} ${s.from}`);
    const to = at(s.to.length > 8 ? s.to : `${date} ${s.to}`);
    if (from.getTime() > cursor.getTime()) spans.push({ from: cursor, to: from, state: 'closed' });
    const span: HoursSpan = { from, to, state: s.state ?? 'open' };
    if (s.reason !== undefined) span.reason = s.reason;
    spans.push(span);
    cursor = to;
  }
  if (cursor.getTime() < windowEnd.getTime()) spans.push({ from: cursor, to: windowEnd, state: 'closed' });
  return { placeId: place.id, windowStart, windowEnd, spans };
}

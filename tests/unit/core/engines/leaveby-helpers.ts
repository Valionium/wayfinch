// What the leave-by, wait-or-go and stop-idea tests share: facts built from real opening_hours tags through the real
// preparation, with sun times stubbed. Tests state a place in one line and read the answer.
import { addDaysIso } from '../../../../src/core/answers/time.ts';
import { placeSpans, type RuleClass } from '../../../../src/core/hours/spans.ts';
import type { LeaveFacts } from '../../../../src/core/engines/leaveby.ts';
import { dayRide, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import type { Place, PlaceHours, PlanTomorrow, Position, StoredForecast, Trip, ZoneSpan } from '../../../../src/core/types.ts';
import { at, flatRoute, sun, tap, testTrip, zonesOf } from '../../../fixtures/build.ts';
import { profileOf, spots, type Spot } from './water-helpers.ts';


export const SAT = '2026-10-17';
export const FRI = '2026-10-16';

export function ruleOf(p: Place): RuleClass {
  const shop = p.tags['shop'];
  if (p.kind === 'fuel_shop') return { kind: 'fuel-shop', nearStation: false };
  if (p.kind !== 'shop') return { kind: 'other', nearStation: false };
  if (shop === 'bakery') return { kind: 'bakery', nearStation: false };
  if (shop === 'kiosk') return { kind: 'kiosk', nearStation: false };
  return { kind: 'food-shop', nearStation: false };
}

/** The place's prepared hours from its own tag, as sub-project 5's preparation will make them. */
export function preparedHours(p: Place, tag: string | null = p.openingHours, around = SAT): PlaceHours {
  const windowStart = at(`${addDaysIso(around, -3)} 00:00`);
  const windowEnd = at(`${addDaysIso(around, 10)} 00:00`);
  return { placeId: p.id, windowStart, windowEnd, spans: placeSpans(tag, p, ruleOf(p), windowStart, windowEnd, {}) };
}

export type LeaveCase = {
  trip?: Trip; spots?: Spot[]; positions?: Position[]; now?: string | Date; plan?: PlanTomorrow | null;
  sun?: Parameters<typeof sun>[0]; holidays?: Record<string, string[]>; zones?: ZoneSpan[]; savedKm?: { fromKm: number; toKm: number }[];
  hours?: PlaceHours[]; forecast?: StoredForecast | null; routeEndDate?: string | null;
};

/** A flat trip of one day to `km`, then a long way on, leaving Saturday 17 October at 08:30. */
export const dayTo = (km: number, over: Partial<Trip> = {}, lengthKm = 400, nextStop = km + 100): Trip =>
  testTrip({ route: flatRoute(lengthKm, { stageEnds: [km, nextStop] }), stay: 'accommodation', ...over });

/** Facts for leave-by. By default the evening before the departure date: phase before the trip. */
export function leaveFacts(c: LeaveCase = {}): LeaveFacts {
  const trip = c.trip ?? dayTo(90);
  const now = c.now instanceof Date ? c.now : at(c.now ?? `${FRI} 20:00`);
  const routeZones = c.zones ?? zonesOf(trip.route.lengthKm);
  const stubbed = sun(c.sun ?? {});
  const env = { sun: stubbed, routeZones };
  const positions = c.positions ?? [];
  const ride = dayRide(trip, positions, c.plan ?? null, c.routeEndDate ?? null, now, env);
  const { places, matches } = spots(c.spots ?? []);
  return {
    trip, ride, schedule: scheduleFor(ride, trip, env), sun: stubbed, places, matches,
    hours: c.hours ?? places.map((p) => preparedHours(p, p.openingHours, trip.departureDate ?? SAT)),
    savedKm: c.savedKm ?? [{ fromKm: 0, toKm: trip.route.lengthKm }],
    forecast: c.forecast ?? null, baseline: null, profile: profileOf(), loadSummary: null,
    waterLeft: { litres: 2, at: now, confirmed: true }, positions, now, routeZones, holidays: c.holidays ?? {},
  };
}


/** Seconds on the clock of a date in Berlin, for comparing unrounded times within 1 second (section 6.12). */
export const near = (d: Date | null, text: string): boolean => d !== null && Math.abs(d.getTime() - at(text).getTime()) <= 1000;

/** The setup of section 6.12's cases: two outdoor class A taps, so the water plan adds no limit. */
export const TAPS: Spot[] = [{ b: tap(), km: 1, id: 'n901' }, { b: tap(), km: 2, id: 'n902' }];

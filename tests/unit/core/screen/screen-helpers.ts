// One moment's ScreenInputs, stated in a few words, from the same builders the engine tests use.
import type { Baseline, DayStart, Km, LoadSummary, PlaceHours, PlanTomorrow, Position, Profile, RescuePoint, Roof, ScreenInputs, StoredForecast, SunSource, Trip, ZoneSpan } from '../../../../src/core/types.ts';
import { at, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';
import { profileOf, spots, type Spot } from '../engines/water-helpers.ts';
import { forecastOf, openAllYear, type ForecastOpts, type Spell } from '../engines/weather-helpers.ts';

export type InputCase = {
  trip?: Trip; spots?: Spot[]; roofs?: Roof[]; positions?: Position[]; now?: string; plan?: PlanTomorrow | null; routeEndDate?: string | null; dayStarts?: DayStart[];
  spells?: Spell[]; opts?: ForecastOpts; forecast?: StoredForecast | null; baseline?: Baseline | null; hours?: PlaceHours[]; savedKm?: { fromKm: Km; toKm: Km }[];
  litres?: number | null; profile?: Partial<Profile>; summary?: LoadSummary | null; sun?: SunSource; zones?: ZoneSpan[]; rescuePoints?: RescuePoint[]; holidays?: Record<string, string[]>;
};

/** By default: the standard trip on Saturday 17 October at 14:20, everything saved, open all year, a calm forecast, 2 L confirmed. */
export function inputsOf(c: InputCase = {}): ScreenInputs {
  const trip = c.trip ?? testTrip();
  const nowText = c.now ?? '2026-10-17 14:20';
  const now = at(nowText);
  const { places, matches } = spots(c.spots ?? []);
  const litres = c.litres === undefined ? 2 : c.litres;
  return {
    trip, matches, places, roofs: c.roofs ?? [], hours: c.hours ?? places.map((p) => openAllYear(p.id)), rescuePoints: c.rescuePoints ?? [],
    savedKm: c.savedKm ?? [{ fromKm: 0, toKm: trip.route.lengthKm }],
    forecast: c.forecast === undefined ? forecastOf(trip.route, c.spells ?? [], { fetchedAt: `${nowText.slice(0, 10)} 07:10`, ...c.opts }) : c.forecast,
    baseline: c.baseline ?? null, positions: c.positions ?? [], dayStarts: c.dayStarts ?? [], routeEndDate: c.routeEndDate ?? null, planTomorrow: c.plan ?? null,
    profile: profileOf(c.profile), loadSummary: c.summary ?? null, waterLeft: litres === null ? null : { litres, at: now, confirmed: true },
    settings: { campWaterL: trip.campWaterL, keepFresh: false }, now, sun: c.sun ?? sun(), routeZones: c.zones ?? zonesOf(trip.route.lengthKm),
    holidays: c.holidays ?? {}, demo: null,
  };
}

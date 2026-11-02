// What the weather and stop tests share: a forecast on the route's own grid with spells of weather laid over it, and
// the ride, schedule and day's stops of a moment.
import type { StopFacts } from '../../../../src/core/engines/covers.ts';
import { dayRide, scheduleFor, zoneLookupOf } from '../../../../src/core/engines/tripday.ts';
import { dayStopsOf } from '../../../../src/core/engines/weather-windows.ts';
import type { GridHour, Km, ModelRun, PlaceHours, PlanTomorrow, Position, Roof, Route, StoredForecast, Trip } from '../../../../src/core/types.ts';
import { at, pointAtKm, sun, testTrip, zonesOf } from '../../../fixtures/build.ts';
import { spots, type Spot } from './water-helpers.ts';

export const SAT = '2026-10-17';
export const SUN = '2026-10-18';
const HOUR = 3_600_000;

/** Weather laid over the grid: at these kilometres (a list, or `range`) and these stamps (wall-clock, Berlin). */
export type Spell = { km?: Km | Km[]; range?: [Km, Km]; stamps: string[]; pp?: number | null; mm?: number; code?: number; gustKmh?: number; gustMs?: number; t?: number; windMs?: number; windFrom?: number };

export type ForecastOpts = {
  fetchedAt?: string; from?: string; days?: number; extraKms?: Km[]; has15?: boolean; runs?: ModelRun[];
  rain15?: { km: Km; at: string; mm: number }[]; onlyKms?: Km[]; until?: string;
};

/** Hours stamped from `from`, every hour, for `days` days at every grid kilometre; calm unless a spell says otherwise. */
export function forecastOf(route: Route, spells: Spell[] = [], o: ForecastOpts = {}): StoredForecast {
  const start = at(o.from ?? '2026-10-16 01:00').getTime();
  const last = o.until ? at(o.until).getTime() : start + (o.days ?? 8) * 24 * HOUR;
  const kms = o.onlyKms ?? [...new Set([...route.sampleGrid, ...(o.extraKms ?? [])])].sort((a, b) => a - b);
  const grid = kms.map((km) => {
    const hours: GridHour[] = [];
    for (let t = start; t <= last; t += HOUR) hours.push({ at: new Date(t), t: 12, rh: 60, ghi: 100, pp: 0, mm: 0, code: 0, windMs: 2, windFrom: 180, gustMs: 5 });
    for (const s of spells) {
      const inside = s.range ? km >= s.range[0] && km <= s.range[1] : (Array.isArray(s.km) ? s.km : [s.km]).includes(km);
      if (!inside) continue;
      for (const stamp of s.stamps) {
        const h = hours.find((x) => x.at.getTime() === at(stamp).getTime());
        if (!h) continue;
        if (s.pp !== undefined) h.pp = s.pp;
        if (s.mm !== undefined) h.mm = s.mm;
        if (s.code !== undefined) h.code = s.code;
        if (s.gustKmh !== undefined) h.gustMs = s.gustKmh / 3.6;
        if (s.gustMs !== undefined) h.gustMs = s.gustMs;
        if (s.t !== undefined) h.t = s.t;
        if (s.windMs !== undefined) h.windMs = s.windMs;
        if (s.windFrom !== undefined) h.windFrom = s.windFrom;
      }
    }
    const rain15 = (o.rain15 ?? []).filter((r) => r.km === km).map((r) => ({ at: at(r.at), mm: r.mm }));
    return { km, ...pointAtKm(km), hours, ...(rain15.length > 0 ? { rain15 } : {}) };
  });
  return { fetchedAt: at(o.fetchedAt ?? '2026-10-16 07:10'), runs: o.runs ?? [], grid, has15: o.has15 ?? false };
}

/** Every full hour of a date from `from` to `to`, as stamps. */
export function stamps(date: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let h = from; h <= to; h++) out.push(`${date} ${String(h).padStart(2, '0')}:00`);
  return out;
}

export type Moment = { trip?: Trip; positions?: Position[]; now?: string | Date; plan?: PlanTomorrow | null; country?: string };

/** The ride, schedule and day's stops of a moment. Default: the standard trip, Saturday 08:00, before the ride. */
export function momentOf(c: Moment = {}) {
  const trip = c.trip ?? testTrip();
  const now = c.now instanceof Date ? c.now : at(c.now ?? `${SAT} 08:00`);
  const routeZones = zonesOf(trip.route.lengthKm).map((z) => ({ ...z, country: c.country ?? 'DE' }));
  const env = { sun: sun(), routeZones };
  const positions = c.positions ?? [];
  const ride = dayRide(trip, positions, c.plan ?? null, null, now, env);
  const schedule = scheduleFor(ride, trip, env);
  return { trip, now, routeZones, env, positions, ride, schedule, zone: zoneLookupOf(routeZones), stops: dayStopsOf(schedule, trip.route.lengthKm) };
}

export type StopCase = { spots?: Spot[]; roofs?: Roof[]; spells?: Spell[]; moment?: Moment; opts?: ForecastOpts; forecast?: StoredForecast | null; hours?: PlaceHours[] | 'open'; savedKm?: { fromKm: Km; toKm: Km }[] };

/** Prepared hours open all year, or the stretches given by `hoursOf`. */
export const openAllYear = (id: string): PlaceHours => {
  const windowStart = at('2026-01-01 00:00');
  const windowEnd = at('2027-01-01 00:00');
  return { placeId: id, windowStart, windowEnd, spans: [{ from: windowStart, to: windowEnd, state: 'open' }] };
};

/** Facts for covers, plans and the chip. Places are open all year unless `hours` says otherwise. */
export function stopFactsOf(c: StopCase = {}): StopFacts {
  const m = momentOf(c.moment ?? {});
  const { places, matches } = spots(c.spots ?? []);
  return {
    trip: m.trip, places, matches, roofs: c.roofs ?? [],
    hours: c.hours === undefined || c.hours === 'open' ? places.map((p) => openAllYear(p.id)) : c.hours,
    savedKm: c.savedKm ?? [{ fromKm: 0, toKm: m.trip.route.lengthKm }],
    forecast: c.forecast === undefined ? forecastOf(m.trip.route, c.spells ?? [], c.opts ?? {}) : c.forecast,
    positions: m.positions, now: m.now, routeZones: m.routeZones, sun: m.env.sun, ride: m.ride, schedule: m.schedule,
  };
}

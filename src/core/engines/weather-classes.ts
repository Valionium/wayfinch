// Rain classes, hour stamps, detail by range and the models that matter (spec section 6.6). Pure lookups on one hour or
// one date. Country codes are looked up in Maps, so no value can reach an object's prototype.
import type { GridHour } from '../types.ts';
import type { LatLng } from '../geo/haversine.ts';

export type HourClass = {
  cls: 'likely' | 'possible' | 'unlikely'; heavy: boolean; showers: boolean; thunder: boolean;
  /** Whether chance, amount and code are all real figures. An hour that isn't known says nothing calm: see the callers. */
  known: boolean;
};

const HOUR = 3_600_000;
const LIKELY_PCT = 50;
const POSSIBLE_PCT = 20;
const HEAVY_MM = 2.5;
const THUNDER_CODES: ReadonlySet<number> = new Set([95, 96, 97, 99]);
const SHOWER_CODES: ReadonlySet<number> = new Set([80, 81, 82]);

export function hourClass(h: GridHour): HourClass {
  const pp = h.pp;
  const chanceKnown = typeof pp === 'number' && pp >= 0 && pp <= 100; // written so that NaN fails
  const cls = !chanceKnown ? 'unlikely' : pp >= LIKELY_PCT ? 'likely' : pp >= POSSIBLE_PCT ? 'possible' : 'unlikely';
  return {
    cls, heavy: h.mm >= HEAVY_MM, showers: SHOWER_CODES.has(h.code), thunder: THUNDER_CODES.has(h.code),
    known: chanceKnown && h.mm >= 0 && h.mm < Infinity && Number.isFinite(h.code),
  };
}

/** The hour a stamp stands for: the hour ending at it. Also for a code, when it marks a rain class. */
export const coversHour = (stamp: Date): { from: Date; to: Date } => ({ from: new Date(stamp.getTime() - HOUR), to: stamp });

const HALF_HOUR_DETAIL_H = 48;
const DAY_PART_DETAIL_H = 5 * 24;
const FORECAST_H = 16 * 24; // the longest forecast the request asks for

/** How finely a time may be told. An invalid date gets the coarsest answer. */
export function detailFor(at: Date, fetchedAt: Date): '30min' | 'daypart' | 'trend' | 'seasonal' {
  const h = (at.getTime() - fetchedAt.getTime()) / HOUR;
  if (h <= HALF_HOUR_DETAIL_H) return '30min'; // NaN fails each of these
  if (h <= DAY_PART_DETAIL_H) return 'daypart';
  return h <= FORECAST_H ? 'trend' : 'seasonal';
}

const ICON_D2 = 'ICON-D2';
const AROME_FRANCE = 'AROME France HD';
const KNMI = 'KNMI HARMONIE-AROME';
const MET_NORDIC = 'MET Nordic';
const DMI = 'DMI HARMONIE-AROME';
const POLAND_SPLIT_LON = 20.3;

const MODELS = new Map<string, string[]>([
  ['DE', [ICON_D2]], ['CZ', [ICON_D2]], ['AT', [ICON_D2]], ['CH', [ICON_D2]],
  ['FR', [ICON_D2, AROME_FRANCE]],
  ['NL', [KNMI]], ['BE', [KNMI]], ['LU', [KNMI]],
  ['DK', [MET_NORDIC]],
]);

const modelsAt = (country: string, lon: number): string[] => {
  if (country !== 'PL') return MODELS.get(country) ?? [];
  if (!Number.isFinite(lon)) return [];
  return lon < POLAND_SPLIT_LON ? [ICON_D2] : [DMI];
};

/** The models that matter for a route, each once, in route order. A country outside the table adds none. */
export function modelsForRoute(routePoints: LatLng[], country: (p: LatLng) => string): string[] {
  const out = new Set<string>();
  for (const p of routePoints) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    for (const model of modelsAt(country(p), p.lon)) out.add(model);
  }
  return [...out];
}

const ICON_D2_ONLY_H = 48;
const FRANCE_H = 6;

/** How many hours after the fetch a point's 15-minute rain comes from a model that makes it. 0: none does. */
export function fifteenMinuteHours(country: string, lon: number): number {
  if (country === 'FR') return FRANCE_H;
  const models = modelsAt(country, lon);
  return models.length === 1 && models[0] === ICON_D2 ? ICON_D2_ONLY_H : 0;
}

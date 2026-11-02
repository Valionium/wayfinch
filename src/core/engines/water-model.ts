// The sweat-rate model (spec section 6.3, "WaterNeed v1"): the heat a rider has to get rid of, turned into litres per
// hour. Pure arithmetic: a non-finite input stays non-finite here (Math.max keeps NaN), so the Water card can see it and
// refuse to answer, instead of a broken number reading as "no water needed".
import { localIsoDate } from '../answers/time.ts';
import type { Baseline, GridHour, Km, LoadSummary, LoadSummaryFull, Profile, Route, StoredForecast } from '../types.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { solarElevationDeg } from './daylight.ts';

export type Section = { hours: number; powerW: number; planT: number; rhPct: number; airflow: number; ghi: number; day: boolean; elevM: number };

const LITRES_PER_KWH = 1.484;
const GROSS_HEAT = 4; // 4 x P: a gross efficiency of 0.20
const REST_W_PER_KG = 1.2;
const MOVING_FLOOR = 0.25;
const STOP_FLOOR_SHARE = 0.5;
const ALTITUDE_FROM_M = 2000;
const ALTITUDE_ADD = 0.03;
const SUN_AREA = 0.18;

const satVpKpa = (t: number): number => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
const surfaceArea = (bodyKg: number): number => 1.9 * (bodyKg / 75) ** 0.425;
const clamp01 = (x: number): number => (x !== x ? x : Math.min(1, Math.max(0, x)));

/** SR_model in L/h. `planT` already holds any margin. Riding has the 0.25 L/h floor, a stop 0.5 x H / 1000. */
export function sweatRate(s: Omit<Section, 'hours'>, bodyKg: number, moving: boolean): number {
  const heat = Math.max(GROSS_HEAT * s.powerW, REST_W_PER_KG * bodyKg);
  const v = s.airflow;
  const kDry = 0.54 * surfaceArea(bodyKg) * (8.3 * v ** 0.6 + 4.7);
  const sun = SUN_AREA * s.ghi * (s.day ? 1 : 0);
  const eReq = heat - kDry * (35 - s.planT) + sun;
  const vapour = (s.rhPct / 100) * satVpKpa(s.planT);
  const beta = 0.25 - 0.20 * clamp01((v - 1) / 3.5);
  const humidity = 1 + beta * Math.max(0, vapour - 1.5);
  const floor = moving ? MOVING_FLOOR : (STOP_FLOOR_SHARE * heat) / 1000;
  return Math.max(floor, ((LITRES_PER_KWH * eReq) / 1000) * humidity) + (s.elevM > ALTITUDE_FROM_M ? ALTITUDE_ADD : 0);
}

/** The stop rate: P = 0, so H is the resting heat, at 1 m/s and the stop floor, at the section's temperature and sun. */
export const stopRate = (s: Section, bodyKg: number): number => sweatRate({ ...s, powerW: 0, airflow: 1 }, bodyKg, false);

const AIR_DENSITY = 1.225; // sea level: the air is thinner higher up, so this never understates the work
const CDA = 0.5;
const CRR = 0.007;
const G = 9.81;
const DRIVETRAIN = 0.97;

/** Rider power in W at a ground speed and gradient (rise over run). Never below 0. */
export function riderPower(o: { totalKg: number; speedMs: number; grade: number }): number {
  const { totalKg: m, speedMs: v, grade } = o;
  const slope = Math.hypot(1, grade);
  const drag = 0.5 * AIR_DENSITY * CDA * v ** 3;
  const rolling = (CRR * m * G * v) / slope;
  const climbing = (m * G * v * grade) / slope;
  return Math.max(0, (drag + rolling + climbing) / DRIVETRAIN);
}

const usable = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const isFull = (s: LoadSummary | null): s is LoadSummaryFull => s !== null && !('empty' in s);

/** Rider, load and bike. A broken figure is treated as absent, so the model always has real masses. */
export function masses(profile: Profile, summary: LoadSummary | null): { riderKg: number; loadKg: number; bikeKg: number } {
  const riderKg = usable(profile.weightKg) ? profile.weightKg : 75;
  if (!isFull(summary)) return { riderKg, loadKg: 10, bikeKg: 15 };
  const { carriedKg, emptyLuggageKg, bikeKg } = summary.weight;
  const luggage = usable(emptyLuggageKg) ? emptyLuggageKg : 0;
  return { riderKg, loadKg: Number.isFinite(carriedKg) && carriedKg >= 0 ? carriedKg + luggage : 10, bikeKg: usable(bikeKg) ? bikeKg : 15 };
}

/** Capacity C: the summary total when it is a positive number, else "Water you can carry", else none. */
export function capacityFrom(profile: Profile, summary: LoadSummary | null): number | null {
  if (isFull(summary) && usable(summary.water.totalL)) return summary.water.totalL;
  return usable(profile.capacityL) ? profile.capacityL : null;
}

const MARGIN_C = 1;
const LAPSE_PER_M = 0.65 / 100;
const HOUR = 3_600_000;

/** Temperature moved between two heights at 0.65 °C per 100 m; 0 when either is unknown. */
export const lapse = (fromEleM: number | null, toEleM: number | null): number =>
  fromEleM === null || toEleM === null ? 0 : (fromEleM - toEleM) * LAPSE_PER_M;

/** The route's height at a kilometre, linear between its points. Null where a neighbouring point has none. */
export function routeHeight(route: Route, km: Km): number | null {
  const pts = route.points;
  if (pts.length === 0) return null;
  let lo = 0;
  let hi = pts.length - 1;
  if (km <= pts[lo]!.km) return pts[lo]!.ele;
  if (km >= pts[hi]!.km) return pts[hi]!.ele;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.km <= km) lo = mid; else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[hi]!;
  if (a.ele === null || b.ele === null) return null;
  const f = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
  return a.ele + (b.ele - a.ele) * f;
}

/** Clear-sky radiation from the sun's elevation (Haurwitz 1945). 0 with the sun down. */
function clearSky(at: Date, lat: number, lon: number): number {
  const sinH = Math.sin((solarElevationDeg(at, lat, lon) * Math.PI) / 180);
  return sinH > 0 ? 1098 * sinH * Math.exp(-0.057 / sinH) : 0;
}

const goodHour = (h: GridHour): boolean => Number.isFinite(h.t) && Number.isFinite(h.rh) && Number.isFinite(h.ghi);

const first = <T>(list: T[], better: (a: T, b: T) => boolean): T | null => {
  let best: T | null = null;
  for (const x of list) if (best === null || better(x, best)) best = x;
  return best;
};

export type PlanningWeather = {
  planT: number; rhPct: number; ghi: number; label: 'forecast' | 'seasonal' | 'assumed-hot';
  windMs: number | null; windFrom: number | null;
};

/** What the forecast says for this kilometre and moment, or null beyond its range or where a figure is broken. */
function fromForecast(forecast: StoredForecast | null, km: Km, at: Date, route: Route): PlanningWeather | null {
  const point = first(forecast?.grid.filter((g) => g.hours.length > 0) ?? [], (a, b) => Math.abs(a.km - km) < Math.abs(b.km - km));
  if (!point) return null;
  const t = at.getTime();
  const hours = point.hours;
  // Radiation stamped 15:00 covers 14:00-15:00, so the first stamp at or after the moment covers it.
  const covering = hours.find((h) => h.at.getTime() >= t);
  if (!covering || t < covering.at.getTime() - HOUR) return null;
  const nearest = first(hours, (a, b) => Math.abs(a.at.getTime() - t) < Math.abs(b.at.getTime() - t))!;
  if (!goodHour(covering) || !goodHour(nearest)) return null;
  return {
    planT: nearest.t + MARGIN_C + lapse(routeHeight(route, point.km), routeHeight(route, km)),
    rhPct: nearest.rh, ghi: Math.max(0, covering.ghi), label: 'forecast',
    windMs: Number.isFinite(nearest.windMs) ? nearest.windMs : null, windFrom: Number.isFinite(nearest.windFrom) ? nearest.windFrom : null,
  };
}

/**
 * The weather the water engine plans with. `planT` is forecast + 1 °C at the section's height; the forecast itself and
 * every shown temperature stay raw. Beyond the forecast: the baseline's 90th-percentile high + 1 °C, 50% RH, clear sky.
 * With neither: 30 °C, 50%, clear sky. Takes the route and zone besides the plan's four arguments: the height, the
 * sun's position and the month need them.
 */
export function planningWeather(forecast: StoredForecast | null, baseline: Baseline | null, km: Km, at: Date, where: { route: Route; timeZone: string }): PlanningWeather {
  const told = fromForecast(forecast, km, at, where.route);
  if (told) return told;
  const { lat, lon } = pointAtRouteKm(where.route, km);
  const month = Number(localIsoDate(at, where.timeZone).slice(5, 7));
  const points = baseline?.points.filter((p) => p.month === month && Number.isFinite(p.p90HighC)) ?? [];
  const seasonal = first(points, (a, b) => Math.abs(a.km - km) < Math.abs(b.km - km));
  const ghi = clearSky(at, lat, lon);
  if (seasonal) {
    return { planT: seasonal.p90HighC + MARGIN_C + lapse(seasonal.eleM, routeHeight(where.route, km)), rhPct: 50, ghi, label: 'seasonal', windMs: null, windFrom: null };
  }
  return { planT: 30, rhPct: 50, ghi, label: 'assumed-hot', windMs: null, windFrom: null };
}

/** Whether results must be labelled "outside the validated range". Written so that a non-finite input reads as outside. */
export const outsideRange = (o: { planT: number; elevM: number; ridingHours: number }): boolean =>
  !(o.planT <= 40 && o.planT >= 0 && o.elevM <= 3000 && o.ridingHours <= 12);

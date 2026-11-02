// What the tyre screen knows (its own stored details, the bike, the bag plan, You) turned into one TyreInput, with where each value came from.
// Pure: the screen renders this and computes nothing itself.
import type { Bars, Casing, Limit, Pos, RimType, Setup, Surface, TyreInput } from './core.ts';

/** The tyre tool's own details for one bike. Every field is optional: "not set" falls back to the bike, the plan, You, then an assumption. */
export interface Details {
  bars?: Bars;
  wheelBsdMm?: number;
  frontMm?: number;
  rearMm?: number;
  caliperFrontMm?: number | null;
  caliperRearMm?: number | null;
  casing?: Casing;
  setup?: Setup;
  rimType?: RimType;
  rimInnerMm?: number;
  surface?: Surface;
  wet?: boolean;
  tyreMax?: Limit;
  tyreMin?: Limit | null;
  rimMax?: Limit | null;
  riderKg?: number;
  bikeKg?: number;
  carriedKg?: number;
  measured?: { frontKg: number; rearKg: number } | null;
}

/** What Load Check's bike record holds, read-only. */
export interface BikeInfo {
  id: string;
  name: string;
  bars?: Bars;
  wheelBsdMm?: number;
  frontMm?: number;
  rearMm?: number;
  rimInnerMm?: number;
  rimType?: RimType;
  setup?: Setup;
  casing?: Casing;
  bikeKg?: number;
}

/** The parts of Contract 1 this tool reads. */
export interface SummaryInfo {
  at: string;
  bikeId: string | null;
  bagCount: number;
  carriedKg: number;
  bikeKg: number | null;
  emptyLuggageKg: number | null;
  byPositionKg: Partial<Record<Pos, number>>;
  unplacedKg: number;
}

export interface Context {
  /** From You. */
  riderKg: number | null;
  summary: SummaryInfo | null;
  /** The chosen bike, or null for none. */
  bike: BikeInfo | null;
}

export type Source = 'entered' | 'bike' | 'plan' | 'you' | 'assumed';
export type FieldName =
  | 'bars' | 'wheelBsdMm' | 'frontMm' | 'rearMm' | 'casing' | 'setup' | 'rimType' | 'rimInnerMm' | 'surface'
  | 'riderKg' | 'bikeKg' | 'carriedKg';

export const ASSUMED = {
  bars: 'drop', wheelBsdMm: 622, frontMm: 32, rearMm: 32, casing: 'standard', setup: 'butyl', rimType: 'hooked', rimInnerMm: 19,
  surface: 'paved', riderKg: 75, bikeKg: 14,
} as const;

/** Every value the calculation will use, whether or not the required limit is there yet. */
export type Values = Omit<TyreInput, 'tyreMax' | 'tyreMin' | 'rimMax'>;

export interface Resolved {
  values: Values;
  /** Null while the sidewall maximum is missing: the one required field. */
  input: TyreInput | null;
  missing: 'tyreMax' | null;
  sources: Record<FieldName, Source>;
  /** Fields that fell back to an assumption, for the notice under the figures. */
  assumed: FieldName[];
}

export function resolve(d: Details, ctx: Context): Resolved {
  const bike = ctx.bike;
  const sum = ctx.summary;
  const sources = {} as Record<FieldName, Source>;
  const pick = <K extends 'bars' | 'wheelBsdMm' | 'frontMm' | 'rearMm' | 'casing' | 'setup' | 'rimType' | 'rimInnerMm' | 'surface'>(
    name: K,
    entered: Details[K],
    fromBike: Details[K],
  ): NonNullable<Details[K]> => {
    if (entered !== undefined && entered !== null) { sources[name] = 'entered'; return entered as NonNullable<Details[K]>; }
    if (fromBike !== undefined && fromBike !== null) { sources[name] = 'bike'; return fromBike as NonNullable<Details[K]>; }
    sources[name] = 'assumed';
    return ASSUMED[name] as NonNullable<Details[K]>;
  };
  const bars = pick('bars', d.bars, bike?.bars);
  const wheelBsdMm = pick('wheelBsdMm', d.wheelBsdMm, bike?.wheelBsdMm);
  const frontMm = pick('frontMm', d.frontMm, bike?.frontMm);
  // A rear width nobody set follows the front: one tyre size is by far the usual case.
  let rearMm = frontMm;
  if ((d.rearMm ?? bike?.rearMm) !== undefined) rearMm = pick('rearMm', d.rearMm, bike?.rearMm);
  else sources.rearMm = sources.frontMm;
  const casing = pick('casing', d.casing, bike?.casing);
  const setup = pick('setup', d.setup, bike?.setup);
  const rimType = pick('rimType', d.rimType, bike?.rimType);
  const rimInnerMm = pick('rimInnerMm', d.rimInnerMm, bike?.rimInnerMm);
  const surface = pick('surface', d.surface, undefined);

  let riderKg: number;
  if (d.riderKg !== undefined) { riderKg = d.riderKg; sources.riderKg = 'entered'; }
  else if (ctx.riderKg !== null) { riderKg = ctx.riderKg; sources.riderKg = 'you'; }
  else { riderKg = ASSUMED.riderKg; sources.riderKg = 'assumed'; }

  let bikeKg: number;
  if (d.bikeKg !== undefined) { bikeKg = d.bikeKg; sources.bikeKg = 'entered'; }
  else if (sum?.bikeKg != null) { bikeKg = sum.bikeKg; sources.bikeKg = 'plan'; }
  else if (bike?.bikeKg !== undefined) { bikeKg = bike.bikeKg; sources.bikeKg = 'bike'; }
  else { bikeKg = ASSUMED.bikeKg; sources.bikeKg = 'assumed'; }

  // The load: the plan's positions when the plan is used as it is; an entered load has no positions, so the default split applies.
  let load: TyreInput['load'];
  if (d.carriedKg !== undefined) {
    load = { byPositionKg: null, unplacedKg: d.carriedKg, emptyLuggageKg: null };
    sources.carriedKg = 'entered';
  } else if (sum) {
    load = { byPositionKg: sum.byPositionKg, unplacedKg: sum.unplacedKg, emptyLuggageKg: sum.emptyLuggageKg };
    sources.carriedKg = 'plan';
  } else {
    load = { byPositionKg: null, unplacedKg: 0, emptyLuggageKg: null };
    sources.carriedKg = 'assumed';
  }

  const assumed = (Object.keys(sources) as FieldName[]).filter((k) => sources[k] === 'assumed' && k !== 'carriedKg');
  const values: Values = {
    riderKg, bikeKg, load,
    measured: d.measured ?? null,
    bars,
    front: { printedMm: frontMm, caliperMm: d.caliperFrontMm ?? null },
    rear: { printedMm: rearMm, caliperMm: d.caliperRearMm ?? null },
    casing, setup, rimType, rimInnerMm, wheelBsdMm, surface,
    wet: d.wet ?? false,
  };
  if (!d.tyreMax) return { values, input: null, missing: 'tyreMax', sources, assumed };
  const input: TyreInput = { ...values, tyreMax: d.tyreMax, tyreMin: d.tyreMin ?? null, rimMax: d.rimMax ?? null };
  return { values, input, missing: null, sources, assumed };
}

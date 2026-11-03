// The tyre pressure estimate (spec section 7.2). Pure: no clock, no storage, no DOM. Its basis is Frank Berto's published 15% tyre-drop
// data, fitted as a power law. It never exceeds a limit, and it never takes a formula from SRAM, SILCA or Rene Herse.
import { W } from '../../core/wording/en.ts';
import {
  BAR_PER_PSI, DEFAULT_SPLIT, DESIGN_WIDTHS, ETRTO_MIN, FIT_MAX_MM, FIT_MIN_MM, HOOKLESS_CAPS, HOOKLESS_MAX_BAR, LEVER,
  LIMIT_BAR, LIMIT_PSI, P15_COEFFICIENT, P15_EXPONENT, PSI_PER_BAR, RIM_MAX_MM, RIM_MIN_MM, WHEELS, WIDTH_MAX_MM, WIDTH_MIN_MM,
} from './tables.ts';
import type { Pos } from './tables.ts';

export type { Pos } from './tables.ts';
export type Unit = 'bar' | 'psi';
export type Casing = 'supple' | 'standard' | 'reinforced';
export type Setup = 'butyl' | 'latex' | 'tpu' | 'tubeless';
export type RimType = 'hooked' | 'hookless' | 'tubular';
export type Surface = 'paved' | 'rough' | 'unpaved';
export type Bars = 'drop' | 'flat' | 'other';
export interface Limit { value: number; unit: Unit }
/** `assumed`: the width was not given and a stand-in is used, so only a limit that does not depend on it may rest on it. */
export interface TyreSize { printedMm: number; caliperMm: number | null; assumed?: boolean }

/** Every input, stated. A case never leans on a default from the bike. */
/** Where and when the rider pumps, and the worst the trip brings: temperatures in Celsius, heights in metres. */
export interface HeatInput { pumpC: number; maxC: number; pumpHeightM: number; highestM: number }

export interface TyreInput {
  riderKg: number;
  bikeKg: number;
  /** `byPositionKg` null: no bag plan, the carried load is `unplacedKg`. `emptyLuggageKg` is added at the rack. */
  load: { byPositionKg: Partial<Record<Pos, number>> | null; unplacedKg: number; emptyLuggageKg: number | null };
  measured: { frontKg: number; rearKg: number } | null;
  bars: Bars;
  front: TyreSize;
  rear: TyreSize;
  casing: Casing;
  setup: Setup;
  /** 'unset': the rider has not said, and the limits are those of a hookless rim. */
  rimType: RimType | 'unset';
  rimInnerMm: number;
  wheelBsdMm: number;
  surface: Surface;
  wet: boolean;
  tyreMax: Limit;
  tyreMin: Limit | null;
  rimMax: Limit | null;
  /** Optional: with it, the heat and altitude headroom is worked out. */
  heat?: HeatInput | null;
}

export type LimitKind = 'tyre-max' | 'rim-max' | 'hookless-5' | 'hookless-width' | 'tube-floor' | 'iso-floor';

export interface WheelHeat {
  /** The most the gauge should read when pumping, so that the warmest, highest moment of the trip stays at or under the cap. */
  p1MaxBar: number;
  /** True when that is below the suggestion. */
  advise: boolean;
  pumpToBar: number;
  pumpToPsi: number;
}

export interface Wheel {
  /** Shown values, rounded inward: bar in 0.05 steps, psi in 1 psi steps. */
  bar: number;
  psi: number;
  /** The estimate after the limits, before rounding. */
  estimate: number;
  /** The 15% law with its modifiers, before any limit. */
  raw: number;
  windowBar: [number, number];
  windowPsi: [number, number];
  capped: boolean;
  raised: boolean;
  /** What decided the number, when a limit did. */
  limit: LimitKind | null;
  capBar: number;
  floorBar: number | null;
  loadKg: number;
  wEffMm: number;
  heat: WheelHeat | null;
}

export interface Split { share: number; source: 'measured' | 'lever' | 'default'; why: string }

export interface WarningItem { code: string; text: string }

export interface TyreResult {
  front: Wheel | null;
  rear: Wheel | null;
  split: Split | null;
  decided: string[];
  warnings: string[];
  warningCodes: string[];
  warningItems: WarningItem[];
  /** The limits of a hookless rim apply and a tyre width is not given: no figure until it is. */
  needsWidth: boolean;
  incompatible: boolean;
  /** Why no figure is shown, in words. Empty when there is one. */
  refused: string[];
}

// ---- units ---------------------------------------------------------------------------------------------------------------------

export const barToPsi = (bar: number): number => bar * PSI_PER_BAR;
export const psiToBar = (psi: number): number => psi * BAR_PER_PSI;
const limitBar = (l: Limit): number => (l.unit === 'bar' ? l.value : psiToBar(l.value));
const limitIn = (l: Limit, unit: Unit): number => (l.unit === unit ? l.value : unit === 'bar' ? psiToBar(l.value) : barToPsi(l.value));
const bar2 = (n: number): string => n.toFixed(2);
const fmt = (n: number, digits = 1): string => String(Number(n.toFixed(digits)));

// ---- rounding inward -----------------------------------------------------------------------------------------------------------

const decimalsOf = (step: number): number => (String(step).split('.')[1] ?? '').length;
const fix = (n: number, step: number): number => Number(n.toFixed(decimalsOf(step)));

/** The largest multiple of `step` that is not above `x` (exact comparison, no tolerance that could pass a limit). */
function stepDown(x: number, step: number): number {
  let n = Math.floor(x / step);
  while (fix((n + 1) * step, step) <= x) n++;
  while (n > -1000 && fix(n * step, step) > x) n--;
  return fix(n * step, step);
}
/** The smallest multiple of `step` that is not below `x`. */
function stepUp(x: number, step: number): number {
  let n = Math.ceil(x / step);
  while (n > -1000 && fix((n - 1) * step, step) >= x) n--;
  while (fix(n * step, step) < x) n++;
  return fix(n * step, step);
}

/** Down to the step ("err low"); a value that would then fall below a floor goes up to the first step at or above it. Never above `cap`. */
export function roundInward(value: number, o: { step: number; floor: number | null; cap: number }): number {
  let v = stepDown(Math.min(value, o.cap), o.step);
  if (o.floor !== null && v < o.floor) v = stepUp(o.floor, o.step);
  if (v > o.cap) v = stepDown(o.cap, o.step);
  return v;
}

// ---- the parts of the method ---------------------------------------------------------------------------------------------------

export function designWidth(printedMm: number): number | null {
  if (!Number.isFinite(printedMm) || printedMm < WIDTH_MIN_MM || printedMm > WIDTH_MAX_MM) return null;
  const mm = Math.round(printedMm);
  return DESIGN_WIDTHS.find(([lo, hi]) => mm >= lo && mm <= hi)?.[2] ?? null;
}

/** W_eff = printed + 0.4 x (rim inner width - design width). Null for a printed width outside the table. */
export function effectiveWidth(printedMm: number, rimInnerMm: number): number | null {
  const d = designWidth(printedMm);
  return d === null ? null : printedMm + 0.4 * (rimInnerMm - d);
}

/** P15 [bar] = 31.2 x L / W_eff^1.694. */
export const p15 = (loadKg: number, wEffMm: number): number => (P15_COEFFICIENT * loadKg) / wEffMm ** P15_EXPONENT;

export const wheelFactor = (wEffMm: number, bsdMm: number): number => Math.sqrt((311 + wEffMm) / (bsdMm / 2 + wEffMm));

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const surfaceG = (wEffMm: number): number =>
  wEffMm < 50 ? clamp(0.68 + 0.021 * (wEffMm - 30), 0.68, 0.92) : Math.min(1, 0.92 + 0.008 * (wEffMm - 50));

export function surfaceFactor(surface: Surface, wEffMm: number, withTube: boolean): number {
  if (surface === 'paved') return 1;
  const g = surfaceG(wEffMm);
  const f = surface === 'rough' ? (1 + g) / 2 : g;
  return withTube ? Math.min(1, f + 0.1) : f;
}

const casingFactor = (c: Casing): number => (c === 'supple' ? 1.05 : 1);

export interface Leverage {
  riderKg: number;
  bikeKg: number;
  byPositionKg: Partial<Record<Pos, number>>;
  emptyLuggageKg: number | null;
  bars: Bars;
}

/** Front load = s0 x (rider + bike + backpack) + the sum of a_i x mass_i; the rest is the rear. */
export function leverSplit(l: Leverage): { frontKg: number; rearKg: number; share: number } {
  const s0 = DEFAULT_SPLIT[l.bars];
  const pos = l.byPositionKg;
  const pack = pos.pack ?? 0;
  let front = s0 * (l.riderKg + l.bikeKg + pack);
  let total = l.riderKg + l.bikeKg + pack;
  for (const key of Object.keys(LEVER) as (keyof typeof LEVER)[]) {
    const m = pos[key] ?? 0;
    front += LEVER[key] * m;
    total += m;
  }
  const luggage = l.emptyLuggageKg ?? 0; // at the rack, factor 0.0
  total += luggage;
  return { frontKg: front, rearKg: total - front, share: total > 0 ? front / total : s0 };
}

function chooseSplit(i: TyreInput): { frontKg: number; rearKg: number; split: Split } {
  if (i.measured) {
    const total = i.measured.frontKg + i.measured.rearKg;
    return { frontKg: i.measured.frontKg, rearKg: i.measured.rearKg, split: { share: i.measured.frontKg / total, source: 'measured', why: W.tyreWhyMeasured } };
  }
  const placed = i.load.byPositionKg;
  if (placed && i.load.unplacedKg <= 0) {
    const s = leverSplit({ riderKg: i.riderKg, bikeKg: i.bikeKg, byPositionKg: placed, emptyLuggageKg: i.load.emptyLuggageKg, bars: i.bars });
    return { frontKg: s.frontKg, rearKg: s.rearKg, split: { share: s.share, source: 'lever', why: W.tyreWhyLever } };
  }
  const total = i.riderKg + i.bikeKg + i.load.unplacedKg + (i.load.emptyLuggageKg ?? 0) + Object.values(placed ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const s0 = DEFAULT_SPLIT[i.bars];
  return {
    frontKg: s0 * total,
    rearKg: total - s0 * total,
    split: { share: s0, source: 'default', why: placed && i.load.unplacedKg > 0 ? W.tyreWhyDefaultUnplaced : W.tyreWhyDefaultNoPlan },
  };
}

/** The hookless cap by PRINTED width; a width between two whole millimetres takes the lower row. Null outside the table. */
export function hooklessCapBar(printedMm: number): number | null {
  const mm = Math.ceil(printedMm);
  return HOOKLESS_CAPS.find(([lo, hi]) => mm >= lo && mm <= hi)?.[2] ?? null;
}

/** The ETRTO minimum tyre width for a rim, or null where the table ends (rims over 35 mm). A fractional width takes the stricter row. */
export function etrtoMinWidth(rimInnerMm: number): number | null {
  const iw = Math.ceil(rimInnerMm);
  return ETRTO_MIN.find(([upTo]) => iw <= upTo)?.[1] ?? null;
}

// ---- typing a limit ------------------------------------------------------------------------------------------------------------

export type LimitCheck =
  | { status: 'ok'; limit: Limit }
  | { status: 'ask'; question: string; asPsi: Limit; alt: Limit }
  | { status: 'rejected'; reason: string };

/**
 * A limit as typed. A bar value above 10 is first queried as a likely psi value; a maximum still above 11 bar (160 psi) after that, or
 * below the minimum, is rejected. `keepAsBar` is the rider's answer "no, bar".
 */
export function checkLimit(value: number, unit: Unit, o: { keepAsBar?: boolean; keepAsPsi?: boolean; min?: Limit | null }): LimitCheck {
  if (!Number.isFinite(value) || value <= 0) return { status: 'rejected', reason: W.tyreLimitNotNumber };
  if (unit === 'bar' && value > LIMIT_BAR.queryAbove && !o.keepAsBar) {
    return { status: 'ask', question: W.tyreDidYouMean(String(value)), asPsi: { value, unit: 'psi' }, alt: { value, unit: 'psi' } };
  }
  // The other way round: a number that small in psi is far likelier to be bar.
  if (unit === 'psi' && value < LIMIT_PSI.queryBelow && !o.keepAsPsi) {
    return { status: 'ask', question: W.tyreDidYouMeanBar(String(value)), asPsi: { value, unit: 'psi' }, alt: { value, unit: 'bar' } };
  }
  if (unit === 'bar' && value > LIMIT_BAR.max) return { status: 'rejected', reason: W.tyreLimitTooHighBar(String(value)) };
  if (unit === 'psi' && value > LIMIT_PSI.max) return { status: 'rejected', reason: W.tyreLimitTooHighPsi(String(value)) };
  if (limitBar({ value, unit }) < LIMIT_BAR.min) return { status: 'rejected', reason: W.tyreLimitTooLow };
  if (o.min && limitBar({ value, unit }) < limitBar(o.min)) return { status: 'rejected', reason: W.tyreLimitBelowMin };
  return { status: 'ok', limit: { value, unit } };
}

/** A limit that could be a tyre pressure in its unit (the typing flow, `checkLimit`, asks and rejects with words; this is the plain test). */
export const limitUsable = (l: Limit): boolean => {
  if (!Number.isFinite(l.value) || l.value <= 0) return false;
  return l.unit === 'bar' ? l.value >= LIMIT_BAR.min && l.value <= LIMIT_BAR.max : l.value >= LIMIT_PSI.min && l.value <= LIMIT_PSI.max;
};

// ---- heat and altitude helpers (the advice itself is in the extras) ------------------------------------------------------------

const KELVIN = 273.15;
/** Standard air pressure at a height [bar], from the international standard atmosphere. */
export function isaPressureBar(heightM: number): number {
  const h = clamp(heightM, -500, 9000);
  return 1.01325 * (1 - 2.25577e-5 * h) ** 5.25588;
}

/** The gauge pressure after the air warms (or cools) and the air outside changes: P2 = (P1 + p_atm1) x T2/T1 - p_atm2, T in kelvin. */
export function heatedGaugeBar(o: { gaugeBar: number; fromC: number; toC: number; atmFromBar: number; atmToBar: number }): number {
  return ((o.gaugeBar + o.atmFromBar) * (o.toC + KELVIN)) / (o.fromC + KELVIN) - o.atmToBar;
}

/** How much the gauge reads more after climbing from one height to another, at the same temperature. */
export const altitudeShiftBar = (fromM: number, toM: number): number => isaPressureBar(fromM) - isaPressureBar(toM);

/** P1_max = (cap + p_atm2) x T1/T2 - p_atm1, temperatures in kelvin: how high the gauge may read where the rider pumps. */
export function pumpLimit(o: { capBar: number; pumpC: number; maxC: number; pumpHeightM: number; highestM: number }): { p1MaxBar: number; atm1Bar: number; atm2Bar: number } {
  const atm1Bar = isaPressureBar(o.pumpHeightM);
  const atm2Bar = isaPressureBar(o.highestM);
  const p1MaxBar = ((o.capBar + atm2Bar) * (o.pumpC + KELVIN)) / (o.maxC + KELVIN) - atm1Bar;
  return { p1MaxBar, atm1Bar, atm2Bar };
}

// ---- the estimate --------------------------------------------------------------------------------------------------------------

interface Cap { kind: LimitKind; limit: Limit | null; bar: number }

function validate(i: TyreInput): string[] {
  const out: string[] = [];
  const finitePositive = (n: number, lo: number, hi: number): boolean => Number.isFinite(n) && n >= lo && n <= hi;
  if (!finitePositive(i.riderKg, 20, 350)) out.push(W.tyreRefuseNumber(W.tyreWhatRider));
  if (!finitePositive(i.bikeKg, 1, 150)) out.push(W.tyreRefuseNumber(W.tyreWhatBike));
  const loads = [i.load.unplacedKg, i.load.emptyLuggageKg ?? 0, ...Object.values(i.load.byPositionKg ?? {}).map((n) => n ?? 0)];
  if (!loads.every((n) => finitePositive(n, 0, 300))) out.push(W.tyreRefuseNumber(W.tyreWhatLoad));
  if (i.measured && !(finitePositive(i.measured.frontKg, 1, 300) && finitePositive(i.measured.rearKg, 1, 300))) out.push(W.tyreRefuseNumber(W.tyreWhatWheelLoads));
  if (!finitePositive(i.rimInnerMm, RIM_MIN_MM, RIM_MAX_MM)) out.push(W.tyreRefuseRim(Number.isFinite(i.rimInnerMm) ? fmt(i.rimInnerMm) : '?'));
  if (!WHEELS.some((w) => w.bsdMm === i.wheelBsdMm)) out.push(W.tyreRefuseWheel);
  for (const [label, t] of [[W.tyreFront, i.front], [W.tyreRear, i.rear]] as const) {
    if (!Number.isFinite(t.printedMm) || t.printedMm < WIDTH_MIN_MM || t.printedMm > WIDTH_MAX_MM) out.push(W.tyreRefuseWidth(label, Number.isFinite(t.printedMm) ? fmt(t.printedMm) : '?'));
    else if (t.caliperMm !== null && !finitePositive(t.caliperMm, 10, 110)) out.push(W.tyreRefuseCaliper(label));
  }
  if (!limitUsable(i.tyreMax)) out.push(W.tyreRefuseLimit(W.tyreWhatMax));
  if (i.tyreMin && !limitUsable(i.tyreMin)) out.push(W.tyreRefuseLimit(W.tyreWhatMin));
  if (i.rimMax && !limitUsable(i.rimMax)) out.push(W.tyreRefuseLimit(W.tyreWhatRimMax));
  if (out.length === 0 && i.tyreMin && i.rimMax && limitBar(i.rimMax) < limitBar(i.tyreMin)) out.push(W.tyreRefuseMinMax);
  if (i.heat) {
    const h = i.heat;
    const temp = (n: number): boolean => Number.isFinite(n) && n >= -40 && n <= 60;
    const height = (n: number): boolean => Number.isFinite(n) && n >= -400 && n <= 9000;
    if (!temp(h.pumpC)) out.push(W.tyreRefuseTemp(W.tyreWhatPumpTemp));
    if (!temp(h.maxC)) out.push(W.tyreRefuseTemp(W.tyreWhatMaxTemp));
    if (!height(h.pumpHeightM)) out.push(W.tyreRefuseHeight(W.tyreWhatPumpHeight));
    if (!height(h.highestM)) out.push(W.tyreRefuseHeight(W.tyreWhatHighest));
  }
  if (out.length === 0 && i.tyreMin && limitBar(i.tyreMin) > limitBar(i.tyreMax)) out.push(W.tyreRefuseMinMax);
  return out;
}

const refusedResult = (refused: string[]): TyreResult =>
  ({ front: null, rear: null, split: null, decided: [], warnings: [], warningCodes: [], warningItems: [], needsWidth: false, incompatible: false, refused });

const kindOfCap = (k: LimitKind, mm: number): string =>
  k === 'tyre-max' ? W.tyreLimitTyreMax : k === 'rim-max' ? W.tyreLimitRimMax : k === 'hookless-5' ? W.tyreLimitHookless5 : W.tyreLimitHooklessWidth(fmt(mm, 0));

/** The ISO 5775-1 minimums of old, used only when no sidewall minimum was entered. */
const isoFloorBar = (printedMm: number, surface: Surface): number => (printedMm <= 25 ? 3.0 : surface === 'unpaved' ? 1.5 : 2.0);

export function tyreEstimate(input: TyreInput): TyreResult {
  const refused = validate(input);
  if (refused.length) return refusedResult(refused);
  const wEffs: number[] = [];
  for (const t of [input.front, input.rear]) {
    const w = t.caliperMm ?? effectiveWidth(t.printedMm, input.rimInnerMm);
    if (w === null || !Number.isFinite(w) || w < 10) return refusedResult([W.tyreRefuseWidth(t === input.front ? W.tyreFront : W.tyreRear, fmt(t.printedMm))]);
    wEffs.push(w);
  }

  // A hookless cap depends on the printed width: with the rim hookless or unset and a width nobody gave, there is no figure to give.
  if ((input.rimType === 'hookless' || input.rimType === 'unset') && (input.front.assumed || input.rear.assumed)) return { ...refusedResult([]), needsWidth: true };

  const { frontKg, rearKg, split } = chooseSplit(input);
  const withTube = input.setup !== 'tubeless';
  const warnings: string[] = [];
  const codeSet = new Set<string>();
  const items: WarningItem[] = [];
  const flag = (code: string, text: string): void => {
    codeSet.add(code);
    if (!warnings.includes(text)) { warnings.push(text); items.push({ code, text }); }
  };
  // Heat advice carries pressure numbers: it is only given when there is a figure.
  const heatNotes: [string, string][] = [];
  let capReal = false;
  let capHookless = false;
  const hooklessLimited = input.rimType === 'hookless' || input.rimType === 'unset';
  const decided: string[] = [];
  let incompatible = false;

  const wheels = ([['front', W.tyreFront, input.front, frontKg, wEffs[0]!], ['rear', W.tyreRear, input.rear, rearKg, wEffs[1]!]] as const).map(
    ([, label, tyre, loadKg, wEff]) => {
      const raw = p15(loadKg, wEff) * wheelFactor(wEff, input.wheelBsdMm) * casingFactor(input.casing) * surfaceFactor(input.surface, wEff, withTube) * (input.wet ? 0.97 : 1);

      // Floor, then cap last. Every limit also in the unit it was entered in.
      const caps: Cap[] = [{ kind: 'tyre-max', limit: input.tyreMax, bar: limitBar(input.tyreMax) }];
      if (input.rimMax) caps.push({ kind: 'rim-max', limit: input.rimMax, bar: limitBar(input.rimMax) });
      if (hooklessLimited) {
        caps.push({ kind: 'hookless-5', limit: { value: HOOKLESS_MAX_BAR, unit: 'bar' }, bar: HOOKLESS_MAX_BAR });
        const table = hooklessCapBar(tyre.printedMm);
        if (table !== null) caps.push({ kind: 'hookless-width', limit: { value: table, unit: 'bar' }, bar: table });
      }
      const cap = caps.reduce((a, b) => (b.bar < a.bar ? b : a));
      const floorLimit: Limit | null = withTube ? (input.tyreMin ?? { value: isoFloorBar(tyre.printedMm, input.surface), unit: 'bar' }) : null;
      const floorKind: LimitKind = input.tyreMin ? 'tube-floor' : 'iso-floor';
      const floorBar = floorLimit ? limitBar(floorLimit) : null;

      const beforeCap = floorBar !== null ? Math.max(raw, floorBar) : raw;
      const estimate = Math.min(beforeCap, cap.bar);
      const raised = floorBar !== null && raw < floorBar;
      const capped = beforeCap > cap.bar;
      if (floorBar !== null && floorBar > cap.bar) incompatible = true;

      // Shown values, each in its own unit, against the limits in that unit.
      const capIn = (unit: Unit): number => Math.min(...caps.map((c) => limitIn(c.limit!, unit)));
      const floorIn = (unit: Unit): number | null => (floorLimit ? limitIn(floorLimit, unit) : null);
      const bar = roundInward(estimate, { step: 0.05, floor: floorIn('bar'), cap: capIn('bar') });
      const psi = roundInward(barToPsi(estimate), { step: 1, floor: floorIn('psi'), cap: capIn('psi') });
      // The range never starts below a tube floor, nor below a printed minimum.
      const winFloor = (unit: Unit): number | null => floorIn(unit) ?? (input.tyreMin ? limitIn(input.tyreMin, unit) : null);
      const lo = (v: number, unit: Unit, step: number): number => Math.min(v, roundInward(v * 0.9, { step, floor: winFloor(unit), cap: v }));
      const floorB = floorIn('bar');
      const floorP = floorIn('psi');
      const noStep = (floorB !== null && bar < floorB) || (floorP !== null && psi < floorP);
      if (noStep && floorBar !== null && floorBar <= cap.bar) {
        incompatible = true;
        flag('noStep', W.tyreWarnNoStep(label));
      }

      // Heat and altitude: how high the gauge may read at the pump so that the warmest, highest moment stays at or under the cap.
      let heat: WheelHeat | null = null;
      if (input.heat) {
        const p1MaxBar = pumpLimit({ capBar: capIn('bar'), ...input.heat }).p1MaxBar;
        const advise = p1MaxBar < bar || barToPsi(p1MaxBar) < psi;
        const pumpToBar = Math.max(0, stepDown(Math.min(p1MaxBar, bar), 0.05));
        const pumpToPsi = Math.max(0, stepDown(Math.min(barToPsi(p1MaxBar), psi), 1));
        heat = { p1MaxBar, advise, pumpToBar, pumpToPsi };
        if (advise) heatNotes.push(['heatPump', W.tyreWarnHeatPump(label, bar2(pumpToBar), String(pumpToPsi))]);
        if (advise && floorB !== null && pumpToBar < floorB) heatNotes.push(['heatBelowFloor', W.tyreWarnHeatBelowFloor(label)]);
      }

      const limit: LimitKind | null = capped ? cap.kind : raised ? floorKind : null;
      decided.push(W.tyreDecidedEstimate(label, fmt(loadKg), fmt(wEff)));
      if (capped) decided.push(W.tyreDecidedCap(label, kindOfCap(cap.kind, tyre.printedMm)));
      else if (raised) {
        decided.push(W.tyreDecidedFloor(label, input.tyreMin ? W.tyreFloorTyreMin : W.tyreFloorIso(fmt(floorBar!, 1))));
      }

      // Warnings per wheel.
      if (!withTube && input.tyreMin) {
        const m = input.tyreMin;
        // The figure as shown, and the low end of the window, not only the estimate.
        if (estimate < limitBar(m) || bar < limitIn(m, 'bar') || psi < limitIn(m, 'psi')) {
          flag('belowSidewallMin', W.tyreWarnBelowSidewallMin(label));
        }
      }
      if (!withTube && estimate < 1) flag('belowOneBar', W.tyreWarnBelowOneBar(label));
      if (capped) { if (cap.kind === 'tyre-max' || cap.kind === 'rim-max') capReal = true; else capHookless = true; }

      return {
        label, tyre, wEff,
        wheel: {
          bar, psi, estimate, raw,
          windowBar: [lo(bar, 'bar', 0.05), bar] as [number, number],
          windowPsi: [lo(psi, 'psi', 1), psi] as [number, number],
          capped, raised, limit, capBar: capIn('bar'), floorBar, loadKg, wEffMm: wEff, heat,
        } satisfies Wheel,
      };
    },
  );

  // Warnings that are about the pairing, not the wheel.
  if (input.rimType === 'hookless') {
    flag('hooklessTss', W.tyreWarnHooklessTss);
    if (withTube) flag('hooklessNeedsTubeless', W.tyreWarnHooklessTube);
  }
  if (input.rimType === 'unset') flag('rimUnset', W.tyreWarnRimUnset);
  if (input.rimType === 'tubular') flag('tubularNoCheck', W.tyreWarnTubular);
  if (input.rimType !== 'tubular') {
    const min = etrtoMinWidth(input.rimInnerMm);
    if (min === null) flag('rimOutsideTable', W.tyreWarnRimOutside);
    else {
      const below = wheels.filter((w) => w.tyre.printedMm < min);
      if (below.length === 2) flag('belowEtrto', W.tyreWarnBelowEtrto('Tyre width', String(min)));
      else if (below.length === 1) flag('belowEtrto', W.tyreWarnBelowEtrto(`${below[0]!.label} tyre width`, String(min)));
    }
  }
  if (wheels.some((w) => w.wEff < FIT_MIN_MM || w.wEff > FIT_MAX_MM)) flag('extrapolated', W.tyreWarnExtrapolated);
  const unknownRimOrWidth = codeSet.has('rimUnset');
  if (incompatible) flag('incompatible', unknownRimOrWidth ? W.tyreWarnIncompatibleUnknown : W.tyreWarnIncompatible);
  // "Fit a wider tyre" only where a real tyre width is what limits: not under the careful rule for an unset rim, and not when a tube's floor is the cause.
  if (!incompatible) {
    if (capReal) flag('capBinds', W.tyreWarnCapBinds);
    if (capHookless) flag(codeSet.has('rimUnset') ? 'capRimUnset' : 'capBinds', codeSet.has('rimUnset') ? W.tyreWarnCapRimUnset : W.tyreWarnCapBinds);
  }
  if (!incompatible) for (const [code, text] of heatNotes) flag(code, text);

  return {
    front: wheels[0]!.wheel,
    rear: wheels[1]!.wheel,
    split,
    decided,
    warnings,
    warningCodes: [...codeSet],
    warningItems: items,
    needsWidth: false,
    incompatible,
    refused: [],
  };
}

// A bike as the bag planner stores it (spec section 7.1, "Bikes" and "New bike fields"), ported from Load Check's
// normaliseBikeProfile with the same rules: an invalid value drops only itself, a block with nothing set is null, unknown fields are
// dropped. The co-pilot reads bikes only; it never writes them.

export type YesNo = 'yes' | 'no' | 'unknown';
export type FitStyle = 'unknown' | 'diamond-level' | 'diamond-sloping' | 'compact' | 'trapeze' | 'mixte' | 'step-through' | 'full-suspension';
export type SizeLetter = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type FitSize = { kind: 'letter'; value: SizeLetter } | { kind: 'cm'; value: number } | { kind: 'in'; value: number };
export type Fit = {
  style: FitStyle; size: FitSize | null; bolts: { st: YesNo; dt: YesNo; un: YesNo }; topTubeBag: YesNo;
  triangleCm: { top: number; seat: number; down: number } | null; seatGapCm: number | null; barWidthCm: number | null;
};
export type MaxWeight = { v: number; u: 'kg' | 'lb'; includes: 'bike' | 'no-bike' | 'unsure' };
export type Bars = 'drop' | 'flat' | 'other';
/** The look extras (owner's wish, 5 November 2026): how the frame is painted, the fork, the rims. `colour` stays the first colour. */
export const PATTERNS = ['solid', 'fade-h', 'fade-v', 'split', 'blocks', 'shift', 'panel', 'marble', 'stripes', 'speckle', 'camo', 'sparkle', 'chrome', 'carbon'] as const;
export type Pattern = (typeof PATTERNS)[number];
/** The patterns a fork can have of its own: the textures. */
export const FORK_PATTERNS = PATTERNS.slice(7) as readonly ForkPattern[];
export type ForkPattern = 'marble' | 'stripes' | 'speckle' | 'camo' | 'sparkle' | 'chrome' | 'carbon';
/** A fade's or fork pattern's `colours` are the rider's own two (owner's wish, 6 Nov 2026); `pair` is then the nearest of the six. */
export type Fork = { kind: 'own'; colour: string } | { kind: 'fade'; pair: number; colours?: [string, string] }
  | { kind: 'pattern'; pattern: ForkPattern; pair: number; colours?: [string, string] };
/** `colours` are the second and third; `pair` is one of the six fade pairs; a rim depth is 15 to 60 mm. */
export type Paint = { pattern: Pattern; colours: [string | null, string | null]; fork: Fork | null; rimMm: number | null };
export type Look = { colour: string | null; bars: Bars | null; ebike: boolean | null; paint?: Paint };
export type WheelWord = '700c' | '650b' | '650c' | '29' | '27.5' | '26';
export type Geometry = {
  at: string | null; maker: string; model: string; year: number | null; size: string; wheel: WheelWord | null;
  values: Record<string, { v: number; src: 'table' | 'measured' | 'estimate' }>;
};
export type PressureBike = {
  bikeKg: number | null; wheel: 'unknown' | WheelWord; rim: 'unknown' | 'tube-crochet' | 'tubular' | 'tubeless-crochet' | 'hookless';
  rimMm: number | null; frontMm: number | null; rearMm: number | null;
  frontCasing: 'unknown' | 'thin' | 'standard' | 'reinforced'; rearCasing: 'unknown' | 'thin' | 'standard' | 'reinforced';
  frontMinBar: number | null; frontMaxBar: number | null; rearMinBar: number | null; rearMaxBar: number | null;
};
export type BikeRecord = {
  id: string; name: string; frontTyre: string; rearTyre: string; padType: string; chainType: string; hangerType: string; notes: string;
  tyres: 'unknown' | 'tubes' | 'tubeless' | 'other'; valve: 'unknown' | 'presta' | 'schrader' | 'dunlop' | 'other';
  brakes: 'unknown' | 'hydraulic-disc' | 'cable-disc' | 'rim' | 'other'; drive: 'unknown' | 'derailleur' | 'chain-hub' | 'belt';
  shifting: 'unknown' | 'cable' | 'electronic' | 'none';
  /** Sub-project 11: only an answer is stored; no field is Not sure, so a bike from before keeps its bytes. */
  suspension?: 'none' | 'front' | 'full'; rackMounts?: 'yes' | 'no';
  pressure: PressureBike; fit: Fit | null; maxWeight: MaxWeight | null; maxWeightAsked: boolean; look: Look | null; geometry: Geometry | null;
};

const TEXT = { name: 100, frontTyre: 120, rearTyre: 120, padType: 120, chainType: 120, hangerType: 120, notes: 1000 } as const;
const CHOICES = {
  tyres: ['unknown', 'tubes', 'tubeless', 'other'],
  valve: ['unknown', 'presta', 'schrader', 'dunlop', 'other'],
  brakes: ['unknown', 'hydraulic-disc', 'cable-disc', 'rim', 'other'],
  drive: ['unknown', 'derailleur', 'chain-hub', 'belt'],
  shifting: ['unknown', 'cable', 'electronic', 'none'],
  // the last two are stored only as an answer (see BikeRecord)
  suspension: ['unknown', 'none', 'front', 'full'],
  rackMounts: ['unknown', 'yes', 'no'],
} as const;
type Choices = { [K in Exclude<keyof typeof CHOICES, 'suspension' | 'rackMounts'>]: (typeof CHOICES)[K][number] };
const FIT_STYLES: readonly FitStyle[] = ['unknown', 'diamond-level', 'diamond-sloping', 'compact', 'trapeze', 'mixte', 'step-through', 'full-suspension'];
const FIT_SIZES: readonly SizeLetter[] = ['XS', 'S', 'M', 'L', 'XL'];
const WHEELS: readonly WheelWord[] = ['700c', '650b', '650c', '29', '27.5', '26'];
const GEOMETRY_FIELDS: Record<string, [number, number]> = {
  stack_mm: [450, 750], reach_mm: [330, 520], top_tube_mm: [450, 700], seat_tube_mm: [300, 650], head_tube_mm: [60, 260],
  head_angle_deg: [60, 76], seat_angle_deg: [68, 80], chainstay_mm: [380, 520], wheelbase_mm: [900, 1400], bb_drop_mm: [20, 100],
  bb_height_mm: [240, 360], standover_mm: [400, 950], stepover_mm: [250, 600], fork_offset_mm: [30, 70], trail_mm: [40, 120],
  fork_length_mm: [330, 600], front_center_mm: [550, 850], tyre_mm: [10, 150], rider_min_cm: [140, 210], rider_max_cm: [140, 210], max_total_kg: [80, 250],
};
const LB_TO_KG = 0.45359237;

// The page's own data helpers, as they are.
type Obj = Record<string, unknown>;
function isObject(v: unknown): v is Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max);
  return Number.isInteger(n) ? n : null;
}
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
function date(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v.slice(0, 10) ? v : null;
}
const round1 = (n: number): number => Math.round(n * 10) / 10;
/** v if it is one of values, else the fallback, 'unknown' unless named. */
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback = 'unknown' as T): T => (values.includes(v as T) ? (v as T) : fallback);

function pressureOf(value: unknown): PressureBike {
  const p = isObject(value) ? value : {};
  const casing = ['unknown', 'thin', 'standard', 'reinforced'] as const;
  return {
    bikeKg: num(p.bikeKg, 3, 100),
    wheel: oneOf(p.wheel, ['unknown', ...WHEELS] as const),
    rim: oneOf(p.rim, ['unknown', 'tube-crochet', 'tubular', 'tubeless-crochet', 'hookless'] as const),
    rimMm: num(p.rimMm, 5, 100), frontMm: num(p.frontMm, 10, 150), rearMm: num(p.rearMm, 10, 150),
    frontCasing: oneOf(p.frontCasing, casing), rearCasing: oneOf(p.rearCasing, casing),
    frontMinBar: num(p.frontMinBar, 0, 15), frontMaxBar: num(p.frontMaxBar, 0, 15),
    rearMinBar: num(p.rearMinBar, 0, 15), rearMaxBar: num(p.rearMaxBar, 0, 15),
  };
}

function sizeOf(v: unknown): FitSize | null {
  if (!isObject(v)) return null;
  if (v.kind === 'letter' && FIT_SIZES.includes(v.value as SizeLetter)) return { kind: 'letter', value: v.value as SizeLetter };
  if (v.kind === 'cm') { const n = num(v.value, 40, 70); return n === null ? null : { kind: 'cm', value: n }; }
  if (v.kind === 'in') { const n = num(v.value, 12, 23); return n === null ? null : { kind: 'in', value: n }; }
  return null;
}

function fitOf(value: unknown): Fit | null {
  if (!isObject(value)) return null;
  const yn = (v: unknown): YesNo => oneOf<YesNo>(v, ['yes', 'no']);
  const b = isObject(value.bolts) ? value.bolts : {};
  const t = isObject(value.triangleCm) ? value.triangleCm : null;
  let triangleCm: Fit['triangleCm'] = null;
  if (t) {
    const [top, seat, down] = [num(t.top, 15, 90), num(t.seat, 15, 90), num(t.down, 15, 90)];
    if (top !== null && seat !== null && down !== null) {
      const [a, s, d] = [round1(top), round1(seat), round1(down)];
      if (a + s > d && a + d > s && s + d > a) triangleCm = { top: a, seat: s, down: d };
    }
  }
  const gap = num(value.seatGapCm, 3, 60);
  const bar = num(value.barWidthCm, 10, 80);
  const fit: Fit = {
    style: oneOf(value.style, FIT_STYLES), size: sizeOf(value.size), bolts: { st: yn(b.st), dt: yn(b.dt), un: yn(b.un) },
    topTubeBag: yn(value.topTubeBag), triangleCm, seatGapCm: gap === null ? null : round1(gap), barWidthCm: bar === null ? null : round1(bar),
  };
  const empty = fit.style === 'unknown' && !fit.size && fit.bolts.st === 'unknown' && fit.bolts.dt === 'unknown' && fit.bolts.un === 'unknown'
    && fit.topTubeBag === 'unknown' && !fit.triangleCm && fit.seatGapCm === null && fit.barWidthCm === null;
  return empty ? null : fit;
}

function maxWeightOf(value: unknown): MaxWeight | null {
  if (!isObject(value)) return null;
  const u = value.u === 'lb' ? 'lb' : value.u === 'kg' ? 'kg' : null;
  const v = num(value.v, 0.1, 100000);
  if (!u || v === null || !['bike', 'no-bike', 'unsure'].includes(value.includes as string)) return null;
  const kg = u === 'lb' ? v * LB_TO_KG : v;
  return kg >= 20 && kg <= 400 ? { v: round1(v), u, includes: value.includes as MaxWeight['includes'] } : null;
}

const hexOf = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null);
/** The first two of a list as colours, each one null if it is not "#rrggbb". */
const hexes = (v: unknown): [string | null, string | null] => { const a = Array.isArray(v) ? v as unknown[] : []; return [hexOf(a[0]), hexOf(a[1])]; };

/** The look extras; anything unknown or broken drops only itself, and nothing set is none (today's drawing). */
function paintOf(v: unknown): Paint | null {
  if (!isObject(v)) return null;
  const f = isObject(v.fork) ? v.fork : {};
  const pair = int(f.pair, 0, 5);
  const own = hexOf(f.colour);
  // the rider's own two colours, kept only whole: else the preset pair
  const k = hexes(f.colours);
  const two = k[0] && k[1] ? { colours: k as [string, string] } : {};
  const fork: Fork | null = f.kind === 'own' && own ? { kind: 'own', colour: own } : pair === null ? null : f.kind === 'fade' ? { kind: 'fade', pair, ...two }
    : f.kind === 'pattern' && FORK_PATTERNS.includes(f.pattern as ForkPattern) ? { kind: 'pattern', pattern: f.pattern as ForkPattern, pair, ...two } : null;
  const p: Paint = { pattern: oneOf(v.pattern, PATTERNS, 'solid'), colours: hexes(v.colours), fork, rimMm: int(v.rimMm, 15, 60) };
  return p.pattern === 'solid' && !p.colours[0] && !p.colours[1] && !fork && p.rimMm === null ? null : p;
}

function lookOf(value: unknown): Look | null {
  if (!isObject(value)) return null;
  const paint = paintOf(value.paint);
  const look: Look = {
    colour: hexOf(value.colour), bars: value.bars === 'drop' || value.bars === 'flat' || value.bars === 'other' ? value.bars : null,
    ebike: typeof value.ebike === 'boolean' ? value.ebike : null, ...(paint ? { paint } : {}),
  };
  return look.colour === null && look.bars === null && look.ebike === null && !paint ? null : look;
}

function geometryOf(value: unknown): Geometry | null {
  if (!isObject(value)) return null;
  const values: Geometry['values'] = {};
  const src = isObject(value.values) ? value.values : {};
  for (const [key, [lo, hi]] of Object.entries(GEOMETRY_FIELDS)) {
    const e = src[key];
    if (!isObject(e)) continue;
    const v = num(e.v, lo, hi);
    if (v !== null) values[key] = { v: round1(v), src: e.src === 'table' || e.src === 'measured' ? e.src : 'estimate' };
  }
  const g: Geometry = {
    at: date(value.at), maker: text(value.maker, 60).trim(), model: text(value.model, 100).trim(), year: int(value.year, 1980, 2100),
    size: text(value.size, 20).trim(), wheel: WHEELS.includes(value.wheel as WheelWord) ? (value.wheel as WheelWord) : null, values,
  };
  return !g.at && !g.maker && !g.model && !g.year && !g.size && !g.wheel && Object.keys(values).length === 0 ? null : g;
}

/** One bike record, every field of section 7.1's table; null when it has no usable id. */
export function normaliseBike(raw: unknown): BikeRecord | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) return null;
  const t = Object.fromEntries(Object.entries(TEXT).map(([key, max]) => [key, text(raw[key], max).trim()])) as Record<keyof typeof TEXT, string>;
  return {
    id: raw.id, ...t, name: t.name || 'My bike',
    // each choice in CHOICES' order, which is the page's
    ...Object.fromEntries(Object.entries(CHOICES).map(([key, values]) => [key, oneOf(raw[key], values as readonly string[])])
      .filter(([, value], i) => i < 5 || value !== 'unknown')) as Choices,
    pressure: pressureOf(raw.pressure), fit: fitOf(raw.fit), maxWeight: maxWeightOf(raw.maxWeight), maxWeightAsked: raw.maxWeightAsked === true,
    look: lookOf(raw.look), geometry: geometryOf(raw.geometry),
  };
}

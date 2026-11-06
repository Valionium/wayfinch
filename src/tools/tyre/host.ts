// What the tyre tool may read from outside, all read-only: Load Check's load summary (Contract 1) and its bike records, and the rider's
// weight from You. It never writes a `loadcheck:*` key. Unknown major versions read as none; unknown fields are ignored.
import type { Bars, Casing, RimType, Setup } from './core.ts';
import type { BikeInfo, SummaryInfo } from './model.ts';
import { parseTyre } from '../../core/bike/tyres.ts';
import { WHEELS, WIDTH_MAX_MM, WIDTH_MIN_MM } from './tables.ts';
import type { Pos } from './tables.ts';

export const SUMMARY_KEY = 'loadcheck:summary:v1';
export const BIKES_KEY = 'loadcheck:bikeProfiles';
export const CURRENT_BIKE_KEY = 'loadcheck:bikeProfile';
const SAVED_AT_KEY = 'loadcheck:saved-at:v1';

export interface ReadOnlyStore { getItem(key: string): string | null }

export interface HostData {
  riderKg: number | null;
  summary: SummaryInfo | null;
  bikes: BikeInfo[];
  /** The bike of the current bag plan, when the library (or the current-bike record) holds it. */
  planBikeId: string | null;
  /** The bike in use: the plan's, else the one the bag planner saved last, else its current one, else the last in its list. Null with no bike. */
  usedBikeId: string | null;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, lo: number, hi: number): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : undefined);
const json = (kv: ReadOnlyStore, key: string): unknown => {
  try {
    const text = kv.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch { return undefined; }
};

const POSITIONS: Pos[] = ['fork', 'bar', 'top', 'frame', 'bottle', 'seat', 'rack', 'pack'];

/** Contract 1, as far as the tyre tool reads it. An empty plan, a wrong kind or an unknown major version is no summary. */
export function parseSummary(raw: unknown): SummaryInfo | null {
  if (!isObject(raw) || raw.app !== 'load-check' || raw.kind !== 'load-summary' || raw.v !== 1 || raw.empty === true) return null;
  if (typeof raw.at !== 'string' || !isObject(raw.weight) || !isObject(raw.bags)) return null;
  const w = raw.weight;
  const carriedKg = num(w.carriedKg, 0, 300);
  const bagCount = num(raw.bags.count, 0, 50);
  if (carriedKg === undefined || bagCount === undefined) return null;
  const by: Partial<Record<Pos, number>> = {};
  if (isObject(w.byPositionKg)) {
    for (const p of POSITIONS) {
      const v = num(w.byPositionKg[p], 0, 300);
      if (v !== undefined) by[p] = v;
    }
  }
  return {
    at: raw.at,
    bikeId: typeof raw.bikeId === 'string' ? raw.bikeId : null,
    bagCount,
    carriedKg,
    bikeKg: num(w.bikeKg, 1, 150) ?? null,
    emptyLuggageKg: num(w.emptyLuggageKg, 0, 100) ?? null,
    byPositionKg: by,
    unplacedKg: num(w.unplacedKg, 0, 300) ?? 0,
  };
}

const WHEEL_WORDS: Record<string, number> = { '700c': 622, '650b': 584, '650c': 571, '29': 622, '27.5': 584, '26': 559 };

/**
 * A tyre size as people write it: "40-622", "700x40c", "29 x 2.2". Null when it does not parse. The drawing's reader (one reader for
 * both, so they never disagree), rounded to whole millimetres and held to this tool's table: unsure is null, never a guess.
 */
export function parseTyreSize(text: unknown): { widthMm: number; bsdMm: number } | null {
  const size = parseTyre(text);
  if (!size || !WHEELS.some((w) => w.bsdMm === size.rimMm)) return null;
  const widthMm = Math.round(size.widthMm);
  return widthMm >= WIDTH_MIN_MM && widthMm <= WIDTH_MAX_MM ? { widthMm, bsdMm: size.rimMm } : null;
}

/** One of Load Check's bike records. Fields it does not hold stay unset: nothing is guessed. */
export function parseBike(raw: unknown): BikeInfo | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) return null;
  const bike: BikeInfo = { id: raw.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 100) : 'My bike' };
  const look = isObject(raw.look) ? raw.look : {};
  const bars = look.bars;
  if (bars === 'drop' || bars === 'flat' || bars === 'other') bike.bars = bars as Bars;
  const p = isObject(raw.pressure) ? raw.pressure : {};
  const front = parseTyreSize(raw.frontTyre);
  const rear = parseTyreSize(raw.rearTyre);
  // Text that is there but not certain is shown to the rider, never used.
  for (const [text, got, given] of [[raw.frontTyre, front, p.frontMm], [raw.rearTyre, rear, p.rearMm]] as const) {
    if (typeof text === 'string' && text.trim() !== '' && got === null && num(given, 18, 83) === undefined) {
      const t = text.trim().slice(0, 60);
      if (text === raw.frontTyre) bike.unreadFront = t; else bike.unreadRear = t;
      bike.unreadTyre ??= t;
    }
  }
  const wheel = typeof p.wheel === 'string' ? WHEEL_WORDS[p.wheel] : undefined;
  const bsd = wheel ?? front?.bsdMm ?? rear?.bsdMm;
  if (bsd !== undefined) bike.wheelBsdMm = bsd;
  const fw = num(p.frontMm, 18, 83) ?? front?.widthMm;
  const rw = num(p.rearMm, 18, 83) ?? rear?.widthMm;
  if (fw !== undefined) bike.frontMm = fw;
  if (rw !== undefined) bike.rearMm = rw;
  const rimMm = num(p.rimMm, 10, 60);
  if (rimMm !== undefined) bike.rimInnerMm = rimMm;
  const rim: Record<string, RimType> = { 'tube-crochet': 'hooked', 'tubeless-crochet': 'hooked', tubular: 'tubular', hookless: 'hookless' };
  if (typeof p.rim === 'string' && rim[p.rim]) bike.rimType = rim[p.rim];
  const setup: Record<string, Setup> = { tubes: 'butyl', tubeless: 'tubeless' };
  if (typeof raw.tyres === 'string' && setup[raw.tyres]) bike.setup = setup[raw.tyres];
  const casing: Record<string, Casing> = { thin: 'supple', standard: 'standard', reinforced: 'reinforced' };
  if (typeof p.frontCasing === 'string' && casing[p.frontCasing]) bike.casing = casing[p.frontCasing];
  const kg = num(p.bikeKg, 3, 100);
  if (kg !== undefined) bike.bikeKg = kg;
  return bike;
}

/** The bike the bag planner saved last, by its ledger of save times (bikes are stamped one by one); null when it names none. */
function newestBikeId(kv: ReadOnlyStore, bikes: BikeInfo[]): string | null {
  const ledger = json(kv, SAVED_AT_KEY);
  const items = isObject(ledger) && isObject(ledger.items) && isObject(ledger.items[BIKES_KEY]) ? ledger.items[BIKES_KEY] : {};
  let best: { id: string; at: number } | null = null;
  for (const b of bikes) {
    const at = typeof items[b.id] === 'string' ? Date.parse(items[b.id] as string) : NaN;
    if (Number.isFinite(at) && (!best || at > best.at)) best = { id: b.id, at };
  }
  return best ? best.id : null;
}

/**
 * Everything the tyre screen reads, once. `riderKg` is a function because You lives in the co-pilot's store, which this module does not
 * import. A bike id nobody has (a deleted bike) is treated as none.
 */
export function readHost(kv: ReadOnlyStore, riderKg: () => number | null = () => null): HostData {
  const library = json(kv, BIKES_KEY);
  const bikes: BikeInfo[] = Array.isArray(library) ? library.map(parseBike).filter((b): b is BikeInfo => b !== null) : [];
  const current = parseBike(json(kv, CURRENT_BIKE_KEY));
  if (current && !bikes.some((b) => b.id === current.id)) bikes.unshift(current);
  const summary = parseSummary(json(kv, SUMMARY_KEY));
  const planBikeId = summary?.bikeId && bikes.some((b) => b.id === summary.bikeId) ? summary.bikeId : null;
  return { riderKg: riderKg(), summary, bikes, planBikeId, usedBikeId: planBikeId ?? newestBikeId(kv, bikes) ?? (current ? current.id : (bikes[bikes.length - 1]?.id ?? null)) };
}

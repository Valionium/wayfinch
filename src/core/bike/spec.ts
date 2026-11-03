// resolveBikeSpec (spec section 7.4): one value per part, each marked entered, guessed or default, from the bike and the plan.
// With no bike and no plan, the result is a gravel bike, 700c x 40 mm, diamond sloping, size M.
import type { Bars, BikeRecord, SizeLetter } from './normalise.ts';
import { framePoints } from './templates.ts';
import type { FramePoints, Style } from './templates.ts';
import { parseTyre } from './tyres.ts';

export type Mark = 'entered' | 'guessed' | 'default';
export type Part<T> = { value: T; mark: Mark };
export type BikeType = 'road' | 'gravel' | 'touring' | 'trekking' | 'mtb' | 'fat';

/** Contract 1's bags, decks and bottles: what the drawing reads of a plan. */
export type BagItem = { pos: string; L: number; shape?: number; slot?: 'front' | 'rear'; pair?: boolean; fill: number | readonly number[] };
export type Deck = 'empty' | 'loaded' | null;
export type BagView = {
  items: readonly BagItem[];
  decks: { bar: Deck; rack: Deck };
  bottles: readonly { slot: 'st' | 'dt' | 'un'; L: number }[];
};
/** The plan, as far as the spec reads it: its bags. */
export type PlanView = BagView;

export type BikeSpec = {
  type: Part<BikeType>;
  rimMm: Part<number>;
  frontMm: Part<number>;
  rearMm: Part<number>;
  style: Part<Style>;
  size: Part<SizeLetter>;
  /** Sub-project 9's maker geometry: always empty in this release, the first choice of the frame points. */
  geometry: Part<null>;
  points: Part<FramePoints>;
  bars: Part<Bars>;
  fork: Part<'rigid' | 'suspension'>;
  brakes: Part<'disc' | 'rim' | 'none'>;
  drive: Part<'derailleur' | 'hub' | 'belt' | 'chain'>;
  rack: Part<boolean>;
  ebike: Part<boolean>;
  colour: Part<string | null>;
  /** Where the frame takes bottles and bags, as the bag planner decides it. */
  mounts: { st: boolean; dt: boolean; un: boolean; top: boolean; frame: boolean };
};

const WHEEL_RIM: Record<string, number> = { '700c': 622, '650b': 584, '650c': 571, '29': 622, '27.5': 584, '26': 559 };

const part = <T>(value: T, mark: Mark): Part<T> => ({ value, mark });

/** The bag planner's size from the number on the frame (section 7.1): rounded, then mapped to a letter. */
function sizeLetter(bike: BikeRecord | null): SizeLetter | null {
  const z = bike?.fit?.size;
  if (!z) return null;
  if (z.kind === 'letter') return z.value;
  const r = Math.round(z.value);
  if (z.kind === 'in') return r <= 14 ? 'XS' : r <= 16 ? 'S' : r <= 18 ? 'M' : r <= 20 ? 'L' : 'XL';
  return r <= 49 ? 'XS' : r <= 52 ? 'S' : r <= 55 ? 'M' : r <= 58 ? 'L' : 'XL';
}

const hasRack = (plan: PlanView | null): boolean => !!plan && (plan.items.some((i) => i.pos === 'rack') || plan.decks.rack !== null);

export function resolveBikeSpec(bike: BikeRecord | null, plan: PlanView | null): BikeSpec {
  const front = parseTyre(bike?.frontTyre);
  const rear = parseTyre(bike?.rearTyre);
  const p = bike?.pressure;

  const wheelRim = p && p.wheel !== 'unknown' ? WHEEL_RIM[p.wheel] : undefined;
  const rimTyre = front?.rimMm ?? rear?.rimMm;
  const rimMm = rimTyre !== undefined ? part(rimTyre, 'entered') : wheelRim !== undefined ? part(wheelRim, 'entered') : part(622, 'default');

  const own = (tyre: typeof front, printed: number | null | undefined): number | null => tyre?.widthMm ?? printed ?? null;
  const f = own(front, p?.frontMm);
  const r = own(rear, p?.rearMm);
  const frontMm = f !== null ? part(f, 'entered') : r !== null ? part(r, 'guessed') : part(40, 'default');
  const rearMm = r !== null ? part(r, 'entered') : f !== null ? part(f, 'guessed') : part(40, 'default');

  const fitStyle = bike?.fit?.style ?? 'unknown';
  const widest = Math.max(frontMm.value, rearMm.value);
  const rack = hasRack(plan);
  const typeRule: BikeType | null = fitStyle === 'full-suspension' ? 'mtb'
    : fitStyle === 'trapeze' || fitStyle === 'mixte' || fitStyle === 'step-through' ? 'trekking'
    : widest >= 90 ? 'fat'
    : widest >= 55 ? 'mtb'
    : widest <= 32 && (rimMm.value === 622 || rimMm.value === 571) ? 'road'
    : rack ? 'touring'
    : null;
  const type = typeRule ? part(typeRule, 'guessed') : part<BikeType>('gravel', 'default');
  // A value from the type's defaults is a guess when the type was, and a default when nothing told the type.
  const fromType = <T>(value: T): Part<T> => part(value, type.mark);

  const style: Part<Style> = fitStyle !== 'unknown' ? part(fitStyle, 'entered') : fromType(type.value === 'touring' ? 'diamond-level' : 'diamond-sloping');
  const letter = sizeLetter(bike);
  const size = letter ? part(letter, 'entered') : part<SizeLetter>('M', 'default');

  const drive = bike?.drive === 'derailleur' ? part('derailleur' as const, 'entered')
    : bike?.drive === 'chain-hub' ? part('hub' as const, 'entered')
    : bike?.drive === 'belt' ? part('belt' as const, 'entered')
    : part('chain' as const, 'default');
  const typeBars: Bars = type.value === 'road' || type.value === 'gravel' ? 'drop'
    : type.value === 'touring' ? (drive.value === 'hub' || drive.value === 'belt' ? 'flat' : 'drop')
    : 'flat';
  const bars = bike?.look?.bars ? part(bike.look.bars, 'entered') : fromType(typeBars);

  const forkBags = !!plan && plan.items.some((i) => i.pos === 'fork');
  const fork = fitStyle === 'full-suspension' ? part('suspension' as const, 'guessed')
    : fromType(type.value === 'mtb' && !forkBags ? ('suspension' as const) : ('rigid' as const));

  const brakes = bike?.brakes === 'hydraulic-disc' || bike?.brakes === 'cable-disc' ? part('disc' as const, 'entered')
    : bike?.brakes === 'rim' ? part('rim' as const, 'entered')
    : bike?.brakes === 'other' ? part('none' as const, 'entered')
    : part('none' as const, 'default');

  return {
    type, rimMm, frontMm, rearMm, style, size,
    geometry: part(null, 'default'),
    points: part(framePoints(style.value, size.value), style.mark === 'default' && size.mark === 'default' ? 'default' : 'guessed'),
    bars, fork, brakes, drive,
    rack: rack ? part(true, 'entered') : part(false, 'default'),
    ebike: typeof bike?.look?.ebike === 'boolean' ? part(bike.look.ebike, 'entered') : part(false, 'default'),
    colour: bike?.look?.colour ? part(bike.look.colour, 'entered') : part(null, 'default'),
    mounts: mountsOf(bike, letter),
  };
}

/** The bag planner's frame fit (its bikeFit): which cages exist, room for a top-tube bag, and whether a frame bag fits at all. */
function mountsOf(bike: BikeRecord | null, size: SizeLetter | null): BikeSpec['mounts'] {
  const fit = bike?.fit;
  const style = fit?.style ?? 'unknown';
  const family = style === 'unknown' || style.startsWith('diamond') ? 'diamond' : style;
  const def = style === 'unknown' ? { st: true, dt: true, un: true }
    : family === 'diamond' || family === 'compact' ? { st: size !== 'XS', dt: true, un: false }
    : family === 'full-suspension' || family === 'trapeze' || family === 'mixte' ? { st: false, dt: true, un: false }
    : { st: false, dt: false, un: false };
  const cage = (k: 'st' | 'dt' | 'un'): boolean => {
    const a = fit?.bolts[k] ?? 'unknown';
    return a === 'yes' ? true : a === 'no' ? false : def[k];
  };
  const noTop = style === 'step-through' || style === 'trapeze' || style === 'mixte';
  const room = fit?.topTubeBag ?? 'unknown';
  const top = style === 'step-through' ? false : room === 'yes' ? true : room === 'no' ? false : !noTop;
  return { st: cage('st'), dt: cage('dt'), un: cage('un'), top, frame: style !== 'step-through' };
}

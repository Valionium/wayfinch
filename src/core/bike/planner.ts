// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): bikeArt as both pages draw it, with the anchors carrying the
// bag planner's own tap targets and tags (targets.ts), which the co-pilot never needs, and the look extras (paint.ts) with their words.
import type { Anchors, ArtOptions, P } from './art.ts';
import { bagLayer } from './bag-art.ts';
import type { Paint } from './normalise.ts';
import { paintedArt } from './paint.ts';
import type { BagView, BikeSpec } from './spec.ts';
import { targetsOf } from './targets.ts';
import type { Hit } from './targets.ts';

export type PlannerAnchors = Anchors & { readonly hits: Hit[]; readonly tags: Record<string, P> };

const DONE = new WeakSet<Anchors>();
/** The anchors with `hits` and `tags`, worked out on first use. The anchors are shared between drawings: read them only. */
export function withTargets(a: Anchors): PlannerAnchors {
  if (!DONE.has(a)) {
    DONE.add(a);
    Object.defineProperties(a, { hits: { get: () => targetsOf(a).hits }, tags: { get: () => targetsOf(a).tags } });
  }
  return a as PlannerAnchors;
}

/** The drawing with the bike's look extras, if any (`look.paint` of a normalised bike); without them, bikeArt's own. */
export function bikeArt(spec: BikeSpec, bags: BagView | null, options: ArtOptions = {}, paint: Paint | null = null): { svg: string; anchors: PlannerAnchors; label: string } {
  const art = paintedArt(spec, bags, options, paint);
  return { ...art, anchors: withTargets(art.anchors) };
}

/**
 * The same drawing with the plan's bags as their real shapes (bag-art.ts) where bikeArt draws its boxes: the bag planner's own
 * sketches (the Gear advisor's). bikeArt stays the co-pilot's drawing byte for byte (C-DRAWING-SET), so its first screen keeps its size.
 */
export function shapedArt(spec: BikeSpec, bags: BagView | null, options: ArtOptions = {}, paint: Paint | null = null): { svg: string; anchors: PlannerAnchors; label: string } {
  const art = bikeArt(spec, bags && { items: [], decks: { bar: null, rack: null }, bottles: [] }, options, paint);
  if (!bags) return art;
  const end = art.svg.lastIndexOf('</svg>');
  return { ...art, svg: art.svg.slice(0, end) + bagLayer(bags, art.anchors, options.theme ?? 'dark', options.idPrefix ?? 'bk') + art.svg.slice(end) };
}

export { SWATCHES, nearestSwatchName, oklabMedian } from './colour.ts';
export { normaliseBike } from './normalise.ts';
export { resolveBikeSpec } from './spec.ts';
export { colourName, DEFAULT_COLOURS, FADES, forkColours, pairFor, PATTERN_LIST } from './paint.ts';
export { PT as PAINT_WORDS } from '../wording/en-paint.ts';
export { bagShape, PAIR_OFFSET } from './shapes.ts';

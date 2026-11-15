// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): bikeArt as both pages draw it, with the anchors carrying the
// bag planner's own tap targets and tags (targets.ts), which the co-pilot never needs, and the look extras (paint.ts) with their words.
import { bikeArt as drawnArt } from './art.ts';
import type { Anchors, ArtOptions, P } from './art.ts';
import { bagLayer } from './bag-art.ts';
import { besideBottles } from './beside.ts';
import type { BikeRecord, Paint } from './normalise.ts';
import { paintedArt } from './paint.ts';
import { resolveBikeSpec as specOf } from './spec.ts';
import type { BagView, BikeSpec, PlanView } from './spec.ts';
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

/** The bag planner's spec: resolveBikeSpec's, and the plan's bottles, so the rig (drawn without its bags) knows where they are. */
export type PlannerSpec = BikeSpec & { readonly bottles?: BagView['bottles'] };
export function resolveBikeSpec(bike: BikeRecord | null, plan: PlanView | null): PlannerSpec {
  return { ...specOf(bike, plan), bottles: plan ? plan.bottles : [] };
}

/**
 * The drawing with the bike's look extras, if any (`look.paint` of a normalised bike); without them, bikeArt's own. Its anchors' frame
 * shapes leave room for the plan's bottles in the triangle (beside.ts): the drawing itself is bikeArt's, byte for byte.
 */
export function bikeArt(spec: PlannerSpec, bags: BagView | null, options: ArtOptions = {}, paint: Paint | null = null): { svg: string; anchors: PlannerAnchors; label: string } {
  const art = paintedArt(spec, bags, options, paint);
  return { ...art, anchors: withTargets(besideBottles(art.anchors, spec.bottles ?? bags?.bottles ?? [])) };
}

const areaOf = (s: string): number => {
  const p = s.split(' ').map((q) => q.split(',').map(Number) as P);
  return Math.abs(p.reduce((t, a, i) => { const b = p[(i + 1) % p.length]!; return t + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
};
/**
 * Of each frame bag shape (full, three-quarter, half, wedge), the share the drawing keeps beside the plan's bottles in the triangle: the
 * cut shape's area over the whole shape's, 1 where nothing is cut (owner's ruling of 14 Nov 2026, "count what fits": the bag planner
 * counts a frame bag's usable litres by it, so the plan holds what the rig draws). Only the anchors are read, as bikeArt draws them.
 */
export function frameKept(spec: PlannerSpec): number[] {
  const whole = drawnArt(spec, null).anchors;
  const cut = besideBottles(whole, spec.bottles ?? []);
  if (!whole.frame || !cut.frame) return [1, 1, 1, 1];
  return whole.frame.shapes.map((s, i) => { const c = cut.frame!.shapes[i]!; return c === s ? 1 : areaOf(c) / areaOf(s); });
}

/**
 * The same drawing with the plan's bags as their real shapes (bag-art.ts) where bikeArt draws its boxes: the bag planner's own
 * sketches (the Gear advisor's). bikeArt stays the co-pilot's drawing byte for byte (C-DRAWING-SET), so its first screen keeps its size.
 */
export function shapedArt(spec: PlannerSpec, bags: BagView | null, options: ArtOptions = {}, paint: Paint | null = null): { svg: string; anchors: PlannerAnchors; label: string } {
  const art = bikeArt(spec, bags && { items: [], decks: { bar: null, rack: null }, bottles: [] }, options, paint);
  if (!bags) return art;
  const end = art.svg.lastIndexOf('</svg>');
  return { ...art, svg: art.svg.slice(0, end) + bagLayer(bags, art.anchors, options.theme ?? 'dark', options.idPrefix ?? 'bk') + art.svg.slice(end) };
}

export { SWATCHES, nearestSwatchName, oklabMedian } from './colour.ts';
export { normaliseBike } from './normalise.ts';
export { colourName, DEFAULT_COLOURS, FADES, forkColours, pairFor, PATTERN_LIST } from './paint.ts';
export { PT as PAINT_WORDS } from '../wording/en-paint.ts';
export { bagShape, PAIR_OFFSET } from './shapes.ts';

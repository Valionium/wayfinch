// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): bikeArt as both pages draw it, with the anchors carrying the
// bag planner's own tap targets and tags (targets.ts), which the co-pilot never needs.
import { bikeArt as drawBike } from './art.ts';
import type { Anchors, ArtOptions, P } from './art.ts';
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

export function bikeArt(spec: BikeSpec, bags: BagView | null, options: ArtOptions = {}): { svg: string; anchors: PlannerAnchors; label: string } {
  const art = drawBike(spec, bags, options);
  return { ...art, anchors: withTargets(art.anchors) };
}

export { SWATCHES, nearestSwatchName, oklabMedian } from './colour.ts';
export { normaliseBike } from './normalise.ts';
export { resolveBikeSpec } from './spec.ts';

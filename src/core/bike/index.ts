// Your bike (spec sections 3.7 and 7.4): the one module both pages draw the bike with. Pure: no DOM, no storage, no requests.
import type { LoadSummary } from '../types.ts';
import { W } from '../wording/en.ts';
import type { BikeRecord } from './normalise.ts';
import type { BagView, BikeSpec, PlanView } from './spec.ts';
import { parseTyre } from './tyres.ts';

export { bikeArt, bottleArt, fillColour, labelOf, markerArt } from './art.ts';
export type { Anchors, ArtOptions, Box, Hit, Placed, Spot } from './art.ts';
export { SWATCHES, hexToOklab, nearestSwatchName, oklabMedian, oklabToHex } from './colour.ts';
export { normaliseBike } from './normalise.ts';
export type { BikeRecord } from './normalise.ts';
export { resolveBikeSpec } from './spec.ts';
export type { BagItem, BagView, BikeSpec, BikeType, Mark, Part, PlanView } from './spec.ts';
export { parseTyre } from './tyres.ts';

const TYPE_WORD = { road: W.bikeTypeRoad, gravel: W.bikeTypeGravel, touring: W.bikeTypeTouring, trekking: W.bikeTypeTrekking, mtb: W.bikeTypeMtb, fat: W.bikeTypeFat };
const STYLE_WORD = {
  'diamond-level': W.bikeStyleLevel, 'diamond-sloping': W.bikeStyleSloping, compact: W.bikeStyleCompact, trapeze: W.bikeStyleTrapeze,
  mixte: W.bikeStyleMixte, 'step-through': W.bikeStyleStep, 'full-suspension': W.bikeStyleFull,
};
const BARS_WORD = { drop: W.bikeBarsDrop, flat: W.bikeBarsFlat, other: W.bikeBarsOther };

/**
 * Bags are drawn only when the summary's bike is this bike, both none counting as a match (section 7.4). A summary naming a bike that
 * neither the library nor the plan's bike holds names none (section 7.1). An empty plan is no bags.
 */
export function bagViewOf(summary: LoadSummary | null, bike: BikeRecord | null, known: readonly string[] = bike ? [bike.id] : []): BagView | null {
  if (!summary || 'empty' in summary) return null;
  const named = summary.bikeId !== null && known.includes(summary.bikeId) ? summary.bikeId : null;
  if (named !== (bike?.id ?? null)) return null;
  return { items: summary.bags.items, decks: summary.decks, bottles: summary.water.bottles };
}

/** What the plan's bags add to the caption: panniers, a rack-top bag, or the bags. */
function bagsWord(plan: PlanView | null): string | null {
  if (!plan) return null;
  if (plan.items.some((i) => i.pos === 'rack')) return W.bikePanniers;
  if (plan.items.length > 0 || plan.bottles.length > 0 || plan.decks.bar !== null) return W.bikeBags;
  return plan.decks.rack !== null ? W.bikeRackTop : null;
}

/**
 * One line under the drawing that names what it was drawn from (sections 3.7 and 8): what the rider entered, then the plan's bags. A frame
 * from a style and size alone is never "your frame"; nothing reads as missing.
 */
export function captionOf(spec: BikeSpec, bike: BikeRecord | null, plan: PlanView | null): { text: string; action: string } {
  const action = bike ? W.bikeMakeItYours : W.bikeAddYours;
  const parts: string[] = [];
  if (spec.style.mark === 'entered') parts.push(W.bikeFrameStyle(STYLE_WORD[spec.style.value], spec.size.mark === 'entered' ? spec.size.value : null));
  else if (spec.size.mark === 'entered') parts.push(W.bikeFrameSize(spec.size.value));
  const front = parseTyre(bike?.frontTyre);
  const rear = parseTyre(bike?.rearTyre);
  const etrto = [front, rear].filter((t) => t !== null).map((t) => `${Math.round(t.widthMm)}-${t.rimMm}`);
  if (etrto.length > 0) parts.push(W.bikeTyresEtrto([...new Set(etrto)]));
  else if (spec.frontMm.mark === 'entered' || spec.rearMm.mark === 'entered') parts.push(W.bikeTyresWidth(String(Math.round(spec.frontMm.mark === 'entered' ? spec.frontMm.value : spec.rearMm.value))));
  else if (spec.rimMm.mark === 'entered' && bike && bike.pressure.wheel !== 'unknown') parts.push(W.bikeWheels(bike.pressure.wheel));
  if (spec.bars.mark === 'entered') parts.push(BARS_WORD[spec.bars.value]);
  if (spec.ebike.mark === 'entered' && spec.ebike.value) parts.push(W.bikeKind('', true).trim());
  const bags = bagsWord(plan);
  const kind = W.bikeKind(TYPE_WORD[spec.type.value], false);
  if (parts.length === 0) return { text: bags ? W.bikeTypicalWith(kind, bags) : W.bikeTypical(kind), action };
  if (bags) parts.push(bags);
  return { text: W.bikeDrawnFrom(parts), action };
}

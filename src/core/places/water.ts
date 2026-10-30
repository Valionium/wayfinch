// Water classes of spec section 6.0.
export type WaterClass = 'A' | 'B' | 'C' | 'D';

const v = (tags: Record<string, string>, key: string): string | undefined => tags[key]?.trim().toLowerCase();

/**
 * null when the object gives no water, D when it is excluded, otherwise A, B or C.
 * A: mapped as drinking water. B: probably drinkable. C: treat or filter first.
 */
export function waterClass(tags: Record<string, string>, ctx: { inCemetery: boolean }): WaterClass | null {
  const amenity = v(tags, 'amenity');
  const manMade = v(tags, 'man_made');
  const natural = v(tags, 'natural');
  const dw = v(tags, 'drinking_water');
  const legal = v(tags, 'drinking_water:legal');
  const refill = v(tags, 'drinking_water:refill') === 'yes';

  const isTap = manMade === 'water_tap';
  const isSpringOrWell = natural === 'spring' || manMade === 'water_well';
  const isNamedSource = amenity === 'drinking_water' || amenity === 'water_point';
  const isFountain = amenity === 'fountain';
  const isDrinkingToilet = amenity === 'toilets' && dw === 'yes';
  if (!(isTap || isSpringOrWell || isNamedSource || isFountain || isDrinkingToilet || refill)) return null;

  // Excluded: said not to be drinking water, disused, private, or a decorative fountain.
  const access = v(tags, 'access');
  if (dw === 'no' || v(tags, 'disused') === 'yes' || v(tags, 'abandoned') === 'yes' || access === 'private' || access === 'no') return 'D';
  if (isFountain && dw !== 'yes' && !isNamedSource && !isTap && !isSpringOrWell && !refill) return 'D';

  if (legal === 'no') return 'C';
  if (isNamedSource || legal === 'yes') return 'A';
  if (dw === 'yes' && (isTap || isFountain || isDrinkingToilet)) return 'A';
  if (dw === 'yes' && isSpringOrWell) return 'B';
  if (isSpringOrWell) return 'C';
  if (isTap) return ctx.inCemetery || dw !== undefined ? 'C' : 'B';
  if (refill) return 'B';
  return 'C';
}

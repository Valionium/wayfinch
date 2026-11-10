// The bike's type sorts Bike care's lists (bike view design of 9 November 2026, 4; the owner's answer 5 (a)): the cards and tasks usual on
// the rider's type of bike come first, the others after them, slightly greyed, and none is ever hidden. The type is often only guessed
// (from the tyres' width), so it only sorts; what hides a card is still the bike's own details (fit.ts, ruling R3).
import type { BikeSpec, BikeType } from '../bike/spec.ts';
import type { CareDetails, CareKey, Conditions } from './types.ts';

/**
 * What a type of bike usually has, for the details it says something clear about: a road bike's tyres take inner tubes and it has no
 * suspension; a mountain bike runs tubeless with a suspension fork. A detail a type says nothing clear about is left out, and sorts
 * nothing. The owner reads this table with the pull request.
 */
export const TYPE_USUAL: Readonly<Record<BikeType, Conditions>> = {
  road: { tyres: ['tubes'], suspension: ['none'], gears: ['derailleur'] },
  gravel: { suspension: ['none'], gears: ['derailleur'] },
  touring: { tyres: ['tubes'], suspension: ['none'] },
  trekking: { tyres: ['tubes'] },
  mtb: { tyres: ['tubeless'], suspension: ['front', 'full'], gears: ['derailleur'] },
  fat: { suspension: ['none'] },
};

/** The rider's bike type, or null where nothing tells it (no bike, or a bike with no detail that gives its type). */
export function riderType(spec: BikeSpec | null): BikeType | null {
  return spec && spec.type.mark !== 'default' ? spec.type.value : null;
}

const KEYS: readonly CareKey[] = ['brakes', 'tyres', 'drive', 'gears', 'shifting', 'suspension', 'ebike'];

/**
 * Whether an item is usual on the type: for every detail it depends on that the rider has not told (a told one has already decided
 * whether it shows), the type's usual values meet the item's. No type (no bike, or nothing that tells its type): every item is usual.
 */
export function usualOn(applies: Conditions, type: BikeType | null, d: CareDetails): boolean {
  if (!type) return true;
  const usual = TYPE_USUAL[type];
  for (const key of KEYS) {
    const wants = applies[key] as readonly string[] | undefined;
    const has = usual[key] as readonly string[] | undefined;
    if (!wants || !has || d[key] !== null) continue;
    if (!wants.some((v) => has.includes(v))) return false;
  }
  return true;
}

/** The list with the items usual on the type first, each group in the list's own order, and which are not usual. */
export function byType<T extends { applies: Conditions }>(list: readonly T[], type: BikeType | null, d: CareDetails): { item: T; usual: boolean }[] {
  const marked = list.map((item) => ({ item, usual: usualOn(item.applies, type, d) }));
  return [...marked.filter((m) => m.usual), ...marked.filter((m) => !m.usual)];
}

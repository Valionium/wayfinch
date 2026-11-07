// Validity and ranking of the Gear advisor's candidates (design §3.2, §3.3; plan Task 2).
import { DECIDED, WEIGHTS } from './table.ts';
import type { AdvisorInput, Candidate, Pos, Suggestion, TrialResult } from './types.ts';

const round2 = (x: number) => Math.round(x * 100) / 100;
/** Back litres may rise by this much from rounding alone. */
const BACK_SLACK_L = 0.005;

/** Something left over: litres or an item the packing could not place. */
export function overflows(r: TrialResult): boolean {
  return r.overL > 0 || r.spillIds.length > 0;
}

/**
 * "Everything fits" is a rule, not a goal (design §3.2): nothing overflows, the litres on the rider's back do not rise, and the
 * must-reach items out of reach do not rise.
 */
export function isValid(base: TrialResult, r: TrialResult): boolean {
  return !overflows(r) && r.backL <= base.backL + BACK_SLACK_L && r.outOfReach <= base.outOfReach;
}

/** Better handling's score: the sum over every placed kilo of its position's weight (WEIGHTS), rounded to 0.01. Lower is better. */
export function handlingScore(r: TrialResult): number {
  let sum = 0;
  for (const [pos, kg] of Object.entries(r.kgByPos) as [Pos, number | undefined][]) sum += (kg ?? 0) * WEIGHTS[pos];
  return round2(sum);
}

const KIND_ORDER: Record<Candidate['kind'], number> = { add: 0, 'add-two': 0, deck: 0, ahead: 0, swap: 1 };
const byNumber = (a: number, b: number) => round2(a) - round2(b);

/**
 * The order of suggestions for a goal, best first. Get the backpack off: fewer litres on the back, then fewer kilos there. Better
 * handling: the lower score. Ties (§3.3): fewer new bags, then fewer litres, then an addition before a swap. Values are compared to the
 * hundredth.
 */
export function compareFor(goal: AdvisorInput['goal']): (a: Suggestion, b: Suggestion) => number {
  return (a, b) => {
    const onGoal = goal === 'backpack'
      ? byNumber(a.result.backL, b.result.backL) || byNumber(a.result.backKg, b.result.backKg)
      : byNumber(a.score, b.score);
    return onGoal || a.newBags - b.newBags || byNumber(a.litres, b.litres) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  };
}

/** The owner's order of what a suggestion adds (DECIDED.addOrder), lowest first: the bags' positions and the rack deck. */
function orderOf(c: Candidate): number[] {
  const order = DECIDED.addOrder as Readonly<Record<string, number>>;
  return [...c.add.map((b) => order[b.pos] ?? 99), ...(c.deck ? [order.deck ?? 99] : [])].sort((a, b) => a - b);
}

/** The owner's order of two suggestions: the first place their orders differ; a shorter one first when one leads the other. */
export function byOwnerOrder(a: Candidate, b: Candidate): number {
  const x = orderOf(a), y = orderOf(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return x.length - y.length;
}

/**
 * Minimal's order (owner, 7 Nov): the fewest new bags first, then the owner's order (top tube and frame bag, then seat pack, then
 * handlebar bag, then fork cages), then the goal's order.
 */
export function compareMinimal(goal: AdvisorInput['goal']): (a: Suggestion, b: Suggestion) => number {
  const onGoal = compareFor(goal);
  return (a, b) => a.newBags - b.newBags || byOwnerOrder(a, b) || onGoal(a, b);
}

/**
 * The size range shown (§3.3): from the chosen size to the largest valid size at most two litres above it, capped at the type's top
 * (`max`). With whole litres that is the largest of chosen + 1 and chosen + 2 that is valid; with the top tube's half litres it may also
 * be chosen + 0.5 or + 1.5. A single valid size gives [chosen, chosen].
 */
export function sizeRange(validSizes: number[], chosen: number, max: number): [number, number] {
  const up = DECIDED.rangeUpToL;
  const counts = (s: number) => DECIDED.rangeHalfLitres || Number.isInteger(Math.round((s - chosen) * 1e6) / 1e6);
  let top = chosen;
  for (const s of validSizes) if (s > top && s <= chosen + up + 1e-9 && s <= max + 1e-9 && counts(s)) top = s;
  return [chosen, top];
}

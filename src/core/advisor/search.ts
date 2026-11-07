// The Gear advisor's search (design §3.1–3.3; plan Task 3). Pure: the planner's packing comes in as `input.trial`, so the same search
// runs in Vitest with a stand-in and in the bag planner with its own, frozen planWith.
import { candidates } from './candidates.ts';
import { compareFor, handlingScore, isValid, overflows, sizeRange } from './rank.ts';
import { MAX_TRIALS, MIN_GAIN_BACK_L, MIN_GAIN_SCORE, SIZE_RANGES, type SizedPos } from './table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Candidate, Suggestion } from './types.ts';

/** The search yields after every this many trials, so the page can show "Trying N options…" and stay responsive. */
const SLICE = 20;
const EPS = 1e-9;
/** Back litres at or under this are nothing on the back (rounding alone). */
const NOTHING_ON_BACK_L = 0.005;

/** One suggestion per bag to get: the added positions, whatever was taken out (design: "each a different type or position"). */
const keyOf = (c: Candidate) => c.add.map((b) => b.pos).join('+');

function bagsFor(input: AdvisorInput, c: Candidate): BagIn[] {
  return [...input.bags.filter((b) => b.uid !== c.remove), ...c.add];
}

/**
 * The search, in slices: it yields the number of trials so far after every 20, and returns the answer. Order (§3.1): every single
 * added bag; then, for Better handling, every swap; two added bags only when neither gave an answer. It stops at MAX_TRIALS (the base
 * trial included) and answers from what it tried.
 */
export function* adviseSteps(input: AdvisorInput): Generator<number, AdvisorAnswer> {
  const frameReason = input.frameReason;
  let trials = 0;
  const base = input.trial(input.bags, input.decks);
  trials++;
  const baseOver = overflows(base);
  const baseScore = handlingScore(base);
  if (input.goal === 'backpack' && !baseOver && base.backL <= NOTHING_ON_BACK_L) return { kind: 'already-good', tried: trials, frameReason };

  const tried: Suggestion[] = [];
  const good: Suggestion[] = [];
  // A candidate counts when it is valid and, unless the rider's things overflow now (then any full fix counts), gains enough (decision 6).
  const gains = (s: Suggestion) => baseOver || (input.goal === 'handling'
    ? baseScore - s.score >= MIN_GAIN_SCORE - EPS
    : base.backL - s.result.backL >= MIN_GAIN_BACK_L - EPS);

  let stopped = false;
  const phases: ('add' | 'swap' | 'add-two')[] = input.goal === 'handling' ? ['add', 'swap', 'add-two'] : ['add', 'add-two'];
  for (const phase of phases) {
    if (stopped || (phase === 'add-two' && good.length > 0)) break;
    for (const c of candidates(input, phase)) {
      if (trials >= MAX_TRIALS) { stopped = true; break; }
      const result = input.trial(bagsFor(input, c), c.decks);
      trials++;
      const s: Suggestion = { ...c, result, score: handlingScore(result), rangeL: [c.add[0]!.L, c.add[0]!.L], tags: c.tags };
      tried.push(s);
      if (isValid(base, result) && gains(s)) good.push(s);
      if (trials % SLICE === 0) yield trials;
    }
  }

  const order = compareFor(input.goal);
  if (good.length === 0) {
    if (!baseOver) return { kind: 'already-good', tried: trials, frameReason };
    const closest = [...tried].sort((a, b) => a.result.overL - b.result.overL || a.result.spillIds.length - b.result.spillIds.length || order(a, b))[0] ?? null;
    return { kind: 'nothing-helps', closest, tried: trials, frameReason };
  }

  const ranked = [...good].sort(order);
  const items: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ ...s, rangeL: rangeOf(s, good.filter((g) => keyOf(g) === key && g.kind === s.kind && g.remove === s.remove)) });
    if (items.length === 3) break;
  }
  return { kind: 'suggestions', items, tried: trials, frameReason };
}

/** The size range shown (§3.3): frame bags and two-bag suggestions at their own size; others from the valid sizes of the same suggestion. */
function rangeOf(s: Suggestion, same: Suggestion[]): [number, number] {
  const bag = s.add[0]!;
  if (s.kind === 'add-two' || bag.pos === 'frame' || !(bag.pos in SIZE_RANGES)) return [bag.L, bag.L];
  return sizeRange(same.map((g) => g.add[0]!.L), bag.L, SIZE_RANGES[bag.pos as SizedPos].max);
}

/** The whole search at once. */
export function advise(input: AdvisorInput): AdvisorAnswer {
  const steps = adviseSteps(input);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// The Gear advisor's search (design §3.1–3.3; plan Task 3). Pure: the planner's packing comes in as `input.trial`, so the same search
// runs in Vitest with a stand-in and in the bag planner with its own, frozen planWith.
import { candidates, extensions, panniersAllowed, planAsStyled, sizeOptions } from './candidates.ts';
import { byOwnerOrder, compareFor, compareMinimal, handlingScore, isValid, overflows, sizeRange } from './rank.ts';
import { DECIDED, MAX_TRIALS, MIN_GAIN_BACK_L, MIN_GAIN_SCORE, SIZE_RANGES, type SizedPos } from './table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Candidate, Suggestion, TrialResult } from './types.ts';

/** The search yields after every this many trials, so the page can show "Trying N options…" and stay responsive. */
const SLICE = 20;
const EPS = 1e-9;
/** Back litres at or under this are nothing on the back (rounding alone). */
const NOTHING_ON_BACK_L = 0.005;

/**
 * One suggestion per bag to get: the added positions, a pair apart from a single (owner, 7 Nov); whatever was taken out (design: "each
 * a different type or position").
 */
const keyOf = (c: Candidate) => [...c.add.map((b) => b.pos + (b.pair ? '×2' : '')), ...(c.deck ? ['deck'] : [])].join('+');

function bagsFor(input: AdvisorInput, c: Candidate): BagIn[] {
  return [...input.bags.filter((b) => b.uid !== c.remove), ...c.add];
}

/**
 * The search, in slices: it yields the number of trials so far after every 20, and returns the answer. Order (§3.1): every single
 * added bag; then, for Better handling, every swap; two added bags only when neither gave an answer with one new bag at most (a pair is
 * two). Panniers (the owner's ruling of 7 Nov): never under Bikepacking bags only; under Panniers are fine in every phase, ranked last;
 * under Bags first only if needed: a second round of the phases, with only the candidates holding panniers, when the first round, with
 * none, gave nothing that counts. The answer is Minimal, the fewest new things that count, in the owner's order, and Looking ahead,
 * Minimal's first plus one more that does better by decision 6 (owner, 7 Nov). It stops at MAX_TRIALS (the base trial included) and
 * answers from what it tried.
 */
export function* adviseSteps(given: AdvisorInput): Generator<number, AdvisorAnswer> {
  // The base and every candidate run on the plan as the setup reads it: under Bikepacking bags only, without the rider's panniers.
  const input = planAsStyled(given);
  const frameReason = input.frameReason;
  let trials = 0;
  const base = input.trial(input.bags, input.decks);
  trials++;
  const baseOver = overflows(base);
  const baseScore = handlingScore(base);
  if (input.goal === 'backpack' && !baseOver && base.backL <= NOTHING_ON_BACK_L) return { kind: 'already-good', tried: trials, frameReason, partial: false };

  const tried: Suggestion[] = [];
  const good: Suggestion[] = [];
  // A candidate counts when it is valid and, unless the rider's things overflow now (then any full fix counts), gains enough (decision 6).
  const gains = (s: Suggestion) => baseOver || (input.goal === 'handling'
    ? baseScore - s.score >= MIN_GAIN_SCORE - EPS
    : base.backL - s.result.backL >= MIN_GAIN_BACK_L - EPS);

  let stopped = false;
  // a hand-back after every SLICE trials, or sooner when the page's clock asks for it (review of PR 61, I4)
  const handBack = () => trials % SLICE === 0 || (input.handBack?.() ?? false);
  const phases: ('add' | 'swap' | 'add-two')[] = input.goal === 'handling' ? ['add', 'swap', 'add-two'] : ['add', 'add-two'];
  // One round of the phases. `onlyPanniers`: Bags first's second round, which tries only the candidates holding panniers.
  function* round(panniers: boolean, onlyPanniers: boolean): Generator<number, Suggestion[]> {
    const found: Suggestion[] = [];
    for (const phase of phases) {
      if (stopped || (phase === 'add-two' && found.some((g) => g.newBags <= 1))) break;
      for (const c of candidates(input, phase, panniers)) {
        if (onlyPanniers && !c.add.some((b) => b.pos === 'rack')) continue;
        if (trials >= MAX_TRIALS) { stopped = true; break; }
        const result = input.trial(bagsFor(input, c), c.decks);
        trials++;
        const s = suggestion(c, result);
        tried.push(s);
        if (isValid(base, result) && gains(s)) found.push(s);
        if (handBack()) yield trials;
      }
    }
    good.push(...found);
    return found;
  }
  // Bags first: panniers only if needed, a second round when the bags alone do not do it (secondRound).
  const secondRound = input.style === 'bags-first' && panniersAllowed(input);
  let panniers = input.style === 'panniers';
  const later: Suggestion[] = [];   // the second round's finds, for Looking ahead when Minimal came from the bags
  yield* round(panniers, false);
  if (secondRound && good.length === 0) { panniers = true; yield* round(true, true); }

  const order = compareFor(input.goal);
  if (good.length === 0) {
    const common = { tried: trials, frameReason, partial: stopped };
    if (!baseOver) {
      // Get the backpack off never says "already good" while litres stay on the back (review of PR 57, I4).
      return input.goal === 'backpack' ? { kind: 'cannot-reduce', backL: base.backL, ...common } : { kind: 'already-good', ...common };
    }
    const closest = [...tried].sort((a, b) => a.result.overL - b.result.overL || a.result.spillIds.length - b.result.spillIds.length || order(a, b))[0] ?? null;
    return { kind: 'nothing-helps', closest, ...common };
  }

  // Minimal: only the fewest new things that count (using what the rider has, the deck of a rack fitted, is none, and can be the whole
  // answer), in the owner's order, then the goal's. Get the backpack off is done when nothing stays on the back: when one of those
  // fewest does that, Minimal holds only such (DECIDED.backpackWholeFirst).
  const whole = (x: Suggestion) => x.result.backL <= NOTHING_ON_BACK_L;
  const fewest = Math.min(...good.map((g) => g.newBags));
  const fewestGood = good.filter((g) => g.newBags === fewest);
  const wholeGood = input.goal === 'backpack' && DECIDED.backpackWholeFirst ? fewestGood.filter(whole) : [];
  const ranked = (wholeGood.length > 0 ? wholeGood : fewestGood).sort(compareMinimal(input.goal));
  const items: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of ranked) {
    const key = keyOf(s);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ ...s, rangeL: rangeOf(s, good.filter((g) => keyOf(g) === key && g.kind === s.kind && g.remove === s.remove)) });
    if (items.length === 3) break;
  }

  // Looking ahead: a set that covers more, valid and better than Minimal's first on the goal by decision 6: Minimal's first as it stands
  // plus one more, or a counting suggestion with more new things (a rack with panniers, under Bags first from its second round).
  const first = items[0]!;
  const better = (s: Suggestion) => (input.goal === 'handling'
    ? first.score - s.score >= MIN_GAIN_SCORE - EPS
    : first.result.backL - s.result.backL >= MIN_GAIN_BACK_L - EPS);
  const pool: Suggestion[] = [];
  if (!stopped) {
    for (const c of extensions(input, first, panniers)) {
      if (trials >= MAX_TRIALS) { stopped = true; break; }
      const result = input.trial(bagsFor(input, c), c.decks);
      trials++;
      const s = suggestion(c, result);
      if (isValid(base, result) && better(s)) pool.push(s);
      if (handBack()) yield trials;
    }
  }
  // Bags first, the bags counted: panniers are still needed when nothing so far does the whole goal (Get the backpack off: nothing
  // takes everything off the back; Better handling: the bags counted, so they are not).
  if (secondRound && !panniers && !stopped && input.goal === 'backpack' && ![...good, ...pool].some(whole)) {
    later.push(...(yield* round(true, true)));
  }
  pool.push(...good.filter((g) => (g.newBags > first.newBags || later.includes(g)) && better(g)));
  let best = [...pool].sort((a, b) => order(a, b) || byOwnerOrder(a, b))[0] ?? null;

  // Get the backpack off: Looking ahead's two bags resized so the larger is as small as it can be while the back stays as empty (review
  // of PR 61, m2): Minimal's bag a size smaller each step, the other bag the smallest size that still does it.
  const maxL = (x: Suggestion) => Math.max(...x.add.map((b) => b.L));
  if (best && !stopped && input.goal === 'backpack' && best.kind === 'ahead' && best.remove === null && !best.deck && first.kind === 'add' && best.add.length === 2) {
    const [p, x] = best.add as [BagIn, BagIn];
    const smaller = sizeOptions(input, p).filter((o) => o.bag.L < p.L - EPS).reverse();
    const larger = sizeOptions(input, x).filter((o) => o.bag.L >= x.L - EPS);
    let j = 0;
    outer: for (const po of smaller) {
      for (; j < larger.length; j++) {
        const xo = larger[j]!;
        if (Math.max(po.bag.L, xo.bag.L) >= maxL(best) - EPS) break outer;
        if (trials >= MAX_TRIALS) { stopped = true; break outer; }
        const add = [{ uid: p.uid, ...po.bag }, { uid: x.uid, ...xo.bag }];
        const c: Candidate = { ...best, add, litres: Math.round(add.reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0) * 100) / 100, tags: [...new Set([...po.tags, ...xo.tags])] };
        const result = input.trial(bagsFor(input, c), c.decks);
        trials++;
        const ok = isValid(base, result) && result.backL <= best.result.backL + NOTHING_ON_BACK_L;
        if (handBack()) yield trials;
        if (ok) { best = suggestion(c, result); break; }
      }
    }
  }
  // the range shown: a counting add or swap from the pool as Minimal shows one (review of PR 61, m3); a set at its own sizes
  const ahead = best && { ...best, rangeL: best.kind === 'add' || best.kind === 'swap'
    ? rangeOf(best, good.filter((g) => keyOf(g) === keyOf(best!) && g.kind === best!.kind && g.remove === best!.remove))
    : [best.add[0]?.L ?? 0, best.add[0]?.L ?? 0] as [number, number] };
  return { kind: 'suggestions', items, ahead, tried: trials, frameReason, partial: stopped };
}

function suggestion(c: Candidate, result: TrialResult): Suggestion {
  const L = c.add[0]?.L ?? 0;
  return { ...c, result, score: handlingScore(result), rangeL: [L, L], tags: c.tags };
}

/** The size range shown (§3.3): frame bags and two-bag suggestions at their own size; others from the valid sizes of the same suggestion. */
function rangeOf(s: Suggestion, same: Suggestion[]): [number, number] {
  const bag = s.add[0];
  if (!bag) return [0, 0];   // the rack deck alone: no size
  if (s.kind !== 'add' && s.kind !== 'swap') return [bag.L, bag.L];
  if (bag.pos === 'frame' || !(bag.pos in SIZE_RANGES)) return [bag.L, bag.L];
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

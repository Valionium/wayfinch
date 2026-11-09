// The Gear advisor's search (design §3.1–3.3; plan Task 3). Pure: the planner's packing comes in as `input.trial`, so the same search
// runs in Vitest with a stand-in and in the bag planner with its own, frozen planWith.
import { candidates, extensions, panniersAllowed, planAsStyled, rackFitted, sizeOptions } from './candidates.ts';
import { bothScore, byOwnerOrder, compareFor, compareMinimal, handlingScore, isValid, overflows, sizeRange } from './rank.ts';
import { DECIDED, MAX_TRIALS, MIN_GAIN_BACK_L, MIN_GAIN_SCORE, SIZE_RANGES, type SizedPos } from './table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Candidate, Setup, Suggestion, TrialResult } from './types.ts';

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

/**
 * Whether `s` does better than `ref` by decision 6 on the goal: Better handling 0.5 off the score, Get the backpack off 0.5 L off the
 * back; both goals at once (D): either of them, with the combined score lower too (`base`, the plan as it stands, sets its shares).
 */
function betterThan(goal: AdvisorInput['goal'], base: TrialResult, ref: TrialResult, s: TrialResult): boolean {
  const hand = handlingScore(ref) - handlingScore(s) >= MIN_GAIN_SCORE - EPS;
  const back = ref.backL - s.backL >= MIN_GAIN_BACK_L - EPS;
  if (goal === 'handling') return hand;
  if (goal === 'backpack') return back;
  return (hand || back) && bothScore(base, s) < bothScore(base, ref) - EPS;
}
/** About the same result as `ref` (side by side, the owner's rulings on PR 61): within decision 6 on the goal; both goals, on each. */
function aboutSame(goal: AdvisorInput['goal'], ref: Suggestion, x: Suggestion): boolean {
  const hand = Math.abs(x.score - ref.score) <= MIN_GAIN_SCORE + EPS;
  const back = Math.abs(x.result.backL - ref.result.backL) <= MIN_GAIN_BACK_L + EPS;
  return goal === 'handling' ? hand : goal === 'backpack' ? back : hand && back;
}

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
  // Both goals (D): a gain on either counts, with the combined score below the plan's own (review of PR 81, M1).
  const gains = (s: Suggestion) => baseOver || (input.goal === 'handling'
    ? baseScore - s.score >= MIN_GAIN_SCORE - EPS
    : input.goal === 'backpack' ? base.backL - s.result.backL >= MIN_GAIN_BACK_L - EPS
      : betterThan('both', base, base, s.result));

  let stopped = false;
  // a hand-back after every SLICE trials, or sooner when the page's clock asks for it (review of PR 61, I4)
  const handBack = () => trials % SLICE === 0 || (input.handBack?.() ?? false);
  const phases: ('add' | 'swap' | 'add-two')[] = input.goal !== 'backpack' ? ['add', 'swap', 'add-two'] : ['add', 'add-two'];
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

  const order = compareFor(input.goal, base);
  if (good.length === 0) {
    const common = { tried: trials, frameReason, partial: stopped };
    if (!baseOver) {
      // Get the backpack off never says "already good" while litres stay on the back (review of PR 57, I4).
      // Both goals (D) the same, while litres stay on the back.
      const backLeft = input.goal === 'backpack' || (input.goal === 'both' && base.backL > NOTHING_ON_BACK_L);
      return backLeft ? { kind: 'cannot-reduce', backL: base.backL, ...common } : { kind: 'already-good', ...common };
    }
    const closest = [...tried].sort((a, b) => a.result.overL - b.result.overL || a.result.spillIds.length - b.result.spillIds.length || order(a, b))[0] ?? null;
    return { kind: 'nothing-helps', closest, ...common };
  }

  // Minimal: only the fewest new things that count (using what the rider has, the deck of a rack fitted, is none, and can be the whole
  // answer), in the owner's order, then the goal's. Get the backpack off is done when nothing stays on the back: when one of those
  // fewest does that, Minimal holds only such (DECIDED.backpackWholeFirst).
  // Get the backpack off: only what takes a real amount off, a share of the litres on the back or everything (the owner's ruling on
  // PR 61, I2; DECIDED.backpackRealShare); when nothing does, all that count.
  const whole = (x: Suggestion) => x.result.backL <= NOTHING_ON_BACK_L;
  const real = (x: Suggestion) => input.goal !== 'backpack' || base.backL <= NOTHING_ON_BACK_L || whole(x)
    || base.backL - x.result.backL >= DECIDED.backpackRealShare * base.backL - EPS;
  const realGood = good.filter(real);
  const minimalPool = realGood.length > 0 ? realGood : good;
  const fewest = Math.min(...minimalPool.map((g) => g.newBags));
  const fewestGood = minimalPool.filter((g) => g.newBags === fewest);
  const wholeGood = input.goal === 'backpack' && DECIDED.backpackWholeFirst ? fewestGood.filter(whole) : [];
  const ranked = (wholeGood.length > 0 ? wholeGood : fewestGood).sort(compareMinimal(input.goal, base));
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
  const better = (s: Suggestion) => betterThan(input.goal, base, first.result, s.result);
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
  const backGoal = input.goal === 'backpack' || (input.goal === 'both' && base.backL > NOTHING_ON_BACK_L);
  if (secondRound && !panniers && !stopped && backGoal && ![...good, ...pool].some(whole)) {
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
  const shown = (x: Suggestion): Suggestion => ({ ...x, rangeL: x.kind === 'add' || x.kind === 'swap'
    ? rangeOf(x, good.filter((g) => keyOf(g) === keyOf(x) && g.kind === x.kind && g.remove === x.remove))
    : [x.add[0]?.L ?? 0, x.add[0]?.L ?? 0] });
  const ahead = best && shown(best);

  // Side by side (the owner's rulings on PR 61): combinations reaching about the same result, within decision 6.
  const bestItem = [...items].sort(order)[0]!;
  const near = items.map((x, k) => (aboutSame(input.goal, bestItem, x) ? k : -1)).filter((k) => k >= 0);
  const minimalSame = near.length >= 2 ? near : [];
  // the bags a set adds; a bag taken out does not make another combination (re-check of PR 61, n6: the same panniers, with or without
  // the backpack left at home, are one)
  const combo = (x: Suggestion) => [...x.add.map((b) => b.pos + (b.pair ? '×2' : '')), ...(x.deck ? ['deck'] : [])].sort().join('+');
  const aheadAlts: Suggestion[] = [];
  if (ahead) {
    const seen = new Set([combo(ahead)]);
    for (const x of [...pool].sort((a, b) => order(a, b) || byOwnerOrder(a, b))) {
      if (aheadAlts.length === 2) break;
      if (seen.has(combo(x)) || !aboutSame(input.goal, ahead, x)) continue;
      seen.add(combo(x));
      aheadAlts.push(shown(x));
    }
  }
  return { kind: 'suggestions', items, ahead, minimalSame, aheadAlts, tried: trials, frameReason, partial: stopped };
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

/**
 * A bigger change (the owner's preview check of 8 Nov, F): offered where the setup choice ruled out something the bike can take. Under
 * Bikepacking bags only, panniers or a rack to fit; under Bags first, panniers though bags do it. Never under Panniers are fine, and never
 * with no rack fitted and rack mounts no (a fact, not a choice). With an answer, only where it could do more: Looking ahead found nothing
 * (and for Get the backpack off Minimal's first leaves something on the back), or nothing helps within the setup.
 */
export function biggerOffered(given: AdvisorInput, answer?: AdvisorAnswer): boolean {
  if (given.style === 'panniers' || !panniersAllowed({ ...planAsStyled(given), style: 'panniers' })) return false;
  if (!answer) return true;
  // Bags first's second round has already tried every pannier where nothing helps: a bigger change could find nothing (review of PR 81, M3)
  if (answer.kind === 'nothing-helps') return given.style === 'bags';
  if (answer.kind !== 'suggestions' || answer.ahead || !answer.items[0]) return false;
  return given.goal !== 'backpack' || answer.items[0].result.backL > NOTHING_ON_BACK_L;
}

/** What a bigger change answers: its best suggestion or none, the setup choice it goes beyond, and the trials it ran. */
export type BiggerAnswer = { bigger: Suggestion | null; overrides: Setup; tried: number; partial: boolean };

/**
 * The bigger change's search, in slices as adviseSteps: on the plan as the rider's setup reads it, with what that setup ruled out allowed
 * (Panniers are fine), only the candidates holding it. After suggestions: Minimal's first plus panniers (or a rack to fit, under
 * Bikepacking bags only), or those alone, valid and better than Minimal's first by decision 6. After nothing helps: one or two new
 * things holding it, valid (everything fits). The goal's order picks the best.
 */
export function* biggerSteps(given: AdvisorInput, answer: AdvisorAnswer): Generator<number, BiggerAnswer> {
  const overrides = given.style;
  if (!biggerOffered(given, answer)) return { bigger: null, overrides, tried: 0, partial: false };
  const input: AdvisorInput = { ...planAsStyled(given), style: 'panniers' };
  const fitted = rackFitted(input);
  const ruledOut = (c: Candidate) => c.add.some((b) => b.pos === 'rack') || (overrides === 'bags' && c.deck && !fitted);
  const first = answer.kind === 'suggestions' ? answer.items[0]! : null;
  let trials = 0;
  let partial = false;
  const base = input.trial(input.bags, input.decks);
  trials++;
  const found: Suggestion[] = [];
  const handBack = () => trials % SLICE === 0 || (input.handBack?.() ?? false);
  const tries = first ? [...extensions(input, first, true), ...candidates(input, 'add', true)]
    : [...candidates(input, 'add', true), ...candidates(input, 'add-two', true)];
  for (const c of tries) {
    if (!ruledOut(c)) continue;
    if (trials >= MAX_TRIALS) { partial = true; break; }
    const result = input.trial(bagsFor(input, c), c.decks);
    trials++;
    const s = suggestion(c, result);
    if (isValid(base, result) && (!first || betterThan(input.goal, base, first.result, result))) found.push(s);
    if (handBack()) yield trials;
  }
  const order = compareFor(input.goal, base);
  const best = found.sort((a, b) => order(a, b) || byOwnerOrder(a, b))[0] ?? null;
  return { bigger: best && { ...best, rangeL: [best.add[0]?.L ?? 0, best.add[0]?.L ?? 0] }, overrides, tried: trials, partial };
}

/** The whole search at once. */
export function advise(input: AdvisorInput): AdvisorAnswer {
  const steps = adviseSteps(input);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

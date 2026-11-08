// The Gear advisor's search (design §3.1–3.3; plan Task 3). Pure: the planner's packing comes in as `input.trial`, so the same search
// runs in Vitest with a stand-in and in the bag planner with its own, frozen planWith.
import { candidates, extensions, panniersAllowed, planAsStyled, rackFitted, sizeOptions } from './candidates.ts';
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
  if (given.goal !== 'both') return yield* oneGoal(given, 0);
  // Both goals together (the owner, 8 Nov): the back first, as Get the backpack off, handling breaking its ties. With nothing on the
  // back that is Better handling; when nothing takes more off the back, the suggestions are Better handling's, saying how much stays.
  const back = yield* oneGoal(given, 0);
  if (back.kind === 'suggestions' || back.partial || back.tried >= MAX_TRIALS) return back;
  const handling = yield* oneGoal({ ...given, goal: 'handling' }, back.tried);
  if (handling.kind === 'suggestions') return back.kind === 'cannot-reduce' ? { ...handling, backStays: back.backL } : handling;
  return back.kind === 'already-good' ? handling : { ...back, tried: handling.tried };
}

/** One goal's search; 'both' reads as Get the backpack off with its own order. `used`: the trials run before, counted on from. */
function* oneGoal(given: AdvisorInput, used: number): Generator<number, AdvisorAnswer> {
  // The base and every candidate run on the plan as the setup reads it: under Bikepacking bags only, without the rider's panniers.
  const input = planAsStyled(given);
  const frameReason = input.frameReason;
  const onBack = input.goal !== 'handling';
  let trials = used;
  const base = input.trial(input.bags, input.decks);
  trials++;
  const baseOver = overflows(base);
  const baseScore = handlingScore(base);
  if (onBack && !baseOver && base.backL <= NOTHING_ON_BACK_L) return { kind: 'already-good', tried: trials, frameReason, partial: false };

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
      return onBack ? { kind: 'cannot-reduce', backL: base.backL, ...common } : { kind: 'already-good', ...common };
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
  const real = (x: Suggestion) => !onBack || base.backL <= NOTHING_ON_BACK_L || whole(x)
    || base.backL - x.result.backL >= DECIDED.backpackRealShare * base.backL - EPS;
  const realGood = good.filter(real);
  const minimalPool = realGood.length > 0 ? realGood : good;
  const fewest = Math.min(...minimalPool.map((g) => g.newBags));
  const fewestGood = minimalPool.filter((g) => g.newBags === fewest);
  const wholeGood = onBack && DECIDED.backpackWholeFirst ? fewestGood.filter(whole) : [];
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
  if (secondRound && !panniers && !stopped && onBack && ![...good, ...pool].some(whole)) {
    later.push(...(yield* round(true, true)));
  }
  pool.push(...good.filter((g) => (g.newBags > first.newBags || later.includes(g)) && better(g)));
  let best = [...pool].sort((a, b) => order(a, b) || byOwnerOrder(a, b))[0] ?? null;

  // Get the backpack off: Looking ahead's two bags resized so the larger is as small as it can be while the back stays as empty (review
  // of PR 61, m2): Minimal's bag a size smaller each step, the other bag the smallest size that still does it.
  const maxL = (x: Suggestion) => Math.max(...x.add.map((b) => b.L));
  if (best && !stopped && onBack && best.kind === 'ahead' && best.remove === null && !best.deck && first.kind === 'add' && best.add.length === 2) {
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
  const value = (x: Suggestion) => (onBack ? x.result.backL : x.score);
  const within = onBack ? MIN_GAIN_BACK_L : MIN_GAIN_SCORE;
  const bestValue = Math.min(...items.map(value));
  const near = items.map((x, k) => (value(x) - bestValue <= within + EPS ? k : -1)).filter((k) => k >= 0);
  const minimalSame = near.length >= 2 ? near : [];
  // the bags a set adds; a bag taken out does not make another combination (re-check of PR 61, n6: the same panniers, with or without
  // the backpack left at home, are one)
  const combo = (x: Suggestion) => [...x.add.map((b) => b.pos + (b.pair ? '×2' : '')), ...(x.deck ? ['deck'] : [])].sort().join('+');
  const aheadAlts: Suggestion[] = [];
  if (ahead) {
    const seen = new Set([combo(ahead)]);
    for (const x of [...pool].sort((a, b) => order(a, b) || byOwnerOrder(a, b))) {
      if (aheadAlts.length === 2) break;
      if (seen.has(combo(x)) || Math.abs(value(x) - value(ahead)) > within + EPS) continue;
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
 * What the chosen setup left out (the owner's finding F, 8 Nov): panniers, and under Bikepacking bags only also a rack to fit for its
 * deck. A rack the rider has, and its deck, are no bigger change.
 */
function beyondSetup(given: AdvisorInput, c: Candidate): boolean {
  return c.add.some((b) => b.pos === 'rack') || (given.style === 'bags' && c.deck && !rackFitted(given));
}

/** Whether the answer leaves room for a bigger change: nothing else helps (no Looking ahead, cannot reduce, nothing helps). */
function wantsBigger(answer: AdvisorAnswer): boolean {
  if (answer.partial || answer.tried >= MAX_TRIALS) return false;
  return answer.kind === 'suggestions' ? answer.ahead === null : answer.kind === 'cannot-reduce' || answer.kind === 'nothing-helps';
}

/**
 * A bigger change (the owner's finding F, 8 Nov): when the answer can only say that nothing else would help, one suggestion that goes
 * beyond the setup the rider chose (panniers, or a rack to fit under Bikepacking bags only), clearly its own, tried with the same packing.
 * It must be valid and better on the goal than Minimal's first (or, with no suggestion, than the plan as it is) by decision 6. Its own
 * search, after the answer, so the answer's search is as it was; it counts on from the answer's trials and never passes MAX_TRIALS.
 * None under Panniers are fine (nothing is left out), with the rider's own panniers (their rack is taken), with no rack possible, or for
 * an answer cut short.
 */
export function* biggerSteps(given: AdvisorInput, answer: AdvisorAnswer): Generator<number, Suggestion | null> {
  if (given.style === 'panniers' || !wantsBigger(answer) || given.bags.some((b) => b.pos === 'rack')) return null;
  const input = planAsStyled({ ...given, style: 'panniers' });
  if (!panniersAllowed(input)) return null;
  let trials = answer.tried;
  const base = input.trial(input.bags, input.decks);
  trials++;
  const ref = answer.kind === 'suggestions' ? answer.items[0]! : { result: base, score: handlingScore(base) };
  const goal = given.goal;
  const backGain = (s: Suggestion) => ref.result.backL - s.result.backL >= MIN_GAIN_BACK_L - EPS;
  const scoreGain = (s: Suggestion) => ref.score - s.score >= MIN_GAIN_SCORE - EPS;
  const better = (s: Suggestion) => overflows(ref.result) || (goal === 'handling' ? scoreGain(s) : goal === 'backpack' ? backGain(s)
    : backGain(s) || (s.result.backL <= ref.result.backL + NOTHING_ON_BACK_L && scoreGain(s)));
  const handBack = () => trials % SLICE === 0 || (input.handBack?.() ?? false);
  const found: Suggestion[] = [];
  const phases: ('add' | 'swap' | 'add-two')[] = goal === 'handling' ? ['add', 'swap', 'add-two'] : ['add', 'add-two'];
  outer: for (const phase of phases) {
    if (phase === 'add-two' && found.length > 0) break;   // two at once only when one would not do
    for (const c of candidates(input, phase, true)) {
      if (!beyondSetup(given, c)) continue;
      if (trials >= MAX_TRIALS) break outer;
      const result = input.trial(bagsFor(input, c), c.decks);
      trials++;
      const s = suggestion(c, result);
      if (isValid(base, result) && better(s)) found.push(s);
      if (handBack()) yield trials;
    }
  }
  const best = [...found].sort((a, b) => compareFor(goal)(a, b) || byOwnerOrder(a, b))[0];
  if (!best) return null;
  return { ...best, rangeL: rangeOf(best, found.filter((g) => keyOf(g) === keyOf(best) && g.kind === best.kind && g.remove === best.remove)) };
}

/** The bigger change at once. */
export function bigger(given: AdvisorInput, answer: AdvisorAnswer): Suggestion | null {
  const steps = biggerSteps(given, answer);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/** The whole search at once. */
export function advise(input: AdvisorInput): AdvisorAnswer {
  const steps = adviseSteps(input);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

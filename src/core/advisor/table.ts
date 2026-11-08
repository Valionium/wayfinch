// The Gear advisor's fixed tables (sub-project 13 plan: decisions 2, 3, 6 and 8). The owner's changes go here only.
import type { Pos, Setup } from './types.ts';

/**
 * Better handling (decision 2; design §3.3): the weight of each placed kilo by its position. Lower is better. Kit strapped outside a
 * bag counts at the position it is strapped to; `deck` is the rack deck.
 */
export const WEIGHTS: Readonly<Record<Pos, number>> = Object.freeze({
  frame: 1.0, bottle: 1.0, bottleU: 1.0, // 1 frame, low and central
  top: 1.2,                              // 2 top tube
  fork: 1.5,                             // 3 fork cages
  rack: 1.8, deck: 1.8,                  // 4 panniers on a rack, and kit on the rack deck
  bar: 2.2,                              // 5 bar roll
  seat: 2.6,                             // 6 seat pack
  pack: 3.5,                             // 7 the back
});

export type SizedPos = 'top' | 'fork' | 'bar' | 'seat' | 'rack';

/**
 * The sizes tried per type (decision 3; design §3.1), litres per bag. Frame bags are not here: they come at the bike's own shapes and
 * litres (`AdvisorInput.frameShapes`). A pair counts as one new bag (decision 4).
 */
export const SIZE_RANGES: Readonly<Record<SizedPos, { min: number; max: number; step: number; pair: boolean }>> = Object.freeze({
  top: { min: 0.5, max: 2, step: 0.5, pair: false },
  fork: { min: 2, max: 5, step: 1, pair: true },
  bar: { min: 5, max: 15, step: 1, pair: false },
  seat: { min: 4, max: 16, step: 1, pair: false },
  rack: { min: 10, max: 25, step: 1, pair: true },
});

/** Every size of one row, smallest first. */
export function sizesOf(pos: SizedPos): number[] {
  const { min, max, step } = SIZE_RANGES[pos];
  const out: number[] = [];
  for (let i = 0; min + i * step <= max + 1e-9; i++) out.push(Math.round((min + i * step) * 100) / 100);
  return out;
}

/** "Already good" (decision 6): the least gain that counts as an improvement. */
export const MIN_GAIN_SCORE = 0.5;
export const MIN_GAIN_BACK_L = 0.5;

/** The search never runs more trials than this; it answers from what it tried, marked partial. */
export const MAX_TRIALS = 1000;

/**
 * The rest of the decided rules, pending the owner's O1, in one place: a different answer is an edit here.
 * - pairIsOneBag (decision 4; the owner, 7 Nov: false): a pair of fork cages or panniers is two bags, a single one; both are offered,
 *   as separate suggestions.
 * - forkNeedsMountsTag (decision 4): fork cages always say "needs cage mounts on the fork"; no bike field holds that.
 * - seatUnlikely / seatTight (decision 9): a seat pack size the measured seat gap calls unlikely is dropped (or 'tag': offered with
 *   "unlikely to fit"); a tight one is offered with "tight" (or 'offer': without the word).
 * - setups, defaultSetup, ridingSetup (the owner's ruling of 7 Nov): step 1 asks "What kind of setup do you want?": Bikepacking bags
 *   only, Bags first (panniers only if needed; the default), Panniers are fine. The questionnaire's riding picks one: touring Panniers
 *   are fine; road, gravel and mountain bike trails Bikepacking bags only; everyday Bags first.
 * - ownPanniersUnderBagsOnly: 'off' takes the rider's own panniers out of the plan under Bikepacking bags only, the rack they hung from
 *   kept with its deck; 'kept' leaves them in.
 * - backpackWholeFirst: for Get the backpack off, when one of the fewest new things that count takes everything off the back, Minimal
 *   holds only such; otherwise all of the fewest that count by decision 6 (one bag that leaves some, and the pair that would empty the
 *   back under Looking ahead).
 * - backpackRealShare (the owner's ruling on PR 61, I2): for Get the backpack off, Minimal holds only what takes at least this share of the
 *   litres on the back off, or everything; among those the owner's order decides (when nothing does, all that count).
 * - newRackCounts: a rack to fit (for its deck, or for panniers when none is fitted) counts as this many new things.
 * - rangeUpToL, rangeHalfLitres (design §3.3, decision 3): the range shown runs up to this many litres above the chosen size; with
 *   rangeHalfLitres the top tube's +0.5 and +1.5 L count too (review m2), otherwise only + 1 and + 2 (the plan's literal rule).
 * - addOrder (the owner, 7 Nov): Minimal, the fewest new things that do it, in this order, a lower number first: the rack deck (use the
 *   rack you have; or a rack to fit, "a rack does the job"), then top tube and frame bag, then seat pack, then handlebar bag, then fork
 *   cages, and panniers last.
 */
export const DECIDED = Object.freeze({
  pairIsOneBag: false as boolean,
  forkNeedsMountsTag: true as boolean,
  seatUnlikely: 'drop' as 'drop' | 'tag',
  seatTight: 'tag' as 'tag' | 'offer',
  setups: Object.freeze(['bags', 'bags-first', 'panniers']) as readonly Setup[],
  defaultSetup: 'bags-first' as Setup,
  ridingSetup: Object.freeze({ touring: 'panniers', road: 'bags', gravel: 'bags', mtb: 'bags', everyday: 'bags-first' }) as Readonly<Record<'touring' | 'road' | 'gravel' | 'mtb' | 'everyday', Setup>>,
  ownPanniersUnderBagsOnly: 'off' as 'off' | 'kept',
  newRackCounts: 1,
  backpackWholeFirst: true as boolean,
  backpackRealShare: 0.25,
  rangeUpToL: 2,
  rangeHalfLitres: true as boolean,
  addOrder: Object.freeze({ deck: 0, top: 1, frame: 1, seat: 2, bar: 3, fork: 4, rack: 5 }) as Readonly<Record<'deck' | 'top' | 'frame' | 'seat' | 'bar' | 'fork' | 'rack', number>>,
});

// The Gear advisor's fixed tables (sub-project 13 plan: decisions 2, 3, 6 and 8). The owner's changes go here only.
import type { Pos } from './types.ts';

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
 * - pairIsOneBag (decision 4): fork cages and panniers, bought in pairs, count as one new bag in the ties.
 * - forkNeedsMountsTag (decision 4): fork cages always say "needs cage mounts on the fork"; no bike field holds that.
 * - noPanniersUnder (decision 5): the styles under which the mountain bike trails answer offers no panniers. The plan names Either;
 *   With a rack is included too (review of PR 57, m3).
 * - seatUnlikely / seatTight (decision 9): a seat pack size the measured seat gap calls unlikely is dropped (or 'tag': offered with
 *   "unlikely to fit"); a tight one is offered with "tight" (or 'offer': without the word).
 * - rackDeckWithoutRack (review of PR 57, I3; design §4 "never a pannier or rack deck"): without a rack (that style, or the trails
 *   answer where it blocks panniers) the rider's own rack deck is 'off' in every candidate, or 'kept'.
 * - rangeUpToL, rangeHalfLitres (design §3.3, decision 3): the range shown runs up to this many litres above the chosen size; with
 *   rangeHalfLitres the top tube's +0.5 and +1.5 L count too (review m2), otherwise only + 1 and + 2 (the plan's literal rule).
 */
export const DECIDED = Object.freeze({
  pairIsOneBag: true as boolean,
  forkNeedsMountsTag: true as boolean,
  noPanniersUnder: Object.freeze(['either', 'rack']) as readonly ('either' | 'rack')[],
  seatUnlikely: 'drop' as 'drop' | 'tag',
  seatTight: 'tag' as 'tag' | 'offer',
  rackDeckWithoutRack: 'off' as 'off' | 'kept',
  rangeUpToL: 2,
  rangeHalfLitres: true as boolean,
});

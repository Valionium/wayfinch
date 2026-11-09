// Balancing in the rider's own bags (the owner's decision of 8 Nov 2026, weight map design §7): the best spread of the rider's items over
// the bags the plan has, by Better handling's score (WEIGHTS), with no new bag. It only ever moves one whole item into another bag in use,
// as a hand placement would, and keeps what the planner promises: everything fitting, nothing more on the rider's back, every must-reach
// item within reach, and the rider's own hand placements where they are. Pure: the bag planner hands it its packing and a trial over
// its own planWith (placements as pins), so the frozen packing is only ever called, never copied. The weight map's ideal reads it; the
// automatic balancing will too.
import { handlingScore } from './rank.ts';
import { WEIGHTS } from './table.ts';
import type { Pos, TrialResult } from './types.ts';

/** One item the planner placed whole in one bag: its kilos and litres, and that bag (its unit key and position). */
export type Piece = { id: string; kg: number; L: number; unit: string; pos: Pos };
/** A bag in use that may take an item: its unit key, its position and the litres still free in it. */
export type Room = { key: string; pos: Pos; freeL: number };
/** A packing as the search reads it; `state` is the page's own (its kept placements), handed back to the next trial untouched. */
export type Packing = { result: TrialResult; pieces: Piece[]; rooms: Room[]; state?: unknown };
export type Move = { id: string; from: string; to: string };
export type Balanced = { packing: Packing; pins: Record<string, string>; moves: Move[]; tried: number; partial: boolean };

/** The search never runs more trials than this; it answers with what it found, marked partial. */
export const MAX_BALANCE_TRIALS = 150;
/** The least drop of the handling score one move must bring (the score is kept to the hundredth). */
const STEP = 0.01;
const SLACK = 0.005;

/** Nothing more left over, no item newly left over, no more litres on the back, no more must-reach items out of reach than at the start. */
export function keepsPromises(start: TrialResult, r: TrialResult): boolean {
  const spilled = new Set(start.spillIds);
  return r.overL <= start.overL + SLACK && r.spillIds.every((id) => spilled.has(id)) && r.backL <= start.backL + SLACK
    && r.outOfReach <= start.outOfReach;
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * From `start`, moves one whole item at a time into a bag in use whose position weighs less (most weighted kilos saved first), keeping a
 * move only when the trial keeps every promise and lowers the score by at least 0.01, until no move helps or MAX_BALANCE_TRIALS ran.
 * `fixed` names the items that never move (the rider's hand placements). A move that failed is not tried again. Every input the same,
 * the same answer.
 */
export function balance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number } = {}): Balanced {
  const fixed = new Set(o.fixed ?? []);
  const max = o.maxTrials ?? MAX_BALANCE_TRIALS;
  const failed = new Set<string>();
  let cur = start;
  let pins: Record<string, string> = {};
  let tried = 0;
  const done = (partial: boolean): Balanced => {
    const was = new Map(start.pieces.map((p) => [p.id, p.unit]));
    const moves = cur.pieces.filter((p) => was.has(p.id) && was.get(p.id) !== p.unit).map((p) => ({ id: p.id, from: was.get(p.id)!, to: p.unit }));
    return { packing: cur, pins, moves, tried, partial };
  };
  for (;;) {
    const options = cur.pieces.filter((p) => !fixed.has(p.id) && p.kg > 0).flatMap((p) => cur.rooms
      .filter((r) => r.key !== p.unit && WEIGHTS[r.pos] < WEIGHTS[p.pos] && r.freeL + 1e-9 >= p.L && !failed.has(`${p.id}>${r.key}`))
      .map((r) => ({ p, r, gain: p.kg * (WEIGHTS[p.pos] - WEIGHTS[r.pos]) })))
      .filter((x) => x.gain >= STEP)
      .sort((a, b) => b.gain - a.gain || order(a.p.id, b.p.id) || order(a.r.key, b.r.key));
    let moved = false;
    for (const { p, r } of options) {
      if (tried >= max) return done(true);
      tried++;
      const next = trial({ ...pins, [p.id]: r.key }, cur);
      if (keepsPromises(start.result, next.result) && handlingScore(next.result) <= handlingScore(cur.result) - STEP) {
        pins = { ...pins, [p.id]: r.key };
        cur = next;
        moved = true;
        break;
      }
      failed.add(`${p.id}>${r.key}`);
    }
    if (!moved) return done(false);
  }
}

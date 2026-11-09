// Balancing in the rider's own bags (the owner's decision of 8 Nov 2026, weight map design §7): a better spread of the rider's items over
// the bags the plan has, by Better handling's score (WEIGHTS), with no new bag. It moves one whole item into another bag in use, or swaps
// two whole items between bags (review of PR 78, I1), as hand placements would, and keeps what the planner promises: everything fitting,
// nothing more on the rider's back, every must-reach item within reach, and the rider's own hand placements where they are. Pure: the bag
// planner hands it its packing and a trial over its own planWith (placements as pins), so the frozen packing is only ever called, never
// copied. The weight map's ideal reads it; the automatic balancing will too. It stops when no single move or swap helps: a careful local
// search, not a proof that no better packing exists.
import { handlingScore } from './rank.ts';
import { MIN_GAIN_SCORE, WEIGHTS } from './table.ts';
import type { Pos, TrialResult } from './types.ts';

/** One item the planner placed whole in one bag: its kilos and litres, and that bag (its unit key and position). */
export type Piece = { id: string; kg: number; L: number; unit: string; pos: Pos };
/**
 * A bag in use that may take an item: its unit key, its position and the litres still free in it. `fillL`: the litres in it of what the
 * planner's re-pack places last around the whole items (food fills the gaps), which a hand placement can take.
 */
export type Room = { key: string; pos: Pos; freeL: number; fillL?: number };
/** A packing as the search reads it; `state` is the page's own (its kept placements), handed back to the next trial untouched. */
export type Packing = { result: TrialResult; pieces: Piece[]; rooms: Room[]; state?: unknown };
export type Move = { id: string; from: string; to: string };
export type Balanced = { packing: Packing; pins: Record<string, string>; moves: Move[]; tried: number; partial: boolean };

/** The search never runs more trials than this; it answers with what it found, marked partial. */
export const MAX_BALANCE_TRIALS = 150;
/** The least drop of the handling score one move must bring (the score is kept to the hundredth). */
const STEP = 0.01;
const SLACK = 0.005;
const EPS = 1e-9;

/** Nothing more left over, no item newly left over, no more litres on the back, no more must-reach items out of reach than at the start. */
export function keepsPromises(start: TrialResult, r: TrialResult): boolean {
  const spilled = new Set(start.spillIds);
  return r.overL <= start.overL + SLACK && r.spillIds.every((id) => spilled.has(id)) && r.backL <= start.backL + SLACK
    && r.outOfReach <= start.outOfReach;
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Option = { pins: Record<string, string>; gain: number; name: string };

/** Every single move and swap worth a trial from `cur`: the heavier weighted kilos towards a lighter position, with room by the litres. */
function optionsOf(cur: Packing, fixed: ReadonlySet<string>): Option[] {
  const room = new Map(cur.rooms.map((r) => [r.key, r.freeL + (r.fillL ?? 0)]));
  const free = cur.pieces.filter((p) => !fixed.has(p.id));
  const out: Option[] = [];
  for (const p of free) {
    if (p.kg <= 0) continue;
    for (const r of cur.rooms) {
      if (r.key === p.unit || WEIGHTS[r.pos] >= WEIGHTS[p.pos] || room.get(r.key)! + EPS < p.L) continue;
      out.push({ pins: { [p.id]: r.key }, gain: p.kg * (WEIGHTS[p.pos] - WEIGHTS[r.pos]), name: `${p.id}>${r.key}` });
    }
  }
  // a swap: the heavier of two items into the other's lighter position, each fitting where the other leaves room
  const inRooms = free.filter((p) => room.has(p.unit));
  for (const p of inRooms) for (const q of inRooms) {
    if (p.unit === q.unit || p.kg <= q.kg || WEIGHTS[q.pos] >= WEIGHTS[p.pos]) continue;
    if (room.get(q.unit)! + q.L + EPS < p.L || room.get(p.unit)! + p.L + EPS < q.L) continue;
    out.push({ pins: { [p.id]: q.unit, [q.id]: p.unit }, gain: (p.kg - q.kg) * (WEIGHTS[p.pos] - WEIGHTS[q.pos]), name: `${p.id}<>${q.id}` });
  }
  // half a step: the score is rounded to the hundredth, so a gain just under 0.01 can still drop it by 0.01
  return out.filter((x) => x.gain >= STEP / 2).sort((a, b) => b.gain - a.gain || order(a.name, b.name));
}

/**
 * From `start`, moves one whole item into a bag in use whose position weighs less, or swaps two whole items so the heavier sits lighter
 * (most weighted kilos saved first), keeping one only when the trial keeps every promise and lowers the score by at least 0.01, until no
 * move or swap helps or MAX_BALANCE_TRIALS ran. `fixed` names the items that never move (the rider's hand placements). A move refused is
 * tried again only after another was kept. Every input the same, the same answer.
 */
export function balance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number } = {}): Balanced {
  const fixed = new Set(o.fixed ?? []);
  const max = o.maxTrials ?? MAX_BALANCE_TRIALS;
  let failed = new Set<string>();
  let cur = start;
  let pins: Record<string, string> = {};
  let tried = 0;
  const done = (partial: boolean): Balanced => {
    const was = new Map(start.pieces.map((p) => [p.id, p.unit]));
    const moves = cur.pieces.filter((p) => was.has(p.id) && was.get(p.id) !== p.unit).map((p) => ({ id: p.id, from: was.get(p.id)!, to: p.unit }));
    return { packing: cur, pins, moves, tried, partial };
  };
  for (;;) {
    let moved = false;
    for (const x of optionsOf(cur, fixed)) {
      if (failed.has(x.name)) continue;
      if (tried >= max) return done(true);
      tried++;
      const next = trial({ ...pins, ...x.pins }, cur);
      if (keepsPromises(start.result, next.result) && handlingScore(next.result) <= handlingScore(cur.result) - STEP) {
        pins = { ...pins, ...x.pins };
        cur = next;
        moved = true;
        failed = new Set();
        break;
      }
      failed.add(x.name);
    }
    if (!moved) return done(false);
  }
}

export type AutoBalanced = { apply: boolean; balanced: Balanced; gain: number };

/**
 * The bag planner's automatic balancing (the owner's decision of 8 Nov 2026, weight map design §7): the balance of `start` (the planner's
 * own packing), to be applied only when it is clearly better, by the Gear advisor's own threshold: Better handling's score lower by
 * MIN_GAIN_SCORE or more. `fixed` as for balance: what the rider keeps where it is. `gain` is the drop of the score, to the hundredth.
 */
export function autoBalance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number } = {}): AutoBalanced {
  const balanced = balance(start, trial, o);
  const gain = Math.round((handlingScore(start.result) - handlingScore(balanced.packing.result)) * 100) / 100;
  return { apply: balanced.moves.length > 0 && gain >= MIN_GAIN_SCORE - EPS, balanced, gain };
}

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
 * planner's re-pack places last around the whole items (food fills the gaps), which a hand placement can take. `capL`: the litres the
 * bag holds in all (Handling first's heaviest-first packing counts from it; without it, the free litres, the food's and the whole items').
 */
export type Room = { key: string; pos: Pos; freeL: number; fillL?: number; capL?: number };
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
 * The wider look (review of PR 78, m-A): every single placement of one thing into another bag in use, whichever way it weighs and
 * whatever the litres look like, and of each thing the planner split over bags (`extra`) whole into each bag. A thing moved to a heavier
 * place can still lower the score: the re-pack then fills the room it leaves with heavier things. The trial decides; things in the
 * lightest places and the bulkiest first.
 */
function widerOf(cur: Packing, fixed: ReadonlySet<string>, extra: readonly string[]): Option[] {
  const out: (Option & { w: number; L: number })[] = [];
  for (const p of cur.pieces) {
    if (fixed.has(p.id)) continue;
    for (const r of cur.rooms) if (r.key !== p.unit) out.push({ pins: { [p.id]: r.key }, gain: 0, name: `${p.id}>${r.key}`, w: WEIGHTS[p.pos], L: p.L });
  }
  const whole = new Set(cur.pieces.map((p) => p.id));
  for (const id of extra) {
    if (fixed.has(id) || whole.has(id)) continue;
    for (const r of cur.rooms) out.push({ pins: { [id]: r.key }, gain: 0, name: `${id}>${r.key}`, w: Infinity, L: 0 });
  }
  return out.sort((a, b) => a.w - b.w || b.L - a.L || order(a.name, b.name));
}

/**
 * From `start`, moves one whole item into a bag in use whose position weighs less, or swaps two whole items so the heavier sits lighter
 * (most weighted kilos saved first), keeping one only when the trial keeps every promise and lowers the score by at least 0.01, until no
 * move or swap helps or MAX_BALANCE_TRIALS ran. `fixed` names the items that never move (the rider's hand placements). A move refused is
 * tried again only after another was kept. `wide`: then also the wider look (widerOf), with `extra` the things split over bags. Every
 * input the same, the same answer.
 */
export function balance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number; wide?: boolean; extra?: readonly string[] } = {}): Balanced {
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
    // the wider look (o.wide) comes after every move and swap of the usual kind, so it is tried only once none of them helps
    for (const x of [...optionsOf(cur, fixed), ...(o.wide ? widerOf(cur, fixed, o.extra ?? []) : [])]) {
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
 * MIN_GAIN_SCORE or more. `fixed` as for balance: what the rider keeps where it is; `wide` and `extra` as for balance (the bag planner
 * takes the wider look: the owner's choice of 9 Nov 2026). `gain` is the drop of the score, to the hundredth.
 */
export function autoBalance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number; wide?: boolean; extra?: readonly string[] } = {}): AutoBalanced {
  const balanced = balance(start, trial, o);
  const gain = Math.round((handlingScore(start.result) - handlingScore(balanced.packing.result)) * 100) / 100;
  return { apply: balanced.moves.length > 0 && gain >= MIN_GAIN_SCORE - EPS, balanced, gain };
}

// "Handling first" (design of 10 Nov 2026, the owner's answers §10): one press of the rider's packs by weight, as far as the bags allow.
// The best spots in order are Better handling's table, lightest first (frame bag, top tube bag, fork cages, panniers, bar roll, seat
// pack), the frame bag first among equal weights; never the back.
const spotOrder = (a: Room, b: Room) => WEIGHTS[a.pos] - WEIGHTS[b.pos] || Number(a.pos !== 'frame') - Number(b.pos !== 'frame') || order(a.key, b.key);

/**
 * The heaviest-first packing's pins (design §4.3): the things to keep stay in their bags (their litres counted there first); every other
 * whole thing, densest first (kilos per litre, ties by kilos), into the best spot that still has room for it. A thing with no such room
 * gets no pin: the planner's own packing places it.
 */
export function heaviestFirst(start: Packing, fixed: Iterable<string> = []): Record<string, string> {
  const keep = new Set(fixed);
  const left = new Map(start.rooms.map((r) => [r.key,
    r.capL ?? r.freeL + (r.fillL ?? 0) + start.pieces.filter((p) => p.unit === r.key).reduce((t, p) => t + p.L, 0)]));
  const pins: Record<string, string> = {};
  for (const p of start.pieces) {
    if (!keep.has(p.id) || !left.has(p.unit)) continue;
    pins[p.id] = p.unit;
    left.set(p.unit, left.get(p.unit)! - p.L);
  }
  const spots = start.rooms.filter((r) => r.pos !== 'pack').sort(spotOrder);
  const free = start.pieces.filter((p) => !keep.has(p.id) && p.kg > 0 && p.L > 0)
    .sort((a, b) => b.kg / b.L - a.kg / a.L || b.kg - a.kg || order(a.id, b.id));
  for (const p of free) {
    const r = spots.find((x) => left.get(x.key)! + EPS >= p.L);
    if (!r) continue;
    pins[p.id] = r.key;
    left.set(r.key, left.get(r.key)! - p.L);
  }
  return pins;
}

/**
 * `route`: which packing won (null: nothing better). `held`: something better was found, but it would move a thing to keep that is no
 * single piece (food or a thing split over bags, ticked as packed), so nothing is applied. `partial`: a search ran out of its trials.
 * `done`: everything ran within the budget; when not, nothing is applied and the caller runs it again with a larger one.
 */
export type HandledFirst = {
  apply: boolean; packing: Packing; moves: Move[]; gain: number; route: 'search' | 'heaviest' | null; held: boolean; tried: number;
  partial: boolean; done: boolean;
};

/**
 * Handling first (design §4): from `start`, the plan as it stands, the usual search with its wider look run to the end (every gain
 * taken, however small), and the heaviest-first packing (`fresh`: the planner's own packing with these pins) with the same search run
 * from it; whichever has the lower score, a tie to more kilos in the frame bag. Kept only when it keeps every promise of `start`, leaves
 * every thing to keep (`fixed`) with exactly its bags and litres, and lowers the score by 0.01 or more: never worse than the plan. Then
 * each move that changes nothing (the score and the frame bag's kilos the same) is put back, so the rider repacks less. `trial` and
 * `extra` as for balance; each search at most `maxTrials`. `budget`: all trials at most this many (the page's slices, its trials
 * remembered, so each run adds only new ones). Every input the same, the same answer.
 */
export function handlingFirst(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  fresh: (pins: Record<string, string>) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; extra?: readonly string[]; maxTrials?: number; budget?: number } = {}): HandledFirst {
  const fixed = new Set(o.fixed ?? []);
  const max = o.maxTrials ?? MAX_BALANCE_TRIALS, budget = o.budget ?? Infinity;
  let tried = 0;
  const none = (held: boolean, partial: boolean, done: boolean): HandledFirst =>
    ({ apply: false, packing: start, moves: [], gain: 0, route: null, held, tried, partial, done });
  // one search within what is left of the budget; null when the budget ran out first
  const search = (from: Packing): Balanced | null => {
    const n = Math.min(max, budget - tried);
    const b = balance(from, trial, { fixed, wide: true, extra: o.extra ?? [], maxTrials: n });
    tried += b.tried;
    return b.partial && n < max ? null : b;
  };
  const usual = search(start);
  if (!usual || tried >= budget) return none(false, true, false);
  const firstPacked = fresh(heaviestFirst(start, fixed));
  tried++;
  let heavy: Balanced | null = null;
  if (keepsPromises(start.result, firstPacked.result)) {
    heavy = search(firstPacked);
    if (!heavy) return none(false, true, false);
  }
  const partial = usual.partial || !!heavy?.partial;
  const s0 = handlingScore(start.result);
  const frameKg = (p: Packing) => p.result.kgByPos.frame ?? 0;
  const kept = (p: Packing) => [...fixed].every((id) => JSON.stringify(start.result.items[id] ?? null) === JSON.stringify(p.result.items[id] ?? null));
  const better = [{ route: 'search' as const, packing: usual.packing }, ...(heavy ? [{ route: 'heaviest' as const, packing: heavy.packing }] : [])]
    .filter((c) => keepsPromises(start.result, c.packing.result) && handlingScore(c.packing.result) <= s0 - STEP + EPS);
  const ok = better.filter((c) => kept(c.packing))
    .sort((a, b) => handlingScore(a.packing.result) - handlingScore(b.packing.result) || frameKg(b.packing) - frameKg(a.packing));
  const best = ok[0];
  if (!best) return none(better.length > 0, partial, true);
  const was = new Map(start.pieces.map((p) => [p.id, p]));
  const movesOf = (p: Packing): Move[] => p.pieces.filter((x) => was.has(x.id) && was.get(x.id)!.unit !== x.unit)
    .map((x) => ({ id: x.id, from: was.get(x.id)!.unit, to: x.unit }));
  let cur = best.packing;
  if (!partial) {
    // the moves that do the least first: kilos times the drop of the handling weight
    const to = new Map(cur.pieces.map((p) => [p.id, p.pos]));
    const worth = (m: Move) => { const p = was.get(m.id)!; return p.kg * (WEIGHTS[p.pos] - WEIGHTS[to.get(m.id)!]); };
    for (const m of movesOf(cur).sort((a, b) => worth(a) - worth(b) || order(a.id, b.id))) {
      if (tried >= budget) return none(false, true, false);
      const next = trial({ [m.id]: m.from }, cur);
      tried++;
      if (next.pieces.find((x) => x.id === m.id)?.unit === m.from && keepsPromises(start.result, next.result) && kept(next)
        && handlingScore(next.result) <= handlingScore(cur.result) && frameKg(next) >= frameKg(cur) - EPS) cur = next;
    }
  }
  const gain = Math.round((s0 - handlingScore(cur.result)) * 100) / 100;
  return { apply: true, packing: cur, moves: movesOf(cur), gain, route: best.route, held: false, tried, partial, done: true };
}

/** The frame bag after Handling first (design §5). Null when the plan has none. */
export type FrameRoom = { full: boolean; heaviest: boolean; outside: Piece[]; moreKg: number };

/**
 * `full`: no whole thing outside the frame bag fits its free litres; `heaviest`: and every thing in it is at least as dense as the densest
 * one outside; `outside`: the things outside, densest first; `moreKg`: the kilos of them (but what is to be kept, `fixed`) that `extraL`
 * more litres would take, densest first, to the tenth.
 */
export function frameRoom(p: Packing, o: { fixed?: Iterable<string>; extraL?: number } = {}): FrameRoom | null {
  const rooms = p.rooms.filter((r) => r.pos === 'frame');
  if (!rooms.length) return null;
  const keys = new Set(rooms.map((r) => r.key)), freeL = Math.max(...rooms.map((r) => r.freeL));
  const dense = (x: Piece) => x.kg / x.L;
  const inside = p.pieces.filter((x) => keys.has(x.unit));
  const outside = p.pieces.filter((x) => !keys.has(x.unit) && x.kg > 0 && x.L > 0)
    .sort((a, b) => dense(b) - dense(a) || b.kg - a.kg || order(a.id, b.id));
  const full = outside.length > 0 && outside.every((x) => x.L > freeL + EPS);
  const heaviest = full && inside.length > 0 && inside.every((x) => x.L > 0 && dense(x) + EPS >= dense(outside[0]!));
  const keep = new Set(o.fixed ?? []);
  let room = freeL + (o.extraL ?? 0), moreKg = 0;
  if ((o.extraL ?? 0) > 0) for (const x of outside) {
    if (keep.has(x.id) || x.L > room + EPS) continue;
    room -= x.L;
    moreKg += x.kg;
  }
  return { full, heaviest, outside, moreKg: Math.round(moreKg * 10) / 10 };
}

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
 * `pair`: the same for both halves of a bag pair (fork cages, panniers), so Handling first keeps the two sides even.
 */
export type Room = { key: string; pos: Pos; freeL: number; fillL?: number; capL?: number; pair?: string };
/** A packing as the search reads it; `state` is the page's own (its kept placements), handed back to the next trial untouched. */
export type Packing = { result: TrialResult; pieces: Piece[]; rooms: Room[]; state?: unknown };
export type Move = { id: string; from: string; to: string };
export type Balanced = { packing: Packing; pins: Record<string, string>; moves: Move[]; tried: number; partial: boolean };

/** A pair whose two halves' fill (litres used over litres held) differs by this much or more is uneven: the bag planner's pair note. */
export const PAIR_UNEVEN = 0.22;
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
 * tried again only after another was kept. `wide`: then also the wider look (widerOf), with `extra` the things split over bags. `keep`:
 * a further test every packing kept must pass (Handling first's side to side). Every input the same, the same answer.
 */
export function balance(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; maxTrials?: number; wide?: boolean; extra?: readonly string[]; keep?: (p: Packing) => boolean } = {}): Balanced {
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
      if (keepsPromises(start.result, next.result) && handlingScore(next.result) <= handlingScore(cur.result) - STEP && (!o.keep || o.keep(next))) {
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
// pack), the frame bag first among equal weights; never the back. Among spots of one weight the emptier first, so the two halves of a
// pair fill alike (review of PRs 116/117, C1).

/** A room's litres in all: `capL`, or (without it) its free litres, the food's and the whole items'. */
const capOf = (p: Packing, r: Room) => r.capL ?? r.freeL + (r.fillL ?? 0) + p.pieces.filter((x) => x.unit === r.key).reduce((t, x) => t + x.L, 0);

/** Each pair's gap in how full its two halves are (litres used over litres held), as the bag planner's pair note reads it. */
export function pairGaps(p: Packing): Map<string, number> {
  const by = new Map<string, number[]>();
  for (const r of p.rooms) {
    if (!r.pair) continue;
    const cap = capOf(p, r);
    by.set(r.pair, [...(by.get(r.pair) ?? []), cap > 0 ? (cap - r.freeL) / cap : 0]);
  }
  return new Map([...by].filter(([, f]) => f.length === 2).map(([k, f]) => [k, Math.abs(f[0]! - f[1]!)]));
}

/** Side to side (review of PRs 116/117, C1): a pair even in `base` (its gaps) stays even; an uneven one gets no more uneven. */
function sidesKept(base: ReadonlyMap<string, number>, p: Packing): boolean {
  const now = pairGaps(p);
  for (const [k, g] of base) {
    const n = now.get(k);
    if (n !== undefined && (g < PAIR_UNEVEN ? n >= PAIR_UNEVEN : n > g + EPS)) return false;
  }
  return true;
}

/**
 * The heaviest-first packing's pins (design §4.3): the things to keep stay in their bags (their litres counted there first); every other
 * whole thing, densest first (kilos per litre, ties by kilos), into the best spot that still has room for it, the emptier of two spots
 * of one weight first. A thing with no such room gets no pin: the planner's own packing places it.
 */
export function heaviestFirst(start: Packing, fixed: Iterable<string> = []): Record<string, string> {
  const keep = new Set(fixed);
  const cap = new Map(start.rooms.map((r) => [r.key, capOf(start, r)]));
  const left = new Map(cap);
  const pins: Record<string, string> = {};
  for (const p of start.pieces) {
    if (!keep.has(p.id) || !left.has(p.unit)) continue;
    pins[p.id] = p.unit;
    left.set(p.unit, left.get(p.unit)! - p.L);
  }
  const used = (r: Room) => (cap.get(r.key)! > 0 ? 1 - left.get(r.key)! / cap.get(r.key)! : 1);
  const spots = start.rooms.filter((r) => r.pos !== 'pack');
  const free = start.pieces.filter((p) => !keep.has(p.id) && p.kg > 0 && p.L > 0)
    .sort((a, b) => b.kg / b.L - a.kg / a.L || b.kg - a.kg || order(a.id, b.id));
  for (const p of free) {
    const r = spots.filter((x) => left.get(x.key)! + EPS >= p.L)
      .sort((a, b) => WEIGHTS[a.pos] - WEIGHTS[b.pos] || Number(a.pos !== 'frame') - Number(b.pos !== 'frame') || used(a) - used(b) || order(a.key, b.key))[0];
    if (!r) continue;
    pins[p.id] = r.key;
    left.set(r.key, left.get(r.key)! - p.L);
  }
  return pins;
}

/**
 * `route`: which packing won (`even`: none scored better, but a pair was evened out; null: nothing applied). `held`: something better was
 * found, but it would move a thing to keep that is no single piece (food or a thing split over bags, ticked as packed), so nothing is
 * applied. `partial`: a search ran out of its trials. `done`: everything ran within the budget; when not, nothing is applied and the
 * caller runs it again with a larger one.
 */
export type HandledFirst = {
  apply: boolean; packing: Packing; moves: Move[]; gain: number; route: 'search' | 'heaviest' | 'even' | null; held: boolean; tried: number;
  partial: boolean; done: boolean;
};

/** The bag that holds most of a thing in a packing: its unit when it is one piece, else the largest of its entries (`[bag, …, litres]`). */
function mainBag(p: Packing, id: string): string | null {
  const piece = p.pieces.find((x) => x.id === id);
  if (piece) return piece.unit;
  const entries = (p.result.items[id] ?? []) as unknown[];
  let best: string | null = null, most = -1;
  for (const e of entries) {
    if (!Array.isArray(e) || typeof e[0] !== 'string') continue;
    const L = Number(e[e.length - 1]);
    if (L > most + EPS) { most = L; best = e[0]; }
  }
  return best;
}

/**
 * Handling first (design §4): from `start`, the plan as it stands, the usual search with its wider look run to the end (every gain
 * taken, however small), and the heaviest-first packing (`fresh`: the planner's own packing with these pins) with the same search run
 * from it; whichever has the lower score, a tie to more kilos in the frame bag. Kept only when it keeps every promise of `start`, leaves
 * every thing to keep (`fixed`) with exactly its bags and litres, keeps each pair's two sides as even as they were (an even pair even:
 * PAIR_UNEVEN), and lowers the score by 0.01 or more: never worse than the plan. Then the moves that change nothing are put back (the
 * moves of one pair from one half to the other together first, then one by one), so the rider repacks less, and an uneven pair is evened
 * out where a thing can go to the emptier half at no cost (also with nothing else to gain). Applied only with a thing to move, every
 * thing whose main bag changes listed (a split thing packed whole too). `trial` and `extra` as for balance; each search at most
 * `maxTrials`. `pairs`: each pair's gap in the plan as the rider sees it, the side to side baseline (default: `start`'s). `budget`: all trials at most this many (the page's slices, its trials remembered, so each run adds only new ones). Every
 * input the same, the same answer.
 */
export function handlingFirst(start: Packing, trial: (pins: Record<string, string>, from: Packing) => Packing,
  fresh: (pins: Record<string, string>) => Packing,
  o: { fixed?: ReadonlySet<string> | readonly string[]; extra?: readonly string[]; maxTrials?: number; budget?: number; pairs?: Record<string, number> } = {}): HandledFirst {
  const fixed = new Set(o.fixed ?? []);
  const max = o.maxTrials ?? MAX_BALANCE_TRIALS, budget = o.budget ?? Infinity;
  let tried = 0;
  const none = (held: boolean, partial: boolean, done: boolean): HandledFirst =>
    ({ apply: false, packing: start, moves: [], gain: 0, route: null, held, tried, partial, done });
  const out = () => none(false, true, false);   // the budget ran out: run again with a larger one
  const s0 = handlingScore(start.result);
  const frameKg = (p: Packing) => p.result.kgByPos.frame ?? 0;
  const kept = (p: Packing) => [...fixed].every((id) => JSON.stringify(start.result.items[id] ?? null) === JSON.stringify(p.result.items[id] ?? null));
  // side to side measured against the plan as the rider sees it (`pairs`, each pair's gap there: re-check of PR 117, N1), else `start`
  const base = new Map([...pairGaps(start), ...Object.entries(o.pairs ?? {})]);
  const sides = (p: Packing) => sidesKept(base, p);
  // a pair evened out at no cost counts only where it was uneven on screen
  const evenedOnScreen = (p: Packing) => [...base].some(([k, g]) => g >= PAIR_UNEVEN && (pairGaps(p).get(k) ?? g) < PAIR_UNEVEN);
  // one search within what is left of the budget; null when the budget ran out first
  const search = (from: Packing): Balanced | null => {
    const n = Math.min(max, budget - tried);
    const b = balance(from, trial, { fixed, wide: true, extra: o.extra ?? [], maxTrials: n, keep: sides });
    tried += b.tried;
    return b.partial && n < max ? null : b;
  };
  // each uneven pair evened where a whole thing can go from the fuller half to the emptier one at no cost, nearest to even first;
  // null when the budget ran out first
  const evenOut = (from: Packing): Packing | null => {
    let cur = from;
    const refused = new Set<string>();
    for (;;) {
      const gaps = pairGaps(cur);
      let step: { id: string; to: string; est: number; gap: number } | null = null;
      for (const [k, gap] of gaps) {
        if (gap < PAIR_UNEVEN) continue;
        const [a, b] = cur.rooms.filter((r) => r.pair === k);
        const ca = capOf(cur, a!), cb = capOf(cur, b!);
        const [full, empty, cf, ce] = (ca - a!.freeL) / ca >= (cb - b!.freeL) / cb ? [a!, b!, ca, cb] : [b!, a!, cb, ca];
        for (const x of cur.pieces) {
          if (x.unit !== full.key || fixed.has(x.id) || refused.has(`${x.id}>${empty.key}`) || x.L > empty.freeL + (empty.fillL ?? 0) + EPS) continue;
          const est = Math.abs((cf - full.freeL - x.L) / cf - (ce - empty.freeL + x.L) / ce);
          if (est < gap - EPS && (!step || est < step.est - EPS || (Math.abs(est - step.est) <= EPS && order(x.id, step.id) < 0))) step = { id: x.id, to: empty.key, est, gap };
        }
      }
      // kept only when an uneven pair ends even: steps that leave it uneven all the same would be things to repack for nothing
      if (!step) return [...pairGaps(from)].some(([k, g]) => g >= PAIR_UNEVEN && (pairGaps(cur).get(k) ?? g) < PAIR_UNEVEN) ? cur : from;
      if (tried >= budget) return null;
      const next = trial({ [step.id]: step.to }, cur);
      tried++;
      const k = cur.rooms.find((r) => r.key === step!.to)!.pair!;
      if (next.pieces.find((x) => x.id === step.id)?.unit === step.to && keepsPromises(start.result, next.result) && kept(next)
        && handlingScore(next.result) <= handlingScore(cur.result) + EPS && (pairGaps(next).get(k) ?? 1) < step.gap - EPS) cur = next;
      else refused.add(`${step.id}>${step.to}`);
    }
  };
  const usual = search(start);
  if (!usual || tried >= budget) return out();
  let firstPacked: Packing | null = fresh(heaviestFirst(start, fixed));
  tried++;
  if (!sides(firstPacked)) firstPacked = evenOut(firstPacked);
  if (!firstPacked) return out();
  let heavy: Balanced | null = null;
  if (keepsPromises(start.result, firstPacked.result) && sides(firstPacked)) {
    heavy = search(firstPacked);
    if (!heavy) return out();
  }
  const partial = usual.partial || !!heavy?.partial;
  const better = [{ route: 'search' as const, packing: usual.packing }, ...(heavy ? [{ route: 'heaviest' as const, packing: heavy.packing }] : [])]
    .filter((c) => keepsPromises(start.result, c.packing.result) && sides(c.packing) && handlingScore(c.packing.result) <= s0 - STEP + EPS);
  const ok = better.filter((c) => kept(c.packing))
    .sort((a, b) => handlingScore(a.packing.result) - handlingScore(b.packing.result) || frameKg(b.packing) - frameKg(a.packing));
  // every thing whose main bag changed, a thing split over bags too
  const ids = [...new Set([...start.pieces.map((x) => x.id), ...(o.extra ?? [])])].filter((id) => !fixed.has(id));
  const movesOf = (p: Packing): Move[] => {
    const list: Move[] = [];
    for (const id of ids) {
      const from = mainBag(start, id), to = mainBag(p, id);
      if (from && to && from !== to) list.push({ id, from, to });
    }
    for (const x of p.pieces) if (!ids.includes(x.id) && !fixed.has(x.id)) { const from = mainBag(start, x.id); if (from && from !== x.unit) list.push({ id: x.id, from, to: x.unit }); }
    return list;
  };
  const finish = (cur: Packing, route: HandledFirst['route']): HandledFirst => {
    const moves = movesOf(cur);
    if (!moves.length) return none(false, partial, true);
    const gain = Math.round((s0 - handlingScore(cur.result)) * 100) / 100;
    return { apply: true, packing: cur, moves, gain, route, held: false, tried, partial, done: true };
  };
  const best = ok[0];
  if (!best) {
    // nothing scores better: a pair evened out is still worth the press
    const evened = evenOut(start);
    if (!evened) return out();
    if (evened !== start && evenedOnScreen(evened) && sides(evened)) return finish(evened, 'even');
    return none(better.length > 0, partial, true);
  }
  let cur = best.packing;
  const pairOf = new Map([...start.rooms, ...cur.rooms].filter((r) => r.pair).map((r) => [r.key, r.pair!]));
  const posOf = new Map([...start.rooms, ...cur.rooms].map((r) => [r.key, r.pos]));
  const split = new Set((o.extra ?? []).filter((id) => !start.pieces.some((x) => x.id === id)));
  const kgOf = (id: string) => (cur.pieces.find((x) => x.id === id) ?? start.pieces.find((x) => x.id === id))?.kg ?? 0;
  // a put-back keeps the score, the frame bag's kilos, every promise, every kept thing, and the side to side rule (an evened pair is
  // evened again afterwards)
  const putBack = (pins: Record<string, string>): boolean => {
    const next = trial(pins, cur);
    tried++;
    if (Object.entries(pins).every(([id, key]) => next.pieces.find((x) => x.id === id)?.unit === key) && keepsPromises(start.result, next.result)
      && kept(next) && sides(next) && handlingScore(next.result) <= handlingScore(cur.result) && frameKg(next) >= frameKg(cur) - EPS) { cur = next; return true; }
    return false;
  };
  // the moves of one pair from one half to the other, put back together (review of PRs 116/117, I2), then each move on its own, the
  // moves that do the least first: kilos times the drop of the handling weight; a split thing packed whole stays as it is
  const isWithin = (m: Move) => !split.has(m.id) && pairOf.get(m.from) !== undefined && pairOf.get(m.from) === pairOf.get(m.to);
  // a move from one half of a pair to the other only where side to side needs it, never for score (the coordinator's ruling on review
  // I2): the other moves alone, on the plan as it stands; when they hold everything without the pair's moves, the pair's moves go, and
  // a gain that came only from them goes with them
  const cross = movesOf(cur).filter((m) => !isWithin(m));
  if (cross.length < movesOf(cur).length) {
    if (tried >= budget) return out();
    const target = new Map(cross.map((m) => [m.id, m.to]));
    let next = cross.length ? trial(Object.fromEntries(target), start) : start;
    if (cross.length) tried++;
    // a thing that found no room in its half of a pair goes to the other half (the moves within the pair made the room there)
    const other = (key: string) => { const k = pairOf.get(key); return k === undefined ? undefined : [...pairOf].find(([u, v]) => v === k && u !== key)?.[0]; };
    const missed = cross.filter((m) => mainBag(next, m.id) !== m.to && other(m.to));
    if (missed.length) {
      if (tried >= budget) return out();
      for (const m of missed) target.set(m.id, other(m.to)!);
      next = trial(Object.fromEntries(target), start);
      tried++;
    }
    if (cross.every((m) => mainBag(next, m.id) === target.get(m.id)) && keepsPromises(start.result, next.result) && kept(next) && sides(next)) {
      if (handlingScore(next.result) > s0 - STEP + EPS) {
        const evened = evenOut(start);
        if (!evened) return out();
        return evened !== start && evenedOnScreen(evened) && sides(evened) ? finish(evened, 'even') : none(false, partial, true);
      }
      cur = next;
    }
  }
  const within = movesOf(cur).filter(isWithin);
  for (const k of [...new Set(within.map((m) => pairOf.get(m.from)!))].sort(order)) {
    const group = within.filter((m) => pairOf.get(m.from) === k);
    if (group.length < 2) continue;
    if (tried >= budget) return out();
    putBack(Object.fromEntries(group.map((m) => [m.id, m.from])));
  }
  const worth = (m: Move) => kgOf(m.id) * (WEIGHTS[posOf.get(m.from)!] - WEIGHTS[posOf.get(m.to)!]);
  for (const m of movesOf(cur).filter((x) => !split.has(x.id)).sort((a, b) => worth(a) - worth(b) || order(a.id, b.id))) {
    if (tried >= budget) return out();
    putBack({ [m.id]: m.from });
  }
  const evened = evenOut(cur);
  if (!evened) return out();
  return finish(evened, best.route);
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

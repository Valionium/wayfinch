import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { autoBalance, balance, frameRoom, handlingFirst, heaviestFirst, keepsPromises, MAX_BALANCE_TRIALS } from '../../../../src/core/advisor/balance.ts';
import type { Packing } from '../../../../src/core/advisor/balance.ts';
import { handlingScore } from '../../../../src/core/advisor/rank.ts';
import type { Pos, TrialResult } from '../../../../src/core/advisor/types.ts';
import { MIN_GAIN_SCORE, WEIGHTS } from '../../../../src/core/advisor/table.ts';

// A stand-in packer: the plan's own assignment, with the pins on top (a pin into a bag with too little room stays where it was, as the
// planner's "not kept"). Must-reach items count out of reach in a bag the rider cannot reach while riding.
type Bag = { key: string; pos: Pos; cap: number; reach: boolean };
type Item = { id: string; kg: number; L: number; reach?: boolean };
function packer(bags: Bag[], items: Item[], plan: Record<string, string>) {
  let calls = 0;
  const pack = (pins: Record<string, string>): Packing => {
    const at: Record<string, string> = { ...plan };
    const left = new Map(bags.map((b) => [b.key, b.cap]));
    for (const it of items) left.set(at[it.id]!, left.get(at[it.id]!)! - it.L);
    for (const [id, key] of Object.entries(pins)) {
      const it = items.find((x) => x.id === id)!;
      if (left.get(key)! + 1e-9 < it.L) continue;
      left.set(at[id]!, left.get(at[id]!)! + it.L);
      left.set(key, left.get(key)! - it.L);
      at[id] = key;
    }
    const pos = (key: string) => bags.find((b) => b.key === key)!.pos;
    const kgByPos: Partial<Record<Pos, number>> = {};
    for (const it of items) kgByPos[pos(at[it.id]!)] = (kgByPos[pos(at[it.id]!)] ?? 0) + it.kg;
    const back = items.filter((it) => pos(at[it.id]!) === 'pack');
    const result: TrialResult = {
      overL: 0, spillIds: [], backL: back.reduce((t, x) => t + x.L, 0), backKg: back.reduce((t, x) => t + x.kg, 0),
      outOfReach: items.filter((it) => it.reach && !bags.find((b) => b.key === at[it.id])!.reach).length, kgByPos, items: {},
    };
    return {
      result,
      pieces: items.map((it) => ({ id: it.id, kg: it.kg, L: it.L, unit: at[it.id]!, pos: pos(at[it.id]!) })),
      rooms: bags.map((b) => ({ key: b.key, pos: b.pos, freeL: left.get(b.key)! })),
    };
  };
  return { start: pack({}), trial: (pins: Record<string, string>) => { calls++; return pack(pins); }, calls: () => calls };
}

// A stand-in closer to the planner's kept plan: every pinned item is taken out first, then placed in its pinned bag when it fits there
// (else back where it was, else left over), and food (`food`) is no piece: it fills the gaps last, lightest position first, and what
// does not fit is left over. A bag's free litres are what is left after the food; `fillL` is the food's litres in it.
type FItem = Item & { food?: boolean };
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function repacker(bags: Bag[], items: FItem[], plan: Record<string, string>) {
  const bag = (key: string) => bags.find((b) => b.key === key)!;
  const byLight = [...bags].sort((a, b) => WEIGHTS[a.pos] - WEIGHTS[b.pos] || order(a.key, b.key));
  const pack = (pins: Record<string, string>): Packing => {
    const at: Record<string, string> = {};
    const left = new Map(bags.map((b) => [b.key, b.cap]));
    const solid = items.filter((it) => !it.food);
    const put = (id: string, key: string, L: number) => { at[id] = key; left.set(key, left.get(key)! - L); };
    for (const it of solid) if (!(it.id in pins)) put(it.id, plan[it.id]!, it.L);
    let overL = 0;
    const spillIds: string[] = [];
    for (const it of solid.filter((x) => x.id in pins)) {
      const key = [pins[it.id]!, plan[it.id]!].find((k) => left.get(k)! + 1e-9 >= it.L);
      if (key) put(it.id, key, it.L);
      else { overL += it.L; spillIds.push(it.id); }
    }
    const kgByPos: Partial<Record<Pos, number>> = {};
    const add = (p: Pos, kg: number) => { kgByPos[p] = (kgByPos[p] ?? 0) + kg; };
    const fill = new Map(bags.map((b) => [b.key, 0]));
    for (const it of items.filter((x) => x.food)) {
      let need = it.L;
      for (const b of byLight) {
        const take = Math.min(need, left.get(b.key)!);
        if (take <= 1e-9) continue;
        left.set(b.key, left.get(b.key)! - take); fill.set(b.key, fill.get(b.key)! + take); add(b.pos, (it.kg * take) / it.L); need -= take;
      }
      overL += need;
    }
    for (const it of solid) if (at[it.id]) add(bag(at[it.id]!).pos, it.kg);
    const onBack = (key: string) => bag(key).pos === 'pack';
    const back = solid.filter((it) => at[it.id] && onBack(at[it.id]!));
    const result: TrialResult = {
      overL: +overL.toFixed(2), spillIds,
      backL: back.reduce((t, x) => t + x.L, 0) + bags.filter((b) => onBack(b.key)).reduce((t, b) => t + fill.get(b.key)!, 0),
      backKg: back.reduce((t, x) => t + x.kg, 0),
      outOfReach: solid.filter((it) => it.reach && at[it.id] && !bag(at[it.id]!).reach).length, kgByPos, items: {},
    };
    return {
      result,
      pieces: solid.filter((it) => at[it.id]).map((it) => ({ id: it.id, kg: it.kg, L: it.L, unit: at[it.id]!, pos: bag(at[it.id]!).pos })),
      rooms: bags.map((b) => ({ key: b.key, pos: b.pos, freeL: +left.get(b.key)!.toFixed(2), fillL: +fill.get(b.key)!.toFixed(2) })),
    };
  };
  return { start: pack({}), trial: (pins: Record<string, string>) => pack(pins) };
}

const BAGS: Bag[] = [
  { key: 'f-0', pos: 'frame', cap: 6, reach: true },
  { key: 's-0', pos: 'seat', cap: 14, reach: false },
  { key: 'b-0', pos: 'bar', cap: 12, reach: true },
  { key: 't-0', pos: 'top', cap: 1, reach: true },
];

describe('balancing in the rider\'s own bags (weight map design §7)', () => {
  test('[WM-BALANCE] moves the heaviest weighted kilos into the lightest position with room, one whole item at a time, until no move helps', () => {
    const items: Item[] = [
      { id: 'tent', kg: 2.4, L: 5 }, { id: 'stove', kg: 0.6, L: 1.5 }, { id: 'clothes', kg: 1, L: 6 }, { id: 'snack', kg: 0.3, L: 0.5, reach: true },
    ];
    const p = packer(BAGS, items, { tent: 's-0', stove: 's-0', clothes: 'b-0', snack: 't-0' });
    const out = balance(p.start, p.trial);
    // 2.4 kg from the seat pack into the frame bag first; the stove no longer fits there, so the bar roll, lighter than the seat
    // pack; the snack into the frame bag's last litre, still within reach
    expect(out.pins).toEqual({ tent: 'f-0', stove: 'b-0', snack: 'f-0' });
    expect(out.moves).toEqual([{ id: 'tent', from: 's-0', to: 'f-0' }, { id: 'stove', from: 's-0', to: 'b-0' }, { id: 'snack', from: 't-0', to: 'f-0' }]);
    expect(out.packing.pieces.find((x) => x.id === 'clothes')!.unit).toBe('b-0'); // 6 L: no room anywhere lighter
    expect(handlingScore(out.packing.result)).toBeLessThan(handlingScore(p.start.result));
    expect(out.partial).toBe(false);
    // the same inputs, the same answer
    expect(balance(p.start, p.trial)).toEqual(out);
  });

  test('[WM-BALANCE] the rider\'s hand placements never move; nothing is ever moved onto the back or to a heavier position', () => {
    const items: Item[] = [{ id: 'tent', kg: 2.4, L: 5 }, { id: 'book', kg: 1, L: 1 }];
    const bags: Bag[] = [...BAGS, { key: 'p-0', pos: 'pack', cap: 15, reach: true }];
    const p = packer(bags, items, { tent: 's-0', book: 'f-0' });
    const out = balance(p.start, p.trial, { fixed: ['tent'] });
    expect(out.moves).toEqual([]);
    expect(out.packing).toBe(p.start);
    expect(p.calls()).toBe(0); // the book is already in the lightest position: nothing to try
  });

  test('[WM-BALANCE] keeps every must-reach item within reach and everything fitting: a move that breaks either is never kept', () => {
    // the rain jacket must be within reach: the fork cage (lighter than the bar) is not reachable here
    const bags: Bag[] = [{ key: 'k-0', pos: 'fork', cap: 4, reach: false }, { key: 'b-0', pos: 'bar', cap: 12, reach: true }, { key: 'f-0', pos: 'frame', cap: 2, reach: true }];
    const items: Item[] = [{ id: 'jacket', kg: 0.5, L: 3, reach: true }, { id: 'pump', kg: 0.3, L: 1 }, { id: 'pot', kg: 0.4, L: 2.5 }];
    const p = packer(bags, items, { jacket: 'b-0', pump: 'b-0', pot: 'b-0' });
    const out = balance(p.start, p.trial);
    const unit = (id: string) => out.packing.pieces.find((x) => x.id === id)!.unit;
    expect(unit('jacket')).toBe('b-0'); // too big for the frame bag, and the fork is out of reach
    expect(unit('pot')).toBe('k-0'); // too big for the frame bag's 2 L, so the fork
    expect(unit('pump')).toBe('f-0');
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(out.packing.result.outOfReach).toBe(0);
  });

  test('[WM-BALANCE] the promises: no more left over, no item newly left over, no more litres on the back, no more out of reach', () => {
    const base: TrialResult = { overL: 1, spillIds: ['mat'], backL: 3, backKg: 2, outOfReach: 1, kgByPos: {}, items: {} };
    expect(keepsPromises(base, base)).toBe(true);
    expect(keepsPromises(base, { ...base, overL: 1.1 })).toBe(false);
    expect(keepsPromises(base, { ...base, spillIds: ['stove'] })).toBe(false);
    expect(keepsPromises(base, { ...base, overL: 0, spillIds: [] })).toBe(true);
    expect(keepsPromises(base, { ...base, backL: 3.1 })).toBe(false);
    expect(keepsPromises(base, { ...base, outOfReach: 2 })).toBe(false);
  });

  // Review of PR 78, I1: the search also swaps two things, and uses the room the planner's re-pack makes (food fills the gaps last).
  test('[WM-BALANCE] swaps two things when neither single move fits: a full frame bag\'s light jacket for the heavy small lock on the back', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 'p-0', pos: 'pack', cap: 30, reach: true }];
    const items: Item[] = [{ id: 'jacket', kg: 0.3, L: 1.5 }, { id: 'lock', kg: 1.2, L: 1.5 }, { id: 'clothes', kg: 0.8, L: 8 }];
    const p = repacker(bags, items, { jacket: 'f-0', lock: 'p-0', clothes: 'p-0' });
    expect(p.start.rooms.find((r) => r.key === 'f-0')!.freeL).toBe(0.5); // the lock alone does not fit
    const out = balance(p.start, p.trial);
    expect(out.pins).toEqual({ lock: 'f-0', jacket: 'p-0' });
    expect(out.moves).toEqual([{ id: 'jacket', from: 'f-0', to: 'p-0' }, { id: 'lock', from: 'p-0', to: 'f-0' }]);
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(handlingScore(out.packing.result)).toBeCloseTo(handlingScore(p.start.result) - 0.9 * 2.5, 2);
    expect(balance(p.start, p.trial)).toEqual(out);
  });

  test('[WM-BALANCE] a swap that puts more litres on the back is never kept', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 'p-0', pos: 'pack', cap: 30, reach: true }];
    const items: Item[] = [{ id: 'jacket', kg: 0.3, L: 3 }, { id: 'lock', kg: 1.2, L: 1.5 }];
    const p = repacker(bags, items, { jacket: 'f-0', lock: 'p-0' });
    const out = balance(p.start, p.trial);
    expect(out.moves).toEqual([]);
    expect(out.tried).toBe(1); // the swap was tried, and refused
  });

  test('[WM-BALANCE] a move into a bag whose free litres the food takes is tried: the re-pack puts the food elsewhere', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 4, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const items: FItem[] = [{ id: 'food', kg: 1, L: 3, food: true }, { id: 'stove', kg: 0.8, L: 2 }];
    const p = repacker(bags, items, { stove: 's-0' });
    expect(p.start.rooms.find((r) => r.key === 'f-0')!.freeL).toBe(1); // the food went first into the frame bag
    const out = balance(p.start, p.trial);
    expect(out.pins).toEqual({ stove: 'f-0' });
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(handlingScore(out.packing.result)).toBeLessThan(handlingScore(p.start.result) - 0.01);
  });

  test('[WM-BALANCE] a move refused before is tried again once another move changed the packing', () => {
    const items: Item[] = [{ id: 'tent', kg: 2, L: 4 }, { id: 'book', kg: 1, L: 1 }];
    const p = packer(BAGS, items, { tent: 's-0', book: 's-0' });
    // the planner refuses the tent anywhere while the book has not moved: the tent's best move, refused first, is kept once it has
    const trial = (pins: Record<string, string>) => (pins.tent && !pins.book ? p.start : p.trial(pins));
    const out = balance(p.start, trial);
    expect(out.pins).toEqual({ book: 'f-0', tent: 'f-0' });
  });

  test('[WM-BALANCE] at most MAX_BALANCE_TRIALS trials: the answer is then marked partial', () => {
    const items: Item[] = Array.from({ length: 40 }, (_, i) => ({ id: `i${String(i).padStart(2, '0')}`, kg: 0.5, L: 0.1 }));
    // every move is refused (the frame bag looks roomy but the packer keeps everything where it was)
    const p = packer(BAGS, items, Object.fromEntries(items.map((it) => [it.id, 's-0'])));
    const refusing = (pins: Record<string, string>) => { void pins; return p.start; };
    const out = balance(p.start, refusing, { maxTrials: 12 });
    expect(out.tried).toBe(12);
    expect(out.partial).toBe(true);
    expect(MAX_BALANCE_TRIALS).toBeGreaterThanOrEqual(100);
  });

  // Review of PR 78, m-A: a thing moved to a heavier place can still lower the score, since the re-pack then fills the room it leaves with
  // heavier things (food here). The usual search never tries it; the wider look (the weight map's ideal, the owner's decision of 9 Nov) does.
  test('[WM-BALANCE] the wider look: a bulky light thing out of the full frame bag lets the food in, though it sits heavier itself', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: true }];
    const items: FItem[] = [{ id: 'jacket', kg: 0.2, L: 3 }, { id: 'food', kg: 2, L: 3, food: true }];
    const p = repacker(bags, items, { jacket: 'f-0' });
    expect(balance(p.start, p.trial).moves).toEqual([]); // the usual search: nothing lighter to move to
    const out = balance(p.start, p.trial, { wide: true });
    expect(out.moves).toEqual([{ id: 'jacket', from: 'f-0', to: 's-0' }]);
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(handlingScore(out.packing.result)).toBeCloseTo(handlingScore(p.start.result) - (2 - 0.2) * (WEIGHTS.seat - WEIGHTS.frame), 2);
    expect(out.partial).toBe(false);
    expect(balance(p.start, p.trial, { wide: true })).toEqual(out);
    // a hand placement is never part of it
    expect(balance(p.start, p.trial, { wide: true, fixed: ['jacket'] }).moves).toEqual([]);
  });

  test('[WM-BALANCE] the wider look also places a thing the planner split over bags whole, and keeps it only when it helps', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: true }];
    const items: FItem[] = [{ id: 'jacket', kg: 0.2, L: 3 }, { id: 'food', kg: 2, L: 3, food: true }];
    const p = repacker(bags, items, { jacket: 'f-0' });
    const seen: string[] = [];
    const trial = (pins: Record<string, string>) => { seen.push(JSON.stringify(pins)); return p.trial(pins); };
    const out = balance(p.start, trial, { wide: true, extra: ['mat'] });
    expect(seen).toContain(JSON.stringify({ jacket: 's-0', mat: 'f-0' }));
    expect(out.pins).toEqual({ jacket: 's-0' }); // the mat (not a thing this stand-in packs) changes nothing, so it is not kept
  });
});

// The owner's decision of 8 Nov 2026 (weight map design §7): the bag planner balances by itself, on top of its own packing, and only when
// it is clearly better: Better handling's score lower by the advisor's own threshold (MIN_GAIN_SCORE) or more.
describe('automatic balancing (weight map design §7)', () => {
  test('[BAL-AUTO] applies the balance when it lowers the score by MIN_GAIN_SCORE or more, the balance being the search\'s own', () => {
    const items: Item[] = [{ id: 'tent', kg: 2.4, L: 5 }, { id: 'clothes', kg: 1, L: 6 }];
    const p = packer(BAGS, items, { tent: 's-0', clothes: 'b-0' });
    const out = autoBalance(p.start, p.trial);
    expect(out.apply).toBe(true);
    expect(out.balanced).toEqual(balance(p.start, p.trial));
    expect(out.gain).toBeCloseTo(2.4 * (WEIGHTS.seat - WEIGHTS.frame), 2);
    expect(MIN_GAIN_SCORE).toBe(0.5);
  });

  test('[BAL-AUTO] a balance that lowers the score by less than MIN_GAIN_SCORE is not applied; exactly MIN_GAIN_SCORE is', () => {
    // 0.4 kg from the bar roll (2.2) into the top tube bag (1.2): 0.4 points, a real move but not clearly better
    const two: Bag[] = [{ key: 't-0', pos: 'top', cap: 1, reach: true }, { key: 'b-0', pos: 'bar', cap: 12, reach: true }];
    const small = packer(two, [{ id: 'pump', kg: 0.4, L: 0.5 }], { pump: 'b-0' });
    const a = autoBalance(small.start, small.trial);
    expect(a.balanced.moves.length).toBe(1);
    expect(a.gain).toBeCloseTo(0.4, 2);
    expect(a.apply).toBe(false);
    // 0.5 kg the same way: 0.5 points, applied
    const enough = packer(two, [{ id: 'lock', kg: 0.5, L: 0.5 }], { lock: 'b-0' });
    const b = autoBalance(enough.start, enough.trial);
    expect(b.gain).toBeCloseTo(0.5, 2);
    expect(b.apply).toBe(true);
    // nothing to move: nothing applied
    const none = packer(two, [{ id: 'lock', kg: 0.5, L: 0.5 }], { lock: 't-0' });
    expect(autoBalance(none.start, none.trial)).toMatchObject({ apply: false, gain: 0 });
  });

  test('[BAL-KEEPS] the things it is told to keep (hand placements, must-reach things within reach, things ticked as packed) never move', () => {
    const items: Item[] = [{ id: 'tent', kg: 2.4, L: 5 }, { id: 'stove', kg: 0.9, L: 1.5 }];
    const p = packer(BAGS, items, { tent: 's-0', stove: 's-0' });
    const out = autoBalance(p.start, p.trial, { fixed: ['tent'] });
    expect(out.balanced.moves.map((m) => m.id)).toEqual(['stove']);
    expect(out.balanced.packing.pieces.find((x) => x.id === 'tent')!.unit).toBe('s-0');
    expect(out.apply).toBe(true); // 0.9 kg from the seat pack to the frame bag: 1.44 points
  });

  // The owner's choice of 9 Nov 2026 ("Yes, wider balancing"): the automatic balancing takes the wider look too.
  test('[BAL-AUTO] with the wider look it applies a balance the usual search cannot find: the bulky light jacket out of the full frame bag, the food in', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: true }];
    const items: FItem[] = [{ id: 'jacket', kg: 0.2, L: 3 }, { id: 'food', kg: 2, L: 3, food: true }];
    const p = repacker(bags, items, { jacket: 'f-0' });
    expect(autoBalance(p.start, p.trial).apply).toBe(false);
    const out = autoBalance(p.start, p.trial, { wide: true, extra: [] });
    expect(out.apply).toBe(true);
    expect(out.balanced).toEqual(balance(p.start, p.trial, { wide: true, extra: [] }));
    expect(out.gain).toBeCloseTo((2 - 0.2) * (WEIGHTS.seat - WEIGHTS.frame), 2);
    // what the rider keeps where it is stays there, wider look or not
    expect(autoBalance(p.start, p.trial, { wide: true, fixed: ['jacket'] }).apply).toBe(false);
  });
});

// "Handling first" (design of 10 Nov 2026, the owner's answers §10): one press packs by weight, the densest things into the best spots
// (frame bag, top tube bag, fork cages, panniers, bar roll, seat pack; never the back), taking every gain however small. It tries the
// usual search run to the end and a heaviest-first packing (then the search from there), keeps whichever handles better, and is never
// worse than the plan as it stands.
// A stand-in closer to the page's two packings: `trial` keeps everything where the packing it starts from has it and places a pin only
// where it then fits (the kept plan's passes 1 and 2); `fresh` is the planner's own packing with the pins placed first, the rest where the
// plan has them when they fit, else in the bag with the most free litres. Food is no piece and fills the gaps last, lightest position
// first. `items` in the result: each thing's bags and litres, as plan.items has them.
function keeper(bags: Bag[], items: FItem[], plan: Record<string, string>) {
  const bag = (key: string) => bags.find((b) => b.key === key)!;
  const byLight = [...bags].sort((a, b) => WEIGHTS[a.pos] - WEIGHTS[b.pos] || order(a.key, b.key));
  const solid = items.filter((it) => !it.food);
  const pack = (at: Record<string, string>, pins: Record<string, string>, pinsFirst: boolean): Packing => {
    const left = new Map(bags.map((b) => [b.key, b.cap]));
    const where: Record<string, string> = {};
    const fits = (key: string | undefined, L: number) => !!key && left.has(key) && left.get(key)! + 1e-9 >= L;
    const put = (id: string, key: string, L: number) => { where[id] = key; left.set(key, left.get(key)! - L); };
    const pinned = solid.filter((it) => it.id in pins), rest = solid.filter((it) => !(it.id in pins));
    const spillIds: string[] = [];
    let overL = 0;
    const placeRest = (it: FItem) => {
      const roomiest = [...bags].sort((a, b) => left.get(b.key)! - left.get(a.key)! || order(a.key, b.key)).map((b) => b.key);
      const key = [at[it.id], ...roomiest].find((k) => fits(k, it.L));
      if (key) put(it.id, key, it.L); else { spillIds.push(it.id); overL += it.L; }
    };
    const placePinned = (it: FItem) => { if (fits(pins[it.id], it.L)) put(it.id, pins[it.id]!, it.L); else placeRest(it); };
    if (pinsFirst) { pinned.forEach(placePinned); rest.forEach(placeRest); } else { rest.forEach(placeRest); pinned.forEach(placePinned); }
    const kgByPos: Partial<Record<Pos, number>> = {};
    const add = (p: Pos, kg: number) => { kgByPos[p] = +((kgByPos[p] ?? 0) + kg).toFixed(4); };
    const fill = new Map(bags.map((b) => [b.key, 0]));
    const out: Record<string, unknown[]> = {};
    for (const it of solid) if (where[it.id]) { add(bag(where[it.id]!).pos, it.kg); out[it.id] = [[where[it.id], 1, it.L]]; }
    for (const it of items.filter((x) => x.food)) {
      let need = it.L;
      const entries: unknown[] = [];
      for (const b of byLight) {
        const take = Math.min(need, left.get(b.key)!);
        if (take <= 1e-9) continue;
        left.set(b.key, left.get(b.key)! - take); fill.set(b.key, fill.get(b.key)! + take); add(b.pos, (it.kg * take) / it.L); need -= take;
        entries.push([b.key, 1, +take.toFixed(2)]);
      }
      out[it.id] = entries;
      overL += need;
    }
    const onBack = solid.filter((it) => where[it.id] && bag(where[it.id]!).pos === 'pack');
    const result: TrialResult = {
      overL: +overL.toFixed(2), spillIds,
      backL: +(onBack.reduce((t, x) => t + x.L, 0) + bags.filter((b) => b.pos === 'pack').reduce((t, b) => t + fill.get(b.key)!, 0)).toFixed(2),
      backKg: onBack.reduce((t, x) => t + x.kg, 0),
      outOfReach: solid.filter((it) => it.reach && where[it.id] && !bag(where[it.id]!).reach).length, kgByPos, items: out,
    };
    return {
      result,
      pieces: solid.filter((it) => where[it.id]).map((it) => ({ id: it.id, kg: it.kg, L: it.L, unit: where[it.id]!, pos: bag(where[it.id]!).pos })),
      rooms: bags.map((b) => ({ key: b.key, pos: b.pos, freeL: +left.get(b.key)!.toFixed(2), fillL: +fill.get(b.key)!.toFixed(2), capL: b.cap })),
      state: where,
    };
  };
  return {
    start: pack(plan, {}, false),
    trial: (pins: Record<string, string>, from: Packing) => pack(from.state as Record<string, string>, pins, false),
    fresh: (pins: Record<string, string>) => pack(plan, pins, true),
  };
}
const unitOf = (p: Packing, id: string) => p.pieces.find((x) => x.id === id)?.unit;

describe('"Handling first" (design of 10 Nov 2026)', () => {
  test('[HF-ORDER] the heaviest-first packing pins the densest things into the best spots first: frame bag, top tube bag, fork cages, panniers, bar roll, seat pack, never the back', () => {
    const bags: Bag[] = [
      { key: 's-0', pos: 'seat', cap: 14, reach: false }, { key: 'b-0', pos: 'bar', cap: 10, reach: true },
      { key: 'k-0', pos: 'fork', cap: 2, reach: false }, { key: 'f-0', pos: 'frame', cap: 2.5, reach: true },
      { key: 't-0', pos: 'top', cap: 1, reach: true }, { key: 'p-0', pos: 'pack', cap: 20, reach: true },
    ];
    const items: FItem[] = [
      { id: 'lock', kg: 0.9, L: 0.8 }, { id: 'tools', kg: 0.5, L: 0.5 }, { id: 'bank', kg: 0.35, L: 0.4 }, { id: 'stove', kg: 0.5, L: 1.5 },
      { id: 'pot', kg: 0.3, L: 1 }, { id: 'tent', kg: 1.3, L: 5 }, { id: 'quilt', kg: 0.8, L: 5 }, { id: 'puffy', kg: 0.35, L: 2 },
    ];
    const p = keeper(bags, items, { lock: 's-0', tools: 's-0', bank: 'b-0', stove: 's-0', pot: 'p-0', tent: 'b-0', quilt: 's-0', puffy: 'p-0' });
    // by kilos per litre: lock 1.125, tools 1.0, bank 0.875, stove 0.33, pot 0.3, tent 0.26, puffy 0.175, quilt 0.16; each into the best
    // spot that still has room for it
    expect(heaviestFirst(p.start)).toEqual({
      lock: 'f-0', tools: 'f-0', bank: 'f-0', // 1.7 L of the frame bag's 2.5
      stove: 'k-0',                            // 1.5 L: not in the frame bag's 0.8 L left, nor the top tube bag's 1 L; the fork cage
      pot: 't-0',                              // 1 L: the top tube bag
      tent: 'b-0', puffy: 'b-0',               // the bar roll's 10 L: the tent and the puffy (the quilt no longer fits there)
      quilt: 's-0',                            // the seat pack; nothing to the back
    });
    // the things it is told to keep stay in their bags, and their litres are counted there first
    expect(heaviestFirst(p.start, ['tent'])).toMatchObject({ tent: 'b-0', lock: 'f-0', tools: 'f-0', bank: 'f-0', puffy: 'b-0', quilt: 's-0' });
    // a tie of the weight: the frame bag before a bottle cage
    const two: Bag[] = [{ key: 'a-0', pos: 'bottle', cap: 1, reach: true }, { key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 's-0', pos: 'seat', cap: 10, reach: false }];
    const q = keeper(two, [{ id: 'lock', kg: 0.9, L: 0.8 }], { lock: 's-0' });
    expect(heaviestFirst(q.start)).toEqual({ lock: 'f-0' });
  });

  test('[HF-ORDER] it finds what the step-by-step search misses: one dense thing for two light ones in a full frame bag', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const items: FItem[] = [{ id: 'cap', kg: 0.5, L: 1 }, { id: 'wash', kg: 0.5, L: 1 }, { id: 'lock', kg: 1.6, L: 2 }];
    const p = keeper(bags, items, { cap: 'f-0', wash: 'f-0', lock: 's-0' });
    expect(balance(p.start, p.trial, { wide: true }).moves).toEqual([]); // no single move or swap helps
    const out = handlingFirst(p.start, p.trial, p.fresh);
    expect(out.apply).toBe(true);
    expect(out.route).toBe('heaviest');
    expect(out.moves).toEqual([{ id: 'cap', from: 'f-0', to: 's-0' }, { id: 'wash', from: 'f-0', to: 's-0' }, { id: 'lock', from: 's-0', to: 'f-0' }]);
    expect(out.gain).toBe(Math.round((handlingScore(p.start.result) - handlingScore(out.packing.result)) * 100) / 100);
    expect(out.gain).toBeCloseTo(0.6 * (WEIGHTS.seat - WEIGHTS.frame), 2);
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(out.partial).toBe(false);
  });

  test('[HF-ORDER] it takes every gain, however small: a move worth 0.04 points, which the automatic balancing leaves', () => {
    const bags: Bag[] = [{ key: 't-0', pos: 'top', cap: 1, reach: true }, { key: 'b-0', pos: 'bar', cap: 10, reach: true }];
    const p = keeper(bags, [{ id: 'cash', kg: 0.04, L: 0.05 }], { cash: 'b-0' });
    expect(autoBalance(p.start, p.trial).apply).toBe(false);
    const out = handlingFirst(p.start, p.trial, p.fresh);
    expect(out).toMatchObject({ apply: true, gain: 0.04, moves: [{ id: 'cash', from: 'b-0', to: 't-0' }] });
  });

  test('[HF-ORDER] a tie of the score goes to the one with more kilos in the frame bag', () => {
    // the search finds the bottle cage first (its name sorts first); the heaviest-first packing the frame bag: the same score
    const bags: Bag[] = [{ key: 'b-0', pos: 'bottle', cap: 1, reach: true }, { key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 's-0', pos: 'seat', cap: 10, reach: false }];
    const p = keeper(bags, [{ id: 'lock', kg: 0.9, L: 0.8 }], { lock: 's-0' });
    expect(unitOf(balance(p.start, p.trial, { wide: true }).packing, 'lock')).toBe('b-0');
    const out = handlingFirst(p.start, p.trial, p.fresh);
    expect(out.route).toBe('heaviest');
    expect(unitOf(out.packing, 'lock')).toBe('f-0');
  });

  test('[HF-ORDER] a move that changes nothing is put back: fewer things to repack for the same score', () => {
    // two fork cages; the heaviest-first packing puts the spork in the first, the plan had it in the second: the same weight
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 'k-0', pos: 'fork', cap: 3, reach: false },
      { key: 'k-1', pos: 'fork', cap: 3, reach: false }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const items: FItem[] = [{ id: 'cap', kg: 0.5, L: 1 }, { id: 'wash', kg: 0.5, L: 1 }, { id: 'lock', kg: 1.6, L: 2 }, { id: 'spork', kg: 0.02, L: 0.05 }];
    const p = keeper(bags, items, { cap: 'f-0', wash: 'f-0', lock: 's-0', spork: 'k-1' });
    expect(heaviestFirst(p.start).spork).toBe('k-0');
    const out = handlingFirst(p.start, p.trial, p.fresh);
    expect(out.route).toBe('heaviest');
    expect(unitOf(out.packing, 'spork')).toBe('k-1');
    expect(out.moves.map((m) => m.id)).not.toContain('spork');
  });

  test('[HF-NEVER-WORSE] never a higher score than the plan as it stands or than the usual search; nothing to gain: nothing applied', () => {
    const POS: Pos[] = ['frame', 'top', 'fork', 'bar', 'seat', 'rack', 'pack'];
    const arb = fc.record({
      bags: fc.uniqueArray(fc.record({ pos: fc.constantFrom(...POS), cap: fc.integer({ min: 1, max: 14 }), reach: fc.boolean() }), { minLength: 2, maxLength: 5, selector: (b) => b.pos }),
      items: fc.array(fc.record({ kg: fc.integer({ min: 1, max: 150 }), L: fc.integer({ min: 1, max: 60 }), reach: fc.boolean(), at: fc.nat() }), { minLength: 1, maxLength: 9 }),
      food: fc.option(fc.record({ kg: fc.integer({ min: 1, max: 30 }), L: fc.integer({ min: 1, max: 30 }) }), { nil: undefined }),
      fixed: fc.array(fc.nat(), { maxLength: 2 }),
    });
    fc.assert(fc.property(arb, (c) => {
      const bags: Bag[] = c.bags.map((b, i) => ({ key: `${i}-0`, pos: b.pos, cap: b.cap, reach: b.reach }));
      const items: FItem[] = c.items.map((x, i) => ({ id: `i${i}`, kg: x.kg / 100, L: x.L / 10, reach: x.reach }));
      if (c.food) items.push({ id: 'food', kg: c.food.kg / 10, L: c.food.L / 10, food: true });
      const plan = Object.fromEntries(c.items.map((x, i) => [`i${i}`, bags[x.at % bags.length]!.key]));
      const p = keeper(bags, items, plan);
      const fixed = [...new Set(c.fixed.map((n) => p.start.pieces[n % Math.max(1, p.start.pieces.length)]?.id).filter((x): x is string => !!x))];
      const out = handlingFirst(p.start, p.trial, p.fresh, { fixed });
      const s = handlingScore(out.packing.result);
      expect(s).toBeLessThanOrEqual(handlingScore(p.start.result));
      expect(s).toBeLessThanOrEqual(handlingScore(balance(p.start, p.trial, { fixed, wide: true }).packing.result));
      expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
      if (!out.apply) { expect(out.packing).toBe(p.start); expect(out.moves).toEqual([]); expect(out.gain).toBe(0); }
      else {
        expect(out.gain).toBeGreaterThanOrEqual(0.01);
        // where it ends, the usual search finds nothing more: a second press does not move things for the search's sake
        expect(balance(out.packing, p.trial, { fixed, wide: true }).moves).toEqual([]);
      }
      for (const id of fixed) expect(unitOf(out.packing, id)).toBe(unitOf(p.start, id));
    }), { numRuns: 300, seed: 20261110 });
  });

  test('[HF-KEEPS] what it is told to keep never moves, every promise is kept, and the same input gives the same answer', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 'b-0', pos: 'bar', cap: 10, reach: true },
      { key: 's-0', pos: 'seat', cap: 14, reach: false }, { key: 'p-0', pos: 'pack', cap: 20, reach: true }];
    const items: FItem[] = [{ id: 'cap', kg: 0.5, L: 1 }, { id: 'wash', kg: 0.5, L: 1 }, { id: 'lock', kg: 1.6, L: 2 },
      { id: 'snacks', kg: 0.3, L: 0.5, reach: true }];
    const p = keeper(bags, items, { cap: 'f-0', wash: 'f-0', lock: 's-0', snacks: 'p-0' });
    // the cap ticked as packed in the frame bag: the lock can no longer go there; the snacks stay within reach
    const out = handlingFirst(p.start, p.trial, p.fresh, { fixed: ['cap'] });
    expect(out.apply).toBe(true);
    expect(unitOf(out.packing, 'cap')).toBe('f-0');
    expect(unitOf(out.packing, 'lock')).not.toBe('f-0');
    expect(out.moves.map((m) => m.id)).not.toContain('cap');
    expect(out.packing.result.outOfReach).toBe(0);
    expect(keepsPromises(p.start.result, out.packing.result)).toBe(true);
    expect(handlingFirst(p.start, p.trial, p.fresh, { fixed: ['cap'] })).toEqual(out);
    // free: the lock into the frame bag, the snacks off the back but within reach, nothing more on the back
    const free = handlingFirst(p.start, p.trial, p.fresh);
    expect(unitOf(free.packing, 'lock')).toBe('f-0');
    expect(unitOf(free.packing, 'snacks')).toBe('b-0');
    expect(keepsPromises(p.start.result, free.packing.result)).toBe(true);
    expect(handlingScore(free.packing.result)).toBeLessThan(handlingScore(out.packing.result));
  });

  test('[HF-KEEPS] a kept thing that is no single piece (food ticked as packed) keeps its bags and litres: a better spread that moves it is not applied, and the answer says it is held', () => {
    // the jacket out of the full frame bag lets the food in (the wider look), but the food is ticked as packed where it is
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: true }];
    const items: FItem[] = [{ id: 'jacket', kg: 0.2, L: 3 }, { id: 'food', kg: 2, L: 3, food: true }];
    const p = keeper(bags, items, { jacket: 'f-0' });
    expect(handlingFirst(p.start, p.trial, p.fresh).apply).toBe(true);
    const out = handlingFirst(p.start, p.trial, p.fresh, { fixed: ['food'] });
    expect(out).toMatchObject({ apply: false, held: true, moves: [], gain: 0 });
    expect(out.packing).toBe(p.start);
    // nothing to gain at all: not held
    const none = keeper(bags, [{ id: 'lock', kg: 0.9, L: 0.8 }], { lock: 'f-0' });
    expect(handlingFirst(none.start, none.trial, none.fresh)).toMatchObject({ apply: false, held: false, route: null });
  });

  test('[HF-NEVER-WORSE] within the trials it is given: each search at most maxTrials, the answer marked partial when one ran out', () => {
    const items: FItem[] = Array.from({ length: 30 }, (_, i) => ({ id: `i${String(i).padStart(2, '0')}`, kg: 0.3 + i / 100, L: 0.2 }));
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 3, reach: true }, { key: 'b-0', pos: 'bar', cap: 12, reach: true }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const p = keeper(bags, items, Object.fromEntries(items.map((it) => [it.id, 's-0'])));
    const cut = handlingFirst(p.start, p.trial, p.fresh, { maxTrials: 3 });
    expect(cut.partial).toBe(true);
    expect(cut.tried).toBeLessThanOrEqual(2 * 3 + 1);
    expect(handlingScore(cut.packing.result)).toBeLessThanOrEqual(handlingScore(p.start.result));
    const whole = handlingFirst(p.start, p.trial, p.fresh);
    expect(whole.partial).toBe(false);
    expect(whole.done).toBe(true);
    expect(handlingScore(whole.packing.result)).toBeLessThanOrEqual(handlingScore(cut.packing.result));
  });

  // [PERF-HF]: the page runs it in slices, each with a few more trials; the trials it ran before are remembered, so each slice adds only
  // new ones, and the page applies nothing until the answer is done.
  test('[HF-NEVER-WORSE] in slices: with a budget of trials it is done only once everything ran within it, nothing applied before, and then the same answer as in one go', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 'k-0', pos: 'fork', cap: 3, reach: false },
      { key: 'k-1', pos: 'fork', cap: 3, reach: false }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const items: FItem[] = [{ id: 'cap', kg: 0.5, L: 1 }, { id: 'wash', kg: 0.5, L: 1 }, { id: 'lock', kg: 1.6, L: 2 }, { id: 'spork', kg: 0.02, L: 0.05 },
      { id: 'tent', kg: 1.3, L: 5 }, { id: 'food', kg: 1.4, L: 2.4, food: true }];
    const p = keeper(bags, items, { cap: 'f-0', wash: 'f-0', lock: 's-0', spork: 'k-1', tent: 's-0' });
    // the caller's memory of trials, as the page's rememberedTrial: by where it starts and its pins
    let ran = 0;
    const seen = new WeakMap<Packing, Map<string, Packing>>(), fresh = new Map<string, Packing>();
    const trial = (pins: Record<string, string>, from: Packing) => {
      let m = seen.get(from); if (!m) seen.set(from, m = new Map());
      const k = JSON.stringify(pins); if (!m.has(k)) { ran++; m.set(k, p.trial(pins, from)); }
      return m.get(k)!;
    };
    const anew = (pins: Record<string, string>) => { const k = JSON.stringify(pins); if (!fresh.has(k)) { ran++; fresh.set(k, p.fresh(pins)); } return fresh.get(k)!; };
    const once = handlingFirst(p.start, p.trial, p.fresh);
    expect(once.done).toBe(true);
    let n = 0, out;
    for (;;) {
      n += 8;
      const before = ran;
      out = handlingFirst(p.start, trial, anew, { budget: n });
      expect(ran - before, 'each slice adds at most its own trials').toBeLessThanOrEqual(8);
      expect(out.tried).toBeLessThanOrEqual(n);
      if (out.done) break;
      expect(out).toMatchObject({ apply: false, moves: [], gain: 0 });
      expect(out.packing).toBe(p.start);
      expect(n).toBeLessThan(1000);
    }
    expect(n, 'more than one slice').toBeGreaterThan(8);
    expect(JSON.stringify(out)).toBe(JSON.stringify(once));
  });

  test('[HF-FULL] the frame bag: full when nothing outside it fits its free litres, "of the heaviest things" only when all in it are at least as dense as the densest thing outside, and the kilos a bigger one would take', () => {
    const bags: Bag[] = [{ key: 'f-0', pos: 'frame', cap: 2, reach: true }, { key: 'k-0', pos: 'fork', cap: 3, reach: false }, { key: 's-0', pos: 'seat', cap: 14, reach: false }];
    const items: FItem[] = [{ id: 'lock', kg: 1.6, L: 1.8 }, { id: 'stove', kg: 0.5, L: 1.5 }, { id: 'pot', kg: 0.3, L: 1 }, { id: 'quilt', kg: 0.8, L: 5 }];
    const p = keeper(bags, items, { lock: 'f-0', stove: 'k-0', pot: 'k-0', quilt: 's-0' });
    const r = frameRoom(p.start)!;
    expect(r.full).toBe(true); // 0.2 L left: none of the others fits
    expect(r.heaviest).toBe(true);
    expect(r.outside.map((x) => x.id)).toEqual(['stove', 'pot', 'quilt']); // densest first
    expect(r.moreKg).toBe(0);
    // 3 L more: the stove (1.5 L) and the pot (1 L) in the 3.2 L, densest first; the quilt not
    expect(frameRoom(p.start, { extraL: 3 })!.moreKg).toBe(0.8);
    // a thing to keep is not counted as one that would move
    expect(frameRoom(p.start, { extraL: 3, fixed: ['stove'] })!.moreKg).toBe(0.3);
    // a light thing kept in the frame bag: full, but not of the heaviest things
    const q = keeper(bags, [{ id: 'cap', kg: 0.1, L: 1.9 }, { id: 'stove', kg: 0.5, L: 1.5 }], { cap: 'f-0', stove: 'k-0' });
    expect(frameRoom(q.start)).toMatchObject({ full: true, heaviest: false });
    // room left for the pot: not full
    const roomy = keeper(bags, [{ id: 'lock', kg: 0.9, L: 0.8 }, { id: 'pot', kg: 0.3, L: 1 }], { lock: 'f-0', pot: 'k-0' });
    expect(frameRoom(roomy.start)!.full).toBe(false);
    // no frame bag: nothing to say
    const none = keeper([{ key: 's-0', pos: 'seat', cap: 14, reach: false }], [{ id: 'pot', kg: 0.3, L: 1 }], { pot: 's-0' });
    expect(frameRoom(none.start)).toBeNull();
  });
});

import { describe, expect, test } from 'vitest';
import { autoBalance, balance, keepsPromises, MAX_BALANCE_TRIALS } from '../../../../src/core/advisor/balance.ts';
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
});

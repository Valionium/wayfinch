import { describe, expect, test } from 'vitest';
import { balance, keepsPromises, MAX_BALANCE_TRIALS } from '../../../../src/core/advisor/balance.ts';
import type { Packing } from '../../../../src/core/advisor/balance.ts';
import { handlingScore } from '../../../../src/core/advisor/rank.ts';
import type { Pos, TrialResult } from '../../../../src/core/advisor/types.ts';

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

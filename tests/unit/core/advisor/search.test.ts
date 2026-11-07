import { describe, expect, test } from 'vitest';
import { candidates } from '../../../../src/core/advisor/candidates.ts';
import { compareFor } from '../../../../src/core/advisor/rank.ts';
import { advise, adviseSteps } from '../../../../src/core/advisor/search.ts';
import { MAX_TRIALS } from '../../../../src/core/advisor/table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Decks, Pos, TrialResult } from '../../../../src/core/advisor/types.ts';
import { bag, input } from './fixtures.ts';

// A stand-in for the bag planner's packing, small and table-driven: items go, in the order given, into the first bag with room, the
// bags taken in the handling order; the back comes last and the rack deck holds 8 L. A must-reach item in a seat pack, on the rack
// or on the back is out of reach. Whatever finds no room is left over. It is not the planner, and not the code under test.
type Item = { id: string; L: number; kg: number; reach?: boolean };
const ORDER: Pos[] = ['frame', 'bottle', 'bottleU', 'top', 'fork', 'rack', 'deck', 'bar', 'seat', 'pack'];
const OUT_OF_REACH = new Set<Pos>(['seat', 'rack', 'deck', 'pack']);

function packer(items: Item[], calls: BagIn[][] = []): (bags: BagIn[], decks: Decks) => TrialResult {
  return (bags, decks) => {
    calls.push(bags);
    const bins = [...bags.map((b) => ({ pos: b.pos as Pos, room: b.L * (b.pair ? 2 : 1) })), ...(decks.rack ? [{ pos: 'deck' as Pos, room: 8 }] : [])]
      .sort((a, b) => ORDER.indexOf(a.pos) - ORDER.indexOf(b.pos));
    const r: TrialResult = { overL: 0, spillIds: [], backL: 0, backKg: 0, outOfReach: 0, kgByPos: {}, items: {} };
    for (const item of items) {
      const bin = bins.find((x) => x.room + 1e-9 >= item.L);
      if (!bin) { r.overL += item.L; r.spillIds.push(item.id); continue; }
      bin.room -= item.L;
      r.kgByPos[bin.pos] = (r.kgByPos[bin.pos] ?? 0) + item.kg;
      r.items[item.id] = [[bin.pos]];
      if (bin.pos === 'pack') { r.backL += item.L; r.backKg += item.kg; }
      if (item.reach && OUT_OF_REACH.has(bin.pos)) r.outOfReach += 1;
    }
    return r;
  };
}

const items = (...litres: number[]): Item[] => litres.map((L, i) => ({ id: `i${i}`, L, kg: 1 }));
const run = (i: AdvisorInput): { answer: AdvisorAnswer; yields: number[] } => {
  const gen = adviseSteps(i);
  const yields: number[] = [];
  for (;;) {
    const step = gen.next();
    if (step.done) return { answer: step.value, yields };
    yields.push(step.value);
  }
};
const addedCount = (base: BagIn[], bags: BagIn[]) => bags.filter((b) => !base.some((x) => x.uid === b.uid)).length;
const removedAny = (base: BagIn[], bags: BagIn[]) => base.some((b) => !bags.some((x) => x.uid === b.uid));

describe('the search order (design §3.1)', () => {
  test('[GA-ORDER] when an add is valid, no add-two is tried; for \'backpack\' no swap is ever tried', () => {
    const base = [bag(1, 'pack', 15), bag(2, 'bar', 5)];
    for (const goal of ['backpack', 'handling'] as const) {
      const calls: BagIn[][] = [];
      const answer = advise(input({ goal, bags: base, nextUid: 3, trial: packer(items(3, 3, 2), calls) }));
      expect(answer.kind, goal).toBe('suggestions');
      expect(calls.some((bags) => addedCount(base, bags) === 2), goal).toBe(false);
      expect(calls.some((bags) => removedAny(base, bags)), goal).toBe(goal === 'handling');
    }
  });

  test('[GA-ORDER] every add first, then for handling every swap, then two adds only when neither gave an answer', () => {
    // Two 14 L items and nothing that holds both: one new bag leaves one over, two new bags take both.
    const base = [bag(1, 'top', 1, { slot: 'front' })];
    const calls: BagIn[][] = [];
    const i = input({ goal: 'handling', style: 'no-rack', bags: base, topSlotsFree: ['rear'], nextUid: 2, trial: packer(items(14, 14), calls) });
    const answer = advise(i);
    const phase = (bags: BagIn[]) => (bags === base ? 'base' : removedAny(base, bags) ? 'swap' : addedCount(base, bags) === 2 ? 'add-two' : 'add');
    const seen = calls.map(phase);
    expect(seen[0]).toBe('base');
    const firstSwap = seen.indexOf('swap');
    const firstTwo = seen.indexOf('add-two');
    expect(seen.slice(1, firstSwap).every((p) => p === 'add')).toBe(true);
    expect(seen.slice(firstSwap, firstTwo).every((p) => p === 'swap')).toBe(true);
    expect(seen.slice(firstTwo).every((p) => p === 'add-two')).toBe(true);
    expect(seen.filter((p) => p === 'add')).toHaveLength(candidates(i, 'add').length);
    expect(seen.filter((p) => p === 'swap')).toHaveLength(candidates(i, 'swap').length);
    expect(answer.kind).toBe('suggestions');
    if (answer.kind === 'suggestions') for (const s of answer.items) expect(s.kind).toBe('add-two');
  });
});

describe('the answer (design §2, §3.3)', () => {
  test('[GA-THREE] at most three suggestions, best first, each a different type or position (the best size of each)', () => {
    const answer = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(3, 3, 2)) }));
    expect(answer.kind).toBe('suggestions');
    if (answer.kind !== 'suggestions') return;
    expect(answer.items).toHaveLength(3);
    expect([...answer.items].sort(compareFor('backpack'))).toEqual(answer.items);
    // Each takes all 8 L off the back at its smallest size: a pair of 4 L fork cages, an 8 L bar roll, an 8 L seat pack (8 L each, a
    // tie, in the order of the search); the 2 x 10 L panniers also do, but come fourth.
    expect(answer.items.map((s) => [s.add[0]!.pos, s.add[0]!.L, s.result.backL])).toEqual([['fork', 4, 0], ['bar', 8, 0], ['seat', 8, 0]]);
    expect(answer.items.map((s) => s.rangeL)).toEqual([[4, 5], [8, 10], [8, 10]]);
    expect(answer.items.every((s) => s.add[0]!.uid === 2)).toBe(true);
    // Better handling: the best of each bag to get, a swap only where it beats the add of the same bag.
    const handling = advise(input({ goal: 'handling', bags: [bag(1, 'seat', 14), bag(2, 'bar', 12)], nextUid: 3, trial: packer([{ id: 'a', L: 4, kg: 3 }, { id: 'b', L: 4, kg: 3 }]) }));
    expect(handling.kind).toBe('suggestions');
    if (handling.kind !== 'suggestions') return;
    expect(handling.items.map((s) => [s.kind, s.add[0]!.pos, s.add[0]!.L, s.score])).toEqual([['add', 'fork', 4, 9], ['add', 'frame', 4.5, 9.6], ['add', 'rack', 10, 10.8]]);
  });

  test('[GA-RANGE] a frame bag shows its own litres; every other size range comes from the valid sizes of its row', () => {
    const answer = advise(input({ goal: 'handling', bags: [bag(1, 'seat', 14)], nextUid: 2, trial: packer([{ id: 'a', L: 2.5, kg: 2 }]) }));
    expect(answer.kind).toBe('suggestions');
    if (answer.kind !== 'suggestions') return;
    const frame = answer.items.find((s) => s.add[0]!.pos === 'frame')!;
    expect(frame.rangeL).toEqual([frame.add[0]!.L, frame.add[0]!.L]);
    expect(frame.add[0]!.L).toBe(3); // every shape takes it; the smallest wins the tie
    expect(answer.items.find((s) => s.add[0]!.pos === 'fork')!.rangeL).toEqual([2, 4]);
  });

  test('[GA-ALREADY] a base with nothing on the back (backpack) or no gain of 0.5 (handling) gives already-good', () => {
    const calls: BagIn[][] = [];
    const empty = advise(input({ goal: 'backpack', bags: [bag(1, 'seat', 10)], nextUid: 2, trial: packer(items(3, 3), calls) }));
    expect(empty).toEqual({ kind: 'already-good', tried: 1, frameReason: null });
    expect(calls).toHaveLength(1);
    // A 0.2 kg item in a seat pack: the best move (into a frame bag) lowers the score by 0.32, under 0.5.
    const light = advise(input({ goal: 'handling', bags: [bag(1, 'seat', 10)], nextUid: 2, trial: packer([{ id: 'a', L: 2, kg: 0.2 }]) }));
    expect(light.kind).toBe('already-good');
    // At 0.4 kg the same move lowers it by 0.64.
    const heavier = advise(input({ goal: 'handling', bags: [bag(1, 'seat', 10)], nextUid: 2, trial: packer([{ id: 'a', L: 2, kg: 0.4 }]) }));
    expect(heavier.kind).toBe('suggestions');
    // Back litres: a gain under 0.5 L is no gain. The only bag the bike takes is a 0.5 L top tube bag; 0.4 L of 3 L moves.
    const tiny = (b: BagIn) => ({ ok: b.pos === 'top' && b.L === 0.5, reason: null });
    const back = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: tiny, trial: packer([{ id: 'a', L: 0.4, kg: 0.1 }, { id: 'b', L: 2.6, kg: 1 }]) }));
    expect(back.kind).toBe('already-good');
    // When everything fits and nothing at all can be added, the bags already suit this as well.
    const none = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: () => ({ ok: false, reason: 'NO_MOUNT' }), trial: packer(items(3)) }));
    expect(none.kind).toBe('already-good');
  });

  test('[GA-NOTHING] when no candidate is valid: nothing-helps with the candidate of least overL as closest', () => {
    // 48 L in four 12 L items, without a rack: one new bag takes one item, two take two; never all four.
    const answer = advise(input({ goal: 'handling', style: 'no-rack', trial: packer(items(12, 12, 12, 12)) }));
    expect(answer.kind).toBe('nothing-helps');
    if (answer.kind !== 'nothing-helps') return;
    const closest = answer.closest!;
    expect(closest.result.overL).toBe(24);
    expect(closest.result.spillIds).toHaveLength(2);
    expect(closest.kind).toBe('add-two');
    // Of those leaving 24 L over, the fewest litres: a 13 L bar roll with a 12 L seat pack.
    expect(closest.add.map((b) => [b.pos, b.L]).sort()).toEqual([['bar', 13], ['seat', 12]]);
    expect(closest.rangeL).toEqual([closest.add[0]!.L, closest.add[0]!.L]);
    // Only full fixes count: a base that overflows is helped by a bag that takes it all, whatever its score.
    const fixed = advise(input({ goal: 'handling', style: 'no-rack', trial: packer(items(12)) }));
    expect(fixed.kind).toBe('suggestions');
    if (fixed.kind === 'suggestions') for (const s of fixed.items) expect(s.result.overL).toBe(0);
    // Nothing that can be added at all: nothing helps, with no closest option.
    expect(advise(input({ usable: () => ({ ok: false, reason: 'NO_MOUNT' }), trial: packer(items(12)) }))).toEqual({ kind: 'nothing-helps', closest: null, tried: 1, frameReason: null });
  });

  test('[GA-FRAME-FIT] frameShapes empty with a reason: no frame candidate, and the answer carries the reason', () => {
    for (const frameReason of ['NO_MOUNT', 'NO_ROOM']) {
      const calls: BagIn[][] = [];
      const answer = advise(input({ goal: 'handling', frameShapes: [], frameReason, bags: [bag(1, 'seat', 14)], nextUid: 2, trial: packer([{ id: 'a', L: 2, kg: 2 }], calls) }));
      expect(answer.frameReason).toBe(frameReason);
      expect(calls.some((bags) => bags.some((b) => b.pos === 'frame'))).toBe(false);
    }
    expect(advise(input({ goal: 'handling', bags: [bag(1, 'seat', 14)], nextUid: 2, trial: packer([{ id: 'a', L: 2, kg: 2 }]) })).frameReason).toBeNull();
  });
});

describe('slices (design §3.4: within a second, or in the background)', () => {
  test('[GA-SLICES] the generator yields every 20 trials and never exceeds MAX_TRIALS', () => {
    const calls: BagIn[][] = [];
    const { answer, yields } = run(input({ goal: 'handling', style: 'no-rack', trial: packer(items(12, 12, 12, 12), calls) }));
    expect(yields.length).toBeGreaterThan(3);
    expect(yields).toEqual(yields.map((_, k) => 20 * (k + 1)));
    expect(answer.tried).toBe(calls.length);
    expect(calls.length - yields.at(-1)!).toBeLessThan(20);
    // A rider with twenty backpacks: over a thousand swaps to try. The search stops at MAX_TRIALS and still answers.
    const packs = Array.from({ length: 20 }, (_, k) => bag(k + 1, 'pack', 15));
    const many = input({ goal: 'handling', bags: packs, nextUid: 21, trial: packer(items(12, 12, 12, 12), []) });
    expect(1 + candidates(many, 'add').length + candidates(many, 'swap').length).toBeGreaterThan(MAX_TRIALS);
    const capped: BagIn[][] = [];
    const out = run({ ...many, trial: packer(items(12, 12, 12, 12), capped) });
    expect(MAX_TRIALS).toBe(1000);
    expect(capped).toHaveLength(MAX_TRIALS);
    expect(out.answer.tried).toBe(MAX_TRIALS);
    expect(out.yields.at(-1)).toBe(MAX_TRIALS);
    expect(['suggestions', 'already-good', 'nothing-helps']).toContain(out.answer.kind);
    // advise runs the same generator to the end.
    expect(advise({ ...many, trial: packer(items(12, 12, 12, 12)) })).toEqual(out.answer);
  });
});

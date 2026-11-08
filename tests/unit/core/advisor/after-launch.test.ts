// The owner's preview check of 8 Nov 2026 (after the launch, part 4b): both goals together (D) and "a bigger change" when nothing else
// helps (F). The search stays pure; the trial function is a stand-in packer, as in search.test.ts. Not the planner, and not the code
// under test.
import { describe, expect, test } from 'vitest';
import { compareFor, handlingScore } from '../../../../src/core/advisor/rank.ts';
import { advise, adviseSteps, bigger, biggerSteps } from '../../../../src/core/advisor/search.ts';
import { MAX_TRIALS, MIN_GAIN_BACK_L, MIN_GAIN_SCORE } from '../../../../src/core/advisor/table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Decks, Pos, Suggestion, TrialResult } from '../../../../src/core/advisor/types.ts';
import { bag, input } from './fixtures.ts';

type Item = { id: string; L: number; kg: number };
const ORDER: Pos[] = ['frame', 'bottle', 'bottleU', 'top', 'fork', 'rack', 'deck', 'bar', 'seat', 'pack'];
function packer(items: Item[], calls: { bags: BagIn[]; decks: Decks }[] = []): (bags: BagIn[], decks: Decks) => TrialResult {
  return (bags, decks) => {
    calls.push({ bags, decks });
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
    }
    return r;
  };
}
const items = (...litres: number[]): Item[] => litres.map((L, i) => ({ id: `i${i}`, L, kg: 1 }));
const onlyAt = (...pos: string[]) => (b: BagIn) => ({ ok: pos.includes(b.pos), reason: null });
const sugg = (a: AdvisorAnswer): Suggestion[] => (a.kind === 'suggestions' ? a.items : []);
/** The answer as a rider reads it: the kind and each suggestion's bags, aside how many trials it took. */
const shape = (a: AdvisorAnswer) => ({ kind: a.kind, items: sugg(a).map((s) => [s.kind, s.add.map((b) => [b.pos, b.L, !!b.pair]), s.remove]),
  ahead: a.kind === 'suggestions' && a.ahead ? a.ahead.add.map((b) => [b.pos, b.L]) : null });
const steps = (i: AdvisorInput): { answer: AdvisorAnswer; yields: number[] } => {
  const gen = adviseSteps(i);
  const yields: number[] = [];
  for (;;) {
    const step = gen.next();
    if (step.done) return { answer: step.value, yields };
    yields.push(step.value);
  }
};

describe('D: both goals together (owner, 8 Nov)', () => {
  test('[GA-GOAL-BOTH] the order for both: fewer litres on the back first, then the better handling score, then the ties', () => {
    const s = (backL: number, kgByPos: TrialResult['kgByPos']): Suggestion => {
      const result: TrialResult = { overL: 0, spillIds: [], backL, backKg: backL / 2, outOfReach: 0, kgByPos, items: {} };
      return { kind: 'add', add: [bag(9, 'seat', 8)], remove: null, decks: { rack: false, bar: false }, newBags: 1, litres: 8, deck: false, tags: [],
        result, score: handlingScore(result), rangeL: [8, 8] };
    };
    const both = compareFor('both');
    // the same litres on the back: the lower score first (Get the backpack off alone would call these equal on its goal)
    expect(both(s(0, { frame: 2 }), s(0, { seat: 2 }))).toBeLessThan(0);
    expect(compareFor('backpack')(s(0, { frame: 2 }), s(0, { seat: 2 }))).toBe(0);
    // fewer litres on the back wins over a better score
    expect(both(s(1, { frame: 2 }), s(0, { seat: 2 }))).toBeGreaterThan(0);
  });

  test('[GA-GOAL-BOTH] with nothing on the back, both is Better handling: the same answer', () => {
    const plan = { bags: [bag(1, 'seat', 14), bag(2, 'bar', 12)], nextUid: 3, trial: packer([{ id: 'a', L: 4, kg: 3 }, { id: 'b', L: 4, kg: 3 }]) };
    const handling = advise(input({ ...plan, goal: 'handling' }));
    const both = advise(input({ ...plan, goal: 'both' }));
    expect(handling.kind).toBe('suggestions');
    expect(shape(both)).toEqual(shape(handling));
  });

  test('[GA-GOAL-BOTH] with litres on the back that a bag takes off: the bags that take them off, as Get the backpack off finds them, never a swap', () => {
    const calls: { bags: BagIn[]; decks: Decks }[] = [];
    const plan = { bags: [bag(1, 'pack', 15), bag(2, 'seat', 6)], nextUid: 3, style: 'bags' as const };
    const backpack = advise(input({ ...plan, goal: 'backpack', trial: packer(items(5, 3, 2)) }));
    const both = advise(input({ ...plan, goal: 'both', trial: packer(items(5, 3, 2), calls) }));
    expect(both.kind).toBe('suggestions');
    for (const s of sugg(both)) expect(s.result.backL).toBeLessThan(5 - MIN_GAIN_BACK_L + 1e-9);
    expect(sugg(both).map((s) => s.add[0]!.pos).sort()).toEqual(sugg(backpack).map((s) => s.add[0]!.pos).sort());
    expect(calls.some((t) => !t.bags.some((b) => b.uid === 2) || !t.bags.some((b) => b.uid === 1))).toBe(false);
  });

  test('[GA-GOAL-BOTH] litres stay on the back and nothing takes them off: the suggestions for handling, saying how much stays on the back', () => {
    // a 9 L item no bag here holds (seat packs and bar rolls only, the bar roll taken), and a 4 kg one in the seat pack a frame bag holds
    const trial = packer([{ id: 'big', L: 20, kg: 2 }, { id: 'heavy', L: 4, kg: 4 }]);
    const plan = { style: 'bags' as const, bags: [bag(1, 'pack', 20), bag(2, 'seat', 6), bag(3, 'bar', 5)], nextUid: 4, trial, usable: onlyAt('frame', 'seat', 'bar') };
    const backpack = advise(input({ ...plan, goal: 'backpack' }));
    expect(backpack.kind).toBe('cannot-reduce');
    const both = advise(input({ ...plan, goal: 'both' }));
    expect(both.kind).toBe('suggestions');
    if (both.kind !== 'suggestions') return;
    expect(both.backStays).toBe(20);
    expect(sugg(both)[0]!.score).toBeLessThanOrEqual(handlingScore(trial(plan.bags, { rack: false, bar: false })) - MIN_GAIN_SCORE);
    // Get the backpack off and Better handling alone carry no such line
    expect(advise(input({ ...plan, goal: 'handling' })).kind === 'suggestions' && 'backStays' in advise(input({ ...plan, goal: 'handling' }))).toBe(false);
  });

  test('[GA-GOAL-BOTH] litres stay on the back and handling has nothing either: it cannot reduce, never already good', () => {
    const plan = { style: 'bags' as const, bags: [bag(1, 'pack', 20), bag(2, 'frame', 6, { shape: 0 })], nextUid: 3,
      trial: packer([{ id: 'big', L: 20, kg: 2 }, { id: 'a', L: 4, kg: 4 }]), usable: onlyAt('frame') };
    const both = advise(input({ ...plan, goal: 'both' }));
    expect(both.kind).toBe('cannot-reduce');
  });

  test('[GA-GOAL-BOTH] [GA-SLICES] both runs in slices and counts on: the trials yielded only rise, and never pass MAX_TRIALS', () => {
    const trial = packer([{ id: 'big', L: 20, kg: 2 }, { id: 'heavy', L: 4, kg: 4 }]);
    const { answer, yields } = steps(input({ style: 'bags', goal: 'both', bags: [bag(1, 'pack', 20), bag(2, 'seat', 6), bag(3, 'bar', 5)], nextUid: 4, trial, usable: onlyAt('frame', 'seat', 'bar') }));
    expect(yields.length).toBeGreaterThan(0);
    for (let k = 1; k < yields.length; k++) expect(yields[k]!).toBeGreaterThan(yields[k - 1]!);
    expect(answer.tried).toBeGreaterThanOrEqual(yields[yields.length - 1]!);
    expect(answer.tried).toBeLessThanOrEqual(MAX_TRIALS);
  });
});

describe('F: a bigger change, when nothing else helps (owner, 8 Nov)', () => {
  // the back holds a 5 L and a 20 L item; the bike takes seat packs, bar rolls and a rack: no bag takes the 20 L item, panniers do
  const backpackPlan = (style: AdvisorInput['style'], over: Partial<AdvisorInput> = {}) => input({ style, goal: 'backpack', bags: [bag(1, 'pack', 25)], nextUid: 2,
    frameShapes: [], topSlotsFree: [], usable: onlyAt('seat', 'bar', 'rack'), trial: packer(items(5, 20)), ...over });

  test('[GA-BIGGER] Bikepacking bags only, Minimal and no Looking ahead: a bigger change with panniers, better on the goal than Minimal\'s first', () => {
    const i = backpackPlan('bags');
    const answer = advise(i);
    expect(answer.kind).toBe('suggestions');
    if (answer.kind !== 'suggestions') return;
    expect(answer.ahead).toBeNull();
    const big = bigger(i, answer);
    expect(big).not.toBeNull();
    expect(big!.add.some((b) => b.pos === 'rack')).toBe(true);
    expect(big!.result.backL).toBeLessThanOrEqual(answer.items[0]!.result.backL - MIN_GAIN_BACK_L);
    expect(big!.result.overL).toBe(0);
    // a rack to fit, with rack mounts Not sure: tagged as the search tags it
    expect(bigger({ ...i, rackMounts: 'unknown' }, advise({ ...i, rackMounts: 'unknown' }))!.tags).toContain('if your bike has rack mounts');
  });

  test('[GA-BIGGER] nothing helps within the setup: the bigger change fits everything', () => {
    const i = input({ style: 'bags', goal: 'handling', bags: [bag(1, 'pack', 15)], nextUid: 2, frameShapes: [], topSlotsFree: [], usable: onlyAt('seat', 'bar', 'rack'), trial: packer(items(20, 20)) });
    const answer = advise(i);
    expect(answer.kind).toBe('nothing-helps');
    const big = bigger(i, answer);
    expect(big).not.toBeNull();
    expect(big!.result.overL).toBe(0);
    expect(big!.result.spillIds).toEqual([]);
    expect(big!.add.some((b) => b.pos === 'rack')).toBe(true);
  });

  test('[GA-BIGGER] cannot reduce within the setup: a bigger change that takes the litres off', () => {
    const i = backpackPlan('bags', { bags: [bag(1, 'pack', 25), bag(2, 'seat', 6)], nextUid: 3 });
    const answer = advise(i);
    expect(answer.kind).toBe('cannot-reduce');
    const big = bigger(i, answer);
    expect(big).not.toBeNull();
    expect(big!.result.backL).toBeLessThanOrEqual(20 - MIN_GAIN_BACK_L);
  });

  test('[GA-BIGGER] none: under Panniers are fine, with Looking ahead, already good, with the rider\'s own panniers, with rack mounts no and no rack, or a search cut short', () => {
    const i = backpackPlan('bags');
    expect(bigger(backpackPlan('panniers'), advise(backpackPlan('panniers')))).toBeNull();
    expect(bigger({ ...i, rackMounts: 'no' }, advise({ ...i, rackMounts: 'no' }))).toBeNull();
    const own = backpackPlan('bags', { bags: [bag(1, 'pack', 25), bag(2, 'rack', 10)], nextUid: 3 });
    expect(bigger(own, advise(own))).toBeNull();
    const good = input({ style: 'bags', goal: 'backpack', bags: [bag(1, 'seat', 10)], nextUid: 2, trial: packer(items(3)) });
    expect(advise(good).kind).toBe('already-good');
    expect(bigger(good, advise(good))).toBeNull();
    // Looking ahead found something: nothing bigger
    // (two 10 L items: one bag takes one off, Looking ahead's second bag the other)
    const withAhead = input({ style: 'bags', goal: 'backpack', bags: [bag(1, 'pack', 30)], nextUid: 2, frameShapes: [], topSlotsFree: [],
      usable: onlyAt('seat', 'bar'), trial: packer(items(10, 10)) });
    const a = advise(withAhead);
    expect(a.kind === 'suggestions' && a.ahead !== null).toBe(true);
    expect(bigger(withAhead, a)).toBeNull();
    const partial = advise(i);
    expect(bigger(i, { ...partial, partial: true })).toBeNull();
  });

  test('[GA-BIGGER] it holds only what the setup left out: panniers, or under Bikepacking bags only a rack to fit for its deck; Bags first gets panniers', () => {
    for (const style of ['bags', 'bags-first'] as const) {
      const i = backpackPlan(style);
      const big = bigger(i, advise(i));
      if (big === null) continue;
      expect(big.add.some((b) => b.pos === 'rack') || (style === 'bags' && big.deck), style).toBe(true);
    }
    // a camping trip under Bikepacking bags only: the rack to fit for its deck is a bigger change too
    const camp = input({ style: 'bags', goal: 'backpack', camping: true, bags: [bag(1, 'pack', 8)], nextUid: 2, frameShapes: [], topSlotsFree: [],
      usable: onlyAt('rack'), trial: packer(items(6)) });
    const answer = advise(camp);
    expect(answer.kind).toBe('cannot-reduce');
    const big = bigger(camp, answer);
    expect(big).not.toBeNull();
    expect(big!.deck || big!.add.some((b) => b.pos === 'rack')).toBe(true);
  });

  test('[GA-BIGGER] [GA-SLICES] the bigger change runs in slices, counting on from the answer\'s trials, and never passes MAX_TRIALS', () => {
    const i = backpackPlan('bags');
    const answer = advise(i);
    const gen = biggerSteps(i, answer);
    const yields: number[] = [];
    let done: Suggestion | null | undefined;
    for (;;) { const s = gen.next(); if (s.done) { done = s.value; break; } yields.push(s.value); }
    expect(done).not.toBeNull();
    expect(yields.length).toBeGreaterThan(0);
    expect(yields[0]!).toBeGreaterThan(answer.tried);
    for (const n of yields) expect(n).toBeLessThanOrEqual(MAX_TRIALS);
  });
});

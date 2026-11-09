// Both goals at once (the owner's preview check of 8 Nov, D): Better handling and Get the backpack off chosen together, ranked by one
// combined score. The stand-in packer is the one of search.test.ts in small: items go, in order, into the first bag with room, the bags
// taken in the handling order, the back last. It is not the planner, and not the code under test.
import { describe, expect, test } from 'vitest';
import { candidates } from '../../../../src/core/advisor/candidates.ts';
import { bothScore, compareFor, handlingScore } from '../../../../src/core/advisor/rank.ts';
import { advise, biggerOffered, biggerSteps } from '../../../../src/core/advisor/search.ts';
import type { AdvisorInput, BagIn, Decks, Pos, Suggestion, TrialResult } from '../../../../src/core/advisor/types.ts';
import { bag, input } from './fixtures.ts';

type Item = { id: string; L: number; kg: number };
const ORDER: Pos[] = ['frame', 'bottle', 'bottleU', 'top', 'fork', 'rack', 'deck', 'bar', 'seat', 'pack'];
function packer(items: Item[]): (bags: BagIn[], decks: Decks) => TrialResult {
  return (bags, decks) => {
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
const result = (kgByPos: TrialResult['kgByPos'], backL: number): TrialResult =>
  ({ overL: 0, spillIds: [], backL, backKg: kgByPos.pack ?? 0, outOfReach: 0, kgByPos, items: {} });
const sugg = (id: number, r: TrialResult): Suggestion => ({ kind: 'add', add: [bag(id, 'frame', 3)], remove: null, decks: { rack: false, bar: false },
  newBags: 1, litres: 3, deck: false, tags: [], result: r, score: handlingScore(r), rangeL: [3, 3] });
const shape = (a: ReturnType<typeof advise>) => a.kind === 'suggestions'
  ? { kind: a.kind, items: a.items.map((s) => [s.kind, s.add.map((b) => [b.pos, b.L, !!b.pair]), s.remove]), ahead: a.ahead && [a.ahead.kind, a.ahead.add.map((b) => [b.pos, b.L])] }
  : { kind: a.kind };

describe('both goals at once (the owner, 8 Nov: D)', () => {
  test('[GA-BOTH] the combined score: the handling score and the litres on the back, each as a share of the plan\'s own, added with equal weight; an empty back counts nothing', () => {
    const base = result({ seat: 2, pack: 2 }, 4);           // handling 2 × 2.6 + 2 × 3.5 = 12.2; 4 L on the back
    expect(handlingScore(base)).toBe(12.2);
    expect(bothScore(base, base)).toBe(2);
    const a = result({ frame: 2, pack: 2 }, 4);             // 9 of 12.2, the back as it was: 0.7377 + 1
    const b = result({ seat: 4 }, 0);                       // 10.4 of 12.2, nothing on the back: 0.8525
    expect(bothScore(base, a)).toBe(1.7377);
    expect(bothScore(base, b)).toBe(0.8525);
    // nothing on the back in the plan: only the handling share counts, so both read as Better handling
    const empty = result({ seat: 2 }, 0);
    expect(bothScore(empty, result({ frame: 2 }, 0))).toBe(0.3846);
  });

  test('[GA-BOTH] the order: Better handling puts the frame bag first, Get the backpack off the bag that empties the back, both the one that does more of both together', () => {
    const base = result({ seat: 2, pack: 2 }, 4);
    const a = sugg(1, result({ frame: 2, pack: 2 }, 4));     // best handling of the two that leave the back full
    const b = sugg(2, result({ seat: 4 }, 0));               // the back empty, the handling a little better
    const c = sugg(3, result({ frame: 1, seat: 2, pack: 1 }, 2));
    const e = sugg(4, result({ frame: 3, pack: 1 }, 1));    // much better handling, a litre left on the back
    const order = (goal: AdvisorInput['goal']) => [a, b, c, e].sort(compareFor(goal, base)).map((s) => s.add[0]!.uid);
    expect(order('handling')).toEqual([4, 1, 3, 2]);        // 6.5, 9, 9.7, 10.4
    expect(order('backpack')).toEqual([2, 4, 3, 1]);        // 0 L, 1 L, 2 L, 4 L
    expect(order('both')).toEqual([4, 2, 3, 1]);            // 0.7828, 0.8525, 1.2951, 1.7377
  });

  test('[GA-BOTH] both goals try swaps, as Better handling does; Get the backpack off alone never does', () => {
    const i = { bags: [bag(1, 'seat', 10)], nextUid: 2 };
    expect(candidates(input({ ...i, goal: 'both' }), 'swap').length).toBeGreaterThan(0);
    expect(candidates(input({ ...i, goal: 'both' }), 'swap')).toEqual(candidates(input({ ...i, goal: 'handling' }), 'swap'));
    expect(candidates(input({ ...i, goal: 'backpack' }), 'swap')).toEqual([]);
  });

  test('[GA-BOTH] nothing on the back: both give the answer Better handling gives', () => {
    for (const kg of [0.2, 0.4, 2]) {
      const over = { bags: [bag(1, 'seat', 10), bag(2, 'bar', 8)], nextUid: 3, style: 'bags' as const, trial: packer([{ id: 'a', L: 2, kg }, { id: 'b', L: 3, kg: 1 }]) };
      expect(shape(advise(input({ ...over, goal: 'both' }))), `${kg} kg`).toEqual(shape(advise(input({ ...over, goal: 'handling' }))));
    }
  });

  test('[GA-BOTH] a suggestion counts when it gains on either goal: the handling better while the back keeps its litres is a suggestion, not "cannot reduce"', () => {
    // a 4 L item on the back no bag here can take (only a 3 L frame bag and a 0.5 L top tube bag fit this bike); a heavy item in the seat pack a frame bag can take
    const usable = (b: BagIn) => ({ ok: (b.pos === 'frame' && b.L === 3) || (b.pos === 'top' && b.L === 0.5), reason: null });
    const over = { bags: [bag(1, 'seat', 3), bag(2, 'pack', 15)], nextUid: 3, style: 'bags' as const, usable,
      trial: packer([{ id: 'heavy', L: 3, kg: 3 }, { id: 'back', L: 4, kg: 0.5 }]) };
    expect(advise(input({ ...over, goal: 'backpack' })).kind).toBe('cannot-reduce');
    const both = advise(input({ ...over, goal: 'both' }));
    expect(both.kind).toBe('suggestions');
    if (both.kind === 'suggestions') expect(both.items[0]!.add[0]!.pos).toBe('frame');
  });

  test('[GA-BOTH] litres on the back and nothing gains on either goal: cannot reduce, with the litres left there, never already good', () => {
    const over = { bags: [bag(1, 'pack', 15)], nextUid: 2, style: 'bags' as const, usable: () => ({ ok: false, reason: 'NO_MOUNT' }), trial: packer([{ id: 'a', L: 3, kg: 1 }]) };
    expect(advise(input({ ...over, goal: 'both' }))).toEqual({ kind: 'cannot-reduce', backL: 3, tried: 1, frameReason: null, partial: false });
    // nothing on the back and nothing better: already good
    expect(advise(input({ ...over, bags: [bag(1, 'seat', 15)], goal: 'both' })).kind).toBe('already-good');
  });
});

describe('a bigger change (the owner, 8 Nov: F)', () => {
  // a 6 L item on the back that only a pannier can take; the bike takes a 3 L frame bag (Minimal) and panniers
  const usable = (b: BagIn) => ({ ok: (b.pos === 'frame' && b.L === 3) || b.pos === 'rack', reason: null });
  const plan = { bags: [bag(1, 'pack', 20)], nextUid: 2, usable, rackMounts: 'yes' as const, goal: 'backpack' as const,
    trial: packer([{ id: 'small', L: 3, kg: 1 }, { id: 'big', L: 6, kg: 2 }]) };

  test('[GA-BIGGER] offered only where the setup ruled something out the bike can take: under Bikepacking bags only and Bags first, never under Panniers are fine, nor with no rack and rack mounts no', () => {
    expect(biggerOffered(input({ ...plan, style: 'bags' }))).toBe(true);
    expect(biggerOffered(input({ ...plan, style: 'bags-first' }))).toBe(true);
    expect(biggerOffered(input({ ...plan, style: 'panniers' }))).toBe(false);
    expect(biggerOffered(input({ ...plan, style: 'bags', rackMounts: 'no' }))).toBe(false);
    // a rack the rider has stays a fact: with rack mounts no, its panniers are still a bigger change
    expect(biggerOffered(input({ ...plan, style: 'bags', rackMounts: 'no', decks: { rack: true, bar: false }, camping: true }))).toBe(true);
  });

  test('[GA-BIGGER] under Bikepacking bags only, Looking ahead finds nothing; the bigger change is what the setup ruled out, panniers, and it does better than Minimal', () => {
    const i = input({ ...plan, style: 'bags' });
    const answer = advise(i);
    expect(answer.kind).toBe('suggestions');
    if (answer.kind !== 'suggestions') return;
    expect(answer.items[0]!.add.map((b) => b.pos)).toEqual(['frame']);
    expect(answer.ahead).toBeNull();
    const out = runBigger(i, answer);
    expect(out.overrides).toBe('bags');
    expect(out.bigger).not.toBeNull();
    expect(out.bigger!.add.some((b) => b.pos === 'rack')).toBe(true);
    expect(out.bigger!.result.backL).toBeLessThan(answer.items[0]!.result.backL - 0.5);
    expect(out.bigger!.result.overL).toBe(0);
  });

  test('[GA-BIGGER] nothing the setup ruled out helps more: no bigger change; nor does a bigger change ever hold only what the setup allowed', () => {
    const none = input({ ...plan, style: 'bags', usable: (b: BagIn) => ({ ok: (b.pos === 'frame' && b.L === 3) || (b.pos === 'rack' && b.L <= 2), reason: null }) });
    const answer = advise(none);
    if (answer.kind !== 'suggestions') throw new Error(answer.kind);
    expect(runBigger(none, answer).bigger).toBeNull();
    const i = input({ ...plan, style: 'bags-first' });
    const a = advise(i);
    if (a.kind !== 'suggestions') throw new Error(a.kind);
    const out = runBigger(i, a);
    if (out.bigger) expect(out.bigger.add.some((b) => b.pos === 'rack')).toBe(true);
  });
});

function runBigger(i: AdvisorInput, answer: Extract<ReturnType<typeof advise>, { kind: 'suggestions' }>) {
  const gen = biggerSteps(i, answer);
  for (;;) { const step = gen.next(); if (step.done) return step.value; }
}

describe('a bigger change where nothing helps, and only where it could do more (the owner, 8 Nov: F)', () => {
  const usable = (b: BagIn) => ({ ok: (b.pos === 'frame' && b.L === 3) || b.pos === 'rack', reason: null });
  test('[GA-BIGGER] nothing helps within Bikepacking bags only: the bigger change is panniers, and everything fits with them', () => {
    const i = input({ bags: [bag(1, 'pack', 4)], nextUid: 2, usable, style: 'bags', goal: 'handling', trial: packer([{ id: 'a', L: 3, kg: 1 }, { id: 'b', L: 9, kg: 3 }]) });
    const answer = advise(i);
    expect(answer.kind).toBe('nothing-helps');
    expect(biggerOffered(i, answer)).toBe(true);
    const gen = biggerSteps(i, answer);
    let out; for (;;) { const step = gen.next(); if (step.done) { out = step.value; break; } }
    expect(out.bigger?.add.some((b) => b.pos === 'rack')).toBe(true);
    expect(out.bigger?.result.overL).toBe(0);
  });

  test('[GA-BIGGER] not offered where nothing could do more: Get the backpack off with Minimal\'s first emptying the back, or Looking ahead found a set', () => {
    const empties = input({ bags: [bag(1, 'pack', 20)], nextUid: 2, usable, style: 'bags', goal: 'backpack', trial: packer([{ id: 'a', L: 3, kg: 1 }]) });
    const a = advise(empties);
    if (a.kind !== 'suggestions') throw new Error(a.kind);
    expect(a.items[0]!.result.backL).toBe(0);
    expect(biggerOffered(empties)).toBe(true);
    expect(biggerOffered(empties, a)).toBe(false);
    expect(biggerOffered(empties, { ...a, ahead: a.items[0]! })).toBe(false);
  });
});

describe('review of PR 81', () => {
  test('[GA-BOTH] M1: under both goals no suggestion counts whose combined score is worse than the plan\'s, though it takes 0.6 L off the back', () => {
    // the plan: a 3 L frame bag and a 20 L backpack holding 12 L; the one candidate, a 10 L seat pack, takes 0.6 L off the back but moves
    // the frame bag's kit into the seat pack: handling 12.5 to 14.28 (+14 %), back 12 to 11.4 L (-5 %), combined 2.09 against 2
    const base: TrialResult = { overL: 0, spillIds: [], backL: 12, backKg: 3, outOfReach: 0, kgByPos: { frame: 2, pack: 3 }, items: {} };
    const worse: TrialResult = { overL: 0, spillIds: [], backL: 11.4, backKg: 2.8, outOfReach: 0, kgByPos: { frame: 0.78, seat: 1.42, pack: 2.8 }, items: {} };
    expect(bothScore(base, worse)).toBeGreaterThan(2);
    const i = input({ bags: [bag(1, 'frame', 3, { shape: 2 }), bag(2, 'pack', 20)], nextUid: 3, style: 'bags', goal: 'both',
      usable: (b: BagIn) => ({ ok: b.pos === 'seat' && b.L === 10, reason: null }),
      trial: (bags) => (bags.some((b) => b.pos === 'seat') ? worse : base) });
    const a = advise(i);
    expect(a.kind).toBe('cannot-reduce');
    // Get the backpack off alone still takes it: 0.6 L off the back is its goal
    expect(advise({ ...i, goal: 'backpack' }).kind).toBe('suggestions');
  });

  test('[GA-BIGGER] M3: under Bags first, when nothing helps the search has already tried every pannier, so no bigger change is offered', () => {
    const usable = (b: BagIn) => ({ ok: (b.pos === 'frame' && b.L === 3) || b.pos === 'rack', reason: null });
    // a 60 L item nothing on this bike can take (a pair of the largest panniers holds 50 L)
    const i = input({ bags: [bag(1, 'pack', 4)], nextUid: 2, usable, style: 'bags-first', goal: 'handling', trial: packer([{ id: 'huge', L: 60, kg: 5 }]) });
    const a = advise(i);
    expect(a.kind).toBe('nothing-helps');
    expect(biggerOffered(i, a)).toBe(false);
    // under Bikepacking bags only the panniers were never tried: offered
    const b = { ...i, style: 'bags' as const };
    expect(biggerOffered(b, advise(b))).toBe(true);
  });
});

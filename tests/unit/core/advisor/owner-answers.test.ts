// The owner's answers of 7 Nov (sub-project 13 plan, "Owner's answers, 7 Nov (morning)"): singles and pairs, and two kinds of
// answer, Minimal and Looking ahead; and the owner's ruling on the rack (7 Nov): the setup step, a rack fitted, the rack mounts.
import { describe, expect, test } from 'vitest';
import { candidates, extensions } from '../../../../src/core/advisor/candidates.ts';
import { advise, adviseSteps } from '../../../../src/core/advisor/search.ts';
import { DECIDED, MIN_GAIN_BACK_L, MIN_GAIN_SCORE } from '../../../../src/core/advisor/table.ts';
import type { AdvisorAnswer, AdvisorInput, BagIn, Decks, Pos, Suggestion, TrialResult } from '../../../../src/core/advisor/types.ts';
import { GA } from '../../../../src/core/wording/en-advisor.ts';
import { bag, input, TABLE_SIZES } from './fixtures.ts';

// A stand-in for the bag planner's packing, as in search.test.ts: items in the order given go into the first bag with room, the bags
// taken in the handling order; the back comes last and the rack deck holds 8 L. Not the planner, and not the code under test.
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
const suggestions = (a: AdvisorAnswer): Suggestion[] => (a.kind === 'suggestions' ? a.items : []);
const ahead = (a: AdvisorAnswer): Suggestion | null | undefined => (a.kind === 'suggestions' ? a.ahead : undefined);
const onlyAt = (...pos: string[]) => (b: BagIn) => ({ ok: pos.includes(b.pos), reason: null });

describe('singles and pairs (owner, 7 Nov: a single pannier or fork-cage bag is possible; a pair is two bags)', () => {
  test('[GA-CANDIDATES] fork cages and panniers come as a single (one bag) and as a pair (two bags), each at every size of its row; a pair counts as two new bags', () => {
    expect(DECIDED.pairIsOneBag).toBe(false);
    const adds = candidates(input(), 'add');
    for (const pos of ['fork', 'rack'] as const) {
      const singles = adds.filter((c) => c.add[0]?.pos === pos && !c.add[0].pair);
      const pairs = adds.filter((c) => c.add[0]?.pos === pos && c.add[0].pair === true);
      expect(singles.map((c) => c.add[0]!.L), pos + ' singles').toEqual(TABLE_SIZES[pos]);
      expect(pairs.map((c) => c.add[0]!.L), pos + ' pairs').toEqual(TABLE_SIZES[pos]);
      // panniers on a bike with no rack fitted bring a rack to fit: one more new thing (the owner's ruling on the rack, 7 Nov)
      const rack = pos === 'rack' ? 1 : 0;
      for (const c of singles) { expect(c.newBags).toBe(1 + rack); expect(c.litres).toBe(c.add[0]!.L); }
      for (const c of pairs) { expect(c.newBags).toBe(2 + rack); expect(c.litres).toBe(2 * c.add[0]!.L); }
    }
    // Every fork cage, one or two, needs cage mounts on the fork (decision 4).
    for (const c of adds.filter((x) => x.add[0]?.pos === 'fork')) expect(c.tags).toContain(GA.advisorTagForkMounts);
  });

  test('[GA-THREE] a single and a pair are separate suggestions: 4 L to take off the back is one fork-cage bag; an 8 L item needs the pair', () => {
    const one = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: onlyAt('fork'), trial: packer(items(4)) }));
    expect(suggestions(one).map((s) => [s.add[0]!.pos, !!s.add[0]!.pair, s.add[0]!.L, s.newBags])).toEqual([['fork', false, 4, 1]]);
    const two = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: onlyAt('fork'), trial: packer(items(8)) }));
    expect(suggestions(two).map((s) => [s.add[0]!.pos, !!s.add[0]!.pair, s.add[0]!.L, s.newBags])).toEqual([['fork', true, 4, 2]]);
  });
});

describe('two kinds of answer: Minimal and Looking ahead (owner, 7 Nov)', () => {
  test('[GA-MINIMAL] the owner\'s order is in DECIDED: the rack deck (use what you have, or a rack), then top tube and frame bag, then seat pack, then handlebar bag, then fork cages, panniers last', () => {
    expect(DECIDED.addOrder).toEqual({ deck: 0, top: 1, frame: 1, seat: 2, bar: 3, fork: 4, rack: 5 });
  });

  test('[GA-MINIMAL] Minimal holds only the fewest new bags that count, in the owner\'s order, then the goal', () => {
    // 3 L on the back: a frame bag, a seat pack, a bar roll, one fork-cage bag or one pannier each take it all; a pair too, as two bags.
    const answer = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(3)) }));
    expect(answer.kind).toBe('suggestions');
    expect(suggestions(answer).map((s) => [s.add[0]!.pos, s.newBags])).toEqual([['frame', 1], ['seat', 1], ['bar', 1]]);
    // Better handling: the order before the score. A seat pack beats a fork-cage bag here only by the owner's order.
    const handling = advise(input({ goal: 'handling', style: 'bags', frameShapes: [], topSlotsFree: [], bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer([{ id: 'a', L: 3, kg: 2 }]) }));
    expect(suggestions(handling).map((s) => s.add[0]!.pos)).toEqual(['seat', 'bar', 'fork']);
    for (const s of suggestions(handling)) expect(s.newBags).toBe(1);
  });

  test('[GA-MINIMAL] Get the backpack off: when a bag takes everything off the back, Minimal is the fewest of those, though by the owner order a bag that leaves some would come first (DECIDED.backpackWholeFirst)', () => {
    // 8 L on the back: the 6 L frame bag takes 6 L and the 2 L top tube bag 2 L, each leaving some; an 8 L seat pack or bar roll takes all.
    const answer = advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(3, 3, 2)) }));
    expect(DECIDED.backpackWholeFirst).toBe(true);
    expect(suggestions(answer).map((s) => [s.add[0]!.pos, s.add[0]!.L, s.result.backL])).toEqual([['seat', 8, 0], ['bar', 8, 0]]);
    expect(ahead(answer)).toBeNull();
  });

  test('[GA-AHEAD] Looking ahead is Minimal\'s first plus one more bag, valid, and better on the goal by decision 6: a seat pack that leaves litres on the back, then a bar roll that takes the rest', () => {
    // 22 L for a 15 L backpack: it overflows. A 16 L seat pack fixes that but 6 L stay on the back; with a 6 L bar roll none do.
    const answer = advise(input({ goal: 'backpack', style: 'bags', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: onlyAt('seat', 'bar'), trial: packer(items(8, 8, 6)) }));
    expect(answer.kind).toBe('suggestions');
    if (answer.kind !== 'suggestions') return;
    expect(answer.items.map((s) => [s.add[0]!.pos, s.add[0]!.L, s.result.backL])).toEqual([['seat', 16, 6], ['bar', 14, 8]]);
    const a = answer.ahead!;
    expect(a.kind).toBe('ahead');
    expect(a.remove).toBeNull();
    // the same two bags, sized so the larger is as small as it can be (review of PR 61, m2): not 16 + 6 but 14 + 8
    expect(a.add.map((b) => [b.pos, b.L])).toEqual([['seat', 14], ['bar', 8]]);
    expect(a.add[0]!.pos).toBe(answer.items[0]!.add[0]!.pos);
    expect(a.result.backL).toBe(0);
    expect(a.newBags).toBe(2);
    expect(answer.items[0]!.result.backL - a.result.backL).toBeGreaterThanOrEqual(MIN_GAIN_BACK_L);
  });

  test('[GA-AHEAD] no Looking ahead when nothing beats Minimal\'s first by decision 6, and it builds on a swap as it stands', () => {
    // Minimal already takes all 3 L off: nothing to look ahead to.
    expect(ahead(advise(input({ goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(3)) })))).toBeNull();
    // Better handling: whatever Looking ahead gives holds Minimal's first as it is (its removal too) and gains 0.5 more.
    for (const kg of [0.6, 2, 5]) {
      const answer = advise(input({ goal: 'handling', bags: [bag(1, 'seat', 14), bag(2, 'bar', 12)], nextUid: 3, trial: packer([{ id: 'a', L: 4, kg }, { id: 'b', L: 4, kg }, { id: 'c', L: 3, kg }]) }));
      if (answer.kind !== 'suggestions') continue;
      const first = answer.items[0]!, a = answer.ahead;
      expect(a === null || a.kind === 'ahead').toBe(true);
      if (!a) continue;
      expect(a.remove).toBe(first.remove);
      expect(a.add.slice(0, first.add.length)).toEqual(first.add);
      expect(a.add).toHaveLength(first.add.length + 1);
      expect(first.score - a.score).toBeGreaterThanOrEqual(MIN_GAIN_SCORE - 1e-9);
      expect(a.result.overL).toBe(0);
    }
  });

  test('[GA-AHEAD] under Bikepacking bags only, and with no rack mounts and no rack fitted, Looking ahead adds no pannier and no rack either', () => {
    for (const over of [{ style: 'bags' as const }, { style: 'panniers' as const, rackMounts: 'no' as const }]) {
      const answer = advise(input({ ...over, goal: 'backpack', camping: true, bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(8, 8, 6)) }));
      const a = ahead(answer);
      expect(a, JSON.stringify(over)).not.toBeUndefined();
      if (a) { expect(a.add.some((b) => b.pos === 'rack')).toBe(false); expect(a.decks.rack).toBe(false); }
    }
  });
});

describe('the rack (the owner\'s ruling of 7 Nov): use what you have, a rack does the job, new bags, panniers last', () => {
  // The owner's example: a tent in the backpack. Here the tent is the 6 L item, the rest fills the bags.
  const tentInPack = (over: Partial<AdvisorInput>) => input({ goal: 'backpack', camping: true, nextUid: 5, trial: packer(items(10, 10, 6)), ...over });

  test('[GA-DECK] with a rack fitted: "Put the tent on your rack", the deck on, no new bag, the whole answer', () => {
    for (const style of ['bags-first', 'panniers'] as const) {
      const answer = advise(tentInPack({ style, bags: [bag(1, 'rack', 10, { pair: true }), bag(2, 'pack', 15)] }));
      expect(suggestions(answer).map((s) => [s.kind, s.newBags, s.add.length, s.decks.rack, s.result.backL]), style).toEqual([['deck', 0, 0, true, 0]]);
    }
    // Bikepacking bags only: the panniers leave the plan, the rack stays, and its deck is still offered, as no new bag.
    const deckOnly = candidates(tentInPack({ style: 'bags', bags: [bag(1, 'rack', 10, { pair: true }), bag(2, 'pack', 15)] }), 'add').filter((c) => c.deck);
    expect(deckOnly.map((c) => [c.kind, c.newBags])).toEqual([['deck', 0]]);
  });

  test('[GA-DECK] with no rack fitted and rack mounts yes or Not sure: "a rack" comes first, one new thing, tagged when Not sure; never under Bikepacking bags only, nor with rack mounts no', () => {
    const plan = { bags: [bag(1, 'seat', 10), bag(2, 'bar', 10), bag(3, 'pack', 15)], usable: onlyAt('seat', 'bar', 'top') };
    for (const style of ['bags-first', 'panniers'] as const) {
      for (const rackMounts of ['yes', 'unknown'] as const) {
        const first = suggestions(advise(tentInPack({ ...plan, style, rackMounts })))[0]!;
        expect([first.kind, first.newBags, first.add.length, first.decks.rack], `${style} ${rackMounts}`).toEqual(['deck', 1, 0, true]);
        expect(first.tags.includes(GA.advisorTagRackMounts)).toBe(rackMounts === 'unknown');
      }
    }
    for (const over of [{ style: 'bags' as const }, { style: 'panniers' as const, rackMounts: 'no' as const }]) {
      const answer = advise(tentInPack({ ...plan, ...over }));
      expect(suggestions(answer).some((s) => s.deck || s.add.some((b) => b.pos === 'rack')), JSON.stringify(over)).toBe(false);
      expect(ahead(answer) === null || ahead(answer) === undefined || (!ahead(answer)!.deck && !ahead(answer)!.add.some((b) => b.pos === 'rack'))).toBe(true);
    }
  });

  test('[GA-STYLE] a giant backpack holding a tent and a sleeping bag, which no bags alone can take: a rack with panniers is offered under Bags first and Panniers are fine, never under Bikepacking bags only', () => {
    // 40 L on the back: a tent, a sleeping bag and three big items; the bike takes a seat pack and a bar roll only, besides a rack.
    const big = [{ id: 'tent', L: 6, kg: 1.3 }, { id: 'bag', L: 6, kg: 1 }, { id: 'a', L: 10, kg: 2 }, { id: 'b', L: 9, kg: 2 }, { id: 'c', L: 9, kg: 2 }];
    const giant = (style: AdvisorInput['style']) => advise(input({ style, goal: 'backpack', camping: true, bags: [bag(1, 'pack', 40)], nextUid: 2,
      usable: onlyAt('seat', 'bar', 'rack'), trial: packer(big) }));
    const panniersShown = (a: AdvisorAnswer) => [...suggestions(a), ...(ahead(a) ? [ahead(a)!] : [])].some((s) => s.add.some((b) => b.pos === 'rack'));
    expect(panniersShown(giant('bags-first'))).toBe(true);
    expect(panniersShown(giant('panniers'))).toBe(true);
    expect(panniersShown(giant('bags'))).toBe(false);
  });

  test('[GA-ORDER] Bags first: panniers only if needed: when bags alone do it, no trial holds a pannier; Panniers are fine tries them in the first round', () => {
    const seen = (style: AdvisorInput['style']) => {
      const calls: { bags: BagIn[]; decks: Decks }[] = [];
      void [...adviseSteps(input({ style, goal: 'backpack', bags: [bag(1, 'pack', 15)], nextUid: 2, trial: packer(items(3), calls) }))];
      return calls.some((t) => t.bags.some((b) => b.pos === 'rack'));
    };
    expect(seen('bags-first')).toBe(false);
    expect(seen('panniers')).toBe(true);
    expect(seen('bags')).toBe(false);
  });

  test('[GA-NO-MOUNTS] rack mounts no and no rack fitted: no trial holds a rack, panniers or the deck, under any setup', () => {
    for (const style of ['bags', 'bags-first', 'panniers'] as const) {
      const calls: { bags: BagIn[]; decks: Decks }[] = [];
      advise(input({ style, rackMounts: 'no', goal: 'backpack', camping: true, bags: [bag(1, 'pack', 40)], nextUid: 2, trial: packer(items(10, 10, 9, 9, 6), calls) }));
      expect(calls.some((t) => t.decks.rack || t.bags.some((b) => b.pos === 'rack')), style).toBe(false);
    }
  });
});

describe('the review of PR 61', () => {
  test('[GA-AHEAD] one rack at most: panniers added beside "a rack" (its deck) bring that same rack; the suggestion never carries the deck as a second thing (I3)', () => {
    const i = input({ style: 'panniers', goal: 'backpack', camping: true, bags: [bag(1, 'pack', 30)], nextUid: 2 });
    const rackFirst = candidates(i, 'add').find((c) => c.kind === 'deck')!;
    expect(rackFirst.newBags).toBe(1);
    const withPanniers = extensions(i, rackFirst).filter((c) => c.add.some((b) => b.pos === 'rack'));
    expect(withPanniers.length).toBeGreaterThan(10);
    for (const c of withPanniers) {
      expect(c.deck, 'the deck comes with the panniers, not as a second rack').toBe(false);
      expect(c.decks.rack).toBe(true);
      expect(c.newBags).toBe(1 + (c.add.find((b) => b.pos === 'rack')!.pair ? 2 : 1)); // one rack, then the pannier bags
    }
    // and in the owner's giant-backpack example, whatever the answer holds
    const big = [{ id: 'tent', L: 6, kg: 1.3 }, { id: 'bag', L: 6, kg: 1 }, { id: 'a', L: 10, kg: 2 }, { id: 'b', L: 9, kg: 2 }, { id: 'c', L: 9, kg: 2 }];
    for (const style of ['bags-first', 'panniers'] as const) {
      const answer = advise(input({ style, goal: 'backpack', camping: true, bags: [bag(1, 'pack', 40)], nextUid: 2, usable: onlyAt('seat', 'bar', 'rack'), trial: packer(big) }));
      for (const s of [...suggestions(answer), ...(ahead(answer) ? [ahead(answer)!] : [])]) expect(s.deck && s.add.some((b) => b.pos === 'rack'), style).toBe(false);
    }
  });

  test('[GA-SLICES] the page may ask for a hand-back sooner (input.handBack, which holds the page\'s clock): the search yields whenever it says so, and still after 20 trials at most (I4)', () => {
    let calls = 0;
    const trialCalls: unknown[] = [];
    const i = input({ goal: 'handling', style: 'bags', trial: packer(items(12, 12, 12, 12), trialCalls as { bags: BagIn[]; decks: Decks }[]),
      handBack: () => (++calls % 7 === 0) });
    const yields: number[] = [];
    const gen = adviseSteps(i);
    let answer: AdvisorAnswer;
    for (;;) { const step = gen.next(); if (step.done) { answer = step.value; break; } yields.push(step.value); }
    expect(yields.some((y) => y % 20 !== 0), 'some hand-backs came on the page\'s word').toBe(true);
    const gaps = yields.map((y, k) => y - (k ? yields[k - 1]! : 0));
    expect(Math.max(...gaps)).toBeLessThanOrEqual(20);
    expect(answer.tried).toBe(trialCalls.length);
    // without it, every 20 trials as before
    expect([...adviseSteps(input({ goal: 'handling', style: 'bags', trial: packer(items(12, 12, 12, 12)) }))].every((y) => y % 20 === 0)).toBe(true);
  });

  test('[GA-AHEAD] Get the backpack off: Looking ahead\'s two bags are sized so the larger is as small as it can be while the back still empties (m2)', () => {
    const answer = advise(input({ goal: 'backpack', style: 'bags', bags: [bag(1, 'pack', 15)], nextUid: 2, usable: onlyAt('seat', 'bar'), trial: packer(items(8, 8, 6)) }));
    const a = ahead(answer)!;
    expect(a.add.map((b) => [b.pos, b.L])).toEqual([['seat', 14], ['bar', 8]]);
    expect(a.result.backL).toBe(0);
    expect(a.kind).toBe('ahead');
  });

  test('[GA-AHEAD] a Looking ahead set taken from the counting suggestions, an add of one bag, shows its size range (m3)', () => {
    // 3 L on the back; a 2 L top tube bag counts (2 L off) and is Minimal; only top tube bags (one slot) and fork-cage pairs fit this
    // bike, so the pair (two bags) that takes it all is Looking ahead, with its range.
    const usable = (b: BagIn) => ({ ok: b.pos === 'top' || (b.pos === 'fork' && b.pair === true), reason: null });
    const answer = advise(input({ goal: 'backpack', style: 'bags', bags: [bag(1, 'pack', 15)], nextUid: 2, usable, topSlotsFree: ['front'], trial: packer([{ id: 'a', L: 2, kg: 1 }, { id: 'b', L: 1, kg: 1 }]) }));
    expect(suggestions(answer).map((s) => [s.add[0]!.pos, s.result.backL])).toEqual([['top', 1]]);
    const a = ahead(answer)!;
    expect([a.kind, a.add[0]!.pos, a.add[0]!.pair]).toEqual(['add', 'fork', true]);
    expect(a.rangeL).toEqual([2, 4]);
  });
});

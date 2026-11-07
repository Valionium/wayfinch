import { describe, expect, test } from 'vitest';
import { candidates } from '../../../../src/core/advisor/candidates.ts';
import { DECIDED, MAX_TRIALS, MIN_GAIN_BACK_L, MIN_GAIN_SCORE, SIZE_RANGES, sizesOf, WEIGHTS } from '../../../../src/core/advisor/table.ts';
import type { AdvisorInput, Candidate } from '../../../../src/core/advisor/types.ts';
import { GA } from '../../../../src/core/wording/en-advisor.ts';
import { bag, input, SHAPES, TABLE_SIZES } from './fixtures.ts';

const PHASES = ['add', 'swap', 'add-two'] as const;
const all = (i: AdvisorInput): Candidate[] => PHASES.flatMap((p) => candidates(i, p));
const sizesAt = (list: Candidate[], pos: string) => list.filter((c) => c.add[0]!.pos === pos).map((c) => c.add[0]!.L);

describe('the tables (decisions 2, 3, 6; the plan\'s tables)', () => {
  test('[GA-CANDIDATES] WEIGHTS is the plan\'s weight table, SIZE_RANGES its size table, the thresholds as decided', () => {
    expect(WEIGHTS).toEqual({ frame: 1.0, bottle: 1.0, bottleU: 1.0, top: 1.2, fork: 1.5, rack: 1.8, deck: 1.8, bar: 2.2, seat: 2.6, pack: 3.5 });
    expect(SIZE_RANGES).toEqual({
      top: { min: 0.5, max: 2, step: 0.5, pair: false },
      fork: { min: 2, max: 5, step: 1, pair: true },
      bar: { min: 5, max: 15, step: 1, pair: false },
      seat: { min: 4, max: 16, step: 1, pair: false },
      rack: { min: 10, max: 25, step: 1, pair: true },
    });
    for (const [pos, sizes] of Object.entries(TABLE_SIZES)) expect(sizesOf(pos as keyof typeof SIZE_RANGES), pos).toEqual(sizes);
    expect([MIN_GAIN_SCORE, MIN_GAIN_BACK_L, MAX_TRIALS]).toEqual([0.5, 0.5, 1000]);
  });

  test('[GA-CANDIDATES] every decided value is in table.ts, as the plan\'s decisions (and the review of PR 57) have them', () => {
    expect(DECIDED).toEqual({
      pairIsOneBag: true,                  // decision 4
      forkNeedsMountsTag: true,            // decision 4
      noPanniersUnder: ['either', 'rack'], // decision 5 (review m3: also under With a rack)
      seatUnlikely: 'drop',                // decision 9
      seatTight: 'tag',                    // decision 9
      rackWithoutRack: 'off',              // review I3, re-check R1 (design §4): no deck, no panniers
      rangeUpToL: 2,                       // design §3.3
      rangeHalfLitres: true,               // decision 3 (review m2: +0.5 and +1.5 L for the top tube)
    });
    expect(Object.isFrozen(DECIDED)).toBe(true);
  });
});

describe('candidates', () => {
  test('[GA-CANDIDATES] on a bike with every position free: the add phase holds each type at each size of SIZE_RANGES (frame: the given shapes), fork and rack as pairs; taken positions are skipped; the top tube\'s second slot is offered when the first is taken', () => {
    const adds = candidates(input(), 'add');
    for (const c of adds) {
      expect(c.kind).toBe('add');
      expect(c.remove).toBeNull();
      expect(c.newBags).toBe(1);
      expect(c.add).toHaveLength(1);
      expect(c.add[0]!.uid).toBe(10);
      expect(c.decks).toEqual({ rack: false, bar: false });
      expect(c.litres).toBe(c.add[0]!.L * (c.add[0]!.pair ? 2 : 1));
    }
    expect(new Set(adds.map((c) => c.add[0]!.pos))).toEqual(new Set(['frame', 'top', 'fork', 'rack', 'bar', 'seat']));
    for (const [pos, sizes] of Object.entries(TABLE_SIZES)) expect(sizesAt(adds, pos).sort((a, b) => a - b), pos).toEqual(sizes);
    const frames = adds.filter((c) => c.add[0]!.pos === 'frame');
    expect(frames.map((c) => [c.add[0]!.shape, c.add[0]!.L]).sort()).toEqual(SHAPES.map((s) => [s.shape, s.L]).sort());
    for (const c of adds.filter((x) => ['fork', 'rack'].includes(x.add[0]!.pos))) expect(c.add[0]!.pair).toBe(true);
    for (const c of adds.filter((x) => !['fork', 'rack'].includes(x.add[0]!.pos))) expect(c.add[0]!.pair).toBeUndefined();
    for (const c of adds.filter((x) => x.add[0]!.pos === 'top')) expect(c.add[0]!.slot).toBe('front');
    expect(adds).toHaveLength(4 + 3 + 4 + 16 + 11 + 13);

    // Taken positions are skipped; the second top-tube slot is offered when the first is taken.
    const taken = candidates(input({ bags: [bag(1, 'seat', 10), bag(2, 'top', 1, { slot: 'front' }), bag(3, 'fork', 3, { pair: true })], topSlotsFree: ['rear'], nextUid: 4 }), 'add');
    expect(sizesAt(taken, 'seat')).toEqual([]);
    expect(sizesAt(taken, 'fork')).toEqual([]);
    expect(taken.filter((c) => c.add[0]!.pos === 'top').map((c) => c.add[0]!.slot)).toEqual(['rear', 'rear', 'rear', 'rear']);
    expect(taken.every((c) => c.add[0]!.uid === 4)).toBe(true);
    expect(sizesAt(candidates(input({ topSlotsFree: [] }), 'add'), 'top')).toEqual([]);
    expect(sizesAt(candidates(input({ bags: [bag(1, 'frame', 6, { shape: 0 })] }), 'add'), 'frame')).toEqual([]);
    // A backpack or bottles never take a position from a bag, and are never offered.
    const withPack = candidates(input({ bags: [bag(1, 'pack', 15), bag(2, 'bottle', 0.75)] }), 'add');
    expect(withPack).toHaveLength(adds.length);
    expect(all(input()).some((c) => c.add.some((b) => ['pack', 'bottle', 'bottleU'].includes(b.pos)))).toBe(false);
  });

  test('[GA-CANDIDATES] a size bagSpec refuses is dropped; a seat pack size the seat gap calls unlikely is dropped, a tight one is offered with that word (decision 9)', () => {
    const usable = (b: { pos: string; L: number }) => {
      if (b.pos === 'bar' && b.L > 12) return { ok: false, reason: 'BAR_WIDTH' };
      if (b.pos === 'seat') return { ok: true, reason: null, band: b.L > 12 ? 'unlikely' as const : b.L > 9 ? 'tight' as const : 'likely' as const };
      return { ok: true, reason: null };
    };
    const adds = candidates(input({ usable }), 'add');
    expect(sizesAt(adds, 'bar')).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sizesAt(adds, 'seat')).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const c of adds.filter((x) => x.add[0]!.pos === 'seat')) expect(c.tags.includes(GA.advisorTagTight), String(c.add[0]!.L)).toBe(c.add[0]!.L > 9);
    // The other phases drop them as well.
    const rest = [...candidates(input({ usable, bags: [bag(1, 'top', 1, { slot: 'front' })], topSlotsFree: ['rear'] }), 'swap'), ...candidates(input({ usable }), 'add-two')];
    expect(rest.some((c) => c.add.some((b) => (b.pos === 'bar' && b.L > 12) || (b.pos === 'seat' && b.L > 12)))).toBe(false);
  });

  test('[GA-CANDIDATES] a small frame (XS or S) with no measured seat gap: every seat pack carries the planner\'s caution, as bagSpec\'s note does (review of PR 57, I2)', () => {
    const bags = [bag(1, 'bar', 12)];
    const seatOnes = (i: AdvisorInput) => all(i).filter((c) => c.add.some((b) => b.pos === 'seat'));
    for (const frameSize of ['XS', 'S']) {
      const seats = seatOnes(input({ frameSize, seatGapCm: null, bags, nextUid: 2 }));
      expect(seats.length, frameSize).toBeGreaterThan(13);
      for (const c of seats) expect(c.tags, frameSize).toContain(GA.advisorTagSmallFrame);
      for (const c of all(input({ frameSize, seatGapCm: null, bags, nextUid: 2 })).filter((x) => !x.add.some((b) => b.pos === 'seat'))) {
        expect(c.tags).not.toContain(GA.advisorTagSmallFrame);
      }
      // A classic script may be handed undefined for a gap never measured.
      for (const c of seatOnes(input({ frameSize, seatGapCm: undefined, bags, nextUid: 2 }))) expect(c.tags).toContain(GA.advisorTagSmallFrame);
      // A measured gap gives bagSpec's band instead, and no note.
      for (const c of seatOnes(input({ frameSize, seatGapCm: 30, bags, nextUid: 2 }))) expect(c.tags).not.toContain(GA.advisorTagSmallFrame);
    }
    for (const frameSize of ['M', 'L', 'XL', null, undefined]) {
      for (const c of seatOnes(input({ frameSize, seatGapCm: null, bags, nextUid: 2 }))) expect(c.tags, String(frameSize)).not.toContain(GA.advisorTagSmallFrame);
    }
  });

  test('[GA-CANDIDATES] panniers put the rack deck on when the trip camps; fork cages say they need mounts; frame litres not measured say estimate', () => {
    const camping = candidates(input({ camping: true }), 'add');
    for (const c of camping) expect(c.decks.rack, c.add[0]!.pos).toBe(c.add[0]!.pos === 'rack');
    for (const c of candidates(input(), 'add')) {
      const b = c.add[0]!;
      expect(c.tags.includes(GA.advisorTagForkMounts), b.pos).toBe(b.pos === 'fork');
      expect(c.tags.includes(GA.advisorTagEstimate), b.pos).toBe(b.pos === 'frame' && b.shape !== 0);
    }
  });

  test('[GA-CANDIDATES] swap: one of the rider\'s bags out, one in at any position free after the removal; add-two: two adds at two different free positions, sizes in lock step from each range\'s low end', () => {
    const i = input({ bags: [bag(1, 'seat', 14), bag(2, 'bar', 12)], nextUid: 3, frameShapes: [SHAPES[2]!, SHAPES[0]!] });
    const swaps = candidates(i, 'swap');
    for (const c of swaps) {
      expect(c.kind).toBe('swap');
      expect(c.newBags).toBe(1);
      expect([1, 2]).toContain(c.remove);
      expect(c.add[0]!.uid).toBe(3);
      // The bag in goes to a free position or to the one just freed.
      expect(c.add[0]!.pos === 'seat' ? c.remove === 1 : c.add[0]!.pos === 'bar' ? c.remove === 2 : true).toBe(true);
    }
    // The same bag back in is no swap.
    expect(swaps.some((c) => c.remove === 1 && c.add[0]!.pos === 'seat' && c.add[0]!.L === 14)).toBe(false);
    expect(swaps.filter((c) => c.remove === 1 && c.add[0]!.pos === 'seat')).toHaveLength(12);
    expect(swaps.filter((c) => c.remove === 1 && c.add[0]!.pos === 'frame')).toHaveLength(2);
    // Get the backpack off never swaps.
    expect(candidates({ ...i, goal: 'backpack' }, 'swap')).toEqual([]);

    const twos = candidates(i, 'add-two');
    for (const c of twos) {
      expect(c.kind).toBe('add-two');
      expect(c.remove).toBeNull();
      expect(c.newBags).toBe(2);
      expect(c.add.map((b) => b.uid)).toEqual([3, 4]);
      expect(c.add[0]!.pos).not.toBe(c.add[1]!.pos);
      expect(c.add.some((b) => b.pos === 'seat' || b.pos === 'bar')).toBe(false);
      expect(c.litres).toBe(c.add.reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0));
    }
    // Frame (3, 6 L) with top (0.5–2 L) in lock step: the shorter list stays at its largest.
    const frameTop = twos.filter((c) => c.add.some((b) => b.pos === 'frame') && c.add.some((b) => b.pos === 'top'))
      .map((c) => [c.add.find((b) => b.pos === 'frame')!.L, c.add.find((b) => b.pos === 'top')!.L]);
    expect(frameTop).toEqual([[3, 0.5], [6, 1], [6, 1.5], [6, 2]]);
    // Fork (2–5) with rack (10–25): 16 steps.
    expect(twos.filter((c) => c.add.some((b) => b.pos === 'fork') && c.add.some((b) => b.pos === 'rack'))).toHaveLength(16);
  });
});

describe('the style and the rack mounts (design §2, §4)', () => {
  const withBags = (over: Partial<AdvisorInput>) => input({ bags: [bag(1, 'seat', 14), bag(2, 'bar', 12), bag(3, 'pack', 15)], nextUid: 4, camping: true, ...over });
  const rackish = (c: Candidate) => c.add.some((b) => b.pos === 'rack') || c.decks.rack;

  test('[GA-STYLE] style no-rack: no candidate in any phase has pos \'rack\' or decks.rack true; noPanniers: the same under \'either\'', () => {
    expect(all(withBags({ style: 'either' })).some(rackish)).toBe(true);
    expect(all(withBags({ style: 'rack' })).some(rackish)).toBe(true);
    const noRack = all(withBags({ style: 'no-rack' }));
    expect(noRack.length).toBeGreaterThan(50);
    expect(noRack.some(rackish)).toBe(false);
    const trails = all(withBags({ style: 'either', noPanniers: true }));
    expect(trails.length).toBe(noRack.length);
    expect(trails.some(rackish)).toBe(false);
  });

  test('[GA-NO-MOUNTS] rackMounts \'no\': no rack candidate under any style; \'unknown\': rack candidates carry the tag \'if your bike has rack mounts\'', () => {
    for (const style of ['rack', 'no-rack', 'either'] as const) {
      expect(all(withBags({ style, rackMounts: 'no' })).some(rackish), style).toBe(false);
    }
    expect(GA.advisorTagRackMounts).toBe('if your bike has rack mounts');
    const unknown = all(withBags({ rackMounts: 'unknown' }));
    expect(unknown.some(rackish)).toBe(true);
    for (const c of unknown) expect(c.tags.includes(GA.advisorTagRackMounts)).toBe(c.add.some((b) => b.pos === 'rack'));
    for (const c of all(withBags({ rackMounts: 'yes' }))) expect(c.tags.includes(GA.advisorTagRackMounts)).toBe(false);
  });

  test('[GA-NO-MOUNTS] a missing rackMounts is Not sure, never Yes: undefined, null and \'unknown\' tag every pannier; \'yes\' tags none; \'no\' offers none (review of PR 57, I1)', () => {
    // Sub-project 11 stores Not sure as an absent field; the page may hand the classic script undefined or null.
    for (const rackMounts of [undefined, null, 'unknown', 'maybe'] as unknown as AdvisorInput['rackMounts'][]) {
      const list = all(withBags({ rackMounts }));
      const racks = list.filter((c) => c.add.some((b) => b.pos === 'rack'));
      expect(racks.length, String(rackMounts)).toBeGreaterThan(15);
      for (const c of list) expect(c.tags.includes(GA.advisorTagRackMounts), String(rackMounts)).toBe(c.add.some((b) => b.pos === 'rack'));
    }
    const yes = all(withBags({ rackMounts: 'yes' }));
    expect(yes.some((c) => c.add.some((b) => b.pos === 'rack'))).toBe(true);
    expect(yes.some((c) => c.tags.includes(GA.advisorTagRackMounts))).toBe(false);
    expect(all(withBags({ rackMounts: 'no' })).some(rackish)).toBe(false);
  });

  test('[GA-STYLE] a rack deck the rider already has is off in every candidate without a rack (style no-rack, or the trails answer), and kept otherwise (review of PR 57, I3)', () => {
    const decks = { rack: true, bar: true };
    for (const over of [{ style: 'no-rack' as const }, { style: 'either' as const, noPanniers: true }]) {
      const list = all(withBags({ ...over, decks }));
      expect(list.length, JSON.stringify(over)).toBeGreaterThan(50);
      expect(list.some(rackish), JSON.stringify(over)).toBe(false);
      for (const c of list) expect(c.decks.bar).toBe(true); // only the rack deck goes
    }
    for (const style of ['either', 'rack'] as const) {
      for (const c of all(withBags({ style, decks }))) expect(c.decks, style).toEqual(decks);
    }
    // No rack mounts stops new panniers, not the rider's own deck.
    for (const c of all(withBags({ rackMounts: 'no', decks }))) expect(c.decks).toEqual(decks);
  });
});

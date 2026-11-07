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
      pairIsOneBag: false,                 // decision 4; the owner, 7 Nov: a pair is two bags, a single one
      forkNeedsMountsTag: true,            // decision 4
      seatUnlikely: 'drop',                // decision 9
      seatTight: 'tag',                    // decision 9
      rangeUpToL: 2,                       // design §3.3
      rangeHalfLitres: true,               // decision 3 (review m2: +0.5 and +1.5 L for the top tube)
      // the owner's ruling of 7 Nov on the rack: the setup step, its default, the questionnaire's mapping
      setups: ['bags', 'bags-first', 'panniers'],
      defaultSetup: 'bags-first',
      ridingSetup: { touring: 'panniers', road: 'bags', gravel: 'bags', mtb: 'bags', everyday: 'bags-first' },
      ownPanniersUnderBagsOnly: 'off',     // Bikepacking bags only: the rider's panniers leave, the rack and its deck stay
      newRackCounts: 1,                    // a rack to fit is one new thing
      backpackWholeFirst: true,            // Get the backpack off: Minimal empties the back when anything tried does
      addOrder: { deck: 0, top: 1, frame: 1, seat: 2, bar: 3, fork: 4, rack: 5 }, // the owner, 7 Nov: Minimal's order
    });
    expect(Object.isFrozen(DECIDED)).toBe(true);
  });
});

describe('candidates', () => {
  test('[GA-CANDIDATES] on a bike with every position free: the add phase holds each type at each size of SIZE_RANGES (frame: the given shapes), fork and rack as singles and as pairs (owner, 7 Nov); taken positions are skipped; the top tube\'s second slot is offered when the first is taken', () => {
    const adds = candidates(input(), 'add');
    for (const c of adds) {
      expect(c.kind).toBe('add');
      expect(c.remove).toBeNull();
      // a pair is two bags; panniers on a bike with no rack fitted bring a rack to fit, one more (the owner, 7 Nov)
      expect(c.newBags).toBe((c.add[0]!.pair ? 2 : 1) + (c.add[0]!.pos === 'rack' ? 1 : 0));
      expect(c.add).toHaveLength(1);
      expect(c.add[0]!.uid).toBe(10);
      expect(c.decks).toEqual({ rack: false, bar: false });
      expect(c.litres).toBe(c.add[0]!.L * (c.add[0]!.pair ? 2 : 1));
    }
    expect(new Set(adds.map((c) => c.add[0]!.pos))).toEqual(new Set(['frame', 'top', 'fork', 'rack', 'bar', 'seat']));
    for (const [pos, sizes] of Object.entries(TABLE_SIZES)) {
      const twice = ['fork', 'rack'].includes(pos) ? [...sizes, ...sizes] : sizes; // a single and a pair at each size
      expect(sizesAt(adds, pos).sort((a, b) => a - b), pos).toEqual([...twice].sort((a, b) => a - b));
    }
    const frames = adds.filter((c) => c.add[0]!.pos === 'frame');
    expect(frames.map((c) => [c.add[0]!.shape, c.add[0]!.L]).sort()).toEqual(SHAPES.map((s) => [s.shape, s.L]).sort());
    for (const pos of ['fork', 'rack']) {
      expect(adds.filter((x) => x.add[0]!.pos === pos && x.add[0]!.pair === true)).toHaveLength(TABLE_SIZES[pos as 'fork' | 'rack'].length);
      expect(adds.filter((x) => x.add[0]!.pos === pos && x.add[0]!.pair === undefined)).toHaveLength(TABLE_SIZES[pos as 'fork' | 'rack'].length);
    }
    for (const c of adds.filter((x) => !['fork', 'rack'].includes(x.add[0]!.pos))) expect(c.add[0]!.pair).toBeUndefined();
    for (const c of adds.filter((x) => x.add[0]!.pos === 'top')) expect(c.add[0]!.slot).toBe('front');
    expect(adds).toHaveLength(4 + 3 + 2 * 4 + 2 * 16 + 11 + 13);

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
    // a rack with its deck alone (the owner, 7 Nov: a rack does the job) has no bag and puts the deck on too
    for (const c of camping) expect(c.decks.rack, c.add[0]?.pos ?? 'deck').toBe(c.deck || c.add[0]!.pos === 'rack');
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
      expect(c.newBags).toBe((c.add[0]!.pair ? 2 : 1) + (c.add[0]!.pos === 'rack' ? 1 : 0)); // a pair is two; a rack to fit, one (owner, 7 Nov)
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
      expect(c.newBags).toBe(c.add.reduce((n, b) => n + (b.pair ? 2 : 1), 0) + (c.add.some((b) => b.pos === 'rack') ? 1 : 0)); // owner, 7 Nov
      expect(c.add.map((b) => b.uid)).toEqual([3, 4]);
      expect(c.add[0]!.pos).not.toBe(c.add[1]!.pos);
      expect(c.add.some((b) => b.pos === 'seat' || b.pos === 'bar')).toBe(false);
      expect(c.litres).toBe(c.add.reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0));
    }
    // Frame (3, 6 L) with top (0.5–2 L) in lock step: the shorter list stays at its largest.
    const frameTop = twos.filter((c) => c.add.some((b) => b.pos === 'frame') && c.add.some((b) => b.pos === 'top'))
      .map((c) => [c.add.find((b) => b.pos === 'frame')!.L, c.add.find((b) => b.pos === 'top')!.L]);
    expect(frameTop).toEqual([[3, 0.5], [6, 1], [6, 1.5], [6, 2]]);
    // Fork (2–5) with rack (10–25): 16 steps, for each of single and pair at either (owner, 7 Nov).
    expect(twos.filter((c) => c.add.some((b) => b.pos === 'fork') && c.add.some((b) => b.pos === 'rack'))).toHaveLength(4 * 16);
  });
});

describe('the setup and the rack (the owner\'s ruling of 7 Nov: the setup is a choice; a rack fitted and the rack mounts are facts)', () => {
  const withBags = (over: Partial<AdvisorInput>) => input({ bags: [bag(1, 'seat', 14), bag(2, 'bar', 12), bag(3, 'pack', 15)], nextUid: 4, camping: true, ...over });
  const panniersIn = (c: Candidate) => c.add.some((b) => b.pos === 'rack');
  const rackish = (c: Candidate) => panniersIn(c) || c.decks.rack;

  test('[GA-STYLE] Bikepacking bags only: no candidate in any phase is a pannier or a rack to fit; Bags first and Panniers are fine offer both (the search decides when, search.ts)', () => {
    for (const style of ['bags-first', 'panniers'] as const) {
      expect(all(withBags({ style })).some(panniersIn), style).toBe(true);
      expect(all(withBags({ style })).some((c) => c.deck), style).toBe(true);
    }
    const bagsOnly = all(withBags({ style: 'bags' }));
    expect(bagsOnly.length).toBeGreaterThan(50);
    expect(bagsOnly.some(rackish)).toBe(false);
  });

  test('[GA-NO-MOUNTS] rack mounts no and no rack fitted: never a rack or panniers; Not sure: a rack or panniers carry "if your bike has rack mounts"; a missing field is Not sure (review of PR 57, I1)', () => {
    for (const style of ['bags', 'bags-first', 'panniers'] as const) {
      expect(all(withBags({ style, rackMounts: 'no' })).some(rackish), style).toBe(false);
    }
    expect(GA.advisorTagRackMounts).toBe('if your bike has rack mounts');
    for (const rackMounts of [undefined, null, 'unknown', 'maybe'] as unknown as AdvisorInput['rackMounts'][]) {
      const list = all(withBags({ rackMounts }));
      expect(list.filter(panniersIn).length, String(rackMounts)).toBeGreaterThan(15);
      for (const c of list) expect(c.tags.includes(GA.advisorTagRackMounts), String(rackMounts)).toBe(panniersIn(c) || c.deck);
    }
    const yes = all(withBags({ rackMounts: 'yes' }));
    expect(yes.some(panniersIn)).toBe(true);
    expect(yes.some((c) => c.tags.includes(GA.advisorTagRackMounts))).toBe(false);
  });

  test('[GA-NO-MOUNTS] a rack already fitted is a fact: with rack mounts no or Not sure it is kept, its deck and panniers on it are offered (under the setups that allow panniers) without the mounts word', () => {
    const fitted = (over: Partial<AdvisorInput>) => withBags({ bags: [bag(1, 'seat', 14), bag(2, 'rack', 15), bag(3, 'pack', 15)], ...over });
    for (const rackMounts of ['no', 'unknown'] as const) {
      const list = all(fitted({ rackMounts }));
      expect(list.some((c) => c.deck), rackMounts).toBe(true);   // use the rack you have
      for (const c of list) expect(c.tags).not.toContain(GA.advisorTagRackMounts);
      for (const c of list.filter((x) => x.kind === 'deck')) expect(c.newBags).toBe(0);
      expect(list.filter((c) => c.remove === null).some(panniersIn), 'the rack is taken: no second set of panniers').toBe(false);
    }
  });

  test('[GA-STYLE] Bikepacking bags only: the rider\'s own panniers leave every candidate\'s plan; the rack they hung from stays, its deck as the rider has it, and its deck is offered when off', () => {
    for (const decks of [{ rack: false, bar: true }, { rack: true, bar: true }]) {
      const i = withBags({ style: 'bags', bags: [bag(1, 'seat', 14), bag(2, 'rack', 20, { pair: true })], decks, nextUid: 3 });
      const list = all(i);
      expect(list.length).toBeGreaterThan(50);
      expect(list.some((c) => c.remove === 2), 'no swap takes out panniers that are not in the plan').toBe(false);
      for (const c of list.filter((x) => !x.deck)) expect(c.decks).toEqual(decks);
      expect(list.some((c) => c.deck), JSON.stringify(decks)).toBe(!decks.rack);
      for (const c of list.filter((x) => x.kind === 'deck')) { expect(c.newBags).toBe(0); expect(c.decks.rack).toBe(true); }
    }
  });
});

// One-line builders for the Gear advisor's tests. The trial function here is a stand-in that refuses to run: tests that need a packer
// bring their own (search.test.ts), so nothing here is the code under test.
import type { AdvisorInput, BagIn } from '../../../../src/core/advisor/types.ts';

export const SHAPES = [
  { shape: 0, L: 6, source: 'measured' },
  { shape: 1, L: 4.5, source: 'estimated' },
  { shape: 2, L: 3, source: 'default' },
];

export function bag(uid: number, pos: BagIn['pos'], L: number, extra: Partial<BagIn> = {}): BagIn {
  return { uid, pos, L, ...extra };
}

export function input(over: Partial<AdvisorInput> = {}): AdvisorInput {
  return {
    style: 'panniers', goal: 'handling',
    bags: [], decks: { rack: false, bar: false }, camping: false, nextUid: 10,
    frameShapes: SHAPES, frameReason: null, topSlotsFree: ['front', 'rear'],
    rackMounts: 'yes', frameSize: 'M', seatGapCm: null,
    usable: () => ({ ok: true, reason: null }),
    trial: () => { throw new Error('candidates() never runs a trial'); },
    ...over,
  };
}

/** The sizes of SIZE_RANGES' rows, written out as the plan's size table has them. */
export const TABLE_SIZES = {
  top: [0.5, 1, 1.5, 2],
  fork: [2, 3, 4, 5],
  bar: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  seat: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  rack: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
};

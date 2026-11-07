// The Gear advisor's candidates (design §3.1; plan Task 1): what could be bought next, at every size of the size table, at the
// positions the bike has free. Whether a bag fits the bike is the planner's own bagSpec (`input.usable`), never decided here.
import { GA } from '../wording/en-advisor.ts';
import { sizesOf, SIZE_RANGES } from './table.ts';
import type { AdvisorInput, BagIn, Candidate, Decks } from './types.ts';

type NewPos = 'frame' | 'top' | 'fork' | 'rack' | 'bar' | 'seat';
type Option = { bag: Omit<BagIn, 'uid'>; tags: string[] };

/** The positions a new bag may take, in the handling order (design §3.3). Never the back, never a bottle. */
const NEW_POSITIONS: readonly NewPos[] = ['frame', 'top', 'fork', 'rack', 'bar', 'seat'];
const SLOT_ORDER = ['front', 'rear'];
const NEVER_SWAPPED = new Set<BagIn['pos']>(['bottle', 'bottleU']);

/** Panniers only when the style allows a rack, the mountain bike trails answer was not given, and the bike may have mounts (§2, §4). */
function rackAllowed(input: AdvisorInput): boolean {
  return input.style !== 'no-rack' && !input.noPanniers && input.rackMounts !== 'no';
}

/** The free positions with `bags` in place; `freed` is a bag just taken out, whose top-tube slot is free again. */
function freePositions(input: AdvisorInput, bags: BagIn[], freed: BagIn | null): { pos: NewPos; slot: string | null }[] {
  const slots = new Set(input.topSlotsFree);
  if (freed?.pos === 'top') slots.add(freed.slot ?? 'front');
  const slot = [...SLOT_ORDER.filter((s) => slots.has(s)), ...[...slots].filter((s) => !SLOT_ORDER.includes(s))][0] ?? null;
  return NEW_POSITIONS.filter((pos) => {
    if (pos === 'top') return slot !== null;
    if (pos === 'rack' && !rackAllowed(input)) return false;
    if (pos === 'frame' && input.frameShapes.length === 0) return false;
    return !bags.some((b) => b.pos === pos);
  }).map((pos) => ({ pos, slot: pos === 'top' ? slot : null }));
}

/** Every size of one position that the planner accepts, smallest first, each with its tags. */
function options(input: AdvisorInput, pos: NewPos, slot: string | null): Option[] {
  const raw: Option[] = pos === 'frame'
    ? [...input.frameShapes].sort((a, b) => a.L - b.L).map((s) => ({
      bag: { pos, shape: s.shape, L: s.L }, tags: s.source === 'measured' ? [] : [GA.advisorTagEstimate] }))
    : sizesOf(pos).map((L) => {
      const bag: Omit<BagIn, 'uid'> = { pos, L };
      if (SIZE_RANGES[pos].pair) bag.pair = true;
      if (pos === 'top' && slot !== null) bag.slot = slot;
      const tags: string[] = [];
      if (pos === 'fork') tags.push(GA.advisorTagForkMounts);
      if (pos === 'rack' && input.rackMounts === 'unknown') tags.push(GA.advisorTagRackMounts);
      return { bag, tags };
    });
  const out: Option[] = [];
  for (const o of raw) {
    const verdict = input.usable({ uid: input.nextUid, ...o.bag });
    if (!verdict.ok || verdict.band === 'unlikely') continue;
    out.push(verdict.band === 'tight' ? { bag: o.bag, tags: [...o.tags, GA.advisorTagTight] } : o);
  }
  return out;
}

function litresOf(bags: BagIn[]): number {
  return Math.round(bags.reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0) * 100) / 100;
}

function decksFor(input: AdvisorInput, add: BagIn[]): Decks {
  return input.camping && add.some((b) => b.pos === 'rack') ? { ...input.decks, rack: true } : { ...input.decks };
}

function make(input: AdvisorInput, kind: Candidate['kind'], picked: Option[], remove: number | null): Candidate {
  const add = picked.map((o, i) => ({ uid: input.nextUid + i, ...o.bag }));
  return { kind, add, remove, decks: decksFor(input, add), newBags: picked.length, litres: litresOf(add), tags: [...new Set(picked.flatMap((o) => o.tags))] };
}

const sameBag = (a: Omit<BagIn, 'uid'>, b: BagIn) =>
  a.pos === b.pos && a.L === b.L && !!a.pair === !!b.pair && a.shape === b.shape && (a.pos !== 'top' || (a.slot ?? 'front') === (b.slot ?? 'front'));

/**
 * The candidates of one phase of the search (design §3.1). `add`: one new bag (a pair is one) at a free position. `swap`, for Better
 * handling only: one of the rider's bags out (never one holding a hand placement, never a bottle), one in at any position then free.
 * `add-two`: two new bags at two different free positions, their sizes in lock step from each range's low end.
 */
export function candidates(input: AdvisorInput, phase: 'add' | 'swap' | 'add-two'): Candidate[] {
  const out: Candidate[] = [];
  if (phase === 'add') {
    for (const { pos, slot } of freePositions(input, input.bags, null)) {
      for (const o of options(input, pos, slot)) out.push(make(input, 'add', [o], null));
    }
  } else if (phase === 'swap') {
    if (input.goal !== 'handling') return out;
    for (const out1 of input.bags) {
      if (out1.hand === true || NEVER_SWAPPED.has(out1.pos)) continue;
      const rest = input.bags.filter((b) => b !== out1);
      for (const { pos, slot } of freePositions(input, rest, out1)) {
        for (const o of options(input, pos, slot)) if (!sameBag(o.bag, out1)) out.push(make(input, 'swap', [o], out1.uid));
      }
    }
  } else {
    const free = freePositions(input, input.bags, null);
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = options(input, free[i]!.pos, free[i]!.slot);
        const b = options(input, free[j]!.pos, free[j]!.slot);
        if (a.length === 0 || b.length === 0) continue;
        for (let k = 0; k < Math.max(a.length, b.length); k++) {
          out.push(make(input, 'add-two', [a[Math.min(k, a.length - 1)]!, b[Math.min(k, b.length - 1)]!], null));
        }
      }
    }
  }
  return out;
}

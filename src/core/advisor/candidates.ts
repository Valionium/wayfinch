// The Gear advisor's candidates (design §3.1; plan Task 1): what could be bought next, at every size of the size table, at the
// positions the bike has free. Whether a bag fits the bike is the planner's own bagSpec (`input.usable`), never decided here.
// The rack (the owner's ruling of 7 Nov): the setup the rider wants (bikepacking bags only, bags first, panniers fine) is a choice;
// whether a rack is fitted (the plan) and whether the frame has rack mounts (`rackMounts`) are facts, read apart.
import { GA } from '../wording/en-advisor.ts';
import { DECIDED, sizesOf, SIZE_RANGES } from './table.ts';
import type { AdvisorInput, BagIn, Candidate, Decks } from './types.ts';

type NewPos = 'frame' | 'top' | 'fork' | 'rack' | 'bar' | 'seat';
/**
 * Where a new thing can go: a position (a fork cage or a pannier as a single or as a pair; the top tube's slot), or the rack deck: on the
 * rack the plan has, or on a rack to fit.
 */
type Spot = { pos: NewPos | 'deck'; slot: string | null; pair: boolean };
/** One size at one spot. `bag` is null for the rack deck, which is no bag. */
type Option = { bag: Omit<BagIn, 'uid'> | null; tags: string[] };

/** The positions a new bag may take, in the handling order (design §3.3). Never the back, never a bottle. */
const NEW_POSITIONS: readonly NewPos[] = ['frame', 'top', 'fork', 'rack', 'bar', 'seat'];
const SLOT_ORDER = ['front', 'rear'];
const NEVER_SWAPPED = new Set<BagIn['pos']>(['bottle', 'bottleU']);
const pairable = (pos: NewPos) => pos !== 'frame' && SIZE_RANGES[pos].pair;

/** Rack mounts as the advisor reads them: anything but 'yes' or 'no' is Not sure (sub-project 11 stores Not sure as no field). */
function mountsOf(input: AdvisorInput): 'yes' | 'no' | 'unknown' {
  return input.rackMounts === 'yes' || input.rackMounts === 'no' ? input.rackMounts : 'unknown';
}

/**
 * A rack is fitted when the rider's plan has panniers or its rack deck on (the planner holds no rack without either). Read from the plan
 * as the rider has it, before the setup is applied: under Bikepacking bags only the panniers leave, the rack stays.
 */
export function rackFitted(input: AdvisorInput): boolean {
  return input.rackFitted ?? (input.bags.some((b) => b.pos === 'rack') || input.decks.rack);
}

/** Panniers may be offered: never under Bikepacking bags only, and never with no rack fitted and rack mounts no. */
export function panniersAllowed(input: AdvisorInput): boolean {
  return input.style !== 'bags' && (rackFitted(input) || mountsOf(input) !== 'no');
}

/**
 * The rack deck spot, when the trip camps and the deck is off: (a) on the rack the plan has, under any setup ("Put the tent on your
 * rack, no new bag needed"); (b) on a rack to fit, when none is fitted, the setup is not Bikepacking bags only and the rack mounts are
 * not no.
 */
function deckAllowed(input: AdvisorInput, decks: Decks): boolean {
  if (!input.camping || decks.rack) return false;
  return rackFitted(input) || (input.style !== 'bags' && mountsOf(input) !== 'no');
}

/** A rack to fit on a frame whose rack mounts are Not sure says so; a rack already fitted needs no word. */
function rackTags(input: AdvisorInput): string[] {
  return !rackFitted(input) && mountsOf(input) === 'unknown' ? [GA.advisorTagRackMounts] : [];
}

/**
 * The bag planner's small-frame caution for a seat pack, mirrored exactly: bagSpec's seat branch gives seatPackBand(fit.seatGapCm, L),
 * and only when that is null (no measured gap) and fit.size is 'XS' or 'S' sets the note "Small frames can leave little room between
 * saddle and rear tyre…" (public/tools/bags/index.html, bagSpec and seatPackBand). The note does not depend on the litres.
 */
function smallFrameSeatNote(input: AdvisorInput): boolean {
  return (input.seatGapCm === null || input.seatGapCm === undefined) && (input.frameSize === 'XS' || input.frameSize === 'S');
}

/**
 * The free spots with `bags` in place and `decks` as they are; `freed` is a bag just taken out, whose top-tube slot is free again. A fork
 * cage or a pannier comes as a single and as a pair (owner, 7 Nov). Panniers only when `panniers` (the search's round allows them) and
 * the setup and the facts do; the rack deck only when `withDeck` (never in a swap).
 */
function freeSpots(input: AdvisorInput, bags: BagIn[], freed: BagIn | null, decks: Decks, withDeck: boolean, panniers: boolean): Spot[] {
  const used = new Set(bags.filter((b) => b.pos === 'top').map((b) => b.slot ?? 'front'));
  const slots = new Set(input.topSlotsFree.filter((s) => !used.has(s)));
  if (freed?.pos === 'top') slots.add(freed.slot ?? 'front');
  const slot = [...SLOT_ORDER.filter((s) => slots.has(s)), ...[...slots].filter((s) => !SLOT_ORDER.includes(s))][0] ?? null;
  const out: Spot[] = [];
  if (withDeck && deckAllowed(input, decks)) out.push({ pos: 'deck', slot: null, pair: false });
  for (const pos of NEW_POSITIONS) {
    if (pos === 'top') { if (slot !== null) out.push({ pos, slot, pair: false }); continue; }
    if (pos === 'rack' && !(panniers && panniersAllowed(input))) continue;
    if (pos === 'frame' && input.frameShapes.length === 0) continue;
    if (bags.some((b) => b.pos === pos)) continue;
    if (pairable(pos)) out.push({ pos, slot: null, pair: false }, { pos, slot: null, pair: true });
    else out.push({ pos, slot: null, pair: false });
  }
  return out;
}

/** Every size at one spot that the planner accepts, smallest first, each with its tags; the rack deck is one option, no bag. */
function options(input: AdvisorInput, spot: Spot): Option[] {
  const { pos, slot } = spot;
  if (pos === 'deck') return [{ bag: null, tags: rackTags(input) }];
  const raw: { bag: Omit<BagIn, 'uid'>; tags: string[] }[] = pos === 'frame'
    ? [...input.frameShapes].sort((a, b) => a.L - b.L).map((s) => ({
      bag: { pos, shape: s.shape, L: s.L }, tags: s.source === 'measured' ? [] : [GA.advisorTagEstimate] }))
    : sizesOf(pos).map((L) => {
      const bag: Omit<BagIn, 'uid'> = { pos, L };
      if (spot.pair) bag.pair = true;
      if (pos === 'top' && slot !== null) bag.slot = slot;
      const tags: string[] = [];
      if (pos === 'fork' && DECIDED.forkNeedsMountsTag) tags.push(GA.advisorTagForkMounts);
      if (pos === 'rack') tags.push(...rackTags(input));
      if (pos === 'seat' && smallFrameSeatNote(input)) tags.push(GA.advisorTagSmallFrame);
      return { bag, tags };
    });
  const out: Option[] = [];
  for (const o of raw) {
    const verdict = input.usable({ uid: input.nextUid, ...o.bag });
    if (!verdict.ok) continue;
    const tags = [...o.tags];
    if (verdict.band === 'unlikely') {
      if (DECIDED.seatUnlikely === 'drop') continue;
      tags.push(GA.advisorTagUnlikely);
    }
    if (verdict.band === 'tight' && DECIDED.seatTight === 'tag') tags.push(GA.advisorTagTight);
    out.push({ bag: o.bag, tags });
  }
  return out;
}

function litresOf(bags: BagIn[]): number {
  return Math.round(bags.reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0) * 100) / 100;
}

/**
 * The rider's plan as the chosen setup reads it (the owner's ruling of 7 Nov; DECIDED.ownPanniersUnderBagsOnly): under Bikepacking bags
 * only, the rider's own panniers leave the plan, while the rack they hung from stays, its deck as the rider has it. The search runs its
 * base trial and every candidate on this, so the answer compares against that plan. Whether a rack is fitted is kept as read before.
 */
export function planAsStyled(input: AdvisorInput): AdvisorInput {
  const fitted = rackFitted(input);
  if (input.style !== 'bags' || DECIDED.ownPanniersUnderBagsOnly !== 'off' || !input.bags.some((b) => b.pos === 'rack')) {
    return input.rackFitted === fitted ? input : { ...input, rackFitted: fitted };
  }
  return { ...input, bags: input.bags.filter((b) => b.pos !== 'rack'), rackFitted: fitted };
}

/** Panniers put the rack deck on when the trip camps; the rack deck spot puts it on. */
function decksFor(input: AdvisorInput, decks: Decks, add: BagIn[], deck: boolean): Decks {
  return deck || (input.camping && add.some((b) => b.pos === 'rack')) ? { ...decks, rack: true } : { ...decks };
}

/** New things to get: a pair is two bags unless DECIDED.pairIsOneBag; a rack to fit, for its deck or for panniers, DECIDED.newRackCounts. */
function countNew(input: AdvisorInput, add: BagIn[], deck: boolean): number {
  const bags = add.reduce((n, b) => n + (b.pair && !DECIDED.pairIsOneBag ? 2 : 1), 0);
  const newRack = !rackFitted(input) && (deck || add.some((b) => b.pos === 'rack'));
  return bags + (newRack ? DECIDED.newRackCounts : 0);
}

function make(input: AdvisorInput, kind: Candidate['kind'], picked: Option[], remove: number | null): Candidate {
  const add = picked.flatMap((o) => (o.bag ? [o.bag] : [])).map((b, i) => ({ uid: input.nextUid + i, ...b }));
  const deck = picked.some((o) => o.bag === null);
  return { kind: kind === 'add' && deck ? 'deck' : kind, add, remove, decks: decksFor(input, input.decks, add, deck),
    newBags: countNew(input, add, deck), litres: litresOf(add), deck, tags: [...new Set(picked.flatMap((o) => o.tags))] };
}

const sameBag = (a: Omit<BagIn, 'uid'>, b: BagIn) =>
  a.pos === b.pos && a.L === b.L && !!a.pair === !!b.pair && a.shape === b.shape && (a.pos !== 'top' || (a.slot ?? 'front') === (b.slot ?? 'front'));

/**
 * The candidates of one phase of the search (design §3.1). `add`: one new thing at a free spot: a bag (a single or a pair), or the rack
 * deck (kind 'deck'). `swap`, for Better handling (alone or with the other goal): one of the rider's bags out (never one holding a hand placement, never a
 * bottle), one in at any position then free. `add-two`: two new things at two different free spots, their sizes in lock step from each
 * range's low end, never the deck beside panniers (they bring it when the trip camps). `panniers`: whether this round of the search
 * offers panniers at all (the setup decides; see search.ts).
 */
export function candidates(given: AdvisorInput, phase: 'add' | 'swap' | 'add-two', panniers = true): Candidate[] {
  const input = planAsStyled(given);
  const out: Candidate[] = [];
  if (phase === 'add') {
    for (const spot of freeSpots(input, input.bags, null, input.decks, true, panniers)) {
      for (const o of options(input, spot)) out.push(make(input, 'add', [o], null));
    }
  } else if (phase === 'swap') {
    if (input.goal === 'backpack') return out;   // Better handling, alone or with Get the backpack off (D)
    for (const out1 of input.bags) {
      if (out1.hand === true || NEVER_SWAPPED.has(out1.pos)) continue;
      const rest = input.bags.filter((b) => b !== out1);
      for (const spot of freeSpots(input, rest, out1, input.decks, false, panniers)) {
        for (const o of options(input, spot)) if (!sameBag(o.bag!, out1)) out.push(make(input, 'swap', [o], out1.uid));
      }
    }
  } else {
    const free = freeSpots(input, input.bags, null, input.decks, true, panniers);
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const [p, q] = [free[i]!.pos, free[j]!.pos];
        if (p === q || (p === 'deck' && q === 'rack') || (p === 'rack' && q === 'deck')) continue;
        const a = options(input, free[i]!);
        const b = options(input, free[j]!);
        if (a.length === 0 || b.length === 0) continue;
        for (let k = 0; k < Math.max(a.length, b.length); k++) {
          out.push(make(input, 'add-two', [a[Math.min(k, a.length - 1)]!, b[Math.min(k, b.length - 1)]!], null));
        }
      }
    }
  }
  return out;
}

/**
 * The sizes the planner accepts for a bag at its own spot (same position, top-tube slot, single or pair), smallest first, with their
 * tags: Looking ahead resizes its two bags with them (review of PR 61, m2). None for a frame bag (its sizes are the bike's shapes).
 */
export function sizeOptions(given: AdvisorInput, bag: BagIn): { bag: Omit<BagIn, 'uid'>; tags: string[] }[] {
  if (bag.pos === 'frame' || !(bag.pos in SIZE_RANGES)) return [];
  const spot: Spot = { pos: bag.pos as NewPos, slot: bag.pos === 'top' ? (bag.slot ?? 'front') : null, pair: !!bag.pair };
  return options(planAsStyled(given), spot).flatMap((o) => (o.bag ? [{ bag: o.bag, tags: o.tags }] : []));
}

/**
 * Looking ahead (owner, 7 Nov): Minimal's first suggestion as it stands (its removal too) plus one more thing at a spot then free: a bag,
 * a single or a pair, or the rack deck; panniers only when `panniers`, and on a rack fitted or suggested. Each has kind 'ahead'; the new
 * bag's uid follows the first's.
 */
export function extensions(given: AdvisorInput, first: Candidate, panniers = true): Candidate[] {
  const input = planAsStyled(given);
  const freed = input.bags.find((b) => b.uid === first.remove) ?? null;
  const bags = [...input.bags.filter((b) => b.uid !== first.remove), ...first.add];
  const out: Candidate[] = [];
  for (const spot of freeSpots(input, bags, freed, first.decks, true, panniers)) {
    for (const o of options(input, spot)) {
      const extra = o.bag ? [{ uid: input.nextUid + first.add.length, ...o.bag }] : [];
      const add = [...first.add, ...extra];
      // one rack at most (review of PR 61, I3): panniers beside "a rack" hang from that rack and bring its deck, so the suggestion is the
      // rack with panniers, never the rack's deck as a second thing
      const deck = (first.deck || o.bag === null) && !add.some((b) => b.pos === 'rack');
      out.push({ kind: 'ahead', add, remove: first.remove, decks: decksFor(input, first.decks, extra, o.bag === null), deck,
        newBags: countNew(input, add, deck), litres: litresOf(add), tags: [...new Set([...first.tags, ...o.tags])] });
    }
  }
  return out;
}

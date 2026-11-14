// Part names in a step's text that open the bike view (care pictures design of 7 November 2026, section 4.2; bike view design of 9
// November 2026, 2.1): for each roadside card and Care task, per step, the words that name a part and the part they open. Taken from this
// data, never guessed from the text, so a test checks each word is in its step and each part is in the guide. Every part a step names is
// a link at its first mention (the owner's wish: "every part name is a link"; the limit of three a step is gone).
import type { PartId } from './guide.ts';

type L = readonly (readonly [string, PartId])[];
const none: L = [];

/**
 * Every roadside card and Care task, per step: the words that name a part and the part they open, in the order a word takes its mention
 * (see linkSegments). The bike view (design of 9 November 2026, 2.1): every part a step names is linked at its first mention.
 */
export const STEP_PARTS: Readonly<Record<string, readonly L[]>> = {
  'puncture-tube': [[['wheel', 'wheel'], ['disc brakes', 'caliper'], ['brake lever', 'brake-lever']], [['tyre bead', 'bead'], ['rim', 'rim'], ['tube', 'tube'], ['tyre', 'tyre'], ['spoke', 'spokes']], [['tube', 'tube']], [['tyre', 'tyre'], ['tube', 'tube'], ['rim', 'rim']], none, [['tyre', 'tyre'], ['rim', 'rim']], [['tube', 'tube'], ['valve', 'valve'], ['bead', 'bead'], ['rim', 'rim'], ['tyre', 'tyre'], ['Disc brakes', 'caliper'], ['disc', 'disc'], ['pads', 'pads'], ['wheel', 'wheel']]],
  'puncture-tubeless': [none, none, none, none, none, [['spare tube', 'tube'], ['tubeless valve', 'tubeless-valve']], none],
  'chain-broken': [none, [['quick link', 'quick-link'], ['chain', 'chain']], none, [['rear gears', 'cassette']], none, none],
  'spoke-snapped': [[['spoke', 'spokes'], ['hub', 'hub']], [['Rim brakes', 'rim-brake'], ['rim', 'rim'], ["brake's quick release", 'brake-qr']], [['Disc brakes', 'caliper'], ['rim', 'rim'], ['frame', 'frame'], ['fork', 'fork']], none, [["brake's quick release", 'brake-qr'], ['Rim brakes', 'rim-brake']]],
  'brake-rub-rim': [[['dropouts', 'dropouts'], ["wheel's quick release", 'wheel-qr']], [['tyre bead', 'bead']], [['pad', 'pads'], ['tyre', 'tyre'], ['spokes', 'spokes']], [['brake', 'rim-brake']], [['Hydraulic rim brakes', 'rim-brake']], [["brake's quick release", 'brake-qr']], [["brake's quick release", 'brake-qr']]],
  'brake-rub-disc': [[['thru-axle', 'thru-axle'], ["wheel's quick release", 'wheel-qr'], ['dropouts', 'dropouts']], [['pad', 'pads']], [['caliper', 'caliper'], ['lever', 'brake-lever']], [['caliper', 'caliper']], [['pad adjuster', 'pad-adjuster'], ['pad', 'pads'], ['disc', 'disc']]],
  'brake-weak-rim': [[['rim', 'rim'], ['pads', 'pads']], [["brake's quick release", 'brake-qr']], [['barrel adjuster', 'barrel']], [['pads', 'pads'], ['rim', 'rim']], [['pads', 'pads']]],
  'brake-weak-disc': [[['lever', 'brake-lever'], ['pads', 'pads']], [['disc', 'disc'], ['pads', 'pads']], [['pad adjuster', 'pad-adjuster'], ['barrel adjuster', 'barrel']], [['lever', 'brake-lever']], none],
  'gears-skipping': [[['stiff link', 'chain']], [['barrel adjuster', 'barrel']], none, none],
  'bolt-loose': [none, none, none, none],
  'tyre-torn': [[['tube', 'tube'], ['tubeless valve', 'tubeless-valve']], none, [['tube', 'tube']], none],
  'ebike-no-power': [[['battery', 'battery']], [['contacts', 'battery']], [['battery', 'battery'], ['remote', 'display'], ['top tube', 'frame']], [['display', 'display'], ['remote', 'display']], none],
  'brakes-lever-test': [[['lever', 'brake-lever']], [['lever', 'brake-lever']], none, [['Rim brakes', 'rim-brake'], ['pads', 'pads'], ['rim', 'rim']]],
  'ebike-charge-indoors': [[['battery', 'battery']], none, none, none],
  'frame-wash': [none, none, none, [['chain', 'chain']]],
  'chain-dry-lube': [[['chain', 'chain']], [['chain', 'chain'], ['rear derailleur', 'derailleur']], none, [['rear gears', 'cassette'], ['chainrings', 'chainring']], [['derailleur', 'derailleur']], [['brake discs', 'disc'], ['rims', 'rim']]],
  'belt-rinse': [none, none, none],
  'brakes-rotor-wipe': [[['pads', 'pads']], [['disc', 'disc']], none],
  'brakes-rim-wipe': [[['rim', 'rim']], [['pads', 'pads']], [['rims', 'rim'], ['pad', 'pads']], none],
  'ebike-dry-contacts': [[['battery', 'battery']], [['battery', 'battery']], none],
  'tyres-pressure': [[['tyre', 'tyre']], [['tyre', 'tyre']], none, none, none, [['tyre', 'tyre'], ['rim', 'rim'], ['tube', 'tube']]],
  'gears-shift-test': [none, none, none],
  'chain-wear-check': [[['chainring', 'chainring'], ['rear gear', 'cassette'], ['chain', 'chain']], [['chain', 'chain']], [['chain', 'chain']], [['chain', 'chain']]],
  'brakes-pads-disc': [[['caliper', 'caliper']], [['pad', 'pads']], [['pads', 'pads']], [['lever', 'brake-lever'], ['pads', 'pads']], [['pad', 'pads'], ['lever', 'brake-lever'], ['caliper', 'caliper']]],
  'brakes-pads-rim': [[['pad', 'pads']], [['rim', 'rim'], ['pad', 'pads']], [['pad', 'pads'], ['rim', 'rim'], ['tyre', 'tyre'], ['spokes', 'spokes']], [['rim', 'rim']], none, [['pads', 'pads'], ['rim', 'rim'], ['tyre', 'tyre']]],
  'wheels-spokes-check': [[['spokes', 'spokes']], [['rim', 'rim'], ['frame', 'frame']], [['frame', 'frame']], [['rim', 'rim']], none],
  'frame-bolts-check': [[['stem', 'stem'], ['handlebar', 'handlebar'], ['seatpost clamp', 'seatpost'], ['crank', 'chainring'], ['wheel quick releases', 'wheel-qr']], [['handlebar', 'handlebar'], ['stem', 'stem'], ['seatpost', 'seatpost']], [['handlebar', 'handlebar'], ['stem', 'stem']], [['bar', 'handlebar']], [['crank', 'chainring']], none],
  'gears-electronic-battery': [none, none, none],
  'frame-headset-check': [[['bar', 'handlebar'], ['headset', 'headset']], [['headset', 'headset']], [['bars', 'handlebar']], none],
  'gears-cables-look': [[['cable and casing', 'gear-cable'], ['frame', 'frame']], none, [['cable and casing', 'gear-cable']]],
  'chain-lube': [[['chain', 'chain']], [['chain', 'chain'], ['rear derailleur', 'derailleur']], none, [['rear gears', 'cassette'], ['chainrings', 'chainring']], [['derailleur', 'derailleur']], [['brake discs', 'disc'], ['rims', 'rim']]],
  'tyres-sealant-check': [none, [['valve core', 'tubeless-valve']], none, none],
  'belt-inspect': [none, none, none],
  'ebike-battery-care': [none, none, none],
  'susp-wipe-stanchions': [[['fork tubes', 'stanchions']], none, none],
  'susp-air-pressure': [none, [['fork', 'fork']], [['fork', 'fork']], none, none],
  'gears-cassette-wear': [[['chain', 'chain']], [['chain', 'chain']], [['rear gears', 'cassette'], ['chainrings', 'chainring']], [['chainrings', 'chainring'], ['chain', 'chain']], [['chain', 'chain'], ['rear gears', 'cassette'], ['rings', 'chainring']]],
  'wheels-hubs-check': [[['rim', 'rim']], [['frame', 'frame'], ['hubs', 'hub']], none, [['hub', 'hub']], [['dropouts', 'dropouts'], ["wheel's quick release", 'wheel-qr']]],
  'brakes-rotor-thickness': [[['disc', 'disc']], [['brake caliper', 'caliper']], [['disc', 'disc']], [['discs', 'disc']]],
  'tyres-sealant-topup': [[['valve core', 'tubeless-valve']], none, none, [['tyre', 'tyre']]],
  'susp-lowers-service': [none, none, [['fork', 'fork']]],
  'gears-hub-oil': [[['hub gears', 'hub-gears']], none, none],
  'gears-cables-replace': [[['derailleur', 'derailleur']], none, [['cable and casing', 'gear-cable']], none],
  'susp-fork-service': [none, none, none, none],
  'susp-shock-service': [none, none, none, none, none],
  'ebike-service': [none, none, none, none, none],
  'brakes-cable-disc-service': [none, [['pads', 'pads'], ['pad adjuster', 'pad-adjuster'], ['barrel adjuster', 'barrel']], [['caliper', 'caliper'], ['lever', 'brake-lever']], none],
  'belt-tension': [none, none, [['frame', 'frame'], ['hub', 'hub']]],
  'frame-torque-check': [none, [['stem', 'stem'], ['handlebar', 'handlebar'], ['seatpost', 'seatpost']], none, [['disc', 'disc']]],
  'wheels-true-tension': [[['fork', 'fork'], ['frame', 'frame']], [['rim', 'rim']], [['spokes', 'spokes']], [['spokes', 'spokes']], [['spoke', 'spokes']], [['rim', 'rim'], ['spokes', 'spokes']]],
  'brakes-hydraulic-bleed': [[['lever', 'brake-lever'], ['caliper', 'caliper']], none, none],
  'brakes-squeal': [[['pads', 'pads'], ['disc', 'disc']], [['pads', 'pads']], [['caliper', 'caliper'], ['disc', 'disc']], [['rim', 'rim'], ['pads', 'pads']], none],
  'brakes-spongy': [[['pads', 'pads']], none, none],
  'brakes-hydro-rim-spongy': [[['pads', 'pads']], [['rim', 'rim'], ['pads', 'pads']], none, none],
  'chain-replace': [[['chain', 'chain'], ['chainring', 'chainring'], ['rear gear', 'cassette']], [['chain', 'chain'], ['chainring', 'chainring'], ['rear gear', 'cassette'], ['rear derailleur', 'derailleur']], [['quick link', 'quick-link']], [['stiff link', 'chain'], ['rear gears', 'cassette']], none],
  'chain-deep-clean': [[['chain', 'chain'], ['quick link', 'quick-link']], [['chain', 'chain'], ['chainrings', 'chainring'], ['brake discs', 'disc'], ['pads', 'pads'], ['rims', 'rim']], none, [['chain', 'chain']], [['chain', 'chain']]],
  'gears-indexing': [[['rear gear', 'cassette'], ['barrel adjuster', 'barrel'], ['chain', 'chain']], [['hanger', 'hanger']], none, [['cassette', 'cassette'], ['jockey wheel', 'derailleur']], [['rear gear', 'cassette'], ['jockey wheel', 'derailleur']], [['derailleur', 'derailleur']]],
  'gears-electronic-adjust': [none, none, [['hanger', 'hanger']], [['rear derailleur', 'derailleur']], none],
  'wheels-wobble': [[['dropouts', 'dropouts']], [['tyre bead', 'bead'], ['rim', 'rim']], [['spoke', 'spokes']], [['rim', 'rim']], [['spoke', 'spokes'], ['rim', 'rim']]],
  'tyres-replace': [[['tyre', 'tyre'], ['tube', 'tube'], ['valve', 'valve']], [['tyre', 'tyre'], ['rim', 'rim'], ['bead', 'bead']], [['tube', 'tube'], ['valve', 'valve'], ['rim', 'rim']], [['valve', 'valve'], ['tube', 'tube']], [['tyre', 'tyre'], ['tube', 'tube'], ['bead', 'bead']], [['dropouts', 'dropouts'], ["wheel's quick release", 'wheel-qr']]],
  'frame-creak': [[['crank', 'chainring'], ['seatpost', 'seatpost']], [['seatpost', 'seatpost'], ['frame', 'frame']], none],
  'ebike-range-drop': [[['tyre', 'tyre']], [['battery', 'battery']], none, [['battery', 'battery']]],
};

/**
 * The parts a rider touches first for a card, which lead its parts in the bike view and on its "What is it, where is it?" line (the
 * owner's ruling of 14 November 2026: the puncture card starts with the wheel, the tyre and the tube, not the disc caliper its warning
 * names first); the wheel is the guide's own part (the owner's second ruling that day). Only parts the card's shown steps name; a card not
 * listed keeps the text's order.
 */
export const FIRST_PARTS: Readonly<Record<string, readonly PartId[]>> = {
  'puncture-tube': ['wheel', 'tyre', 'tube'],
};

/**
 * A card's parts, for the bike view: each part its shown steps name (`texts`, the card's steps), its first parts (FIRST_PARTS) first,
 * the rest in the order the text first names them.
 */
export function cardParts(id: string, texts: readonly string[], shown: readonly number[]): PartId[] {
  const steps = STEP_PARTS[id] ?? [];
  const named = [...new Set(shown.flatMap((i) => linkSegments(texts[i] ?? '', steps[i] ?? []).flatMap((s) => (typeof s === 'string' ? [] : [s.part]))))];
  const first = (FIRST_PARTS[id] ?? []).filter((p) => named.includes(p));
  return [...first, ...named.filter((p) => !first.includes(p))];
}

export type Segment = string | { text: string; part: PartId };

// A hyphen joins words: "disc" in "disc-brake cleaner" is part of a product's name (review of PR 107, M4).
const isWordChar = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9-]/.test(c);

/**
 * A step's text cut at each linked word, in the text's order. Each word, in the list's order, takes its first mention that stands as a
 * word of its own ("chain", not the start of "chainring") and does not overlap a word taken before it; a word with no such mention is
 * left as text.
 */
export function linkSegments(text: string, links: L): Segment[] {
  const taken: { at: number; end: number; word: string; part: PartId }[] = [];
  for (const [word, part] of links) {
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
      const end = at + word.length;
      if (isWordChar(text[at - 1]) || isWordChar(text[end])) continue;
      if (taken.some((t) => at < t.end && end > t.at)) continue;
      taken.push({ at, end, word, part });
      break;
    }
  }
  taken.sort((a, b) => a.at - b.at);
  const out: Segment[] = [];
  let from = 0;
  for (const f of taken) {
    if (f.at > from) out.push(text.slice(from, f.at));
    out.push({ text: f.word, part: f.part });
    from = f.end;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

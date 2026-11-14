// The parts' short names (bike view design of 9 November 2026, 2.2 and 2.4): the words on the bike view's labels and its part buttons,
// and on the second line of a card's "What is it, where is it?" button. The guide's full names and words stay in en-parts.json. Under
// the banned-words test (tests/unit/core/parts/view.test.ts).
import type { PartId } from '../parts/guide.ts';

export const PART_SHORT: Readonly<Record<PartId, string>> = {
  frame: 'Frame', fork: 'Fork', headset: 'Headset', stem: 'Stem', handlebar: 'Handlebar', seatpost: 'Seatpost',
  wheel: 'Wheel', hub: 'Hub', 'wheel-qr': 'Wheel quick release', 'thru-axle': 'Thru-axle', spokes: 'Spokes', rim: 'Rim', dropouts: 'Dropouts',
  tyre: 'Tyre', bead: 'Tyre bead', tube: 'Inner tube', valve: 'Valve', 'tubeless-valve': 'Tubeless valve',
  'brake-lever': 'Brake lever', 'rim-brake': 'Rim brake', pads: 'Brake pads', 'brake-qr': 'Brake quick release', barrel: 'Barrel adjuster',
  caliper: 'Disc caliper', disc: 'Brake disc', 'pad-adjuster': 'Pad adjuster',
  chain: 'Chain', 'quick-link': 'Quick link', chainring: 'Chainring', cassette: 'Rear gears', derailleur: 'Rear derailleur',
  hanger: 'Derailleur hanger', 'gear-cable': 'Gear cable', 'hub-gears': 'Hub gears',
  battery: 'Battery', display: 'Display', stanchions: 'Fork legs',
};

/** A card's parts as one line: "Tyre, tyre bead, inner tube". */
export const partsLine = (parts: readonly PartId[]): string =>
  parts.map((p, i) => (i === 0 ? PART_SHORT[p] : PART_SHORT[p].charAt(0).toLowerCase() + PART_SHORT[p].slice(1))).join(', ');

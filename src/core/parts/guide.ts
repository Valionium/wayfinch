// The parts guide (care pictures design of 7 November 2026, section 4; the owner's answers 1, 6, 7 and 8 of 8 November): the 36 parts the
// cards name, as data that belongs to no one screen, so a later "how a bike works" shows the same entries. Each part's words are in
// src/core/wording/en-parts.ts, its point on the rider's bike in src/core/bike/part-points.ts, its close-ups in src/tools/care/parts/.
import type { Bars } from '../bike/normalise.ts';
import type { PartPlace } from '../bike/part-points.ts';

export type PartId = PartPlace;
export type PartGroup = 'steering' | 'wheels' | 'tyres' | 'brakes' | 'drive' | 'ebike';
/** Where a part is on some bikes only: shown as a tag on its entry ("rim brakes"). */
export type PartTag = 'rim' | 'disc' | 'cable-disc' | 'tubeless' | 'derailleur' | 'hub-gears' | 'ebike' | 'suspension';

export type GuidePart = {
  id: PartId; group: PartGroup; tag?: PartTag;
  /** Its close-ups: one, or two that depend on the bike, the drop-bar (or rim-brake) one first. */
  pictures: readonly string[]; by?: 'bars' | 'brakes';
  /** What a beginner would confuse it with (design 4.1). */
  mixed: readonly PartId[];
};

const g = (id: PartId, group: PartGroup, pictures: string[], mixed: PartId[] = [], tag?: PartTag, by?: GuidePart['by']): GuidePart =>
  ({ id, group, pictures, mixed, ...(tag ? { tag } : {}), ...(by ? { by } : {}) });

export const GUIDE: readonly GuidePart[] = [
  g('frame', 'steering', ['pg-frame']),
  g('fork', 'steering', ['pg-fork'], ['stanchions']),
  g('headset', 'steering', ['pg-headset'], ['stem']),
  g('stem', 'steering', ['pg-stem'], ['headset']),
  g('handlebar', 'steering', ['pg-bar-drop', 'pg-bar-flat'], [], undefined, 'bars'),
  g('seatpost', 'steering', ['pg-seatpost']),
  g('hub', 'wheels', ['pg-hub'], ['hub-gears']),
  g('wheel-qr', 'wheels', ['pg-wheel-qr'], ['brake-qr', 'thru-axle']),
  g('thru-axle', 'wheels', ['pg-thru-axle'], ['wheel-qr']),
  g('spokes', 'wheels', ['pg-spokes']),
  g('rim', 'wheels', ['pg-rim'], ['bead']),
  g('dropouts', 'wheels', ['pg-dropout'], ['hanger']),
  g('tyre', 'tyres', ['pg-tyre'], ['tube']),
  g('bead', 'tyres', ['pg-bead'], ['rim']),
  g('tube', 'tyres', ['pg-tube'], ['tyre']),
  g('valve', 'tyres', ['pg-valves'], ['tubeless-valve']),
  g('tubeless-valve', 'tyres', ['pg-tubeless-valve'], ['valve'], 'tubeless'),
  g('brake-lever', 'brakes', ['pg-lever-drop', 'pg-lever-flat'], [], undefined, 'bars'),
  g('rim-brake', 'brakes', ['pg-caliper-rim', 'pg-vbrake'], ['caliper'], 'rim', 'bars'),
  g('pads', 'brakes', ['pg-pads-rim', 'pg-pads-disc'], [], undefined, 'brakes'),
  g('brake-qr', 'brakes', ['brake-qr-open', 'vbrake-open'], ['wheel-qr'], 'rim', 'bars'),
  g('barrel', 'brakes', ['barrel-adjuster'], ['pad-adjuster']),
  g('caliper', 'brakes', ['pg-disc-caliper'], ['disc', 'rim-brake'], 'disc'),
  g('disc', 'brakes', ['pg-disc'], ['caliper'], 'disc'),
  g('pad-adjuster', 'brakes', ['disc-pad-adjust'], ['barrel'], 'cable-disc'),
  g('chain', 'drive', ['pg-chain'], ['quick-link']),
  g('quick-link', 'drive', ['quick-link'], ['chain']),
  g('chainring', 'drive', ['pg-chainring'], ['cassette']),
  g('cassette', 'drive', ['pg-cassette'], ['chainring'], 'derailleur'),
  g('derailleur', 'drive', ['pg-derailleur'], ['hanger'], 'derailleur'),
  g('hanger', 'drive', ['pg-hanger'], ['derailleur', 'dropouts'], 'derailleur'),
  g('gear-cable', 'drive', ['pg-gear-cable']),
  g('hub-gears', 'drive', ['pg-hub-gears'], ['hub'], 'hub-gears'),
  g('battery', 'ebike', ['battery-refit', 'battery-contacts'], [], 'ebike'),
  g('display', 'ebike', ['pg-display'], [], 'ebike'),
  g('stanchions', 'ebike', ['pg-stanchions'], ['fork'], 'suspension'),
];

export const partById = (id: string): GuidePart | undefined => GUIDE.find((p) => p.id === id);

/**
 * A part's close-ups for the rider's bike, in order: where they depend on the bars or the brakes, the one matching the bike first, the
 * other beside it (the owner's answer 1: both close-ups, the matching one first); untold, the drop-bar or rim-brake one first.
 */
export function guidePictures(part: GuidePart, bars: Bars | null, brakes: 'rim' | 'disc' | 'none' | null): string[] {
  const [a, b] = part.pictures;
  if (!part.by || b === undefined) return [...part.pictures];
  const second = part.by === 'bars' ? bars === 'flat' : brakes === 'disc';
  return second ? [b, a!] : [a!, b];
}

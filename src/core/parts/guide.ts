// The parts guide (care pictures design of 7 November 2026, section 4; the owner's answers 1, 6, 7 and 8 of 8 November): the 36 parts the
// cards name and the wheel (the owner's ruling of 14 November 2026), as data that belongs to no one screen, so a later "how a bike works" shows the same entries. Each part's words are in
// src/core/wording/en-parts.ts, its point on the rider's bike in src/core/bike/part-points.ts, its close-ups in src/tools/care/parts/.
import { kindOrder, type PictureDetails } from '../care/pictures.ts';
import type { PartPlace } from '../bike/part-points.ts';

export type PartId = PartPlace;
export type PartGroup = 'steering' | 'wheels' | 'tyres' | 'brakes' | 'drive' | 'ebike';
/** Where a part is on some bikes only: shown as a tag on its entry ("rim brakes"). */
export type PartTag = 'rim' | 'disc' | 'cable-disc' | 'tubeless' | 'derailleur' | 'hub-gears' | 'ebike' | 'suspension';

export type GuidePart = {
  id: PartId; group: PartGroup; tag?: PartTag;
  /**
   * Its close-ups: one, or one for each kind where they depend on the bike (bars: drop, flat; brakes: rim, disc; rim-brake: caliper,
   * V-brake, hydraulic; axle: thru, then a quick release or nuts). None while they are not yet redrawn (care pictures redo, owner's
   * answer 6 of 9 November 2026).
   */
  pictures: readonly string[]; by?: 'bars' | 'brakes' | 'rim-brake' | 'axle';
  /** What a beginner would confuse it with (design 4.1). */
  mixed: readonly PartId[];
};

const g = (id: PartId, group: PartGroup, pictures: string[], mixed: PartId[] = [], tag?: PartTag, by?: GuidePart['by']): GuidePart =>
  ({ id, group, pictures, mixed, ...(tag ? { tag } : {}), ...(by ? { by } : {}) });

export const GUIDE: readonly GuidePart[] = [
  g('frame', 'steering', []),
  g('fork', 'steering', ['pg-fork'], ['stanchions']),
  g('headset', 'steering', ['pg-headset'], ['stem']),
  g('stem', 'steering', ['pg-stem'], ['headset']),
  g('handlebar', 'steering', ['pg-bar-drop', 'pg-bar-flat'], [], undefined, 'bars'),
  g('seatpost', 'steering', []),
  g('wheel', 'wheels', [], ['rim']),
  g('hub', 'wheels', ['pg-hub'], ['hub-gears']),
  g('wheel-qr', 'wheels', ['pg-wheel-qr'], ['brake-qr', 'thru-axle']),
  g('thru-axle', 'wheels', ['pg-thru-axle'], ['wheel-qr']),
  g('spokes', 'wheels', ['pg-spokes']),
  g('rim', 'wheels', ['pg-rim'], ['bead', 'wheel']),
  g('dropouts', 'wheels', ['pg-dropout-thru', 'pg-dropout-qr'], ['hanger'], undefined, 'axle'),
  g('tyre', 'tyres', ['pg-tyre'], ['tube']),
  g('bead', 'tyres', ['pg-bead'], ['rim']),
  g('tube', 'tyres', ['pg-tube'], ['tyre']),
  g('valve', 'tyres', ['pg-valves'], ['tubeless-valve']),
  g('tubeless-valve', 'tyres', ['pg-tubeless-valve'], ['valve'], 'tubeless'),
  g('brake-lever', 'brakes', ['pg-lever-drop', 'pg-lever-flat'], [], undefined, 'bars'),
  g('rim-brake', 'brakes', ['pg-caliper-rim', 'pg-vbrake', 'pg-rim-hydraulic'], ['caliper'], 'rim', 'rim-brake'),
  g('pads', 'brakes', ['pg-pads-rim', 'pg-pads-disc'], [], undefined, 'brakes'),
  g('brake-qr', 'brakes', ['brake-qr-open', 'vbrake-open', 'hydro-rim-open'], ['wheel-qr'], 'rim', 'rim-brake'),
  g('barrel', 'brakes', ['barrel-caliper', 'barrel-vbrake'], ['pad-adjuster'], undefined, 'rim-brake'),
  g('caliper', 'brakes', ['pg-disc-caliper'], ['disc', 'rim-brake'], 'disc'),
  g('disc', 'brakes', ['pg-disc'], ['caliper'], 'disc'),
  g('pad-adjuster', 'brakes', ['disc-pad-adjust'], ['barrel'], 'cable-disc'),
  g('chain', 'drive', ['pg-chain'], ['quick-link']),
  g('quick-link', 'drive', ['quick-link'], ['chain']),
  g('chainring', 'drive', ['pg-chainring-1x', 'pg-chainring-2x'], ['cassette']),
  g('cassette', 'drive', ['pg-cassette'], ['chainring'], 'derailleur'),
  g('derailleur', 'drive', ['pg-derailleur'], ['hanger'], 'derailleur'),
  g('hanger', 'drive', ['pg-hanger'], ['derailleur', 'dropouts'], 'derailleur'),
  g('gear-cable', 'drive', ['pg-gear-cable']),
  g('hub-gears', 'drive', ['pg-hub-gears'], ['hub'], 'hub-gears'),
  g('battery', 'ebike', ['battery-in-tube', 'battery-contacts'], [], 'ebike'),
  g('display', 'ebike', ['pg-display'], [], 'ebike'),
  g('stanchions', 'ebike', [], ['fork'], 'suspension'),
];

export const partById = (id: string): GuidePart | undefined => GUIDE.find((p) => p.id === id);

/**
 * A part's close-ups for the rider's bike, in order, two at most side by side (owner's answer 1 of 8 November): where they depend on the
 * bike, the one matching it first, then the next kind; not told, the most common modern kind first (care pictures redo, section 2): a disc
 * brake's pads before a rim brake's, a road caliper before a V-brake unless flat bars break the tie, a thru-axle's closed dropout before a
 * slot unless the axle is a quick release or nuts (or not told on rim brakes). Kinds with no close-up (nuts share the slot) are passed over.
 */
export function guidePictures(part: GuidePart, d: PictureDetails): string[] {
  const p = part.pictures;
  if (!part.by || p.length < 2) return [...p];
  const order = part.by === 'rim-brake' ? kindOrder('rim-brake', d).map((k) => ['caliper', 'v-brake', 'hydraulic'].indexOf(k))
    : part.by === 'bars' ? kindOrder('bars', d).map((k) => ['drop', 'flat'].indexOf(k))
      : part.by === 'axle' ? kindOrder('axle', d).map((k) => (k === 'thru' ? 0 : 1))
      : d.brakes === 'rim' ? [0, 1] : [1, 0];
  return [...new Set(order.flatMap((i) => (p[i] ? [p[i]] : [])))].slice(0, 2);
}

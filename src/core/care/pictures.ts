// Which drawing shows with which step (care pictures design of 7 November 2026, sections 2 and 5; the redo of 9 November, section 2, the
// owner's answers 1, 2 and 4). Pure data: a card's or task's id to one entry per step: a picture's id, a choice among kinds by the bike
// detail that decides it, or null. A step with null, or a card not listed, shows its text alone: a card whose pictures are not yet redrawn
// is not listed (answer 6). Each id is a file src/tools/care/pictures/<id>.svg, made by tools/care-art, with its words in
// src/core/wording/en-care-pictures.ts (BC-PIC-FILES).
import type { Bars, BikeRecord } from '../bike/normalise.ts';
import { careDetails } from './fit.ts';
import type { CareDetails } from './types.ts';

export type RimKind = 'caliper' | 'v-brake' | 'hydraulic';
export type AxleKind = 'thru' | 'qr' | 'nuts';
/** A picture whose kind depends on the bike: the kinds that have a drawing, by the detail that decides among them. */
export type Kinds =
  | { by: 'rim-brake'; pictures: Partial<Record<RimKind, string>> }
  | { by: 'axle'; pictures: Partial<Record<AxleKind, string>> }
  | { by: 'bars'; pictures: Partial<Record<'drop' | 'flat', string>> }
  | { by: 'shifting'; pictures: { cable: string } }
  | { by: 'brakes'; pictures: { 'hydraulic-disc': string } }
  | { by: 'battery'; pictures: { 'in-tube': string; 'on-tube': string } };
export type StepPicture = string | Kinds | null;
/** The bike details that choose a picture's kind; null is Not sure (or no bike). */
export type PictureDetails = {
  brakes: CareDetails['brakes']; rimBrake: RimKind | null; axle: AxleKind | null; shifting: CareDetails['shifting']; bars: Bars | null;
};
/**
 * One picture to show, with its kind ('caliper', 'thru', …) where it is one of several; the first of a step's list is shown. `assumed`:
 * a picture drawn for one kind only (a hydraulic disc's pad spacer, cable gears' barrel), shown while the bike's detail that decides it
 * is Not sure, so the step says which kind it is for (live-site sweep of 14 November 2026, item 46).
 */
export type Shown = { id: string; kind: string | null; assumed?: true };

/** The brake's quick release, by the kind of rim brake (redo, answer 2): only on rim-brake steps, never on a disc brake's. */
const RIM_OPEN: Kinds = { by: 'rim-brake', pictures: { caliper: 'brake-qr-open', 'v-brake': 'vbrake-open', hydraulic: 'hydro-rim-open' } };
const RIM_CLOSE: Kinds = { by: 'rim-brake', pictures: { caliper: 'brake-qr-close', 'v-brake': 'vbrake-close', hydraulic: 'hydro-rim-close' } };
/** Centring a rim brake (T10): a road caliper's centring screw, a V-brake's spring screw; a hydraulic rim brake has none. */
const RIM_CENTRE: Kinds = { by: 'rim-brake', pictures: { caliper: 'rim-centre-caliper', 'v-brake': 'rim-centre-vbrake' } };
/** With the wheel out, a pad spacer in a hydraulic disc brake (T1): only for hydraulic disc brakes, and when the brakes are not told. */
const PAD_SPACER: Kinds = { by: 'brakes', pictures: { 'hydraulic-disc': 'pad-spacer' } };
/** The wheel pushed fully into the fork's ends and tightened, by the axle (redo, answer 1). */
const WHEEL_SEAT: Kinds = { by: 'axle', pictures: { thru: 'wheel-seat-thru', qr: 'wheel-seat-qr', nuts: 'wheel-seat-nuts' } };
/** A brake's barrel adjuster unscrewed (T15): a road caliper's on the brake, a V-brake's on its lever; a hydraulic rim brake has none. */
const BRAKE_BARREL: Kinds = { by: 'rim-brake', pictures: { caliper: 'barrel-caliper', 'v-brake': 'barrel-vbrake' } };
/** The gears' barrel adjuster at the rear derailleur (T17): cable gears only; electronic gears have no cable. */
const GEARS_BARREL: Kinds = { by: 'shifting', pictures: { cable: 'gears-barrel' } };
/** The twist test (batch 4): its second panel presses on the bar the bike has, a drop bar's hood or a flat bar's grip. */
const TWIST: Kinds = { by: 'bars', pictures: { drop: 'twist-test-drop', flat: 'twist-test-flat' } };
/** Refitting the battery (T19): no bike detail says where it sits, so in the down tube (the modern default) first, on it one tap away. */
const BATTERY: Kinds = { by: 'battery', pictures: { 'in-tube': 'battery-in-tube', 'on-tube': 'battery-on-tube' } };

export const STEP_PICTURES: Readonly<Record<string, readonly StepPicture[]>> = {
  'puncture-tube': [PAD_SPACER, 'tyre-levers', null, 'pinch-slits', 'patch-press', null, null],
  'puncture-tubeless': [null, null, 'tubeless-plug', null, null, null, null],
  'tyre-torn': [null, 'tyre-boot', null, null],
  'spoke-snapped': ['spoke-wrap', RIM_OPEN, null, null, RIM_CLOSE],
  'brake-rub-rim': [WHEEL_SEAT, null, null, RIM_CENTRE, RIM_OPEN, RIM_CLOSE],
  'brake-rub-disc': [WHEEL_SEAT, 'pad-gap', 'disc-bolts', null, null],
  'brake-weak-rim': [null, RIM_CLOSE, BRAKE_BARREL, null, null],
  'brake-weak-disc': [null, null, 'disc-pad-adjust', null, null],
  'chain-broken': [null, 'quick-link', null, 'stiff-link', null, null],
  'gears-skipping': ['stiff-link', GEARS_BARREL, null, null],
  'bolt-loose': [null, null, TWIST, null],
  'ebike-no-power': [BATTERY, 'battery-contacts', null, null, null],
};

/** Every picture id an entry can show. */
export const idsOf = (entry: StepPicture): string[] =>
  entry === null ? [] : typeof entry === 'string' ? [entry] : Object.values(entry.pictures).filter((id): id is string => typeof id === 'string');

const RIM_ORDER: readonly RimKind[] = ['caliper', 'v-brake', 'hydraulic'];
const AXLE_ORDER: readonly AxleKind[] = ['thru', 'qr', 'nuts'];
const lead = <T>(order: readonly T[], first: T): T[] => [first, ...order.filter((k) => k !== first)];

/**
 * The kinds in the order they show for a bike: its own first when told; when not, the most common modern one first (redo, section 2).
 * A rim brake's kind not told: bars break the tie inside rim brakes, since drop-bar levers cannot pull V-brakes (answer 2). An axle not
 * told: a thru-axle, but a quick release on rim brakes. Electronic gears have no cable to adjust: no picture. A pad spacer is for
 * hydraulic disc brakes only (shown too while the brakes are not told). No detail tells where a battery sits: in the down tube first.
 */
export function kindOrder(by: Kinds['by'], d: PictureDetails): string[] {
  if (by === 'rim-brake') return d.rimBrake ? lead(RIM_ORDER, d.rimBrake) : d.bars === 'flat' ? lead(RIM_ORDER, 'v-brake') : [...RIM_ORDER];
  if (by === 'axle') return d.axle ? lead(AXLE_ORDER, d.axle) : d.brakes === 'rim' ? lead(AXLE_ORDER, 'qr') : [...AXLE_ORDER];
  if (by === 'bars') return d.bars === 'flat' ? ['flat', 'drop'] : ['drop', 'flat'];
  if (by === 'battery') return ['in-tube', 'on-tube'];
  if (by === 'brakes') return d.brakes === null || d.brakes === 'hydraulic-disc' ? ['hydraulic-disc'] : [];
  return d.shifting === 'electronic' ? [] : ['cable'];
}

/** The pictures of a card's or task's step (0-based) for a bike, in order: the first is shown, the others are one tap away. */
export function picturesFor(id: string, step: number, d: PictureDetails): Shown[] {
  const entry = STEP_PICTURES[id]?.[step] ?? null;
  if (entry === null) return [];
  if (typeof entry === 'string') return [{ id: entry, kind: null }];
  const pics = entry.pictures as Partial<Record<string, string>>;
  const assumed = (entry.by === 'brakes' && d.brakes === null) || (entry.by === 'shifting' && d.shifting === null);
  return kindOrder(entry.by, d).flatMap((kind): Shown[] => {
    const id = pics[kind];
    return id ? [assumed ? { id, kind, assumed: true } : { id, kind }] : [];
  });
}

/** The details that choose pictures, from the bike in use; with no bike, every one Not sure. */
export function pictureDetails(bike: BikeRecord | null): PictureDetails {
  const d = careDetails(bike);
  return {
    brakes: d.brakes, rimBrake: bike?.brakes === 'rim' ? bike.rimBrake ?? null : null, axle: bike?.axle ?? null,
    shifting: d.shifting, bars: bike?.look?.bars ?? null,
  };
}

// Lines that show by the bike's details (care pictures redo, T9; the owner's approval of 9 November 2026, and his decision the same day
// after "Snapped spoke, step 2 of 5: Road caliper"): a step for one kind of brake shows only for that kind. "Rim brakes:" for rim brakes,
// "Disc brakes:" for disc brakes; on a disc card "Cable:" and "Cable brakes:" for cable discs, "Hydraulic:" for hydraulic discs; on a rim
// card "Cable brakes:" for the rim brakes a cable pulls (a road caliper or a V-brake, not a hydraulic rim brake) and "Hydraulic rim
// brakes:" for a hydraulic one (the owner's ruling of 14 November 2026). With the detail Not sure
// every line shows, the most common modern one first; with another answer the line does not show. No words change; the step count is of
// the steps shown.
import { fitOf } from './fit.ts';
import type { RimKind } from './pictures.ts';
import type { CareDetails, Conditions } from './types.ts';

/** A step's condition: on the care details, or on the kind of rim brake (a detail of its own, read only with rim brakes). */
export type When = Conditions | { rimBrake: readonly RimKind[] };

const RIM: When = { brakes: ['rim'] };
const DISC: When = { brakes: ['cable-disc', 'hydraulic-disc'] };
const CABLE_DISC: When = { brakes: ['cable-disc'] };
const HYDRO_DISC: When = { brakes: ['hydraulic-disc'] };
const CABLE_RIM: When = { rimBrake: ['caliper', 'v-brake'] };
const HYDRO_RIM: When = { rimBrake: ['hydraulic'] };

/** Per card or task, per step (0-based): the condition the step needs, or null for every bike. */
export const STEP_WHEN: Readonly<Record<string, readonly (When | null)[]>> = {
  'spoke-snapped': [null, RIM, DISC, null, RIM],
  'brakes-lever-test': [null, null, null, RIM],
  // the owner's ruling of 14 November 2026: a hydraulic rim brake's own centring step (no centring screw) after the cable brakes' one
  'brake-rub-rim': [null, null, null, CABLE_RIM, HYDRO_RIM, null, null],
  'brake-rub-disc': [null, null, null, null, CABLE_DISC],
  'brake-weak-rim': [null, null, CABLE_RIM, null, null],
  'brake-weak-disc': [null, null, CABLE_DISC, HYDRO_DISC, null],
};
/** The order of the steps when a condition's detail is Not sure: the more common line first, a closing line still last. */
const UNSURE_ORDER: Readonly<Record<string, readonly number[]>> = {
  'spoke-snapped': [0, 2, 1, 3, 4],
  'brake-weak-disc': [0, 1, 3, 2, 4],
};

/** The steps (0-based indexes into the item's steps) that show for a bike's details, in the order they show. */
export function stepsShown(id: string, count: number, d: CareDetails, rimBrake: RimKind | null = null): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  const when = STEP_WHEN[id];
  if (!when) return all;
  let unsure = false;
  const kept = all.filter((i) => {
    const c = when[i] ?? null;
    if (!c) return true;
    if ('rimBrake' in c) {
      if (rimBrake === null) { unsure = true; return true; }
      return c.rimBrake.includes(rimBrake);
    }
    const f = fitOf(c, d);
    if (f.tags.length > 0) unsure = true;
    return f.show;
  });
  const order = UNSURE_ORDER[id];
  return unsure && order ? order.filter((i) => kept.includes(i)) : kept;
}

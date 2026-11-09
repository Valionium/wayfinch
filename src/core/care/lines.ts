// Lines that show by the bike's details (care pictures redo, T9; the owner's approval of 9 November 2026): a step that starts "Rim brakes:"
// shows only for rim brakes, one that starts "Disc brakes:" only for disc brakes. With the detail Not sure every line shows, the most
// common modern one first (the disc line before the rim lines); with another answer ("other" brakes) neither shows. No words change.
import { fitOf } from './fit.ts';
import type { CareDetails, Conditions } from './types.ts';

const RIM: Conditions = { brakes: ['rim'] };
const DISC: Conditions = { brakes: ['cable-disc', 'hydraulic-disc'] };

/** Per card or task, per step (0-based): the condition the step needs, or null for every bike. */
export const STEP_WHEN: Readonly<Record<string, readonly (Conditions | null)[]>> = {
  'spoke-snapped': [null, RIM, DISC, null, RIM],
  'brakes-lever-test': [null, null, null, RIM],
};
/** The order of the steps when a condition's detail is Not sure: the disc line first, the closing rim line still last. */
const UNSURE_ORDER: Readonly<Record<string, readonly number[]>> = {
  'spoke-snapped': [0, 2, 1, 3, 4],
};

/** The steps (0-based indexes into the item's steps) that show for a bike's details, in the order they show. */
export function stepsShown(id: string, count: number, d: CareDetails): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  const when = STEP_WHEN[id];
  if (!when) return all;
  let unsure = false;
  const kept = all.filter((i) => {
    const c = when[i] ?? null;
    if (!c) return true;
    const f = fitOf(c, d);
    if (f.tags.length > 0) unsure = true;
    return f.show;
  });
  const order = UNSURE_ORDER[id];
  return unsure && order ? order.filter((i) => kept.includes(i)) : kept;
}

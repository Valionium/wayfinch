// Stages (spec section 12.2): the stage plan's own equal-effort days, so stage ends are exact fractions that never equal a
// grid kilometre (rounded to 0.001 km), or a rider's chosen days. The route comes back with its stages and sample grid.
import fc from 'fast-check';
import { sampleGrid } from '../../src/core/route/grid.ts';
import { planStages, type Pace } from '../../src/core/route/stages.ts';
import type { Route, Stage } from '../../src/core/types.ts';

export type StageChoice = { pace: Pace; flatKph: number; nights: number | 'suggested' };

const paceOf = (): fc.Arbitrary<Pace> => fc.constantFrom<Pace>('steady', 'sporting', 'sporting', 'hard');
/** Section 3's range, with both ends. */
const flat = (): fc.Arbitrary<number> => fc.oneof({ weight: 1, arbitrary: fc.constantFrom(15, 40) }, { weight: 3, arbitrary: fc.integer({ min: 16, max: 39 }) });

export const stageChoice = (): fc.Arbitrary<StageChoice> =>
  fc.record({ pace: paceOf(), flatKph: flat(), nights: fc.oneof({ weight: 4, arbitrary: fc.constant<'suggested'>('suggested') }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 12 }) }) });

export function stagesOf(route: Route, c: StageChoice): Stage[] {
  const first = planStages(route, { flatKph: c.flatKph, pace: c.pace, nights: 0 });
  const nights = c.nights === 'suggested' ? first.suggestedNights : c.nights;
  return [...(nights === 0 ? first : planStages(route, { flatKph: c.flatKph, pace: c.pace, nights }))];
}

export function withStages(route: Route, stages: Stage[]): Route {
  const r = { ...route, stages };
  return { ...r, sampleGrid: sampleGrid(r, r.climbs, stages) };
}

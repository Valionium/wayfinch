// Profiles, the water left and the load summary (spec sections 3.2 and 12.2).
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import type { LoadSummary, Profile, ScreenInputs } from '../../src/core/types.ts';
import { onThreshold } from './thresholds.ts';

const MIN = 60_000;
const contract = (name: string): LoadSummary => JSON.parse(readFileSync(new URL(`../../contracts/load-summary/${name}.json`, import.meta.url), 'utf8')) as LoadSummary;
const SUMMARIES: (LoadSummary | null)[] = [null, null, null, contract('full'), contract('no-bike-weight'), contract('empty')];

export const profile = (): fc.Arbitrary<Profile> => fc.record({
  weightKg: fc.option(fc.integer({ min: 45, max: 120 }), { nil: null }),
  thirst: fc.constantFrom<Profile['thirst']>('less', 'average', 'more'),
  ebike: fc.integer({ min: 0, max: 7 }).map((n) => n === 0),
  capacityL: onThreshold<number | null>([null, 0, 0.5], fc.integer({ min: 1, max: 8 }).map((n) => n / 2)),
  k: fc.integer({ min: 70, max: 130 }).map((n) => n / 100),
  sumW: fc.integer({ min: 0, max: 20 }),
  kDrink: fc.integer({ min: 70, max: 130 }).map((n) => n / 100),
  weighedRides: fc.integer({ min: 0, max: 10 }),
});

export const loadSummary = (): fc.Arbitrary<LoadSummary | null> => fc.constantFrom(...SUMMARIES);

/** Section 3.2's quick choices, with the three-hour expiry of the default on its threshold. */
export function waterLeft(now: Date): fc.Arbitrary<ScreenInputs['waterLeft']> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant(null) },
    {
      weight: 8,
      arbitrary: fc.record({
        litres: fc.constantFrom(0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4),
        ageMin: onThreshold([179, 180, 181, 0], fc.oneof({ weight: 2, arbitrary: fc.constant(0) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 120 }) })),
        confirmed: fc.constantFrom(true, true, true, true, true, false),
      }).map((w) => ({ litres: w.litres, at: new Date(now.getTime() - w.ageMin * MIN), confirmed: w.confirmed })),
    },
    { weight: 1, arbitrary: fc.constant({ litres: Number.NaN, at: new Date(Number.NaN), confirmed: true }) },
  );
}

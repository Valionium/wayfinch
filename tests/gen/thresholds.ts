// Thresholds first (spec section 12.2): about a quarter of draws sit on a threshold or one step either side, where most
// rule bugs sit. Every generator of a value that a rule compares goes through `onThreshold`.
import fc from 'fast-check';

export const onThreshold = <T>(list: readonly T[], normal: fc.Arbitrary<T>): fc.Arbitrary<T> =>
  fc.oneof({ weight: 3, arbitrary: normal }, { weight: 1, arbitrary: fc.constantFrom(...list) });

export const CHANCES = [19, 20, 49, 50] as const;
export const RAIN_MM = [2.4, 2.5] as const;
export const TEMPS_C = [29.9, 30] as const;
export const GUSTS_KMH = [59.9, 60, 60.1] as const;
/** Minutes around an opening or closing time: plus or minus 30, 5 and 10 minutes, and one step either side. */
export const EDGE_MIN = [-31, -30, -29, -10, -5, -1, 0, 1, 5, 10, 29, 30, 31, 45, 46] as const;
/** Ages in hours: 5 and 10 minutes, 3, 12 and 48 hours and a step either side. */
export const AGES_H = [5 / 60, 10 / 60, 2.98, 3, 3.02, 11.98, 12, 12.02, 47.98, 48, 48.02] as const;
/** Metres: 100, 300 and 500 m, 1, 2, 3 and 5 km, and a step either side. */
export const DISTANCES_M = [99, 100, 101, 299, 300, 301, 499, 500, 501, 999, 1000, 1001, 1999, 2000, 2001, 2999, 3000, 3001, 4999, 5000, 5001] as const;

export const chancePct = (): fc.Arbitrary<number> => onThreshold(CHANCES, fc.integer({ min: 0, max: 100 }));
export const rainMm = (): fc.Arbitrary<number> => onThreshold(RAIN_MM, fc.integer({ min: 0, max: 80 }).map((n) => n / 10));
export const tempC = (): fc.Arbitrary<number> => onThreshold(TEMPS_C, fc.integer({ min: -100, max: 380 }).map((n) => n / 10));
export const gustKmh = (): fc.Arbitrary<number> => onThreshold(GUSTS_KMH, fc.integer({ min: 0, max: 900 }).map((n) => n / 10));
export const edgeMin = (): fc.Arbitrary<number> => onThreshold(EDGE_MIN, fc.integer({ min: -240, max: 240 }));
export const ageH = (): fc.Arbitrary<number> => onThreshold(AGES_H, fc.oneof({ weight: 8, arbitrary: fc.integer({ min: 0, max: 800 }) }, { weight: 1, arbitrary: fc.integer({ min: 800, max: 7200 }) }).map((n) => n / 100));
export const distanceM = (): fc.Arbitrary<number> => onThreshold(DISTANCES_M, fc.integer({ min: 0, max: 6000 }));

// Pull requests run every property on the fixed seed and run count (spec section 11.1), through @fast-check/vitest's own copy of
// fast-check too. Without it each `test.prop` ran on a new random seed, and a failure seen once could not be found again.
import fc from 'fast-check';
import { fc as fcOfVitest } from '@fast-check/vitest';
import { expect, test } from 'vitest';

test('[HON-PROP-SEED] both copies of fast-check have the fixed seed and run count, or the ones FC_SEED and FC_RUNS give', () => {
  const want = { numRuns: Number(process.env.FC_RUNS ?? 100), seed: Number(process.env.FC_SEED ?? 20261030) };
  expect(fc.readConfigureGlobal()).toMatchObject(want);
  expect(fcOfVitest.readConfigureGlobal()).toMatchObject(want);
});

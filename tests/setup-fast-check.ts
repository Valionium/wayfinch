import fc from 'fast-check';
import { fc as fcOfVitest } from '@fast-check/vitest';

// Pull requests use fixed seeds (spec section 11.1), so a failure is never random.
// @fast-check/vitest is loaded by Node itself, outside the test bundle, so it holds a second copy of fast-check with its own global
// settings: both are set, or every `test.prop` runs on a new random seed with 100 runs whatever FC_SEED and FC_RUNS say.
const settings = {
  numRuns: Number(process.env.FC_RUNS ?? 100),
  seed: Number(process.env.FC_SEED ?? 20261030),
};
fc.configureGlobal(settings);
fcOfVitest.configureGlobal(settings);

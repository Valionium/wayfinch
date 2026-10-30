import fc from 'fast-check';

// Pull requests use fixed seeds (spec section 11.1), so a failure is never random.
fc.configureGlobal({
  numRuns: Number(process.env.FC_RUNS ?? 100),
  seed: Number(process.env.FC_SEED ?? 20261030),
});

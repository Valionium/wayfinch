import { defineConfig } from 'vitest/config';

// The simulator is one long test: `npm run sim` sets its seed and count (spec section 11.1).
export default defineConfig({
  test: {
    include: ['tests/sim/run.sim.ts'],
    setupFiles: ['tests/setup-fast-check.ts'],
    testTimeout: 15 * 60_000,
    silent: false,
    pool: 'forks',
  },
});

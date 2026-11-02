// npm run sim -- --seed S --count N: the simulator. It runs through Vitest because the code is TypeScript with bundler-style
// imports, and the seed and count reach it through the environment. A script, so that it works in PowerShell and on Linux.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const valueOf = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
};

const seed = valueOf('--seed', '20261030');
const count = valueOf('--count', '1000');
if (!Number.isInteger(Number(seed)) || !Number.isInteger(Number(count)) || Number(count) < 1) {
  console.error('Usage: npm run sim -- --seed S --count N');
  process.exit(2);
}

const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.sim.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SIM_SEED: seed, SIM_COUNT: count },
});
process.exit(result.status ?? 1);

// npm run sim:replay -- <file>: reruns one saved case of tests/regressions/. It exits with an error while the case still fails.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run sim:replay -- <file>');
  process.exit(2);
}

const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.sim.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SIM_REPLAY: resolve(file) },
});
process.exit(result.status ?? 1);

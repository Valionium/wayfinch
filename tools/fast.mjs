// npm run fast: types, lint and the tests touched by this change, with 25 runs per property.
// A script rather than a package.json line, so that it works in PowerShell and on Linux.
import { execSync } from 'node:child_process';

const run = (command, env = {}) =>
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });

run('npm run types');
run('npm run lint');
run('npx vitest run --changed --passWithNoTests', { FC_RUNS: '25' });

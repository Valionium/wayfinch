// npm run fast: types, lint, the tests touched by this change (25 runs per property), 100 simulator scenarios and the rule check.
// A script rather than a package.json line, so that it works in PowerShell and on Linux.
import { execSync } from 'node:child_process';

const run = (command, env = {}) =>
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } });

run('npm run types');
run('npm run lint');
run('npx vitest run --changed --passWithNoTests', { FC_RUNS: '25' });
run('npm run sim -- --seed 20261030 --count 100');
run('npm run rules');

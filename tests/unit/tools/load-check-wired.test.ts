import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = `${REPO}public/tools/bags/index.html`;
const HELPERS = ['app-vm.cjs', 'plan-kit.cjs', 'run-all.cjs', 'paths.cjs']; // the plan's three helpers, and the path file this task adds

// The page is never printed here: only its hash is compared.
test('[LC-PAGE-LIVE] the page in git is byte for byte the live page', () => {
  // sha256 of a clean read of public/tools/bags/index.html, until Task 6 changes it.
  const live = 'aa086001e8d18633b75385c1ec441776a9e6f3ff270e1f3a20b6f38a92ce1f3e';
  expect(createHash('sha256').update(readFileSync(PAGE)).digest('hex')).toBe(live);
});

const suites = readdirSync(`${REPO}qa`).filter((f) => f.endsWith('.cjs') && !HELPERS.includes(f)).sort();

test('[LC-QA-ALL] run-all runs every qa/*.cjs except the three helpers', () => {
  expect(suites.length).toBe(35);
  const r = spawnSync(process.execPath, [`${REPO}qa/run-all.cjs`], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  for (const s of suites) expect(r.stdout).toContain(`PASS ${s} `);
  expect(r.stdout).toContain('All 35 suites passed');
  expect(r.status).toBe(0);
}, 240_000);

test('[LC-FREEZE-01] the frozen bag rules are unchanged', () => {
  const r = spawnSync(process.execPath, [`${REPO}qa/selection-fixtures.cjs`], { cwd: REPO, encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('LC-FREEZE-01 ok');
});

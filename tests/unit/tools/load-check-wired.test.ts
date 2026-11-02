import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = `${REPO}public/tools/bags/index.html`;
const HELPERS = ['app-vm.cjs', 'plan-kit.cjs', 'run-all.cjs', 'paths.cjs']; // the plan's three helpers, and the path file this task adds

// The page is never printed here: only its hash is compared.
test("[LC-PAGE-LIVE] the page's hash is the one recorded", () => {
  // The tag load-check-zip-2026-10-30 holds the page as it was live (aa086001…). Since then: the top-tube wording and the update prompt.
  const recorded = '2f31b7568915da63625abb19b97c5850c2b37a192b19ee34bf564d5d3f1d5366';
  expect(createHash('sha256').update(readFileSync(PAGE)).digest('hex')).toBe(recorded);
});

const suites = readdirSync(`${REPO}qa`).filter((f) => f.endsWith('.cjs') && !HELPERS.includes(f)).sort();

test('[LC-QA-ALL] run-all runs every qa/*.cjs except the three helpers', () => {
  expect(suites.length).toBe(36);
  const r = spawnSync(process.execPath, [`${REPO}qa/run-all.cjs`], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  for (const s of suites) expect(r.stdout).toContain(`PASS ${s} `);
  expect(r.stdout).toContain('All 36 suites passed');
  expect(r.status).toBe(0);
}, 240_000);

test('[LC-FREEZE-01] the frozen bag rules are unchanged', () => {
  const r = spawnSync(process.execPath, [`${REPO}qa/selection-fixtures.cjs`], { cwd: REPO, encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('LC-FREEZE-01 ok');
});

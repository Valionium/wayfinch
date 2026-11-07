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
  // Sub-project 6 changes the bag planner behind the launch switch (bike.js, the rig, Look); riders keep releases/load-check-root.html
  // (LC-ROOT-FROZEN), so each change here is on purpose and recorded.
  const recorded = '87743f859c33f89e0234aee48169fe6a24cc84fcfcbab9db07e0aea8181b9cc9';   // + the Gear advisor in the bag planner: its trial function and its view (sub-project 13, group 2)
  expect(createHash('sha256').update(readFileSync(PAGE)).digest('hex')).toBe(recorded);
});

// The copy served at / until the launch (sub-project 6, Decision 2): the first GitHub release's page, live since 4 Nov 2026.
test('[LC-ROOT-FROZEN] the frozen root copy has the hash that went live with the first release', () => {
  const live = '2f31b7568915da63625abb19b97c5850c2b37a192b19ee34bf564d5d3f1d5366';
  expect(createHash('sha256').update(readFileSync(`${REPO}releases/load-check-root.html`)).digest('hex')).toBe(live);
});

const suites = readdirSync(`${REPO}qa`).filter((f) => f.endsWith('.cjs') && !HELPERS.includes(f)).sort();

// Sub-project 6's plan, "Load Check's QA suites after the move" (the owner approved it on 2 November 2026), corrected in group 2's pull
// request: every suite is kept unless retired; the four below retired with the tyre helper. Suites added since are kept too.
const KEPT = [
  'bag-selection', 'selection-fixtures', 'plan-object', 'plan-stability', 'plan-storage', 'strap-display', 'packing-audit', 'trip-kit-defaults',
  'trip-info', 'gpx-high-point-climate', 'places', 'routes', 'route-map-feedback', 'inputs', 'info-popups', 'info-layout-regression', 'feedback-ui',
  'bag-help-layout', 'release-storage.test', 'bike-fit', 'bike-weight', 'bike-repair',
  'bike-profile-storage', 'bike-details-ui', 'bike-quick-start', 'bike-profile-ui',
  'walkthrough-fixes', 'fix-findings', 'release-offline.test', 'offline-redirect', 'tyre-pressure-storage',
  // not in the plan's table: sub-project 4's update prompt, group 1's bike suites, group 2's contracts and fit properties
  'update-prompt', 'bike-contract', 'look', 'rig', 'contracts', 'fit-props',
  // sub-project 11, group 3: the chosen bike, the bag planner's half
  'bike-choice',
  // sub-project 13, group 2: the Gear advisor in the bag planner
  'advisor',
].map((n) => `${n}.cjs`).sort();
const RETIRED = ['tyre-pressure', 'pressure-tool-markup', 'pressure-tool', 'ui-pressure-layout'];

test('[LC-QA-TABLE] run-all runs exactly the kept suites; each retired one has its reason in qa/RETIRED.md, and is gone', () => {
  expect(suites).toEqual(KEPT);
  const retired = readFileSync(`${REPO}qa/RETIRED.md`, 'utf8');
  for (const name of RETIRED) {
    expect(suites).not.toContain(`${name}.cjs`);
    const row = retired.split('\n').find((line) => line.startsWith(`| \`${name}\` |`));
    expect(row, name).toBeDefined();
    expect(row!.split('|').filter((cell) => cell.trim()).length, `${name}: a reason and what moved`).toBe(3);
  }
});

test("[LC-QA-TABLE] tyre-pressure's limit cases have an equal or tighter row in tests/unit/tools/tyre/ before it goes", () => {
  const dir = `${REPO}tests/unit/tools/tyre/`;
  const titles = readdirSync(dir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')).map((f) => readFileSync(dir + f, 'utf8')).join('\n');
  // Each of the retired suite's limit cases, and the tyre tool's row that covers it (the comparison is in the pull request):
  for (const row of [
    '[TY-PSI-QUERY] after the query, above 11 bar is rejected; so is above 160 psi, below the minimum, and anything not a positive number', // 0, -1, NaN, 16 bar, "2x"
    '[TY-PSI-QUERY] each limit is compared in its entered unit', // the psi and bar round trip of a recorded limit
    '[TY-PROP-LIMITS] a shown value never exceeds a limit in the unit it was entered in', // a record above the entered maximum
    '[TY-WARN] a floor above the cap marks the setup incompatible, in words', // a minimum above its maximum
    '[TY-HOOKLESS]', // no maximum entered: the standard limit still caps it
  ]) expect(titles, row).toContain(row);
});

test('[LC-QA-ALL] run-all runs every qa/*.cjs except the three helpers', () => {
  expect(suites.length).toBe(KEPT.length);
  const r = spawnSync(process.execPath, [`${REPO}qa/run-all.cjs`], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  for (const s of suites) expect(r.stdout).toContain(`PASS ${s} `);
  expect(r.stdout).toContain(`All ${KEPT.length} suites passed`);
  expect(r.status).toBe(0);
}, 240_000);

test('[LC-FREEZE-01] the frozen bag rules are unchanged', () => {
  const r = spawnSync(process.execPath, [`${REPO}qa/selection-fixtures.cjs`], { cwd: REPO, encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stdout).toContain('LC-FREEZE-01 ok');
}, 60_000); // a child process, on a machine busy with the other test files: the suite itself is unchanged

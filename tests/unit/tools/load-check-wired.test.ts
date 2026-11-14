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
  const recorded = 'b6dddc44dfb6b6e96097bc46b109f7fd9d957699d5bb3cfc571d85a0aea9332b';   // + free play without Trip's route: Try other bags freely while the plan is the trip's, nothing of the trip's plan written, Back byte for byte, a new setup only on the rider's tap (the owner's wish 3, design of 14 Nov 2026), merged with main after PRs 135 and 137; before it + the Gear advisor's why lines agree with its moves (what comes off the back and what goes in, the four figures as shown adding up), the hint read once, the start without a plan explained (sweep 14 Nov 2026, #40, #41, #43; review of PR 137, m1), merged with main after PR 135; before it + weather landing during Plan bags' wait is part of the plan (no line of its own), a second landing adds to the first line (re-check of PR 135, N1, m5, m6); before it + after the review of PR 135: nothing written while Plan bags waits for the weather, late weather said with Undo, no repack of an opened setup, the small view's line set only when it changes, the focus kept during the wait, merged with main after PR 129; before it + a trip's bags sized with its measured weather, waited for a few seconds, the kit of weather that lands later brought in at once, and the small view naming what does not fit with its litres (sweep 14 Nov 2026, #24); before it + Bike details' Brake fluid with hydraulic brakes (its hint as the content says it: on the lever or caliper, review of PR 129, m2), Brake type and Shifting at Not sure, Shifting's No gears (the owner's wish of 14 Nov 2026); before it + a short day ride packs no first aid kit, puts the sunscreen on and wears the long gloves, and on a day ride the sunglasses ride in the jersey or on the helmet (owner, 10 Nov 2026); before it + Handling first's button (and after the review of PR 121: the focus to the line when it goes, described by its hint only while shown, Before and After dropped at once on the way back): after a press the way back ("Back to the planner's packing"), none after "Already packed", the map button after every press (the owner's rulings of 10 Nov 2026, preview of main a7122fa); before it + Handling first at the packing check: its button beside Show the map, its line, tips and Undo, the map Before and After, both sides of a pair kept even against the plan as shown (design of 10 Nov 2026, the owner's answers of 10 Nov; review of PRs 116/117 and its re-check), merged with main after PR 116; before it + the Bike line at the Bag planner's drawing: the saved bikes and Without a bike, a pick as Bike details' Use saved bike, with its Undo (wish 15, 10 Nov 2026); before it + a day ride's top tube bag the typical 1.2 L, the half frame bag beside the bottle only for what is still over, and the jersey and bib shorts pockets counted as carried room (owner, 9 Nov 2026), a pocket switch planning the proposed bags again (coordinator, 10 Nov 2026), a packable rain jacket and a mini pump in the jersey pockets (owner, 10 Nov 2026), the review of PR 106 fixed (a measured bag is the rider's, placements kept across re-plans, pockets in the checklist and the kit figures), and its re-check (a reopened plan still re-planned, pocket rows ticked), merged with main after PR 111; before it a new bike from Wayfinch's first-run card opens with the colour tried there picked, not saved (wish 17, design of 9 Nov 2026, section 4.2), merged with main after PR 113; before it Look's "Where is the motor?" for an e-bike: at the cranks, in the rear hub or in the front hub, only an answer stored (owner, 9 Nov 2026); before it + the first-run hint's "fits better" lines under the drawing and above the Gear advisor's results, while no bike is known (wish 17, design of 9 Nov 2026, section 5), merged with main after PR 101; before it Wayfinch's day ends in a handoff (TRIP-DAY-STOPS, owner 9 Nov 2026), merged with main after PR 103; before it + Bike details: just the bike while personalising, and the fork close-up on arrival with the bike's glide (the owner's video of 9 Nov 2026), merged with main after PR 95; before it + the slimmer weight map and the wider automatic balancing (the owner's decision and choice of 9 Nov 2026, with the fixes after its review, PR 89), merged with main after PR 92 (its small view shows the balance's line); before it + general and trip setups, a long trip from Wayfinch straight into the planner at Bags, the small view of a day ride (guided Trip, part 2, PR 80 replayed as PR 85) and the fixes after its second re-read (a full library never cuts a setup, new setups only in the second list as the owner chose on 9 Nov, a delete frees room after a failed write, a true stored note, the list's order kept, a delete request applied again after a failed removal), merged with main's the Gear advisor's big drawing follows the chosen bike and a reload stays on the advisor (the owner's video of 9 Nov 2026; review of PR 87 fixed); before it the weight map and bikes (after the launch, part 4c, PR 78: the ideal from the rider's own setup with its swaps, no frame colour, bikes added in You become the chosen bike, bar straps on the roll) and the automatic balancing at the packing check (weight map design §7, PR 79, with its review fixes), replayed onto main after PR 81; before them + the Gear advisor as its own page, both goals, the way back after Try, a bigger change (the owner's preview check of 8 Nov: C, D, E, F, I; review of PR 81 fixed); before them real bag shapes on the rig and the advisor's sketches, and the weight map (design of 8 Nov 2026; review of PR 71 fixed), merged with main's guided Trip, part 1, and after the launch, parts 2 and 3; before them trial bags and the way in (sub-project 13, group 3), the Gear advisor and main's chosen bike; + a day ride planned with essentials and the fewest bags that hold them, the small view as part of Trip, setup kinds in Start from, the fork close-up beside the bike (owner, 9 Nov 2026); + the day kit: warm layers by the day's temperature, water without cages, the phone in its own bag, the small view's water line, footer and back link (review of PR 92), an afternoon ride's one bottle with the top tube and frame bags, and on a day ride the jacket worn and one spare tube (owner, 9 Nov 2026); + the day tube read honestly everywhere in the full planner (kit row, checklist, bag lists, moves, reach, popover, quantity buttons) and two again with nights, the jacket worn only below 8 °C (review of PR 95; owner, 9 Nov 2026); + a day ride's frame bag in the half shape beside its bottle, a top tube bag up to 2 L, and the least essential things left at home before a bag is added (owner, 9 Nov 2026); + Bike details' Wheel axle and Rim brake type (care pictures redo, the owner's answers 1 and 2 of 9 Nov 2026), merged with main after PR 115
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
  // the bag planner's automatic balancing (weight map design §7)
  'auto-balance',
  // the guided Trip, part 2: general and trip setups
  'setup-kinds',
  // the bag planner's Handling first (design of 10 Nov 2026)
  'handling-first',
  // free play without Trip's route (the owner's wish 3, design of 14 Nov 2026)
  'free-play',
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

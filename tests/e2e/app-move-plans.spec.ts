// A rider's plans from before the move open at /tools/bags/ unchanged (sub-project 6, group 2; Review Focus 2). The storage is made by
// the old page itself, the tagged one riders had at /, then the launch build is served and the bag planner opened at its new address.
// Nothing here prints a page: failures compare keys and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { legacySite } from './fixtures/legacy-site.mjs';
import { removeTempDirs, tempDir } from './fixtures/sw-helpers.ts';
import { removeBuilds, siteFor } from './helpers.ts';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';

let server: CfLike | undefined;
test.afterEach(async () => { await server?.close(); server = undefined; });
test.afterAll(() => { removeTempDirs(); removeBuilds(); });
// Storage, not looks: once per browser size, in the dark theme only, so the run stays inside its time.
test.skip(({ colorScheme }) => colorScheme === 'light', 'storage, not the theme');

const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');
const saved = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('loadcheck:')).sort().map((k) => [k, localStorage.getItem(k)])));

test('[LC-MOVE-PLANS] hand placements, ticks, setups, three bikes and an old pressure saved by the old page open at /tools/bags/ byte for byte; its frame bag beside the bottle now counts what fits, placed again once with the note, nothing lost', async ({ page }) => {
  await page.context().route(/^https:\/\//, (route) => route.abort());
  server = await startCfLike({ dir: legacySite(tempDir()) });
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  // Today's storage, written by the old page's own code.
  await page.evaluate(`(async () => {
    const pressure = { bikeKg: 13.2, wheel: '700c', rim: 'tubeless-crochet', rimMm: 23, frontMm: 45, rearMm: 45, frontCasing: 'standard', rearCasing: 'reinforced',
      frontMinBar: 1.5, frontMaxBar: 4, rearMinBar: 1.7, rearMaxBar: 4.2 };
    const bikes = [{ id: 'bike_one', name: 'Tourer', tyres: 'tubeless', frontTyre: '45-622', pressure },
      { id: 'bike_two', name: 'Town bike', brakes: 'rim', pressure: { bikeKg: 16 } }, { id: 'bike_three', name: 'Gravel', drive: 'derailleur' }];
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify(bikes.map(normaliseBikeProfile)));
    S.bikeProfile = normaliseBikeProfile(bikes[0]);
    localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(S.bikeProfile));
    S.tyrePressure = normaliseTyrePressure({ bagKg: 2.1, extraKg: 0.4, method: 'estimate', ride: 'gravel', surface: 'dry', unit: 'bar' });
    S.nights = 3; S.mode = 'comfort';
    S.bags = [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'frame', L: 5 }, { uid: 3, pos: 'bar', L: 12 }, { uid: 4, pos: 'rack', L: 15, pair: true },
      { uid: 5, pos: 'bottle', slot: 'st', L: 0.75 }];
    S.nextUid = 6;
    for (const id of ['tent', 'pad', 'bag', 'stove', 'pot', 'jacket', 'tubes', 'pump']) if (S.kit[id] !== undefined) S.kit[id] = true;
    go(2); go(3); go(4);
    // a hand placement: the first item that can go elsewhere goes there
    const A = currentPlan();
    let moved = null;
    for (const s of A.slots) { for (const k of s.items) { const t = moveTargets(A, s.key, k.id); if (t.length && !moved) moved = [k.id, t[0].key]; } }
    if (moved) { S.pinned[moved[0]] = moved[1]; keepPlan(); }
    for (const id of ['tent', 'pump']) setPackedItem(id, true);
    await saveSetup('Alps', 'the long one');
    S.nights = 1;
    await saveSetup('Weekend', '');
    S.nights = 3;
    await flushDraft();
    window.__moved = moved;
  })()`);
  expect(await page.evaluate('window.__moved')).not.toBeNull();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForTimeout(600); // past the page's 300 ms save timer
  const before = await saved(page);
  for (const key of ['loadcheck:draft', 'loadcheck:setups', 'loadcheck:bikeProfiles', 'loadcheck:bikeProfile']) expect(before[key]?.length ?? 0, key).toBeGreaterThan(2);
  const draft = JSON.parse(before['loadcheck:draft']!) as { placements: unknown; pinned: Record<string, string>; packed: Record<string, boolean> };
  expect(Object.keys(draft.pinned).length).toBe(1);
  expect(draft.packed).toMatchObject({ tent: true, pump: true });
  expect((JSON.parse(before['loadcheck:setups']!) as unknown[]).length).toBe(2);

  // The launch: the same origin now serves the launch build, and the rider opens the bag planner at its new address.
  server.swap(await siteFor(true)); // the launch build this worker already has
  await page.goto(`${server.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await page.waitForTimeout(600);
  const after = await saved(page);
  for (const [key, value] of Object.entries(before)) expect(after[key], key).toBe(value);
  // The owner's ruling of 14 Nov 2026 (LC-FRAME-FITS, LC-FRAME-FITS-OLD): the frame bag beside the seat-tube bottle now counts only what
  // the rig draws there, so the kit is placed again, once, and the packing check says why. The stored plan itself is untouched (above),
  // and nothing is lost: everything the old page placed is in a bag or named as not fitting, and the hand placement is kept or named.
  const stored = draft.placements as { basis: { units: [string, string, string, number, number][] }; items: Record<string, unknown> };
  const now = await page.evaluate(`(() => { const A = currentPlan(); return { reason: A.notes.replan && A.notes.replan.reason, units: A.basis.units,
    items: Object.keys(A.items), spill: A.spill.map((k) => k.id), kept: A.hand.kept, notKept: A.hand.notKept.map((n) => n.id) }; })()`) as
    { reason: string | null; units: [string, string, string, number, number][]; items: string[]; spill: string[]; kept: string[]; notKept: string[] };
  expect(now.reason).toBe('beside');
  // the same bags; only the frame bag holds less
  expect(now.units.map((u) => u[0])).toEqual(stored.basis.units.map((u) => u[0]));
  for (const [i, u] of now.units.entries()) {
    if (u[1] === 'frame') expect(u[3], 'the frame bag counts less').toBeLessThan(stored.basis.units[i]![3]);
    else expect(u, u[0]).toEqual(stored.basis.units[i]);
  }
  for (const id of Object.keys(stored.items)) expect(now.items.includes(id) || now.spill.includes(id), id).toBe(true);
  const [pinnedId] = Object.keys(draft.pinned);
  expect(now.kept.includes(pinnedId!) || now.notKept.includes(pinnedId!), 'the hand placement is kept or named').toBe(true);
  expect(await page.evaluate('JSON.stringify(S.pinned)')).toBe(JSON.stringify(draft.pinned));
  // the bike, its tyre fields and the setups came through as they were
  expect(await page.evaluate('JSON.stringify(S.bikeProfile.pressure)')).toBe(JSON.stringify(JSON.parse(before['loadcheck:bikeProfile']!).pressure));
  expect(await page.evaluate('SETUPS.length')).toBe(2);
});

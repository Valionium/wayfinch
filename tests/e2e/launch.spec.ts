// Every path from today's phones to the launch build (sub-project 6, Task 9; spec section 9.5 step two and section 11 "Launch").
// Against the host-like server, with sub-project 4's fixtures: the old site (the tagged page and today's worker), the step-one build (the
// frozen copy at / and the new worker), and the launch build. Plans are made by each old page's own code, as riders made them.
// Nothing here prints a page: failures compare booleans, counts, keys and short values.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';
import { legacySite } from './fixtures/legacy-site.mjs';
import {
  MARKER_SELECTOR, activeWorkerKind, ask, blockOutside, buildSite, cacheNames, copyDir, isLoadCheckPage, open, registerAndControl,
  removeTempDirs, stateOf, tempDir, waitActivated, waitForWorker,
} from './fixtures/sw-helpers.ts';
import { removeBuilds, siteFor, withStore } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

let server: CfLike | undefined;
test.beforeEach(async ({ context }) => { await blockOutside(context); });
test.afterEach(async () => { await server?.close(); server = undefined; });
test.afterAll(() => { removeTempDirs(); removeBuilds(); });

const PROMPT = 'Update ready — apply now';
const MAX_PRECACHED_BYTES = 2_097_152;
// Keys the bag planner adds the first time it opens after the move; every key a rider had stays byte for byte.
const NEW_PLANNER_KEYS = new Set(['loadcheck:summary:v1', 'loadcheck:saved-at:v1', 'loadcheck:offline-had']);

const draftReady = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true', undefined, { timeout: 30_000 });

/** Every key of the bag planner, as raw strings. */
const plannerKeys = (page: Page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('loadcheck:')).sort().map((k) => [k, localStorage.getItem(k)])));

/** The co-pilot's shell is on screen, and this is not a Load Check page. */
async function expectCopilot(page: Page): Promise<void> {
  await page.waitForSelector('#app .shell', { timeout: 30_000 });
  expect(await page.evaluate((selector) => !document.querySelector(selector) && typeof (window as unknown as { DRAFT_READY?: unknown }).DRAFT_READY === 'undefined', MARKER_SELECTOR)).toBe(true);
}

/** The bag planner with the rider's plan: three nights, one setup, one bag, its bike. */
async function expectPlan(page: Page): Promise<void> {
  await draftReady(page);
  expect(await page.evaluate('[S.nights, SETUPS.map((s) => s.name), S.bags.length, BIKE_PROFILES.map((b) => b.id)]')).toEqual([3, ['Before'], 1, ['bike-before']]);
}

/** Every key the rider had is byte-identical, and nothing else of the bag planner's appeared but its own new keys. */
function expectKept(after: Record<string, string | null>, before: Record<string, string | null>): void {
  for (const [key, value] of Object.entries(before)) expect(after[key], key).toBe(value);
  for (const key of Object.keys(after)) if (!(key in before)) expect(NEW_PLANNER_KEYS.has(key), key).toBe(true);
}

/** A plan, a setup and a bike, written by the old page's own code, then a fresh load so everything has settled. */
async function makePlan(page: Page): Promise<Record<string, string | null>> {
  await draftReady(page);
  await page.evaluate(`(async () => {
    localStorage.setItem('loadcheck:bikeProfiles', JSON.stringify([normaliseBikeProfile({ id: 'bike-before', name: 'Before bike' })]));
    S.nights = 3;
    S.bags = [{ uid: 1, pos: 'seat', L: 14 }];
    S.nextUid = 2;
    await saveSetup('Before', 'made before the launch');
    await flushDraft();
  })()`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await draftReady(page);
  await page.waitForTimeout(500); // past the page's 300 ms save timer
  const saved = await plannerKeys(page);
  for (const key of ['loadcheck:draft', 'loadcheck:setups', 'loadcheck:bikeProfiles']) expect(saved[key]?.length ?? 0, key).toBeGreaterThan(2);
  return saved;
}

type Start = 'legacy' | 'step-one';

/** A phone as riders have it: the old site and its worker (legacy), or the first release's copy and the new worker (step-one). */
async function phone(page: Page, start: Start): Promise<Record<string, string | null>> {
  server = await startCfLike({ dir: start === 'legacy' ? legacySite(tempDir()) : (await buildSite()).dir });
  await open(page, `${server.origin}/`);
  await registerAndControl(page);
  if (start === 'step-one') await waitActivated(page);
  expect(await activeWorkerKind(page)).toBe(start === 'legacy' ? 'legacy' : 'new');
  return makePlan(page);
}

/** The launch: the same address now serves the launch build. */
const launch = async () => server!.swap(await siteFor(true));

test('[SW-LAUNCH-UPDATE] from the step-one worker the launch build waits, the prompt applies it, / is the co-pilot and /tools/bags/ the bag planner, both offline, plans intact', async ({ page }) => {
  const before = await phone(page, 'step-one');
  await launch();
  // The rider's next visit: the frozen copy from its own precache, while the launch build installs behind it and waits.
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(page)).toBe(true);
  await expect.poll(() => stateOf(page), { timeout: 30_000 }).toEqual({ active: true, waiting: true, installing: false });
  await page.waitForTimeout(1000);
  expect(await isLoadCheckPage(page)).toBe(true); // nothing took over by itself
  const prompt = page.getByRole('button', { name: PROMPT, exact: true });
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  const reloaded = page.waitForEvent('framenavigated');
  await prompt.click();
  await reloaded;
  await expectCopilot(page);
  await expect.poll(() => stateOf(page)).toEqual({ active: true, waiting: false, installing: false });
  expect(await plannerKeys(page)).toEqual(before);
  await expect(page.locator('.moved-card')).toBeVisible();

  await page.goto(`${server!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await expectPlan(page);
  await page.waitForTimeout(600);
  expectKept(await plannerKeys(page), before);

  server!.down(true);
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await page.goto(`${server!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await expectPlan(page);
  expectKept(await plannerKeys(page), before);
});

test('[SW-JUMP] from the old worker straight to the launch build: the old copy once, then the co-pilot, no old cache, every plan byte for byte, the bag planner offline', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const before = await phone(page, 'legacy');
  await launch();
  // First online open: the old worker asks the server, gets a page without its marker, and serves its own copy.
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(page)).toBe(true);
  await draftReady(page);
  expect(await page.evaluate('S.nights')).toBe(3);
  // Meanwhile the launch worker installs and, on its first install, takes over at once.
  await waitForWorker(page, 'new', 30_000);
  expect((await cacheNames(page)).some((n) => n.startsWith('loadcheck-offline-'))).toBe(false);
  expect(await stateOf(page)).toEqual({ active: true, waiting: false, installing: false });

  // Next open: the co-pilot, with the card for a rider who comes from Load Check.
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await expect(page.locator('.moved-card')).toBeVisible();
  expect(await plannerKeys(page)).toEqual(before);

  // The bag planner, offline, with the plan; the one-time offline line has nothing to say (Decision 9): the copy is there.
  server!.down(true);
  await page.goto(`${server!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await expectPlan(page);
  await page.waitForFunction('OFFLINE_PACKING.checked === true', undefined, { timeout: 30_000 });
  expect(await page.evaluate('OFFLINE_PACKING.cacheReady')).toBe(true);
  await page.waitForTimeout(600);
  await expect(page.locator('#offlineAgainBar')).toBeHidden();
  expectKept(await plannerKeys(page), before);
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  expect(errors).toEqual([]);
});

test('[SW-JUMP] with no signal throughout, the old copy keeps serving with its plan; once signal returns, the jump happens', async ({ page }) => {
  const before = await phone(page, 'legacy');
  await launch();
  server!.down(true);
  for (let i = 0; i < 2; i += 1) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await isLoadCheckPage(page)).toBe(true);
    await draftReady(page);
    expect(await page.evaluate('S.nights')).toBe(3);
  }
  expect(await activeWorkerKind(page)).toBe('legacy');
  expect(await cacheNames(page)).toEqual(['loadcheck-offline-v1']);
  expect(await plannerKeys(page)).toEqual(before);

  server!.down(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(page)).toBe(true);
  await waitForWorker(page, 'new', 30_000);
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  expect(await plannerKeys(page)).toEqual(before);
});

test('[SW-JUMP] after the jump, offline, a trip handed over from Wayfinch lands in the old plan: trip fields only, the plan kept, Back to Trip', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await phone(page, 'legacy');
  await launch();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForWorker(page, 'new', 30_000);
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  // The co-pilot's database as its own store makes it, and a handoff as Trip's Plan bags for this trip writes it (src/ui/trip/handoff.ts).
  await withStore(page);
  const id = 'abcdefabcdefabcdefabcdefabcdef12';
  const gpx = readFileSync(join(process.cwd(), 'contracts', 'handoff', 'heidelberg-strasbourg.gpx'), 'utf8');
  await page.evaluate(async ({ gpx: text, id: handoffId }) => {
    const db = await (window as unknown as { __store: StoreInPage }).__store.openDb();
    await (db as unknown as { put: (store: string, value: unknown, key: string) => Promise<unknown> }).put('handoffs', { id: handoffId, gpx: text, createdAt: new Date().toISOString() }, handoffId);
    localStorage.setItem('copilot:handoff:v1', JSON.stringify({ app: 'copilot', kind: 'handoff', v: 1, id: handoffId, createdAt: new Date().toISOString() }));
  }, { gpx, id });

  server!.down(true);
  await page.goto(`${server!.origin}/tools/bags/#copilot-handoff=${id}`, { waitUntil: 'domcontentloaded' });
  await expectPlan(page);
  await expect(page.locator('#handoffBar')).toBeVisible();
  await page.locator('#handoffApply').click();
  await expect(page.locator('#handoffUndo')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate('[S.nights, S.place && S.place.name, S.bags.length, SETUPS.map((s) => s.name), BIKE_PROFILES.map((b) => b.id)]')).toEqual([2, 'Heidelberg', 1, ['Before'], ['bike-before']]);
  await expect(page.locator('#backToWayfinch')).toHaveAttribute('href', '/#/trip');
  await page.locator('#backToWayfinch').click();
  await page.waitForURL(`${server!.origin}/#/trip`);
  await expectCopilot(page);
  expect(errors).toEqual([]);
});

test('[SW-NO-MARKER] the co-pilot\'s / has no Load Check marker, so an old worker still in charge never stores it and keeps its own copy', async ({ page, request }) => {
  const launchDir = await siteFor(true);
  expect(readFileSync(join(launchDir, 'index.html'), 'utf8').includes('loadcheck-offline-shell')).toBe(false);

  await phone(page, 'legacy');
  // The launch build's pages, but the old worker still at its address: a browser that hasn't looked for a new worker yet.
  const site = join(tempDir(), 'launch-with-old-worker');
  copyDir(launchDir, site);
  writeFileSync(join(site, 'offline-worker.js'), readFileSync(join(process.cwd(), 'qa', 'fixtures', 'legacy-offline-worker.js')));
  server!.swap(site);
  const served = await request.get(`${server!.origin}/`);
  expect((await served.text()).includes('loadcheck-offline-shell')).toBe(false);

  expect(await ask(page, 'active', 'LOADCHECK_SAVE_APP')).toEqual({ ok: false, cached: false });
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await isLoadCheckPage(page)).toBe(true);
  expect(await activeWorkerKind(page)).toBe('legacy');
  const stored = await page.evaluate(async () => {
    const cache = await caches.open('loadcheck-offline-v1');
    const keys = await cache.keys();
    const entry = await cache.match(new URL('/index.html', location.href).href);
    return { count: keys.length, hasMarker: entry ? (await entry.text()).includes('loadcheck-offline-shell') : false };
  });
  expect(stored).toEqual({ count: 1, hasMarker: true });
});

/**
 * A tab of the old page with a change of its own still inside its 300 ms save timer, that hears nothing of the other tab: no storage
 * event, and no return to the foreground (a phone's frozen background tab). The timer is held, as the change happens a moment before
 * the bag planner saves. Its last line of defence is its own check before each write.
 */
const staleChange = (page: Page) => page.evaluate(`(() => {
  // The page's own listeners are taken off by name: a listener added in front of them would not stop them.
  window.removeEventListener('storage', followOtherTabs);
  window.removeEventListener('pageshow', checkOtherTabs);
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  window.queueDraftSave = () => {};
  S.nights = 5;
})()`);

/** The bag planner, in a second tab, saves a change: seven nights. */
async function plannerSaves(context: BrowserContext): Promise<{ planner: Page; draft: string }> {
  const planner = await context.newPage();
  await planner.goto(`${server!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await draftReady(planner);
  expect(await planner.evaluate('S.nights')).toBe(3);
  // seven nights, and a packing factor, which store.set stamps (C-DELETE's ledger)
  await planner.evaluate('(async () => { S.nights = 7; await flushDraft(); S.packEff = 0.9; await store.set("loadcheck:packEff", 0.9); })()');
  const draft = await planner.evaluate(() => localStorage.getItem('loadcheck:draft'));
  expect(JSON.parse(draft!).trip.nights).toBe(7);
  return { planner, draft: draft! };
}

for (const start of ['legacy', 'step-one'] as const) {
  const which = start === 'legacy' ? "the old site's" : "the first release's";

  test(`[SW-OLD-TAB-WRITES] ${which} page left open at / writes after the bag planner saved: the newer draft stays`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    await staleChange(page);
    const { planner, draft } = await plannerSaves(context);

    // The old tab's own change, written over a draft it hasn't read: refused, with its message.
    await page.evaluate('flushDraft()');
    expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
    expect(await page.evaluate(() => !document.getElementById('tabBar')!.classList.contains('hidden') && /changed in another tab/.test(document.getElementById('tabText')!.textContent ?? ''))).toBe(true);
    // Hiding it writes nothing either, and nor does closing it.
    await page.evaluate('flushDraft()');
    expect(await page.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
    await page.close({ runBeforeUnload: true });
    expect(await planner.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
  });

  test(`[SW-OLD-TAB-WRITES] known risk, not a guarantee (review I1): ${which} stale tab's bike write replaces the bag planner's newer bike list, since both pages are at bike format 2`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    await staleChange(page);
    const { planner } = await plannerSaves(context);
    // The bag planner adds a bike and gives the old one a Look, through its own guarded write.
    await planner.evaluate(`(async () => {
      const list = BIKE_PROFILES.map((b) => (b.id === 'bike-before' ? normaliseBikeProfile({ ...b, look: { colour: '#aa3300', bars: 'flat', ebike: true } }) : b));
      list.push(normaliseBikeProfile({ id: 'bike-new', name: 'New bike' }));
      if (!(await bikeStoreSet(BIKE_PROFILE_KEY, list))) throw new Error('the planner could not save');
    })()`);
    expect(await planner.evaluate(() => localStorage.getItem('loadcheck:bikeProfilesFormat'))).toBe('2');
    // The old tab, which heard nothing, writes its own list, as its weight question, bolt check or bike editor would.
    expect(await page.evaluate('bikeStoreSet(BIKE_PROFILE_KEY, BIKE_PROFILES)')).toBe(true);
    const after = JSON.parse((await planner.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles')))!) as { id: string; look: unknown }[];
    expect(after.map((b) => b.id)).toEqual(['bike-before']); // the new bike is gone
    expect(after[0]!.look).toBeNull(); // and so is the Look
  });

  test(`[BK-PAINT-OLD-PAGE] known risk, not a guarantee: ${which} page re-saving a bike drops its look extras (pattern, fork, rims) from its bikes, draft and setups; the colour stays, format stays 2`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    const { planner } = await plannerSaves(context);
    const LOOK = { colour: '#2563b8', bars: null, ebike: null };
    // The bag planner gives the bike a pattern, a fork of its own and deep rims.
    await planner.evaluate(`(async () => {
      const list = BIKE_PROFILES.map((b) => normaliseBikeProfile({ ...b, look: { colour: '#2563b8', bars: null, ebike: null,
        paint: { pattern: 'marble', colours: ['#6b3fa0', '#1f7f80'], fork: { kind: 'own', colour: '#c62f2a' }, rimMm: 50 } } }));
      if (!(await bikeStoreSet(BIKE_PROFILE_KEY, list))) throw new Error('the planner could not save');
    })()`);
    // Two tabs share storage, but a write reaches the other tab a moment later: the old page waits until it sees it.
    await page.waitForFunction(() => (localStorage.getItem('loadcheck:bikeProfiles') ?? '').includes('"marble"'));
    // The old page reads the list as its own start-up does and saves it back, as its weight question or bike editor would.
    expect(await page.evaluate(`(async () => {
      BIKE_PROFILES = JSON.parse(localStorage.getItem(BIKE_PROFILE_KEY)).map(normaliseBikeProfile).filter(Boolean);
      return bikeStoreSet(BIKE_PROFILE_KEY, BIKE_PROFILES);
    })()`)).toBe(true);
    await planner.waitForFunction(() => !(localStorage.getItem('loadcheck:bikeProfiles') ?? '"marble"').includes('"marble"'));
    const after = JSON.parse((await planner.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles')))!) as { id: string; look: { paint?: unknown } | null }[];
    expect(after.map((b) => b.id)).toEqual(['bike-before']);
    // the extras are gone; the first colour and the rest of the Look stay (review M1)
    expect(after[0]!.look).toEqual(LOOK);
    expect(await planner.evaluate(() => localStorage.getItem('loadcheck:bikeProfilesFormat'))).toBe('2'); // and a rollback can still edit bikes
    // The same for the plan's bike in the draft and in a setup the old page writes (review M2): the extras go, the colour stays.
    const written = await page.evaluate(`(async () => {
      S.bikeProfile = normaliseBikeProfile(${JSON.stringify({ id: 'bike-before', name: 'Before bike', look: { ...{ colour: '#2563b8', bars: null, ebike: null }, paint: { pattern: 'marble', colours: ['#6b3fa0', null], fork: null, rimMm: 50 } } })});
      const draftLook = capturePlan().bikeProfile.look;
      await saveSetup('Stale tab', '');
      const setup = JSON.parse(localStorage.getItem('loadcheck:setups')).find((s) => s.name === 'Stale tab');
      return { draftLook, setupLook: (setup.plan || setup).bikeProfile.look };
    })()`) as { draftLook: unknown; setupLook: unknown };
    expect(written).toEqual({ draftLook: LOOK, setupLook: LOOK });
    // The bag planner reads what is left without a fault: no pattern, no rims.
    await planner.reload({ waitUntil: 'domcontentloaded' });
    await draftReady(planner);
    const svg = String(await planner.evaluate("bikeDrawing(BIKE_PROFILES[0], null, { theme: 'dark' })?.svg ?? ''"));
    expect(svg).toContain('<svg');
    expect(svg.includes('url(#') || svg.includes('bk-rimband')).toBe(false);
  });

  test(`[SW-OLD-TAB-WRITES] a future bike format (3, which no page writes today) would block ${which} bike write, with its message`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    await staleChange(page);
    await plannerSaves(context);
    await page.evaluate(() => localStorage.setItem('loadcheck:bikeProfilesFormat', '3'));
    const bikes = await page.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles'));
    expect(await page.evaluate('bikeStoreSet(BIKE_PROFILE_KEY, [normaliseBikeProfile({ id: "bike-old-tab", name: "Old tab" })])')).toBe(false);
    expect(await page.evaluate('BIKE_PROFILE_MESSAGE === BIKE_NEWER_MESSAGE')).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles'))).toBe(bikes);
  });

  test(`[SW-OLD-TAB-WRITES] known risk, not a guarantee (review M1): a setup or bike ${which} page saves just after a delete request goes with the rest, as it has no stamp`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    const planner = await context.newPage();
    const requestId = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
    await page.evaluate((rid) => localStorage.setItem('copilot:delete-request:v1', JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1, id: rid, createdAt: new Date().toISOString() })), requestId);
    await page.waitForTimeout(20);
    await page.evaluate(`(async () => {
      await saveSetup('After', 'saved after the request');
      await bikeStoreSet(BIKE_PROFILE_KEY, [...BIKE_PROFILES, normaliseBikeProfile({ id: 'bike-after', name: 'After' })]);
    })()`);
    expect(await page.evaluate('SETUPS.map((s) => s.name)')).toContain('After');
    await planner.goto(`${server!.origin}/tools/bags/#copilot-delete=${requestId}`, { waitUntil: 'domcontentloaded' });
    await draftReady(planner);
    expect(await planner.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:delete-applied')!).id)).toBe(requestId);
    expect(await planner.evaluate(() => [localStorage.getItem('loadcheck:setups'), localStorage.getItem('loadcheck:bikeProfiles')])).toEqual([null, null]);
  });

  test(`[SW-OLD-TAB-WRITES] known risk, not a guarantee (review M2): after a delete, ${which} tab still open writes the deleted setups and bikes back with its next save`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    const planner = await context.newPage();
    const requestId = 'ccccccccccccccccdddddddddddddddd';
    await planner.goto(`${server!.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
    await draftReady(planner);
    await planner.evaluate((rid) => localStorage.setItem('copilot:delete-request:v1', JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1, id: rid, createdAt: new Date(Date.now() + 1000).toISOString() })), requestId);
    await planner.goto('about:blank');
    await planner.goto(`${server!.origin}/tools/bags/#copilot-delete=${requestId}`, { waitUntil: 'domcontentloaded' });
    await draftReady(planner);
    expect(await planner.evaluate(() => [localStorage.getItem('loadcheck:setups'), localStorage.getItem('loadcheck:bikeProfiles')])).toEqual([null, null]);
    // The old tab heard the removals (nothing held back) and still holds the lists in memory; its next saves write them back.
    await page.evaluate(`(async () => {
      await saveSetup('Again', '');
      await bikeStoreSet(BIKE_PROFILE_KEY, BIKE_PROFILES);
    })()`);
    const setups = JSON.parse((await planner.evaluate(() => localStorage.getItem('loadcheck:setups')))!) as { name: string }[];
    expect(setups.map((x) => x.name).sort()).toEqual(['Again', 'Before']);
    const bikes = JSON.parse((await planner.evaluate(() => localStorage.getItem('loadcheck:bikeProfiles')))!) as { id: string }[];
    expect(bikes.map((b) => b.id)).toEqual(['bike-before']);
  });

  test(`[SW-OLD-TAB-WRITES] ${which} page writes no saved-at stamps; a delete request still judges its later draft by its own time and keeps it`, async ({ context, page }) => {
    await phone(page, start);
    await launch();
    await staleChange(page);
    const { planner } = await plannerSaves(context);
    await page.evaluate('flushDraft()');
    expect(await page.evaluate('DRAFT_SAVE_STATUS.state')).toBe('conflict');
    // The rider loads the newer plan in the old tab, and changes it there.
    await page.evaluate(() => (document.getElementById('tabLoad') as HTMLButtonElement).click());
    await expect.poll(() => page.evaluate('S.nights')).toBe(7);
    const ledger = await page.evaluate(() => localStorage.getItem('loadcheck:saved-at:v1'));
    expect(ledger).not.toBeNull(); // the bag planner stamped its own save
    // You's Also delete bag planner data, now: before the old tab's next change.
    const requestId = '0123456789abcdef0123456789abcdef';
    await page.waitForTimeout(20);
    await page.evaluate((rid) => localStorage.setItem('copilot:delete-request:v1', JSON.stringify({ app: 'copilot', kind: 'delete-request', v: 1, id: rid, createdAt: new Date().toISOString() })), requestId);
    await page.waitForTimeout(20);
    await page.evaluate('(async () => { S.nights = 4; await flushDraft(); })()');
    const draft = await page.evaluate(() => localStorage.getItem('loadcheck:draft'));
    expect(JSON.parse(draft!).trip.nights).toBe(4);
    expect(await page.evaluate(() => localStorage.getItem('loadcheck:saved-at:v1'))).toBe(ledger);

    // The bag planner applies the request: the draft saved after it stays, by its own time.
    await planner.goto('about:blank');
    await planner.goto(`${server!.origin}/tools/bags/#copilot-delete=${requestId}`, { waitUntil: 'domcontentloaded' });
    await draftReady(planner);
    expect(await planner.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:delete-applied')!).id)).toBe(requestId);
    expect(await planner.evaluate(() => localStorage.getItem('loadcheck:draft'))).toBe(draft);
    expect(await planner.evaluate('S.nights')).toBe(4);
  });
}

test('[SW-MOVED-CARD] a new rider never gets the card: not at first, and not after changing a plan in the bag planner (review M4)', async ({ page }) => {
  server = await startCfLike({ dir: await siteFor(true) });
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.moved-card')).toHaveCount(0);
  // Tools, the bag planner, a change of nights (which writes loadcheck:draft), Back to Wayfinch
  await page.goto(`${server.origin}/#/tools`, { waitUntil: 'domcontentloaded' });
  await page.locator('main[data-screen="tools"] a[href="/tools/bags/"]').click();
  await page.waitForURL(`${server.origin}/tools/bags/`);
  await draftReady(page);
  await page.evaluate('setNights(S.nights + 1)'); // the nights stepper's own handler
  await expect.poll(() => page.evaluate(() => localStorage.getItem('loadcheck:draft') !== null)).toBe(true);
  await page.locator('#backToWayfinch').click();
  await page.waitForURL(`${server.origin}/#/tools`);
  await expectCopilot(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.moved-card')).toHaveCount(0);
  for (const hash of ['#/trip', '#/you']) {
    await page.goto(`${server.origin}/${hash}`, { waitUntil: 'domcontentloaded' });
    await expectCopilot(page);
    await page.waitForTimeout(300);
    await expect(page.locator('.moved-card')).toHaveCount(0);
  }
});

/** A returning rider: the bag planner's keys are there before the co-pilot first runs, as after the launch. */
async function returningRider(page: Page, keys: Record<string, string>): Promise<void> {
  server = await startCfLike({ dir: await siteFor(true) });
  await page.goto(`${server.origin}/tools/bags/index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => { localStorage.clear(); for (const [key, value] of Object.entries(k)) localStorage.setItem(key, value); }, keys);
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
}

test('[SW-MOVED-CARD] a returning rider gets the card once, under Tools, its link in the same window; once followed it is gone', async ({ context, page }) => {
  await returningRider(page, { 'loadcheck:setups': '[]' });
  const card = page.locator('.moved-card');
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText('Load Check is now part of Wayfinch');
  await expect(card).toContainText('under Tools');
  const link = card.getByRole('link');
  await expect(link).toHaveAttribute('href', '/tools/bags/');
  expect(await link.getAttribute('target')).toBeNull();
  const pagesBefore = context.pages().length;
  await link.click();
  await page.waitForURL(`${server!.origin}/tools/bags/`);
  expect(context.pages().length).toBe(pagesBefore);
  await draftReady(page);
  await page.goto(`${server!.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.moved-card')).toHaveCount(0);
});

test('[SW-MOVED-CARD] a returning rider who taps Got it: gone, and still gone on the next start and on every tab', async ({ page }) => {
  await returningRider(page, { 'loadcheck:draft': '{}' });
  await expect(page.locator('.moved-card')).toBeVisible();
  await page.locator('.moved-card').getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.moved-card')).toHaveCount(0);
  for (const hash of ['#/trip', '#/tools', '#/you']) {
    await page.goto(`${server!.origin}/${hash}`, { waitUntil: 'domcontentloaded' });
    await expectCopilot(page);
    await page.waitForTimeout(300);
    await expect(page.locator('.moved-card')).toHaveCount(0);
  }
});

/** Every file of a build folder, as the host serves it. */
function servedFiles(dir: string): { path: string; bytes: number }[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((p) => !['_headers', 'build.json', 'offline-worker.js'].includes(p))
    .map((p) => ({ path: `/${p}`.replace(/\/index\.html$/, '/'), bytes: statSync(join(dir, p)).size }));
}

test('[SW-PRECACHE-ALL] the launch build precaches every file it serves, at canonical addresses, each at most 2 MiB; offline every one answers and the shortcuts open', async ({ page }) => {
  const dir = await siteFor(true);
  const listed = Object.keys((JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8')) as { files: Record<string, string> }).files).filter((p) => p !== '/offline-worker.js');
  for (const path of ['/', '/tools/bags/', '/tools/bags/bike.js', '/tools/bags/bike-photo.js', '/vendor/leaflet-1.9.4/leaflet.js', '/vendor/leaflet-1.9.4/leaflet.css',
    '/vendor/leaflet-1.9.4/LICENSE', '/legal/licences/', '/legal/imprint/', '/legal/privacy/', '/data/boundaries.v1.json', '/manifest.webmanifest']) {
    expect(listed, path).toContain(path);
  }
  const files = servedFiles(dir);
  expect(listed.slice().sort()).toEqual(files.map((f) => f.path).sort()); // the lazy chunks and every other file too
  expect(listed.some((p) => p.endsWith('index.html'))).toBe(false);
  expect(files.filter((f) => f.bytes > MAX_PRECACHED_BYTES)).toEqual([]);
  expect(files.filter((f) => f.path.startsWith('/assets/') && f.path.endsWith('.js')).length).toBeGreaterThan(2); // the shell and its lazy chunks

  server = await startCfLike({ dir });
  await page.goto(`${server.origin}/`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await waitActivated(page);
  await expect.poll(() => page.evaluate(async () => {
    const name = (await caches.keys()).find((n) => n.startsWith('wayfinch-precache-'));
    return name ? (await (await caches.open(name)).match('/__complete')) !== undefined : false;
  }), { timeout: 30_000 }).toBe(true);

  server.down(true);
  const answers = await page.evaluate(async (paths) => {
    const out: Record<string, number> = {};
    for (const path of paths) out[path] = (await fetch(path)).status;
    return out;
  }, listed);
  expect(Object.entries(answers).filter(([, status]) => status !== 200)).toEqual([]);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8')) as { shortcuts: { url: string }[] };
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/tools/bags/', '/#/tools/tyre']);
  await page.goto(`${server.origin}/tools/bags/`, { waitUntil: 'domcontentloaded' });
  await draftReady(page);
  await page.goto('about:blank');
  await page.goto(`${server.origin}/#/tools/tyre`, { waitUntil: 'domcontentloaded' });
  await expectCopilot(page);
  await expect(page.locator('main[data-screen="tools/tyre"]')).toBeVisible();
  await expect(page.locator('main[data-screen="tools/tyre"] input').first()).toBeVisible({ timeout: 20_000 }); // its lazy chunk, offline
});

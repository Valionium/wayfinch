// The store in a real browser on the real site: IndexedDB's own transactions, and localStorage's own storage events between
// two windows, which plain-Node tests only stand in for. Plan Tasks 3 to 5.
import { expect, test } from '@playwright/test';
import { atPosition, loadApp, preparedTrip, removeBuilds, withStore } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';
import type { Page } from '@playwright/test';
import { BOUNDARY_PATH } from '../../src/data/boundaries.ts';

declare const __store: StoreInPage;
declare const window: Window & { copy?: unknown; heard?: string[] };

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

async function twoWindows(page: Page): Promise<Page> {
  app = await loadApp(page);
  const other = await page.context().newPage();
  await other.goto(app.origin, { waitUntil: 'domcontentloaded' });
  await withStore(page);
  await withStore(other);
  return other;
}

test('[ST-TWO-WINDOWS] a write in one window is read again in the other within a second, through the storage event', async ({ page }) => {
  const other = await twoWindows(page);
  await preparedTrip(page, 'heidelberg-strasbourg');

  // The other window does what the app does: it listens, and re-reads the section it hears about.
  await other.evaluate(async () => {
    window.heard = [];
    window.copy = (await __store.readTrip())?.campWaterL;
    __store.onChanged((section) => {
      window.heard!.push(section);
      if (section === 'trip') void __store.readTrip().then((t) => { window.copy = t?.campWaterL; });
    });
  });
  await page.evaluate(async () => { await __store.readSettings(); });

  const written = Date.now();
  await page.evaluate(async () => { await __store.writeSettings({ campWaterL: 4.5 }); });
  await other.waitForFunction(() => window.copy === 4.5, undefined, { timeout: 1_000 });
  expect(Date.now() - written).toBeLessThan(2_000); // the write itself, on a slowed processor, plus the second above
  expect(await other.evaluate(() => window.heard)).toEqual(expect.arrayContaining(['trip', 'settings']));

  // Having re-read it, that window may write in turn; the first one, not having read, may not.
  await other.evaluate(async () => {
    const t = (await __store.readTrip())!;
    await __store.saveTrip({ ...t, campWaterL: 1 });
  });
  const refused = await page.evaluate(async () => {
    const t = { ...(await (await __store.openDb()).get('trip', 'current')), campWaterL: 3 };
    return __store.saveTrip(t).then(() => 'written', (e: Error) => e.name);
  });
  expect(refused).toBe('NewerDataError');
  await other.close();
});

test('[ST-REPLACE] in a real browser: a failed replace keeps all of the old, a good one leaves none of it', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg');
  const counts = (): Promise<number[]> => page.evaluate(async () => {
    const db = await __store.openDb();
    return [await db.count('places'), await db.count('forecast'), await db.count('positions')];
  });
  await atPosition(page, 12);
  await page.evaluate(async () => {
    const db = await __store.openDb();
    await db.put('places', { id: 'node/1', kind: 'water' });
    await db.put('forecast', { fetchedAt: new Date(), runs: [], grid: [], has15: false }, 'current');
  });
  expect(await counts()).toEqual([1, 1, 1]);

  const name = await page.evaluate(async () => {
    const t = (await __store.readTrip())!;
    const bad = { ...t.route, id: 'route-bad', extra: () => 1 };
    return __store.replaceRoute(bad).then(() => 'replaced', (e: Error) => e.name);
  });
  expect(name).toBe('DataCloneError');
  expect(await counts()).toEqual([1, 1, 1]);
  expect(await page.evaluate(async () => (await __store.readTrip())!.route.id)).not.toBe('route-bad');

  await page.evaluate(async () => {
    const t = (await __store.readTrip())!;
    await __store.replaceRoute({ ...t.route, id: 'route-new' });
  });
  expect(await counts()).toEqual([0, 0, 0]);
  expect(await page.evaluate(async () => (await __store.readTrip())!.route.id)).toBe('route-new');
});

test('[ST-RETENTION] in a real browser: dates come back as dates, and an old position is gone from the database', async ({ page }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'heidelberg-strasbourg');
  await atPosition(page, 12, { ageMin: 49 * 60 });
  await atPosition(page, 20, { ageMin: 5 });
  const seen = await page.evaluate(async () => {
    const i = (await __store.readInputs(new Date()))!;
    return {
      kms: i.positions.map((p) => p.km), isDate: i.positions[0]!.at instanceof Date,
      stored: await (await __store.openDb()).count('positions'),
    };
  });
  expect(seen).toEqual({ kms: [20], isDate: true, stored: 1 });
});

test('[ST-DELETE] with a second window open, delete is not held up, and the bag planner keeps its keys', async ({ page }) => {
  const other = await twoWindows(page);
  await preparedTrip(page, 'heidelberg-strasbourg');
  await other.evaluate(async () => { await __store.readTrip(); }); // holds a connection
  const plan = await page.evaluate(() => {
    const value = JSON.stringify({ bags: [1, 2, 3] });
    localStorage.setItem('loadcheck:draft', value);
    return value;
  });

  await page.evaluate(() => __store.deleteCopilotData());

  const after = await page.evaluate(async () => ({
    names: (await indexedDB.databases()).map((d) => d.name),
    copilot: Object.keys(localStorage).filter((k) => k.startsWith('copilot:')),
    draft: localStorage.getItem('loadcheck:draft'),
  }));
  expect(after.names).not.toContain('copilot');
  expect(after.copilot).toEqual([]);
  expect(after.draft).toBe(plan);
  expect(await other.evaluate(async () => __store.readTrip())).toBeNull();
  await other.close();
});

test('[ST-DELETE] Prepare this route cannot recreate the database after another window deletes it during the zone lookup', async ({ page }) => {
  const other = await twoWindows(page);
  await preparedTrip(page, 'heidelberg-strasbourg');
  let start: () => void = () => undefined;
  let resume: () => void = () => undefined;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const held = new Promise<void>((resolve) => { resume = resolve; });
  await other.exposeFunction('holdZoneLookup', () => {
    start();
    return held;
  });
  const prepare = other.evaluate(async () => {
    const fetchReal = window.fetch;
    window.fetch = async (input, init) => {
      if (input === '/data/boundaries.v1.json') {
        await (window as Window & { holdZoneLookup: () => Promise<void> }).holdZoneLookup();
      }
      return fetchReal(input, init);
    };
    try { return await __store.prepare(); }
    finally { window.fetch = fetchReal; }
  });

  await started;
  await page.evaluate(() => __store.deleteCopilotData());
  resume();
  expect((await prepare).at(-1)).toMatchObject({ step: 'places', ok: false });
  expect(await other.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))).not.toContain('copilot');
  await other.close();
});

test.describe('En route follows a zone lookup in another tab', () => {
  test.use({ timezoneId: 'America/New_York', serviceWorkers: 'block' });

  test('[TRIP-LOCAL-ZONE] an open En route tab switches to the route\'s zone as soon as Trip stores it', async ({ page, context }) => {
    // 23:30 on 14 July in New York, already 05:30 on the trip's first day in Heidelberg.
    const now = new Date('2026-07-15T03:30:00Z');
    await page.clock.setFixedTime(now);
    app = await loadApp(page, { launch: true, path: '/#/ahead' });
    await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: '2026-07-15' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const strip = page.locator('[data-strip] .ah-strip-label');
    await expect(strip).toHaveText('Day 1');

    const trip = await context.newPage();
    await trip.clock.setFixedTime(now);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const boundaries = `**${BOUNDARY_PATH}`;
    await trip.route(boundaries, async (route) => { await held; await route.continue(); });
    try {
      await Promise.all([trip.waitForRequest(boundaries), trip.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' })]);
      await expect(strip).toHaveText('Day 1');

      release();
      await expect(trip.locator('[data-trip-line]')).toContainText('Starts today');
      await expect(strip).toHaveText('Today');
    } finally {
      release();
      await trip.close();
    }
  });
});

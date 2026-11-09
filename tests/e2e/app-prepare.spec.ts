// Prepare this route in a real browser on the real site: IndexedDB's own transactions and a tab that is really closed
// mid-download, which plain-Node tests only stand in for. No outside address is reached. Plan Task 9.
import { expect, test } from '@playwright/test';
import { loadApp, preparedTrip, removeBuilds, servePack, withStore } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';
import type { Page } from '@playwright/test';

declare const __store: StoreInPage;

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

// A long download on a throttled phone takes its time.
test.setTimeout(180_000);

const counts = (page: Page) => page.evaluate(async () => {
  const db = await __store.openDb();
  return { places: await db.count('places'), hours: await db.count('hours'), matches: await db.count('matches'), tiles: (await db.getAllKeys('savedTiles')).map(String) };
});

test('[PREP-STEPS] Prepare this route on the real site: places and hours are saved, weather is named, and the answers read them', async ({ page }) => {
  app = await loadApp(page);
  const trip = await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: '2026-10-17', places: true });
  const stored = await counts(page);
  expect(stored.places).toBeGreaterThan(100);
  expect(stored.hours).toBeGreaterThan(100);
  expect(stored.matches).toBeGreaterThan(100);
  const seen = await page.evaluate(async () => {
    const i = (await __store.readInputs(new Date('2026-10-16T08:00:00Z')))!;
    const s = __store.screen(i);
    return { zones: i.routeZones.map((z) => z.holidayZone), savedKm: i.savedKm, missing: s.cards.water.missing, numbers: s.chips.emergency.numbers };
  });
  // The fixture runs through Rhineland-Palatinate by Speyer, as the unsimplified OpenStreetMap borders say too.
  expect([...new Set(seen.zones)].sort()).toEqual(['DE-BW', 'DE-RP', 'FR-67']);
  expect([seen.zones[0], seen.zones.at(-1)]).toEqual(['DE-BW', 'FR-67']);
  expect(seen.savedKm).toEqual([{ fromKm: 0, toKm: trip.route.lengthKm }]);
  expect(seen.missing).toContain('weather');
  expect(seen.missing).not.toContain('places');
  expect(seen.numbers).toContain('112');
});

test('[PREP-RESUME] a tab closed mid-download leaves whole batches; the next run fetches only what is missing, on the same build', async ({ page, context }) => {
  app = await loadApp(page);
  await preparedTrip(page, 'multi-day-800', { departureDate: '2026-10-17' });

  // Lets the first batches through, then keeps every tile waiting, as a phone that has lost its network does.
  let tiles = 0;
  const never = new Promise<void>(() => undefined);
  let release: () => void = () => undefined;
  const heldBack = new Promise<void>((resolve) => { release = resolve; });
  const served = await servePack(page, 'multi-day-800', (path) => {
    if (!path.includes('/t/')) return undefined;
    tiles++;
    if (tiles === 8) release();
    return tiles > 6 ? never : undefined;
  });
  void page.evaluate(() => __store.prepare()).catch(() => undefined);
  await heldBack;
  await expect.poll(async () => (await counts(page)).tiles.length).toBe(6);

  // Killed.
  await page.close({ runBeforeUnload: false });
  await context.unrouteAll({ behavior: 'ignoreErrors' });

  const next = await context.newPage();
  await context.route(/^https:\/\//, (route) => route.abort());
  await next.goto(app.origin, { waitUntil: 'domcontentloaded' });
  await withStore(next);
  const after = await counts(next);
  expect(after.tiles).toHaveLength(6);
  // Whole batches: each saved tile's places are all there, and no others.
  const byKey = new Map(served.manifest.tiles.map((t) => [`${t.z}/${t.x}/${t.y}`, t.places]));
  expect(after.places).toBe(after.tiles.reduce((sum, k) => sum + byKey.get(k)!, 0));

  const again = await servePack(next, 'multi-day-800');
  const reports = await next.evaluate(() => __store.prepare());
  // Every tile is in; only Liechtenstein, outside the first countries, has no place data.
  expect(reports.find((r) => r.step === 'places')!.note).toMatch(/^No place data for km/);
  expect(again.requests.filter((r) => r.endsWith('current.json') || r.endsWith('manifest.json'))).toEqual([]);
  const asked = again.requests.map((r) => r.replace(`/packs/${served.manifest.buildId}/t/`, '').replace('.json', '')).sort();
  expect(asked).toEqual([...byKey.keys()].filter((k) => !after.tiles.includes(k)).sort());
  expect((await counts(next)).tiles).toHaveLength(served.manifest.tiles.length);
  await next.close();
});

/**
 * A full disk as Chromium shows it: the requests went through, then the commit fails, the transaction is undone, its requests
 * read AbortError, and only `tx.error` says QuotaExceededError. The undoing is the browser's own. The cause is set by hand:
 * Storage.overrideQuotaForOrigin had no effect on IndexedDB when tried, so no test here fills a real disk.
 */
const fillDiskAfter = (page: Page, tiles: number, how: 'commit' | 'throw') => page.evaluate(({ room, how: way }) => {
  const w = window as unknown as { diskFull: boolean; room: number };
  w.diskFull = false;
  w.room = room;
  let seen = 0;
  Object.defineProperty(IDBTransaction.prototype, 'error', { configurable: true, get: () => (w.diskFull ? new DOMException('The quota has been exceeded.', 'QuotaExceededError') : null) });
  for (const method of ['put', 'add'] as const) {
    const real = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function patched(this: IDBObjectStore, ...args: Parameters<typeof real>) {
      if (this.name === 'savedTiles' && ++seen > w.room) w.diskFull = true;
      // As a browser may also say it: the store call itself refuses, inside a real transaction the store then undoes.
      if (w.diskFull && way === 'throw') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      const request = real.apply(this, args);
      if (w.diskFull) this.transaction.abort();
      return request;
    };
  }
}, { room: tiles, how });

for (const how of ['commit', 'throw'] as const) test(`[PREP-QUOTA] no room (${how === 'commit' ? 'the commit refused' : 'a store call refused'}): "Storage full" with what was saved, answers name what is missing, and a rerun with room finishes`, async ({ page }) => {
  app = await loadApp(page);
  const trip = await preparedTrip(page, 'multi-day-800', { departureDate: '2026-10-17' });
  const served = await servePack(page, 'multi-day-800');

  await fillDiskAfter(page, 6, how);
  const reports = await page.evaluate(() => __store.prepare());
  const places = reports.find((r) => r.step === 'places')!;
  expect(places.ok).toBe(false);
  expect(places.note).toMatch(/^Storage full/);
  // Every step still reported, none threw.
  expect(reports.map((r) => r.step)).toEqual(['heights', 'places', 'hours', 'weather', 'baseline', 'save']);

  const seen = await counts(page);
  // The batch that didn't fit is gone whole; no tile reads as saved without its places.
  expect(seen.tiles).toHaveLength(6);
  const byKey = new Map(served.manifest.tiles.map((t) => [`${t.z}/${t.x}/${t.y}`, t.places]));
  expect(seen.places).toBe(seen.tiles.reduce((sum, k) => sum + byKey.get(k)!, 0));
  expect(places.note).toContain(`6 of ${served.manifest.tiles.length}`);

  // The session keeps working, and no answer reads the stretch as there.
  const answers = await page.evaluate(async () => {
    const i = (await __store.readInputs(new Date('2026-10-16T08:00:00Z')))!;
    const s = __store.screen(i);
    return { covered: i.savedKm.reduce((sum, r) => sum + r.toKm - r.fromKm, 0), missing: s.cards.water.missing, numbers: s.chips.emergency.numbers };
  });
  expect(answers.covered).toBeLessThan(trip.route.lengthKm);
  expect(answers.missing).toContain('places');
  expect(answers.numbers).toContain('112');

  // With room again the same run finishes, and asks only for what wasn't saved.
  await page.evaluate(() => {
    const w = window as unknown as { diskFull: boolean; room: number };
    w.diskFull = false;
    w.room = Infinity;
  });
  const before = served.requests.length;
  const second = await page.evaluate(() => __store.prepare());
  // Every tile is in; only Liechtenstein, outside the first countries, has no place data.
  expect(second.find((r) => r.step === 'places')!.note).toMatch(/^No place data for km/);
  expect(served.requests.length - before).toBe(served.manifest.tiles.length - seen.tiles.length);
  const whole = await page.evaluate(async () => {
    const i = (await __store.readInputs(new Date('2026-10-16T08:00:00Z')))!;
    return { covered: i.savedKm.reduce((s, r) => s + r.toKm - r.fromKm, 0), coverable: i.routeZones.filter((z) => z.country !== 'XX').reduce((s, z) => s + z.toKm - z.fromKm, 0) };
  });
  expect(Math.abs(whole.covered - whole.coverable)).toBeLessThan(0.6);
});

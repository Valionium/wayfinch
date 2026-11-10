// Your bike in the bag planner, in a real browser, built with the launch switch on (sub-project 6, group 1): the rig drawn by bike.js.
// Nothing here prints the page: failures compare booleans, counts and short values.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

async function planner(page: Page, entries: Record<string, string> = {}): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
}
/** Step two with no bags: every spot dashed and offered. */
async function bagsStep(page: Page): Promise<void> {
  await page.evaluate('S.bags = []; S.decks = { bar:false, rack:false }; go(2)');
}

test('[LC-RIG-TAPS] the rig drawn by bike.js: a tap on each dashed spot adds its bag, the keyboard does the same, and Remove takes it off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await bagsStep(page);
  const rig = page.locator('#rigSvg');
  for (const key of ['seat', 'bar', 'frame', 'top:front', 'bottle:dt']) {
    const before = await page.evaluate('S.bags.length');
    await rig.locator(`[data-add="${key}"]`).first().click();
    expect(await page.evaluate('S.bags.length'), key).toBe((before as number) + 1);
  }
  // the keyboard: each control is a labelled button; Enter on the fork spot adds a fork bag
  const fork = rig.locator('[data-add="fork"]');
  await expect(fork).toHaveAttribute('role', 'button');
  await expect(fork).toHaveAttribute('aria-label', /^Add /);
  await fork.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate("S.bags.filter(b => b.pos === 'fork').length")).toBe(1);
  // the second of the pair, the frame shape numbers and a deck
  await rig.locator('.pairghost').first().click({ force: true }); // the bag in front shares its target: both add the second
  expect(await page.evaluate("S.bags.find(b => b.pos === 'fork').pair")).toBe(true);
  await rig.locator('[data-setshape$=":2"]').click();
  expect(await page.evaluate("frameShapeIdx(S.bags.find(b => b.pos === 'frame'))")).toBe(2);
  await rig.locator('[data-deck="bar"]').click();
  expect(await page.evaluate('S.decks.bar')).toBe(true);
  // Remove mode: a tap on the seat pack takes it off
  await page.locator('#rigMode').click();
  const seat = await page.evaluate("S.bags.find(b => b.pos === 'seat').uid");
  await rig.locator(`[data-del="${seat}"]`).click();
  expect(await page.evaluate("S.bags.some(b => b.pos === 'seat')")).toBe(false);
  expect(errors).toEqual([]);
});

test('[LC-RIG-TAPS] on the finished plan a tap opens the bag, everything else dims, the bike included, and closing brings it back', async ({ page }) => {
  await planner(page);
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }, { uid:3, pos:'bar', L:12 }]; S.nextUid = 4; go(2); go(3); go(4)");
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  const bag = page.locator('#rigSvg [data-inspect]').first();
  await bag.click();
  await expect(page.locator('#bagPop')).toBeVisible();
  // wide enough, the bag is lifted beside its list and the rest dims; on a phone the bag opens as a sheet over the rig
  if (await page.locator('#rigBox').evaluate((el) => el.clientWidth >= 620)) {
    await expect(page.locator('#rigSvg')).toHaveClass(/focussed/);
    await expect.poll(() => page.locator('#rigBike svg.bk').evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.3);
  } else {
    await expect(page.locator('#bagPop .sheetglyph svg')).toBeVisible();
  }
  await page.locator('#bagPop .popx').click();
  await expect(page.locator('#rigSvg')).not.toHaveClass(/focussed/);
  await expect.poll(() => page.locator('#rigBike svg.bk').evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
});

test('[LC-RIG-THUMB] a saved setup\'s thumbnail keeps the bike and its colour; a hostile thumbnail still shows nothing', async ({ page }) => {
  await planner(page, { 'loadcheck:bikeProfile': JSON.stringify({ id: 'bike_green', name: 'Green', look: { colour: '#2f7d4f', bars: 'flat', ebike: null } }) });
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }]; S.nextUid = 2; go(2)");
  const out = await page.evaluate(() => {
    const w = window as unknown as { buildThumb: (id: string) => string; safeDataThumb: (s: string) => string };
    const thumb = w.buildThumb('st1');
    const clean = w.safeDataThumb(thumb);
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    const hostile = w.safeDataThumb('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path class="bk-paint" stroke="url(https://example.test/x)" onload="alert(1)" d="M0 0"/></svg>');
    return {
      paint: [...doc.querySelectorAll('.bk-paint')].map((p) => p.getAttribute('stroke')),
      tyres: doc.querySelectorAll('.bk-tyre').length,
      hits: doc.querySelectorAll('.hit').length,
      hostile: /script|onload|example\.test|url\(/.test(hostile),
    };
  });
  expect(out.paint.length).toBeGreaterThan(0);
  expect(new Set(out.paint)).toEqual(new Set(['#2f7d4f']));
  expect(out.tyres).toBe(2);
  expect(out.hits).toBe(0);
  expect(out.hostile).toBe(false);
});

const BLUE = { id: 'bike_blue', name: 'Blue tourer', frontTyre: '40-622', rearTyre: '40-622', fit: { style: 'diamond-level', size: { kind: 'letter', value: 'M' } }, look: { colour: '#2563b8', bars: 'drop', ebike: false } };
const TOWN = { id: 'bike_town', name: 'Town bike', fit: { style: 'step-through' }, look: null };
const BIKES = { 'loadcheck:bikeProfile': JSON.stringify(BLUE), 'loadcheck:bikeProfiles': JSON.stringify([BLUE, TOWN]) };

test('[LC-LOOK-DEEP] a link from the co-pilot opens that bike at Look, without applying it; the fragment goes, Back leads home', async ({ page }) => {
  await planner(page, BIKES);
  await page.goto(`${app!.origin}/tools/bags/#bike-details=bike_town&back=trip&section=look`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await expect(page.locator('#bikeLookTitle')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate('BIKE_PROFILE_EDITOR_ID')).toBe('bike_town');
  expect(await page.evaluate('S.bikeProfile.id')).toBe('bike_blue');
  await expect(page.getByRole('link', { name: 'Back to Trip' })).toHaveAttribute('href', '/#/trip');
});

test('[LC-LOOK-TAPS] every Look choice is a labelled tap target of at least 44 px, and no tap opens a keyboard', async ({ page }) => {
  await planner(page, BIKES);
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  const look = page.locator('#bikeLook');
  // nothing changed yet: no Undo, and no Back link when Bike details was not opened from the co-pilot
  await expect(page.locator('#lookUndo')).toBeHidden();
  await expect(page.locator('#bikeDetailsBack')).toBeHidden();
  const picker = await page.locator('#lookPicker').boundingBox();
  expect(Math.abs(picker!.width - picker!.height)).toBeLessThan(1); // the picker's own swatch is a round dot
  const targets = look.locator('label.look-swatch, label.look-chip');
  expect(await targets.count()).toBe(17 + 1 + 4 + 3);
  for (const box of await targets.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, text: el.textContent!.trim() }; }))) {
    expect(box.h, box.text).toBeGreaterThanOrEqual(44);
    expect(box.w, box.text).toBeGreaterThanOrEqual(44);
    expect(box.text.length, 'labelled').toBeGreaterThan(0);
  }
  for (const name of ['Green', 'Flat', 'Yes', 'None', 'Not set']) {
    await look.locator('label', { hasText: new RegExp(`^${name}$`) }).first().click();
    expect(await page.evaluate(() => { const a = document.activeElement as HTMLInputElement | null; return a?.tagName === 'INPUT' && !['radio', 'color'].includes(a.type); }), name).toBe(false);
  }
  await expect(look.getByRole('radio', { name: 'Not set' }).first()).toBeChecked();
  await expect(page.locator('#lookUndo')).toBeVisible();
});

/** Five swatch taps in a row. The stroke is read in the same task as each tap; the drawing is timed from the radio's change (what the
 *  page does) to the repainted preview, so the browser's own focus and layout for a tapped radio are not counted. */
async function fiveTaps(page: Page) {
  await planner(page, BIKES);
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await expect(page.locator('#lookPreview .bk-paint').first()).toHaveAttribute('stroke', '#2563b8');
  return page.evaluate(() => new Promise<{ ms: number[]; strokes: (string | null | undefined)[]; rig: string | null | undefined }>((resolve) => {
    const ms: number[] = [];
    const strokes: (string | null | undefined)[] = [];
    let changed = 0;
    document.addEventListener('change', () => { changed = performance.now(); }, { capture: true });
    for (const name of ['Red', 'Green', 'Yellow', 'Navy', 'Red']) {
      const label = [...document.querySelectorAll('#lookSwatches label')].find((l) => l.textContent!.trim() === name) as HTMLElement;
      label.click();
      strokes.push(document.querySelector('#lookPreview .bk-paint')?.getAttribute('stroke'));
      ms.push(performance.now() - changed);
    }
    // the rig behind is repainted before the next frame is shown
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ms, strokes, rig: document.querySelector('#rigBike .bk-paint')?.getAttribute('stroke') })));
  }));
}

test("[LC-LOOK-INSTANT] a swatch tap changes the preview frame's stroke in the same task, and the rig behind before the next frame", async ({ page }) => {
  const r = await fiveTaps(page);
  expect(r.strokes).toEqual(['#c62f2a', '#2f7d4f', '#f1c232', '#1f2f55', '#c62f2a']);
  expect(r.rig).toBe('#c62f2a');
  // Undo, in one tap, restores the opening look
  await page.locator('#lookUndo').click();
  await expect(page.locator('#lookPreview .bk-paint').first()).toHaveAttribute('stroke', '#2563b8');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.colour)).toBe('#2563b8');
});

// The 20 ms is a time budget, so it is timed like the others: on the phone stand-in, alone, after every other project ([PERF- budgets).
test('[LC-LOOK-INSTANT] each swatch tap is drawn within 20 ms on the phone stand-in, timed alone with the [PERF- budgets', async ({ page }) => {
  const r = await fiveTaps(page);
  expect(r.strokes[0]).toBe('#c62f2a');
  for (const ms of r.ms) expect(ms).toBeLessThanOrEqual(20);
});

/** A photo made in the page: a lawn, with a red frame tube that has a white highlight and a black cable on it. */
async function lawnPhoto(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 800;
    const x = c.getContext('2d')!;
    x.fillStyle = '#4f8a2b'; x.fillRect(0, 0, 1200, 800);
    x.fillStyle = '#c62f2a'; x.fillRect(500, 300, 200, 200);
    x.fillStyle = '#ffffff'; x.fillRect(500, 380, 200, 4);
    x.fillStyle = '#000000'; x.fillRect(500, 420, 200, 4);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const v of bytes) s += String.fromCharCode(v);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}
type Urls = { made: number; revoked: number };
/** Counts object URLs made and revoked, from before the page's own code runs. */
async function watchObjectUrls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __urls: Urls };
    w.__urls = { made: 0, revoked: 0 };
    const make = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (o: Blob | MediaSource) => { w.__urls.made += 1; return make(o); };
    URL.revokeObjectURL = (u: string) => { w.__urls.revoked += 1; revoke(u); };
  });
}
const urls = (page: Page) => page.evaluate(() => (window as unknown as { __urls: Urls }).__urls);
/** Taps the photo at a share of its width and height. */
async function tapPhoto(page: Page, fx: number, fy: number): Promise<void> {
  await page.locator('.photo-stage').evaluate((el) => el.scrollIntoView({ block: 'end' })); // below the drawing that stays at the top
  const box = (await page.locator('.photo-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}
async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
    caches: await Promise.all((await caches.keys()).sort().map(async (name) => [name, (await (await caches.open(name)).keys()).map((r) => r.url).sort()])),
    idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name).sort() : [],
  }));
}
const RED = /^#c[0-9a-f]2[0-9a-f]2[0-9a-f]$/;

test('[LC-PHOTO-NOREQ] from the file choice to Use this colour, no request at all; the colour is the frame, not the lawn', async ({ page }) => {
  await planner(page, BIKES);
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await page.locator('#lookPhoto').click();
  await expect(page.locator('.photo-pick')).toBeVisible();
  const png = await lawnPhoto(page);
  const requests: string[] = [];
  // the photo's own object URL is read inside the page; nothing goes out
  page.on('request', (r) => { if (!/^(blob|data):/.test(r.url())) requests.push(r.url()); });
  await page.locator('.photo-file').setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-canvas')).toBeVisible();
  expect(await page.locator('.photo-canvas').evaluate((c: HTMLCanvasElement) => Math.max(c.width, c.height))).toBe(640);
  await tapPhoto(page, 600 / 1200, 450 / 800);
  await expect(page.locator('.photo-loupe')).toBeVisible();
  await expect(page.locator('#lookPreview .bk-paint').first()).toHaveAttribute('stroke', RED);
  // tap again, on the lawn: the drawing follows the tap
  await page.getByRole('button', { name: 'Tap again' }).click();
  await tapPhoto(page, 100 / 1200, 100 / 800);
  await expect(page.locator('#lookPreview .bk-paint').first()).not.toHaveAttribute('stroke', RED);
  await tapPhoto(page, 600 / 1200, 350 / 800);
  await page.getByRole('button', { name: 'Use this colour' }).click();
  await expect(page.locator('.photo-pick')).toHaveCount(0);
  expect(await page.evaluate('S.bikeProfile.look.colour')).toMatch(RED);
  expect(requests).toEqual([]);
});

test('[LC-PHOTO-NOSTORE] only the colour is kept: storage and Cache Storage hold no photo; canvas, file and its URL are released on leaving', async ({ page }) => {
  await watchObjectUrls(page);
  await planner(page, BIKES);
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await page.locator('#lookPhoto').click();
  const before = await storageSnapshot(page);
  const png = await lawnPhoto(page);
  await page.locator('.photo-file').setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-canvas')).toBeVisible();
  expect(await page.locator('.photo-file').inputValue()).toBe(''); // emptied once the photo is drawn
  expect(await urls(page)).toEqual({ made: 1, revoked: 1 });
  await tapPhoto(page, 0.5, 450 / 800);
  // Close without using it: nothing changes, and the drawing goes back
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.photo-pick')).toHaveCount(0);
  await expect(page.locator('#lookPreview .bk-paint').first()).toHaveAttribute('stroke', '#2563b8');
  expect(await storageSnapshot(page)).toEqual(before);
  // again, and Use: only the bike's colour changes
  await page.locator('#lookPhoto').click();
  await page.locator('.photo-file').setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-canvas')).toBeVisible();
  const canvas = await page.locator('.photo-canvas').elementHandle();
  await tapPhoto(page, 0.5, 450 / 800);
  await page.getByRole('button', { name: 'Use this colour' }).click();
  expect(await canvas!.evaluate((c: HTMLCanvasElement) => [c.width, c.height, c.isConnected])).toEqual([0, 0, false]);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.colour as string)).toMatch(RED);
  const after = await storageSnapshot(page);
  expect(after.caches).toEqual(before.caches);
  expect(after.idb).toEqual(before.idb);
  for (const [key, value] of Object.entries(after.local)) {
    expect(value, key).not.toMatch(/data:image|blob:|base64/);
    // what changed is the bike and the plan, and what is derived from them: their save stamps and the load summary (group 2)
    if (value !== before.local[key]) expect(['loadcheck:bikeProfile', 'loadcheck:bikeProfiles', 'loadcheck:bikeProfilesFormat', 'loadcheck:draft', 'loadcheck:saved-at:v1', 'loadcheck:summary:v1'], key).toContain(key);
  }
  expect(await urls(page)).toEqual({ made: 2, revoked: 2 });
});

test('[LC-PHOTO-OFFLINE] bike-photo.js loads only on the first tap, is precached, and the picker opens in flight mode', async ({ page, context }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/bike-photo.js')) asked.push(r.url()); });
  await planner(page, BIKES);
  expect(asked).toEqual([]);
  expect(await page.evaluate('typeof window.WayfinchBikePhoto')).toBe('undefined');
  const build = await page.evaluate(async () => (await (await fetch('/build.json')).json()) as { files: Record<string, string> });
  expect(Object.keys(build.files)).toContain('/tools/bags/bike-photo.js');
  // the site's worker, as Make available offline registers it
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/offline-worker.js', { scope: '/', updateViaCache: 'none' });
    const w = reg.installing ?? reg.waiting ?? reg.active;
    if (w && w.state !== 'activated') await new Promise<void>((res) => w.addEventListener('statechange', () => { if (w.state === 'activated') res(); }));
  });
  await page.reload({ waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  const served: boolean[] = [];
  page.on('response', (r) => { if (r.url().endsWith('/bike-photo.js')) served.push(r.fromServiceWorker()); });
  expect(await page.evaluate('typeof window.WayfinchBikePhoto')).toBe('undefined'); // not loaded until the first tap
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await page.locator('#lookPhoto').click();
  await expect(page.locator('.photo-pick')).toBeVisible();
  await expect(page.locator('.photo-choose')).toContainText('Choose or take a photo');
  expect(served).toEqual([true]); // asked for on the first tap, and served from the worker's cache
  // and it works in flight mode: a photo, a tap, Use this colour, stored
  const png = await lawnPhoto(page);
  await page.locator('.photo-file').setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-canvas')).toBeVisible();
  await tapPhoto(page, 0.5, 450 / 800);
  await page.getByRole('button', { name: 'Use this colour' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.colour as string)).toMatch(RED);
  await context.setOffline(false);
});

test('[BK-SHAPES-PAGE] a tap on the middle of each drawn bag shape reaches that bag: Remove takes off the very bag tapped', async ({ page }) => {
  await planner(page);
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:12 }, { uid:3, pos:'top', L:1, slot:'front' }, { uid:4, pos:'fork', L:3, pair:true }, { uid:5, pos:'rack', L:20, pair:true }, { uid:6, pos:'pack', L:15 }, { uid:7, pos:'frame', L:6 }]; S.nextUid = 8; S.decks = { bar:false, rack:false }; go(2); S.editMode = 'remove'; drawRig()");
  // one bag of a pair goes at a time, as before: count the bags on the bike, a pair as two
  const units = (uid?: number) => page.evaluate(`S.bags.filter(b => ${uid ?? 'b.uid'} === b.uid).reduce((n, b) => n + (b.pair ? 2 : 1), 0)`) as Promise<number>;
  for (let left = 9; left > 0; left--) {
    const group = page.locator('#rigSvg g.bagg.removable:has(path.bag-shell)').last();
    const uid = Number(await group.getAttribute('data-del'));
    const before = await units(uid);
    const box = (await group.locator('path.bag-shell').last().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await units(uid), `bag ${uid}`).toBe(before - 1);
    expect(await units()).toBe(left - 1);
  }
});

// The owner's decision of 9 Nov 2026 (weight map design, "slim the weight map down"): at the packing check one line under the drawing,
// the map only behind "Show the map" when the line says the plan differs from the best arrangement found in the rider's own bags.
async function packingCheck(page: Page, bags: string): Promise<void> {
  await page.evaluate(`${bags} go(2); go(3); go(4)`);
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  const line = page.locator('#weightLine');
  await expect(line).toBeVisible();
  await expect(line).not.toHaveText('Checking the balance…', { timeout: 30_000 });
  await expect(line).not.toHaveAttribute('aria-busy', 'true');
}
// bikepacking bags: once balanced, the must-reach things in the frame bag still keep the load from the best arrangement found
const BP_BAGS = "S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:4.5 }, { uid:4, pos:'top', L:1, slot:'front' }, { uid:5, pos:'fork', L:3, pair:true }]; S.nextUid = 6; S.decks = { bar:false, rack:false };";
// the same with a backpack, and the bike lock put in it by hand
const LOCK_BAGS = "S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:4.5 }, { uid:4, pos:'top', L:1, slot:'front' }, { uid:5, pos:'fork', L:3, pair:true }, { uid:6, pos:'pack', L:10 }]; S.nextUid = 7; S.decks = { bar:false, rack:false }; S.pinned = { lock:'6-0' };";

test('[WM-PAGE] the line at the packing check; Show the map off by default, weightmap.js only on its first press, yours over the ideal on a phone, the difference opt-in, the backpack on your back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const loads: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/weightmap.js')) loads.push(r.url()); });
  await planner(page);
  // the bike lock put in the backpack by hand, so the backpack carries some of the kit
  await page.evaluate(`${LOCK_BAGS} go(2); go(3)`);
  const show = page.locator('#rigWeightMap');
  const line = page.locator('#weightLine');
  await expect(line).toBeHidden(); // not before the packing check
  await expect(show).toBeHidden();
  await packingCheck(page, LOCK_BAGS);
  // the rider's hand placement keeps the load from the best arrangement found: said, with the map a press away
  await expect(line).toHaveText(/^Your hand placement in the backpack \(bike lock\) puts more weight on your back\./);
  await expect(show).toBeVisible();
  await expect(show).toHaveText('Show the map');
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#weightMap')).toBeHidden();
  expect(loads).toHaveLength(0);
  await show.click();
  const cards = page.locator('#weightMap .wm-card');
  await expect(cards).toHaveCount(2);
  await expect(show).toHaveAttribute('aria-expanded', 'true');
  await expect(show).toHaveText('Hide the map');
  expect(loads).toHaveLength(1);
  await expect(page.locator('#weightMap .wm-cap')).toContainText('weighted kilos');
  await expect(page.locator('#weightMap .wm-ideal, #weightMap .wm-with, #weightMap .wm-without')).toHaveCount(0); // one ideal, no switch
  await expect(cards.nth(1).locator('figcaption')).toHaveText('Ideal Your bags and things, packed for the best balance the planner found');
  await expect(cards.nth(0).locator('.wm-sum')).toContainText('Of the weighted load:');
  await expect(cards.nth(0).locator('svg')).toHaveAttribute('aria-label', /^Your weight\. Of the weighted load: /);
  await expect(cards.nth(0).locator('canvas')).toHaveAttribute('aria-hidden', 'true');
  // the backpack is its own patch, labelled; the ideal never has more on the back than yours
  await expect(cards.nth(0).locator('.wm-label')).toHaveText(['on your back']);
  const back = async (n: number) => Number(/(\d+)% on your back/.exec((await cards.nth(n).locator('.wm-sum').textContent()) ?? '')![1]);
  expect(await back(1)).toBeLessThanOrEqual(await back(0));
  // painted: the canvas holds the map
  const painted = await cards.nth(0).locator('canvas').evaluate((c: HTMLCanvasElement) => c.width > 0 && c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data[3] === 255);
  expect(painted).toBe(true);
  // a phone stacks yours over the ideal; a wide window puts them side by side
  const [a, b] = await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  if ((page.viewportSize()?.width ?? 0) < 700) expect(b!.top).toBeGreaterThanOrEqual(a!.bottom - 1);
  else {
    expect(Math.abs(b!.top - a!.top)).toBeLessThan(2);
    // side by side, the two maps stand level even when one heading wraps (review of PR 71, M2)
    const [wa, wb] = await cards.locator('.wm-wrap').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(Math.abs(wb! - wa!)).toBeLessThanOrEqual(1);
  }
  // each sentence is read once: the picture's name carries it, the paragraph under it is for the eye (review of PR 71, M3)
  await expect(cards.nth(0).locator('.wm-sum')).toHaveAttribute('aria-hidden', 'true');
  // the difference is opt-in; from the keyboard, focus stays on its button (review of PR 71, I2)
  const diff = page.locator('#weightMap .wm-diff');
  await diff.focus();
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator('.wm-sum')).toContainText(/points|Close to the ideal/);
  await expect(diff).toHaveText('Hide where yours differs');
  await expect(diff).not.toHaveAttribute('aria-pressed');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('wm-diff'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(2);
  expect(await page.evaluate(() => document.activeElement?.classList.contains('wm-diff'))).toBe(true);
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(3);
  // hidden and shown again: nothing downloads a second time
  await show.click();
  await expect(page.locator('#weightMap')).toBeHidden();
  await show.click();
  await expect(cards).toHaveCount(3);
  expect(loads).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('[WM-NOTE] a load the search finds nothing better for: the one line, no map and nothing downloaded', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const loads: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/weightmap.js')) loads.push(r.url()); });
  await planner(page);
  await packingCheck(page, "S.bags = [{ uid:1, pos:'pack', L:30 }]; S.nextUid = 2; S.decks = { bar:false, rack:false };");
  await expect(page.locator('#weightLine')).toHaveText('Your load is as balanced as your bags allow.');
  await expect(page.locator('#rigWeightMap')).toBeHidden();
  await expect(page.locator('#weightMap')).toBeHidden();
  expect(loads).toHaveLength(0);
  expect(errors).toEqual([]);
});

// The owner's finding G (8 Nov 2026): "Show where yours differs" near the bottom made the page jump. Since 9 Nov the line can change
// after the search: above the top of the window, the page moves with it, so what the rider reads stays put.
test('[WM-STILL] the weight map never moves the page: near the bottom of the window, Show the map and the difference keep the scroll and the button where they were; the line changing above the window moves nothing in view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await packingCheck(page, BP_BAGS);
  await expect(page.locator('#rigWeightMap')).toBeVisible();
  const cards = page.locator('#weightMap .wm-card');
  const steps: [string, () => Promise<void>][] = [
    ['#rigWeightMap', () => expect(cards).toHaveCount(2)],
    ['#weightMap .wm-diff', () => expect(cards).toHaveCount(3)],
    ['#weightMap .wm-diff', () => expect(cards).toHaveCount(2)],
  ];
  for (const [sel, changed] of steps) {
    const button = page.locator(sel);
    // the button just above the bottom of the window, where the owner pressed it
    await button.evaluate((el) => { window.scrollBy(0, el.getBoundingClientRect().bottom - window.innerHeight + 12); });
    const before = await button.evaluate((el) => [el.getBoundingClientRect().top, window.scrollY]);
    await button.click();
    await changed();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const after = await button.evaluate((el) => [el.getBoundingClientRect().top, window.scrollY]);
    expect(Math.abs(after[0]! - before[0]!), `${sel}: the button stays where it was`).toBeLessThanOrEqual(1);
    expect(Math.abs(after[1]! - before[1]!), `${sel}: the page does not scroll`).toBeLessThanOrEqual(1);
    expect(await page.evaluate((s) => document.activeElement?.matches(s), sel), `${sel}: focus stays on it`).toBe(true);
  }
  // the line worked out again while the rider reads further down: the packing check's heading stays where it was (the line takes more
  // room than "Checking the balance…")
  const heights = [await page.locator('#weightLine').evaluate((el) => el.getBoundingClientRect().height)];
  const heading = page.locator('#stepTitle4');
  await heading.evaluate((el) => { window.scrollBy(0, el.getBoundingClientRect().top - 8); });
  expect(await page.locator('#weightBlock').evaluate((el) => el.getBoundingClientRect().top), 'the line above the top of the window').toBeLessThan(0);
  const top = await heading.evaluate((el) => el.getBoundingClientRect().top);
  await page.evaluate('IDEAL_CACHE = { key:null, value:null }; drawWeightMap()');
  await expect(page.locator('#weightLine')).toHaveText('Checking the balance…');
  heights.push(await page.locator('#weightLine').evaluate((el) => el.getBoundingClientRect().height));
  if ((page.viewportSize()?.width ?? 0) < 700) expect(heights[0]!, 'on a phone the line takes more room than while it checks').toBeGreaterThan(heights[1]! + 1);
  expect(Math.abs((await heading.evaluate((el) => el.getBoundingClientRect().top)) - top), 'while it checks').toBeLessThanOrEqual(1);
  await expect(page.locator('#weightLine')).not.toHaveText('Checking the balance…', { timeout: 30_000 });
  expect(Math.abs((await heading.evaluate((el) => el.getBoundingClientRect().top)) - top), 'with the line back').toBeLessThanOrEqual(1);
  expect(await page.evaluate("S.bags.some(b => b.pos === 'rack')")).toBe(false); // nothing added to the plan
  expect(errors).toEqual([]);
});

// Review of PR 78, m4: the weight map's buttons at the narrowest phone, in both themes; and the line wraps there.
test('[WM-STILL] at 320 px, light and dark: the line wraps and the weight map\'s buttons sit without a sideways scroll, every button at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await planner(page);
    await packingCheck(page, BP_BAGS);
    await page.locator('#rigWeightMap').click();
    await expect(page.locator('#weightMap .wm-card')).toHaveCount(2);
    for (const sel of ['#rigWeightMap', '#weightMap .wm-diff']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(Math.min(b.width, b.height), `${scheme}: ${sel} is at least 44 px`).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width, `${scheme}: ${sel} inside the window`).toBeLessThanOrEqual(320);
    }
    const l = (await page.locator('#weightLine').boundingBox())!;
    expect(l.x + l.width, `${scheme}: the line inside the window`).toBeLessThanOrEqual(320);
    await page.locator('#weightMap .wm-diff').click();
    await expect(page.locator('#weightMap .wm-card')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${scheme}: no sideways scroll`).toBeLessThanOrEqual(320);
  }
});

// The owner's decision of 8 Nov 2026 (weight map design §7): the bag planner balances by itself at the packing check, with one quiet
// line and Undo; advisor.js is loaded for it there.
const BAL_BAGS = "S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:4.5 }, { uid:4, pos:'top', L:1, slot:'front' }, { uid:5, pos:'fork', L:3, pair:true }]; S.nextUid = 6; S.decks = { bar:false, rack:false };";
test("[BAL-LINE] at the packing check the plan is balanced with one line and Undo; Undo brings back the packing before the balance; a saved balance packs the same after a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  const advisorLoads: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/tools/bags/advisor.js')) advisorLoads.push(r.url()); });
  // the bags saved and read back once, as the page stores them, so a reload later re-plans nothing of its own
  await page.evaluate(`${BAL_BAGS} go(2); flushDraft()`);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate('go(3)');
  const own = await page.evaluate('JSON.stringify(currentPlan().items)');
  expect(await page.evaluate('!!window.WayfinchAdvisor')).toBe(false); // nothing loaded before the packing check
  await page.evaluate('go(4)');
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  const line = page.locator('#resultBox .balance-line');
  await expect(line).toContainText('Packed for better balance:');
  await expect(line).toHaveAttribute('role', 'status');
  expect(advisorLoads.length).toBe(1);
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).not.toBe(own);
  expect(await page.evaluate('JSON.stringify(S.placements.items) === JSON.stringify(currentPlan().items)')).toBe(true);
  const balanced = await page.evaluate('JSON.stringify(currentPlan().items)');
  const undo = line.getByRole('button', { name: 'Undo' });
  const box = (await undo.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await undo.click();
  await expect(line).toHaveText('Back to the packing before this balance.');
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).toBe(own);
  // another visit: what Undo put back is not remembered, so the same balance is offered again, with its line (BAL-STORED)
  await page.evaluate('flushDraft()');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate('go(4)');
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
  await expect(page.locator('#resultBox .sec').first()).toBeVisible();
  await expect(page.locator('#resultBox .balance-line')).toContainText('Packed for better balance:');
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).toBe(balanced);
  // the balance saved: a reload packs the same, with nothing more to move and no line
  await page.evaluate('flushDraft()');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate('go(4)');
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
  await expect(page.locator('#resultBox .sec').first()).toBeVisible();
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).toBe(balanced);
  await expect(page.locator('#resultBox .balance-line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Review of PR 79, I1: a thing ticked as packed where the balance put it is never moved back by Undo.
// The owner's choice of 9 Nov 2026 ("Yes, wider balancing"): the balancing takes the wider look, so it runs in slices between frames,
// "Checking the balance…" meanwhile; the page never blocks or jumps.
test('[BAL-AUTO] at the packing check the balancing runs in slices: "Checking the balance…" while frames are drawn, then its line; the section the rider reads keeps its place', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await page.evaluate(`${BAL_BAGS} go(2); go(3)`);
  const r = await page.evaluate(`(async () => {
    go(4);
    if (!document.getElementById('maxWeightBox').classList.contains('hidden')) document.getElementById('mwClose').click();
    const line = () => (document.querySelector('#resultBox .balance-line') || {}).textContent || '';
    const secs = () => [...document.querySelectorAll('#resultBox .sec')];
    const first = line();
    // the rider reads further down: the third section near the top of the window
    const i = Math.min(2, secs().length - 1);
    window.scrollTo(0, window.scrollY + secs()[i].getBoundingClientRect().top - 120);
    const before = secs()[i].getBoundingClientRect().top, boxTop = document.getElementById('resultBox').getBoundingClientRect().top;
    const t0 = performance.now();
    let frames = 0;
    while (line() === 'Checking the balance…' && frames < 2000) { await new Promise((res) => requestAnimationFrame(res)); frames++; }
    return { first, frames, before, boxTop, after: secs()[i].getBoundingClientRect().top, text: line(), ms: Math.round(performance.now() - t0) };
  })()`) as { first: string; frames: number; before: number; boxTop: number; after: number; text: string; ms: number };
  console.log(`BAL-AUTO: the balance after ${r.ms} ms, ${r.frames} frames drawn meanwhile`);
  expect(r.first).toBe('Checking the balance…');
  expect(r.frames, 'frames are drawn while the search runs').toBeGreaterThanOrEqual(2);
  expect(r.text).toMatch(/^Packed for better balance: /);
  expect(r.boxTop, 'the packing check starts above the window').toBeLessThan(0);
  expect(Math.abs(r.after - r.before), 'the section the rider reads stays where it was').toBeLessThanOrEqual(1);
  // the weight map's line follows, from the balanced plan
  await expect(page.locator('#weightLine')).not.toHaveText('Checking the balance…', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

// Review of PR 89, C2 and C1: a plan reopened at the packing check, stored in the planner's own packing, was not balanced, and the weight
// map's line then blamed the rider's must-reach things for the balance not taken. Opening a plan changes nothing of it (LC-MOVE-PLANS),
// so it is balanced at the rider's first step there; until then the line blames nothing the balancing could take itself.
test('[BAL-STORED] a plan reopened at the packing check in the planner\'s own packing: the opening changes nothing and the weight map\'s line blames nothing; the rider\'s first step there balances it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await page.evaluate(`(async () => { ${BAL_BAGS} go(2); go(3); S.step = 4; currentPlan(); await flushDraft(); })()`);
  const stored = await page.evaluate("localStorage.getItem('loadcheck:draft')");
  await page.reload({ waitUntil: 'load' });
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  await page.waitForFunction('DRAFT_READY === true');
  const line = page.locator('#weightLine');
  // the weight map's line has its answer (or none): never the rider's things for a gain the balancing can take itself
  await page.waitForFunction("IDEAL_CACHE.value !== null && IDEAL_CACHE.key === idealKey()", null, { timeout: 30_000 });
  expect(await line.evaluate((el) => ((el as HTMLElement).hidden ? '' : el.textContent))).not.toMatch(/^Your (hand placement|must-reach thing)/);
  expect(await page.evaluate("localStorage.getItem('loadcheck:draft')"), 'the opening changed nothing').toBe(stored);
  // the rider's first step at the packing check: a thing ticked as packed
  await page.evaluate("setPackedItem('tent', true)");
  await expect(page.locator('#resultBox .balance-line')).toContainText('Packed for better balance:', { timeout: 30_000 });
  await expect(line).not.toHaveText('Checking the balance…', { timeout: 30_000 });
  // whatever the line names, the balancing cannot take that gain with them held
  const left = await page.evaluate(`(() => { const s = idealTrial(S.bags, {}, S.placements);
    return window.WayfinchAdvisor.autoBalance(s, (p, f) => idealTrial(S.bags, p, f.state), balanceOptions(s)).apply; })()`);
  expect(left, 'nothing clearly better left for the balancing').toBe(false);
  expect(errors).toEqual([]);
});

// Review of PR 89, I1: the small view (guided Trip, part 2) hides the packing check, so a balance landing there was silent and reshuffled
// the list. It shows the balance's line at the top of its list, with Undo, in the small view's own look.
test('[BAL-LINE] the small view shows the balance\'s line at the top of its list, with Undo; nothing else of the packing check comes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await page.evaluate(`${BAL_BAGS} go(2); go(3); SMALL_VIEW = true; go(4); setSmallView(true)`);
  const line = page.locator('#smallBags .balance-line');
  await expect(line).toBeVisible();
  await expect(line).toContainText('Packed for better balance:', { timeout: 30_000 });
  const undo = line.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  expect((await undo.boundingBox())!.height, 'Undo is at least 44 px').toBeGreaterThanOrEqual(44);
  // the small view's own link style (as its plan line's Undo and the footer links), and no stray separator before it
  expect(await undo.evaluate((el) => { const c = getComputedStyle(el); return [c.textTransform, c.letterSpacing, /mono|courier/i.test(c.fontFamily)]; })).toEqual(['none', 'normal', false]);
  await expect(line).not.toContainText('·');
  await expect(page.locator('#resultBox')).toBeHidden();
  await expect(page.locator('#weightBlock')).toBeHidden();
  await expect(page.locator('#smallBagList')).toBeVisible();
  const balanced = await page.evaluate('JSON.stringify(currentPlan().items)');
  await undo.click();
  await expect(page.locator('#smallBags .balance-line')).toHaveText('Back to the packing before this balance.');
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).not.toBe(balanced);
  expect(errors).toEqual([]);
});

test('[BAL-KEEPS] a thing the balance moved, ticked as packed in the packing check: Undo is not offered and the line says why; unticked, Undo is back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await page.evaluate(`${BAL_BAGS} go(3)`);
  const own = await page.evaluate('JSON.stringify(currentPlan().items)');
  await page.evaluate('go(4)');
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
  const line = page.locator('#resultBox .balance-line');
  await expect(line.getByRole('button', { name: 'Undo' })).toBeVisible();
  const m = (await page.evaluate('BALANCE.last.moves[0]')) as { id: string; to: string };
  const balanced = await page.evaluate('JSON.stringify(currentPlan().items)');
  // the rider packs it where the balance put it and ticks it
  const tick = async (): Promise<void> => {
    const box = page.locator(`#resultBox [data-tick="${m.id}"]`).first();
    if (!(await box.isVisible())) await box.locator('xpath=ancestor::details[1]/summary').click();
    await box.click();
  };
  await tick();
  expect(await page.evaluate(`!!S.packed[${JSON.stringify(m.id)}]`)).toBe(true);
  await expect(line).toContainText('You have started packing it this way, so it stays.');
  await expect(line.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).toBe(balanced);
  expect(await page.evaluate(`currentPlan().items[${JSON.stringify(m.id)}][0][0]`)).toBe(m.to);
  // unticked: Undo is back and brings the packing before the balance back
  await tick();
  expect(await page.evaluate(`!!S.packed[${JSON.stringify(m.id)}]`)).toBe(false);
  await line.getByRole('button', { name: 'Undo' }).click();
  await expect(line).toHaveText('Back to the packing before this balance.');
  expect(await page.evaluate('JSON.stringify(currentPlan().items)')).toBe(own);
  expect(errors).toEqual([]);
});

test('[BAL-LINE] at 320 px, light and dark: the line wraps without a sideways scroll and its Undo is at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await planner(page);
    await page.evaluate(`${BAL_BAGS} go(4)`);
    const line = page.locator('#resultBox .balance-line');
    await expect(line).toContainText('Packed for better balance:');
    const b = (await line.getByRole('button', { name: 'Undo' }).boundingBox())!;
    expect(b.height, `${scheme}: Undo is at least 44 px`).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width, `${scheme}: Undo inside the window`).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${scheme}: no sideways scroll`).toBeLessThanOrEqual(320);
  }
});

// "Handling first" (design of 10 Nov 2026, the owner's answers of 10 Nov): a button under the drawing, beside "Show the map", at the
// packing check; one press packs by weight, its line where the balance line is, with "See all", its tips and Undo; the map then shows
// Before and After. Not in the small view.
const HF_BAGS = "S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:3, shape:2 }, { uid:4, pos:'fork', L:3, pair:true }]; S.nextUid = 5; S.decks = { bar:false, rack:false };";
async function handlingReady(page: Page): Promise<void> {
  await page.evaluate(`${HF_BAGS} go(2); go(3); go(4)`);
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  await expect(page.locator('#rigHandling')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#rigHandling')).toHaveAttribute('aria-disabled', 'false', { timeout: 30_000 });
}
test('[HF-LINE] Handling first: the button beside "Show the map", its line with "See all" and Undo, the map Before and After, and Undo brings the packing before back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  expect(await page.evaluate("document.getElementById('rigHandling').hidden")).toBe(true); // nothing before the packing check
  await handlingReady(page);
  await expect(page.locator('#handlingHint')).toHaveText('Heaviest things low and in the middle, even if some bags stay part empty.');
  const button = page.locator('#rigHandling');
  expect((await button.boundingBox())!.height, 'the button is at least 44 px').toBeGreaterThanOrEqual(44);
  const before = await page.evaluate('JSON.stringify(S.placements)');
  const bags = await page.evaluate('JSON.stringify(S.bags)');
  // the keyboard: focus and Enter
  await button.focus();
  await page.keyboard.press('Enter');
  const line = page.locator('#resultBox .hf-line');
  await expect(line).toContainText('Packed for handling:', { timeout: 60_000 });
  await expect(line).toHaveAttribute('role', 'status');
  expect(await page.evaluate('JSON.stringify(S.bags)'), 'the bags never change').toBe(bags);
  expect(await page.evaluate('JSON.stringify(S.placements)')).not.toBe(before);
  await expect(page.locator('#resultBox .hf-tips')).toContainText('Frame bag: pack the heaviest things at the bottom, near the down tube.');
  // See all opens the list in place
  const all = line.getByRole('button', { name: 'See all' });
  if (await all.count()) {
    await expect(all).toHaveAttribute('aria-expanded', 'false');
    await all.click();
    await expect(all).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#hfAll')).toBeVisible();
    expect(await page.locator('#hfAll li').count()).toBe(await page.evaluate('HANDLING.last.moves.length'));
  }
  // the map: Before and After
  await expect(page.locator('#rigWeightMap')).toBeVisible({ timeout: 30_000 });
  await page.locator('#rigWeightMap').click();
  await expect(page.locator('#weightMap .wm-card figcaption b')).toHaveText(['Before', 'After'], { timeout: 30_000 });
  await expect(page.locator('#weightMap .wm-moved')).toHaveText(/ kg moved |about the same kilos/);
  await expect(page.locator('#weightMap .wm-diff')).toBeHidden();
  // Undo: exactly the packing before
  const undo = line.getByRole('button', { name: 'Undo' });
  expect((await undo.boundingBox())!.height, 'Undo is at least 44 px').toBeGreaterThanOrEqual(44);
  await undo.click();
  await expect(page.locator('#resultBox .balance-line')).toHaveText('Back to the packing before Handling first.');
  expect(await page.evaluate('JSON.stringify(S.placements)')).toBe(before);
  expect(errors).toEqual([]);
});

test('[HF-LINE] at 320 px, light and dark: the button, its hint and its line wrap without a sideways scroll, every button at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await planner(page);
    await handlingReady(page);
    await page.locator('#rigHandling').click();
    const line = page.locator('#resultBox .hf-line');
    await expect(line).toContainText('Packed for handling:', { timeout: 60_000 });
    for (const sel of ['#rigHandling', '#resultBox .hf-line button']) {
      for (const b of await page.locator(sel).all()) {
        const box = (await b.boundingBox())!;
        expect(box.height, `${scheme}: ${sel} is at least 44 px`).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, `${scheme}: ${sel} inside the window`).toBeLessThanOrEqual(320);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${scheme}: no sideways scroll`).toBeLessThanOrEqual(320);
  }
});

// The owner's preview of main a7122fa (10 Nov 2026): after a press a second "Handling first" stood beside "Show the map"; a second press
// hid the map button, a third greyed out and left it gone. The owner's rulings: after a press the button turns into "Back to the
// planner's packing" (it does what Undo does), and the map button is there after every press; "Already packed" has no button of its own.
const BACK = "Back to the planner's packing";
async function settled(page: Page): Promise<void> {
  await expect(page.locator('#rigHandling')).not.toHaveText('Packing for handling…', { timeout: 60_000 });
  await expect(page.locator('#weightLine')).not.toHaveText('Checking the balance…', { timeout: 60_000 });
}
test('[HF-LINE] the owner\'s sequence: a press turns the button into the way back, the map button stays through every press, Back and Undo, and nothing gets stuck', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await handlingReady(page);
  const button = page.locator('#rigHandling'), map = page.locator('#rigWeightMap'), line = page.locator('#resultBox .balance-line').first();
  const before = await page.evaluate('JSON.stringify(S.placements)');
  // (1) press: the line, then the way back and the map button; never a second "Handling first"
  await button.click();
  await expect(line).toContainText('Packed for handling', { timeout: 60_000 });
  await settled(page);
  await expect(button).toHaveText(BACK);
  await expect(button).toHaveAttribute('aria-disabled', 'false');
  // review of PR 121, R2: the way back is not described by the hint of the press
  await expect(button).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(page.getByRole('button', { name: 'Handling first', exact: true })).toHaveCount(0);
  await expect(map).toBeVisible();
  // (2) the map opens and closes
  await map.click();
  await expect(map).toHaveText('Hide the map');
  await expect(page.locator('#weightMap .wm-card')).toHaveCount(2, { timeout: 30_000 });
  await map.click();
  await expect(map).toHaveText('Show the map');
  // review of PR 121, R3: an open map drops Before and After at once on the way back, never shows them for the plan before
  await map.click();
  await expect(page.locator('#weightMap .wm-card figcaption b')).toHaveText(['Before', 'After'], { timeout: 30_000 });
  const titles = await button.evaluate((b) => { (b as HTMLElement).click(); return [...document.querySelectorAll('#weightMap .wm-card figcaption b')].map((t) => t.textContent); });
  expect(titles).not.toContain('Before');
  await settled(page);
  await map.click();
  await expect(map).toHaveText('Show the map');
  await button.click();
  await expect(line).toContainText('Packed for handling', { timeout: 60_000 });
  await settled(page);
  // (3) the way back: exactly the packing before, "Handling first" again, the map button still there
  await button.click();
  await expect(line).toHaveText('Back to the packing before Handling first.');
  expect(await page.evaluate('JSON.stringify(S.placements)')).toBe(before);
  await settled(page);
  await expect(button).toHaveText('Handling first');
  await expect(button).toHaveAttribute('aria-describedby', 'handlingHint');
  await expect(map).toBeVisible();
  // (4) again and again: each press packs, each way back returns; never stuck, the map button always there
  for (let i = 0; i < 2; i++) {
    await button.click();
    await expect(line).toContainText('Packed for handling', { timeout: 60_000 });
    await settled(page);
    await expect(button).toHaveText(BACK);
    await expect(map).toBeVisible();
    await button.click();
    await expect(line).toHaveText('Back to the packing before Handling first.');
    await settled(page);
    await expect(button).toHaveText('Handling first');
    await expect(button).toHaveAttribute('aria-disabled', 'false');
    await expect(map).toBeVisible();
  }
  // the line's own Undo does the same and leaves the same buttons
  await button.click();
  await expect(line).toContainText('Packed for handling', { timeout: 60_000 });
  await settled(page);
  await line.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#resultBox .balance-line').first()).toHaveText('Back to the packing before Handling first.');
  await settled(page);
  await expect(button).toHaveText('Handling first');
  await expect(map).toBeVisible();
  expect(errors).toEqual([]);
});

test('[HF-LINE] "Already packed for handling": the line and the map button, no button to press again', async ({ page }) => {
  await planner(page);
  await page.evaluate("S.bags = [{ uid:1, pos:'rack', L:20, pair:true }, { uid:2, pos:'bar', L:9 }, { uid:3, pos:'bottle', slot:'dt', L:0.75 }, { uid:4, pos:'pack', L:12 }]; S.nextUid = 5; S.decks = { bar:false, rack:true }; S.mode = 'light'; go(2); go(3); go(4)");
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
  const button = page.locator('#rigHandling');
  await expect(button).toHaveAttribute('aria-disabled', 'false', { timeout: 60_000 });
  // by keyboard (review of PR 121, R1): the button goes, the focus goes to the line, never to the page
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#resultBox .hf-line')).toContainText('Already packed for handling', { timeout: 60_000 });
  await settled(page);
  await expect(button).toBeHidden();
  await expect(page.locator('#resultBox .hf-line')).toBeFocused();
  await expect(page.locator('#handlingHint')).toBeHidden();
  await expect(page.locator('#rigWeightMap')).toBeVisible();
  // the plan changes: the button is back
  await page.evaluate("S.bags.push({ uid:9, pos:'top', L:1, slot:'front' }); S.nextUid = 10; renderResult(); drawRig()");
  await expect(button).toHaveText('Handling first', { timeout: 30_000 });
  await expect(button).toBeVisible();
});

test('[HF-SMALL] the small view of a day ride has no Handling first button', async ({ page }) => {
  await planner(page);
  await page.evaluate(`${HF_BAGS} go(2); go(3); SMALL_VIEW = true; go(4); setSmallView(true)`);
  await expect(page.locator('#smallBagList')).toBeVisible();
  await page.waitForFunction('!!window.WayfinchAdvisor', null, { timeout: 30_000 });
  await expect(page.locator('#rigHandling')).toBeHidden();
  expect(await page.evaluate('handlingAvailable()')).toBe(false);
});

// The owner's ruling of 9 Nov 2026: the full planner's three-quarter frame bag is never drawn over the bottle beside it in the triangle.
declare const S: { bags: { pos: string; uid: number }[] };
/** How many points of a grid over the drawn bottle (its cage, the bottle and its cap) lie inside the drawn frame bag (0: side by side). */
async function frameOverBottle(page: Page): Promise<number> {
  return page.evaluate(() => {
    const uid = S.bags.find((b) => b.pos === 'frame')?.uid;
    const shell = document.querySelector(`#bagLayer g.bagg.owned[data-bump="${uid}"] .bag-shell`) as SVGGeometryElement | null;
    const parts = [...document.querySelectorAll('#bottleLayer g.btl:not(.ghost) rect')] as SVGRectElement[];
    if (!shell || parts.length === 0) return -1;
    let n = 0;
    for (const r of parts) {
      const toShell = shell.getScreenCTM()!.inverse().multiply(r.getScreenCTM()!);
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => +r.getAttribute(a)!);
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 16; j++) if (shell.isPointInFill(new DOMPoint(x! + (w! * i) / 8, y! + (h! * j) / 16).matrixTransform(toShell))) n++;
    }
    return n;
  });
}
test('[BK-FRAME-BESIDE] the full planner\'s three-quarter frame bag is drawn beside its one bottle, never over it, on the seat tube or the down tube, editing and at the packing check', async ({ page }) => {
  await planner(page);
  for (const slot of ['st', 'dt']) {
    await page.evaluate(`S.bags = [{ uid:1, pos:'frame', L:4.5 }, { uid:2, pos:'bottle', slot:'${slot}', L:0.75 }]; S.nextUid = 3; S.decks = { bar:false, rack:false }; go(2); drawRig()`);
    expect(await page.evaluate("frameShapeIdx(S.bags.find(b => b.pos === 'frame'))"), slot).toBe(1);   // the three-quarter bag, the plan unchanged
    expect(await page.evaluate('S.bags.length'), slot).toBe(2);
    expect(await frameOverBottle(page), `${slot}: editing`).toBe(0);
    await page.evaluate('go(3); go(4)');
    expect(await frameOverBottle(page), `${slot}: packing check`).toBe(0);
  }
  // the half beside two bottles, as before: side by side
  await page.evaluate("S.bags = [{ uid:1, pos:'frame', L:3 }, { uid:2, pos:'bottle', slot:'st', L:0.75 }, { uid:3, pos:'bottle', slot:'dt', L:0.75 }]; S.nextUid = 4; S.decks = { bar:false, rack:false }; go(2); drawRig()");
  expect(await page.evaluate("frameShapeIdx(S.bags.find(b => b.pos === 'frame'))")).toBe(2);
  expect(await frameOverBottle(page)).toBe(0);
});

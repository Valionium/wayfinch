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
    if (value !== before.local[key]) expect(['loadcheck:bikeProfile', 'loadcheck:bikeProfiles', 'loadcheck:bikeProfilesFormat', 'loadcheck:draft'], key).toContain(key);
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

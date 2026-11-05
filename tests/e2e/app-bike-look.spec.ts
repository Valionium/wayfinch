// The bike's look extras in a real browser (owner's wish, 5 November 2026): Look's Frame pattern, Fork and Rims in the bag planner, From
// a photo's Front, back and fork, and the same bike drawn by the co-pilot. Runs in the four app projects: 360 and 1280 px, both themes.
// Nothing here prints the page: failures compare booleans, counts and short values. Screenshots go outside the repository, only
// when WAYFINCH_SHOTS names a folder.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const BLUE = { id: 'bike_blue', name: 'Blue tourer', frontTyre: '40-622', rearTyre: '40-622', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour: '#2563b8', bars: 'drop', ebike: false } };
const PAINTED = { ...BLUE, look: { ...BLUE.look, paint: { pattern: 'marble', colours: ['#6b3fa0', '#1f7f80'], fork: { kind: 'own', colour: '#c62f2a' }, rimMm: 50 } } };
const seed = (b: object) => ({ 'loadcheck:bikeProfile': JSON.stringify(b), 'loadcheck:bikeProfiles': JSON.stringify([b]) });

async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = process.env.WAYFINCH_SHOTS;
  if (dir) await page.screenshot({ path: join(dir, `${name}-${info.project.name}.png`), fullPage: false });
}

async function look(page: Page, entries: Record<string, string>): Promise<void> {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, entries);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  await page.evaluate("openBikeDetails(document.getElementById('rigBikeDetails'), 'look')");
  await expect(page.locator('#lookPatternSet')).toBeVisible();
}
const frameStroke = (page: Page) => page.locator('#lookPreview .bk-paint.bk-frame').first().getAttribute('stroke');

test('[LC-LOOK-EXTRAS] every extra is a named tap target of at least 44 px; each tap shows at once; Undo brings all back', async ({ page }, info) => {
  await look(page, seed(BLUE));
  const set = page.locator('#lookPatternSet');
  // the patterns, by name, in a group named Frame pattern
  const patterns = page.getByRole('radiogroup', { name: 'Frame pattern' }).getByRole('radio');
  expect(await patterns.count()).toBe(14);
  await expect(page.getByRole('radio', { name: 'One colour' })).toBeChecked();
  // one tap: the drawing changes before anything else happens
  const changed = await page.evaluate(() => {
    const label = [...document.querySelectorAll('#lookPattern label')].find((l) => l.textContent!.trim() === 'Water-dyed') as HTMLElement;
    label.click();
    return document.querySelector('#lookPreview .bk-paint.bk-frame')?.getAttribute('stroke');
  });
  expect(changed).toBe('url(#bkpt)');
  await expect(page.getByRole('radiogroup', { name: 'Second colour' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Third colour' })).toBeVisible();
  await expect(page.locator('#lookPreview svg')).toHaveAttribute('aria-label', /blue and purple and teal frame, water-dyed/);
  await page.getByRole('radiogroup', { name: 'Second colour' }).locator('label', { hasText: /^Orange$/ }).click();
  await expect(page.locator('#lookPreview svg')).toHaveAttribute('aria-label', /blue and orange and teal frame, water-dyed/);
  // the fork, each way, its own row shown
  for (const [way, row] of [['Own colour', '#lookForkOwnBox'], ['Fade', '#lookForkFadeBox'], ['Pattern', '#lookForkPatternBox']] as const) {
    await page.locator('#lookFork label', { hasText: new RegExp(`^${way}$`) }).click();
    await expect(page.locator(row)).toBeVisible();
    for (const box of await page.locator(`${row} label`).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, text: el.textContent!.trim() }; }))) {
      expect(box.h, box.text).toBeGreaterThanOrEqual(44);
      expect(box.w, box.text).toBeGreaterThanOrEqual(44);
    }
  }
  await expect(page.getByRole('radiogroup', { name: 'Its two colours' }).getByRole('radio', { name: 'Blue to purple' })).toBeChecked();
  // every visible extra is at least 44 px and labelled
  for (const box of await page.locator('#lookPatternSet label, #lookForkSet label, #lookRimSet button, #lookRimSet input').evaluateAll((els) => els
    .filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, text: (el.textContent || el.getAttribute('aria-label') || el.id).trim() }; }))) {
    expect(box.h, box.text).toBeGreaterThanOrEqual(44);
    expect(box.w, box.text).toBeGreaterThanOrEqual(44);
    expect(box.text.length, 'labelled').toBeGreaterThan(0);
  }
  // the rims: the slider by keyboard, then Not set
  const rim = page.getByRole('slider', { name: 'Rim depth' });
  await rim.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lookPreview .bk-rimband')).toHaveCount(2);
  await expect(page.locator('#lookRimOut')).toHaveText('41 mm · deep carbon');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.paint.rimMm)).toBe(41);
  await shot(page, info, 'look-extras');
  await page.getByRole('button', { name: 'Not set' }).click();
  await expect(page.locator('#lookPreview .bk-rimband')).toHaveCount(0);
  // the patterns by keyboard: arrows move along the group and each step draws
  const frame = page.getByRole('radiogroup', { name: 'Frame pattern' });
  await frame.getByRole('radio', { name: 'Water-dyed' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(frame.getByRole('radio', { name: 'Stripes' })).toBeChecked();
  await expect(page.locator('#lookPreview svg')).toHaveAttribute('aria-label', /stripes/);
  expect(await page.evaluate(() => { const a = document.activeElement as HTMLInputElement | null; return a?.tagName === 'INPUT' && !['radio', 'range', 'color'].includes(a.type); })).toBe(false);
  // Undo: the opening look, byte for byte
  await page.locator('#lookUndo').click();
  expect(await frameStroke(page)).toBe('#2563b8');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look)).toEqual(BLUE.look);
  await expect(set).toBeVisible();
});

test('[LC-LOOK-EXTRAS] the rig and Look draw a painted bike the same way, and the page has no horizontal scroll', async ({ page }, info) => {
  await look(page, seed(PAINTED));
  await expect(page.locator('#lookPreview .bk-paint.bk-fork')).toHaveAttribute('stroke', '#c62f2a');
  // the plan takes the bike, as Use these bike details does: the rig behind draws it
  await page.evaluate('useBikeProfile(BIKE_PROFILES[0]); drawRig()');
  await expect(page.locator('#rigBike .bk-paint.bk-frame').first()).toHaveAttribute('stroke', 'url(#rigpt)');
  await expect(page.locator('#rigBike .bk-rimband')).toHaveCount(2);
  await expect(page.getByRole('radiogroup', { name: 'Frame pattern' }).getByRole('radio', { name: 'Water-dyed' })).toBeChecked();
  await expect(page.getByRole('radiogroup', { name: 'Fork' }).getByRole('radio', { name: 'Own colour' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#lookPatternSet').scrollIntoViewIfNeeded();
  await shot(page, info, 'look-painted');
});

/** A side-on "photo": a lawn, the frame's front red, its back blue, the fork yellow. */
async function threeColourPhoto(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 800;
    const x = c.getContext('2d')!;
    x.fillStyle = '#4f8a2b'; x.fillRect(0, 0, 1200, 800);
    x.fillStyle = '#c62f2a'; x.fillRect(700, 300, 200, 200);   // front
    x.fillStyle = '#2563b8'; x.fillRect(200, 300, 200, 200);   // back
    x.fillStyle = '#f1c232'; x.fillRect(950, 550, 120, 120);   // fork
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const v of bytes) s += String.fromCharCode(v);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}
async function tapPhoto(page: Page, fx: number, fy: number): Promise<void> {
  await page.locator('.photo-stage').evaluate((el) => el.scrollIntoView({ block: 'end' }));
  const box = (await page.locator('.photo-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}
const near = (hex: string, want: string) => [1, 3, 5].every((i) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(want.slice(i, i + 2), 16)) <= 6);

test('[LC-PHOTO-THREE] Front, back and fork: three taps on a photo give the front-to-back fade and the fork\'s own colour; nothing is sent', async ({ page }, info) => {
  await look(page, seed(BLUE));
  await page.locator('#lookPhoto').click();
  await expect(page.locator('.photo-pick')).toBeVisible();
  const png = await threeColourPhoto(page);
  const requests: string[] = [];
  page.on('request', (r) => { if (!/^(blob|data):/.test(r.url())) requests.push(r.url()); });
  await page.locator('.photo-file').setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.photo-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Front, back and fork' }).click();
  await expect(page.getByRole('button', { name: 'Front, back and fork' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.photo-hint')).toHaveText(/near the front/);
  await tapPhoto(page, 800 / 1200, 400 / 800);
  await expect(page.locator('.photo-hint')).toHaveText(/near the back/);
  await tapPhoto(page, 300 / 1200, 400 / 800);
  await expect(page.locator('.photo-hint')).toHaveText(/fork near the bottom/);
  await expect(page.locator('#lookPreview .bk-paint.bk-frame').first()).toHaveAttribute('stroke', 'url(#bkpf)');
  await tapPhoto(page, 1010 / 1200, 610 / 800);
  await expect(page.locator('.photo-hint')).toHaveText(/fork takes its own colour/);
  await shot(page, info, 'photo-three');
  await page.getByRole('button', { name: 'Use these colours' }).click();
  await expect(page.locator('.photo-pick')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look);
  expect(near(stored.colour, '#c62f2a'), stored.colour).toBe(true);
  expect(stored.paint.pattern).toBe('fade-h');
  expect(near(stored.paint.colours[0], '#2563b8'), stored.paint.colours[0]).toBe(true);
  expect(stored.paint.fork.kind).toBe('own');
  expect(near(stored.paint.fork.colour, '#f1c232'), stored.paint.fork.colour).toBe(true);
  expect(requests).toEqual([]);
  // One colour is still the first way, unchanged
  await page.locator('#lookPhoto').click();
  await expect(page.getByRole('button', { name: 'One colour' })).toBeHidden(); // shown once a photo is open
});

test('[LC-LOOK-EXTRAS-SAVE] what the bag planner saves, the co-pilot draws: Trip shows the pattern, the fork and the rims, and names them', async ({ page }, info) => {
  await look(page, seed(BLUE));
  await page.locator('#lookPattern label', { hasText: /^Stripes$/ }).click();
  await page.locator('#lookFork label', { hasText: /^Own colour$/ }).click();
  await page.locator('#lookRim').focus();
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('loadcheck:bikeProfile')!).look.paint?.rimMm)).toBe(60);
  await page.goto(`${app!.origin}/#/trip`, { waitUntil: 'load' });
  const drawing = page.locator('.bike-large svg.bk').first();
  await expect(drawing).toBeVisible();
  await expect(drawing.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', /^url\(#bk\d+-pt\)$/);
  await expect(drawing.locator('.bk-paint.bk-fork')).toHaveAttribute('stroke', '#1d1d1f');
  await expect(drawing.locator('.bk-rimband')).toHaveCount(2);
  await expect(page.getByRole('link', { name: /blue and purple frame, stripes, black fork, 60 mm deep rims/ })).toBeVisible();
  await shot(page, info, 'copilot-trip');
});

test('[BK-PAINT-LAZY] the co-pilot asks for the extras only for a bike that has them, and the Ahead strip\'s marker stays one colour', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  const asked: string[] = [];
  page.on('request', (r) => { if (/\/assets\/paint-[^/]+\.js$/.test(r.url())) asked.push(r.url()); });
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed(BLUE));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.bike-large svg.bk .bk-paint').first()).toHaveAttribute('stroke', '#2563b8');
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
  await page.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed(PAINTED));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.bike-large svg.bk .bk-paint.bk-frame').first()).toHaveAttribute('stroke', /^url\(/);
  expect(asked.length).toBe(1);
});

// Review of PR 46, I1: the co-pilot's quick repaint (one colour moved) must never flatten a second colour or a pattern.
const twoTone = (fork: string) => ({ ...BLUE, look: { colour: '#c62f2a', bars: 'drop', ebike: false, paint: { pattern: 'blocks', colours: ['#2563b8', null], fork: { kind: 'own', colour: fork } } } });
const fadeOf = (to: string) => ({ ...BLUE, look: { ...BLUE.look, paint: { pattern: 'fade-h', colours: [to, null], fork: { kind: 'own', colour: '#4b4f54' } } } });

test('[BK-PAINT-LAZY] cold start on Trip: two-tone blocks and a fork of its own colour, without rims, keep their own colours', async ({ page }) => {
  app = await loadApp(page, { launch: true });
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed(twoTone('#4b4f54')));
  await page.reload({ waitUntil: 'load' });
  const drawing = page.locator('.bike-large svg.bk').first();
  await expect(drawing).toHaveAttribute('aria-label', /red and blue frame, two-tone blocks, graphite fork/);
  await expect(drawing.locator('.bk-paint.bk-stays')).toHaveAttribute('stroke', '#2563b8');
  await expect(drawing.locator('.bk-paint.bk-fork')).toHaveAttribute('stroke', '#4b4f54');
  await expect(drawing.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', '#c62f2a');
});

test('[LC-LOOK-EXTRAS-SAVE] a change saved in another tab: a fade keeps its gradient and the fork takes its new colour', async ({ page, context }) => {
  app = await loadApp(page, { launch: true });
  await page.goto(`${app.origin}/#/trip`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed(fadeOf('#6b3fa0')));
  await page.reload({ waitUntil: 'load' });
  const drawing = page.locator('.bike-large svg.bk').first();
  await expect(drawing.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', /^url\(/);
  // the bag planner, in another tab, changes the fork's colour, then the fade's second colour
  const other = await context.newPage();
  await other.goto(`${app.origin}/#/you`, { waitUntil: 'domcontentloaded' });
  const changed = { ...fadeOf('#6b3fa0'), look: { ...fadeOf('#6b3fa0').look, paint: { ...fadeOf('#6b3fa0').look.paint, fork: { kind: 'own', colour: '#f1c232' } } } };
  await other.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed(changed));
  await expect(drawing.locator('.bk-paint.bk-fork')).toHaveAttribute('stroke', '#f1c232');
  await expect(drawing.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', /^url\(/);
  await other.evaluate((e) => { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, seed({ ...changed, look: { ...changed.look, paint: { ...changed.look.paint, colours: ['#1f7f80', null] } } }));
  await expect(drawing).toHaveAttribute('aria-label', /blue and teal frame, fade, front to back, yellow fork/);
  await expect(drawing.locator('.bk-paint.bk-frame').first()).toHaveAttribute('stroke', /^url\(/);
  await other.close();
});

test('[LC-LOOK-EXTRAS-SAVE] a setup\'s thumbnail of a patterned bike stores no pattern tiles: the size of the same bike in one colour (review M4)', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  const sparkle = { ...BLUE, look: { ...BLUE.look, paint: { pattern: 'sparkle', colours: ['#6b3fa0', null], fork: { kind: 'pattern', pattern: 'sparkle', pair: 3 }, rimMm: null } } };
  const thumbOf = async (b: object) => String(await page.evaluate(`S.bikeProfile = normaliseBikeProfile(${JSON.stringify(b)}); drawRig(); buildThumb('st1')`));
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
  const patterned = await thumbOf(sparkle);
  const plain = await thumbOf(BLUE);
  expect(patterned.includes('<pattern') || patterned.includes('<filter') || patterned.includes('url(#rigp')).toBe(false);
  const unnamed = (s: string) => s.replace(/ aria-label="[^"]*"/g, '');
  expect(unnamed(patterned)).toBe(unnamed(plain));
  // rims stay, as plain circles
  const rims = await thumbOf({ ...sparkle, look: { ...sparkle.look, paint: { ...sparkle.look.paint, rimMm: 40 } } });
  expect((rims.match(/stroke="#2b2d30"/g) ?? []).length).toBe(2);
  expect(rims.length).toBeLessThan(plain.length + 1000);
});

// Owner's try-out of 5 Nov 2026: the ring of a checked option peeked out beside the bike's panel as it scrolled under it.
test('[LC-LOOK-RING] the bike\'s panel covers every checked option that scrolls under it, ring and all, and is opaque', async ({ page }) => {
  await look(page, seed(PAINTED));
  expect(await page.locator('#lookPreview').evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
  const checked = await page.locator('#bikeLook label:has(input:checked), #bikeLook .look-chip.on').evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length);
  expect(checked).toBeGreaterThan(4);
  for (let i = 0; i < checked; i++) {
    // scroll so this option sits half under the panel's lower edge, where the owner saw its ring
    const out = await page.evaluate((n) => {
      const el = [...document.querySelectorAll('#bikeLook label:has(input:checked), #bikeLook .look-chip.on')].filter((e) => (e as HTMLElement).offsetParent !== null)[n]!;
      const body = document.getElementById('bikeDetailsBody')!, preview = document.getElementById('lookPreview')!;
      const r = el.getBoundingClientRect();
      body.scrollTop += r.top + r.height / 2 - preview.getBoundingClientRect().bottom;
      const a = el.getBoundingClientRect(), p = preview.getBoundingClientRect();
      // the checked ring: 2 px at 1 px from the option
      return { name: el.textContent!.trim(), stuck: Math.abs(a.top + a.height / 2 - p.bottom) < 2, left: a.left - 3 >= p.left - 0.5, right: a.right + 3 <= p.right + 0.5 };
    }, i);
    if (!out.stuck) continue;   // too near the end to scroll under the panel
    expect(out.left && out.right, out.name).toBe(true);
  }
});

test('[LC-LOOK-RING] every Look control taken by keyboard, forwards and back, shows its whole focus ring below the bike\'s panel', async ({ page }) => {
  await look(page, seed(PAINTED));
  await page.locator('#bikeLookTitle').focus();
  const check = async (dir: 'Tab' | 'Shift+Tab'): Promise<number> => {
    let seen = 0;
    for (let step = 0; step < 80; step++) {
      await page.keyboard.press(dir);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // what the rider sees next
      const at = await page.evaluate((g) => {
        const el = document.activeElement;
        if (!el || !document.getElementById('bikeLook')!.contains(el) || el.id === 'bikeLookTitle') return null;
        const body = document.getElementById('bikeDetailsBody')!, preview = document.getElementById('lookPreview')!;
        const b = body.getBoundingClientRect(), p = preview.getBoundingClientRect(), r = (el.closest('.look-swatch,.look-chip') ?? el).getBoundingClientRect();
        const bottom = b.top + body.clientTop + body.clientHeight, right = b.left + body.clientLeft + body.clientWidth;
        return { name: (el.getAttribute('aria-label') || el.closest('label')?.textContent || el.textContent || el.id || '').trim(),
          below: r.top - g >= p.bottom - 0.5, inside: r.bottom + g <= bottom + 0.5 && r.left - g >= b.left - 0.5 && r.right + g <= right + 0.5 };
      }, 4);
      if (!at) { if (seen > 0) break; continue; }
      seen++;
      expect(at.below && at.inside, `${dir} ${at.name}: ${JSON.stringify(at)}`).toBe(true);
    }
    return seen;
  };
  expect(await check('Tab')).toBeGreaterThan(8);
  expect(await check('Shift+Tab')).toBeGreaterThan(8);
});

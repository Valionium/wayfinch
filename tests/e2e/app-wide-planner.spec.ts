// The bag planner on wide screens (sub-project 6, Task 10; spec section 7.1 item 13): two columns from about 1100 px, the inspector in
// its column, file drops, and the fill tip on keyboard focus. Runs with app-wide.spec.ts, in Chromium and in Firefox, at 1280 x 720
// unless a test says another size. Nothing here prints the page: failures compare booleans, sizes and short values.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fixtureGpx } from '../fixtures/gpx.ts';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());

const box = async (l: Locator) => (await l.boundingBox())!;
const ready = (page: Page) => page.waitForFunction('typeof DRAFT_READY !== "undefined" && DRAFT_READY === true');

async function planner(page: Page, width = 1280, height = 720): Promise<void> {
  await page.setViewportSize({ width, height });
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await ready(page);
  await expect(page.locator('#rigBike svg.bk')).toBeVisible();
}

/** The finished plan with three bags, the weight question skipped. */
async function finished(page: Page): Promise<void> {
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }, { uid:3, pos:'bar', L:12 }]; S.nextUid = 4; go(2); go(3); go(4)");
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
  await expect(page.locator('#rigSvg [data-inspect]').first()).toBeVisible();
}

/** The height a route map gets at this window size. */
const mapHeight = (page: Page) => page.evaluate(() => {
  const host = document.createElement('div');
  host.className = 'route-map-host';
  document.body.append(host);
  const h = host.getBoundingClientRect().height;
  host.remove();
  return h;
});

test('[LC-WIDE-COLS] from 1100 px: the rig on the left, the steps on the right; the rig and Back to Wayfinch stay in view down the page; a taller map', async ({ page }) => {
  for (const [w, h] of [[1280, 720], [1100, 720]] as const) {
    await planner(page, w, h);
    const rig = await box(page.locator('#rigBox'));
    const main = await box(page.locator('#planMain'));
    expect(rig.x + rig.width, `${w}`).toBeLessThanOrEqual(main.x);
    expect(Math.abs(rig.y - main.y), `${w}`).toBeLessThan(40);
    expect(rig.width, `${w}`).toBeGreaterThanOrEqual(620);
    expect(main.width, `${w}`).toBeGreaterThanOrEqual(360);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // far down the steps
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('#backToWayfinch')).toBeInViewport();
    await expect(page.locator('#rigSvg')).toBeInViewport();
    const back = await box(page.locator('#backToWayfinch'));
    const svg = await box(page.locator('#rigSvg'));
    expect(back.y + back.height).toBeLessThanOrEqual(svg.y + 1); // the link never covers the bike
    expect(await mapHeight(page)).toBeGreaterThan(360);
    await app!.close();
    app = undefined;
  }
  // Below it, one column as before: the steps under the rig, and today's map.
  await planner(page, 1000, 720);
  const rig = await box(page.locator('#rigBox'));
  const main = await box(page.locator('#planMain'));
  expect(main.y).toBeGreaterThanOrEqual(rig.y + rig.height - 1);
  expect(await mapHeight(page)).toBe(360);
});

test('[LC-WIDE-COLS] at 360 x 640 nothing changes: the page looks the same with every wide rule taken out', async ({ page }) => {
  await planner(page, 360, 640);
  await finished(page);
  const NL = String.fromCharCode(10);
  const look = (): Promise<string> => page.evaluate(() => [...document.querySelectorAll('body *')].map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const styles = ['display', 'position', 'top', 'width', 'height', 'max-width', 'max-height', 'grid-template-columns', 'grid-column', 'overflow-y', 'z-index', 'margin-top', 'padding-left']
      .map((name) => `${name}:${cs.getPropertyValue(name)}`).join(';');
    return `${el.tagName}#${el.id} ${r.x.toFixed(1)} ${r.y.toFixed(1)} ${r.width.toFixed(1)} ${r.height.toFixed(1)} ${styles}`;
  }).join('\n'));
  const stable = async (): Promise<string> => {
    let last = await look();
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(250);
      const next = await look();
      if (next === last) return next;
      last = next;
    }
    return last;
  };
  const withWide = await stable();
  const removed = await page.evaluate(() => {
    let n = 0;
    const wide = (cond: string): boolean => [...cond.matchAll(/min-width:\s*(\d+)px/g)].some((m) => Number(m[1]) >= 600);
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (let i = rules.length - 1; i >= 0; i -= 1) {
        const r = rules[i]!;
        if (r instanceof CSSMediaRule && wide(r.conditionText)) { sheet.deleteRule(i); n += 1; }
      }
    }
    return n;
  });
  expect(removed).toBeGreaterThan(0);
  const without = await stable();
  if (without !== withWide) {
    const a = withWide.split(NL);
    const b = without.split(NL);
    const at = a.findIndex((line, i) => line !== b[i]);
    throw new Error(`differs at element ${at}: ${(a[at] ?? '').slice(0, 60)}`);
  }
});

test('[LC-WIDE-INSPECTOR] in the two columns a bag opens beside the list inside the rig\'s column, never as the full-window sheet; a phone still gets the sheet', async ({ page }) => {
  for (const w of [1280, 1100]) {
    await planner(page, w, 720);
    await finished(page);
    await page.locator('#rigSvg [data-inspect]').first().click();
    const pop = page.locator('#bagPop');
    await expect(pop).toBeVisible();
    expect(await pop.getAttribute('class'), `${w}`).toContain('wide');
    expect(await pop.getAttribute('class'), `${w}`).not.toContain('sheet');
    const rig = await box(page.locator('#rigBox'));
    const card = await box(pop.locator('.popcard'));
    expect(card.x).toBeGreaterThanOrEqual(rig.x - 1);
    expect(card.x + card.width).toBeLessThanOrEqual(rig.x + rig.width + 1);
    // the steps stay usable beside it
    const main = await box(page.locator('#planMain'));
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('#planMain'), [main.x + main.width / 2, Math.min(700, main.y + 200)])).toBe(true);
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await app!.close();
    app = undefined;
  }
  await planner(page, 360, 640);
  await finished(page);
  await page.locator('#rigSvg [data-inspect]').first().click();
  expect(await page.locator('#bagPop').getAttribute('class')).toContain('sheet');
});

/** Dispatches a drag of these files at an element, and says whether each event was cancelled. */
async function dropAt(page: Page, selector: string, files: { name: string; type: string; text: string }[]): Promise<Record<string, boolean>> {
  return page.evaluate(([sel, list]) => {
    const el = document.querySelector(sel as string)!;
    const out: Record<string, boolean> = {};
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const dt = new DataTransfer();
      for (const f of list as { name: string; type: string; text: string }[]) dt.items.add(new File([f.text], f.name, { type: f.type }));
      const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(e);
      out[type] = e.defaultPrevented;
    }
    return out;
  }, [selector, files] as const);
}

test('[LC-WIDE-DROP] a GPX dropped on its zone loads as if chosen, a JSON export dropped on Import imports; stray drops are cancelled; the pickers stay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await planner(page);
  await expect(page.locator('#gpxFile')).toBeAttached();
  await expect(page.locator('#gpxPick')).toBeVisible();
  // stray: on the rig, on step one's text, on the page; nothing loads
  for (const where of ['#rigBox', '#s1 .sub', 'body']) {
    const r = await dropAt(page, where, [{ name: 'trip.gpx', type: 'application/gpx+xml', text: '<gpx/>' }]);
    expect(Object.values(r).every(Boolean), `${where} ${JSON.stringify(r)}`).toBe(true);
  }
  expect(await page.evaluate('S.gpx')).toBeNull();
  // a drag that carries no file is left alone
  expect(await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    const e = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  })).toBe(false);

  const gpx = await fixtureGpx('heidelberg-strasbourg', { heights: true });
  expect(Object.values(await dropAt(page, '.gpxbar', [{ name: 'heidelberg.gpx', type: 'application/gpx+xml', text: gpx }])).every(Boolean)).toBe(true);
  await page.waitForFunction('S.gpx && S.gpx.km > 50', undefined, { timeout: 30_000 });
  await expect(page.locator('#gpxPick')).toHaveText('Remove this track');
  // a file that isn't a GPX, dropped on the GPX zone, changes nothing and says so
  const km = await page.evaluate('S.gpx.km');
  await dropAt(page, '.gpxbar', [{ name: 'notes.txt', type: 'text/plain', text: 'hello' }]);
  expect(await page.evaluate('S.gpx.km')).toBe(km);
  await expect(page.locator('#gpxMsg')).toContainText('GPX');

  // a JSON export with a setup, dropped on the Import row of the finished plan
  await finished(page);
  await expect(page.locator('#impFile')).toBeAttached();
  const exported = await page.evaluate(`(async () => { await saveSetup('Dropped', 'from a file'); const t = exportAll(); SETUPS.splice(0); await store.set(SETUP_KEY, []); renderResult(); return t; })()`) as string;
  expect(await page.evaluate('SETUPS.length')).toBe(0);
  expect(Object.values(await dropAt(page, '.datarow', [{ name: 'load-check.json', type: 'application/json', text: exported }])).every(Boolean)).toBe(true);
  await page.waitForFunction("SETUPS.some((s) => s.name === 'Dropped')", undefined, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('[LC-WIDE-TIP] the fill tip of the finished plan also shows on keyboard focus, and goes with it; the plan does not change', async ({ page }) => {
  await planner(page);
  await finished(page);
  const plan = await page.evaluate('JSON.stringify(currentPlan().slots.map((s) => [s.key, s.items.map((k) => k.id)]))');
  const tip = page.locator('#rigTip');
  await expect(tip).toBeHidden();
  const bag = page.locator('#rigSvg [data-inspect]').first();
  await bag.focus();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('% full');
  // next to the bag it belongs to, inside the rig
  const rig = await box(page.locator('#rigBox'));
  const t = await box(tip);
  expect(t.x).toBeGreaterThanOrEqual(rig.x);
  expect(t.x + t.width).toBeLessThanOrEqual(rig.x + rig.width + 1);
  await page.locator('#backToWayfinch').focus();
  await expect(tip).toBeHidden();
  expect(await page.evaluate('JSON.stringify(currentPlan().slots.map((s) => [s.key, s.items.map((k) => k.id)]))')).toBe(plan);
});

// ---- The glide (sub-project 6, Task 11; spec section 9.8) ----------------------------------------------------------------------

/** Whether this page opts in to the cross-document transition only inside prefers-reduced-motion: no-preference, and nowhere else. */
const optIn = (page: Page) => page.evaluate(() => {
  let inside = 0;
  let outside = 0;
  const walk = (rules: CSSRuleList, motionOk: boolean): void => {
    for (const r of [...rules]) {
      if (r.cssText.startsWith('@view-transition')) { if (motionOk) inside += 1; else outside += 1; }
      if (r instanceof CSSMediaRule) walk(r.cssRules, motionOk || /prefers-reduced-motion:\s*no-preference/.test(r.conditionText));
    }
  };
  for (const sheet of [...document.styleSheets]) {
    try { walk(sheet.cssRules, false); } catch { /* another origin's sheet */ }
  }
  return { inside, outside };
});

/** Every element named wf-bike, with whether it is or holds the 320 x 150 drawing. */
const named = (page: Page) => page.evaluate(() => [...document.querySelectorAll('*')]
  .filter((el) => getComputedStyle(el).getPropertyValue('view-transition-name') === 'wf-bike')
  .map((el) => ({ id: el.id, cls: el.getAttribute('class') ?? '', viewBox: (el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg'))?.getAttribute('viewBox') ?? null })));

/** Records, on every page this window opens, whether the browser gave the page a view transition, and how many elements were named
 *  wf-bike at that moment: only an element named then can glide (the owner's device check of 5 November: on the way back the bike
 *  "just appears somewhere else", because Wayfinch drew it after the page was revealed). */
const watchReveal = (page: Page) => page.addInitScript(() => {
  window.addEventListener('pagereveal', (e) => {
    sessionStorage.setItem('wf:vt', String(!!(e as Event & { viewTransition?: unknown }).viewTransition));
    const named = [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).getPropertyValue('view-transition-name') === 'wf-bike').length;
    sessionStorage.setItem('wf:vt-named', String(named));
  });
});
const revealed = (page: Page) => page.evaluate(() => sessionStorage.getItem('wf:vt'));
/** How many elements were named wf-bike when this page was revealed. */
const namedAtReveal = (page: Page) => page.evaluate(() => sessionStorage.getItem('wf:vt-named'));

const BIKES = JSON.stringify([{ id: 'bike_glide', name: 'Glide', look: { colour: '#3366cc', bars: 'drop', ebike: false } }]);

test('[LC-GLIDE] Chromium: both apps opt in under no-preference only; one wf-bike per page, on a 320 x 150 drawing; the small drawings never; the bike glides both ways', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'cross-document view transitions: Chromium');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await watchReveal(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await page.evaluate((b) => { localStorage.setItem('loadcheck:bikeProfiles', b); localStorage.setItem('loadcheck:bikeProfile', JSON.stringify(JSON.parse(b)[0])); }, BIKES);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  expect(await optIn(page)).toEqual({ inside: 1, outside: 0 });
  expect(await named(page)).toEqual([expect.objectContaining({ viewBox: '0 0 320 150' })]);
  // You: only small drawings, none named
  await page.goto(`${app.origin}/#/you`);
  await expect(page.locator('.bike-small svg').first()).toBeVisible({ timeout: 20_000 });
  expect(await named(page)).toEqual([]);
  // The Tools card into the bag planner: a view transition, the rig named
  await page.goto(`${app.origin}/#/tools`);
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  await page.locator('main[data-screen="tools"] .bike-tap').click();
  await page.waitForURL(/\/tools\/bags\//);
  await ready(page);
  expect(await revealed(page)).toBe('true');
  expect(await optIn(page)).toEqual({ inside: 1, outside: 0 });
  // opened on Bike details: the preview is the named one, the rig not
  await expect(page.locator('#bikeDetailsBox')).toBeVisible();
  await expect(page.locator('#lookPreview svg')).toBeVisible();
  expect((await named(page)).map((n) => n.viewBox)).toEqual(['0 0 320 150']);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#lookPreview svg')!).getPropertyValue('view-transition-name'))).toBe('wf-bike');
  await page.locator('#bikeDetailsClose').click();
  expect((await named(page)).map((n) => n.id)).toEqual(['rigSvg']);
  // Back to Wayfinch: a transition again, the drawing on Tools named, already when the page is revealed: the bike glides back
  await page.locator('#backToWayfinch').click();
  await page.waitForURL(`${app.origin}/#/tools`);
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  expect(await revealed(page)).toBe('true');
  expect(await namedAtReveal(page)).toBe('1');
  expect((await named(page)).length).toBe(1);
  // and once more both ways, from the bag planner's own card: every reveal glides, and no page reports an aborted transition
  for (let i = 0; i < 2; i += 1) {
    await page.locator('main[data-screen="tools"] a[href="/tools/bags/"]').click();
    await page.waitForURL(/\/tools\/bags\/$/);
    await ready(page);
    expect(await revealed(page)).toBe('true');
    await page.locator('#backToWayfinch').click();
    await page.waitForURL(`${app.origin}/#/tools`);
    await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
    expect(await revealed(page)).toBe('true');
    expect(await namedAtReveal(page)).toBe('1');
  }
  // From Trip and back to Trip: the same
  await page.goto(`${app.origin}/#/trip`);
  await expect(page.locator('main[data-screen="trip"] .bike-large svg')).toBeVisible();
  await page.locator('main[data-screen="trip"] .bike-tap').click();
  await page.waitForURL(/\/tools\/bags\//);
  await ready(page);
  await page.locator('#bikeDetailsClose').click();
  await page.locator('#backToWayfinch').click();
  await page.waitForURL(`${app.origin}/#/trip`);
  await expect(page.locator('main[data-screen="trip"] .bike-large svg')).toBeVisible();
  expect(await revealed(page)).toBe('true');
  expect(await namedAtReveal(page)).toBe('1');
  expect(errors).toEqual([]);
});

test('[LC-GLIDE-OFF] with reduced motion, and in browsers without the transition, pages switch normally and at once', async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await watchReveal(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  expect(await named(page)).toEqual([]);
  const started = Date.now();
  await page.locator('main[data-screen="tools"] .bike-tap').click();
  await page.waitForURL(/\/tools\/bags\//);
  await ready(page);
  expect(Date.now() - started).toBeLessThan(15_000);
  // no transition: Chromium says so; Firefox has no pagereveal at all
  expect(await revealed(page)).toBe(browserName === 'chromium' ? 'false' : null);
  expect(await named(page)).toEqual([]);
  await page.locator('#bikeDetailsClose').click();
  await page.locator('#backToWayfinch').click();
  await page.waitForURL(`${app.origin}/#/tools`);
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  // motion allowed in a browser without the transition: the same plain switch
  if (browserName !== 'chromium') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('main[data-screen="tools"] .bike-tap').click();
    await page.waitForURL(/\/tools\/bags\//);
    await ready(page);
    expect(await revealed(page)).toBeNull();
  }
  expect(errors).toEqual([]);
});

test('[LC-GLIDE-OFF] the transition never delays a navigation: Tools to the bag planner and back takes at most 1 s longer with motion allowed than with reduced motion', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  /** One round trip by the rider's own taps, timed from the tap until each page is ready. */
  const roundTrip = async (): Promise<number> => {
    const started = Date.now();
    await page.locator('main[data-screen="tools"] a[href="/tools/bags/"]').click();
    await page.waitForURL(/\/tools\/bags\/$/);
    await ready(page);
    await page.locator('#backToWayfinch').click();
    await page.waitForURL(`${app!.origin}/#/tools`);
    await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
    return Date.now() - started;
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await roundTrip(); // warm: the worker's copies and the browser's caches
  const times: Record<'reduce' | 'no-preference', number[]> = { reduce: [], 'no-preference': [] };
  for (let i = 0; i < 2; i += 1) {
    for (const motion of ['reduce', 'no-preference'] as const) {
      await page.emulateMedia({ reducedMotion: motion });
      times[motion].push(await roundTrip());
    }
  }
  const best = (list: number[]) => Math.min(...list);
  expect(best(times['no-preference']), JSON.stringify(times)).toBeLessThanOrEqual(best(times.reduce) + 1000);
});

// Wayfinch's entry script holds the first frame until it has run (blocking="render"), so the bike is drawn, and named, when the page is
// revealed. Before it has run the page is empty (tools/build: an empty #app), so the hold keeps back nothing a rider could see; these
// show it ends when the script does, and that a script that fails does not hold the page.
/** Records the first frame the page draws: when, and whether the screen was in it. */
const watchFirstFrame = (page: Page) => page.addInitScript(() => {
  requestAnimationFrame(() => {
    sessionStorage.setItem('wf:frame', JSON.stringify({ at: performance.now(), screen: document.querySelector('main[data-screen]') !== null }));
  });
});
const firstFrame = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('wf:frame') ?? 'null') as { at: number; screen: boolean } | null);
const scriptEnd = (page: Page) => page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).find((e) => /\/assets\/index-[^/]+\.js$/.test(e.name))?.responseEnd ?? null);

test('[LC-GLIDE-OFF] the entry script holds the first frame only until it has run: a slow one shows the screen in the first frame, a failed one holds nothing', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'render blocking by a script: Chromium');
  await watchFirstFrame(page);
  // Slow: the script arrives 1.5 s late; the first frame follows it at once, with the screen in it.
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await expect(page.locator('main[data-screen="tools"] .bike-large svg')).toBeVisible();
  await expect.poll(() => firstFrame(page)).not.toBeNull();
  const slow = (await firstFrame(page))!;
  const arrived = (await scriptEnd(page))!;
  expect(arrived).toBeGreaterThan(1400);
  expect(slow.screen).toBe(true);
  expect(slow.at - arrived).toBeLessThan(1000);
  await app.close();
  app = undefined;
  // Failed: no script at all; the page still draws its frames.
  await page.unroute(/\/assets\/index-[^/]+\.js$/);
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort());
  app = await loadApp(page, { launch: true, path: '/#/tools' });
  await expect.poll(() => firstFrame(page), { timeout: 5000 }).not.toBeNull();
  const failed = (await firstFrame(page))!;
  expect(failed.screen).toBe(false);
  expect(failed.at).toBeLessThan(3000);
});

test('[LC-WIDE-COLS] whenever the rig is sticky, all of it fits in the window: its foot and legend never hide below the edge, also with larger text (review M6)', async ({ page }) => {
  for (const [w, h, font] of [[1100, 560, null], [1280, 720, null], [1920, 1080, null], [1100, 600, '150%'], [1280, 720, '150%'], [1440, 900, '200%'], [1100, 560, '200%'], [1280, 600, '150%']] as const) {
    await planner(page, w, h);
    // A larger default text size: what a rider's browser setting does to the page's relative sizes, and a minimum font size to its px ones.
    if (font) await page.addStyleTag({ content: `html{font-size:${font} !important} body,body *{font-size:max(1em, ${font === '150%' ? 20 : 26}px) !important}` });
    await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }, { uid:3, pos:'bar', L:12 }, { uid:4, pos:'rack', L:15, pair:true }, { uid:5, pos:'bottle', slot:'dt', L:0.75 }, { uid:6, pos:'fork', L:3, pair:true }]; S.nextUid = 7; go(2); go(3); go(4)");
    if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(200);
    const facts = await page.evaluate(() => {
      const rig = document.getElementById('rigBox')!;
      const r = rig.getBoundingClientRect();
      return { sticky: getComputedStyle(rig).position === 'sticky', bottom: r.bottom, height: window.innerHeight };
    });
    if (!font) expect(facts.sticky, `${w} x ${h}`).toBe(true); // the usual case: it does stick
    if (facts.sticky) expect(facts.bottom, `${w} x ${h} ${font ?? ''}`).toBeLessThanOrEqual(facts.height);
    await app!.close();
    app = undefined;
  }
});

test('[LC-WIDE-COLS] a toolbar that hides on scroll (up to 80 px of window height) never makes the rig flip between sticky and not (review R1)', async ({ page }) => {
  const finishedPlan = async () => {
    await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'frame', L:6 }, { uid:3, pos:'bar', L:12 }]; S.nextUid = 4; go(2); go(3); go(4)");
    if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click();
    await page.waitForTimeout(300);
  };
  await planner(page, 1280, 720);
  await finishedPlan();
  // What the rig needs: its own height below Back to Wayfinch's row.
  const need = Math.ceil(await page.evaluate(() => document.getElementById('rigBox')!.offsetHeight + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--planner-top'))));
  await app!.close();
  app = undefined;
  const fits = () => page.evaluate(() => document.getElementById('rigBox')!.classList.contains('rig-fits'));
  // A device whose window is `start` px tall with its toolbar hidden, and 80 px less with it shown, scrolled back and forth.
  for (const start of [need + 40, need + 80]) {
    await planner(page, 1280, start);
    await finishedPlan();
    const states: boolean[] = [];
    for (const h of [start, start - 80, start, start - 80, start]) {
      await page.setViewportSize({ width: 1280, height: h });
      await page.waitForTimeout(150);
      states.push(await fits());
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      const facts = await page.evaluate(() => ({ sticky: getComputedStyle(document.getElementById('rigBox')!).position === 'sticky', bottom: document.getElementById('rigBox')!.getBoundingClientRect().bottom, height: window.innerHeight }));
      if (facts.sticky) expect(facts.bottom, `${h}`).toBeLessThanOrEqual(facts.height);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    // inside the band it never sticks; with 80 px to spare it sticks throughout
    expect(states, `${start}`).toEqual(Array(5).fill(start === need + 80));
    await app!.close();
    app = undefined;
  }
});

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

// The budgets of spec section 4.5 that need a page (plan Task 23, "Budgets as tests"), on the phone stand-in alone: the
// app-budgets project, Chromium at 360 x 640 with the processor slowed to a quarter, after every other project. Median of three.
// The size budgets (PERF-JS-FIRST, PERF-JS-LAZY, PERF-BOUNDARY, PERF-PACK's fixture) are in npm test, before a browser starts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadFixtureRoute } from '../fixtures/packs/index.ts';
import { goOffline, loadApp, preparedTrip, removeBuilds, serveRainyWeather, thisMorning } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';
import type { StoreInPage } from './fixtures/store-page.ts';

declare const __store: StoreInPage;

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
// Preparing 800 km on a slowed processor takes its time, three times over.
test.setTimeout(600_000);
// One at a time: two budgets timed side by side would each be timed on half a machine.
test.describe.configure({ mode: 'serial' });

// The departure is the morning's own date, in the same zone as the morning (Berlin): a UTC date was yesterday's from 23:00 UTC.
const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(thisMorning());
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const report = (id: string, xs: number[], unit = 'ms'): void => {
  const text = `${xs.map((x) => x.toFixed(0)).join(', ')} ${unit}, median ${median(xs).toFixed(0)} ${unit}`;
  test.info().annotations.push({ type: id, description: text });
  console.log(`${id} ${test.info().project.name}: ${text}`);
};

/** The browser's geolocation answers at once with one good reading at a point of the route, as accurate as `__fixM` says. */
async function geolocationAt(page: Page, lat: number, lon: number): Promise<void> {
  await page.addInitScript(([la, lo]) => {
    const geo = {
      watchPosition(ok: PositionCallback) {
        const accuracy = (window as unknown as { __fixM?: number }).__fixM ?? 12;
        setTimeout(() => ok({ coords: { latitude: la, longitude: lo, accuracy }, timestamp: Date.now() } as unknown as GeolocationPosition), 0);
        return 1;
      },
      getCurrentPosition() { /* not used */ },
      clearWatch() { /* nothing to clear */ },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  }, [lat, lon] as const);
}

test('[PERF-OFFLINE-2S] prepared 165 km fixture, flight mode: the strip and all six cards stand 2,000 ms after a position fix at most', async ({ page }) => {
  const at = (await loadFixtureRoute('heidelberg-strasbourg')).points[300]!;
  await geolocationAt(page, at.lat, at.lon);
  // A morning of the ride, the day's rain still ahead: the screen has its windows and plans to draw.
  const morning = thisMorning();
  await page.clock.install({ time: morning });
  app = await loadApp(page);
  await serveRainyWeather(page, morning.getTime());
  await preparedTrip(page, 'heidelberg-strasbourg', { departureDate: today(), places: true, weather: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await goOffline(page);
  const times: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    // Each time the app as a rider opens it in flight mode: a fresh load, from the worker's copy.
    await page.goto(`${app.origin}/#/ahead`, { waitUntil: 'load' });
    await expect(page.locator('[data-update-position]')).toBeVisible();
    // Each run's fix has its own accuracy, so the line shows this run's fix and not the one before.
    times.push(await page.evaluate((m) => new Promise<number>((done) => {
      (window as unknown as { __fixM: number }).__fixM = m;
      const t0 = performance.now();
      document.querySelector<HTMLButtonElement>('[data-update-position]')!.click();
      const shown = (): void => {
        const line = document.querySelector('[data-position-line]')?.textContent ?? '';
        const cards = [...document.querySelectorAll('[data-card]')].filter((c) => (c as HTMLElement).offsetParent !== null);
        if (line.includes(`±${m} m`) && cards.length === 6 && document.querySelector('[data-strip]')) done(performance.now() - t0);
        else requestAnimationFrame(shown);
      };
      shown();
    }), 11 + run));
  }
  report('PERF-OFFLINE-2S', times);
  expect(median(times)).toBeLessThanOrEqual(2000);
});

/** screen() three times in the page, at a morning moment at `km` of a prepared fixture with a rainy forecast. */
async function screenTimes(page: Page, id: string, km: number) {
  // The morning is passed in, not faked: Playwright's fake clock wraps every Date in the page and would slow screen() itself.
  const morning = thisMorning();
  app = await loadApp(page);
  await serveRainyWeather(page, morning.getTime());
  await preparedTrip(page, id, { departureDate: today(), places: true, weather: true, atMs: morning.getTime() });
  return page.evaluate(async ([at, start]) => {
    const times: number[] = [];
    let parts: ReturnType<typeof __store.buildScreen>['parts'] | null = null;
    let i: Awaited<ReturnType<typeof __store.readInputs>> = null;
    let cold = 0;
    // The first screen() of a page is the one Ahead draws when it opens, before any fix: it pays for the engines' first
    // compile, and PERF-OFFLINE-2S times it. Then three as on each new fix, the median of which is the budget's figure.
    for (let n = 0; n < 4; n += 1) {
      // Each run as the app makes one: inputs freshly read from the store, a minute later, the rider a kilometre on. Only
      // screen() itself is timed.
      const now = new Date(start + n * 60_000);
      const base = (await __store.readInputs(now))!;
      const point = base.trip.route.points.reduce((best, p) => (Math.abs(p.km - (at + n)) < Math.abs(best.km - (at + n)) ? p : best));
      i = { ...base, now, positions: [{ lat: point.lat, lon: point.lon, accuracyM: 12, at: now, km: point.km, offRouteM: 0, source: 'gps' as const, approximate: false }] };
      const t0 = performance.now();
      const built = __store.buildScreen(i);
      if (n === 0) cold = performance.now() - t0;
      else times.push(performance.now() - t0);
      parts = built.parts;
    }
    i = i!;
    return {
      times, cold, windows: parts!.windows.length, plans: parts!.plans.length, waitOrGo: parts!.wg !== null, ideas: parts!.ideas !== null,
      leaveBy: parts!.lb !== null, rescue: i.rescuePoints.length, places: i.places.length,
    };
  }, [km, morning.getTime()] as const);
}

test('[PERF-SCREEN] screen() in the page on the 165 km fixture, rainy, with its places: at most 300 ms, with rain windows, wait or go, stop ideas, leave-by', async ({ page }) => {
  // The plan's 200 km route: the 165 km Heidelberg → Strasbourg fixture is the nearest with a real pack.
  const out = await screenTimes(page, 'heidelberg-strasbourg', 20);
  report('PERF-SCREEN', out.times);
  console.log(`PERF-SCREEN parts: ${JSON.stringify({ ...out, times: undefined })}`);
  expect(out.windows).toBeGreaterThan(0);
  expect(out.plans).toBeGreaterThan(0);
  expect(out.waitOrGo).toBe(true);
  expect(out.ideas).toBe(true);
  expect(out.leaveBy).toBe(true);
  expect(out.rescue).toBeGreaterThan(0);
  expect(median(out.times)).toBeLessThanOrEqual(300);
});

// The budget is for a 200 km route. Sub-project 3 left the 800 km fixture with its 3,998 places to re-measure: its figure is
// reported beside the budget for the owner, and held only to what a rider would feel, the 2 s of PERF-OFFLINE-2S, cold.
test('[PERF-SCREEN] the 800 km fixture with its 3,998 places, measured and reported (sub-project 3 left it to re-measure)', async ({ page }) => {
  const out = await screenTimes(page, 'multi-day-800', 20);
  report('PERF-SCREEN-800', out.times);
  console.log(`PERF-SCREEN-800 parts: ${JSON.stringify({ ...out, times: undefined })}`);
  expect(out.places).toBeGreaterThan(3000);
  expect(out.cold).toBeLessThanOrEqual(2000);
});

test('[PERF-PREP-800] Prepare this route on the 800 km fixture and its places: at most 20 s of processing, the network a local stand-in', async ({ page }) => {
  app = await loadApp(page);
  const times: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    // A fresh phone each time: nothing of the run before is kept.
    await page.evaluate(async () => {
      for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
      localStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const t0 = Date.now();
    const trip = await preparedTrip(page, 'multi-day-800', { departureDate: today(), places: true });
    times.push(Date.now() - t0);
    expect(trip.route.lengthKm).toBeGreaterThan(700);
  }
  const counts = await page.evaluate(async () => { const db = await __store.openDb(); return { places: await db.count('places'), hours: await db.count('hours') }; });
  console.log(`PERF-PREP-800 stored: ${JSON.stringify(counts)}`);
  report('PERF-PREP-800', times);
  expect(median(times)).toBeLessThanOrEqual(20_000);
});

test('[PERF-BIKE] [PERF-SCREEN] the phone stand-in really is slowed: the same work takes at least 2.5 times as long at 4x CPU throttling', async ({ page }) => {
  // Every budget here is timed on a processor slowed to a quarter; if the browser ignores the throttle, the figures are a laptop's.
  await page.setContent('<p>stand-in</p>');
  const work = () => page.evaluate(() => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 2e7; i += 1) x += Math.sqrt(i); return x > 0 ? performance.now() - t0 : 0; });
  const plain: number[] = [];
  for (let n = 0; n < 3; n += 1) plain.push(await work());
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slowed: number[] = [];
  for (let n = 0; n < 3; n += 1) slowed.push(await work());
  report('PERF-STAND-IN', [median(plain), median(slowed)]);
  expect(median(slowed) / median(plain)).toBeGreaterThanOrEqual(2.5);
});

// Review of PR 89, I2: the task in which the balance landed took 256–273 ms on the phone stand-in. From the moment the packing check is
// drawn until the balance's line is there, no task of the page reaches 200 ms.
test('[PERF-BAL] the balancing at the packing check on the phone stand-in: no task of 200 ms or more from the drawn packing check until its line lands', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:4.5 }, { uid:4, pos:'top', L:1, slot:'front' }, { uid:5, pos:'fork', L:3, pair:true }]; S.nextUid = 6; S.decks = { bar:false, rack:false }; go(2); go(3)");
  // advisor.js loaded beforehand, so what is measured is the search and its landing
  await page.evaluate('loadAdvisor()');
  const r = await page.evaluate(`(async () => {
    go(4);
    if (!document.getElementById('maxWeightBox').classList.contains('hidden')) document.getElementById('mwClose').click();
    // from the next task on: the one go(4) ran in is the packing check's own drawing, measured by the step's budgets
    await new Promise((res) => setTimeout(res, 0));
    const tasks = [];
    const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) tasks.push(Math.round(e.duration)); });
    obs.observe({ type: 'longtask' });
    const line = () => (document.querySelector('#resultBox .balance-line') || {}).textContent || '';
    while (!/^Packed for better balance/.test(line())) await new Promise((res) => setTimeout(res, 20));
    // the tasks that draw it again, after the landing
    await new Promise((res) => setTimeout(res, 300));
    obs.disconnect();
    return tasks;
  })()`) as number[];
  report('PERF-BAL', r.length ? r : [0]);
  expect(Math.max(0, ...r), `the long tasks: ${r.join(', ')} ms`).toBeLessThan(200);
});

test('[PERF-WM] the weight map paints in 50 ms or less a map on the phone stand-in: yours and the ideal together in 100 ms', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  // the map is at the packing check, behind "Show the map" once the line has its answer (the owner's decision of 9 Nov 2026)
  await page.evaluate("S.bags = [{ uid:1, pos:'rack', L:20, pair:true }, { uid:2, pos:'bar', L:9 }, { uid:3, pos:'pack', L:12 }, { uid:4, pos:'seat', L:10 }, { uid:5, pos:'frame', L:6 }]; S.nextUid = 6; S.decks = { bar:false, rack:true }; go(2); go(3); go(4)");
  if (await page.locator('#maxWeightBox').isVisible()) await page.locator('#mwClose').click(); // the weight question, skipped
  await expect(page.locator('#weightLine')).not.toHaveText('Checking the balance…', { timeout: 30_000 });
  // this plan is balanced as its bags allow, so the map is not offered: weightmap.js loaded and drawn as "Show the map" would
  await page.evaluate("WEIGHT_MAP.on = true; loadWeightMap().then(() => { WEIGHT_MAP.drawn = ''; const box = document.getElementById('weightMap'); box.hidden = false; window.WayfinchWeightMap.render(box, weightMapInput()); })");
  await expect(page.locator('#weightMap .wm-card')).toHaveCount(2);
  const times = await page.evaluate(() => {
    const w = window as unknown as { WayfinchWeightMap: { render: (h: HTMLElement, i: unknown) => void }; weightMapInput: () => unknown };
    const box = document.getElementById('weightMap')!;
    const input = w.weightMapInput();
    return Array.from({ length: 5 }, () => { const t = performance.now(); w.WayfinchWeightMap.render(box, input); return performance.now() - t; });
  });
  report('PERF-WM', times);
  expect(median(times)).toBeLessThanOrEqual(100);
});

// Handling first (design of 10 Nov 2026, §8): two searches, about two to three times the automatic balance, so it runs in slices with
// "Packing for handling…"; from the press until its line lands, no task of the page reaches 200 ms on the phone stand-in.
test('[PERF-HF] Handling first on the phone stand-in: no task of 200 ms or more from the press until its line lands', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/tools/bags/' });
  await page.evaluate("S.bags = [{ uid:1, pos:'seat', L:14 }, { uid:2, pos:'bar', L:13 }, { uid:3, pos:'frame', L:4.5 }, { uid:4, pos:'top', L:1, slot:'front' }, { uid:5, pos:'fork', L:3, pair:true }]; S.nextUid = 6; S.decks = { bar:false, rack:false }; go(2); go(3)");
  await page.evaluate('loadAdvisor()');
  await page.evaluate("go(4); if (!document.getElementById('maxWeightBox').classList.contains('hidden')) document.getElementById('mwClose').click()");
  await page.waitForFunction("!BALANCE.run && !document.getElementById('rigHandling').hidden && document.getElementById('rigHandling').getAttribute('aria-disabled') === 'false'", null, { timeout: 60_000 });
  const r = await page.evaluate(`(async () => {
    await new Promise((res) => setTimeout(res, 300));
    const tasks = [];
    const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) tasks.push(Math.round(e.duration)); });
    obs.observe({ type: 'longtask' });
    const t0 = performance.now();
    document.getElementById('rigHandling').click();
    const line = () => (document.querySelector('#resultBox .balance-line') || {}).textContent || '';
    while (!/^(Packed for handling|Already packed for handling|Nothing moved)/.test(line())) await new Promise((res) => setTimeout(res, 20));
    const ms = Math.round(performance.now() - t0);
    await new Promise((res) => setTimeout(res, 300));
    obs.disconnect();
    return { tasks, ms };
  })()`) as { tasks: number[]; ms: number };
  console.log(`PERF-HF: the line after ${r.ms} ms`);
  report('PERF-HF', r.tasks.length ? r.tasks : [0]);
  expect(Math.max(0, ...r.tasks), `the long tasks: ${r.tasks.join(', ')} ms`).toBeLessThan(200);
});

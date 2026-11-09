// Simulator screens in the browser (plan Task 17, spec section 11.7): 50 fixed seeds of the simulator's trip moments, each drawn
// on Ahead through `window.__wf.loadCase` of a --test-hooks build. The page shows the screen's own words, nothing is wider than
// the screen at 360 and at 1280 px, every card title shows whole, and the automatic accessibility checks pass.
import AxeBuilder from '@axe-core/playwright';
import fc from 'fast-check';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { shownScreen } from '../../src/core/screen/from-start.ts';
import type { Screen } from '../../src/core/screen/screen.ts';
import type { Answer } from '../../src/core/types.ts';
import { scenario } from '../gen/scenario.ts';
import { decodeCase, encodeCase } from '../sim/harness.ts';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

const SEEDS = Array.from({ length: 50 }, (_, n) => 20261103 + n);
const WIDTHS = [360, 1280];
const CHIPS: [keyof Screen['chips'], string][] = [['bike', 'Bike shop'], ['pharmacy', 'Pharmacy'], ['train', 'Bail out by train'], ['toilets', 'Toilets'], ['shelter', 'Shelter'], ['emergency', 'Emergency']];

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
// One project is enough: each test sets both widths itself.
test.beforeEach(() => { test.skip(test.info().project.name !== 'app-laptop', 'drawn at both widths in the laptop project'); });

const strings = (a: Answer): string[] => [a.title, a.detail, ...a.items.flatMap((x) => [x.label, x.detail ?? '']), ...a.basis].filter((t) => t.trim() !== '');
const pageText = (page: Page): Promise<string> => page.locator('.ahead').evaluate((el) => el.textContent ?? '');

async function expandAll(page: Page): Promise<void> {
  const closed = page.locator('.ah-toggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  for (;;) {
    const more = page.locator('.ahead button', { hasText: /^Show \d+ more$/ });
    if ((await more.count()) === 0) break;
    await more.first().click();
  }
}

/** Nothing reaches past the screen's right edge, and each card title is shown whole. */
async function fits(page: Page, width: number): Promise<void> {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > w) out.push(`page ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of document.querySelectorAll('.shell *')) {
      if (el.closest('.visually-hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} right ${Math.round(r.right)} > ${w}`);
    }
    for (const t of document.querySelectorAll<HTMLElement>('.ah-card-title, .ah-card-title button')) {
      if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) out.push(`title clipped: ${t.textContent}`);
    }
    return out;
  });
  expect(problems, `at ${width} px`).toEqual([]);
}

async function axe(page: Page, width: number): Promise<void> {
  const results = await new AxeBuilder({ page }).include('#main').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`), `at ${width} px`).toEqual([]);
}

for (const seed of SEEDS) {
  test(`[AH-SIM-SCREENS] seed ${seed}: the page shows the screen's words, fits 360 and 1280 px, and passes the accessibility checks`, async ({ page }) => {
    const inputs = fc.sample(scenario(), { seed, numRuns: 1 })[0]!;
    const json = encodeCase({ id: 'AH-SIM-SCREENS', seed, replayPath: '', message: '', inputs });
    // What En route shows: screen()'s own, or from km 0 on a trip day with no position (AH-FROM-START, owner's finding K).
    const screen = shownScreen(decodeCase(json).inputs).screen;
    app = await loadApp(page, { launch: true, testHooks: true });
    await page.waitForFunction(() => '__wf' in window);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate((text) => (window as unknown as { __wf: { loadCase: (t: string) => void } }).__wf.loadCase(text), json);
      const shown = page.locator('.ahead[data-ahead]');
      await expect(shown).toBeVisible();
      const answers = (await shown.getAttribute('data-ahead')) === 'answers';
      if (answers) {
        await expandAll(page);
        const text = await pageText(page);
        const wanted = [
          ...(screen.positionLine ? [screen.positionLine] : []), ...screen.notes, screen.strip.label, screen.strip.endText,
          ...(['water', 'food', 'daylight', 'weather', 'climbing', 'sleep'] as const).flatMap((c) => [...strings(screen.cards[c]), ...(screen.stamps[c] ? [screen.stamps[c]!] : [])]),
        ];
        for (const t of wanted) expect(text, `seed ${seed}, ${width} px: ${t}`).toContain(t);
        await fits(page, width);
        await axe(page, width);
      } else {
        await expect(page.locator('[data-card]')).toHaveCount(0);
      }
      for (const [chip, label] of answers ? CHIPS : CHIPS.slice(-1)) {
        const button = page.locator('.ah-chips').getByRole('button', { name: label, exact: true });
        if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
        await expandAll(page);
        const text = await pageText(page);
        const a = screen.chips[chip];
        const extra = chip === 'emergency' ? [screen.chips.emergency.detail, ...screen.chips.emergency.notes] : [];
        for (const t of [...strings(a), ...extra, ...(screen.stamps[chip] && chip !== 'emergency' ? [screen.stamps[chip]!] : [])]) {
          expect(text, `seed ${seed}, ${width} px, ${chip}: ${t}`).toContain(t);
        }
      }
      await fits(page, width);
      if (!answers) await axe(page, width);
    }
  });
}

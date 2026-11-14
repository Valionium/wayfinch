// Sweep of 14 Nov 2026 (49, 50): focus on You never falls to the page body, and the import has its own heading.
import { expect, test } from '@playwright/test';
import { loadApp, removeBuilds } from './helpers.ts';
import type { LoadedApp } from './helpers.ts';

let app: LoadedApp | undefined;
test.afterEach(async () => { await app?.close(); app = undefined; });
test.afterAll(() => removeBuilds());
test.use({ actionTimeout: 15_000 });
expect.configure({ timeout: 15_000 });

const bodyFocused = (page: import('@playwright/test').Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

test('[YOU-FOCUS] the delete question takes the focus as it opens; Keep my data gives it back to the button', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  const open = page.getByRole('button', { name: 'Delete Wayfinch data from this phone' });
  await open.click();
  await expect(page.locator('#del-ask')).toBeFocused();
  await page.getByRole('button', { name: 'Keep my data' }).click();
  await expect(open).toBeFocused();
  expect(await bodyFocused(page)).toBe(false);
});

test('[YOU-FOCUS] the Report a ride form takes the focus on its first field; Cancel gives it back to the button', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  const open = page.getByRole('button', { name: 'Report a ride' });
  await open.click();
  await expect(page.locator('#ride-hours')).toBeFocused();
  await page.locator('[data-ride-form]').getByRole('button', { name: 'Cancel' }).click();
  await expect(open).toBeFocused();
});

test('[YOU-IMPORT-HEAD] the import has a visible heading of its own, below the export and its note', async ({ page }) => {
  app = await loadApp(page, { launch: true, path: '/#/you' });
  await expect(page.locator('[data-you-loaded]')).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Import from a file' });
  await expect(heading).toBeVisible();
  const note = (await page.locator('[data-export-import] .muted').first().boundingBox())!;
  expect((await heading.boundingBox())!.y).toBeGreaterThan(note.y);
  await expect(page.getByLabel('Choose a saved Wayfinch file')).toBeVisible();
});

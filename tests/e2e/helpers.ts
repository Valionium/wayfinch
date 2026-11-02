// Shared steps for the app's browser tests (plan Task 2). Nothing here prints a page.
// `preparedTrip` and `atPosition` need the store and the test-only hook (`window.__wf`, Task 17), which come later: they say so
// instead of pretending, and the task that builds them replaces the bodies.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildDist } from '../../tools/build.mjs';
import { startCfLike } from './server/cf-like.mjs';
import type { CfLike } from './server/cf-like.mjs';

const built = new Map<string, Promise<string>>();
const roots: string[] = [];

/** A real build in a fresh folder, once per worker and switch position. */
function siteFor(launch: boolean): Promise<string> {
  const key = String(launch);
  if (!built.has(key)) {
    const root = mkdtempSync(join(tmpdir(), 'wf-app-e2e-'));
    roots.push(root);
    const dir = join(root, 'site');
    built.set(key, buildDist({ out: dir, launch }).then(() => dir));
  }
  return built.get(key)!;
}

export function removeBuilds(): void {
  built.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

/** The phone stand-in slows the processor to a quarter (§4.5); projects ask for it in their metadata. */
export async function throttleIfPhone(page: Page): Promise<void> {
  if (test.info().project.metadata.cpuThrottle !== 4) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

export interface LoadedApp {
  server: CfLike;
  origin: string;
  close: () => Promise<void>;
}

/** Serves a build like the host does, blocks every outside address, and opens the app. */
export async function loadApp(page: Page, options: { launch: boolean; path?: string } = { launch: true }): Promise<LoadedApp> {
  const server = await startCfLike({ dir: await siteFor(options.launch) });
  await page.context().route(/^https:\/\//, (route) => route.abort());
  await throttleIfPhone(page);
  await page.goto(`${server.origin}${options.path ?? '/'}`, { waitUntil: 'domcontentloaded' });
  return { server, origin: server.origin, close: () => server.close() };
}

/** Flight mode: the network is gone for this window. */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/** A fixed time for the page: `page.clock` stops it moving on its own. Call before loading. */
export async function fixedClock(page: Page, iso: string): Promise<void> {
  await page.clock.install({ time: new Date(iso) });
}

export async function preparedTrip(page: Page, id: string): Promise<void> {
  throw new Error(`preparedTrip(${page.url()}, ${id}) needs the store (Task 3) and the test hook (Task 17).`);
}

export async function atPosition(page: Page, km: number, opts: { accuracyM?: number; ageMin?: number } = {}): Promise<void> {
  throw new Error(`atPosition(${page.url()}, ${km}, ${JSON.stringify(opts)}) needs the store (Task 3) and the test hook (Task 17).`);
}

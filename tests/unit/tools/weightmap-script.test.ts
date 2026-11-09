import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { afterAll, expect, test, vi } from 'vitest';
import { buildDist } from '../../../tools/build.mjs';

const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-weightmap-js-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

test('[WM-SIZE] weightmap.js builds as its own classic script, sets window.WayfinchWeightMap, is precached and at most 4 KB gzipped', async () => {
  const out = join(tmpRoot, 'on');
  const result = await buildDist({ out, launch: true, vite: vi.fn(() => Promise.resolve()) });
  const source = readFileSync(join(out, 'tools', 'bags', 'weightmap.js'), 'utf8');
  expect(source).not.toMatch(/^\s*(import|export)\s/m);
  expect(result.precache['/tools/bags/weightmap.js']).toBeDefined();
  expect(readFileSync(join(out, '_headers'), 'utf8')).toContain('/tools/bags/weightmap.js\n  Cache-Control: no-cache\n');
  const context = { window: {} as Record<string, unknown> };
  runInNewContext(source, context);
  const api = context.window.WayfinchWeightMap as Record<string, unknown>;
  expect(Object.keys(api).sort()).toEqual(['render']);
  expect(Object.isFrozen(api)).toBe(true);
  // the bike.js the page loads first carries no weight map: nothing of it downloads before the press
  expect(readFileSync(join(out, 'tools', 'bags', 'bike.js'), 'utf8')).not.toContain('Of the weighted load');
  const bytes = gzipSync(source, { level: 9 }).length;
  console.log(`WM-SIZE: weightmap.js ${bytes} bytes gzipped`);
  expect(bytes).toBeLessThanOrEqual(4096);

  const off = join(tmpRoot, 'off');
  const offResult = await buildDist({ out: off, launch: false, vite: vi.fn(() => Promise.resolve()) });
  expect(offResult.precache['/tools/bags/weightmap.js']).toBeUndefined();
}, 60_000);

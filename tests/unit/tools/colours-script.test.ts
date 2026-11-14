// More colours (wish 4, design of 14 Nov 2026): colours.js, the bag planner's own colour picker, built as its own classic script.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { afterAll, expect, test, vi } from 'vitest';
import { buildDist } from '../../../tools/build.mjs';

const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-colours-js-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

test('[LC-COLOURS-LAZY] colours.js builds as its own classic script, sets window.WayfinchColours, is precached, at most 4 KB gzipped; bike.js carries none of it; the off build has none', async () => {
  const out = join(tmpRoot, 'on');
  const result = await buildDist({ out, launch: true, vite: vi.fn(() => Promise.resolve()) });
  const source = readFileSync(join(out, 'tools', 'bags', 'colours.js'), 'utf8');
  expect(source).not.toMatch(/^\s*(import|export)\s/m);
  expect(result.precache['/tools/bags/colours.js']).toBeDefined();
  expect(readFileSync(join(out, '_headers'), 'utf8')).toContain('/tools/bags/colours.js\n  Cache-Control: no-cache\n');
  const context = { window: {} as Record<string, unknown> };
  runInNewContext(source, context);
  const api = context.window.WayfinchColours as Record<string, unknown>;
  expect(Object.keys(api).sort()).toEqual(['openColours']);
  expect(Object.isFrozen(api)).toBe(true);
  // the page's first download, bike.js, carries none of the grid: it comes only with the first tap of More colours
  expect(readFileSync(join(out, 'tools', 'bags', 'bike.js'), 'utf8')).not.toContain('Raw aluminium');
  const bytes = gzipSync(source, { level: 9 }).length;
  console.log(`LC-COLOURS-LAZY: colours.js ${bytes} bytes gzipped`);
  expect(bytes).toBeLessThanOrEqual(4096);

  const off = join(tmpRoot, 'off');
  const offResult = await buildDist({ out: off, launch: false, vite: vi.fn(() => Promise.resolve()) });
  expect(offResult.precache['/tools/bags/colours.js']).toBeUndefined();
  expect(readFileSync(join(off, '_headers'), 'utf8')).not.toContain('colours.js');
}, 60_000);

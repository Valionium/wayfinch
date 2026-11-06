import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { afterAll, expect, test, vi } from 'vitest';
import { buildDist } from '../../../tools/build.mjs';
import sample from '../../../contracts/bike-library/sample.json';
import { bikeArt, normaliseBike, resolveBikeSpec } from '../../../src/core/bike/index.ts';

const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-bike-js-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

test('[BK-ART-ANCHORS] with the switch on the bag planner gets /tools/bags/bike.js: a classic script giving the same drawing; with it off, nothing', async () => {
  const out = join(tmpRoot, 'on');
  const result = await buildDist({ out, launch: true, vite: vi.fn(() => Promise.resolve()) });
  const source = readFileSync(join(out, 'tools', 'bags', 'bike.js'), 'utf8');
  expect(source).not.toMatch(/^\s*(import|export)\s/m); // no module syntax: a plain <script src> runs it
  expect(result.precache['/tools/bags/bike.js']).toBeDefined();
  expect(readFileSync(join(out, '_headers'), 'utf8')).toContain('/tools/bags/bike.js\n  Cache-Control: no-cache\n');
  // The page's own realm: its records come from its own JSON.parse.
  const context = { window: {} as Record<string, unknown>, text: JSON.stringify(sample[0]) };
  runInNewContext(source, context);
  expect(Object.keys(context.window.WayfinchBike as object).sort()).toEqual(['SWATCHES', 'bikeArt', 'nearestSwatchName', 'normaliseBike', 'oklabMedian', 'resolveBikeSpec',
    'PATTERN_LIST', 'FADES', 'DEFAULT_COLOURS', 'PAINT_WORDS', 'forkColours', 'pairFor', 'colourName'].sort());
  const theirs = runInNewContext('const B = window.WayfinchBike; B.bikeArt(B.resolveBikeSpec(B.normaliseBike(JSON.parse(text)), null), null).svg', context) as string;
  const mine = bikeArt(resolveBikeSpec(normaliseBike(sample[0]), null), null);
  expect(mine.label).toContain('blue frame');
  expect(theirs).toBe(mine.svg);
  // The page's copy carries the wording file as well; the app shares that file with every screen.
  expect(gzipSync(source, { level: 9 }).length).toBeLessThan(40_000);

  const off = join(tmpRoot, 'off');
  const offResult = await buildDist({ out: off, launch: false, vite: vi.fn(() => Promise.resolve()) });
  expect(offResult.precache['/tools/bags/bike.js']).toBeUndefined();
}, 60_000);

test('[PERF-BIKE] the bike module adds under 15 KB gzipped to the first screen (PERF-JS-FIRST), the wording file it shares aside', async () => {
  const result = await build({
    entryPoints: ['src/core/bike/index.ts'], bundle: true, write: false, format: 'esm', minify: true, logLevel: 'silent',
    plugins: [{ name: 'shared-wording', setup(b) { b.onResolve({ filter: /wording[\/]en.ts$/ }, (a) => ({ path: a.path, external: true })); } }],
  });
  const bytes = gzipSync(result.outputFiles[0]!.contents, { level: 9 }).length;
  expect(bytes).toBeGreaterThan(3_000);
  expect(bytes).toBeLessThan(15_000);
});

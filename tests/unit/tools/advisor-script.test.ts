import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { afterAll, expect, test, vi } from 'vitest';
import { buildDist } from '../../../tools/build.mjs';
import { advise } from '../../../src/core/advisor/search.ts';
import { MIN_GAIN_BACK_L, SIZE_RANGES, WEIGHTS } from '../../../src/core/advisor/table.ts';

const tmpRoot = mkdtempSync(join(tmpdir(), 'wf-advisor-js-'));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

// A tiny rider for both realms: a 15 L backpack holding 6 L; any bike bag of 6 L or more takes it all.
const RIDER = `({
  style: 'either', goal: 'backpack', noPanniers: false, bags: [{ uid: 1, pos: 'pack', L: 15 }], decks: { rack: false, bar: false },
  camping: false, nextUid: 2, frameShapes: [{ shape: 0, L: 6, source: 'measured' }], frameReason: null, topSlotsFree: ['front'],
  rackMounts: 'yes', usable: () => ({ ok: true, reason: null }),
  trial: (bags) => { const room = bags.filter((b) => b.pos !== 'pack').reduce((n, b) => n + b.L * (b.pair ? 2 : 1), 0);
    const back = room >= 6 ? 0 : 6; return { overL: 0, spillIds: [], backL: back, backKg: back / 3, outOfReach: 0, kgByPos: { pack: back / 3 }, items: {} }; },
})`;

test('[GA-SIZE] advisor.js builds, sets window.WayfinchAdvisor, and is under 20 KB gzipped', async () => {
  const out = join(tmpRoot, 'on');
  const result = await buildDist({ out, launch: true, vite: vi.fn(() => Promise.resolve()) });
  const source = readFileSync(join(out, 'tools', 'bags', 'advisor.js'), 'utf8');
  expect(source).not.toMatch(/^\s*(import|export)\s/m); // a classic script: the page loads it with a plain <script src>
  expect(result.precache['/tools/bags/advisor.js']).toBeDefined();
  expect(readFileSync(join(out, '_headers'), 'utf8')).toContain('/tools/bags/advisor.js\n  Cache-Control: no-cache\n');

  const context = { window: {} as Record<string, unknown> };
  runInNewContext(source, context);
  const api = context.window.WayfinchAdvisor as Record<string, unknown>;
  // MIN_GAIN_BACK_L too: the page's cannot-reduce sentence reads it (re-check of PR 60)
  expect(Object.keys(api).sort()).toEqual(['MIN_GAIN_BACK_L', 'SIZE_RANGES', 'WEIGHTS', 'advise', 'adviseSteps']);
  expect(api.MIN_GAIN_BACK_L).toBe(MIN_GAIN_BACK_L);
  expect(Object.isFrozen(api)).toBe(true);
  expect(JSON.parse(JSON.stringify(api.WEIGHTS))).toEqual(WEIGHTS);
  expect(JSON.parse(JSON.stringify(api.SIZE_RANGES))).toEqual(SIZE_RANGES);
  // The script gives the same answer as the module.
  const theirs = runInNewContext(`JSON.stringify(window.WayfinchAdvisor.advise(${RIDER}))`, context) as string;
  const mine = advise(runInNewContext(RIDER, {}) as Parameters<typeof advise>[0]);
  expect(mine.kind).toBe('suggestions');
  expect(JSON.parse(theirs)).toEqual(JSON.parse(JSON.stringify(mine)));
  const steps = runInNewContext(`[...window.WayfinchAdvisor.adviseSteps(${RIDER})]`, context) as number[];
  expect(steps.every((n) => n % 20 === 0)).toBe(true);

  const bytes = gzipSync(source, { level: 9 }).length;
  console.log(`GA-SIZE: advisor.js ${bytes} bytes gzipped`);
  expect(bytes).toBeLessThan(20_000);

  const off = join(tmpRoot, 'off');
  const offResult = await buildDist({ out: off, launch: false, vite: vi.fn(() => Promise.resolve()) });
  expect(offResult.precache['/tools/bags/advisor.js']).toBeUndefined();
  expect(readFileSync(join(off, '_headers'), 'utf8')).not.toContain('advisor.js');
}, 60_000);

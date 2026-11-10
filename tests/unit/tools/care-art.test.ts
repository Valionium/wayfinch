// The construction kit for Bike care's drawings (care pictures redo, proposal of 9 November 2026, sections 7 and 8): every drawing file is
// the kit's output byte for byte, never edited by hand; every drawing states the facts its mechanism needs (pads on the rim's flanks, an
// axle through its fork ends, a leader on its part) and each holds; and the measuring itself can fail.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { DRAWINGS } from '../../../tools/care-art/drawings.ts';
import { clear, Pic, pointsAt, poly, rrect, touches } from '../../../tools/care-art/kit.ts';

const CARE = fileURLToPath(new URL('../../../src/tools/care/', import.meta.url));
const svgs = (dir: string): string[] => readdirSync(join(CARE, dir)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('[CARE-ART-BUILT] every picture and close-up file is a kit drawing, byte for byte; every kit drawing has its file', () => {
  for (const dir of ['pictures', 'parts'] as const) {
    const made = DRAWINGS.filter((d) => d.dir === dir).map((d) => d.id).sort();
    expect(svgs(dir), dir).toEqual(made);
  }
  expect(new Set(DRAWINGS.map((d) => d.id)).size).toBe(DRAWINGS.length);
  for (const d of DRAWINGS) expect(readFileSync(join(CARE, d.dir, `${d.id}.svg`), 'utf8'), d.id).toBe(d.make().svg());
});

test('[CARE-ART-FACTS] every drawing states at least three facts of its mechanism, and each holds', () => {
  for (const d of DRAWINGS) {
    const pic = d.make();
    expect(pic.facts.length, d.id).toBeGreaterThanOrEqual(3);
    for (const f of pic.facts) expect(f.ok, `${d.id}: ${f.what} (${f.detail ?? ''})`).toBe(true);
  }
});

test('[CARE-ART-FACTS] the measuring can fail: a pad off its flank, a pad in the tyre, a leader that stops short', () => {
  const pic = new Pic(100, 100);
  pic.path('cp-obj', rrect(10, 10, 20, 40, 2), { name: 'tyre' });
  pic.path('cp-obj', poly([[40, 10], [40, 50]], false), { name: 'flank' });
  pic.path('cp-rubber', rrect(42, 20, 6, 10, 1), { name: 'pad-off' });
  pic.path('cp-rubber', rrect(25, 20, 6, 10, 1), { name: 'pad-in' });
  pic.path('cp-rubber', rrect(34, 20, 6, 10, 1), { name: 'pad-on' });
  pic.line('cp-thin', [90, 90], [52, 26], { name: 'leader' });
  expect(touches(pic, 'pad-on', 'flank', 0.6).ok).toBe(true);
  expect(touches(pic, 'pad-off', 'flank', 0.6).ok).toBe(false);
  expect(clear(pic, 'pad-on', 'tyre', 1).ok).toBe(true);
  expect(clear(pic, 'pad-in', 'tyre', 1).ok).toBe(false);
  expect(pointsAt(pic, 'leader', 'pad-off', 1.5).ok).toBe(false);
  pic.line('cp-thin', [90, 90], [47, 25], { name: 'leader-2' });
  expect(pointsAt(pic, 'leader-2', 'pad-off', 1.5).ok).toBe(true);
  // two outlines that cross in their middles touch, though no corner of one lies near the other
  pic.line('cp-thin', [0, 50], [100, 60], { name: 'across' });
  pic.line('cp-thin', [50, 0], [52, 100], { name: 'down' });
  expect(touches(pic, 'across', 'down', 0).ok).toBe(true);
});

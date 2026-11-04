// Bikes across both pages (spec sections 7.1 "Bikes", 7.4 and 11.4): the bag planner's own reader and drawing, run on its page's
// code, against the app's. The page is never printed: only values its functions return are compared.
import { createRequire } from 'node:module';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import sample from '../../../contracts/bike-library/sample.json';
import { bikeArt, normaliseBike, resolveBikeSpec } from '../../../src/core/bike/index.ts';
import { bikeLibrary } from '../../gen/index.ts';
import { drawingSet, tyreSet } from '../core/bike/drawing-set.ts';

const require = createRequire(import.meta.url);
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => { run: (code: string) => unknown } };
const page = appVM();
const pageReads = (raw: unknown): string => page.run(`JSON.stringify(normaliseBikeProfile(${JSON.stringify(raw)}))`) as string;
const appReads = (raw: unknown): string => JSON.stringify(normaliseBike(JSON.parse(JSON.stringify(raw))));

describe('the bike library read by both pages', () => {
  test('[C-BIKE-SAMPLE] the sample holds a bike with every field, one with none and one with invalid values, and both readers agree', () => {
    const [full, plain, odd] = sample as Record<string, unknown>[];
    expect(sample.length).toBe(3);
    // every field of section 7.1's table, set
    for (const key of ['fit', 'maxWeight', 'look', 'geometry', 'pressure']) expect(full![key], key).toBeTruthy();
    expect(normaliseBike(full)).toEqual(full);
    // none set: every block reads as not set
    expect(normaliseBike(plain)).toMatchObject({ fit: null, maxWeight: null, look: null, geometry: null, maxWeightAsked: false, name: 'My bike' });
    // invalid values: each drops only itself
    const oddRead = normaliseBike(odd)!;
    expect(oddRead.look).toEqual({ colour: null, bars: null, ebike: true });
    expect(oddRead.fit).toMatchObject({ style: 'unknown', size: null, triangleCm: null, seatGapCm: null, barWidthCm: 38, bolts: { st: 'unknown', dt: 'yes', un: 'unknown' } });
    expect(oddRead.maxWeight).toBeNull();
    expect(oddRead.brakes).toBe('unknown');
    expect(oddRead.rearTyre).toBe('47-584');
    expect(oddRead.geometry).toEqual({ at: null, maker: '', model: 'Long Road', year: null, size: '', wheel: null, values: { reach_mm: { v: 385, src: 'estimate' } } });
    expect(Object.keys(oddRead)).not.toContain('wings');
    for (const bike of sample) expect(pageReads(bike), String(bike.id)).toBe(appReads(bike));
  });

  test('[DF-02] on the sample and 200 generated libraries, the page\'s normaliseBikeProfile and the app\'s normaliseBike give identical output', () => {
    for (const bike of sample) expect(pageReads(bike)).toBe(appReads(bike));
    fc.assert(fc.property(bikeLibrary(), (library) => {
      const theirs = page.run(`JSON.stringify(${JSON.stringify(library)}.map(normaliseBikeProfile))`) as string;
      expect(theirs).toBe(JSON.stringify(library.map((b) => normaliseBike(JSON.parse(JSON.stringify(b))))));
    }), { numRuns: 200, seed: 6021 });
  });
});

describe('the drawing set drawn by both pages', () => {
  test('[C-DRAWING-SET] each entry drawn through bike.js in the page and through bikeArt here gives the same SVG string', () => {
    let n = 0;
    for (const entry of [...drawingSet(), ...tyreSet()]) {
      const mine = bikeArt(resolveBikeSpec(entry.bike, entry.bags), entry.bags, { theme: 'dark' }).svg;
      const theirs = page.run(`bikeDrawing(${JSON.stringify(entry.bike)}, ${JSON.stringify(entry.bags)}, { theme:'dark' }).svg`) as string;
      if (theirs !== mine) expect(theirs, entry.name).toBe(mine);
      n += 1;
    }
    expect(n).toBeGreaterThan(3000);
    // and the light theme, on the fullest entries
    for (const entry of tyreSet()) {
      const mine = bikeArt(resolveBikeSpec(entry.bike, entry.bags), entry.bags, { theme: 'light' }).svg;
      expect(page.run(`bikeDrawing(${JSON.stringify(entry.bike)}, ${JSON.stringify(entry.bags)}, { theme:'light' }).svg`), entry.name).toBe(mine);
    }
  }, 60_000);
});

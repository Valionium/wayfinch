import { describe, expect, test } from 'vitest';
import { tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import { parseBike, parseTyreSize } from '../../../../src/tools/tyre/host.ts';
import { tyreInput, wheelLoads } from './cases.ts';

const assumedSize = { printedMm: 32, caliperMm: null, assumed: true };
const load = { measured: wheelLoads(124, 0.45), tyreMax: { value: 7, unit: 'bar' as const } };

describe('re-check findings, in the calculation', () => {
  test('[TY-HOOKLESS] R1: a hookless or unset rim with an unset width shows no figure, and asks for it', () => {
    for (const rimType of ['unset', 'hookless'] as const) {
      const r = tyreEstimate(tyreInput({ ...load, rimType, front: assumedSize, rear: assumedSize }));
      expect(r.front).toBeNull();
      expect(r.needsWidth).toBe(true);
      expect(r.refused).toEqual([]);
    }
    const oneSide = tyreEstimate(tyreInput({ ...load, rimType: 'unset', front: { printedMm: 28, caliperMm: null }, rear: assumedSize }));
    expect(oneSide.front).toBeNull();
    expect(oneSide.needsWidth).toBe(true);
  });

  test('[TY-HOOKLESS] R1: a set width with an unset rim keeps the proper hookless row; a hooked rim may keep an assumed width', () => {
    const set = tyreEstimate(tyreInput({ ...load, rimType: 'unset', front: { printedMm: 45, caliperMm: null }, rear: { printedMm: 45, caliperMm: null }, measured: wheelLoads(200, 0.5) }));
    expect(set.front!.bar).toBe(3);
    expect(set.needsWidth).toBe(false);
    const hooked = tyreEstimate(tyreInput({ ...load, rimType: 'hooked', front: assumedSize, rear: assumedSize }));
    expect(hooked.front).not.toBeNull();
    expect(hooked.needsWidth).toBe(false);
  });

  test('[TY-WARN] R3: "fit a wider tyre" only where a real tyre width limits; not under the careful rule or a tube floor', () => {
    const careful = tyreEstimate(tyreInput({ rimType: 'unset', riderKg: 110, bikeKg: 14, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(124, 0.45) }));
    expect(careful.front!.bar).toBe(5);
    expect(careful.warnings.join(' ')).not.toContain('fit a wider tyre');
    expect(careful.warnings.join(' ')).toMatch(/rim type/i);
    const floor = tyreEstimate(tyreInput({
      setup: 'butyl', rimType: 'hookless', front: { printedMm: 80, caliperMm: null }, rear: { printedMm: 80, caliperMm: null }, tyreMax: { value: 6, unit: 'bar' }, measured: wheelLoads(100, 0.5),
    }));
    expect(floor.incompatible).toBe(true);
    expect(floor.warnings.join(' ')).not.toContain('fit a wider tyre');
    const real = tyreEstimate(tyreInput({ rimType: 'hooked', tyreMax: { value: 4, unit: 'bar' }, measured: wheelLoads(130, 0.4) }));
    expect(real.warnings.join(' ')).toContain('fit a wider tyre');
  });

  test('[TY-FLOOR] R4: a figure above the printed minimum is not called below it; the range starts at the minimum', () => {
    const r = tyreEstimate(tyreInput({ tyreMin: { value: 3.9, unit: 'bar' }, tyreMax: { value: 9, unit: 'bar' }, measured: wheelLoads(75, 0.5), front: { printedMm: 28, caliperMm: null }, rear: { printedMm: 28, caliperMm: null } }));
    const w = r.front!;
    expect(w.bar).toBeGreaterThan(3.9);
    expect(r.warningCodes).not.toContain('belowSidewallMin');
    expect(w.windowBar[0]).toBeGreaterThanOrEqual(3.9);
  });
});

describe('re-check findings, in reading the bike', () => {
  test('[TY-UI-FROM-BIKE] R2: more ways of writing a tyre size, and null whenever unsure', () => {
    const ok: [string, { widthMm: number; bsdMm: number }][] = [
      ['700c x 28', { widthMm: 28, bsdMm: 622 }], ['700C x 28mm', { widthMm: 28, bsdMm: 622 }], ['700x28mm', { widthMm: 28, bsdMm: 622 }],
      ['650c x 23', { widthMm: 23, bsdMm: 571 }], ['650b x 47c', { widthMm: 47, bsdMm: 584 }], ['GP5000 700x28c', { widthMm: 28, bsdMm: 622 }],
      ['40-622 (700 × 40C)', { widthMm: 40, bsdMm: 622 }], ['29 x 2.25', { widthMm: 57, bsdMm: 622 }],
    ];
    for (const [text, want] of ok) expect(parseTyreSize(text), text).toEqual(want);
    for (const text of ['28 x 1 1/2', '28 x 1 5/8 x 1 1/4', '26 x 1 3/8', 'Conti GP5000 28', '28c', '28 mm', '650 x 23', '']) expect(parseTyreSize(text), text).toBeNull();
  });

  test('[TY-UI-FROM-BIKE] R2: a tyre text that cannot be read is kept to be shown, and gives no width', () => {
    const b = parseBike({ id: 'b1', name: 'X', frontTyre: '28 x 1 1/2', rearTyre: '', pressure: {} })!;
    expect(b.frontMm).toBeUndefined();
    expect(b.unreadTyre).toBe('28 x 1 1/2');
  });
});

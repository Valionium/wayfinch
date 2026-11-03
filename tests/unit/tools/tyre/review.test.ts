import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { checkLimit, pumpLimit, tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import { parseTyreSize } from '../../../../src/tools/tyre/host.ts';
import { CASES, tyreInput, wheelLoads } from './cases.ts';

describe('review findings, in the calculation', () => {
  test('[TY-HOOKLESS] C2: an unset rim type counts as hookless for the limits, and says so', () => {
    const r = tyreEstimate(tyreInput({
      riderKg: 110, bikeKg: 14, rimType: 'unset', rimInnerMm: 21, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(124, 0.45),
    }));
    expect(r.front!.bar).toBeLessThanOrEqual(5);
    expect(r.rear!.bar).toBeLessThanOrEqual(5);
    expect(r.warningCodes).toContain('rimUnset');
    expect(r.warningCodes).not.toContain('hooklessTss');
    const hooked = tyreEstimate(tyreInput({ rimType: 'hooked', rimInnerMm: 21, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(124, 0.45) }));
    expect(hooked.rear!.bar).toBeGreaterThan(5);
  });

  test('[TY-HOOKLESS] C2: with the tyre width not set too, the lowest hookless cap (1.5 bar) applies', () => {
    const r = tyreEstimate(tyreInput({
      rimType: 'unset', front: { printedMm: 45, caliperMm: null, assumed: true }, rear: { printedMm: 45, caliperMm: null, assumed: true },
      tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(200, 0.5),
    }));
    expect(r.front!.bar).toBeLessThanOrEqual(1.5);
    expect(r.warningCodes).toContain('widthUnset');
    const stated = tyreEstimate(tyreInput({ rimType: 'hookless', front: { printedMm: 45, caliperMm: null }, rear: { printedMm: 45, caliperMm: null }, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(200, 0.5) }));
    expect(stated.front!.bar).toBe(3);
    const hookedUnknownWidth = tyreEstimate(tyreInput({ rimType: 'hooked', front: { printedMm: 45, caliperMm: null, assumed: true }, rear: { printedMm: 45, caliperMm: null, assumed: true }, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(200, 0.5) }));
    expect(hookedUnknownWidth.front!.bar).toBeGreaterThan(1.5);
  });

  test('[TY-WARN] C2: when an unset rim or width leaves no figure possible, the words ask for the rim type and width', () => {
    const r = tyreEstimate(tyreInput({ rimType: 'unset', setup: 'butyl', tyreMin: { value: 6, unit: 'bar' }, tyreMax: { value: 7, unit: 'bar' }, measured: wheelLoads(100, 0.5) }));
    expect(r.incompatible).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/rim type/i);
    expect(r.warnings.join(' ')).not.toContain('fit a wider tyre');
  });

  test('[TY-WARN] M3: the incompatible words do not promise a figure, and no pressure number is shown for it (I4)', () => {
    const r = tyreEstimate(tyreInput({
      setup: 'butyl', rimType: 'hookless', front: { printedMm: 80, caliperMm: null }, rear: { printedMm: 80, caliperMm: null }, tyreMax: { value: 6, unit: 'bar' }, measured: wheelLoads(100, 0.5),
    }));
    expect(r.incompatible).toBe(true);
    expect(r.warnings.join(' ')).not.toMatch(/rounded down/);
    expect(r.warnings.join(' ')).toMatch(/tubeless/i);
    expect(`${r.warnings.join(' ')} ${r.decided.join(' ')}`).not.toMatch(/\d\s*(bar|psi)/);
  });

  test('[TY-WARN] I4: what decided a number never prints the figure before the limit', () => {
    const r = tyreEstimate(CASES.find((c) => c.id === 'TC18')!.input);
    expect(r.decided.join(' ')).not.toMatch(/bar/);
  });

  test('[TY-PSI-QUERY] M2: a small number in psi asks whether bar was meant', () => {
    const c = checkLimit(5, 'psi', {});
    expect(c.status).toBe('ask');
    if (c.status === 'ask') { expect(c.question).toBe('Did you mean 5 bar?'); expect(c.alt).toEqual({ value: 5, unit: 'bar' }); }
    expect(checkLimit(5, 'psi', { keepAsPsi: true }).status).toBe('ok');
    expect(checkLimit(40, 'psi', {}).status).toBe('ok');
  });

  test('[TY-PSI-QUERY] M5: a rim maximum below the tyre minimum is refused', () => {
    const r = tyreEstimate(tyreInput({ tyreMin: { value: 4, unit: 'bar' }, tyreMax: { value: 6, unit: 'bar' }, rimMax: { value: 3, unit: 'bar' } }));
    expect(r.front).toBeNull();
  });

  test('[TY-HEAT] I8: the psi figure is checked against the heat limit too', () => {
    // 4.63 bar shows 4.60 bar and 67 psi; P1_max 4.6097 bar is 66.86 psi, so 67 psi must be advised down.
    const r = tyreEstimate(tyreInput({
      rimType: 'hookless', tyreMax: { value: 5, unit: 'bar' }, measured: { frontKg: 41.98, rearKg: 41.98 }, heat: { pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 0 },
    }));
    expect(r.front!.psi).toBe(67);
    expect(pumpLimit({ capBar: 5, pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 0 }).p1MaxBar * 14.5037738).toBeLessThan(67);
    expect(r.front!.heat!.advise).toBe(true);
    expect(r.front!.heat!.pumpToPsi).toBeLessThanOrEqual(66);
  });

  test('[TY-HEAT] I4: no heat advice with its pressure numbers on an incompatible setup', () => {
    const r = tyreEstimate(tyreInput({
      rimType: 'hookless', setup: 'butyl', front: { printedMm: 80, caliperMm: null }, rear: { printedMm: 80, caliperMm: null }, tyreMax: { value: 6, unit: 'bar' },
      measured: wheelLoads(100, 0.5), heat: { pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 2000 },
    }));
    expect(r.incompatible).toBe(true);
    expect(r.warningCodes).not.toContain('heatPump');
  });

  test('[TY-WARN] M10: a tubular rim says the width check does not apply', () => {
    const r = tyreEstimate(tyreInput({ rimType: 'tubular' }));
    expect(r.warningCodes).toContain('tubularNoCheck');
  });

  fcTest.prop([fc.double({ min: 0.5, max: 1.5, noNaN: true }), fc.integer({ min: 8, max: 30 })])(
    '[TY-FLOOR] M4: a tubeless figure below the printed minimum, as shown, is warned about', (bar, minPsi) => {
      const r = tyreEstimate(tyreInput({
        tyreMin: { value: minPsi, unit: 'psi' }, tyreMax: { value: 9, unit: 'bar' }, measured: wheelLoads(bar * 30, 0.5), front: { printedMm: 50, caliperMm: null }, rear: { printedMm: 50, caliperMm: null }, surface: 'unpaved', rimInnerMm: 25,
      }));
      if (r.refused.length) return;
      const below = [r.front!, r.rear!].some((w) => w.psi < minPsi || w.windowBar[0] * 14.5037738 < minPsi);
      if (below) expect(r.warningCodes).toContain('belowSidewallMin');
    });
});

describe('review findings, in reading Load Check', () => {
  test('[TY-UI-FROM-BIKE] M6: tyre sizes as people write them', () => {
    expect(parseTyreSize('700x40c')).toEqual({ widthMm: 40, bsdMm: 622 });
    expect(parseTyreSize('700 x 28C')).toEqual({ widthMm: 28, bsdMm: 622 });
    expect(parseTyreSize('40-622')).toEqual({ widthMm: 40, bsdMm: 622 });
    expect(parseTyreSize('2.25-622')).toBeNull();
    expect(parseTyreSize('29 x 2.2')).toEqual({ widthMm: 56, bsdMm: 622 });
  });
});

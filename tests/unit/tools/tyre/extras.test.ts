import { describe, expect, test } from 'vitest';
import { altitudeShiftBar, heatedGaugeBar, pumpLimit, tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import { sramList } from '../../../../src/tools/tyre/sram.ts';
import { resolve } from '../../../../src/tools/tyre/model.ts';
import { tyreInput, wheelLoads } from './cases.ts';

/** 28 mm on a 19 mm rim, 700C, tubeless, a hookless 5.00 bar cap, and a load that asks for about 4.80 bar. */
const hot = (highestM: number) => tyreInput({
  rimType: 'hookless', rimInnerMm: 19, tyreMax: { value: 5, unit: 'bar' }, measured: { frontKg: 43.5, rearKg: 43.5 },
  heat: { pumpC: 15, maxC: 35, pumpHeightM: 0, highestM },
});

describe('heat and altitude', () => {
  test('[TY-HEAT] P1_max is 4.6097 bar at sea level and 4.4056 bar with a 2,000 m pass, advised rounded down to 4.60 and 4.40', () => {
    const sea = pumpLimit({ capBar: 5, pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 0 });
    expect(sea.p1MaxBar).toBeCloseTo(4.6097, 4);
    const pass = pumpLimit({ capBar: 5, pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 2000 });
    expect(pass.p1MaxBar).toBeCloseTo(4.4056, 4);
    const low = tyreEstimate(hot(0));
    expect(low.front!.estimate).toBeGreaterThan(4.7);
    expect(low.front!.heat!.advise).toBe(true);
    expect(low.front!.heat!.pumpToBar).toBe(4.6);
    expect(low.front!.heat!.pumpToBar).toBeLessThanOrEqual(4.6097);
    const high = tyreEstimate(hot(2000));
    expect(high.front!.heat!.pumpToBar).toBe(4.4);
    expect(high.warnings.join(' ')).toMatch(/Pump to at most 4\.40 bar/);
  });

  test('[TY-HEAT] the physics: 4.0 bar from 15 to 25 °C reads 4.17, and climbing from sea level to 2,000 m adds 0.22', () => {
    expect(heatedGaugeBar({ gaugeBar: 4, fromC: 15, toC: 25, atmFromBar: 1.01325, atmToBar: 1.01325 })).toBeCloseTo(4.17, 2);
    expect(altitudeShiftBar(0, 2000)).toBeCloseTo(0.22, 2);
  });

  test('[TY-HEAT] no advice when the suggestion already fits; a cool day or a low pass changes nothing; no inputs, no check', () => {
    const cool = tyreEstimate({ ...hot(0), heat: { pumpC: 15, maxC: 16, pumpHeightM: 0, highestM: 0 } });
    expect(cool.front!.heat!.advise).toBe(false);
    expect(cool.warningCodes).not.toContain('heatPump');
    const none = tyreEstimate({ ...hot(0), heat: null });
    expect(none.front!.heat).toBeNull();
    const absent = tyreEstimate(tyreInput());
    expect(absent.front!.heat).toBeNull();
  });

  test('[TY-HEAT] the advice never goes above the cap and, if the hot-day limit falls below a tube floor, says so', () => {
    const r = tyreEstimate({
      ...hot(0), setup: 'butyl', tyreMin: { value: 4.9, unit: 'bar' }, heat: { pumpC: 5, maxC: 40, pumpHeightM: 0, highestM: 3000 },
    });
    expect(r.front!.heat!.pumpToBar).toBeLessThanOrEqual(5);
    expect(r.warningCodes).toContain('heatBelowFloor');
  });

  test('[TY-HEAT] impossible temperatures or heights are refused in words, not computed', () => {
    for (const heat of [{ pumpC: -80, maxC: 35, pumpHeightM: 0, highestM: 0 }, { pumpC: 15, maxC: 90, pumpHeightM: 0, highestM: 0 }, { pumpC: 15, maxC: 35, pumpHeightM: 0, highestM: 20000 }, { pumpC: Number.NaN, maxC: 35, pumpHeightM: 0, highestM: 0 }]) {
      const r = tyreEstimate({ ...hot(0), heat });
      expect(r.front).toBeNull();
      expect(r.refused.join(' ')).toMatch(/temperature|height/i);
    }
  });
});

describe('measured loads and calipered widths', () => {
  test('[TY-MEASURED] measured wheel loads replace the split, even when a bag plan could give one', () => {
    const planned = { riderKg: 70, bikeKg: 14, load: { byPositionKg: { rack: 8, fork: 2 }, unplacedKg: 0, emptyLuggageKg: null } };
    const lever = tyreEstimate(tyreInput(planned));
    const weighed = tyreEstimate(tyreInput({ ...planned, measured: { frontKg: 30, rearKg: 64 } }));
    expect(lever.split!.source).toBe('lever');
    expect(weighed.split!.source).toBe('measured');
    expect(weighed.front!.loadKg).toBe(30);
    expect(weighed.rear!.loadKg).toBe(64);
  });

  test('[TY-MEASURED] a calipered width replaces the effective width in steps 3 and 4 only: the hookless table and the ETRTO check still read the printed width', () => {
    const base = tyreInput({ measured: wheelLoads(100, 0.5), rimInnerMm: 19, front: { printedMm: 28, caliperMm: null }, rear: { printedMm: 28, caliperMm: null } });
    const calipered = tyreEstimate({ ...base, front: { printedMm: 28, caliperMm: 31 }, rear: { printedMm: 28, caliperMm: 31 } });
    const plain = tyreEstimate(base);
    expect(calipered.front!.wEffMm).toBe(31);
    expect(plain.front!.wEffMm).toBe(28);
    expect(calipered.front!.estimate).toBeLessThan(plain.front!.estimate);
    // Printed 28 mm on a 25 mm hookless rim: below the ETRTO minimum (29 mm) whatever the caliper says.
    const hookless = tyreEstimate({ ...base, rimType: 'hookless', rimInnerMm: 25, front: { printedMm: 28, caliperMm: 40 }, rear: { printedMm: 28, caliperMm: 40 }, tyreMax: { value: 6, unit: 'bar' } });
    expect(hookless.warningCodes).toContain('belowEtrto');
    expect(hookless.front!.bar).toBeLessThanOrEqual(5);
  });
});

describe('the cross-check with SRAM', () => {
  test('[TY-SRAM] exactly what to type there, from the screen\'s own values, and nothing else', () => {
    const r = resolve(
      { tyreMax: { value: 5, unit: 'bar' }, riderKg: 82, bikeKg: 14, carriedKg: 10, surface: 'unpaved', wet: true, casing: 'supple', rimType: 'hookless', rimInnerMm: 25, frontMm: 42, rearMm: 45, wheelBsdMm: 584 },
      { riderKg: null, summary: null, bike: null },
    );
    const list = sramList(r.values);
    expect(list.map((l) => l.label)).toEqual([
      'Rider weight', 'Bike and gear weight', 'Tyre width', 'Casing', 'Wheel size', 'Rim type', 'Inner rim width', 'Ride type', 'Wet or dry',
    ]);
    const by = Object.fromEntries(list.map((l) => [l.label, l.value]));
    expect(by['Rider weight']).toBe('82 kg');
    expect(by['Bike and gear weight']).toBe('24 kg');
    expect(by['Tyre width']).toBe('42 mm front, 45 mm rear');
    expect(by.Casing).toBe('Thin');
    expect(by['Wheel size']).toBe('650B / 27.5 inch');
    expect(by['Rim type']).toBe('Hookless');
    expect(by['Inner rim width']).toBe('25 mm');
    expect(by['Wet or dry']).toBe('Wet');
  });
});

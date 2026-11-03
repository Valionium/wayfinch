import { describe, expect, test } from 'vitest';
import { tyreEstimate } from '../../../../src/tools/tyre/core.ts';
import { parseBike, parseTyreSize } from '../../../../src/tools/tyre/host.ts';
import { resolve } from '../../../../src/tools/tyre/model.ts';
import { tyreInput, wheelLoads } from './cases.ts';

describe('final re-check findings', () => {
  test('[TY-UI-FROM-BIKE] F1: an unread rear tyre never becomes the front\'s width; it is unset, so a hookless rim gets no figure', () => {
    const b = parseBike({ id: 'b1', name: 'X', frontTyre: '28-622', rearTyre: '45 mm', pressure: { rim: 'hookless', rimMm: 21 } })!;
    expect(b.frontMm).toBe(28);
    expect(b.rearMm).toBeUndefined();
    expect(b.unreadRear).toBe('45 mm');
    const r = resolve({ tyreMax: { value: 7, unit: 'bar' } }, { riderKg: null, summary: null, bike: b });
    expect(r.sources.rearMm).toBe('assumed');
    expect(r.values.rear.assumed).toBe(true);
    expect(r.rearFollowsFront).toBe(false);
    expect(tyreEstimate(r.input!).needsWidth).toBe(true);
  });

  test('[TY-UI-FROM-BIKE] F2: fractions of any kind read as unsure, and only recognised forms read at all', () => {
    for (const text of ['28 x 1½', '26 x 1⅜', '28 x 1¼', '27 x 1⅛', '28 x 1 1/2', '700x28x', '29 x 2.25 x 3']) expect(parseTyreSize(text), text).toBeNull();
    for (const text of ['29 x 2.25', '28-622', '700x28c', 'GP5000 700x28c', '700c x 28mm']) expect(parseTyreSize(text), text).not.toBeNull();
  });

  test('[TY-WARN] F3: "fit a wider tyre" fires when a tyre or rim maximum binds, also with the rim unset, and the hookless line never covers it', () => {
    const tyreMax = tyreInput({ rimType: 'unset', tyreMax: { value: 3, unit: 'bar' }, measured: wheelLoads(130, 0.4) });
    const a = tyreEstimate(tyreMax);
    expect(a.front!.bar).toBe(3);
    expect(a.warnings.join(' ')).toContain('fit a wider tyre');
    expect(a.warnings.join(' ')).not.toContain('applies to hookless rims');
    const rim = tyreEstimate(tyreInput({ rimType: 'unset', tyreMax: { value: 9, unit: 'bar' }, rimMax: { value: 3, unit: 'bar' }, measured: wheelLoads(130, 0.4) }));
    expect(rim.warnings.join(' ')).toContain('fit a wider tyre');
    // Only the hookless limit binds, with the rim unset: the careful line, not the wider-tyre one.
    const hook = tyreEstimate(tyreInput({ rimType: 'unset', tyreMax: { value: 9, unit: 'bar' }, measured: wheelLoads(124, 0.45) }));
    expect(hook.warnings.join(' ')).toContain('applies to hookless rims');
    expect(hook.warnings.join(' ')).not.toContain('fit a wider tyre');
  });
});

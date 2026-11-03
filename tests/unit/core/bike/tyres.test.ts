import { describe, expect, test } from 'vitest';
import { parseTyre } from '../../../../src/core/bike/tyres.ts';
import { parseTyreSize } from '../../../../src/tools/tyre/host.ts';

const close = (text: string, rimMm: number, widthMm: number) => {
  const got = parseTyre(text);
  expect(got, text).not.toBeNull();
  expect(got!.rimMm, text).toBe(rimMm);
  expect(Math.abs(got!.widthMm - widthMm), text).toBeLessThan(0.01);
};

describe('tyre sizes as the rider typed them (spec section 7.4)', () => {
  test('[BK-TYRES] ETRTO, French and inch sizes give the rim diameter and the tyre width, unrounded', () => {
    close('40-622', 622, 40);
    close('700 × 40C', 622, 40);
    close('700x40c', 622, 40);
    close('650B × 47', 584, 47);
    close('650C × 23', 571, 23);
    close('29 × 2.2', 622, 55.88);
    close('27.5 × 2.4', 584, 60.96);
    close('26 × 1.75', 559, 44.45);
  });

  test('[BK-TYRES] anything else counts as not entered', () => {
    for (const text of ['fast tyres', '700', '', '   ', '28c', '28 mm', '650 x 23', 'Conti GP5000 28']) expect(parseTyre(text), text).toBeNull();
    for (const value of [null, undefined, 40, {}, ['40-622']]) expect(parseTyre(value)).toBeNull();
  });

  test('[BK-TYRES] unsure is null, never a guess: fractions of an inch, Unicode fractions, a third number', () => {
    for (const text of ['28 x 1 1/2', '28 x 1 5/8 x 1 1/4', '26 x 1 3/8', '28 x 1½', '26 x 1⅜', '27 x 1⅛', '700x28x', '29 x 2.25 x 3', '2.25-622']) {
      expect(parseTyre(text), text).toBeNull();
    }
  });

  test('[BK-TYRES] wide tyres read for the drawing: a fat bike and a plus tyre', () => {
    close('26 x 4.0', 559, 101.6);
    close('27.5 x 2.8', 584, 71.12);
    close('100-559', 559, 100);
  });

  test('[BK-TYRES] the tyre tool reads the same sizes, rounded to whole millimetres and within its 18 to 83 mm', () => {
    for (const text of ['40-622', '700 × 40C', '700x40c', '650B × 47', '650C × 23', '29 × 2.2', '27.5 × 2.4', '26 × 1.75', '700c x 28', 'GP5000 700x28c', '29 x 2.25']) {
      const mine = parseTyre(text)!;
      expect(parseTyreSize(text), text).toEqual({ widthMm: Math.round(mine.widthMm), bsdMm: mine.rimMm });
    }
    for (const text of ['26 x 4.0', '100-559', 'fast tyres', '28 x 1½']) expect(parseTyreSize(text), text).toBeNull();
  });
});

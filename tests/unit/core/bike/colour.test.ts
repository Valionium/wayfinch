import { describe, expect, test } from 'vitest';
import { SWATCHES, hexToOklab, nearestSwatchName, oklabMedian, oklabToHex } from '../../../../src/core/bike/colour.ts';

// Section 3.6's tokens: the page, the cards and the casing (muted), in both themes.
const THEMES = {
  dark: { ground: '#1B2018', panel: '#242B20', muted: '#A8B198' },
  light: { ground: '#F4F2E8', panel: '#FBFAF3', muted: '#57604A' },
} as const;

const luminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const distance = (a: string, b: string): number => {
  const [p, q] = [hexToOklab(a), hexToOklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

describe('the 16 swatches (spec section 7.4)', () => {
  test('[BK-SWATCHES] 16 swatches with the spec hex values and names, in its order', () => {
    expect(SWATCHES.map((s) => `${s.name} ${s.hex}`)).toEqual([
      'Black #1d1d1f', 'Graphite #4b4f54', 'Silver #b9bdc1', 'White #f4f4f2', 'Sand #cbb68e', 'Brown #7b5434', 'Red #c62f2a', 'Orange #e46b1f',
      'Yellow #f1c232', 'Olive #6d7a37', 'Green #2f7d4f', 'Teal #1f7f80', 'Blue #2563b8', 'Navy #1f2f55', 'Purple #6b3fa0', 'Pink #d6619b',
    ]);
  });

  test('[BK-SWATCHES] each swatch is named as its own nearest swatch, and a colour near one takes its name', () => {
    for (const s of SWATCHES) expect(nearestSwatchName(s.hex)).toBe(s.name);
    expect(nearestSwatchName('#2e7c50')).toBe('Green');
    expect(nearestSwatchName('#FF0000')).toBe('Red');
    expect(nearestSwatchName('not a colour')).toBeNull();
  });

  test('[BK-SWATCHES] with the casing, every swatch shows on the page and on a card in both themes, and stays told apart from its casing', () => {
    for (const [theme, t] of Object.entries(THEMES)) {
      for (const s of SWATCHES) {
        for (const surface of [t.ground, t.panel]) {
          // The frame's edge: the casing, or the colour itself where it is the stronger, stands out at 3:1 (non-text contrast).
          expect(Math.max(contrast(t.muted, surface), contrast(s.hex, surface)), `${s.name} ${theme}`).toBeGreaterThanOrEqual(3);
          // A colour that alone would sink into the page (a black frame in the dark theme, a white one in the light) has the casing to show it.
          if (contrast(s.hex, surface) < 1.5) expect(contrast(s.hex, t.muted), `${s.name} ${theme}`).toBeGreaterThanOrEqual(3);
        }
        // The colour reads as its own colour, never as the casing: at least twice the just noticeable difference in OKLab (about 0.02).
        // The closest today is Sand in the dark theme, at 0.054.
        expect(distance(s.hex, t.muted), `${s.name} ${theme}`).toBeGreaterThanOrEqual(0.05);
      }
    }
  });
});

describe('colour from a photo (spec section 7.4)', () => {
  test('[BK-SWATCHES] sRGB to OKLab and back stays within 1/255 on every channel', () => {
    for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 51) {
      const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const back = oklabToHex(hexToOklab(hex));
      for (const i of [1, 3, 5]) expect(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)), hex).toBeLessThanOrEqual(1);
    }
  });

  test('[BK-SWATCHES] the trimmed median of a patch with gloss, shadow and a cable returns the frame colour within 0.02 in OKLab', () => {
    const frame = [47, 125, 79];
    const patch: number[] = [];
    for (let i = 0; i < 225; i += 1) {
      // 15 x 15: a gloss streak, a shadow edge and a black cable across the frame, and a little noise on the rest.
      const px = i % 15;
      const py = Math.floor(i / 15);
      const n = ((i * 37) % 7) - 3;
      const rgb = py < 2 ? [240, 245, 240] : py > 12 ? [12, 20, 14] : px === 7 ? [20, 20, 20] : frame.map((v) => v + n);
      patch.push(rgb[0]!, rgb[1]!, rgb[2]!, 255);
    }
    expect(distance(oklabMedian(patch)!, '#2f7d4f')).toBeLessThan(0.02);
    expect(oklabMedian([])).toBeNull();
  });
});

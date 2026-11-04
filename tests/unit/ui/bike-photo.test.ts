// Colour from a photo (spec section 7.4): the colour a tap gives, worked out on the photo's pixels alone.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { hexToOklab, oklabMedian } from '../../../src/core/bike/colour.ts';
import { colourAt, fitSize, PATCH, patchAt } from '../../../src/ui/bike-photo/picker.ts';

const deltaE = (a: string, b: string): number => {
  const [p, q] = [hexToOklab(a), hexToOklab(b)];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** A photo, w x h, painted pixel by pixel. */
function photo(w: number, h: number, paint: (x: number, y: number) => string): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const [r, g, b] = rgb(paint(x, y));
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return data;
}

describe('the colour a tap gives', () => {
  test('[LC-PHOTO-MEDIAN] 15 x 15 pixels with a white highlight and a black cable: the lightest and darkest 20% go, the median is the frame within delta E 2', () => {
    const frame = '#2f7d4f';
    // 225 pixels: a 3-pixel white gloss stripe (45) and a 3-pixel black cable (45), each exactly a fifth; the rest the paint,
    // with a little grain either side of it
    const data = photo(PATCH, PATCH, (x, y) => (y < 3 ? '#ffffff' : y >= 12 ? '#000000' : (x + y) % 2 ? '#307e50' : '#2e7c4e'));
    const hex = oklabMedian(data)!;
    expect(deltaE(hex, frame)).toBeLessThanOrEqual(2);
    // a plain average would be pulled far off by the highlight and the cable
    const mean = [0, 1, 2].map((c) => Math.round(Array.from({ length: 225 }, (_, i) => data[i * 4 + c]!).reduce((s, v) => s + v, 0) / 225));
    const meanHex = `#${mean.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    expect(deltaE(meanHex, frame)).toBeGreaterThan(2);
  });

  test('[LC-PHOTO-MEDIAN] the photo\'s overall colour is never used: a red frame on a lawn reads red where it is tapped', () => {
    const [w, h] = [200, 120];
    const lawn = photo(w, h, (x, y) => (x >= 90 && x < 120 && y >= 40 && y < 70 ? '#c62f2a' : '#4f8a2b'));
    expect(deltaE(colourAt(lawn, w, h, 105, 55)!, '#c62f2a')).toBeLessThanOrEqual(2);
    expect(deltaE(colourAt(lawn, w, h, 20, 20)!, '#4f8a2b')).toBeLessThanOrEqual(2);
    // a tap at the edge reads the 15 x 15 inside the photo
    expect(patchAt(lawn, w, h, 0, 0).length).toBe(PATCH * PATCH * 4);
    expect(patchAt(lawn, w, h, w - 1, h - 1).length).toBe(PATCH * PATCH * 4);
  });

  test('[LC-PHOTO-MEDIAN] the photo is drawn at most 640 px on its long side, never enlarged', () => {
    expect(fitSize(4032, 3024)).toEqual({ w: 640, h: 480 });
    expect(fitSize(3024, 4032)).toEqual({ w: 480, h: 640 });
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
  });

  test('[LC-PHOTO-MEDIAN] EXIF is never read: the picker never touches the file\'s bytes; the browser decodes the photo', () => {
    const source = readFileSync(new URL('../../../src/ui/bike-photo/picker.ts', import.meta.url), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const banned of [/exif/i, /FileReader/, /arrayBuffer\s*\(/, /\.text\s*\(/, /readAs\w+/, /DataView/, /\.slice\s*\(\s*0\s*,/, /fetch\s*\(/, /XMLHttpRequest/, /localStorage|indexedDB|caches\./]) {
      expect(banned.test(code), String(banned)).toBe(false);
    }
    expect(code).toContain('URL.createObjectURL');
    expect(code).toContain('URL.revokeObjectURL');
    expect(source).not.toMatch(/capture=/);
  });
});

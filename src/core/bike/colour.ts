// The rider's colour (spec section 7.4): the 16 swatches, OKLab, the nearest swatch's name, and the trimmed median a photo tap gives.
// OKLab is Björn Ottosson's (2020), with its published matrices.

export type Swatch = { name: string; hex: string };

/** Starting values, tuned for contrast with the casing; they change only with the owner. */
export const SWATCHES: readonly Swatch[] = [
  { name: 'Black', hex: '#1d1d1f' }, { name: 'Graphite', hex: '#4b4f54' }, { name: 'Silver', hex: '#b9bdc1' }, { name: 'White', hex: '#f4f4f2' },
  { name: 'Sand', hex: '#cbb68e' }, { name: 'Brown', hex: '#7b5434' }, { name: 'Red', hex: '#c62f2a' }, { name: 'Orange', hex: '#e46b1f' },
  { name: 'Yellow', hex: '#f1c232' }, { name: 'Olive', hex: '#6d7a37' }, { name: 'Green', hex: '#2f7d4f' }, { name: 'Teal', hex: '#1f7f80' },
  { name: 'Blue', hex: '#2563b8' }, { name: 'Navy', hex: '#1f2f55' }, { name: 'Purple', hex: '#6b3fa0' }, { name: 'Pink', hex: '#d6619b' },
];

export type Oklab = [number, number, number];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (x: unknown): x is string => typeof x === 'string' && HEX.test(x);

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** 0–255 sRGB to OKLab. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function hexToOklab(hex: string): Oklab {
  return rgbToOklab(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
}

/** OKLab to "#rrggbb", lower case, clipped to sRGB. */
export function oklabToHex([L, a, b]: Oklab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const SWATCH_LAB = SWATCHES.map((s) => ({ name: s.name, lab: hexToOklab(s.hex) }));

/** The name of the swatch nearest to a colour in OKLab; null for anything that is not "#rrggbb". */
const NAMES = new Map<string, string>();
export function nearestSwatchName(hex: unknown): string | null {
  if (!isHex(hex)) return null;
  const known = NAMES.get(hex);
  if (known) return known;
  const lab = hexToOklab(hex);
  let best = SWATCH_LAB[0]!;
  let bestD = Infinity;
  for (const s of SWATCH_LAB) {
    const d = (s.lab[0] - lab[0]) ** 2 + (s.lab[1] - lab[1]) ** 2 + (s.lab[2] - lab[2]) ** 2;
    if (d < bestD) { best = s; bestD = d; }
  }
  NAMES.set(hex, best.name);
  return best.name;
}

/**
 * The colour of a photo tap: RGBA pixels (a canvas's ImageData), converted to OKLab, the lightest and darkest 20% dropped (gloss,
 * shadow, cables), and the median of the rest on each axis, as "#rrggbb". Null with no pixels.
 */
export function oklabMedian(pixels: ArrayLike<number>): string | null {
  const labs: Oklab[] = [];
  for (let i = 0; i + 2 < pixels.length; i += 4) labs.push(rgbToOklab(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!));
  if (labs.length === 0) return null;
  labs.sort((p, q) => p[0] - q[0]);
  const cut = Math.floor(labs.length * 0.2);
  const kept = labs.length - 2 * cut > 0 ? labs.slice(cut, labs.length - cut) : labs;
  const median = (axis: 0 | 1 | 2): number => {
    const v = kept.map((p) => p[axis]).sort((x, y) => x - y);
    const mid = v.length >> 1;
    return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
  };
  return oklabToHex([median(0), median(1), median(2)]);
}

// ---- the casing (owner's ruling A, 3 November 2026) ----

/** The tones a casing can take in each theme, as theme.css has them: muted first, then the theme's own ink, panel or ground. */
export const CASINGS = {
  light: { muted: '#57604A', ink: '#22271D', panel: '#FBFAF3' },
  dark: { muted: '#A8B198', ink: '#EFEDE0', ground: '#1B2018' },
} as const;
export type CasingTone = 'muted' | 'ink' | 'panel' | 'ground';

const relLuminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

/** WCAG's contrast ratio of two "#rrggbb" colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relLuminance(a), relLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Non-text contrast (WCAG 1.4.11): the frame must stand out from its casing at least this much. */
export const CASING_MIN_CONTRAST = 3;

/**
 * The casing under the rider's colour. The swatches never change (they are the spec's); the casing does: muted where the paint
 * stands out from it at 3:1, else the theme's tone the paint stands out from most. Brown in the light theme, Silver and Sand in
 * the dark were the owner's three; every colour, a picked or photo one too, is held to the same 3:1.
 */
export function casingFor(paint: string, theme: 'dark' | 'light'): CasingTone {
  if (!isHex(paint)) return 'muted';
  const tones = CASINGS[theme] as Record<string, string>;
  if (contrastRatio(paint, tones['muted']!) >= CASING_MIN_CONTRAST) return 'muted';
  let best: CasingTone = 'muted';
  let bestRatio = 0;
  for (const [tone, hex] of Object.entries(tones)) {
    const r = contrastRatio(paint, hex);
    if (r > bestRatio) { best = tone as CasingTone; bestRatio = r; }
  }
  return best;
}

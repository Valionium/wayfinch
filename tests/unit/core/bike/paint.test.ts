import { describe, expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import { CASINGS, contrastRatio, SWATCHES } from '../../../../src/core/bike/colour.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { Paint } from '../../../../src/core/bike/normalise.ts';
import { casingForAll, FADES, paintedArt, PATTERN_LIST } from '../../../../src/core/bike/paint.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { BAG_SETS, drawingSet, setBike } from './drawing-set.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test data, written by hand
type Json = any;
const bikeWith = (paint: Json, colour: string | null = '#2563b8', fields: Json = {}) =>
  normaliseBike({ id: 'p', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', paint }, ...fields })!;
const draw = (paint: Json, colour: string | null = '#2563b8', theme: 'dark' | 'light' = 'dark', prefix = 'bk') => {
  const bike = bikeWith(paint, colour);
  return paintedArt(resolveBikeSpec(bike, null), null, { theme, idPrefix: prefix }, bike.look?.paint ?? null);
};
const plain = (colour: string | null = '#2563b8', theme: 'dark' | 'light' = 'dark') => bikeArt(resolveBikeSpec(bikeWith(undefined, colour), null), null, { theme });
const strokes = (svg: string) => [...svg.matchAll(/<path class="bk-paint (bk-\w+)"[^>]*?stroke="([^"]+)"/g)].map((m) => [m[1], m[2]]);
const ids = (svg: string) => new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
const refs = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);

describe('the look extras keep every old bike exactly as it was', () => {
  test('[BK-PAINT-SAME] without extras, with broken extras and with nothing usable, the drawing is bikeArt\'s byte for byte, every drawing-set bike', () => {
    for (const e of drawingSet()) {
      const spec = resolveBikeSpec(e.bike, e.bags);
      const want = bikeArt(spec, e.bags, { theme: 'light', idPrefix: 'x' });
      expect(paintedArt(spec, e.bags, { theme: 'light', idPrefix: 'x' }, null), e.name).toEqual(want);
    }
    for (const broken of [null, 'fade', 7, [], { pattern: 'tartan' }, { pattern: 'solid', colours: ['red'] }, { fork: { kind: 'own', colour: 'red' } },
      { fork: { kind: 'fade', pair: 6 } }, { fork: { kind: 'pattern', pattern: 'panel', pair: 0 } }, { rimMm: 14 }, { rimMm: 61 }, { rimMm: 40.5 }]) {
      const bike = bikeWith(broken);
      expect(bike.look!.paint, JSON.stringify(broken)).toBeUndefined();
      expect(draw(broken).svg, JSON.stringify(broken)).toBe(plain().svg);
    }
  }, 60_000);

  test('[BK-PAINT-SAME] with no frame colour a pattern or fork has nothing to paint: the frame stays the outline; rims still apply', () => {
    expect(draw({ pattern: 'marble', fork: { kind: 'own', colour: '#c62f2a' } }, null).svg).toBe(plain(null).svg);
    expect(draw({ pattern: 'marble', rimMm: 30 }, null).svg).toContain('bk-rimband');
  });
});

describe('frame patterns (owner\'s wish of 5 November 2026)', () => {
  test('[BK-PAINT-PATTERNS] each of the 14 patterns is deterministic, differs from one colour, and every paint it uses is defined in the drawing', () => {
    expect(PATTERN_LIST.map((p) => p.value)).toEqual(['solid', 'fade-h', 'fade-v', 'split', 'blocks', 'shift', 'marble', 'stripes', 'speckle', 'camo', 'panel', 'sparkle', 'chrome', 'carbon']);
    const seen = new Set<string>();
    for (const p of PATTERN_LIST) {
      const paint = { pattern: p.value, colours: ['#6b3fa0', '#1f7f80'] };
      const a = draw(paint);
      expect(draw(paint).svg, p.value).toBe(a.svg);                               // same bike, same drawing
      if (p.value === 'solid') { expect(a.svg).toBe(plain().svg); continue; }
      expect(a.svg, p.value).not.toBe(plain().svg);
      expect(seen.has(a.svg), p.value).toBe(false);
      seen.add(a.svg);
      const defined = ids(a.svg);
      for (const r of refs(a.svg)) expect(defined.has(r), `${p.value}: #${r}`).toBe(true);
      // well formed: one defs, closed
      expect(a.svg.match(/<defs>/g)?.length ?? 0, p.value).toBe(p.value === 'blocks' ? 0 : 1);
      expect(a.svg.match(/<\/defs>/g)?.length ?? 0, p.value).toBe(p.value === 'blocks' ? 0 : 1);
      // only the frame, stays and fork are painted
      for (const [part] of strokes(a.svg)) expect(['bk-frame', 'bk-stays', 'bk-fork']).toContain(part);
    }
  });

  test('[BK-PAINT-PATTERNS] one gradient across the bike: frame, stays and fork share it; two-tone blocks paint the stays in the second colour', () => {
    const fade = strokes(draw({ pattern: 'fade-h', colours: ['#6b3fa0', null] }).svg);
    expect(new Set(fade.map((s) => s[1]))).toEqual(new Set(['url(#bkpf)']));
    const blocks = Object.fromEntries(strokes(draw({ pattern: 'blocks', colours: ['#c62f2a', null] }).svg));
    expect(blocks).toEqual({ 'bk-stays': '#c62f2a', 'bk-frame': '#2563b8', 'bk-fork': '#2563b8' });
  });

  test('[BK-PAINT-PATTERNS] a missing second or third colour takes the starting ones (Purple, Teal); raw carbon ignores the colours', () => {
    expect(draw({ pattern: 'shift' }).svg).toBe(draw({ pattern: 'shift', colours: ['#6b3fa0', '#1f7f80'] }).svg);
    expect(draw({ pattern: 'carbon' }, '#c62f2a').svg.replace(/aria-label="[^"]*"/, '')).toBe(draw({ pattern: 'carbon' }, '#2f7d4f').svg.replace(/aria-label="[^"]*"/, ''));
  });

  test('[BK-PAINT-PATTERNS] two drawings on one page never share an id: every id carries the drawing\'s prefix', () => {
    for (const p of PATTERN_LIST) for (const id of ids(draw({ pattern: p.value, rimMm: 40 }, "#2563b8", "dark", "rig").svg)) expect(id?.startsWith("rig"), id).toBe(true);
  });
});

describe('the fork', () => {
  test('[BK-PAINT-FORK] like the frame, its own colour, one of the six fades from crown to dropout, or its own pattern in a fade pair', () => {
    const fork = (f: Json) => Object.fromEntries(strokes(draw({ pattern: 'fade-h', colours: ['#6b3fa0', null], fork: f }).svg))['bk-fork'];
    expect(fork(null)).toBe('url(#bkpf)');
    expect(fork({ kind: 'own', colour: '#C62F2A' })).toBe('#c62f2a');
    expect(fork({ kind: 'fade', pair: 2 })).toBe('url(#bkpk)');
    expect(fork({ kind: 'pattern', pattern: 'marble', pair: 3 })).toBe('url(#bkpu)');
    const fade = draw({ fork: { kind: 'fade', pair: 2 } }).svg;
    expect(fade).toContain(`stop-color="${FADES[2]!.from}"`);
    expect(fade).toContain(`stop-color="${FADES[2]!.to}"`);
    // the frame keeps its one colour when only the fork has extras
    expect(Object.fromEntries(strokes(fade))['bk-frame']).toBe('#2563b8');
    expect(FADES.map((f) => f.name)).toEqual(['Blue to purple', 'Teal to blue', 'Orange to red', 'Purple to pink', 'Silver to black', 'Olive to sand']);
  });
});

describe('rim depth', () => {
  test('[BK-PAINT-RIM] a black carbon band inside the tyre, as deep as the slider says at the drawing\'s scale; none set is today\'s rim', () => {
    for (const mm of [15, 30, 60]) {
      const a = draw({ rimMm: mm });
      const bands = [...a.svg.matchAll(/<circle class="bk-rimband"[^>]*r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/g)];
      expect(bands.length).toBe(2);
      const rim = Number(/<circle class="bk-rim"[^>]*r="([\d.]+)"/.exec(a.svg)![1]);
      for (const b of bands) {
        expect(Math.abs(Number(b[2]) - mm * a.anchors.scale)).toBeLessThan(0.01);
        expect(Math.abs(Number(b[1]) + Number(b[2]) / 2 - rim)).toBeLessThan(0.02); // its outer edge at the rim, inside the tyre
      }
      // drawn over the spokes, under everything else
      expect(a.svg.indexOf('bk-rimband')).toBeGreaterThan(a.svg.indexOf('bk-spokes'));
      expect(a.svg.indexOf('bk-rimband')).toBeLessThan(a.svg.indexOf('bk-chain'));
    }
    // a bike that shrinks to fit keeps the band in proportion
    const fat = normaliseBike({ id: 'f', fit: { style: 'full-suspension', size: { kind: 'letter', value: 'XL' } }, frontTyre: '26 x 4.8', rearTyre: '26 x 4.8', look: { colour: '#2563b8', paint: { rimMm: 60 } } })!;
    const fa = paintedArt(resolveBikeSpec(fat, null), null, {}, fat.look!.paint!);
    expect(fa.anchors.scale).toBeLessThan(0.11);
    expect(Number(/class="bk-rimband"[^>]*stroke-width="([\d.]+)"/.exec(fa.svg)![1])).toBeCloseTo(60 * fa.anchors.scale, 1);
  });
});

describe('the casing and the name', () => {
  test('[BK-PAINT-CASING] every painted part keeps its casing 1.5 units wider, in both themes, for every pattern and fork', () => {
    for (const theme of ['dark', 'light'] as const) for (const p of PATTERN_LIST) for (const fork of [null, { kind: 'own', colour: '#f4f4f2' }, { kind: 'pattern', pattern: 'carbon', pair: 0 }]) {
      const svg = draw({ pattern: p.value, fork }, '#2563b8', theme).svg;
      const pairs = [...svg.matchAll(/<path class="bk-casing[^"]*" d="([^"]+)" stroke-width="([\d.]+)"\/><path class="bk-paint [^"]*" d="([^"]+)" stroke-width="([\d.]+)"/g)];
      expect(pairs.length, `${theme} ${p.value}`).toBe(4);
      for (const m of pairs) {
        expect(m[1]).toBe(m[3]);
        expect(Number(m[2]) - Number(m[4])).toBeCloseTo(1.5, 5);
      }
    }
  });

  test('[BK-PAINT-CASING] owner\'s ruling A for every colour shown: muted unless a shown colour is one it moves; then the tone that stands out from all', () => {
    const silver = '#b9bdc1';
    const brown = '#7b5434';
    expect(casingForAll(['#2563b8', '#c62f2a'], 'dark')).toBe('muted');
    // Silver on its own moves in the dark theme, and still does as one colour of a fade
    const tone = casingForAll(['#2563b8', silver], 'dark');
    expect(tone).not.toBe('muted');
    expect(draw({ pattern: 'fade-h', colours: [silver, null] }, '#2563b8', 'dark').svg).toContain(`class="bk-casing bk-casing-${tone}"`);
    // the chosen tone is the best for the worst colour shown
    const worst = (t: string) => Math.min(...['#2563b8', silver].map((c) => contrastRatio(c, (CASINGS.dark as Record<string, string>)[t]!)));
    for (const t of Object.keys(CASINGS.dark)) expect(worst(tone)).toBeGreaterThanOrEqual(worst(t));
    expect(casingForAll([brown], 'light')).not.toBe('muted');
    // a fade between two swatches no rule moves keeps muted, in both themes
    for (const theme of ['dark', 'light'] as const) for (const a of SWATCHES) {
      if (casingForAll([a.hex], theme) !== 'muted') continue;
      expect(draw({ pattern: 'fade-h', colours: ['#2f7d4f', null] }, a.hex, theme).svg.includes('bk-casing-'), `${theme} ${a.name}`).toBe(casingForAll([a.hex, '#2f7d4f'], theme) !== 'muted');
    }
  });

  test('[BK-PAINT-LABEL] the accessible name says the pattern and its colours, the fork and the rims', () => {
    expect(draw({ pattern: 'fade-h', colours: ['#6b3fa0', null] }).label).toBe('Your bike: gravel bike, 700 × 40 mm tyres, drop bars, blue and purple frame, fade, front to back.');
    expect(draw({ pattern: 'shift' }).label).toContain('blue and purple and teal frame, colour shift');
    expect(draw({ pattern: 'carbon', rimMm: 50 }).label).toContain('raw carbon frame, 50 mm deep rims.');
    expect(draw({ fork: { kind: 'own', colour: '#c62f2a' } }).label).toContain('blue frame, red fork.');
    expect(draw({ fork: { kind: 'pattern', pattern: 'marble', pair: 0 } }).label).toContain('water-dyed fork, blue to purple');
    expect(draw({ rimMm: 30 }, null).label).toBe('Your bike: gravel bike, 700 × 40 mm tyres, drop bars, 30 mm deep rims.');
    const a = draw({ pattern: 'stripes', colours: ['#f1c232', null] });
    expect(a.svg).toContain(`aria-label="${a.label}"`);
  });
});

describe('the look extras as stored', () => {
  test('[BK-PAINT-NORMALISE] every field reads back as stored; an invalid one drops only itself; a colour is stored in lower case', () => {
    const full: Paint = { pattern: 'marble', colours: ['#6b3fa0', '#1f7f80'], fork: { kind: 'pattern', pattern: 'camo', pair: 5 }, rimMm: 45 };
    expect(bikeWith(full).look!.paint).toEqual(full);
    expect(bikeWith({ ...full, colours: ['#6B3FA0', 'teal'] }).look!.paint).toEqual({ ...full, colours: ['#6b3fa0', null] });
    expect(bikeWith({ ...full, fork: { kind: 'own' } }).look!.paint).toEqual({ ...full, fork: null });
    expect(bikeWith({ ...full, rimMm: '45' }).look!.paint).toEqual(full);
    expect(bikeWith({ ...full, rimMm: 100 }).look!.paint).toEqual({ ...full, rimMm: null });
    expect(bikeWith({ ...full, pattern: 'tartan' }).look!.paint).toEqual({ ...full, pattern: 'solid' });
    expect(bikeWith({ ...full, extra: 1 }).look!.paint).toEqual(full);
    // a look with only extras is kept; the old fields keep their place
    const only = normaliseBike({ id: 'o', look: { paint: { rimMm: 20 } } })!;
    expect(only.look).toEqual({ colour: null, bars: null, ebike: null, paint: { pattern: 'solid', colours: [null, null], fork: null, rimMm: 20 } });
    void setBike; void BAG_SETS;
  });
});

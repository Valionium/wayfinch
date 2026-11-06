// The fork's own two colours (owner's wish, 6 November 2026: "I want to be able to customize colour pairs"). With the fork's Fade or Own
// pattern the rider picks both colours from the frame's swatches; the six pairs stay as one-tap presets. Stored as `fork.colours`
// beside `pair`, which always names the nearest preset, so a page that knows only the presets still draws a sensible fork.
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { hexToOklab, nearestSwatchName, SWATCHES } from '../../../../src/core/bike/colour.ts';
import { FORK_PATTERNS, normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { Fork, Paint } from '../../../../src/core/bike/normalise.ts';
import { FADES, forkColours, paintedArt, pairFor, PATTERN_LIST } from '../../../../src/core/bike/paint.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test data, written by hand
type Json = any;
const HEX = SWATCHES.map((s) => s.hex);
const bikeWith = (colour: string | null, paint: Json) =>
  normaliseBike({ id: 'f', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', ...(paint === undefined ? {} : { paint }) } })!;
const draw = (paint: Json, colour: string | null = '#2563b8', theme: 'dark' | 'light' = 'dark', idPrefix = 'bk') => {
  const bike = bikeWith(colour, paint);
  return paintedArt(resolveBikeSpec(bike, null), null, { theme, idPrefix }, bike.look?.paint ?? null);
};
const stopsOf = (svg: string, id: string) => [...(new RegExp(`<linearGradient id="${id}"[^>]*>(.*?)</linearGradient>`).exec(svg)?.[1] ?? '').matchAll(/stop-color="([^"]+)"/g)].map((m) => m[1]);
/** The fill of the fork pattern's ground (its first colour) and of its flecks or bands, as the drawing has them. */
const forkTile = (svg: string) => /<pattern id="bkpu"[^>]*>(.*?)<\/pattern>/.exec(svg)?.[1] ?? '';

/** Every fork a page stores today: like the frame, its own colour (each swatch and a picked one), each fade, each pattern in each pair. */
const STORED: (Fork | null)[] = [null, ...[...HEX, '#a3c4f3'].map((colour) => ({ kind: 'own', colour }) as Fork), ...FADES.map((_, pair) => ({ kind: 'fade', pair }) as Fork),
  ...FORK_PATTERNS.flatMap((pattern) => FADES.map((_, pair) => ({ kind: 'pattern', pattern, pair }) as Fork))];

describe('a fork with its own two colours', () => {
  test('[BK-FORK-COLOURS] a fade or a fork pattern takes the rider\'s two colours, the same drawing every time, ids with the drawing\'s prefix', () => {
    const fade = draw({ fork: { kind: 'fade', pair: 0, colours: ['#c62f2a', '#f1c232'] } });
    expect(fade.svg).toBe(draw({ fork: { kind: 'fade', pair: 0, colours: ['#c62f2a', '#f1c232'] } }).svg);
    expect(stopsOf(fade.svg, 'bkpk')).toEqual(['#c62f2a', '#f1c232']);
    expect(fade.svg).not.toContain(FADES[0]!.from);
    for (const pattern of FORK_PATTERNS) {
      const a = draw({ fork: { kind: 'pattern', pattern, pair: 2, colours: ['#2f7d4f', '#f4f4f2'] } }, '#2563b8', 'light', 'rig');
      expect(a.svg, pattern).toBe(draw({ fork: { kind: 'pattern', pattern, pair: 2, colours: ['#2f7d4f', '#f4f4f2'] } }, '#2563b8', 'light', 'rig').svg);
      for (const id of a.svg.matchAll(/ id="([^"]+)"/g)) expect(id[1]!.startsWith('rig'), id[1]).toBe(true);
      if (pattern === 'carbon') continue;   // raw carbon ignores colours, its fork too
      expect(a.svg, pattern).not.toBe(draw({ fork: { kind: 'pattern', pattern, pair: 2 } }, '#2563b8', 'light', 'rig').svg);
      if (pattern !== 'chrome') expect(a.svg.replace(/<pattern id="rigpu"[^>]*>(.*?)<\/pattern>/, '$1'), pattern).toContain('#2f7d4f');
    }
    // the ground of a fork pattern is the first colour, its flecks the second, as with a preset pair
    const speckle = forkTile(draw({ fork: { kind: 'pattern', pattern: 'speckle', pair: 0, colours: ['#2f7d4f', '#f4f4f2'] } }).svg);
    expect(speckle).toMatch(/^<rect x="0" y="0" width="20" height="20" fill="#2f7d4f"\/>/);
    expect(speckle).toContain('fill="#f4f4f2"');
    // the frame keeps its own colour
    expect(/<path class="bk-paint bk-frame"[^>]*stroke="([^"]+)"/.exec(fade.svg)![1]).toBe('#2563b8');
  });

  test('[BK-FORK-COLOURS] the drawing\'s name names the two colours; a pair equal to a preset draws and is named as that preset', () => {
    expect(draw({ fork: { kind: 'fade', pair: 2, colours: ['#c62f2a', '#f1c232'] } }).label).toContain('blue frame, fork fading red to yellow.');
    expect(draw({ fork: { kind: 'pattern', pattern: 'marble', pair: 0, colours: ['#1f2f55', '#d6619b'] } }).label).toContain('water-dyed fork, navy to pink');
    expect(draw({ fork: { kind: 'pattern', pattern: 'carbon', pair: 0, colours: ['#1f2f55', '#d6619b'] } }).label).toContain('raw carbon fork.');
    const svg = draw({ fork: { kind: 'fade', pair: 1, colours: ['#c62f2a', '#f1c232'] } });
    expect(svg.svg).toContain(`aria-label="${svg.label}"`);
    for (const [i, p] of FADES.entries()) for (const fork of [{ kind: 'fade', pair: i }, { kind: 'pattern', pattern: 'camo', pair: i }]) {
      for (const theme of ['dark', 'light'] as const) expect(draw({ fork: { ...fork, colours: [p.from, p.to] } }, '#2563b8', theme)).toEqual(draw({ fork }, '#2563b8', theme));
    }
  });

  test('[BK-FORK-COLOURS] forkColours: the rider\'s pair, else the preset\'s', () => {
    expect(forkColours({ kind: 'fade', pair: 3 })).toEqual([FADES[3]!.from, FADES[3]!.to]);
    expect(forkColours({ kind: 'pattern', pattern: 'stripes', pair: 3, colours: ['#1d1d1f', '#f4f4f2'] })).toEqual(['#1d1d1f', '#f4f4f2']);
  });
});

describe('every fork stored before stays as it was', () => {
  test('[BK-FORK-SAME] a fork with only its pair (and every other stored fork) draws byte for byte as on main, both themes, every pattern', () => {
    const hash = createHash('sha256');
    let n = 0;
    for (const colour of [null, '#2563b8', '#7b5434', '#f4f4f2', '#b9bdc1']) for (const p of PATTERN_LIST) for (const fork of STORED) for (const theme of ['dark', 'light'] as const) {
      const a = draw({ pattern: p.value, colours: ['#6b3fa0', '#1f7f80'], fork }, colour, theme);
      hash.update(a.svg).update(a.label);
      n += 1;
    }
    expect(n).toBe(5 * 14 * 66 * 2);
    // main 746a17c's src/core/bike over the same set (the comparison over every swatch is scratch script fork-same.mts)
    expect(hash.digest('hex')).toBe('f30223fa75cefc2961b289c86308df1716440dd8dee74f4546f9cac2f8cd09e7');
  }, 120_000);
});

describe('a broken or unknown colour', () => {
  test('[BK-FORK-FALLBACK] falls back to the preset pair, or to today\'s drawing; a pair is kept only whole', () => {
    const preset = draw({ fork: { kind: 'fade', pair: 4 } }).svg;
    for (const colours of [['red', '#f1c232'], ['#c62f2a'], ['#c62f2a', null], 'red', null, 7, {}, ['#c62f2a', '#f1c23']]) {
      expect(bikeWith('#2563b8', { fork: { kind: 'fade', pair: 4, colours } }).look!.paint!.fork, JSON.stringify(colours)).toEqual({ kind: 'fade', pair: 4 });
      expect(draw({ fork: { kind: 'fade', pair: 4, colours } }).svg, JSON.stringify(colours)).toBe(preset);
    }
    // no usable preset: the fork is like the frame, today's drawing
    for (const pair of [undefined, 6, -1, 'x', 1.5]) {
      expect(bikeWith('#2563b8', { fork: { kind: 'fade', pair, colours: ['#c62f2a', '#f1c232'] } }).look, String(pair)).toEqual({ colour: '#2563b8', bars: 'drop', ebike: null });
      expect(draw({ fork: { kind: 'pattern', pattern: 'marble', pair, colours: ['#c62f2a', '#f1c232'] } }).svg).toBe(draw(undefined).svg);
    }
    // an own-colour fork takes no pair colours; upper case is stored lower case; more than two keeps the first two
    expect(bikeWith('#2563b8', { fork: { kind: 'own', colour: '#c62f2a', colours: ['#1d1d1f', '#f4f4f2'] } }).look!.paint!.fork).toEqual({ kind: 'own', colour: '#c62f2a' });
    expect(bikeWith('#2563b8', { fork: { kind: 'pattern', pattern: 'camo', pair: 1, colours: ['#C62F2A', '#F1C232', '#000000'] } }).look!.paint!.fork)
      .toEqual({ kind: 'pattern', pattern: 'camo', pair: 1, colours: ['#c62f2a', '#f1c232'] });
  });
});

describe('what is stored', () => {
  test('[BK-FORK-SAVE] pairFor: a preset\'s own two colours store the preset alone; any other pair stores both colours and the nearest preset', () => {
    expect(pairFor('#6b3fa0', '#d6619b')).toEqual({ pair: 3 });
    expect(pairFor('#6d7a37', '#cbb68e')).toEqual({ pair: 5 });
    for (const [i, p] of FADES.entries()) expect(pairFor(p.from, p.to)).toEqual({ pair: i });
    const d = (a: string, b: string) => { const [x, y] = [hexToOklab(a), hexToOklab(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
    for (const a of HEX) for (const b of HEX) {
      const got = pairFor(a, b);
      if (FADES.some((p) => p.from === a && p.to === b)) continue;
      expect(got.colours, `${a} ${b}`).toEqual([a, b]);
      const cost = FADES.map((p) => d(a, p.from) + d(b, p.to));
      expect(got.pair, `${nearestSwatchName(a)} to ${nearestSwatchName(b)}`).toBe(cost.indexOf(Math.min(...cost)));
    }
    expect(pairFor('#2563b8', '#6b3fa0').pair).toBe(0);   // Blue to Purple: the old page draws Blue to purple
    expect(pairFor('#c6cacd', '#1d1d1f')).toEqual({ pair: 4 });
  });

  test('[BK-FORK-SAVE] the two colours read back as stored, after the pair; a fork without them has no colours field', () => {
    const fade: Paint = { pattern: 'solid', colours: [null, null], fork: { kind: 'fade', pair: 2, colours: ['#c62f2a', '#f1c232'] }, rimMm: null };
    expect(bikeWith('#2563b8', fade).look!.paint).toEqual(fade);
    expect(Object.keys(bikeWith('#2563b8', fade).look!.paint!.fork!)).toEqual(['kind', 'pair', 'colours']);
    const pattern = { ...fade, fork: { kind: 'pattern', pattern: 'stripes', pair: 0, colours: ['#1d1d1f', '#f4f4f2'] } };
    expect(JSON.stringify(bikeWith('#2563b8', pattern).look!.paint!.fork)).toBe('{"kind":"pattern","pattern":"stripes","pair":0,"colours":["#1d1d1f","#f4f4f2"]}');
    expect(JSON.stringify(bikeWith('#2563b8', { fork: { kind: 'fade', pair: 2 } }).look!.paint!.fork)).toBe('{"kind":"fade","pair":2}');
  });
});

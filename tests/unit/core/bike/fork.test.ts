// The fork's own two colours (owner's wish, 6 November 2026: "I want to be able to customize colour pairs"). With the fork's Fade or Own
// pattern the rider picks both colours from the frame's swatches; the six pairs stay as one-tap presets. Stored as `fork.colours`
// beside `pair`, which always names the nearest preset, so a page that knows only the presets still draws a sensible fork.
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { CASINGS, contrastRatio, hexToOklab, nearestSwatchName, SWATCHES } from '../../../../src/core/bike/colour.ts';
import type { CasingTone } from '../../../../src/core/bike/colour.ts';
import { FORK_PATTERNS, normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { Fork, Paint } from '../../../../src/core/bike/normalise.ts';
import { BACKGROUNDS, colourName, FADES, forkColours, paintedArt, pairFor, partCasings, partColours, PATTERN_LIST } from '../../../../src/core/bike/paint.ts';
import type { PaintedPart } from '../../../../src/core/bike/paint.ts';
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

// Ruling A for the rider's own pairs, measured where the bike is drawn. Written here on its own, not taken from the code it checks: the
// colours each part shows come from the paint itself (a liquid-metal fork shows the two metal tones of its first colour, not its
// pair: review of PR 50, I2), and the casing must be the one the per-part rule picks for exactly those colours (review I1), so a
// casing worked out on the preset's colours, or on a colour the fork does not draw, fails.
const BGS = { light: ['#F4F2E8', '#FBFAF3'], dark: ['#1B2018', '#242B20'] } as const;
const WEAVE = ['#34373b', '#1f2124'];
const BROWN = '#7b5434';
const TONES = { light: ['muted', 'ink', 'panel'], dark: ['muted', 'ink', 'ground'] } as const;
const hexOfTone = (theme: 'dark' | 'light', tone: CasingTone): string => (CASINGS[theme] as Record<string, string>)[tone]!;
function readable(colour: string, theme: 'dark' | 'light', tone: CasingTone): boolean {
  const casing = hexOfTone(theme, tone);
  if (theme === 'light' && tone === 'muted' && colour === BROWN) return false;   // Brown never on muted (ruling A)
  return BGS[theme].every((bg) => contrastRatio(casing, bg) >= 3 || contrastRatio(colour, bg) >= 3);
}
/** A colour `t` of the way from one colour to another, in sRGB, rounded (the try-out's mixing). */
function between(x: string, y: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [rgb(x), rgb(y)];
  return `#${p.map((v, i) => Math.round(Math.max(0, Math.min(255, v + (q[i]! - v) * t))).toString(16).padStart(2, '0')).join('')}`;
}
const wave = (i: number): number => 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 12);
const twelfths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Liquid metal's bands: from a dark steel tinted 45% with its colour to a light one tinted 15%, sharpened towards the light. */
function metalTones(c: string): string[] {
  const [dark, light] = [between('#3c3f43', c, 0.45), between('#f4f5f6', c, 0.15)];
  return [...new Set(twelfths.map((i) => between(dark, light, wave(i) ** 2.2)))];
}
/** Water-dyed's bands on a fork: a sine from the first colour through the second and back. */
const marbleTones = (a: string, b: string): string[] => [...new Set(twelfths.map((i) => (wave(i) < 0.5 ? between(a, b, wave(i) * 2) : between(b, a, (wave(i) - 0.5) * 2))))];
const worst = (cs: readonly string[], hex: string): number => Math.min(...cs.map((c) => contrastRatio(c, hex)));
/** The per-part rule (BK-DARK-CRISP), written out: dark per part; light one casing for all where it keeps each part readable. */
function rule(parts: Record<PaintedPart, string[]>, theme: 'dark' | 'light'): Record<PaintedPart, CasingTone> {
  const out = {} as Record<PaintedPart, CasingTone>;
  const first = (tones: readonly CasingTone[], score: (t: CasingTone) => number) => tones.reduce((a, b) => (score(b) > score(a) ? b : a));
  const all = Object.values(parts).flat();
  const one: CasingTone = theme === 'light' && all.includes(BROWN) ? first(TONES.light, (t) => worst(all, hexOfTone('light', t))) : 'muted';
  for (const [part, cs] of Object.entries(parts) as [PaintedPart, string[]][]) {
    if (theme === 'dark') {
      const muted = worst(cs, hexOfTone('dark', 'muted'));
      out[part] = muted >= 3 ? 'muted' : worst(cs, BGS.dark[1]) >= 3 ? 'ground' : worst(cs, hexOfTone('dark', 'ink')) > muted ? 'ink' : 'muted';
    } else {
      const fits: CasingTone[] = TONES.light.filter((t) => cs.every((c) => readable(c, 'light', t)));
      out[part] = fits.includes(one) ? one : first(fits, (t) => worst(cs, hexOfTone('light', t)));
    }
  }
  return out;
}
const forkShows = (way: string, a: string, b: string): string[] => (way === 'carbon' ? WEAVE : way === 'chrome' ? metalTones(a) : way === 'marble' ? marbleTones(a, b) : [a, b]);
const casingIn = (svg: string, part: string): CasingTone => (new RegExp(`class="bk-casing(?: bk-casing-(\\w+))?"[^>]*/><path class="bk-paint ${part}"`).exec(svg)?.[1] as CasingTone | undefined) ?? 'muted';
const ownFork = (way: string, a: string, b: string): Fork => (way === 'fade' ? { kind: 'fade', pair: 0, colours: [a, b] } : { kind: 'pattern', pattern: way, pair: 0, colours: [a, b] }) as Fork;

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
    // liquid metal is tinted by its first colour only: the name never says a second colour it does not draw (review of PR 50, M1)
    expect(draw({ fork: { kind: 'pattern', pattern: 'chrome', pair: 0, colours: ['#c62f2a', '#f1c232'] } }).label).toContain('blue frame, liquid metal fork, red.');
    expect(draw({ fork: { kind: 'pattern', pattern: 'chrome', pair: 4 } }).label).toContain('blue frame, liquid metal fork, silver.');
    for (const pair of FADES.keys()) expect(draw({ fork: { kind: 'pattern', pattern: 'chrome', pair } }).label).not.toContain(' to ');
    expect(draw({ fork: { kind: 'pattern', pattern: 'chrome', pair: 0 } }).label).toContain('liquid metal fork, blue.');   // Blue to purple's light blue
    // a preset's own shade keeps the preset's word for it beside a swatch ("blue to red", not the nearest swatch's "teal to red")
    expect(draw({ fork: { kind: 'fade', pair: 0, colours: ['#5f8fd0', '#c62f2a'] } }).label).toContain('fork fading blue to red.');
    expect(colourName('#1f8f90')).toBe('Teal');
    expect(colourName('#7a4fb0')).toBe('Purple');
    expect(colourName('#a3c4f3')).toBe(nearestSwatchName('#a3c4f3'));
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
  test('[BK-FORK-SAME] a fork with only its pair (and every other stored fork but liquid metal, below) draws byte for byte as on main, both themes, every pattern', () => {
    const hash = createHash('sha256');
    let n = 0;
    for (const colour of [null, '#2563b8', '#7b5434', '#f4f4f2', '#b9bdc1']) for (const p of PATTERN_LIST) for (const fork of STORED) for (const theme of ['dark', 'light'] as const) {
      if (fork?.kind === 'pattern' && fork.pattern === 'chrome') continue;
      const a = draw({ pattern: p.value, colours: ['#6b3fa0', '#1f7f80'], fork }, colour, theme);
      hash.update(a.svg).update(a.label);
      n += 1;
    }
    expect(n).toBe(5 * 14 * 60 * 2);
    // main 746a17c's src/core/bike over the same set (scratch script same-hash.mts; the comparison over every swatch is fork-same.mts)
    expect(hash.digest('hex')).toBe('b782b7e0ae4492122183946fd4da14f0a7c56f12233c3eea587e14b13aff5deb');
  }, 120_000);

  test('[BK-FORK-SAME] a preset liquid-metal fork stored before keeps main\'s casing wherever its bands read on it; where main left a band unreadable, its casing reads every band, and the rest of the bike is as before', () => {
    let kept = 0;
    let fixed = 0;
    for (const colour of HEX) for (const p of PATTERN_LIST) for (const pair of FADES.keys()) for (const theme of ['dark', 'light'] as const) {
      const paint: Paint = { pattern: p.value, colours: ['#6b3fa0', '#7b5434'], fork: { kind: 'pattern', pattern: 'chrome', pair }, rimMm: null };
      const before = rule(partColours(paint, colour, true)!, theme);   // main's: worked out on the pair
      const bands = metalTones(FADES[pair]!.from);
      expect(partColours(paint, colour)!['bk-fork']).toEqual(bands);
      const got = partCasings(paint, colour, theme)!;
      const name = `${theme} ${nearestSwatchName(colour)} ${p.value}, pair ${pair}`;
      if (bands.every((c) => readable(c, theme, before['bk-fork']))) { expect(got, name).toEqual(before); kept += 1; continue; }
      expect(bands.filter((c) => !readable(c, theme, got['bk-fork'])), name).toEqual([]);
      expect({ ...got, 'bk-fork': null }, name).toEqual({ ...before, 'bk-fork': null });
      fixed += 1;
    }
    expect(kept).toBeGreaterThan(fixed);
    expect(fixed).toBeGreaterThan(0);
  });
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

describe('the rider\'s own pairs stay readable', () => {
  test('[BK-FORK-CONTRAST] every swatch frame x every swatch x swatch fork pair x every way of the fork x both themes: each part has the casing the per-part rule gives the colours it draws, readable on both apps\' ground and panel', () => {
    expect(BGS).toEqual(BACKGROUNDS);   // the backgrounds BK-DARK-CRISP reads from theme.css and the page
    let n = 0;
    const tones = new Set<string>();
    for (const colour of HEX) for (const a of HEX) for (const b of HEX) for (const way of ['fade', ...FORK_PATTERNS] as const) {
      const paint: Paint = { pattern: 'solid', colours: [null, null], fork: ownFork(way, a, b), rimMm: null };
      const shown: Record<PaintedPart, string[]> = { 'bk-frame': [colour], 'bk-stays': [colour], 'bk-fork': forkShows(way, a, b) };
      for (const theme of ['light', 'dark'] as const) {
        const t = partCasings(paint, colour, theme)!;
        const name = `${theme} frame ${nearestSwatchName(colour)}, ${way} ${nearestSwatchName(a)} to ${nearestSwatchName(b)}`;
        const want = rule(shown, theme);
        if (JSON.stringify(t) !== JSON.stringify(want)) expect(t, name).toEqual(want);
        for (const part of Object.keys(shown) as PaintedPart[]) {
          const bad = shown[part].filter((c) => !readable(c, theme, t[part]));
          if (bad.length) expect(bad, `${name}, ${part} on ${t[part]}`).toEqual([]);
          tones.add(`${theme} ${t[part]}`);
        }
        n += 1;
      }
    }
    expect(n).toBe(16 * 256 * 8 * 2);
    expect(tones.size).toBeGreaterThanOrEqual(5);   // the rule is at work, not one tone for all
    // cases the review named: a casing worked out on the preset (Blue to purple) instead of the rider's pair gives other tones
    const fork = (colour: string, way: string, a: string, b: string, theme: 'dark' | 'light') => partCasings({ pattern: 'solid', colours: [null, null], fork: ownFork(way, a, b), rimMm: null }, colour, theme)!['bk-fork'];
    expect(fork('#2563b8', 'fade', '#f4f4f2', '#f4f4f2', 'dark')).toBe('ground');
    expect(fork('#2563b8', 'fade', BROWN, '#f4f4f2', 'dark')).toBe('muted');
    expect(fork(BROWN, 'fade', '#1d1d1f', '#1f2f55', 'light')).toBe('panel');
    // liquid metal: the hidden second colour steers nothing (Black metal with Brown second is Black metal with Black second)
    expect(fork('#1d1d1f', 'chrome', '#1d1d1f', BROWN, 'light')).toBe(fork('#1d1d1f', 'chrome', '#1d1d1f', '#1d1d1f', 'light'));
  }, 300_000);

  test('[BK-FORK-CONTRAST] the drawing carries each part\'s casing, and every colour the fork draws (each stop and fill of its paint) reads on it: every pair, every way, both themes', () => {
    for (const frame of [BROWN, '#1d1d1f']) for (const a of HEX) for (const b of HEX) for (const theme of ['light', 'dark'] as const) for (const way of ['fade', ...FORK_PATTERNS] as const) {
      const bike = bikeWith(frame, { fork: ownFork(way, a, b) });
      const svg = paintedArt(resolveBikeSpec(bike, null), null, { theme }, bike.look!.paint!).svg;
      const t = partCasings(bike.look!.paint!, frame, theme)!;
      const name = `${theme} ${nearestSwatchName(frame)} frame, ${way} ${a} ${b}`;
      for (const part of ['bk-frame', 'bk-stays', 'bk-fork'] as const) if (casingIn(svg, part) !== t[part]) expect(casingIn(svg, part), `${name} ${part}`).toBe(t[part]);
      // what the fork's paint draws: its gradient's stops, or its tile's fills (the sparkle's faint white flecks aside)
      const defs = way === 'fade' ? (/<linearGradient id="bkpk"[^>]*>(.*?)<\/linearGradient>/.exec(svg)?.[1] ?? '') : forkTile(svg);
      const drawn = new Set([...defs.matchAll(/(?:stop-color|fill)="(#[0-9a-f]{6})"(?! fill-opacity)/g)].map((m) => m[1]!));
      expect(drawn.size, name).toBeGreaterThan(0);
      const bad = [...drawn].filter((c) => !readable(c, theme, casingIn(svg, 'bk-fork')));
      if (bad.length) expect(bad, `${name}: on ${casingIn(svg, 'bk-fork')}`).toEqual([]);
      if (way === 'fade') expect([...drawn]).toEqual(a === b ? [a] : [a, b]);
      if (way !== 'fade' && way !== 'carbon' && way !== 'chrome') expect(drawn.has(a), name).toBe(true);
    }
  }, 300_000);
});

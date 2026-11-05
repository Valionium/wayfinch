// The bike's look extras (owner's wish, 5 November 2026, from the try-out he approved): frame patterns, the fork, rim depth. Pure and
// deterministic: the same bike gives the same drawing, every time and on both pages. The extras are laid over bikeArt's drawing as
// paint servers (gradients and SVG patterns) on the same frame, stays and fork paths, over the same casing (owner's ruling A), so
// a bike without extras is bikeArt's drawing byte for byte. The co-pilot loads this module only for a bike that has extras; the bag
// planner has it in /tools/bags/bike.js.
import { PT } from '../wording/en-paint.ts';
import { W } from '../wording/en.ts';
import { bikeArt } from './art.ts';
import type { Anchors, ArtOptions, P } from './art.ts';
import { CASINGS, casingFor, contrastRatio, nearestSwatchName } from './colour.ts';
import type { CasingTone } from './colour.ts';
import type { Fork, ForkPattern, Paint, Pattern } from './normalise.ts';
import type { BagView, BikeSpec } from './spec.ts';

export type { Fork, ForkPattern, Paint, Pattern } from './normalise.ts';

/** The patterns in the order the Look shows them (the try-out's), each with its name and note. */
export const PATTERN_LIST: readonly { value: Pattern; name: string; note: string; colours: 0 | 1 | 2 | 3 }[] = [
  { value: 'solid', name: PT.paintSolid, note: PT.paintSolidNote, colours: 1 },
  { value: 'fade-h', name: PT.paintFadeH, note: PT.paintFadeHNote, colours: 2 },
  { value: 'fade-v', name: PT.paintFadeV, note: PT.paintFadeVNote, colours: 2 },
  { value: 'split', name: PT.paintSplit, note: PT.paintSplitNote, colours: 2 },
  { value: 'blocks', name: PT.paintBlocks, note: PT.paintBlocksNote, colours: 2 },
  { value: 'shift', name: PT.paintShift, note: PT.paintShiftNote, colours: 3 },
  { value: 'marble', name: PT.paintMarble, note: PT.paintMarbleNote, colours: 3 },
  { value: 'stripes', name: PT.paintStripes, note: PT.paintStripesNote, colours: 2 },
  { value: 'speckle', name: PT.paintSpeckle, note: PT.paintSpeckleNote, colours: 3 },
  { value: 'camo', name: PT.paintCamo, note: PT.paintCamoNote, colours: 3 },
  { value: 'panel', name: PT.paintPanel, note: PT.paintPanelNote, colours: 2 },
  { value: 'sparkle', name: PT.paintSparkle, note: PT.paintSparkleNote, colours: 2 },
  { value: 'chrome', name: PT.paintChrome, note: PT.paintChromeNote, colours: 1 },
  { value: 'carbon', name: PT.paintCarbon, note: PT.paintCarbonNote, colours: 0 },
];
const PATTERN_OF = new Map(PATTERN_LIST.map((p) => [p.value, p]));

/** The six fade pairs (the try-out's), for a fork's fade and a fork pattern's two colours. */
export const FADES: readonly { name: string; from: string; to: string }[] = [
  { name: PT.paintPairBluePurple, from: '#5f8fd0', to: '#7a4fb0' }, { name: PT.paintPairTealBlue, from: '#1f8f90', to: '#2563b8' },
  { name: PT.paintPairOrangeRed, from: '#e9852c', to: '#c62f2a' }, { name: PT.paintPairPurplePink, from: '#6b3fa0', to: '#d6619b' },
  { name: PT.paintPairSilverBlack, from: '#c6cacd', to: '#1d1d1f' }, { name: PT.paintPairOliveSand, from: '#6d7a37', to: '#cbb68e' },
];

/** What a new pattern starts with when the rider has not chosen yet: the try-out's second and third colours (Purple, Teal). */
export const DEFAULT_COLOURS: readonly [string, string] = ['#6b3fa0', '#1f7f80'];
/** Raw carbon's weave; its first colour for older pages and the 24 px marker is Black. */
const WEAVE = ['#34373b', '#1f2124'] as const;
export const CARBON_COLOUR = '#1d1d1f';
/** The rim's carbon band and its inner edge. */
const RIM_BAND = '#2b2d30';
const RIM_EDGE = { light: '#5b5f63', dark: '#6c7075' } as const;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const mix = (a: readonly number[], b: readonly number[], t: number): number[] => a.map((v, i) => v + (b[i]! - v) * t);
const rgbHex = (c: readonly number[]): string => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mixHex = (a: string, b: string, t: number): string => rgbHex(mix(hexRgb(a), hexRgb(b), t));

/** Park and Miller's generator with a fixed seed: the same flecks every time. */
function prng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

const stops = (list: readonly [number, string][]): string => list.map(([o, c]) => `<stop offset="${r2(o)}" stop-color="${c}"/>`).join('');
const linear = (id: string, a: P, b: P, list: readonly [number, string][], extra = ''): string =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}"${extra}>${stops(list)}</linearGradient>`;

/** The frame's box: rear axle to front axle, the top of the frame to the bottom bracket. Patterns are laid out on it. */
type Frame = { x: number; y: number; w: number; h: number; at: (fx: number, fy: number) => P };
function frameBox(a: Anchors): Frame {
  const { rear, front, headTop, seatTop, bb } = a.points;
  const x = rear[0];
  const y = Math.min(headTop[1], seatTop[1]);
  const w = front[0] - x;
  const h = bb[1] - y;
  return { x, y, w, h, at: (fx, fy) => [x + fx * w, y + fy * h] };
}

/** A texture: an SVG pattern tile over the frame's area, its content in the tile's own units. */
function tile(id: string, at: P, w: number, h: number, body: string, extra = ''): string {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${r2(at[0])}" y="${r2(at[1])}" width="${r2(w)}" height="${r2(h)}"${extra}>${body}</pattern>`;
}
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = ''): string =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}"${extra}/>`;

/** Copies of a shape near a tile's edge on the other side, so the tiles meet without a seam. */
function wrapped(x: number, y: number, reach: number, size: number, draw: (x: number, y: number) => string): string {
  let out = '';
  for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) {
    const [px, py] = [x + dx, y + dy];
    if (px + reach < 0 || px - reach > size || py + reach < 0 || py - reach > size) continue;
    out += draw(px, py);
  }
  return out;
}

/** One texture (the try-out's, written as SVG): `cols` are three colours, the first the ground. Returns the defs. */
function texture(kind: ForkPattern, id: string, f: Frame, cols: readonly [string, string, string]): string {
  const [a, b, c] = cols;
  // The area the try-out painted: a little beyond the frame on every side, so the stays and the fork are inside it.
  const origin: P = [f.x - 8, f.y - 10];
  const [w, h] = [f.w + 20, f.h + 24];
  if (kind === 'stripes') {
    // Bands 3.5 units wide (about a tube's width), the second colour on every other one, slanted as in the try-out.
    return tile(id, origin, 7, 7, rect(0, 0, 7, 7, a) + rect(0, 0, 3.5, 7, b), ' patternTransform="rotate(-34.38)"');
  }
  if (kind === 'carbon') {
    // One weave cell per unit, alternating tows, each with a faint sheen along its fibres.
    const [on, off] = WEAVE;
    const sheen = ' fill-opacity="0.06"';
    return tile(id, origin, 2, 2, rect(0, 0, 1, 1, on) + rect(1, 1, 1, 1, on) + rect(1, 0, 1, 1, off) + rect(0, 1, 1, 1, off)
      + rect(0, 0, 1, 1 / 3, '#ffffff', sheen) + rect(1, 1, 1, 1 / 3, '#ffffff', sheen) + rect(1, 0, 1 / 3, 1, '#ffffff', sheen) + rect(0, 1, 1 / 3, 1, '#ffffff', sheen));
  }
  if (kind === 'speckle') {
    // A quarter of a fleck per square unit, 0.25 to 0.6 units across, two in three of the second colour.
    const size = 20;
    const rnd = prng(7);
    let dots = '';
    for (let n = 0; n < 100; n += 1) {
      const [x, y, r] = [rnd() * size, rnd() * size, 0.25 + rnd() * 0.35];
      const fill = n % 3 ? b : c;
      dots += wrapped(x, y, r, size, (px, py) => `<circle cx="${r2(px)}" cy="${r2(py)}" r="${r2(r)}" fill="${fill}"/>`);
    }
    return tile(id, origin, size, size, rect(0, 0, size, size, a) + dots);
  }
  if (kind === 'sparkle') {
    // Fine flake: half a fleck per square unit, most of them light, one in four of the second colour.
    const size = 16;
    const rnd = prng(7);
    let flakes = '';
    for (let n = 0; n < 128; n += 1) {
      const [x, y, s] = [rnd() * size, rnd() * size, 0.12 + rnd() * 0.18];
      const fill = n % 4 === 0 ? `"${b}"` : '"#ffffff" fill-opacity="0.55"';
      flakes += wrapped(x, y, s, size, (px, py) => `<rect x="${r2(px)}" y="${r2(py)}" width="${r2(s)}" height="${r2(s)}" fill=${fill}/>`);
    }
    return tile(id, origin, size, size, rect(0, 0, size, size, a) + flakes);
  }
  if (kind === 'camo') {
    // Soft blotches of the second and third colours, softened by a slight blur.
    const size = 40;
    const rnd = prng(7);
    let blobs = '';
    for (let n = 0; n < 25; n += 1) {
      const [x, y, rx, ry, turn] = [rnd() * size, rnd() * size, 2 + rnd() * 4, 1.2 + rnd() * 2.5, rnd() * 172];
      const fill = n % 2 ? b : c;
      blobs += wrapped(x, y, rx, size, (px, py) => `<ellipse cx="${r2(px)}" cy="${r2(py)}" rx="${r2(rx)}" ry="${r2(ry)}" transform="rotate(${r2(turn)} ${r2(px)} ${r2(py)})" fill="${fill}"/>`);
    }
    const blur = `<filter id="${id}b" filterUnits="userSpaceOnUse" x="-4" y="-4" width="${size + 8}" height="${size + 8}"><feGaussianBlur stdDeviation="0.5"/></filter>`;
    return tile(id, origin, size, size, blur + rect(0, 0, size, size, a) + `<g filter="url(#${id}b)">${blobs}</g>`);
  }
  // Water-dyed and liquid metal: bands of colour, warped by fixed-seed noise. A tile as large as the frame's area, so nothing repeats.
  const warp = (scale: number, freq: string) => `<filter id="${id}w" filterUnits="userSpaceOnUse" x="-12" y="-12" width="${r2(w + 24)}" height="${r2(h + 24)}">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="7" result="n"/>`
    + `<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  const body = (bands: string, scale: number, freq: string) => warp(scale, freq) + bands
    + `<rect x="-12" y="-12" width="${r2(w + 24)}" height="${r2(h + 24)}" fill="url(#${id}g)" filter="url(#${id}w)"/>`;
  if (kind === 'marble') {
    // The try-out's swirl: a sine through the three colours, about 20 units a turn, across the frame.
    const turn = 2 * Math.PI * 3.2;
    const list: [number, string][] = [];
    for (let i = 0; i <= 12; i += 1) {
      const t = 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 12);
      list.push([i / 12, t < 0.5 ? mixHex(a, b, t * 2) : mixHex(b, c, (t - 0.5) * 2)]);
    }
    return tile(id, origin, w, h, body(linear(`${id}g`, [0, 0], [turn, 0], list, ' spreadMethod="repeat"'), 18, '0.03 0.05'));
  }
  // Liquid metal: light and dark bands tinted with the colour, slanted, sharpened towards the light, gently warped.
  const dark = rgbHex(mix([60, 63, 67], hexRgb(a), 0.45));
  const light = rgbHex(mix([244, 245, 246], hexRgb(a), 0.15));
  const dir = Math.hypot(0.55, 1);
  const period = (2 * Math.PI * 2.1) / dir;
  const list: [number, string][] = [];
  for (let i = 0; i <= 12; i += 1) list.push([i / 12, mixHex(dark, light, (0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 12)) ** 2.2)]);
  return tile(id, origin, w, h, body(linear(`${id}g`, [0, 0], [(0.55 / dir) * period, (1 / dir) * period], list, ' spreadMethod="repeat"'), 6, '0.02 0.03'));
}

/** The colours a frame pattern shows (two or three for most, the weave for raw carbon). */
function frameColours(pattern: Pattern, c1: string, more: readonly [string, string]): string[] {
  const n = PATTERN_OF.get(pattern)!.colours;
  if (pattern === 'carbon') return [...WEAVE];
  if (pattern === 'chrome') return [rgbHex(mix([60, 63, 67], hexRgb(c1), 0.45)), rgbHex(mix([244, 245, 246], hexRgb(c1), 0.15))];
  return [c1, ...more].slice(0, n);
}

/** The casing under several colours: muted, unless one of them is a colour owner's ruling A moves; then the theme's tone that stands out most from all of them. */
export function casingForAll(colours: readonly string[], theme: 'dark' | 'light'): CasingTone {
  if (colours.every((c) => casingFor(c, theme) === 'muted')) return 'muted';
  let best: CasingTone = 'muted';
  let bestRatio = -1;
  for (const [tone, hex] of Object.entries(CASINGS[theme])) {
    const worst = Math.min(...colours.map((c) => contrastRatio(c, hex)));
    if (worst > bestRatio) { best = tone as CasingTone; bestRatio = worst; }
  }
  return best;
}

const nameOf = (hex: string): string => nearestSwatchName(hex) ?? hex;

/** The extras, made safe to draw: a pattern missing one of its colours takes the starting ones; with no frame colour only the rims apply. */
function usable(paint: Paint, colour: string | null): { pattern: Pattern; more: [string, string]; fork: Fork | null; rimMm: number | null } {
  return {
    pattern: colour ? paint.pattern : 'solid',
    more: [paint.colours[0] ?? DEFAULT_COLOURS[0], paint.colours[1] ?? DEFAULT_COLOURS[1]],
    fork: colour ? paint.fork : null,
    rimMm: paint.rimMm,
  };
}

/** The drawing's accessible name with the extras: the pattern and its colours, the fork, the rims. */
function paintLabel(label: string, colour: string | null, u: ReturnType<typeof usable>): string {
  const extra: string[] = [];
  let frame = colour ? W.bikeColourFrame(nameOf(colour)) : '';
  if (colour && u.pattern === 'carbon') frame = PT.paintCarbonLabel;
  else if (colour && u.pattern === 'chrome') frame = PT.paintFrameLabel([nameOf(colour)], PT.paintChrome);
  else if (colour && u.pattern !== 'solid') frame = PT.paintFrameLabel(frameColours(u.pattern, colour, u.more).map(nameOf), PATTERN_OF.get(u.pattern)!.name);
  const fork = u.fork;
  if (fork?.kind === 'own') extra.push(PT.paintForkColourLabel(nameOf(fork.colour)));
  if (fork?.kind === 'fade') extra.push(PT.paintForkFadeName(FADES[fork.pair]!.name));
  if (fork?.kind === 'pattern') extra.push(fork.pattern === 'carbon' ? PT.paintForkPatternName(PT.paintCarbon, null) : PT.paintForkPatternName(PATTERN_OF.get(fork.pattern)!.name, FADES[fork.pair]!.name));
  if (u.rimMm !== null) extra.push(PT.paintRimLabel(u.rimMm));
  if (extra.length === 0 && (!colour || u.pattern === 'solid')) return label;
  const old = colour ? W.bikeColourFrame(nameOf(colour)) : '';
  if (old && label.includes(old)) return label.replace(old, [frame, ...extra].join(', '));
  return label.replace(/\.$/, `, ${extra.join(', ')}.`);
}

/**
 * bikeArt with the look extras. Without extras (or with nothing usable in them) it is bikeArt's drawing, byte for byte. With them, the
 * frame, stays and fork take their pattern, the rims a carbon band of the given depth at the drawing's scale, and the casing keeps
 * owner's ruling A for every colour shown.
 */
export function paintedArt(spec: BikeSpec, bags: BagView | null, options: ArtOptions = {}, paint: Paint | null = null): { svg: string; anchors: Anchors; label: string } {
  const art = bikeArt(spec, bags, options);
  if (!paint) return art;
  const colour = spec.colour.value;
  const u = usable(paint, colour);
  const theme = options.theme ?? 'dark';
  const id = `${options.idPrefix ?? 'bk'}p`;
  const a = art.anchors;
  const f = frameBox(a);
  const defs: string[] = [];
  let svg = art.svg;
  const shown: string[] = [];

  if (colour) {
    const c1 = colour;
    const [c2, c3] = u.more;
    let frame = c1;
    let rear = c1;
    const grad = (from: P, to: P, list: [number, string][]) => { defs.push(linear(`${id}f`, from, to, list)); frame = rear = `url(#${id}f)`; };
    switch (u.pattern) {
      case 'fade-h': grad(f.at(0.953, 0), f.at(0.03, 0), [[0, c1], [1, c2]]); break;
      case 'fade-v': grad(f.at(0, -0.025), f.at(0, 1.026), [[0, c1], [1, c2]]); break;
      case 'split': grad(f.at(0.206, -0.056), f.at(0.689, 1.057), [[0, c1], [0.5, c1], [0.5, c2], [1, c2]]); break;
      case 'shift': grad(f.at(0.953, 0.021), f.at(0.03, 0.949), [[0, c1], [0.5, c2], [1, c3]]); break;
      case 'panel': grad(f.at(0.997, 0), f.at(-0.014, 0), [[0, c1], [0.12, c1], [0.12, c2], [0.3, c2], [0.3, c1], [1, c1]]); break;
      case 'blocks': rear = c2; break;
      case 'solid': break;
      default: defs.push(texture(u.pattern, `${id}t`, f, [c1, c2, c3])); frame = rear = `url(#${id}t)`;
    }
    shown.push(...frameColours(u.pattern, c1, u.more));
    // The fork continues the frame's pattern, or has its own colour, fade or pattern.
    let fork = frame;
    const fk = u.fork;
    if (fk?.kind === 'own') { fork = fk.colour; shown.push(fk.colour); }
    if (fk?.kind === 'fade') {
      const pair = FADES[fk.pair]!;
      defs.push(linear(`${id}k`, a.points.headBottom, a.points.front, [[0, pair.from], [1, pair.to]]));
      fork = `url(#${id}k)`;
      shown.push(pair.from, pair.to);
    }
    if (fk?.kind === 'pattern') {
      const pair = FADES[fk.pair]!;
      defs.push(texture(fk.pattern, `${id}u`, f, [pair.from, pair.to, pair.from]));
      fork = `url(#${id}u)`;
      shown.push(...(fk.pattern === 'carbon' ? WEAVE : [pair.from, pair.to]));
    }
    const strokeOf = { 'bk-stays': rear, 'bk-frame': frame, 'bk-fork': fork } as Record<string, string>;
    svg = svg.replace(/(<path class="bk-paint (bk-stays|bk-frame|bk-fork)"[^>]*?) stroke="#[0-9a-f]{6}"/g, (_m, head: string, part: string) => `${head} stroke="${strokeOf[part]}"`);
    // Owner's ruling A, for every colour the frame and fork show.
    const tone = casingForAll(shown, theme);
    svg = svg.replace(/class="bk-casing(?: bk-casing-\w+)?"/g, tone === 'muted' ? 'class="bk-casing"' : `class="bk-casing bk-casing-${tone}"`);
  }

  // The rims: a carbon band inside the tyre, as deep as the rim, at the drawing's scale (0.11 units per mm, less on a shrunk bike).
  if (u.rimMm !== null) {
    const rim = (spec.rimMm.value / 2) * a.scale;
    const depth = u.rimMm * a.scale;
    const band = (c: P) => `<circle class="bk-rimband" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rim - depth / 2)}" fill="none" stroke="${RIM_BAND}" stroke-width="${r2(depth)}"/>`
      + `<circle class="bk-rimedge" cx="${r2(c[0])}" cy="${r2(c[1])}" r="${r2(rim - depth + 0.25)}" fill="none" stroke="${RIM_EDGE[theme]}" stroke-width="0.5"/>`;
    svg = svg.replace(/(<path class="bk-spokes"[^>]*\/>)/, `$1${band(a.points.rear)}${band(a.points.front)}`);
  }

  const label = paintLabel(art.label, colour, u);
  svg = svg.replace(`aria-label="${art.label}"`, `aria-label="${label}"`);
  if (defs.length > 0) svg = svg.replace(/^(<svg[^>]*>)(<defs>)?/, (_m, open: string, had?: string) => `${open}<defs>${defs.join('')}${had ? '' : '</defs>'}`);
  return { svg, anchors: a, label };
}


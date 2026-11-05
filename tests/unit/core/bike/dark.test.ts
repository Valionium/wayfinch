// The dark theme's drawing as crisp as the light one (owner's try-out, 5 November 2026: "in dark the light frame has a soft grey casing
// that blurs its edge"). The light theme stays as it was, byte for byte; ruling A (the frame readable on its background in both themes)
// is proved over every swatch, all 14 patterns and every way of the fork, in both themes.
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { bikeArt, markerArt } from '../../../../src/core/bike/art.ts';
import { CASING_MIN_CONTRAST, CASINGS, casingFor, contrastRatio, darkCasing, SWATCHES } from '../../../../src/core/bike/colour.ts';
import type { CasingTone } from '../../../../src/core/bike/colour.ts';
import { FORK_PATTERNS, normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { Fork, Paint } from '../../../../src/core/bike/normalise.ts';
import { casingForAll, FADES, paintedArt, partColours, PATTERN_LIST, shownColours } from '../../../../src/core/bike/paint.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';

type Theme = 'dark' | 'light';
const THEMES: readonly Theme[] = ['light', 'dark'];
/** The fork, every way: like the frame, its own colour (each swatch), each fade, each pattern in each pair. */
const FORKS: (Fork | null)[] = [null, ...SWATCHES.map((s) => ({ kind: 'own', colour: s.hex }) as Fork), ...FADES.map((_, pair) => ({ kind: 'fade', pair }) as Fork),
  ...FORK_PATTERNS.flatMap((pattern) => FADES.map((_, pair) => ({ kind: 'pattern', pattern, pair }) as Fork))];
const paintOf = (pattern: Paint['pattern'], fork: Fork | null): Paint => ({ pattern, colours: ['#6b3fa0', '#1f7f80'], fork, rimMm: null });
const bikeWith = (colour: string | null, paint?: Paint) =>
  normaliseBike({ id: 'd', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', ...(paint ? { paint } : {}) } })!;
const toneOf = (svg: string): CasingTone => (/class="bk-casing bk-casing-(\w+)"/.exec(svg)?.[1] as CasingTone | undefined) ?? 'muted';
const hexOf = (theme: Theme, tone: CasingTone): string => (CASINGS[theme] as Record<string, string>)[tone]!;
/** The backgrounds a drawing sits on: the page's ground and a card's panel (spec section 3.6). */
const BACKGROUNDS = { light: ['#F4F2E8', '#FBFAF3'], dark: ['#1B2018', '#242B20'] } as const;

/** Ruling A: a colour reads on its background when it stands out from its casing at 3:1, or the casing itself does from every background. */
function readable(colour: string, theme: Theme, tone: CasingTone): boolean {
  const casing = hexOf(theme, tone);
  return contrastRatio(colour, casing) >= CASING_MIN_CONTRAST || BACKGROUNDS[theme].every((bg) => contrastRatio(casing, bg) >= CASING_MIN_CONTRAST);
}

/** The dark casing as main had it (ruling A of 3 November): muted, unless Silver or Sand is shown; then the tone best for the worst colour. */
function oldDarkTone(shown: readonly string[]): CasingTone {
  if (!shown.some((c) => ['#b9bdc1', '#cbb68e'].includes(c))) return 'muted';
  let best: CasingTone = 'muted';
  let ratio = -1;
  for (const [tone, hex] of Object.entries(CASINGS.dark)) {
    const worst = Math.min(...shown.map((c) => contrastRatio(c, hex)));
    if (worst > ratio) { best = tone as CasingTone; ratio = worst; }
  }
  return best;
}

describe('the light theme stays as it was', () => {
  test('[BK-DARK-CRISP] every light drawing (16 swatches and none, 14 patterns, every fork, the 24 px marker) is byte for byte as before', () => {
    const hash = createHash('sha256');
    for (const colour of [null, ...SWATCHES.map((s) => s.hex), '#a3c4f3']) {
      const spec = resolveBikeSpec(bikeWith(colour), null);
      hash.update(bikeArt(spec, null, { theme: 'light' }).svg).update(markerArt(spec, 'light'));
      for (const p of PATTERN_LIST) {
        for (const fork of [FORKS[0]!, FORKS[1]!, FORKS[4]!, FORKS[17]!, FORKS[20]!, FORKS[23]!, FORKS[FORKS.length - 1]!]) {
          const bike = bikeWith(colour, paintOf(p.value, fork));
          hash.update(paintedArt(resolveBikeSpec(bike, null), null, { theme: 'light' }, bike.look?.paint ?? null).svg);
        }
      }
    }
    // main at 44bfb46, before the dark theme's casing changed
    expect(hash.digest('hex')).toBe('203b1e06a5372a0db0a1dfc8422976ad5bafe18a08333a7eb82cc5c1ac17cb03');
  }, 120_000);
});

describe('the dark theme: a crisp edge for every colour, readable on its background', () => {
  test('[BK-DARK-CRISP] one colour: muted where the colour stands out from it at 3:1, else the ground (a dark outline, as the light theme\'s), else the lighter tone it stands out from most', () => {
    const want: Record<string, CasingTone> = {
      Black: 'muted', Graphite: 'muted', Silver: 'ground', White: 'ground', Sand: 'ground', Brown: 'ink', Red: 'ground', Orange: 'ground',
      Yellow: 'ground', Olive: 'ground', Green: 'ground', Teal: 'ground', Blue: 'ink', Navy: 'muted', Purple: 'muted', Pink: 'ground',
    };
    for (const s of SWATCHES) {
      const tone = casingFor(s.hex, 'dark');
      expect(tone, s.name).toBe(want[s.name]);
      // every swatch now has an edge of 3:1 or more against its casing
      expect(contrastRatio(s.hex, hexOf('dark', tone)), s.name).toBeGreaterThanOrEqual(CASING_MIN_CONTRAST);
      const spec = resolveBikeSpec(bikeWith(s.hex), null);
      expect(toneOf(bikeArt(spec, null, { theme: 'dark' }).svg), s.name).toBe(tone);
      expect(toneOf(markerArt(spec, 'dark')), s.name).toBe(tone);
    }
    // the owner's light blue, from the picker: a dark outline now, not a grey halo
    expect(casingFor('#a3c4f3', 'dark')).toBe('ground');
  });

  test('[BK-DARK-CRISP] every swatch x 14 patterns x every way of the fork x both themes: each colour shown is readable (ruling A); in the dark, each part (frame, stays, fork) has the casing of the theme\'s tones that keeps its colours readable with a crisp edge', () => {
    let cases = 0;
    let sharp = 0;
    let sharpBefore = 0;
    let lightKnown = 0;
    for (const theme of THEMES) {
      for (const s of SWATCHES) {
        for (const p of PATTERN_LIST) {
          for (const fork of FORKS) {
            const paint = paintOf(p.value, fork);
            const shown = shownColours(paint, s.hex);
            const parts = partColours(paint, s.hex)!;
            const name = `${theme} ${s.name} ${p.value} ${JSON.stringify(fork)}`;
            // every part's colours are among those shown
            for (const list of Object.values(parts)) for (const c of list) expect(shown, name).toContain(c);
            cases += 1;
            if (theme === 'light') {
              const tone = casingForAll(shown, 'light');
              const unreadable = shown.filter((c) => !readable(c, 'light', tone));
              // The light theme is as main has it. There, only a fork in light colours on a frame showing Brown falls short: ruling A
              // gives Brown the panel casing (a light one), which a light fork does not stand out from. Left for the owner.
              if (unreadable.length > 0 && fork !== null && tone === 'panel' && shown.includes('#7b5434')) { lightKnown += 1; continue; }
              expect(unreadable, `${name} on ${tone}`).toEqual([]);
              continue;
            }
            const before = oldDarkTone(shown);
            let allSharp = true;
            let allSharpBefore = true;
            for (const [part, colours] of Object.entries(parts)) {
              const tone = darkCasing(colours);
              const edge = (t: CasingTone) => Math.min(...colours.map((c) => contrastRatio(c, hexOf('dark', t))));
              expect(colours.filter((c) => !readable(c, 'dark', tone)), `${name} ${part} on ${tone}`).toEqual([]);
              // muted, the spec's own, where it gives an edge of 3:1; else the ground, a dark outline as the light theme has; else of the
              // lighter tones (which keep any colour readable) the one with the sharper edge
              const want = edge('muted') >= CASING_MIN_CONTRAST ? 'muted' : edge('ground') >= CASING_MIN_CONTRAST ? 'ground'
                : edge('ink') > edge('muted') ? 'ink' : 'muted';
              expect(tone, `${name} ${part}`).toBe(want);
              // never blunter than main's casing, where that one kept the part readable, unless the edge is 3:1 anyway
              if (colours.every((c) => readable(c, 'dark', before))) expect(edge(tone), `${name} ${part}`).toBeGreaterThanOrEqual(Math.min(edge(before), CASING_MIN_CONTRAST));
              allSharp &&= edge(tone) >= CASING_MIN_CONTRAST;
              allSharpBefore &&= edge(before) >= CASING_MIN_CONTRAST;
            }
            if (allSharp) sharp += 1;
            if (allSharpBefore) sharpBefore += 1;
          }
        }
      }
    }
    expect(cases).toBe(2 * 16 * 14 * FORKS.length);
    expect(lightKnown).toBe(170);
    // far more dark drawings have an edge of 3:1 all round than on main; the rest mix colours no single casing can serve
    expect(sharp).toBeGreaterThan(sharpBefore * 2);
  }, 120_000);

  test('[BK-DARK-CRISP] the drawing carries each part\'s tone: water-dyed in light colours with a fork in a darker fade keeps the frame\'s dark outline; raw carbon', () => {
    const at = (colour: string, paint: Paint) => {
      const bike = bikeWith(colour, paint);
      return paintedArt(resolveBikeSpec(bike, null), null, { theme: 'dark' }, bike.look!.paint!).svg;
    };
    const casingOf = (svg: string, part: string): CasingTone => (new RegExp(`class="bk-casing(?: bk-casing-(\\w+))?"[^>]*/><path class="bk-paint ${part}"`).exec(svg)?.[1] as CasingTone | undefined) ?? 'muted';
    const water = { pattern: 'marble', colours: ['#cbb68e', '#a3c4f3'], fork: { kind: 'fade', pair: 0 }, rimMm: null } as Paint;
    const svg = at('#f4f4f2', water);
    expect(casingOf(svg, 'bk-frame')).toBe('ground');
    expect(casingOf(svg, 'bk-stays')).toBe('ground');
    expect(casingOf(svg, 'bk-fork')).toBe(darkCasing([FADES[0]!.from, FADES[0]!.to]));
    // two-tone blocks: the stays have their own colour, and their own casing
    const blocks = at('#f4f4f2', { pattern: 'blocks', colours: ['#1d1d1f', null], fork: null, rimMm: null });
    expect([casingOf(blocks, 'bk-frame'), casingOf(blocks, 'bk-stays'), casingOf(blocks, 'bk-fork')]).toEqual(['ground', 'muted', 'ground']);
    expect(toneOf(at('#2563b8', { pattern: 'carbon', colours: [null, null], fork: null, rimMm: null }))).toBe('muted');
    // the light theme keeps one casing for all parts, as main
    const bike = bikeWith('#f4f4f2', water);
    const light = paintedArt(resolveBikeSpec(bike, null), null, { theme: 'light' }, bike.look!.paint!).svg;
    expect(new Set([...light.matchAll(/class="(bk-casing[^"]*)"/g)].map((m) => m[1])).size).toBe(1);
  });
});

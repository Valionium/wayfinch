// The bike's casing, readable where it is drawn (owner's try-out, 5 November 2026: "in dark the light frame has a soft grey casing that
// blurs its edge"; review of PR 49, I1 and M4; owner's decision of 5 November: fix the light theme's Brown cases too). Ruling A is
// measured against the real backgrounds of both apps and both themes (the page's ground, the panel of the cards and of Look), over every
// swatch, all 14 patterns with every second and third colour, and every way of the fork. Every other light drawing stays as main's.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { bikeArt, markerArt } from '../../../../src/core/bike/art.ts';
import { CASING_MIN_CONTRAST, CASINGS, casingFor, contrastRatio, darkCasing, SWATCHES } from '../../../../src/core/bike/colour.ts';
import type { CasingTone } from '../../../../src/core/bike/colour.ts';
import { FORK_PATTERNS, normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { Fork, Paint } from '../../../../src/core/bike/normalise.ts';
import { BACKGROUNDS, FADES, paintedArt, partCasings, partColours, PATTERN_LIST, shownColours } from '../../../../src/core/bike/paint.ts';
import type { PaintedPart } from '../../../../src/core/bike/paint.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';

type Theme = 'dark' | 'light';
const THEMES: readonly Theme[] = ['light', 'dark'];
const BROWN = '#7b5434';
const HEX = SWATCHES.map((s) => s.hex);
/** The fork, every way: like the frame, its own colour (each swatch), each fade, each pattern in each pair. */
const FORKS: (Fork | null)[] = [null, ...HEX.map((colour) => ({ kind: 'own', colour }) as Fork), ...FADES.map((_, pair) => ({ kind: 'fade', pair }) as Fork),
  ...FORK_PATTERNS.flatMap((pattern) => FADES.map((_, pair) => ({ kind: 'pattern', pattern, pair }) as Fork))];
const paintOf = (pattern: Paint['pattern'], fork: Fork | null, c2 = '#6b3fa0', c3 = '#1f7f80'): Paint => ({ pattern, colours: [c2, c3], fork, rimMm: null });
const bikeWith = (colour: string | null, paint?: Paint) =>
  normaliseBike({ id: 'd', fit: { style: 'diamond-sloping', size: { kind: 'letter', value: 'M' } }, look: { colour, bars: 'drop', ...(paint ? { paint } : {}) } })!;
const hexOf = (theme: Theme, tone: CasingTone): string => (CASINGS[theme] as Record<string, string>)[tone]!;
const casingOf = (svg: string, part: string): CasingTone => (new RegExp(`class="bk-casing(?: bk-casing-(\\w+))?"[^>]*/><path class="bk-paint ${part}"`).exec(svg)?.[1] as CasingTone | undefined) ?? 'muted';
const draw = (colour: string, paint: Paint, theme: Theme) => {
  const bike = bikeWith(colour, paint);
  return paintedArt(resolveBikeSpec(bike, null), null, { theme }, bike.look!.paint!).svg;
};

/** Ruling A where the bike is drawn: on every background, the casing or else the colour itself stands out at 3:1. Written here on its
 *  own, not taken from the code it checks. Brown never on muted in the light theme (the owner's ruling A of 3 November). */
function readable(colour: string, theme: Theme, tone: CasingTone): boolean {
  const casing = hexOf(theme, tone);
  const bgs = theme === 'light' ? ['#F4F2E8', '#FBFAF3'] : ['#1B2018', '#242B20'];
  if (theme === 'light' && tone === 'muted' && colour === BROWN) return false;
  return bgs.every((bg) => contrastRatio(casing, bg) >= CASING_MIN_CONTRAST || contrastRatio(colour, bg) >= CASING_MIN_CONTRAST);
}
/** Main's casing, one for the whole drawing: muted unless a ruled colour is shown (light: Brown; dark: Silver, Sand), then the tone
 *  best for the worst colour shown. */
function mainTone(shown: readonly string[], theme: Theme): CasingTone {
  const ruled = theme === 'light' ? [BROWN] : ['#b9bdc1', '#cbb68e'];
  if (!shown.some((c) => ruled.includes(c))) return 'muted';
  let best: CasingTone = 'muted';
  let ratio = -1;
  for (const [tone, hex] of Object.entries(CASINGS[theme])) {
    const worst = Math.min(...shown.map((c) => contrastRatio(c, hex)));
    if (worst > ratio) { best = tone as CasingTone; ratio = worst; }
  }
  return best;
}
const mainKeepsReadable = (shown: readonly string[], theme: Theme) => shown.every((c) => readable(c, theme, mainTone(shown, theme)));

/** Every case of the proof: each swatch as the first colour, each pattern, every second and third colour a pattern shows (fork as the
 *  frame), and every way of the fork with the starting second and third colours and with Brown among them. */
function* cases(): Generator<{ colour: string; paint: Paint }> {
  for (const colour of HEX) {
    for (const p of PATTERN_LIST) {
      const second = p.colours >= 2 ? HEX : ['#6b3fa0'];
      const third = p.colours >= 3 ? HEX : ['#1f7f80'];
      for (const c2 of second) for (const c3 of third) yield { colour, paint: paintOf(p.value, null, c2, c3) };
      for (const fork of FORKS.slice(1)) for (const [c2, c3] of [['#6b3fa0', '#1f7f80'], [BROWN, '#1f7f80'], ['#b9bdc1', BROWN]]) yield { colour, paint: paintOf(p.value, fork, c2, c3) };
    }
  }
}

describe('the backgrounds the bike is drawn on', () => {
  test('[BK-DARK-CRISP] the proof\'s backgrounds are the ground and panel of both themes, as Wayfinch\'s theme.css and the bag planner\'s page have them', () => {
    const css = readFileSync('src/ui/theme.css', 'utf8');
    const page = readFileSync('public/tools/bags/index.html', 'utf8');
    for (const [name, i] of [['ground', 0], ['panel', 1]] as const) {
      for (const theme of THEMES) expect([...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))].map((m) => m[1])).toContain(BACKGROUNDS[theme][i]);
      for (const theme of THEMES) expect([...page.matchAll(new RegExp(`--${name}:(#[0-9A-Fa-f]{6})`, 'g'))].map((m) => m[1])).toContain(BACKGROUNDS[theme][i]);
    }
    expect(BACKGROUNDS).toEqual({ light: ['#F4F2E8', '#FBFAF3'], dark: ['#1B2018', '#242B20'] });
  });
});

describe('ruling A, measured where the bike is drawn', () => {
  test('[BK-DARK-CRISP] one colour in the dark: muted where it stands out from it at 3:1, else the ground where it stands out at 3:1 from the panel too, else the lighter tone it stands out from most', () => {
    const want: Record<string, CasingTone> = {
      Black: 'muted', Graphite: 'muted', Silver: 'ground', White: 'ground', Sand: 'ground', Brown: 'ink', Red: 'ink', Orange: 'ground',
      Yellow: 'ground', Olive: 'ground', Green: 'ink', Teal: 'ground', Blue: 'ink', Navy: 'muted', Purple: 'muted', Pink: 'ground',
    };
    for (const s of SWATCHES) {
      const tone = casingFor(s.hex, 'dark');
      expect(tone, s.name).toBe(want[s.name]);
      expect(readable(s.hex, 'dark', tone), s.name).toBe(true);
      // and the edge against the casing itself is 3:1 or more for every swatch
      expect(contrastRatio(s.hex, hexOf('dark', tone)), s.name).toBeGreaterThanOrEqual(CASING_MIN_CONTRAST);
      const spec = resolveBikeSpec(bikeWith(s.hex), null);
      expect(casingOf(bikeArt(spec, null, { theme: 'dark' }).svg, 'bk-frame'), s.name).toBe(tone);
    }
    expect(casingFor('#a3c4f3', 'dark')).toBe('ground');   // the owner's light blue: a dark outline, not a grey halo
  });

  test('[BK-DARK-CRISP] every swatch, 14 patterns with every second and third colour, every way of the fork, both themes: every colour shown is readable on every background, part by part', () => {
    let count = 0;
    let lightChanged = 0;
    let sharp = 0;
    let sharpMain = 0;
    for (const { colour, paint } of cases()) {
      const parts = partColours(paint, colour)!;
      const shown = shownColours(paint, colour);
      for (const theme of THEMES) {
        count += 1;
        const tones = partCasings(paint, colour, theme)!;
        const name = `${theme} ${colour} ${JSON.stringify(paint)}`;
        for (const [part, colours] of Object.entries(parts) as [PaintedPart, string[]][]) {
          expect(colours.filter((c) => !readable(c, theme, tones[part])), `${name} ${part} on ${tones[part]}`).toEqual([]);
        }
        if (theme === 'light') {
          // the light theme keeps main's one casing wherever main kept every colour readable
          if (mainKeepsReadable(shown, 'light')) expect(new Set(Object.values(tones)), name).toEqual(new Set([mainTone(shown, 'light')]));
          else lightChanged += 1;
        } else {
          const edge = (cs: readonly string[], t: CasingTone) => Math.min(...cs.map((c) => contrastRatio(c, hexOf('dark', t))));
          if (Object.entries(parts).every(([part, cs]) => edge(cs, tones[part as PaintedPart]) >= CASING_MIN_CONTRAST)) sharp += 1;
          if (edge(shown, mainTone(shown, 'dark')) >= CASING_MIN_CONTRAST) sharpMain += 1;
          // the best tone for each part: none of the theme's tones that keeps its colours readable has a sharper edge, unless the tone
          // chosen already gives 3:1 (muted, the spec's own, or the ground, a dark outline)
          for (const [part, cs] of Object.entries(parts) as [PaintedPart, string[]][]) {
            const tone = tones[part];
            if (edge(cs, tone) >= CASING_MIN_CONTRAST) continue;
            for (const t of Object.keys(CASINGS.dark) as CasingTone[]) if (cs.every((c) => readable(c, 'dark', t))) expect(edge(cs, tone), `${name} ${part}`).toBeGreaterThanOrEqual(edge(cs, t));
          }
        }
      }
    }
    expect(count).toBeGreaterThan(100_000);
    // what the owner decided to fix in the light theme: main's casing left a colour unreadable in these
    expect(lightChanged).toBeGreaterThan(0);
    expect(sharp).toBeGreaterThan(sharpMain * 2);
  }, 300_000);

  test('[BK-DARK-CRISP] the cases the review found: Red and Green on the ground casing fall short on the panel; main\'s light Brown cases', () => {
    for (const hex of ['#c62f2a', '#2f7d4f']) {
      expect(readable(hex, 'dark', 'ground')).toBe(false);
      expect(darkCasing([hex])).not.toBe('ground');
    }
    for (const [colour, paint] of [[BROWN, paintOf('solid', { kind: 'fade', pair: 2 })], [BROWN, paintOf('solid', { kind: 'fade', pair: 4 })], ['#1d1d1f', paintOf('chrome', { kind: 'own', colour: BROWN })],
      ['#1d1d1f', paintOf('shift', null, '#b9bdc1', BROWN)]] as const) {
      expect(mainKeepsReadable(shownColours(paint, colour), 'light'), JSON.stringify(paint)).toBe(false);
      const tones = partCasings(paint, colour, 'light')!;
      for (const [part, cs] of Object.entries(partColours(paint, colour)!)) for (const c of cs) expect(readable(c, 'light', tones[part as PaintedPart]), `${part} ${c}`).toBe(true);
    }
  });

  test('[BK-DARK-CRISP] the drawing carries each part\'s tone: water-dyed with a darker fork fade, two-tone blocks, a Brown frame with an orange-to-red fork fade in the light theme', () => {
    const water = { pattern: 'marble', colours: ['#cbb68e', '#a3c4f3'], fork: { kind: 'fade', pair: 0 }, rimMm: null } as Paint;
    for (const [colour, paint, theme] of [['#f4f4f2', water, 'dark'], ['#f4f4f2', paintOf('blocks', null, '#1d1d1f'), 'dark'], [BROWN, paintOf('solid', { kind: 'fade', pair: 2 }), 'light'],
      ['#2563b8', paintOf('carbon', null), 'dark']] as const) {
      const svg = draw(colour, paint, theme);
      const tones = partCasings(paint, colour, theme)!;
      for (const part of ['bk-frame', 'bk-stays', 'bk-fork'] as const) expect(casingOf(svg, part), `${colour} ${paint.pattern} ${part}`).toBe(tones[part]);
    }
    expect(partCasings(paintOf('solid', { kind: 'fade', pair: 2 }), BROWN, 'light')).toEqual({ 'bk-frame': 'panel', 'bk-stays': 'panel', 'bk-fork': 'ink' });
  });
});

describe('the light theme stays as main\'s wherever main kept every colour readable', () => {
  test('[BK-DARK-CRISP] the light drawings main kept readable (16 swatches and none, 14 patterns, a spread of forks, the marker) hash as main\'s', () => {
    const hash = createHash('sha256');
    for (const colour of [null, ...HEX, '#a3c4f3']) {
      const spec = resolveBikeSpec(bikeWith(colour), null);
      hash.update(bikeArt(spec, null, { theme: 'light' }).svg).update(markerArt(spec, 'light'));
      for (const p of PATTERN_LIST) {
        for (const fork of [FORKS[0]!, FORKS[1]!, FORKS[4]!, FORKS[17]!, FORKS[20]!, FORKS[23]!, FORKS[FORKS.length - 1]!]) {
          const paint = paintOf(p.value, fork);
          if (colour && !mainKeepsReadable(shownColours(paint, colour), 'light')) continue;   // the owner's decision changes these
          const bike = bikeWith(colour, paint);
          hash.update(paintedArt(resolveBikeSpec(bike, null), null, { theme: 'light' }, bike.look?.paint ?? null).svg);
        }
      }
    }
    // main 32fa90f's src/core/bike over the same set and filter (scratch script light-main.mts)
    expect(hash.digest('hex')).toBe('e941507d7701ea558eff37d10617a3c45ea4af6ea5d9f89db040ef998fe138f4');
  }, 120_000);
});

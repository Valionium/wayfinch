// <BikeDrawing>: the rider's bike, tappable into the bag planner's Look (spec section 3.7). Nothing is required: with no bike, no plan
// or damaged data it draws a typical bike with a friendly caption. A colour change keeps the drawing's elements, so the colour can ease
// over 150 ms where motion is allowed (bike.css); any other change redraws within the same frame.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bagViewOf, bikeArt, captionOf, resolveBikeSpec } from '../../core/bike/index.ts';
import type { Swatch } from '../../core/bike/colour.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { LoadSummary } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import './bike.css';
import { themeChoice } from '../theme-apply.ts';
import { bikeDetailsHref } from './link.ts';
import type { BackScreen } from './link.ts';

type Theme = 'dark' | 'light';

function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** The fill ramp follows the theme, as in the bag planner; so does the casing's tone (owner's ruling A). */
export function useTheme(): Theme {
  // The rider's choice, made in either app, redraws at once (owner's try-out, 5 Nov 2026); the phone's own setting too.
  void themeChoice.value;
  const [, setPhone] = useState(0);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-color-scheme: light)');
    const update = () => setPhone((n) => n + 1);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return currentTheme();
}

let drawings = 0;
// The look extras (patterns, fork, rims) and the frame bag's cut beside a bottle (as the full planner draws it) are their own chunk, loaded only
// for a bike that has them or a plan: the first screen never carries them.
let extras: typeof import('../../core/bike/paint.ts') | undefined;
// The casing's tone may move with the colour (the dark theme's, BK-DARK-CRISP): it is repainted in place too.
const unnamed = (svg: string): string => svg.replace(/ aria-label="[^"]*"/, '').replace(/class="bk-casing[^"]*"/g, 'class="bk-casing"');

/** Writes the drawing; when only the one colour moved (every painted stroke is it, no pattern on either side), it repaints the frame and fork in place. */
function paint(box: HTMLElement, last: { svg: string }, svg: string, colour: string | null): void {
  if (last.svg === svg) return;
  const svgEl = box.firstElementChild;
  // The new drawing without its one colour must be the old one without any hex colour: a pattern's url() or a second colour never passes.
  if (colour && svgEl && unnamed(last.svg.replace(/ stroke="#[0-9a-f]{6}"/g, '')) === unnamed(svg.split(` stroke="${colour}"`).join(''))) {
    for (const el of box.querySelectorAll('.bk-paint')) el.setAttribute('stroke', colour);
    const casing = /class="(bk-casing[^"]*)"/.exec(svg)?.[1];
    if (casing) for (const el of box.querySelectorAll('.bk-casing')) el.setAttribute('class', casing);
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1];
    if (label) svgEl.setAttribute('aria-label', label);
  } else {
    box.innerHTML = svg;
  }
  last.svg = svg;
}

export type BikeDrawingProps = {
  bike: BikeRecord | null;
  summary: LoadSummary | null;
  /** large: with the plan's bags (Trip, Tools); small: without bags (You). */
  size?: 'large' | 'small';
  back: BackScreen;
  caption?: boolean;
  /** Every bike id the bag planner holds: a summary naming another bike draws no bags. */
  known?: readonly string[];
  /** A colour tried on the first-run card: drawn, and carried into Bike details, never saved. */
  tryColour?: Swatch | null;
  /** Trip's saved bike: the caption is its name and Bike details (sweep 2 of 15 Nov 2026, #5). */
  name?: string | undefined;
};

export function BikeDrawing({ bike, summary, size = 'large', back, caption = true, known, tryColour, name }: BikeDrawingProps) {
  const theme = useTheme();
  const [prefix] = useState(() => `bk${(drawings += 1)}-`);
  const look = bike?.look?.paint;
  const [ready, setReady] = useState(0);
  useEffect(() => {
    if (look || summary) import('../../core/bike/paint.ts').then((m) => setReady((extras = m) ? 1 : 0), () => 0);
  }, [look, summary]);
  // Drawn again only when what it is drawn from changes.
  const { spec, art, words: drawn } = useMemo(() => {
    const plan = size === 'large' ? bagViewOf(summary, bike, known ?? (bike ? [bike.id] : [])) : null;
    const r = resolveBikeSpec(bike, plan), s = tryColour ? { ...r, colour: { value: tryColour.hex, mark: 'entered' as const } } : r;
    const o = { theme, idPrefix: prefix };
    return { spec: s, art: extras ? extras.tripArt(s, plan, o, look) : bikeArt(s, plan, o), words: captionOf(s, bike, plan) };
  }, [bike, summary, known, size, theme, prefix, ready, tryColour]);
  const words = name ? { text: name, action: W.bikeDetailsLink } : drawn;
  const href = bikeDetailsHref(bike?.id ?? 'new', back, 'look') + (tryColour ? `&colour=${tryColour.name.toLowerCase()}` : '');
  const box = useRef<HTMLSpanElement>(null);
  const last = useRef({ svg: '' });
  useLayoutEffect(() => {
    if (box.current) paint(box.current, last.current, art.svg, spec.colour.value);
  });
  return (
    <figure class={`bike bike-${size}`}>
      <a class="bike-tap" href={href} aria-label={W.bikeTapName(art.label, words.action)}>
        <span class="bike-art" ref={box} />
      </a>
      {caption ? (
        <figcaption class="bike-caption">
          {/* A no-break space keeps the "·" with the words: on a narrow phone only the link moves down a line. */}
          {words.text}{' · '}<a href={href}>{words.action}</a>
        </figcaption>
      ) : null}
    </figure>
  );
}

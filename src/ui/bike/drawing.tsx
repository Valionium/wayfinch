// <BikeDrawing>: the rider's bike, tappable into the bag planner's Look (spec section 3.7). Nothing is required: with no bike, no plan
// or damaged data it draws a typical bike with a friendly caption. A colour change keeps the drawing's elements, so the colour can ease
// over 150 ms where motion is allowed (bike.css); any other change redraws within the same frame.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bagViewOf, bikeArt, captionOf, resolveBikeSpec } from '../../core/bike/index.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { LoadSummary } from '../../core/types.ts';
import { W } from '../../core/wording/en.ts';
import './bike.css';
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
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-color-scheme: light)');
    const update = () => setTheme(currentTheme());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return theme;
}

let drawings = 0;
const withoutColour = (svg: string): string => svg.replace(/ stroke="#[0-9a-f]{6}"/g, '').replace(/ aria-label="[^"]*"/, '');

/** Writes the drawing; when only the colour moved, it repaints the frame and fork in place. */
function paint(box: HTMLElement, last: { svg: string }, svg: string, colour: string | null): void {
  if (last.svg === svg) return;
  const svgEl = box.firstElementChild;
  if (colour && svgEl && last.svg && withoutColour(last.svg) === withoutColour(svg)) {
    for (const el of box.querySelectorAll('.bk-paint')) el.setAttribute('stroke', colour);
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
};

export function BikeDrawing({ bike, summary, size = 'large', back, caption = true, known }: BikeDrawingProps) {
  const theme = useTheme();
  const [prefix] = useState(() => `bk${(drawings += 1)}-`);
  // Drawn again only when what it is drawn from changes.
  const { spec, art, words } = useMemo(() => {
    const plan = size === 'large' ? bagViewOf(summary, bike, known ?? (bike ? [bike.id] : [])) : null;
    const s = resolveBikeSpec(bike, plan);
    return { spec: s, art: bikeArt(s, plan, { theme, idPrefix: prefix }), words: captionOf(s, bike, plan) };
  }, [bike, summary, known, size, theme, prefix]);
  const href = bikeDetailsHref(bike?.id ?? 'new', back, 'look');
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

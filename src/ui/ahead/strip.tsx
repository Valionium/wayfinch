// The mini route strip (spec section 3.2): the day's ride from its start to the day's stop, with the rider's bike at the left end
// facing the way of travel, the places at their kilometre and the rain bands. Bands are solid, hatched, or red with a bolt, and
// say so in words: colour is never the only signal. Tapping an icon or a band opens its card. Where things sit is drawing only:
// every kilometre and word comes from the screen.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { CardName, Strip, StripBand, StripIcon } from '../../core/screen/screen.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { BikeMarker } from '../bike/marker.tsx';

export const ICON_WORD: Record<StripIcon['kind'], (km: string) => string> = {
  water: W.appAheadIconWater, food: W.appAheadIconFood, sleep: W.appAheadIconSleep, cover: W.appAheadIconCover,
};
const BAND_WORD: Record<StripBand['kind'], (from: string, to: string) => string> = {
  likely: W.appAheadBandLikely, possible: W.appAheadBandPossible, thunder: W.appAheadBandThunder,
};
/** A band's words: "km 140–146"; one of no length at the day's stop is "at your stop"; one of no length elsewhere names its km. */
function bandWords(b: StripBand, stopKm: number): string {
  const [from, to] = [showKm(b.fromKm), showKm(b.toKm)];
  if (from !== to) return BAND_WORD[b.kind](from, to);
  return to === showKm(stopKm) ? BAND_AT_STOP[b.kind](to) : BAND_AT_KM[b.kind](to);
}
const BAND_AT_KM: Record<StripBand['kind'], (km: string) => string> = {
  likely: W.appAheadBandLikelyAtKm, possible: W.appAheadBandPossibleAtKm, thunder: W.appAheadBandThunderAtKm,
};
/** A band of no length lies where the day's ride stops (the rider is planned to be there when it comes). */
const BAND_AT_STOP: Record<StripBand['kind'], (km: string) => string> = {
  likely: W.appAheadBandLikelyAtStop, possible: W.appAheadBandPossibleAtStop, thunder: W.appAheadBandThunderAtStop,
};

/** Simple shapes, so an icon is told by its form as well as its place: a drop, a cup, a tent, a roof. */
const ICON_PATH: Record<StripIcon['kind'], string> = {
  water: 'M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z',
  food: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2.5 2.5 0 0 1 0 5h-2M4 21h14',
  sleep: 'M12 4 3 20h18zM12 4v16M9 20l3-6 3 6',
  cover: 'M3 12 12 4l9 8M6 10v10M18 10v10',
};

export function Glyph({ kind }: { kind: StripIcon['kind'] }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d={ICON_PATH[kind]} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function Bolt() {
  return (
    <svg class="ah-bolt" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M13 2 5 14h6l-1 8 8-12h-6z" fill="currentColor" />
    </svg>
  );
}

/** How far along the strip a kilometre lies, from 0 to 1. A strip of no length puts everything at its start. */
const along = (km: number, s: Pick<Strip, 'startKm' | 'endKm'>): number => {
  const span = s.endKm - s.startKm;
  if (!(span > 0) || !Number.isFinite(km)) return 0;
  return Math.max(0, Math.min(1, (km - s.startKm) / span));
};
const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;

/**
 * The icons sit on the line at their kilometre (the owner's device check of 5 November: "the icons should be on the line, spread
 * along the route"). Icons that would cover each other share one button at the first one's place, its icon and "+3" for the rest,
 * which opens all their cards. An icon at the day's stop keeps the end, and what lies within one icon of it joins it there, with a
 * sleep place shown first; so a group is never placed far from any icon in it.
 */
const ICON_PX = 46;
type Slot<T extends StripIcon> = { x: number; icons: T[] };
/** Shared with the stops on Trip's height profile (TRIP-STOPS): the same grouping, along a strip of the whole route. */
export function slotsOf<T extends StripIcon>(icons: T[], s: Pick<Strip, 'startKm' | 'endKm'>, trackPx: number): Slot<T>[] {
  const gap = ICON_PX / Math.max(trackPx, ICON_PX);
  const end = icons.some((i) => along(i.km, s) >= 1) ? 1 - gap : 2;
  const slots: Slot<T>[] = [];
  const last: T[] = [];
  for (const icon of icons) {
    const x = along(icon.km, s);
    const prev = slots[slots.length - 1];
    if (x > end) last.push(icon);
    else if (prev && x - prev.x < gap) prev.icons.push(icon);
    else slots.push({ x, icons: [icon] });
  }
  if (last.length) slots.push({ x: 1, icons: last.sort((a, b) => along(b.km, s) - along(a.km, s) || +(b.kind === 'sleep') - +(a.kind === 'sleep')) });
  return slots;
}

const tenth = (km: number): number => Math.round(km * 10) / 10;

/**
 * On a computer: a ruler along the strip's own kilometres. The arrow keys move a point along it, Enter (or the button, for a mouse)
 * sets the position there; hovering shows the kilometre under the pointer. It is the same kilometre axis as the bands and icons.
 */
function Ruler({ strip, onSet }: { strip: Strip; onSet: (km: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const first = Number.isFinite(strip.startKm) ? strip.startKm : 0;
  const last = Number.isFinite(strip.endKm) ? Math.max(first, strip.endKm) : first;
  const km = picked ?? first;
  const clamp = (x: number): number => tenth(Math.max(first, Math.min(last, x)));
  const move = (to: number): void => setPicked(clamp(to));
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const big = e.shiftKey ? 10 : 1;
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? km + big
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? km - big
        : e.key === 'PageUp' ? km + 10 : e.key === 'PageDown' ? km - 10
          : e.key === 'Home' ? first : e.key === 'End' ? last : null;
    if (to !== null) { e.preventDefault(); move(to); return; }
    if (e.key === 'Enter') { e.preventDefault(); onSet(km); }
  };
  const at = (e: MouseEvent): number => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return clamp(first + (box.width > 0 ? Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) : 0) * (last - first));
  };
  const shown = hover ?? km;
  return (
    <div class="ah-ruler">
      <div
        class="ah-ruler-bar" role="slider" tabIndex={0} aria-label={W.appWideStripSlider} aria-describedby="ah-ruler-hint"
        aria-valuemin={first} aria-valuemax={last} aria-valuenow={km} aria-valuetext={W.appWideStripSliderValue(showKm(km), showKm(last))}
        onKeyDown={onKeyDown} onClick={(e) => move(at(e))} onMouseMove={(e) => setHover(at(e))} onMouseLeave={() => setHover(null)}
        data-ruler-km={String(km)}
      >
        <span class="ah-ruler-tick" style={{ left: pct(along(km, strip)) }} />
        {hover !== null ? <span class="ah-ruler-hover" style={{ left: pct(along(hover, strip)) }} /> : null}
      </div>
      <p class="ah-ruler-read">
        <span data-ruler-text>{W.appWideStripAt(showKm(shown))}</span>
        <button type="button" class="btn" onClick={() => onSet(km)}>{W.appWideStripSet(showKm(km))}</button>
      </p>
      <p class="visually-hidden" id="ah-ruler-hint">{W.appWideStripSliderHint}</p>
    </div>
  );
}

export function RouteStrip({ strip, bike, onOpen, onSetPosition, stopsLater = false }: {
  strip: Strip; bike: BikeRecord | null; onOpen: (card: CardName) => void;
  /** Given only on a computer: the ruler, with the keys along the strip (spec 3.8). */
  onSetPosition?: (km: number) => void;
  /** Before Get ready offline: the line and the bike, no icons, and why (AH-BEFORE-READY). */
  stopsLater?: boolean;
}) {
  // The track's width decides which icons share a row; before it is measured, a phone's width is assumed.
  const track = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(230);
  useLayoutEffect(() => {
    const measure = (): void => { const w = track.current?.clientWidth ?? 0; if (w > 0) setTrackPx(w); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const slots = stopsLater ? [] : slotsOf(strip.icons, strip, trackPx);
  return (
    <section class="ah-strip" aria-label={W.appAheadStripLabel(strip.label, showKm(strip.startKm), showKm(strip.endKm))} data-strip>
      <div class="ah-strip-head">
        <span class="ah-strip-label">{strip.label}</span>
        <span class="ah-strip-end">{strip.endText}</span>
      </div>
      <div class="ah-strip-body">
        <BikeMarker bike={bike} />
        <div class="ah-strip-track" ref={track}>
          <div class="ah-strip-line" />
          <div class="ah-strip-bands">
            {strip.bands.map((b, i) => (
              <button
                key={i} type="button" class={`ah-band ah-band-${b.kind}`} data-kind={b.kind}
                style={{ left: pct(along(b.fromKm, strip)), '--band-w': pct(Math.max(0, along(b.toKm, strip) - along(b.fromKm, strip))) }}
                aria-label={bandWords(b, strip.endKm)} onClick={() => onOpen(b.opens)}
              >
                <span class="ah-band-bar" aria-hidden="true" />
                {b.kind === 'thunder' ? <Bolt /> : null}
              </button>
            ))}
          </div>
          <div class="ah-strip-icons ah-strip-line-row">
            {slots.map(({ x, icons: [one, ...rest] }, i) => {
              const word = (icon: StripIcon): string => ICON_WORD[icon.kind](showKm(icon.km));
              const more = rest.length ? W.appAheadIconMore(rest.length) : '';
              return (
                <button
                  key={i} type="button" class={`ah-icon ah-icon-${one!.kind}${more && ' ah-icon-more'}`} data-km={one!.km}
                  data-kms={more ? [one!, ...rest].map((icon) => icon.km).join(' ') : undefined} style={{ left: pct(x) }}
                  aria-label={more ? `${word(one!)}, ${more}: ${rest.map(word).join(', ')}` : word(one!)}
                  onClick={() => { for (const name of new Set([one!, ...rest].map((icon) => icon.opens as CardName))) onOpen(name); }}
                >
                  <Glyph kind={one!.kind} />
                  {more ? <span class="ah-icon-n">{more}</span> : null}
                </button>
              );
            })}
          </div>
          {onSetPosition ? <Ruler strip={strip} onSet={onSetPosition} /> : null}
        </div>
      </div>
      {strip.bands.length > 0 ? <p class="muted ah-strip-key">{W.appAheadStripKey}</p> : null}
      {stopsLater ? <p class="muted ah-strip-key">{W.appAheadStopsAfter}</p> : null}
    </section>
  );
}

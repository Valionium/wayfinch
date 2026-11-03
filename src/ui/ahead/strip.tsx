// The mini route strip (spec section 3.2): the day's ride from its start to the day's stop, with the rider's bike at the left end
// facing the way of travel, the places at their kilometre and the rain bands. Bands are solid, hatched, or red with a bolt, and
// say so in words: colour is never the only signal. Tapping an icon or a band opens its card. Where things sit is drawing only:
// every kilometre and word comes from the screen.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { CardName, Strip, StripBand, StripIcon } from '../../core/screen/screen.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { BikeMarker } from '../bike/marker.tsx';

const ICON_WORD: Record<StripIcon['kind'], (km: string) => string> = {
  water: W.appAheadIconWater, food: W.appAheadIconFood, sleep: W.appAheadIconSleep, cover: W.appAheadIconCover,
};
const BAND_WORD: Record<StripBand['kind'], (from: string, to: string) => string> = {
  likely: W.appAheadBandLikely, possible: W.appAheadBandPossible, thunder: W.appAheadBandThunder,
};

/** Simple shapes, so an icon is told by its form as well as its place: a drop, a cup, a tent, a roof. */
const ICON_PATH: Record<StripIcon['kind'], string> = {
  water: 'M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z',
  food: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h2a2.5 2.5 0 0 1 0 5h-2M4 21h14',
  sleep: 'M12 4 3 20h18zM12 4v16M9 20l3-6 3 6',
  cover: 'M3 12 12 4l9 8M6 10v10M18 10v10',
};

function Glyph({ kind }: { kind: StripIcon['kind'] }) {
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
const along = (km: number, s: Strip): number => {
  const span = s.endKm - s.startKm;
  if (!(span > 0) || !Number.isFinite(km)) return 0;
  return Math.max(0, Math.min(1, (km - s.startKm) / span));
};
const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;

/**
 * Icons close together share a column at the first one's place, so none covers another and the strip keeps two rows at most:
 * the first icon on top; below it the second, or, with more, one button for the rest ("+3"), which opens their cards.
 */
const ICON_PX = 46;
type Slot = { x: number; row: 0 | 1; icons: StripIcon[] };
function slotsOf(icons: StripIcon[], s: Strip, trackPx: number): Slot[] {
  const gap = ICON_PX / Math.max(trackPx, ICON_PX);
  const groups: { x: number; icons: StripIcon[] }[] = [];
  for (const icon of icons) {
    const x = along(icon.km, s);
    const last = groups[groups.length - 1];
    if (last && x - last.x < gap) last.icons.push(icon);
    else groups.push({ x, icons: [icon] });
  }
  return groups.flatMap((g): Slot[] => {
    const [first, ...rest] = g.icons;
    const top: Slot = { x: g.x, row: 0, icons: [first!] };
    return rest.length === 0 ? [top] : [top, { x: g.x, row: 1, icons: rest }];
  });
}

export function RouteStrip({ strip, bike, onOpen }: { strip: Strip; bike: BikeRecord | null; onOpen: (card: CardName) => void }) {
  // The track's width decides which icons share a row; before it is measured, a phone's width is assumed.
  const track = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(230);
  useLayoutEffect(() => {
    const measure = (): void => { const w = track.current?.clientWidth ?? 0; if (w > 0) setTrackPx(w); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const slots = slotsOf(strip.icons, strip, trackPx);
  const rowCount = slots.some((x) => x.row === 1) ? 2 : 1;
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
                key={`b${i}`} type="button" class={`ah-band ah-band-${b.kind}`} data-kind={b.kind}
                style={{ left: pct(along(b.fromKm, strip)), width: pct(Math.max(0, along(b.toKm, strip) - along(b.fromKm, strip))) }}
                aria-label={BAND_WORD[b.kind](showKm(b.fromKm), showKm(b.toKm))} onClick={() => onOpen(b.opens)}
              >
                {b.kind === 'thunder' ? <Bolt /> : null}
              </button>
            ))}
          </div>
          <div class="ah-strip-icons" style={{ height: `${rowCount * ICON_PX}px` }}>
            {slots.map((slot, i) => {
              const style = { left: pct(slot.x), top: `${slot.row * ICON_PX}px` };
              const one = slot.icons.length === 1 ? slot.icons[0]! : null;
              return one ? (
                <button
                  key={`i${i}`} type="button" class={`ah-icon ah-icon-${one.kind}`} data-km={String(one.km)} style={style}
                  aria-label={ICON_WORD[one.kind](showKm(one.km))} onClick={() => onOpen(one.opens as CardName)}
                >
                  <Glyph kind={one.kind} />
                </button>
              ) : (
                <button
                  key={`i${i}`} type="button" class="ah-icon ah-icon-more" data-kms={slot.icons.map((x) => x.km).join(' ')} style={style}
                  aria-label={`${W.appAheadIconMore(slot.icons.length)}: ${slot.icons.map((x) => ICON_WORD[x.kind](showKm(x.km))).join(', ')}`}
                  onClick={() => { for (const name of new Set(slot.icons.map((x) => x.opens as CardName))) onOpen(name); }}
                >
                  {W.appAheadIconMore(slot.icons.length)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {strip.bands.length > 0 ? <p class="muted ah-strip-key">{W.appAheadStripKey}</p> : null}
    </section>
  );
}

// The bike view (design of 9 November 2026; the owner's answers of 9 November): what a card's parts are and where they sit on a bike,
// over the step view (a bottom sheet on a phone, a side panel from 720 px). It is the parts guide (care pictures design 4) grown into one
// view: a typical bike of the rider's type, greyed, the card's parts standing out in ink and named outside the drawing with leader lines,
// the tapped one in blaze with an arrow; the card's parts as buttons below (the drawing's accessible version) and the tapped part's entry.
// Zoomed in on the card's parts when they sit close together; the rider zooms by hand too (pinch, or the buttons). Its own chunk, loaded
// from the step view, never with the first screen or Bike care's own chunk. Opening adds one history entry, so the phone's back gesture
// closes the view and leaves the step view open; Escape does the same. Its words come with loadWords, before it opens.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bikeArt } from '../../core/bike/art.ts';
import type { P } from '../../core/bike/art.ts';
import { PART_PLACES } from '../../core/bike/part-points.ts';
import type { Motor } from '../../core/bike/normalise.ts';
import type { BikeType } from '../../core/bike/spec.ts';
import type { PictureDetails } from '../../core/care/pictures.ts';
import type { Conditions } from '../../core/care/types.ts';
import { guidePictures, partById } from '../../core/parts/guide.ts';
import type { PartId } from '../../core/parts/guide.ts';
import { labelSize, labelWidth } from '../../core/parts/labels.ts';
import { cardSpec, inBox, inkMarkup, MAX_ZOOM, openingFocus, outline, partSpot, placeView, viewMarkup, wholeBox, zoomBox } from '../../core/parts/view.ts';
import type { Spot } from '../../core/parts/view.ts';
import { WB } from '../../core/wording/en-bike.ts';
import { PART_SHORT } from '../../core/wording/en-part-names.ts';
import { partsWordsFrom, PG, TAG_WORDS } from '../../core/wording/en-parts.ts';
import type { PartsWordsFile } from '../../core/wording/en-parts.ts';
import { loadPictures, Picture, pictureLoaded } from './picture.tsx';
import './bike-view.css';

// The parts' and close-ups' words: a data file of its own, fetched once (precached by the offline worker like every build file).
const WORDS_URL = Object.values(import.meta.glob('../../core/wording/en-parts.json', { query: '?url', import: 'default', eager: true }))[0]!;
let words: PartsWordsFile | null = null;

/** Loads the guide's words; false where they could not be read (offline before they were cached), and the step's text stays as it is. */
export async function loadWords(): Promise<boolean> {
  if (words) return true;
  try {
    const res = await fetch(WORDS_URL);
    words = res.ok ? partsWordsFrom(JSON.parse(await res.text()), PART_PLACES) : null;
  } catch { words = null; }
  return words !== null;
}

const TYPE_WORD: Record<BikeType, string> = {
  road: WB.bikeTypeRoad, gravel: WB.bikeTypeGravel, touring: WB.bikeTypeTouring, trekking: WB.bikeTypeTrekking, mtb: WB.bikeTypeMtb, fat: WB.bikeTypeFat,
};

/** The card the view is for: its id, name, conditions (its variant: rim brakes, hub gears…), parts in its order, and what to bring. */
export type ViewCard = { id: string; name: string; applies: Conditions; parts: readonly PartId[]; tools: string };
/**
 * `type`: the rider's bike type, or null (the typical gravel bike); `details`: what orders a part's close-ups (the guide's own rule);
 * `addHref`: where "Add your bike" goes, or null where the rider has a bike or chose none.
 */
export type ViewProps = {
  card: ViewCard; tapped: PartId | null; type: BikeType | null; motor?: Motor | null; details: PictureDetails; addHref: string | null; onClose: () => void;
};

const r2 = (n: number): number => Math.round(n * 100) / 100;
const ARROW = 7;

/** The arrow from the tapped part's label to the part: its line stops where the filled head starts, the head's tip on the part. */
function Arrow({ from, to }: { from: P; to: P }) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const u: P = [(to[0] - from[0]) / d, (to[1] - from[1]) / d];
  const base: P = [to[0] - u[0] * ARROW, to[1] - u[1] * ARROW];
  const n: P = [-u[1] * 3.4, u[0] * 3.4];
  return (
    <g class="bv-arrow">
      <line x1={r2(from[0])} y1={r2(from[1])} x2={r2(base[0])} y2={r2(base[1])} />
      <polygon points={`${r2(to[0])},${r2(to[1])} ${r2(base[0] + n[0])},${r2(base[1] + n[1])} ${r2(base[0] - n[0])},${r2(base[1] - n[1])}`} />
    </g>
  );
}

/** The layer over the greyed drawing: each card part in ink, the tapped one in blaze over a soft halo. Markup, in drawing units. */
function layerMarkup(svg: string, spots: readonly [PartId, Spot][], tapped: PartId | null, k: number): string {
  let clip = '';
  const one = (s: Spot, cls: string, wider: number): string => {
    let m = '';
    if (s.ink.length) {
      let ink = inkMarkup(svg, s.ink, cls, s.barOnly);
      if (wider) ink = ink.replace(/stroke-width="([\d.]+)"/g, (_, w: string) => `stroke-width="${r2(Number(w) + wider)}"`);
      m += s.clip ? `<g clip-path="url(#bv-wheel)">${ink}</g>` : ink;
      if (s.clip && !clip) clip = `<clipPath id="bv-wheel"><circle cx="${s.clip.c[0]}" cy="${s.clip.c[1]}" r="${s.clip.r}"/></clipPath>`;
    }
    if (s.piece) m += `<path class="${cls}${s.piece.dashed ? ' bv-dash' : ''}" d="${s.piece.d}" stroke-width="${r2(s.piece.w + wider)}"/>`;
    if (s.ring) m += `<circle class="${cls} bv-ring" cx="${s.at[0]}" cy="${s.at[1]}" r="${r2((2.6 + wider / 2) * k)}"/>`;
    return m;
  };
  let out = '';
  for (const [id, s] of spots) if (id !== tapped) out += one(s, 'bv-ink', 0);
  const hot = spots.find(([id]) => id === tapped);
  if (hot) out += one(hot[1], 'bv-halo', 5) + one(hot[1], 'bv-hot', 0.6);
  return `${clip ? `<defs>${clip}</defs>` : ''}${out}`;
}

type Zoom = { z: number; centre: P };

/** The drawing with its labels, measured to its box's width, and the zoom buttons. */
function Drawing({ card, tapped, type, motor, onTap }: { card: ViewCard; tapped: PartId | null; type: BikeType | null; motor: Motor | null; onTap: (id: PartId) => void }) {
  const spec = cardSpec(type, card.applies, card.parts, tapped, motor);
  const { svg, anchors } = bikeArt(spec, null, { idPrefix: 'bv' });
  const k = anchors.scale / 0.11;
  const spots = card.parts.flatMap((id): [PartId, Spot][] => { const s = partSpot(id, spec, anchors); return s ? [[id, s]] : []; });
  if (tapped && !card.parts.includes(tapped)) { const s = partSpot(tapped, spec, anchors); if (s) spots.push([tapped, s]); }
  const whole = wholeBox(anchors);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [zoom, setZoom] = useState<Zoom>(() => openingFocus(whole, spots.filter(([id]) => card.parts.includes(id))));
  const view = zoomBox(whole, zoom.z, zoom.centre);
  const hot = spots.find(([id]) => id === tapped)?.[1];
  // A tapped part out of view brings the view to it.
  useEffect(() => { if (hot && !inBox(view, hot.at, 4)) setZoom((z) => ({ ...z, centre: hot.at })); }, [tapped]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = (): void => { const w = Math.floor(el.getBoundingClientRect().width); if (w > 0) setWidth(w); };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = spots.filter(([, s]) => inBox(view, s.at, 1));
  const size = labelSize(width);
  const side = (s: Spot): string => (s.side === 'other' ? PG.otherSide : s.side === 'left' ? PG.leftSide : '');
  // While fingers move the drawing the labels step aside (placing them is the costly part) and the canvas keeps its size; they are
  // placed again as the fingers lift.
  const [moving, setMoving] = useState(false);
  const last = useRef<ReturnType<typeof placeView> | null>(null);
  const placed = moving && last.current
    ? { ...last.current, layout: { ...last.current.layout, labels: [] }, scale: (width - 2 * last.current.inset) / view.w }
    : placeView(shown.map(([id, s]) => ({ id, at: s.at, w: labelWidth(PART_SHORT[id], side(s) ? `(${side(s)})` : '', size) })), view, width, outline(svg, anchors));
  if (!moving) last.current = placed;
  const { layout, inset, areaH, scale } = placed;

  // Pinch and drag (pointers), and the wheel with Ctrl (a trackpad's pinch): the zoom; a drag moves a zoomed view.
  const pointers = useRef(new Map<number, P>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const centreNow: P = [view.x + view.w / 2, view.y + view.h / 2];
  const setZ = (z: number, centre: P): void => setZoom({ z: Math.min(MAX_ZOOM, Math.max(1, r2(z))), centre });
  const onDown = (e: PointerEvent): void => {
    if ((e.target as Element | null)?.closest?.('.bv-label, .bv-tap')) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    // Held until the pointer lifts, wherever it is then (review of PR 107, I2).
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not a live pointer (a synthetic event) */ }
    if (pointers.current.size === 2 || zoom.z > 1) setMoving(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [P, P];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: zoom.z };
    }
  };
  const onMove = (e: PointerEvent): void => {
    const was = pointers.current.get(e.pointerId);
    if (!was) return;
    // a mouse with no button held has let go somewhere the drawing did not hear
    if (e.pointerType === 'mouse' && e.buttons === 0) { onUp(e); return; }
    const now: P = [e.clientX, e.clientY];
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [P, P];
      setZ(pinch.current.z * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.current.d), centreNow);
    } else if (pointers.current.size === 1 && zoom.z > 1) {
      setZoom({ z: zoom.z, centre: [centreNow[0] - (now[0] - was[0]) / scale, centreNow[1] - (now[1] - was[1]) / scale] });
    }
  };
  const onUp = (e: PointerEvent): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setMoving(false);
  };
  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZ(zoom.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), centreNow);
  };
  // Zooming in by a button goes towards the tapped part.
  const zoomTo = (z: number): void => setZ(z, hot && z > zoom.z ? hot.at : centreNow);

  const inner = viewMarkup(svg).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const layer = layerMarkup(svg, spots, tapped, k);
  const named = spots.filter(([id]) => card.parts.includes(id)).map(([id]) => PART_SHORT[id].toLowerCase());
  const label = PG.drawing(TYPE_WORD[spec.type.value], named.join(', '), tapped && hot ? PART_SHORT[tapped].toLowerCase() : null, zoom.z > 1);
  const H = layout.height;
  const byId = new Map(layout.labels.map((l) => [l.id, l]));
  const hotLabel = tapped ? byId.get(tapped) : undefined;
  return (
    <div class="bv-figure">
      <div ref={box} class={`bv-canvas${zoom.z > 1 ? ' bv-zoomed' : ''}${moving ? ' bv-moving' : ''}`} role="img" aria-label={label}
        onPointerDown={(e) => onDown(e as unknown as PointerEvent)} onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
        onPointerUp={(e) => onUp(e as unknown as PointerEvent)} onPointerCancel={(e) => onUp(e as unknown as PointerEvent)}
        onLostPointerCapture={(e) => onUp(e as unknown as PointerEvent)}
        onWheel={(e) => onWheel(e as unknown as WheelEvent)}>
        <svg class="bv-svg" viewBox={`0 0 ${width} ${H}`} width={width} height={H} aria-hidden="true" focusable="false">
          <svg class="bv-art" x={inset} y={layout.top} width={width - 2 * inset} height={areaH} viewBox={`${r2(view.x)} ${r2(view.y)} ${r2(view.w)} ${r2(view.h)}`}>
            <g class="bv-bike" dangerouslySetInnerHTML={{ __html: inner }} />
            <g class="bv-layer" dangerouslySetInnerHTML={{ __html: layer }} />
          </svg>
          <g class="bv-leaders">
            {/* one leader for the parts at one point, whose labels stack; the tapped part's is its arrow */}
            {layout.labels.filter((l, i, all) => all.findIndex((m) => m.to[0] === l.to[0] && m.to[1] === l.to[1]) === i).map((l) => (
              hotLabel && hotLabel.to[0] === l.to[0] && hotLabel.to[1] === l.to[1] ? null : (
                <g key={l.id}><line class="bv-leader" x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} /><circle class="bv-dot" cx={l.to[0]} cy={l.to[1]} r="2.2" /></g>
              )))}
            {hotLabel ? <Arrow from={hotLabel.from} to={hotLabel.to} /> : null}
          </g>
          {/* The 44 px tap areas, all under the labels: a tap on a pill is always that pill's, the larger area only fills the gaps. */}
          <g class="bv-taps">
            {layout.labels.map((l) => {
              const b = l.box;
              const pad = Math.max(0, (44 - b.h) / 2);
              return <rect key={l.id} class="bv-tap" data-part={l.id} x={b.x - 2} y={b.y - pad} width={b.w + 4} height={b.h + 2 * pad} onClick={() => onTap(l.id as PartId)} />;
            })}
          </g>
          {layout.labels.map((l) => {
            const id = l.id as PartId;
            const s = shown.find(([x]) => x === id)![1];
            const b = l.box;
            return (
              <g key={id} class={`bv-label${id === tapped ? ' bv-label-hot' : ''}`} data-part={id} onClick={() => onTap(id)}>
                {/* the pill's whole box is its own (NEXT task 4, item 3): its round ends leave corners a neighbour's tap area took */}
                <rect class="bv-pill-box" x={b.x} y={b.y} width={b.w} height={b.h} />
                <rect class="bv-pill" x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} />
                <text x={b.x + 6} y={b.y + b.h / 2} dominant-baseline="central" style={{ fontSize: `${size}px` }}>
                  {PART_SHORT[id].toUpperCase()}{side(s) ? <tspan class="bv-side" dx="4" style={{ fontSize: `${size - 1}px` }}>({side(s)})</tspan> : null}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div class="bv-zoom" role="group" aria-label={PG.zoomGroup}>
        <button type="button" class="btn bv-zoom-btn" aria-label={PG.zoomOut} disabled={zoom.z <= 1} onClick={() => zoomTo(zoom.z / 1.5)}>−</button>
        <button type="button" class="btn bv-zoom-btn bv-whole" disabled={zoom.z <= 1} onClick={() => setZoom({ z: 1, centre: centreNow })}>{PG.whole}</button>
        <button type="button" class="btn bv-zoom-btn" aria-label={PG.zoomIn} disabled={zoom.z >= MAX_ZOOM} onClick={() => zoomTo(zoom.z * 1.5)}>+</button>
      </div>
    </div>
  );
}

/** One part's entry: its name, the bikes it is on, its close-ups, its words, and what not to mix it up with. */
function Entry({ id, details, back, onMixed, drawn, focus }: {
  id: PartId; details: PictureDetails; back: (() => void) | null; onMixed: (m: PartId) => void; drawn: boolean; focus: boolean;
}) {
  const entry = partById(id)!;
  const said = words!.parts[id];
  const pictures = guidePictures(entry, details);
  const head = useRef<HTMLHeadingElement>(null);
  const [, setReady] = useState(0);
  useEffect(() => {
    let alive = true;
    if (focus) head.current?.focus();
    void loadPictures(pictures).then(() => { if (alive) setReady((n) => n + 1); });
    return () => { alive = false; };
  }, [id]);
  const ready = pictures.filter(pictureLoaded);
  return (
    <section class="bv-entry" aria-labelledby="bv-entry-name">
      <div class="bv-entry-top">
        {back ? <button type="button" class="btn pg-back" onClick={back}>{PG.back}</button> : null}
        <h3 id="bv-entry-name" ref={head} tabIndex={-1} class="pg-name">{said.name}</h3>
      </div>
      {entry.tag ? <p class="muted pg-tag">{PG.onlyOn(TAG_WORDS[entry.tag])}</p> : null}
      {drawn ? null : <p class="muted pg-none">{PG.notDrawn}</p>}
      {ready.length > 0 ? (
        <div class={`care-pics${ready.length > 1 ? ' care-pics-two' : ''}`}>
          {ready.map((pic, k) => <Picture key={pic} id={pic} view={`pg${k}`} words={words!.pictures[pic]} />)}
        </div>
      ) : null}
      <p class="pg-text">{said.text}</p>
      {entry.mixed.length > 0 ? (
        <section class="pg-mixed">
          <h4>{PG.mixed}</h4>
          <ul>
            {entry.mixed.map((m) => (
              <li key={m}><button type="button" class="btn pg-swap" onClick={() => onMixed(m)}>{words!.parts[m].name}</button></li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export function BikeView({ card, tapped: first, type, motor = null, details, addHref, onClose }: ViewProps) {
  const box = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // The tapped part, and the parts opened from "Not to be mixed up with" after it (Back goes along them).
  const [trail, setTrail] = useState<PartId[]>(first ? [first] : []);
  const [said, setSaid] = useState('');
  const swapped = useRef(false);
  const tapped = trail[trail.length - 1] ?? null;

  const close = (fromBack: boolean): void => {
    if (!fromBack) history.back();
    const d = box.current;
    if (d?.open && typeof d.close === 'function') d.close();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const d = box.current!;
    if (typeof d.showModal === 'function') d.showModal();
    else d.open = true;
    history.pushState({ ...(history.state as object | null), carePart: first ?? 'card' }, '');
    // The back gesture: the view's own entry left, the step view's still there.
    const onPop = (): void => { if (!(history.state as { carePart?: string } | null)?.carePart) closeRef.current(true); };
    window.addEventListener('popstate', onPop);
    title.current?.focus();
    return () => { window.removeEventListener('popstate', onPop); };
  }, []);

  const tap = (id: PartId): void => {
    swapped.current = false;
    setTrail([id]);
    setSaid(`${PART_SHORT[id]}: ${words!.parts[id].text.split(/(?<=\.)\s/)[0]}`);
  };
  const swap = (next: PartId[]): void => { swapped.current = true; setTrail(next); };
  // Keys stay in the view: Escape closes it alone, and the arrows never turn the steps behind it.
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(false); }
  };
  const spec = cardSpec(type, card.applies, card.parts, tapped, motor);
  const drawn = tapped === null || partSpot(tapped, spec, bikeArt(spec, null, { idPrefix: 'bv' }).anchors) !== null;
  const typeWord = TYPE_WORD[type ?? 'gravel'];

  return (
    <dialog ref={box} class="part-sheet bike-view" aria-label={PG.dialog(card.name)} onKeyDown={(e) => onKey(e as unknown as KeyboardEvent)}
      onCancel={(e) => { e.preventDefault(); close(false); }}>
      <div class="pg-top">
        <div class="bv-heads">
          <span class="bv-kicker">{PG.kicker}</span>
          <h2 ref={title} tabIndex={-1} class="pg-name bv-title">{card.name}</h2>
        </div>
        <button type="button" class="care-steps-icon" aria-label={PG.close} onClick={() => close(false)}>✕</button>
      </div>
      <Drawing card={card} tapped={tapped} type={type} motor={motor} onTap={tap} />
      <p class="muted bv-about">
        {type ? PG.yourType(typeWord) : PG.typical(typeWord)}
        {addHref ? <> <a href={addHref}>{PG.add}</a> {PG.addAfter}</> : null}
      </p>
      <ul class="bv-parts" aria-label={PG.partsList}>
        {card.parts.map((id) => (
          <li key={id}><button type="button" class="btn bv-part" aria-pressed={id === tapped} onClick={() => tap(id)}>{PART_SHORT[id]}</button></li>
        ))}
      </ul>
      {tapped ? (
        <Entry key={tapped} id={tapped} details={details} drawn={drawn} focus={swapped.current}
          back={trail.length > 1 ? () => swap(trail.slice(0, -1)) : null} onMixed={(m) => swap([...trail, m])} />
      ) : <p class="bv-hint">{PG.tapHint}</p>}
      {card.tools ? <p class="muted bv-tools">{PG.tools}: {card.tools}</p> : null}
      <p class="visually-hidden" aria-live="polite">{said}</p>
    </dialog>
  );
}

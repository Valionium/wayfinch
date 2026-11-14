// How a bike is built (design of 14 November 2026, section 3): the bike drawn at the screen's width in its own look, the picked part in
// blaze over a soft halo with an arrow from its label, the other labelled parts named outside the bike with leader lines (the bike
// view's labels and outline, src/core/parts/view.ts), and zoom. The drawing is bikeArt's (or paintedArt's), never redrawn here; a tap
// anywhere on it picks the nearest part (pickAt). Pointer only: the parts list is the keyboard and screen-reader way in.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Anchors, P } from '../../core/bike/art.ts';
import { extrasMarkup, learnSpot, partsOf, pickAt, stageMarkup, stepOf, STEPS } from '../../core/parts/learn.ts';
import type { LearnBike, LearnId, LearnStep } from '../../core/parts/learn.ts';
import { labelSize, labelWidth } from '../../core/parts/labels.ts';
import { inBox, inkMarkup, MAX_ZOOM, outline, placeView, viewMarkup, wholeBox, zoomBox } from '../../core/parts/view.ts';
import type { Spot } from '../../core/parts/view.ts';
import { LN, nameOf } from '../../core/wording/en-learn.ts';

const r2 = (n: number): number => Math.round(n * 100) / 100;
const ARROW = 7;
/** How far from a part a tap still picks it, in px. */
const REACH = 24;

function Arrow({ from, to }: { from: P; to: P }) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const u: P = [(to[0] - from[0]) / d, (to[1] - from[1]) / d];
  const base: P = [to[0] - u[0] * ARROW, to[1] - u[1] * ARROW];
  const n: P = [-u[1] * 3.4, u[0] * 3.4];
  return (
    <g class="bl-arrow">
      <line x1={r2(from[0])} y1={r2(from[1])} x2={r2(base[0])} y2={r2(base[1])} />
      <polygon points={`${r2(to[0])},${r2(to[1])} ${r2(base[0] + n[0])},${r2(base[1] + n[1])} ${r2(base[0] - n[0])},${r2(base[1] - n[1])}`} />
    </g>
  );
}

/** The marked parts over the drawing, in drawing units: each in blaze over a soft halo. */
function layerMarkup(svg: string, marked: readonly Spot[], k: number): string {
  const one = (s: Spot, cls: string, wider: number): string => {
    let m = '';
    if (s.ink.length) {
      let ink = inkMarkup(svg, s.ink, cls, s.barOnly);
      if (wider) ink = ink.replace(/stroke-width="([\d.]+)"/g, (_, w: string) => `stroke-width="${r2(Number(w) + wider)}"`);
      m += ink;
    }
    if (s.piece) m += `<path class="${cls}${s.piece.dashed ? ' bl-dash' : ''}" d="${s.piece.d}" stroke-width="${r2(s.piece.w + wider)}"/>`;
    if (s.ring) m += `<circle class="${cls} bl-ring" cx="${s.at[0]}" cy="${s.at[1]}" r="${r2((2.6 + wider / 2) * k)}"/>`;
    return m;
  };
  return marked.map((s) => one(s, 'bl-halo', 5)).join('') + marked.map((s) => one(s, 'bl-hot', 0.6)).join('');
}

export type DrawingProps = {
  bike: LearnBike;
  /** The drawing's markup and anchors (bikeArt's, or paintedArt's for a bike with look extras). */
  art: { svg: string; anchors: Anchors };
  /** The one picked part (its label has the arrow), and the parts that stand out with it. */
  picked: LearnId | null; marked: readonly LearnId[];
  /** The parts named on the drawing. */
  labelled: readonly LearnId[];
  /** The drawing's name for screen readers. */
  name: string;
  onPick: (id: LearnId) => void;
  /** Build-up (design 4): the bike as built up to this step, the later steps' parts left out of the drawing and of a tap. */
  upto?: LearnStep;
};

type Zoom = { z: number; centre: P };

export function LearnDrawing({ bike, art, picked, marked, labelled, name, onPick, upto = 'ebike' }: DrawingProps) {
  const { anchors } = art;
  const svg = upto === 'ebike' ? art.svg : stageMarkup(art.svg, upto);
  const built = (id: LearnId): boolean => STEPS.indexOf(stepOf(id)) <= STEPS.indexOf(upto);
  const k = anchors.scale / 0.11;
  const extras = extrasMarkup(bike, anchors, upto);
  const drawn = svg + extras;
  const spots = partsOf(bike).filter(built).flatMap((id): [LearnId, Spot][] => { const s = learnSpot(bike, anchors, id); return s ? [[id, s]] : []; });
  const spotOf = (id: LearnId): Spot | undefined => spots.find(([x]) => x === id)?.[1];
  const whole = wholeBox(anchors);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [zoom, setZoom] = useState<Zoom>({ z: 1, centre: [whole.x + whole.w / 2, whole.y + whole.h / 2] });
  const view = zoomBox(whole, zoom.z, zoom.centre);
  const hot = picked ? spotOf(picked) : undefined;
  // A picked part out of view brings the view to it.
  useEffect(() => { if (hot && !inBox(view, hot.at, 4)) setZoom((z) => ({ ...z, centre: hot.at })); }, [picked, bike]);

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

  const size = labelSize(width);
  const named = [...new Set([...(picked ? [picked] : []), ...labelled])].flatMap((id): [LearnId, Spot][] => {
    const s = spotOf(id);
    return s && inBox(view, s.at, 1) ? [[id, s]] : [];
  });
  const [moving, setMoving] = useState(false);
  const last = useRef<ReturnType<typeof placeView> | null>(null);
  const placed = moving && last.current
    ? { ...last.current, layout: { ...last.current.layout, labels: [] }, scale: (width - 2 * last.current.inset) / view.w }
    : placeView(named.map(([id, s]) => ({ id, at: s.at, w: labelWidth(nameOf(id), '', size) })), view, width, outline(svg, anchors));
  if (!moving) last.current = placed;
  const { layout, inset, areaH, scale } = placed;

  // Pointers: a tap picks; a drag moves a zoomed view; two fingers pinch. The wheel with Ctrl (a trackpad's pinch) zooms.
  const pointers = useRef(new Map<number, P>());
  const start = useRef<{ at: P; far: boolean } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const centreNow: P = [view.x + view.w / 2, view.y + view.h / 2];
  const setZ = (z: number, centre: P): void => setZoom({ z: Math.min(MAX_ZOOM, Math.max(1, r2(z))), centre });
  const onDown = (e: PointerEvent): void => {
    if ((e.target as Element | null)?.closest?.('.bl-label, .bl-tap')) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ }
    start.current = pointers.current.size === 1 ? { at: [e.clientX, e.clientY], far: false } : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [P, P];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: zoom.z };
      setMoving(true);
    }
  };
  const onMove = (e: PointerEvent): void => {
    const was = pointers.current.get(e.pointerId);
    if (!was) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { onUp(e, false); return; }
    const now: P = [e.clientX, e.clientY];
    pointers.current.set(e.pointerId, now);
    if (start.current && Math.hypot(now[0] - start.current.at[0], now[1] - start.current.at[1]) > 8) start.current.far = true;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [P, P];
      setZ(pinch.current.z * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.current.d), centreNow);
    } else if (pointers.current.size === 1 && zoom.z > 1 && start.current?.far) {
      if (!moving) setMoving(true);
      setZoom({ z: zoom.z, centre: [centreNow[0] - (now[0] - was[0]) / scale, centreNow[1] - (now[1] - was[1]) / scale] });
    }
  };
  const onUp = (e: PointerEvent, tap: boolean): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setMoving(false);
    const s = start.current;
    start.current = null;
    if (!tap || !s || s.far) return;
    // a tap: the nearest part, in drawing units, within REACH px
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const at: P = [view.x + (e.clientX - rect.left - inset) / scale, view.y + (e.clientY - rect.top - layout.top) / scale];
    const id = pickAt(drawn, spots, at, REACH / scale);
    if (id) onPick(id);
  };
  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZ(zoom.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), centreNow);
  };
  const zoomTo = (z: number): void => setZ(z, hot && z > zoom.z ? hot.at : centreNow);

  const inner = viewMarkup(svg).replace(/^<svg[^>]*>|<\/svg>$/g, '') + extras;
  const layer = layerMarkup(svg, marked.flatMap((id) => { const s = spotOf(id); return s ? [s] : []; }), k);
  const H = layout.height;
  const hotLabel = picked ? layout.labels.find((l) => l.id === picked) : undefined;
  const aria = LN.drawing(name, picked ? nameOf(picked).toLowerCase() : null, zoom.z > 1);
  return (
    <div class="bl-figure">
      <div ref={box} class={`bl-canvas${zoom.z > 1 ? ' bl-zoomed' : ''}`} role="img" aria-label={aria} data-zoom={zoom.z}
        onPointerDown={(e) => onDown(e as unknown as PointerEvent)} onPointerMove={(e) => onMove(e as unknown as PointerEvent)}
        onPointerUp={(e) => onUp(e as unknown as PointerEvent, true)} onPointerCancel={(e) => onUp(e as unknown as PointerEvent, false)}
        onWheel={(e) => onWheel(e as unknown as WheelEvent)}>
        <svg class="bl-svg" viewBox={`0 0 ${width} ${H}`} width={width} height={H} aria-hidden="true" focusable="false">
          <svg class="bl-art" x={inset} y={layout.top} width={width - 2 * inset} height={areaH} viewBox={`${r2(view.x)} ${r2(view.y)} ${r2(view.w)} ${r2(view.h)}`}>
            <g class="bl-bike" dangerouslySetInnerHTML={{ __html: inner }} />
            <g class="bl-layer" dangerouslySetInnerHTML={{ __html: layer }} />
          </svg>
          <g class="bl-leaders">
            {layout.labels.filter((l, i, all) => all.findIndex((m) => m.to[0] === l.to[0] && m.to[1] === l.to[1]) === i).map((l) => (
              hotLabel && hotLabel.to[0] === l.to[0] && hotLabel.to[1] === l.to[1] ? null : (
                <g key={l.id} data-part={l.id}><line class="bl-leader" x1={l.from[0]} y1={l.from[1]} x2={l.to[0]} y2={l.to[1]} /><circle class="bl-dot" cx={l.to[0]} cy={l.to[1]} r="2.2" /></g>
              )))}
            {hotLabel ? <Arrow from={hotLabel.from} to={hotLabel.to} /> : null}
          </g>
          <g class="bl-taps">
            {layout.labels.map((l) => {
              const b = l.box;
              const pad = Math.max(0, (44 - b.h) / 2);
              return <rect key={l.id} class="bl-tap" data-part={l.id} x={b.x - 2} y={b.y - pad} width={b.w + 4} height={b.h + 2 * pad} onClick={() => onPick(l.id as LearnId)} />;
            })}
          </g>
          {layout.labels.map((l) => {
            const id = l.id as LearnId;
            const b = l.box;
            return (
              <g key={id} class={`bl-label${id === picked ? ' bl-label-hot' : ''}`} data-part={id} onClick={() => onPick(id)}>
                <rect class="bl-pill" x={b.x} y={b.y} width={b.w} height={b.h} rx={b.h / 2} />
                <text x={b.x + 6} y={b.y + b.h / 2} dominant-baseline="central" style={{ fontSize: `${size}px` }}>{nameOf(id).toUpperCase()}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div class="bl-zoom" role="group" aria-label={LN.zoomGroup}>
        <button type="button" class="btn bl-zoom-btn" aria-label={LN.zoomOut} disabled={zoom.z <= 1} onClick={() => zoomTo(zoom.z / 1.5)}>−</button>
        <button type="button" class="btn bl-zoom-btn bl-whole" disabled={zoom.z <= 1} onClick={() => setZoom({ z: 1, centre: centreNow })}>{LN.whole}</button>
        <button type="button" class="btn bl-zoom-btn" aria-label={LN.zoomIn} disabled={zoom.z >= MAX_ZOOM} onClick={() => zoomTo(zoom.z * 1.5)}>+</button>
      </div>
    </div>
  );
}

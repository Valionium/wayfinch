// The bike view (design of 9 November 2026, sections 2.4, 3 and 5; the owner's answers of 9 November): which bike is drawn, what of it
// stands out for a card, and the part of the drawing in view. Pure: the drawing is bikeArt's, untouched; this reads its markup and anchors.
// Owner's answer 1: the view is never personalised. It draws a typical bike of the rider's type (gravel, road, touring, trekking, mountain
// bike, fat), never their colours or other details, borrowing what the card talks about (a rim-brake card draws rim brakes).
import type { Anchors, P } from '../bike/art.ts';
import { bikeArt } from '../bike/art.ts';
import { drawnFor, partPoint } from '../bike/part-points.ts';
import type { Motor } from '../bike/normalise.ts';
import type { BikeSpec, BikeType, Mark } from '../bike/spec.ts';
import { resolveBikeSpec } from '../bike/spec.ts';
import type { Style } from '../bike/templates.ts';
import { framePoints } from '../bike/templates.ts';
import type { Conditions } from '../care/types.ts';
import type { PartId } from './guide.ts';
import { labelHeight, labelSize, placeLabels, segmentsCross } from './labels.ts';
import type { Layout, Pt } from './labels.ts';

type Typical = { rim: number; mm: number; style: Style; bars: 'drop' | 'flat'; fork: 'rigid' | 'suspension' };
/** A typical bike of each type: drawing values only, with disc brakes and derailleur gears as most new bikes have. */
const TYPICAL: Record<BikeType, Typical> = {
  road: { rim: 622, mm: 28, style: 'diamond-sloping', bars: 'drop', fork: 'rigid' },
  gravel: { rim: 622, mm: 40, style: 'diamond-sloping', bars: 'drop', fork: 'rigid' },
  touring: { rim: 622, mm: 42, style: 'diamond-level', bars: 'drop', fork: 'rigid' },
  trekking: { rim: 622, mm: 42, style: 'trapeze', bars: 'flat', fork: 'rigid' },
  mtb: { rim: 622, mm: 60, style: 'diamond-sloping', bars: 'flat', fork: 'suspension' },
  fat: { rim: 559, mm: 100, style: 'diamond-sloping', bars: 'flat', fork: 'rigid' },
};

/**
 * The typical bike of a type (gravel where none is known): no colour, size M, every detail open to what a card needs. `motor`: where the
 * rider's e-bike has its motor, when they said (a hub); else at the cranks.
 */
export function typeSpec(type: BikeType | null, motor: Motor | null = null): BikeSpec {
  const t = TYPICAL[type ?? 'gravel'];
  const base = resolveBikeSpec(null, null);
  const d = <T>(value: T, mark: Mark = 'default') => ({ value, mark });
  return {
    ...base,
    type: d(type ?? 'gravel', type ? 'guessed' : 'default'),
    rimMm: d(t.rim), frontMm: d(t.mm), rearMm: d(t.mm), style: d(t.style), size: d('M'),
    points: d(framePoints(t.style, 'M')), bars: d(t.bars), fork: d(t.fork), brakes: d('disc'), drive: d('derailleur'),
    rack: d(false), ebike: d(false), motor: d(motor ?? 'cranks', motor ? 'entered' : 'default'), colour: d(null),
  };
}

const only = <T extends string>(list: readonly T[] | undefined, set: readonly T[]): boolean => !!list && list.length > 0 && list.every((v) => set.includes(v));

/** The variant a card names (its conditions), drawn over the type: a rim-brake card draws rim brakes, a hub-gear card a hub gear. */
function withConditions(spec: BikeSpec, a: Conditions): BikeSpec {
  let out = spec;
  if (only(a.brakes, ['rim'])) out = { ...out, brakes: { value: 'rim', mark: 'guessed' } };
  else if (only(a.brakes, ['cable-disc', 'hydraulic-disc'])) out = { ...out, brakes: { value: 'disc', mark: 'guessed' } };
  if (only(a.gears, ['hub'])) out = { ...out, drive: { value: 'hub', mark: 'guessed' } };
  if (only(a.gears, ['derailleur'])) out = { ...out, drive: { value: 'derailleur', mark: 'guessed' } };
  if (only(a.drive, ['belt'])) out = { ...out, drive: { value: 'belt', mark: 'guessed' } };
  if (only(a.suspension, ['front', 'full'])) out = { ...out, fork: { value: 'suspension', mark: 'guessed' } };
  if (only(a.ebike, ['yes'])) out = { ...out, ebike: { value: true, mark: 'guessed' } };
  return out;
}

const shows = (spec: BikeSpec, id: PartId): boolean => partPoint(spec, bikeArt(spec, null).anchors, id) !== null;

/**
 * The bike to draw for a card (design 5): the type's typical bike with the card's own variant, then each of the card's parts in turn
 * borrowed where the drawing lacks it, as long as no part before it is lost (a card naming rim brakes first, then disc brakes, draws rim
 * brakes). With `tapped` not on that bike, the bike borrows it too, so the tapped part always shows where any bike has it.
 */
export function cardSpec(type: BikeType | null, applies: Conditions, parts: readonly PartId[], tapped: PartId | null = null, motor: Motor | null = null): BikeSpec {
  let spec = withConditions(typeSpec(type, motor), applies);
  const kept: PartId[] = [];
  for (const id of parts) {
    if (!shows(spec, id)) {
      const next = drawnFor(spec, id);
      if (next && kept.every((k) => shows(next, k))) spec = next;
    }
    if (shows(spec, id)) kept.push(id);
  }
  if (tapped && !shows(spec, tapped)) spec = drawnFor(spec, tapped) ?? spec;
  return spec;
}

// ---- what stands out ----

/**
 * How a part stands out on the drawing (design 3): `ink`, the drawing's own elements of these classes drawn again (only those inside
 * `clip` when set, the one wheel of a pair); `piece`, a short path the layer draws itself where the drawing draws the part as part of
 * another (the stem, a valve's stub, the gear cable); `ring`, a ring at the point where the drawing has no element for it. `at` is
 * where the label's leader ends. `side`: the part is on the bike's far side ('other') or its left ('left'), as the label then says.
 */
export type Spot = {
  at: P; ink: readonly string[]; clip: { c: P; r: number } | null; barOnly: boolean;
  piece: { d: string; w: number; dashed: boolean } | null; ring: boolean; side: 'other' | 'left' | null;
};

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: P): P => mul(a, 1 / (Math.hypot(a[0], a[1]) || 1));
const r2 = (n: number): number => Math.round(n * 100) / 100;
const pt = (p: P): string => `${r2(p[0])} ${r2(p[1])}`;

/** The part's spot on bikeArt's drawing of `spec`, or null where that drawing does not show it (draw `cardSpec` with it tapped). */
export function partSpot(id: PartId, spec: BikeSpec, anchors: Anchors): Spot | null {
  const at = partPoint(spec, anchors, id);
  if (!at) return null;
  const k = anchors.scale / 0.11;
  const { bb, rear, headTop, headBottom, bar: clamp } = anchors.points;
  const fw = anchors.wheels.front;
  const front: P = [fw.cx, fw.cy];
  const wheel = { c: front, r: fw.r + 1.5 };
  const s: Spot = { at, ink: [], clip: null, barOnly: false, piece: null, ring: false, side: null };
  const ink = (cls: string[], clip = false): Spot => ({ ...s, ink: cls, clip: clip ? wheel : null });
  const ring = (side: Spot['side'] = null): Spot => ({ ...s, ring: true, side });
  const rimR = (spec.rimMm.value / 2) * anchors.scale;
  switch (id) {
    case 'frame': return ink(['bk-frame', 'bk-stays']);
    case 'fork': return ink(['bk-fork']);
    case 'seatpost': return ink(['bk-post']);
    case 'handlebar': return { ...ink(['bk-bar', 'bk-hood', 'bk-grip']), barOnly: true };
    case 'stem': {
      const steerTop = add(headTop, mul(unit(sub(headBottom, headTop)), -32 * anchors.scale));
      return { ...s, piece: { d: `M${pt(headTop)} L${pt(steerTop)} L${pt(clamp)}`, w: 2.1 * k, dashed: false } };
    }
    case 'wheel': return ink(['bk-tyre', 'bk-rim', 'bk-spokes', 'bk-hub'], true);
    case 'hub': return ink(['bk-hub'], true);
    case 'spokes': return ink(['bk-spokes'], true);
    case 'rim': return ink(['bk-rim'], true);
    case 'tyre': return ink(['bk-tyre'], true);
    case 'rim-brake': return ink(['bk-caliper'], true);
    case 'caliper': return { ...ink(['bk-caliper'], true), side: 'other' };
    case 'disc': return { ...ink(['bk-rotor'], true), side: 'other' };
    case 'chain': return ink(['bk-chain']);
    case 'chainring': return ink(['bk-ring', 'bk-crank']);
    case 'cassette': return ink(['bk-cog']);
    case 'derailleur': return ink(['bk-mech']);
    case 'hub-gears': return ink(['bk-hubgear']);
    case 'battery': return ink(['bk-battery']);
    case 'valve': case 'tubeless-valve': {
      const bottom: P = [front[0], front[1] + rimR];
      return { ...s, piece: { d: `M${pt(add(bottom, [0, 1.6 * k]))} L${pt(add(bottom, [0, -4.5 * k]))}`, w: 1.4 * k, dashed: false } };
    }
    case 'gear-cable': {
      const mech = add(rear, [-1.6 * k, 5 * k]);
      return { ...s, piece: { d: `M${pt(lerp(bb, headBottom, 0.82))} L${pt(add(bb, [-2 * k, -1.5 * k]))} L${pt(mech)}`, w: 0.9 * k, dashed: true } };
    }
    case 'stanchions':
      return { ...s, piece: { d: `M${pt(headBottom)} L${pt(lerp(headBottom, front, 0.46))}`, w: 4.2 * k, dashed: false } };
    // the fork's ends, on the card's wheel (the guide's point is the rear's): one wheel of a pair a card (review of PR 107, M5)
    case 'dropouts': return { ...ring(), at: [r2(front[0]), r2(front[1])] };
    case 'brake-qr': return ring('left');
    case 'pad-adjuster': return ring('other');
    default: return ring();
  }
}

/** The drawing's elements of `classes` (bikeArt's markup), each as markup of its own with the class `cls` in place of its own. */
export function inkMarkup(svg: string, classes: readonly string[], cls: string, barOnly = false): string {
  let out = '';
  for (const m of svg.matchAll(/<(path|circle|rect)\b([^>]*?)\/>/g)) {
    const attrs = m[2]!;
    const own = /\bclass="([^"]*)"/.exec(attrs)?.[1]?.split(' ') ?? [];
    const hit = own.find((c) => classes.includes(c));
    if (!hit) continue;
    let rest = attrs.replace(/\s*\bclass="[^"]*"/, '');
    // The drawing draws the stem and the bar as one path: the bar alone starts at its second move.
    if (barOnly && hit === 'bk-bar') rest = rest.replace(/\bd="M[^M]*/, 'd="');
    const filled = m[1] === 'rect' || hit === 'bk-hood' || hit === 'bk-hub';
    out += `<${m[1]} class="${cls}${filled ? ` ${cls}-fill` : ''}"${rest}/>`;
  }
  return out;
}

/**
 * The view's copy of the drawing: bikeArt's markup with its outer name taken off (the view names the drawing itself). An e-bike's motor
 * is bikeArt's own (PR 109): round at the cranks, or the hub the rider said.
 */
export function viewMarkup(svg: string): string {
  return svg.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');
}

// ---- the part of the drawing in view ----

export type ViewBox = { x: number; y: number; w: number; h: number };
/** The drawing area's width to height: every view of the drawing has it, so zooming never changes the area's size. */
export const ASPECT = 2.1;
export const MAX_ZOOM = 4;
const PAD = 30;

/** The whole bike, a little room round it, at the view's aspect: from the wheels' outer edge and the saddle and bar tops to the ground. */
export function wholeBox(a: Anchors): ViewBox {
  const { rear, front } = a.wheels;
  const tops = [a.points.saddle[1] - 3, a.points.bar[1] - 8, a.points.headTop[1] - 4, rear.cy - rear.r, front.cy - front.r];
  const x0 = rear.cx - rear.r - 4 - PAD;
  const x1 = Math.max(front.cx + front.r, a.points.bar[0] + 16) + 4 + PAD;
  const y0 = Math.min(...tops) - 4;
  const y1 = Math.max(rear.cy + rear.r, front.cy + front.r) + 4;
  return fit({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

/** A box grown to the view's aspect round its own centre. */
function fit(b: ViewBox): ViewBox {
  const w = Math.max(b.w, b.h * ASPECT);
  const h = w / ASPECT;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/** The view at zoom `z` (1 = the whole bike) round `centre`, kept inside the whole bike's box. */
export function zoomBox(whole: ViewBox, z: number, centre: P): ViewBox {
  const zz = Math.min(MAX_ZOOM, Math.max(1, z));
  const w = whole.w / zz;
  const h = whole.h / zz;
  const x = Math.min(whole.x + whole.w - w, Math.max(whole.x, centre[0] - w / 2));
  const y = Math.min(whole.y + whole.h - h, Math.max(whole.y, centre[1] - h / 2));
  return { x, y, w, h };
}

/**
 * The view a card opens on (owner's answer 2 of 9 November 2026): when its parts sit close together (all on one wheel, all in the drive),
 * zoomed in on them with room round them; else the whole bike. Returned as a zoom and a centre, so the rider's own zoom starts from it.
 */
export function focusOf(whole: ViewBox, points: readonly P[]): { z: number; centre: P } {
  const centre: P = [whole.x + whole.w / 2, whole.y + whole.h / 2];
  if (points.length === 0) return { z: 1, centre };
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const pad = 12;
  const box = fit({ x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad });
  const z = Math.min(2.6, whole.w / box.w);
  if (z < 1.35) return { z: 1, centre };
  return { z: Math.round(z * 100) / 100, centre: [box.x + box.w / 2, box.y + box.h / 2] };
}

/**
 * The view a card opens on: its parts' focus. Where one or two far-off parts alone keep it whole (a warning's brake lever on the bar in
 * a puncture card), up to a quarter of the parts, those farthest from the rest, are left out of it: the card opens on its own parts and
 * a tap on a left-out one brings the view to it (review of PR 107, M3). A card naming the frame, which spans the bike, opens whole.
 */
export function openingFocus(whole: ViewBox, spots: readonly (readonly [PartId, { at: P }])[]): { z: number; centre: P } {
  if (spots.some(([id]) => id === 'frame')) return focusOf(whole, []);
  const pts = spots.map(([, s]) => s.at);
  const all = focusOf(whole, pts);
  if (all.z > 1 || pts.length < 4) return all;
  // each way of leaving out one part, then two (never more than a quarter): the one zooming in furthest that keeps the rest in view
  const ways = (k: number, from = 0): number[][] => (k === 0 ? [[]] : pts.flatMap((_, i) => (i < from ? [] : ways(k - 1, i + 1).map((w) => [i, ...w]))));
  for (let k = 1; k <= Math.floor(pts.length / 4); k += 1) {
    let best: { z: number; centre: P } | null = null;
    for (const out of ways(k)) {
      const rest = pts.filter((_, i) => !out.includes(i));
      const f = focusOf(whole, rest);
      const view = zoomBox(whole, f.z, f.centre);
      if (f.z > 1 && rest.every((p) => inBox(view, p, 4)) && (!best || f.z > best.z)) best = f;
    }
    if (best) return best;
  }
  return all;
}

export const inBox = (b: ViewBox, p: P, margin = 0): boolean =>
  p[0] >= b.x + margin && p[0] <= b.x + b.w - margin && p[1] >= b.y + margin && p[1] <= b.y + b.h - margin;

// ---- the bike's outline, which the labels keep clear of ----

/**
 * The bike's outline in drawing units, from the drawing's own markup: its two wheels as discs, each other line as its segments (curves
 * by their control points) and each round part as a disc, so the space inside the frame stays free for labels, as in the owner's
 * reference picture.
 */
export function outline(svg: string, a: Anchors): Outline {
  const circles = [a.wheels.rear, a.wheels.front].map((w) => ({ c: [w.cx, w.cy] as P, r: w.r + 0.6 }));
  const segs: [P, P][] = [];
  for (const m of svg.matchAll(/<(path|circle|rect)\b([^>]*?)\/>/g)) {
    const attrs = m[2]!;
    const cls = /\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (/\bbk-(tyre|rim|spokes|hub|rotor|caliper|cog|hubgear|casing)\b/.test(cls)) continue;
    const num = (name: string): number => Number(new RegExp(`(?:^|\\s)${name}="([-\\d.]+)"`).exec(attrs)?.[1] ?? NaN);
    const half = (num('stroke-width') || 1) / 2 + 0.5;
    if (m[1] === 'circle') { circles.push({ c: [num('cx'), num('cy')], r: num('r') + half }); continue; }
    if (m[1] === 'rect') {
      const [x, y, w, h] = [num('x'), num('y'), num('width'), num('height')];
      const rot = /rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/.exec(attrs);
      const turn = (p: P): P => {
        if (!rot) return p;
        const [t, cx, cy] = [(Number(rot[1]) * Math.PI) / 180, Number(rot[2]), Number(rot[3])];
        return [cx + (p[0] - cx) * Math.cos(t) - (p[1] - cy) * Math.sin(t), cy + (p[0] - cx) * Math.sin(t) + (p[1] - cy) * Math.cos(t)];
      };
      const c = ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as P[]).map(turn);
      for (let i = 0; i < 4; i += 1) segs.push([c[i]!, c[(i + 1) % 4]!]);
      continue;
    }
    for (const run of (/\bd="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/(?=M)/)) {
      const n = (run.match(/-?[\d.]+/g) ?? []).map(Number);
      const pts: P[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
      if (/Z/.test(run) && pts.length > 2) pts.push(pts[0]!);
      for (let i = 0; i + 1 < pts.length; i += 1) segs.push([pts[i]!, pts[i + 1]!]);
      if (pts.length === 1) segs.push([pts[0]!, pts[0]!]);
    }
  }
  return { circles, segs, pad: 1.6 };
}
export type Outline = { circles: { c: P; r: number }[]; segs: [P, P][]; pad: number };

/** The outline in the canvas's units, for a view of the drawing `scale` px a unit wide, `inset` px from the canvas's left. */
export function outlineOn(o: Outline, view: ViewBox, scale: number, inset = 0): Outline {
  const at = (p: P): P => [(p[0] - view.x) * scale + inset, (p[1] - view.y) * scale];
  return { circles: o.circles.map((c) => ({ c: at(c.c), r: c.r * scale })), segs: o.segs.map(([a, b]) => [at(a), at(b)]), pad: o.pad * scale };
}

/** Where the drawing sits in the canvas (`inset` px from each side, `areaH` tall, `scale` px a unit) and its labels' places. */
export type Placement = { layout: Layout; inset: number; areaH: number; scale: number };

const toSegment = (q: Pt, a: Pt, b: Pt): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
};
/**
 * How hard the leaders are to follow: two for each pair that cross, one for each leader passing within 6 px of another part's point
 * (it then seems to point there too). The fewer, the easier the drawing reads (review of PR 107, M2).
 */
export function tangles(layout: Layout): number {
  const seen = layout.labels.filter((l, i, all) => all.findIndex((m) => m.to[0] === l.to[0] && m.to[1] === l.to[1]) === i);
  let n = 0;
  for (let i = 0; i < seen.length; i += 1) {
    for (let j = 0; j < seen.length; j += 1) {
      if (i === j) continue;
      if (j > i && segmentsCross(seen[i]!.from, seen[i]!.to, seen[j]!.from, seen[j]!.to)) n += 2;
      if (toSegment(seen[j]!.to, seen[i]!.from, seen[i]!.to) < 6) n += 1;
    }
  }
  return n;
}

/**
 * The labels of the parts in view (`items`, at their points in drawing units, with their labels' widths), on a canvas `width` px wide.
 * The drawing takes the whole width, or is drawn a little smaller to leave free space at its sides, as the owner's reference picture
 * does: the smaller drawing only where it places a label the whole width cannot, or uncrosses leaders.
 */
export function placeView(items: readonly { id: string; at: P; w: number }[], view: ViewBox, width: number, o: Outline, lh = labelHeight(labelSize(width))): Placement {
  let out: (Placement & { score: number }) | null = null;
  for (const share of [0, 0.07, 0.14, 0.21]) {
    const inset = Math.round(width * share);
    const scale = (width - 2 * inset) / view.w;
    const areaH = Math.round(view.h * scale);
    const at = (p: P): Pt => [r2((p[0] - view.x) * scale + inset), r2((p[1] - view.y) * scale)];
    const layout = placeLabels(items.map((i) => ({ id: i.id, at: at(i.at), w: i.w })), width, areaH, outlineOn(o, view, scale, inset), lh);
    // every label placed first, then fewer tangles; a smaller drawing must earn its place by about two fewer
    const score = (items.length - layout.labels.length) * 1000 + tangles(layout) * 2 + share * 10;
    if (!out || score < out.score) out = { layout, inset, areaH, scale, score };
    if (out.score < 1) break;
  }
  const { layout, inset, areaH, scale } = out!;
  return { layout, inset, areaH, scale };
}

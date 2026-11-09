// The frame bag beside the plan's bottles (owner, 9 Nov 2026: the full Bag planner's three-quarter frame bag must not be drawn over a
// bottle). bike.js only: the bag planner draws its rig's bags from the anchors, so its frame shapes are cut clear of the bottles the plan
// has inside the triangle. Each shape keeps the cut that leaves it the most room: a straight lower edge (beside a seat-tube bottle it
// slopes down to the down tube), or one that steps round the bottle's top (beside a down-tube bottle). A shape already clear of a bottle
// is kept as it is. The co-pilot's own drawing keeps its boxes, so its first screen stays as it is.
import { boxOf, clip } from './art.ts';
import type { Anchors, Box, P, Spot } from './art.ts';

type Bottle = { slot: 'st' | 'dt' | 'un'; L: number };

/** From the bottle's centre, before it is turned to its tube: the corners of its cage, the bottle and its cap as bottleArt draws them. */
function outlineOf(L: number): P[] {
  const r = (Number.isFinite(L) && L > 0 ? L : 0.75) / 0.75;
  const h = 30 * Math.min(1.16, Math.max(0.78, r ** 0.45));
  const w = 9.6 * Math.min(1.08, Math.max(0.9, r ** 0.15));
  const m = 1.2; // the bag's outline and a hair of air
  const [bw, cw, capw, y] = [w / 2 + m, w / 2 + 2.2 + m, w * 0.22 + m, -h / 2];
  return [[-bw, y - m], [bw, y - m], [bw, -y + m], [-bw, -y + m], [-cw, y + h * 0.13 - m], [cw, y + h * 0.13 - m], [cw, y + h * 0.83 + m],
    [-cw, y + h * 0.83 + m], [-capw, y - 2.5 - m], [capw, y - 2.5 - m]];
}

const areaOf = (poly: P[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
const normal = (a: P, b: P): P => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
};
/** Every 5 degrees round, so the best straight cut is found to within a few degrees. */
const TURNS: P[] = Array.from({ length: 72 }, (_, i) => [Math.cos((i * Math.PI) / 36), Math.sin((i * Math.PI) / 36)]);

/** A line with the bottle on one side: what lies where `m . p` is at least `e` is clear of it. */
type Line = { m: P; e: number };
const side = (l: Line) => (p: P): number => l.e - (p[0] * l.m[0] + p[1] * l.m[1]);
/** The line along `m` touching the far side of the bottle's outline. */
const lineAlong = (m: P, keep: P[]): Line => ({ m, e: Math.max(...keep.map((p) => p[0] * m[0] + p[1] * m[1])) });

/**
 * The shape with the corner where both lines have the bottle on their side taken out: what lies clear of either line stays. One line
 * twice is a straight cut; two lines along two sides of the bottle leave a notch that steps round it. Null when what stays would be
 * in two pieces (the corner runs right through the shape).
 */
function notch(poly: P[], l1: Line, l2: Line): P[] | null {
  const [f1, f2] = [side(l1), side(l2)];
  const out = (p: P) => Math.min(f1(p), f2(p)) <= 0;
  const n = poly.length;
  const first = poly.findIndex(out);
  if (first < 0) return [];
  const det = l1.m[0] * l2.m[1] - l1.m[1] * l2.m[0];
  const apex: P | null = Math.abs(det) < 1e-9 ? null : [(l1.e * l2.m[1] - l2.e * l1.m[1]) / det, (l2.e * l1.m[0] - l1.e * l2.m[0]) / det];
  const res: P[] = [];
  let entry = 0;
  let bites = 0;
  for (let k = 0; k < n; k += 1) {
    const a = poly[(first + k) % n]!;
    const b = poly[(first + k + 1) % n]!;
    if (out(a)) res.push(a);
    const hits: { t: number; p: P; line: number }[] = [];
    for (const [f, line] of [[f1, 1], [f2, 2]] as const) {
      const [fa, fb] = [f(a), f(b)];
      if ((fa > 0) === (fb > 0)) continue;
      const t = fa / (fa - fb);
      const p: P = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (Math.min(f1(p), f2(p)) > -1e-7) hits.push({ t, p, line });
    }
    hits.sort((x, y) => x.t - y.t);
    let inside = !out(a);
    for (const h of hits) {
      if (!inside) { entry = h.line; bites += 1; }
      else if (apex && entry && entry !== h.line) res.push(apex);
      res.push(h.p);
      inside = !inside;
    }
  }
  return bites > 1 ? null : res;
}

/**
 * The frame bag's shape `poly` (convex, clockwise) clear of the bottle at `spot`: of the straight cuts every 5 degrees and the notches
 * along two sides of the bottle, the one that keeps the most bag. A shape already clear of the bottle (a side of the shape or of the
 * bottle parts them) comes back unchanged.
 */
export function cutBeside(poly: P[], spot: Spot, L: number): P[] {
  const a = (spot.rot * Math.PI) / 180;
  const keep = outlineOf(L).map(([x, y]): P => [spot.cx + x * Math.cos(a) - y * Math.sin(a), spot.cy + x * Math.sin(a) + y * Math.cos(a)]);
  const whole = areaOf(poly);
  const clear = (l: Line) => poly.every((p) => side(l)(p) <= 1e-9);
  for (let i = 0; i < poly.length; i += 1) if (clear(lineAlong(normal(poly[(i + 1) % poly.length]!, poly[i]!), keep))) return poly;
  // the bottle's own sides: lines through two corners of its outline with all of it on one side
  const sides: Line[] = [];
  for (let i = 0; i < keep.length; i += 1) for (let j = i + 1; j < keep.length; j += 1) for (const s of [1, -1]) {
    const nn = normal(keep[i]!, keep[j]!);
    const l = lineAlong([nn[0] * s, nn[1] * s], keep);
    if (Math.abs(side(l)(keep[i]!)) < 1e-6) sides.push(l);
  }
  for (const l of sides) if (clear(l)) return poly;
  let best: P[] = [];
  let most = 0;
  const consider = (kept: P[] | null) => {
    const area = kept && kept.length >= 3 ? areaOf(kept) : 0;
    if (area > most + 1e-9) { most = area; best = kept!; }
  };
  for (const d of TURNS) consider(clip(poly, side(lineAlong(d, keep))));
  for (const l1 of sides) for (const l2 of sides) if (l1 !== l2) consider(notch(poly, l1, l2));
  return most >= whole - 1e-9 ? poly : best;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const KEPT = new WeakMap<Anchors, Map<string, Anchors>>();

/**
 * The anchors with the three-quarter, half and wedge frame shapes cut clear of the plan's bottles inside the triangle (`un` hangs under
 * the down tube, outside it). The full shape stays whole: the planner never puts it beside such a bottle, and it is the frame's tap
 * target and places its tag. Without such a bottle, the anchors themselves. Kept per anchors and bottles: a redraw gets the same object.
 */
export function besideBottles(a: Anchors, bottles: readonly Bottle[]): Anchors {
  const inside = bottles.filter((b) => b.slot !== 'un' && a.bottles[b.slot]);
  if (!a.frame || inside.length === 0) return a;
  const key = inside.map((b) => `${b.slot}${b.L}`).sort().join(' ');
  let known = KEPT.get(a);
  const hit = known?.get(key);
  if (hit) return hit;
  const shapes = a.frame.shapes.map((pts, i) => {
    if (i === 0) return pts;
    const start = pts.split(' ').map((q) => q.split(',').map(Number) as P);
    let s = start;
    for (const b of inside) if (s.length >= 3) s = cutBeside(s, a.bottles[b.slot]!, b.L);
    return s === start ? pts : s.length >= 3 ? s.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ') : pts;
  }) as [string, string, string, string];
  const boxes = shapes.map((pts, i) => (pts === a.frame!.shapes[i] ? a.frame!.boxes[i]! : boxOf(pts.split(' ').map((q) => q.split(',').map(Number) as P)))) as [Box, Box, Box, Box];
  const out: Anchors = { ...a, frame: { shapes, boxes } };
  if (!known) KEPT.set(a, (known = new Map()));
  if (known.size > 24) known.clear();
  known.set(key, out);
  return out;
}

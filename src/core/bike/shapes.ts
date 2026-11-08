// Real bag shapes (weight map and bag shapes design, section 2): each bag is a silhouette (the only part that takes state) plus inside
// lines (zips, straps, seams, hooks: decoration). A shape scales with the cube root of its litres, at least 0.55, anchored at its mount
// edge, and its outline never leaves the anchor box, so the bag planner's tap targets, stacking and tags keep working. The outline
// polygon is what the weight map spreads a bag's kilos over: one source for both. Only the bag planner's bike.js carries this module.
import type { Box, P, Placed } from './art.ts';

export type Shape = {
  /** The silhouette's path, in the box's own (unturned) frame. */
  d: string;
  /** The silhouette as a polygon, in the drawing's frame (turned with the box). */
  outline: P[];
  /** What the fill rises in, in the box's own frame. */
  box: Box;
  /** The inside lines, as paths and circles; decoration only. */
  detail: string;
  /** The box's turn in degrees about `c`. */
  rot: number;
  c: P;
};

/** The litres at which each shape reaches its full anchor box (design 2.2). Frame bags do not scale: the frame decides. */
export const LARGEST: Readonly<Record<string, number>> = { top: 1.5, fork: 4, bar: 16, seat: 16, rack: 20, pack: 30 };
/** The far bag of a pair is drawn first, set back by this much: the pannier's sits behind and a little lower, on the same rail. */
export const PAIR_OFFSET: Readonly<Record<string, P>> = { rack: [-6, 1.5], fork: [-5, -5] };

export const sizeFactor = (pos: string, L: number): number => Math.max(0.55, Math.min(1, Math.cbrt((L > 0 ? L : 0) / (LARGEST[pos] ?? 1))));

const r2 = (n: number): number => Math.round(n * 100) / 100;
const pt = (p: P): string => `${r2(p[0])} ${r2(p[1])}`;
const line = (cls: string, ...p: P[]): string => `<path class="${cls}" d="M${p.map(pt).join(' L')}"/>`;
const at = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Each corner rounded by its radius: the corner's start, the corner itself and its end. */
function corners(pts: P[], rs: number | number[]): P[][] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n]!;
    const b = pts[(i + 1) % n]!;
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1;
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const r = Math.min(typeof rs === 'number' ? rs : rs[i]!, la / 2, lb / 2);
    return [at(p, a, r / la), p, at(p, b, r / lb)];
  });
}
const roundPath = (c: P[][]): string => c.map(([s, p, e], i) => `${i ? 'L' : 'M'}${pt(s!)} Q${pt(p!)} ${pt(e!)}`).join(' ') + ' Z';
const roundPoly = (c: P[][]): P[] => c.flatMap(([s, p, e]) => [s!, [(s![0] + 2 * p![0] + e![0]) / 4, (s![1] + 2 * p![1] + e![1]) / 4] as P, e!]);
const turn = (pts: P[], deg: number, c: P): P[] => {
  const a = (deg * Math.PI) / 180;
  const [co, si] = [Math.cos(a), Math.sin(a)];
  return pts.map((p) => [c[0] + (p[0] - c[0]) * co - (p[1] - c[1]) * si, c[1] + (p[0] - c[0]) * si + (p[1] - c[1]) * co]);
};
const bounds = (pts: P[]): Box => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/**
 * The shape of a bag at `pos` in its anchor box `b` (already stacked or offset by the caller). `L` sizes it; a frame bag takes its
 * polygon from `o.frame`; a top tube bag behind the stem (`slot` front) or by the saddle (`slot` rear) has its own outline.
 */
export function bagShape(pos: string, b: Placed, L: number, o: { slot?: 'front' | 'rear' | null; frame?: string } = {}): Shape {
  const k = sizeFactor(pos, L);
  const c: P = [b.x + b.w / 2, b.y + b.h / 2];
  let pts: P[];
  let rs: number | number[];
  let detail = '';
  const [X0, Y0, X1, Y1] = [b.x, b.y, b.x + b.w, b.y + b.h];
  switch (pos) {
    case 'frame': {
      pts = (o.frame ?? '').split(' ').map((s) => s.split(',').map(Number) as P);
      rs = 2.6;
      // The zip runs along the top tube side (the highest edge), straps wrap the tubes at the edges' middles.
      const n = pts.length;
      const cen = pts.reduce<P>((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
      const edges = pts.map((p, i) => [p, pts[(i + 1) % n]!] as [P, P]);
      const top = edges.reduce((m, e) => (e[0][1] + e[1][1] < m[0][1] + m[1][1] ? e : m));
      const strap = ([p, q]: [P, P], t: number, l: number) => {
        const m = at(p, q, t);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        let nn: P = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
        if ((m[0] - cen[0]) * nn[0] + (m[1] - cen[1]) * nn[1] < 0) nn = [-nn[0], -nn[1]];
        return line('bk-strap', [m[0] - nn[0] * 1.2, m[1] - nn[1] * 1.2], [m[0] + nn[0] * l, m[1] + nn[1] * l]);
      };
      const zip = (t: number): P => { const p = at(top[0], top[1], t); return [p[0] + (cen[0] - p[0]) * 0.12, p[1] + 2.7]; };
      detail = line('bk-zip', zip(0.12), zip(0.88)) + strap(top, 0.3, 4.6) + strap(top, 0.7, 4.6)
        + edges.filter((e) => e !== top && Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]) > 12).map((e) => strap(e, 0.5, 4)).join('');
      break;
    }
    case 'top': {
      const [w, h] = [b.w * k, b.h * k];
      if (o.slot === 'rear') {
        // By the saddle: a low, even bag from the seat tube forward, strapped round the seat tube at its back end.
        const hh = h * 0.8;
        const [x0, x1, yt] = [X0, X0 + w, Y1 - hh];
        pts = [[x0, Y1], [x1, Y1], [x1, yt], [x0, yt]];
        rs = hh * 0.45;
        detail = line('bk-zip', [x0 + hh * 0.5, yt + 1.6], [x1 - hh * 0.5, yt + 1.6]) + line('bk-strap', [x0 + w * 0.6, Y1 - 0.4], [x0 + w * 0.6, Y1 + 3.8])
          + line('bk-strap bk-post-strap', [x0 + 1.4, yt + hh * 0.35], [x0 - 2.6, Y1 + 2.4]);
      } else {
        // Behind the stem: flat on the tube, taller at the stem end, a domed corner.
        const [x0, yt] = [X1 - w, Y1 - h];
        pts = [[x0, Y1], [X1, Y1], [X1, yt], [x0, yt + h * 0.28]];
        rs = [1.6, 1.6, 2.6, 2.2];
        detail = line('bk-zip', [x0 + 2.2, yt + h * 0.28 + 2.4], [X1 - 2.4, yt + 2.6])
          + [0.25, 0.7].map((t) => line('bk-strap', [x0 + w * t, Y1 - 0.4], [x0 + w * t, Y1 + 3.8])).join('');
      }
      break;
    }
    case 'seat': {
      // Hangs from the saddle rails: full height at the saddle, tapering back to a rounded, rolled tail.
      const [w, h] = [b.w * k, b.h * k];
      const x0 = X1 - w;
      const tail = h * 0.42;
      pts = [[X1, Y0], [x0, Y0], [x0, Y0 + tail], [X1, Y0 + h]];
      rs = [2.4, tail / 2, tail / 2, h * 0.45];
      const under = (x: number) => Y0 + tail + (h - tail) * ((x - x0) / w);
      detail = [0.13, 0.2].map((t) => line('bk-roll', [x0 + w * t, Y0 + 0.5], [x0 + w * t, under(x0 + w * t) - 0.5])).join('')
        + line('bk-strap', [x0 + w * 0.55, Y0 - 0.8], [x0 + w * 0.55, under(x0 + w * 0.55) + 0.8])
        + [4, 13].map((d) => line('bk-strap', [X1 - d, Y0 + 0.3], [X1 - d, Y0 - 3.2])).join('')
        + line('bk-strap bk-post-strap', [X1 - 1, Y0 + h * 0.3], [X1 + 9, Y0 + 1.4]);
      break;
    }
    case 'bar': {
      // A cylinder seen a little from the side: the round end towards the rider, the body running forward and up. Its length is fixed.
      const u: P = [8 / 8.62, -3.2 / 8.62];
      const n: P = [-u[1], u[0]];
      const r = k * Math.min(9, (b.h - 3.4) / 2);
      const ends = (c1: P): P[] => {
        const c2: P = [c1[0] + 8, c1[1] - 3.2];
        const e1: P = [c1[0] - u[0] * r, c1[1] - u[1] * r];
        const e2: P = [c2[0] + u[0] * r, c2[1] + u[1] * r];
        return [[e1[0] + n[0] * r, e1[1] + n[1] * r], [e2[0] + n[0] * r, e2[1] + n[1] * r], [e2[0] - n[0] * r, e2[1] - n[1] * r], [e1[0] - n[0] * r, e1[1] - n[1] * r]];
      };
      const first = roundPoly(corners(ends([0, 0]), r));
      const f = bounds(first);
      const c1: P = [X0 + 0.1 - f.x, Y0 + 0.1 - f.y];
      pts = ends(c1);
      rs = r;
      const mid = at(c1, [c1[0] + 8, c1[1] - 3.2], 0.55);
      detail = `<circle class="bk-end" cx="${r2(c1[0])}" cy="${r2(c1[1])}" r="${r2(r)}"/><circle cx="${r2(c1[0])}" cy="${r2(c1[1])}" r="${r2(r * 0.58)}"/>`
        + `<path d="M${pt([c1[0] + r * 0.58, c1[1]])} Q${pt([c1[0] + r * 0.2, c1[1] + r * 0.58])} ${pt([c1[0] - r * 0.3, c1[1] + r * 0.2])}"/>`
        + line('bk-strap', [mid[0] + n[0] * (r + 0.8), mid[1] + n[1] * (r + 0.8)], [mid[0] - n[0] * (r + 0.8), mid[1] - n[1] * (r + 0.8)]);
      break;
    }
    case 'fork': {
      // A roll-top dry bag along the fork leg, turned with it; a roll line near the top and two straps.
      const [w, h] = [b.w * 0.85 * k, b.h * k];
      const [x0, y0] = [c[0] - w / 2, c[1] - h / 2];
      pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
      rs = w * 0.42;
      detail = line('bk-roll', [x0 + 0.8, y0 + h * 0.16], [x0 + w - 0.8, y0 + h * 0.16])
        + [0.42, 0.74].map((t) => line('bk-strap', [x0 - 1.3, y0 + h * t], [x0 + w + 1.3, y0 + h * t])).join('');
      break;
    }
    case 'rack': {
      // Hangs from the rack rail (just above the box) on two hooks: a roll-top band, a front pocket and its strap tabs.
      const [w, h] = [(b.w - 8) * k, b.h * k];
      const [x0, x1] = [c[0] + 2 - w / 2, c[0] + 2 + w / 2];
      const rail = Y0 - 2.6;
      pts = [[x0, Y0], [x1, Y0], [x1, Y0 + h], [x0, Y0 + h]];
      rs = [2.6, 2.6, 4.4, 4.4];
      const hook = (x: number) => `<path class="bk-hook" d="M${pt([x, Y0 + 1.6])} L${pt([x, rail - 1.7])} L${pt([x + 2.6, rail - 1.7])}"/>`;
      const pocket = corners([[x0 + w * 0.12, Y0 + h * 0.36], [x1 - w * 0.12, Y0 + h * 0.36], [x1 - w * 0.12, Y0 + h * 0.92], [x0 + w * 0.12, Y0 + h * 0.92]], [1, 1, 3, 3]);
      detail = hook(x0 + w * 0.2) + hook(x1 - w * 0.2) + line('bk-roll', [x0 + 0.8, Y0 + h * 0.2], [x1 - 0.8, Y0 + h * 0.2])
        + `<path d="${roundPath(pocket)}"/>` + [0.32, 0.68].map((t) => line('bk-strap', [x0 + w * t, Y0 + h * 0.2 - 1.5], [x0 + w * t, Y0 + h * 0.2 + 2.2])).join('');
      break;
    }
    default: {
      // The backpack, seen from the side: flat back to the rider, bulging outside, a handle, a front pocket, the shoulder strap.
      const [w, h] = [b.w * (0.7 + 0.3 * k), b.h * k];
      const [x0, y0] = [X1 - w, Y1 - h];
      pts = [[X1, y0 + 1], [x0 + 4, y0], [x0, y0 + h * 0.5], [x0 + 2.5, Y1], [X1, Y1 - 1]];
      rs = [3, 6, 7, 5, 3];
      const pocket = corners([[x0 + 3.4, y0 + h * 0.5], [X1 - 6, y0 + h * 0.5], [X1 - 6, Y1 - 3.2], [x0 + 4, Y1 - 3.2]], [3, 1.4, 1.4, 3.6]);
      detail = `<path d="M${pt([x0 + w * 0.34, y0 + 0.6])} Q${pt([x0 + w * 0.5, y0 - 4.2])} ${pt([x0 + w * 0.66, y0 + 0.8])}"/><path d="${roundPath(pocket)}"/>`
        + line('bk-zip', [x0 + 4, y0 + h * 0.25], [X1 - 6, y0 + h * 0.25])
        + `<path class="bk-harness" d="M${pt([X1 - 1.6, y0 + 3])} C${pt([X1 + 5.5, y0 + h * 0.28])} ${pt([X1 + 5.5, y0 + h * 0.66])} ${pt([X1 - 2.6, Y1 - 3.4])}"/>`
        + line('bk-harness', [X1 - 1, Y1 - 5.6], [X1 + 6.4, Y1 - 5.6]);
    }
  }
  const cs = corners(pts, rs);
  const box = bounds(pts);
  return { d: roundPath(cs), outline: b.rot ? turn(roundPoly(cs), b.rot, c) : roundPoly(cs), box, detail, rot: b.rot, c };
}

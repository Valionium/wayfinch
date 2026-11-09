// The bike view's labels (design of 9 November 2026, 2.4; the owner's answer 2 and reference picture of 9 November): every part in view
// named outside the bike, in the drawing's free space round it or in rows above and below it, each joined to its part by one straight
// leader line. No two labels overlap, none touches the bike, no leader crosses another label, and leaders cross no other leader where
// any free place allows. Pure: screen units in, places out.

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };
export type LabelIn = { id: string; at: Pt; w: number };
export type LabelOut = { id: string; box: Rect; from: Pt; to: Pt };
export type Layout = { labels: LabelOut[]; top: number; height: number };

/** A label's height and the rows' pitch, in px; the gap kept between labels. */
export const GAP = 5;
/**
 * The labels' size in px (review of PR 107, M1, toward the design's 13.5 units): capitals of 12 px on a phone, 13 px in the wide panel,
 * and the small "(other side)" one px smaller; a label is twice its letters tall.
 */
export const labelSize = (width: number): number => (width >= 480 ? 13 : 12);
export const labelHeight = (size: number): number => size * 2;
const MAX_ROWS = 4;

/**
 * A label's width in px at `size` px capitals (600 weight, 0.04 em apart, 6 px padding a side), with the lowercase "(other side)" one
 * px smaller as `extra`: a little wider than the app's font draws it, so a label never overruns its box.
 */
export function labelWidth(name: string, extra = '', size = 12): number {
  const em = (c: string): number => (c === ' ' ? 0.26 : /[IJ1.,'()]/.test(c) ? 0.34 : /[MW]/.test(c) ? 0.9 : 0.66);
  const caps = [...name.toUpperCase()].reduce((n, c) => n + em(c) + 0.04, 0) * size;
  const small = extra ? [...extra].reduce((n, c) => n + (c === ' ' ? 0.24 : /[il().,']/.test(c) ? 0.26 : /[mw]/.test(c) ? 0.82 : 0.54), 0) * (size - 1) + 4 : 0;
  return Math.ceil(caps + small + 12);
}

const overlaps = (a: Rect, b: Rect, gap: number): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

function cross(o: Pt, a: Pt, b: Pt): number { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
/** Whether two segments cross (touching ends do not count). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Whether a segment passes through a rectangle (Liang-Barsky). */
export function segmentHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges: [number, number][] = [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

/** What the labels keep clear of inside the drawing: the bike's discs (wheels, chainring) and line segments, `pad` round each line. */
export type Shapes = { circles: readonly { c: Pt; r: number }[]; segs: readonly (readonly [Pt, Pt])[]; pad: number };

const inside = (p: Pt, r: Rect): boolean => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h;
/** Whether a rectangle touches the bike's outline. */
export function hitsShapes(r: Rect, shapes: Shapes): boolean {
  for (const { c, r: rad } of shapes.circles) {
    const dx = c[0] - Math.min(r.x + r.w, Math.max(r.x, c[0]));
    const dy = c[1] - Math.min(r.y + r.h, Math.max(r.y, c[1]));
    if (dx * dx + dy * dy < rad * rad) return true;
  }
  const big = { x: r.x - shapes.pad, y: r.y - shapes.pad, w: r.w + 2 * shapes.pad, h: r.h + 2 * shapes.pad };
  for (const [a, b] of shapes.segs) if (segmentHitsRect(a as Pt, b as Pt, big)) return true;
  return false;
}

const CELL = 4;
/**
 * The drawing area as cells of 4 px, each marked where the bike's outline comes within a pixel of it, summed so a rectangle's count is
 * four reads: a place for a label inside the drawing is free where its count is 0. Marks err on the side of too many, never too few.
 */
function occupied(width: number, areaH: number, shapes: Shapes): (r: Rect) => boolean {
  const cols = Math.ceil(width / CELL) + 1;
  const rows = Math.ceil(areaH / CELL) + 1;
  const grid = new Uint8Array(cols * rows);
  const mark = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let j = Math.max(0, Math.floor(y0 / CELL)); j <= Math.min(rows - 1, Math.floor(y1 / CELL)); j += 1) {
      for (let i = Math.max(0, Math.floor(x0 / CELL)); i <= Math.min(cols - 1, Math.floor(x1 / CELL)); i += 1) grid[j * cols + i] = 1;
    }
  };
  for (const { c, r } of shapes.circles) {
    for (let y = c[1] - r - 1; y <= c[1] + r + 1; y += 1) {
      // the widest the disc is within a pixel of this line
      const near = Math.max(c[1] - y - 1, 0, y - 1 - c[1]) > 0 ? Math.min(Math.abs(y - 1 - c[1]), Math.abs(y + 1 - c[1])) : 0;
      const half = Math.sqrt(Math.max(0, r * r - near * near));
      if (near <= r) mark(c[0] - half - 1, y - 1, c[0] + half + 1, y + 1);
    }
  }
  const p = shapes.pad;
  for (const [a, b] of shapes.segs) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k <= n; k += 1) {
      const x = a[0] + ((b[0] - a[0]) * k) / n;
      const y = a[1] + ((b[1] - a[1]) * k) / n;
      mark(x - p - 1, y - p - 1, x + p + 1, y + p + 1);
    }
  }
  const sum = new Int32Array((cols + 1) * (rows + 1));
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      sum[(j + 1) * (cols + 1) + i + 1] = grid[j * cols + i]! + sum[j * (cols + 1) + i + 1]! + sum[(j + 1) * (cols + 1) + i]! - sum[j * (cols + 1) + i]!;
    }
  }
  return (r) => {
    const i0 = Math.max(0, Math.floor(r.x / CELL));
    const j0 = Math.max(0, Math.floor(r.y / CELL));
    const i1 = Math.min(cols, Math.ceil((r.x + r.w) / CELL));
    const j1 = Math.min(rows, Math.ceil((r.y + r.h) / CELL));
    if (i1 <= i0 || j1 <= j0) return false;
    const at = (i: number, j: number): number => sum[j * (cols + 1) + i]!;
    return at(i1, j1) - at(i0, j1) - at(i1, j0) + at(i0, j0) > 0;
  };
}

/** The point of a label's edge its leader starts from: the nearest to the part, kept off the pill's rounded ends. */
function edgeFrom(b: Rect, p: Pt): Pt {
  const x = Math.min(b.x + b.w, Math.max(b.x, p[0]));
  const y = Math.min(b.y + b.h, Math.max(b.y, p[1]));
  if (y === b.y || y === b.y + b.h) return [Math.min(b.x + b.w - b.h / 2, Math.max(b.x + b.h / 2, x)), y];
  return [x, y];
}

/**
 * Places the labels of the parts at `at` (in the drawing area, which is `areaH` tall and the canvas's `width` wide, its top at 0): in the
 * drawing's free space clear of the bike's outline (`shapes`), as the owner's reference picture does round the bike, or in rows above
 * (negative y) and below it. Each label takes the free place whose leader is shortest, an outer row costing a little more. The result's
 * `top` is the height of the rows above the drawing (draw the drawing that far down) and `height` the canvas's whole height; the labels
 * are in canvas units, with `from` on the label's edge and `to` the part's point.
 */
export function placeLabels(items: readonly LabelIn[], width: number, areaH: number, shapes: Shapes = { circles: [], segs: [], pad: 0 }, lh = labelHeight(12)): Layout {
  const ROW = lh + GAP;
  // Parts at one point (a hub's axle and its quick release) share one leader: their labels stack in one block.
  const groups: Group[] = [];
  for (const it of items) {
    const g = groups.find((x) => Math.hypot(x.at[0] - it.at[0], x.at[1] - it.at[1]) <= 1.5);
    if (g) { g.ids.push(it.id); g.ws.push(Math.min(it.w, width)); } else groups.push({ ids: [it.id], ws: [Math.min(it.w, width)], at: it.at });
  }
  // Left to right first, so the leaders of a row keep the parts' order; where that leaves a label without a place, other orders are
  // tried (the biggest first, right to left, the parts far from the middle first), and the first that places every one is taken.
  const size = (g: Group): number => Math.max(...g.ws) * g.ids.length;
  const orders = [
    [...groups].sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]),
    [...groups].sort((a, b) => size(b) - size(a) || a.at[0] - b.at[0]),
    [...groups].sort((a, b) => b.at[0] - a.at[0] || a.at[1] - b.at[1]),
    [...groups].sort((a, b) => Math.abs(b.at[1] - areaH / 2) - Math.abs(a.at[1] - areaH / 2) || a.at[0] - b.at[0]),
  ];
  // and then shuffled orders from a fixed seed (the result never depends on anything but the input)
  let seed = 20261109;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 24; i += 1) orders.push([...groups].map((g) => [rnd(), g] as const).sort((x, y) => x[0] - y[0]).map(([, g]) => g));
  const busy = occupied(width, areaH, shapes);
  let best: Placed[] = [];
  // More rows only where four a side leave a label without a place.
  for (const rows of [MAX_ROWS, 2 * MAX_ROWS]) {
    const spots = new Map(groups.map((g) => [g, candidates(g, groups, width, areaH, busy, rows, lh)]));
    for (const order of orders) {
      const placed = placeIn(order, spots);
      if (placed.length > best.length) best = placed;
      if (best.length === groups.length) break;
    }
    if (best.length === groups.length) break;
  }
  const pad = (ROW - lh) / 2;
  const topRows = Math.max(0, ...best.filter((p) => p.box.y < 0).map((p) => Math.ceil((-p.box.y + pad) / ROW - 1e-9)));
  const bottomRows = Math.max(0, ...best.filter((p) => p.box.y >= areaH).map((p) => Math.ceil((p.box.y + p.box.h - areaH + pad) / ROW - 1e-9)));
  const top = topRows * ROW;
  const shift = (p: Pt): Pt => [p[0], p[1] + top];
  const labels = items.flatMap((it) => {
    const p = best.find((x) => x.g.ids.includes(it.id));
    if (!p) return [];
    const k = p.g.ids.indexOf(it.id);
    const box = { x: p.box.x, y: p.box.y + top + k * (lh + GAP), w: p.g.ws[k]!, h: lh };
    return [{ id: it.id, box, from: shift(p.from), to: shift(p.g.at) }];
  });
  return { labels, top, height: top + areaH + bottomRows * ROW };
}

type Group = { ids: string[]; ws: number[]; at: Pt };
type Placed = { g: Group; box: Rect; from: Pt };

type Spot = { box: Rect; from: Pt; cost: number };

/** Every place a group's block may take, cheapest first: the shorter its leader the better, an outer row costing a little more. */
function candidates(g: Group, groups: readonly Group[], width: number, areaH: number, busy: (r: Rect) => boolean, rows: number, lh: number): Spot[] {
  const ROW = lh + GAP;
  const pad = (ROW - lh) / 2;
  const w = Math.max(...g.ws);
  const h = g.ids.length * lh + (g.ids.length - 1) * GAP;
  const out: Spot[] = [];
  const add = (box: Rect, extra: number): void => {
    const from = edgeFrom(box, g.at);
    out.push({ box, from, cost: Math.hypot(from[0] - g.at[0], from[1] - g.at[1]) + extra });
  };
  const xs: number[] = [];
  for (let x = 0; x <= width - w; x += 4) xs.push(x);
  xs.push(width - w);
  for (let row = 0; row < rows; row += 1) {
    for (const x of xs) {
      add({ x, y: -row * ROW - pad - h, w, h }, 12 + row * 24);
      add({ x, y: areaH + row * ROW + pad, w, h }, 12 + row * 24);
    }
  }
  for (let y = 2; y <= areaH - h - 2; y += 5) {
    for (let x = 0; x <= width - w; x += 5) {
      const near = { x: x - 3, y: y - 3, w: w + 6, h: h + 6 };
      if (groups.some((o) => inside(o.at, near)) || busy(near)) continue;
      add({ x, y, w, h }, 0);
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

const nearSegment = (q: Pt, a: Pt, b: Pt): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
};

function placeIn(order: readonly Group[], spots: ReadonlyMap<Group, Spot[]>): Placed[] {
  const placed: Placed[] = [];
  const all = [...spots.keys()];
  for (const g of order) {
    // 2: a leader crossing no other and passing no other part's point (so it never seems to point at that one); 1: crossing no other
    const free = (c: Spot, level: number): boolean => {
      if (level >= 2 && all.some((o) => o !== g && nearSegment(o.at, c.from, g.at) < 6)) return false;
      for (const p of placed) {
        if (overlaps(c.box, p.box, GAP)) return false;
        if (segmentHitsRect(c.from, g.at, p.box)) return false;
        if (segmentHitsRect(p.from, p.g.at, c.box)) return false;
        if (level >= 1 && segmentsCross(c.from, g.at, p.from, p.g.at)) return false;
      }
      return true;
    };
    const mine = spots.get(g)!;
    const pick = mine.find((c) => free(c, 2)) ?? mine.find((c) => free(c, 1)) ?? mine.find((c) => free(c, 0));
    if (pick) placed.push({ g, box: pick.box, from: pick.from });
  }
  return placed;
}

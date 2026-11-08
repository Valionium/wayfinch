// The weight map (weight map and bag shapes design, section 1): where the packed kilos sit, as weighted kilos (kilos times the handling
// weight of their position, the advisor's own table), on a fixed scale, next to an ideal spread of the same kilos. Pure: the bag planner
// hands it each bag's kilos and drawn outline; /tools/bags/weightmap.js paints it.
import { HANDLING_WEIGHTS } from '../advisor/handling.ts';
import { WM } from '../wording/en-weightmap.ts';
import type { Anchors, P, Placed } from './art.ts';
import type { Shape } from './shapes.ts';

export type MapItem = { pos: string; kg: number; outline: P[] };
export type Zones = { back: number; rear: number; middle: number; front: number };

/** The grid: 2-unit cells over the drawing from (0, 10), 262 by 132 units. */
export const GRID = { x: 0, y: 10, cell: 2, w: 131, h: 66 } as const;
/** Full colour, in weighted kg per 10 by 10 cm. Fixed, so two maps (or two bikes) compare honestly. */
export const FULL = 0.8;
const SIGMA = 10.5;
const weight = (pos: string): number => HANDLING_WEIGHTS[pos as keyof typeof HANDLING_WEIGHTS] ?? 1;

function inside(x: number, y: number, p: P[]): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [a, b] = [p[i]!, p[j]!];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Each bag's kg × weight shared evenly over the cells inside its outline, in weighted kg per 10 by 10 cm (`scale`: units per mm). */
export function splat(items: readonly MapItem[], scale: number): Float32Array {
  const { x: X, y: Y, cell, w: GW, h: GH } = GRID;
  const m = new Float32Array(GW * GH);
  const per10 = (100 / (cell / scale)) ** 2;
  const at = (v: number, o: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - o) / cell)));
  for (const it of items) {
    if (!(it.kg > 0) || it.outline.length < 3) continue;
    const xs = it.outline.map((p) => p[0]);
    const ys = it.outline.map((p) => p[1]);
    const cells: number[] = [];
    for (let gy = at(Math.min(...ys), Y, GH); gy <= at(Math.max(...ys), Y, GH); gy++) {
      for (let gx = at(Math.min(...xs), X, GW); gx <= at(Math.max(...xs), X, GW); gx++) {
        if (inside(X + (gx + 0.5) * cell, Y + (gy + 0.5) * cell, it.outline)) cells.push(gy * GW + gx);
      }
    }
    // smaller than a cell (or off the grid): all of it in the cell under its middle
    if (!cells.length) cells.push(at(ys.reduce((a, b) => a + b, 0) / ys.length, Y, GH) * GW + at(xs.reduce((a, b) => a + b, 0) / xs.length, X, GW));
    const v = (it.kg * weight(it.pos) * per10) / cells.length;
    for (const i of cells) m[i]! += v;
  }
  return m;
}

/** A Gaussian blur along each axis. Each cell hands its value out over the cells inside the grid, so the total is kept at the edges too. */
export function blur(m: Float32Array): Float32Array {
  const { w: GW, h: GH } = GRID;
  const s = SIGMA / GRID.cell;
  const r = Math.ceil(s * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * s * s)));
  const pass = (src: Float32Array, n: number, lines: number, at: (line: number, i: number) => number) => {
    const out = new Float32Array(src.length);
    for (let l = 0; l < lines; l++) for (let i = 0; i < n; i++) {
      const v = src[at(l, i)]!;
      if (!v) continue;
      const [lo, hi] = [Math.max(0, i - r), Math.min(n - 1, i + r)];
      let total = 0;
      for (let j = lo; j <= hi; j++) total += k[j - i + r]!;
      for (let j = lo; j <= hi; j++) out[at(l, j)]! += (v * k[j - i + r]!) / total;
    }
    return out;
  };
  return pass(pass(m, GW, GH, (y, x) => y * GW + x), GH, GW, (x, y) => y * GW + x);
}

/** The ideal's shares (design 1.3, the owner's answer 1): a fixed profile, the same for everyone. Nothing on the back. */
export function idealShares(o: { rack: boolean; frame: boolean; top: boolean }): Record<string, number> {
  const s: Record<string, number> = { frame: 0.5, top: 0.05, fork: 0.12, [o.rack ? 'rack' : 'seat']: 0.33 };
  if (!o.top) {
    if (o.frame) s.frame! += s.top!;
    else s.fork! += s.top!;
    delete s.top;
  }
  if (!o.frame) {
    // shared between top tube and fork in their own proportion
    const [f, t, k] = [s.frame!, s.top ?? 0, s.fork!];
    delete s.frame;
    if (s.top !== undefined) s.top = t + (f * t) / (t + k);
    s.fork = k + (f * k) / (t + k);
  }
  return s;
}

type ShapeFn = (pos: string, b: Placed, L: number, o?: { slot?: 'front' | 'rear' | null; frame?: string }) => Shape;

/** The ideal's bags: the same total kilos at the planner's own anchors and shapes (a pair's share over both bags). */
export function idealItems(totalKg: number, a: Anchors, o: { rack: boolean; frame: boolean; top: boolean }, shape: ShapeFn,
  pairOffset: Readonly<Record<string, P>> = { rack: [-6, 1.5], fork: [-5, -5] }): MapItem[] {
  const topBox = a.top.front ?? a.top.rear;
  const s = idealShares({ rack: o.rack, frame: o.frame && !!a.frame, top: o.top && !!topBox });
  const out: MapItem[] = [];
  const add = (pos: string, b: Placed, L: number, share: number, extra?: { slot?: 'front' | 'rear'; frame?: string }) =>
    out.push({ pos, kg: totalKg * share, outline: shape(pos, b, L, extra).outline });
  const pair = (pos: string, b: Placed, L: number) => {
    const off = pairOffset[pos]!;
    add(pos, { ...b, x: b.x + off[0], y: b.y + off[1] }, L, s[pos]! / 2);
    add(pos, b, L, s[pos]! / 2);
  };
  if (s.frame && a.frame) add('frame', { ...a.frame.boxes[0], rot: 0 }, 1, s.frame, { frame: a.frame.shapes[0] });
  if (s.top && topBox) add('top', topBox, 1.5, s.top, { slot: a.top.front ? 'front' : 'rear' });
  pair('fork', a.fork, 4);
  if (s.rack) pair('rack', a.rack, 20);
  if (s.seat) add('seat', a.seat, 16, s.seat);
  return out;
}

const ZONE: Record<string, keyof Zones> = {
  pack: 'back', seat: 'rear', rack: 'rear', deck: 'rear', frame: 'middle', top: 'middle', bottle: 'middle', bottleU: 'middle', fork: 'front', bar: 'front',
};

/** Each zone's share of the weighted load, in whole per cent adding up to 100 (largest remainders). */
export function zoneShares(items: readonly MapItem[]): Zones {
  const keys = ['back', 'rear', 'middle', 'front'] as const;
  const raw = [0, 0, 0, 0];
  for (const it of items) raw[keys.indexOf(ZONE[it.pos] ?? 'middle')]! += it.kg * weight(it.pos);
  const total = raw.reduce((x, y) => x + y, 0);
  const exact = raw.map((v) => (total > 0 ? (100 * v) / total : 0));
  const out = exact.map(Math.floor);
  const order = [0, 1, 2, 3].sort((i, j) => exact[j]! - out[j]! - (exact[i]! - out[i]!));
  for (let n = total > 0 ? 100 - out.reduce((x, y) => x + y, 0) : 0, i = 0; n > 0; n--, i++) out[order[i]!]! += 1;
  return { back: out[0]!, rear: out[1]!, middle: out[2]!, front: out[3]! };
}

export const shareLine = (z: Zones): string => WM.shares(z.back, z.rear, z.middle, z.front);

/** Where yours differs from the ideal, in points, largest first; differences under 3 points are left out. */
export function diffLine(yours: Zones, ideal: Zones): string {
  const d = (['back', 'rear', 'middle', 'front'] as const).map((k) => [k, yours[k] - ideal[k]] as const).filter((x) => Math.abs(x[1]) >= 3);
  d.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return d.length ? `${d.map(([k, v]) => WM.points(Math.abs(v), v > 0, WM.zone[k])).join(', ')}.` : WM.close;
}

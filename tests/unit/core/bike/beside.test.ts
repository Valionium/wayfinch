// The frame bag beside the plan's bottles (owner, 9 Nov 2026: the full Bag planner's three-quarter frame bag must not be drawn over a
// bottle). The bag planner's bike.js cuts each frame shape clear of the bottles the plan has inside the triangle; the co-pilot's own
// drawing and every drawing without such a bottle stay exactly as they were.
import { describe, expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { Anchors, P, Spot } from '../../../../src/core/bike/art.ts';
import { bikeArt as plannerArt, resolveBikeSpec as plannerSpec, shapedArt } from '../../../../src/core/bike/planner.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import type { BagView } from '../../../../src/core/bike/spec.ts';
import { drawingSet, setBike } from './drawing-set.ts';

type Slot = 'st' | 'dt' | 'un';
const view = (shape: number, bottles: { slot: Slot; L: number }[]): BagView => ({
  items: [{ pos: 'frame', L: [6, 4.5, 3, 1.5][shape]!, shape, fill: 0.5 }], decks: { bar: null, rack: null }, bottles,
});
const poly = (pts: string): P[] => pts.split(' ').map((q) => q.split(',').map(Number) as P);
const inPoly = (pts: P[], [x, y]: P): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const areaOf = (pts: P[]): number => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/** A grid over the bottle as the bag planner draws it (bottleArt, both pages): the cage, the bottle and its cap, turned to the tube. */
function drawnBottle(s: Spot, L: number): P[] {
  const r = L / 0.75;
  const h = 30 * Math.min(1.16, Math.max(0.78, r ** 0.45));
  const w = 9.6 * Math.min(1.08, Math.max(0.9, r ** 0.15));
  const [x, y] = [-w / 2, -h / 2];
  const rects: [number, number, number, number][] = [[x, y, w, h], [x - 2.2, y + h * 0.13, w + 4.4, h * 0.7], [x + w * 0.28, y - 2.5, w * 0.44, 3.5]];
  const a = (s.rot * Math.PI) / 180;
  const out: P[] = [];
  for (const [rx, ry, rw, rh] of rects) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 16; j++) {
    const [px, py] = [rx + (rw * i) / 8, ry + (rh * j) / 16];
    out.push([s.cx + px * Math.cos(a) - py * Math.sin(a), s.cy + px * Math.sin(a) + py * Math.cos(a)]);
  }
  return out;
}
/** The rig's anchors as the bag planner gets them: its own spec from the bike and the plan, bikeArt without the bags. */
const rig = (bike: ReturnType<typeof setBike> | null, v: BagView | null): Anchors => plannerArt(plannerSpec(bike, v), null).anchors;
const over = (a: Anchors, shape: number, bottles: { slot: Slot; L: number }[]): number =>
  bottles.filter((b) => b.slot !== 'un').reduce((n, b) => n + drawnBottle(a.bottles[b.slot]!, b.L).filter((p) => inPoly(poly(a.frame!.shapes[shape]!), p)).length, 0);

/** One bike per style, size, handlebar and e-bike of the drawing set. */
function bikes() {
  const seen = new Set<string>();
  return [...drawingSet()].filter((e) => { const k = e.name.replace(/ \S+$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }).map((e) => ({ name: e.name.replace(/ \S+$/, ''), bike: e.bike }));
}

describe('the frame bag beside the plan\'s bottles (owner, 9 Nov 2026)', () => {
  test('[BK-FRAME-BESIDE] every bike of the drawing set: the three-quarter, half and wedge frame bag are never drawn over a bottle the plan has in the triangle, at either mount, 0.5 to 1 L', () => {
    let n = 0;
    for (const { name, bike } of bikes()) {
      const m = resolveBikeSpec(bike, null).mounts;
      if (!m.frame) continue;
      const slots = (['st', 'dt'] as const).filter((s) => m[s]);
      for (const L of [0.5, 0.75, 1]) {
        // the planner's rule: one bottle in the triangle, the three-quarter shape or smaller; two, the half or the wedge
        const sets: [number, { slot: Slot; L: number }[]][] = [];
        for (const s of slots) for (const shape of [1, 2, 3]) sets.push([shape, [{ slot: s, L }]]);
        if (slots.length === 2) for (const shape of [2, 3]) sets.push([shape, slots.map((slot) => ({ slot, L }))]);
        for (const [shape, bottles] of sets) {
          const a = rig(bike, view(shape, bottles));
          expect(a.frame, name).not.toBeNull();
          expect(over(a, shape, bottles), `${name}: shape ${shape} beside ${bottles.map((b) => b.slot).join('+')} ${L} L`).toBe(0);
          n += 1;
        }
      }
    }
    expect(n).toBeGreaterThan(1500);
  }, 120_000);

  test('[BK-FRAME-BESIDE] the cut bag stays a bag inside its own triangle shape, and the three-quarter bag is never smaller than the half beside the same bottle', () => {
    for (const { name, bike } of bikes()) {
      const plain = bikeArt(resolveBikeSpec(bike, null), null).anchors.frame;
      if (!plain) continue;
      for (const slot of ['st', 'dt'] as const) {
        const bottles = [{ slot, L: 0.75 }];
        const a = rig(bike, view(1, bottles));
        if (!a.bottles[slot]) continue;
        const [three, half] = [poly(a.frame!.shapes[1]), poly(a.frame!.shapes[2])];
        for (const [i, s] of [three, half, poly(a.frame!.shapes[3])].entries()) {
          expect(s.length, `${name} ${slot} shape ${i + 1}`).toBeGreaterThanOrEqual(3);
          const whole = poly(plain.shapes[i + 1]!);
          // every corner inside (or on) the shape it was cut from
          for (const p of s) expect(inPoly(whole, p) || whole.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.02)
            || whole.some((q, k) => { const r = whole[(k + 1) % whole.length]!; const d = Math.abs((r[0] - q[0]) * (q[1] - p[1]) - (q[0] - p[0]) * (r[1] - q[1])) / Math.hypot(r[0] - q[0], r[1] - q[1]); return d < 0.02; }), `${name} ${slot} shape ${i + 1}`).toBe(true);
        }
        expect(areaOf(three) + 0.01, `${name} ${slot}`).toBeGreaterThanOrEqual(areaOf(half));
        const b = a.frame!.boxes[1];
        const bx = three.map((p) => p[0]);
        const by = three.map((p) => p[1]);
        expect(b.x).toBeCloseTo(Math.min(...bx), 1);
        expect(b.y).toBeCloseTo(Math.min(...by), 1);
        expect(b.w).toBeCloseTo(Math.max(...bx) - Math.min(...bx), 1);
        expect(b.h).toBeCloseTo(Math.max(...by) - Math.min(...by), 1);
      }
    }
  });

  test('[BK-FRAME-BESIDE] the standard bike: the three-quarter bag beside its one bottle is still clearly bigger than the half', () => {
    for (const slot of ['st', 'dt'] as const) {
      const a = rig(null, view(1, [{ slot, L: slot === 'st' ? 0.5 : 0.75 }]));
      expect(areaOf(poly(a.frame!.shapes[1])) / areaOf(poly(a.frame!.shapes[2])), slot).toBeGreaterThan(1.15);
    }
  });

  test('[BK-FRAME-BESIDE] no bottle in the triangle (none, or only under the down tube), no plan, or a shape already clear of it: the frame shapes are exactly the drawing\'s own', () => {
    const own = (bike: ReturnType<typeof setBike> | null) => bikeArt(resolveBikeSpec(bike, null), null).anchors.frame;
    for (const bike of [null, setBike('diamond-level', 'M', 'drop', false), setBike('trapeze', 'L', 'flat', true), setBike('full-suspension', 'S', 'flat', false)]) {
      expect(rig(bike, null).frame).toEqual(own(bike));
      expect(rig(bike, view(0, [])).frame).toEqual(own(bike));
      expect(rig(bike, view(1, [{ slot: 'un', L: 0.5 }])).frame).toEqual(own(bike));
    }
    // the day kit's half bag beside its down-tube bottle (PR 103) was already clear: drawn as before, the full and three-quarter too
    const day = rig(null, view(2, [{ slot: 'dt', L: 0.75 }]));
    const mine = own(null)!;
    expect(day.frame!.shapes[2]).toBe(mine.shapes[2]);
    expect(day.frame!.shapes[0]).toBe(mine.shapes[0]);
    expect(day.frame!.boxes[0]).toEqual(mine.boxes[0]);
  });

  test('[BK-FRAME-BESIDE] the co-pilot\'s drawing and the drawing\'s own anchors are untouched; the tap targets keep the whole triangle; the advisor\'s sketches draw the bag beside the bottle', () => {
    const v = view(1, [{ slot: 'st', L: 0.5 }]);
    const bike = setBike('diamond-sloping', 'M', 'drop', false);
    const before = JSON.stringify(bikeArt(resolveBikeSpec(bike, v), v).anchors);
    expect(plannerArt(plannerSpec(bike, v), v).svg).toBe(bikeArt(resolveBikeSpec(bike, v), v).svg);
    const a = rig(bike, v);
    expect(JSON.stringify(bikeArt(resolveBikeSpec(bike, v), v).anchors)).toBe(before);
    expect(a.frame!.shapes[1]).not.toBe(bikeArt(resolveBikeSpec(bike, null), null).anchors.frame!.shapes[1]);
    const hit = (a as Anchors & { hits: { key: string; pts?: string }[] }).hits.find((h) => h.key === 'frame')!;
    expect(hit.pts).toBe(a.frame!.shapes[0]);
    // the same plan asked twice gives the same anchors (kept, not worked out again)
    expect(rig(bike, v)).toBe(a);
    // the Gear advisor's sketch: no point of its bottle inside its frame bag's silhouette
    const svg = shapedArt(plannerSpec(bike, v), v).svg;
    const shell = /<g class="bk-bag"><path class="bk-shell" d="([^"]+)"/.exec(svg.slice(svg.indexOf('bk-bottle')))!;
    const outline = (shell[1]!.match(/-?\d*\.?\d+/g) ?? []).map(Number).reduce<P[]>((o, v, i, all) => (i % 2 ? o : [...o, [v, all[i + 1]!] as P]), []);
    expect(drawnBottle(a.bottles.st!, 0.5).filter((p) => inPoly(outline, p)).length).toBe(0);
  });
});

// Real bag shapes (weight map and bag shapes design, section 2): each shape is a silhouette plus inside lines, sized by the cube root of its
// litres, and its outline never leaves the anchor box, so the bag planner's tap targets, stacking and tags keep working.
import { describe, expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { Anchors, P, Placed } from '../../../../src/core/bike/art.ts';
import { bagShape, LARGEST, PAIR_OFFSET, sizeFactor } from '../../../../src/core/bike/shapes.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { bikeArt as plannerBikeArt, shapedArt as plannerArt } from '../../../../src/core/bike/planner.ts';
import { targetsOf } from '../../../../src/core/bike/targets.ts';
import { boundsOf, drawingSet, elements } from './drawing-set.ts';

/** The point turned back by -rot about the box's centre, so it can be compared with the unturned box. */
const unturn = (p: P, b: Placed): P => {
  const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
  const a = (-b.rot * Math.PI) / 180;
  return [cx + (p[0] - cx) * Math.cos(a) - (p[1] - cy) * Math.sin(a), cy + (p[0] - cx) * Math.sin(a) + (p[1] - cy) * Math.cos(a)];
};
const inside = (outline: P[], b: Placed) => outline.every((p) => {
  const [x, y] = unturn(p, b);
  return x >= b.x - 0.02 && x <= b.x + b.w + 0.02 && y >= b.y - 0.02 && y <= b.y + b.h + 0.02;
});

/** Each anchor once per bike: the seven places a shape is drawn at. */
function places(a: Anchors): [string, Placed, { slot?: 'front' | 'rear'; frame?: string }][] {
  const out: [string, Placed, { slot?: 'front' | 'rear'; frame?: string }][] = [
    ['seat', a.seat, {}], ['bar', a.bar, {}], ['fork', a.fork, {}], ['rack', a.rack, {}], ['pack', a.pack, {}],
  ];
  if (a.top.front) out.push(['top', a.top.front, { slot: 'front' }]);
  if (a.top.rear) out.push(['top', a.top.rear, { slot: 'rear' }]);
  if (a.frame) a.frame.shapes.forEach((s, i) => out.push(['frame', { ...a.frame!.boxes[i]!, rot: 0 }, { frame: s }]));
  return out;
}

const LITRES = [0.05, 0.5, 1, 3, 8, 14, 20, 30, 60];

describe('real bag shapes (design section 2)', () => {
  test('[BK-SHAPES] every bike of the drawing set: each shape, small to past its largest, keeps its outline inside its anchor box', () => {
    let n = 0;
    const seen = new Set<string>();
    for (const e of drawingSet()) {
      if (seen.has(e.name.replace(/ \S+$/, ''))) continue; // the bike, not its bag set, decides the anchors
      seen.add(e.name.replace(/ \S+$/, ''));
      const a = bikeArt(resolveBikeSpec(e.bike, null), null).anchors;
      for (const [pos, box, o] of places(a)) for (const L of LITRES) {
        const s = bagShape(pos, box, L, o);
        expect(s.outline.length, `${e.name} ${pos}`).toBeGreaterThanOrEqual(3);
        expect(inside(s.outline, box), `${e.name} ${pos} ${L} L`).toBe(true);
        expect(s.d, `${e.name} ${pos}`).toMatch(/^M[\d. -]+/);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(1000);
  }, 60_000);

  test('[BK-SHAPES] size follows the cube root of the litres, never under 0.55, never over 1; frame bags keep the frame shape', () => {
    expect(sizeFactor('seat', 16)).toBe(1);
    expect(sizeFactor('seat', 40)).toBe(1);
    expect(sizeFactor('seat', 2)).toBeCloseTo(0.55, 5);
    expect(sizeFactor('rack', 10)).toBeCloseTo(Math.cbrt(0.5), 5);
    expect(sizeFactor('top', 0.75)).toBeCloseTo(Math.cbrt(0.5), 5);
    expect(LARGEST).toEqual({ top: 1.5, fork: 4, bar: 16, seat: 16, rack: 20, pack: 30 });
    const a = bikeArt(resolveBikeSpec(null, null), null).anchors;
    const width = (pos: string, box: Placed, L: number) => { const xs = bagShape(pos, box, L).outline.map((p) => p[0]); return Math.max(...xs) - Math.min(...xs); };
    for (const pos of ['seat', 'rack', 'pack'] as const) {
      expect(width(pos, a[pos], LARGEST[pos]! / 8), pos).toBeLessThan(width(pos, a[pos], LARGEST[pos]!));
    }
    const frameBox = { ...a.frame!.boxes[0], rot: 0 };
    expect(bagShape('frame', frameBox, 1, { frame: a.frame!.shapes[0] }).outline).toEqual(bagShape('frame', frameBox, 20, { frame: a.frame!.shapes[0] }).outline);
  });

  test('[BK-SHAPES] a shape is a silhouette and inside lines; the inside lines are decoration, and the empty spot has none', () => {
    const a = bikeArt(resolveBikeSpec(null, null), null).anchors;
    for (const [pos, box, o] of places(a)) {
      const s = bagShape(pos, box, 6, o);
      expect(s.detail, pos).toMatch(/<path /);
      expect(s.detail, pos).not.toMatch(/bk-shell/);
      expect(s.box.w * s.box.h, pos).toBeGreaterThan(20);
    }
    expect(PAIR_OFFSET).toEqual({ rack: [-6, 1.5], fork: [-5, -5] });
  });

  test("[BK-PANNIER-RAIL] panniers hang from the rack rail on their hooks (owner's answer 2), their feet above the axle, the far one too", () => {
    const seen = new Set<string>();
    for (const e of drawingSet()) {
      const key = e.name.replace(/ \S+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = bikeArt(resolveBikeSpec(e.bike, null), null).anchors;
      const rail = a.rackTop.y + a.rackTop.h + 0.6; // the rack's top line, under its deck
      expect(a.rack.y - rail, `${e.name}: hangs from the rail`).toBeGreaterThan(0);
      expect(a.rack.y - rail, `${e.name}: hangs from the rail`).toBeLessThan(4);
      expect(a.rack.y + a.rack.h + PAIR_OFFSET.rack![1], `${e.name}: feet above the axle`).toBeLessThan(a.wheels.rear.cy);
      // the hooks reach up over the rail
      const s = bagShape('rack', a.rack, 20);
      const hookTops = [...s.detail.matchAll(/class="bk-hook" d="M[\d.]+ [\d.]+ L[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
      expect(hookTops.length, e.name).toBe(2);
      for (const y of hookTops) expect(y, e.name).toBeLessThan(rail);
    }
  }, 60_000);

  test("[BK-SEAT-OWN] the seat pack and the rear top tube bag each have their own outline (owner's drawing note): neither is the front top tube bag turned round", () => {
    const a = bikeArt(resolveBikeSpec(null, null), null).anchors;
    // the outline's edges, walked in small steps, so a height can be read anywhere along the bag
    const dense = (o: P[]): P[] => o.flatMap((p, i) => { const q = o[(i + 1) % o.length]!; return Array.from({ length: 20 }, (_, t): P => [p[0] + (q[0] - p[0]) * t / 20, p[1] + (q[1] - p[1]) * t / 20]); });
    const heightAt = (outline: P[], box: Placed, share: number) => {
      const pts = dense(outline).map((p) => unturn(p, box));
      const xs = pts.map((p) => p[0]);
      const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
      const x = x0 + (x1 - x0) * share;
      const near = pts.filter((p) => Math.abs(p[0] - x) <= (x1 - x0) * 0.03);
      const ys = near.map((p) => p[1]);
      return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
    };
    // The seat pack: full height at the saddle (right), a rounded tail well under half that height, a roll-top closure at the tail.
    const seat = bagShape('seat', a.seat, 14);
    expect(heightAt(seat.outline, a.seat, 0.02)).toBeLessThan(heightAt(seat.outline, a.seat, 0.85) * 0.6);
    expect(seat.detail).toMatch(/bk-roll/);
    expect(seat.detail).not.toMatch(/bk-zip/);
    // The rear top tube bag: as tall at the seat tube as at its front, strapped round the seat tube.
    const rear = bagShape('top', a.top.rear!, 1, { slot: 'rear' });
    const front = bagShape('top', a.top.front!, 1, { slot: 'front' });
    expect(Math.abs(heightAt(rear.outline, a.top.rear!, 0.2) - heightAt(rear.outline, a.top.rear!, 0.8))).toBeLessThan(0.6);
    expect(heightAt(front.outline, a.top.front!, 0.9)).toBeGreaterThan(heightAt(front.outline, a.top.front!, 0.1) + 1);
    expect(rear.detail).toMatch(/bk-post-strap/);
  });
});

describe("the bag planner's drawing (bike.js)", () => {
  test('[BK-SHAPES] each bag of the plan is drawn as its shape: one silhouette per bag, inside lines hidden from screen readers, nothing outside the view', () => {
    for (const e of drawingSet()) {
      if (!e.bags) continue;
      const art = plannerArt(resolveBikeSpec(e.bike, e.bags), e.bags);
      const units = e.bags.items.filter((i) => (i.pos !== 'frame' || art.anchors.frame) && (i.pos !== 'top' || art.anchors.top[i.slot ?? 'front'])).reduce((n, i) => n + (i.pair ? 2 : 1), 0);
      expect((art.svg.match(/<path class="bk-shell"/g) ?? []).length, e.name).toBe(units);
      expect((art.svg.match(/<g class="bk-detail" aria-hidden="true">/g) ?? []).length, e.name).toBe(units);
      expect(art.svg, e.name).not.toMatch(/<rect class="bk-shell"[^>]*\/><path class="bk-fill"/);
      for (const el of elements(art.svg)) {
        if (el.attrs.class) for (const c of el.attrs.class.split(' ')) expect(c, e.name).toMatch(/^bk(-[a-z]+)*$/);
        const b = el.tag === 'clipPath' ? null : boundsOf(el);
        if (b && el.tag !== 'path') { expect(b.x0, e.name).toBeGreaterThanOrEqual(-0.01); expect(b.x1, e.name).toBeLessThanOrEqual(320.01); }
      }
      // the co-pilot's own drawing, and bike.js's bikeArt with it (C-DRAWING-SET), keep their boxes: its first screen does not carry the shapes
      expect(bikeArt(resolveBikeSpec(e.bike, e.bags), e.bags).svg, e.name).not.toMatch(/bk-detail/);
      expect(plannerBikeArt(resolveBikeSpec(e.bike, e.bags), e.bags).svg, e.name).toBe(bikeArt(resolveBikeSpec(e.bike, e.bags), e.bags).svg);
    }
  }, 60_000);
});

describe('the tags around the bags', () => {
  test('[BK-PANNIER-RAIL] the RACK tag sits clear of the pannier pair and of the chainstay (review of PR 71, M1)', () => {
    const seen = new Set<string>();
    for (const e of drawingSet()) {
      const key = e.name.replace(/ \S+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = bikeArt(resolveBikeSpec(e.bike, null), null).anchors;
      const [x, y] = targetsOf(a).tags.rack!;
      // the text "RACK ×2" at 5.6 units: about 30 wide, 5 tall above its baseline, centred on x
      const box = { x0: x - 15, x1: x + 15, y0: y - 5, y1: y + 0.5 };
      const off = PAIR_OFFSET.rack!;
      for (const p of [a.rack, { ...a.rack, x: a.rack.x + off[0], y: a.rack.y + off[1] }]) {
        const foot = Math.max(...bagShape('rack', p, 20).outline.map((q) => q[1]));
        expect(box.y0, `${e.name}: under the pannier`).toBeGreaterThan(foot + 1);
      }
      // the chainstay, from the rear axle to the bottom bracket, never crosses the text
      const [r, b] = [a.points.rear, a.points.bb];
      for (let t = 0; t <= 1; t += 0.02) {
        const [cx, cy] = [r[0] + (b[0] - r[0]) * t, r[1] + (b[1] - r[1]) * t];
        expect(cx >= box.x0 && cx <= box.x1 && cy >= box.y0 - 1 && cy <= box.y1 + 1, `${e.name}: chainstay at ${cx.toFixed(1)}, ${cy.toFixed(1)}`).toBe(false);
      }
    }
  });
});

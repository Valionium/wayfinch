// The bag planner's tap targets and tags on the drawing (spec section 7.4, "Editing stays in the bag planner"), worked out from
// bikeArt's anchors. Only the bag planner's /tools/bags/bike.js uses them, so the co-pilot's first screen does not carry them.
import { boxOf, corners } from './art.ts';
import type { Anchors, Box, Circle, P } from './art.ts';
import { PAIR_OFFSET } from './shapes.ts';

export type Hit = { key: string; kind: 'rect' | 'poly' | 'circle'; box: Box; circle?: Circle; pts?: string };
export type Targets = { hits: Hit[]; tags: Record<string, P> };

const VIEW_W = 320;
const VIEW_H = 150;
const pad = (b: Box, d: number): Box => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
const union = (a: Box, b: Box): Box => boxOf([[a.x, a.y], [a.x + a.w, a.y + a.h], [b.x, b.y], [b.x + b.w, b.y + b.h]]);
const clampBox = (b: Box): Box => {
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return { x, y, w: Math.min(VIEW_W, b.x + b.w) - x, h: Math.min(VIEW_H, b.y + b.h) - y };
};

/** The tap targets: one per place a bag, deck or bottle can go, none overlapping. */
export function hitsOf(a: Anchors): Hit[] {
  const { rack, rackTop, barDeck, fork, frame, bottles } = a;
  const { seat: seatAll, bar: barAll, pack: packAll } = a.stacks;
  const topRear = a.top.rear;
  const topFront = a.top.front;
  const hits: Hit[] = [];
  const rectHit = (key: string, b: Box) => hits.push({ key, kind: 'rect', box: clampBox(b) });
  rectHit('pack', pad(packAll, 5));
  rectHit('seat', pad(seatAll, 4));
  rectHit('rack', pad(union(rack, { ...rack, x: rack.x + PAIR_OFFSET.rack![0], y: rack.y + PAIR_OFFSET.rack![1] }), 4));
  rectHit('rackTop', pad(rackTop, 3));
  rectHit('bar', pad(barAll, 4));
  rectHit('barDeck', pad(barDeck, 3));
  if (topRear) rectHit('top:rear', pad(boxOf(corners(topRear)), 2.5));
  if (topFront) rectHit('top:front', pad(boxOf(corners(topFront)), 2.5));
  rectHit('fork', pad(union(boxOf(corners(fork)), boxOf(corners({ ...fork, x: fork.x - 5, y: fork.y - 5 }))), 3));
  if (frame) hits.push({ key: 'frame', kind: 'poly', box: frame.boxes[0], pts: frame.shapes[0] });
  for (const k of ['st', 'dt', 'un'] as const) {
    const b = bottles[k];
    if (b) hits.push({ key: `bottle:${k}`, kind: 'circle', box: { x: b.cx - 9, y: b.cy - 9, w: 18, h: 18 }, circle: { cx: b.cx, cy: b.cy, r: 9 } });
  }
  separate(hits);
  return hits;
}

/** Where each place's tag sits. */
export function tagsOf(a: Anchors): Record<string, P> {
  const tagAt = (b: Box, dy = -2.5): P => [Math.min(VIEW_W - 12, Math.max(12, b.x + b.w / 2)), Math.min(VIEW_H - 2, Math.max(8, b.y + dy))];
  const { rack, fork, frame } = a;
  const topFront = a.top.front;
  return {
    // the pannier pair hangs to the axle: its tag goes under the axle, clear of the panniers and the chainstay (review of PR 71, M1)
    seat: tagAt(a.stacks.seat), bar: tagAt(a.stacks.bar), pack: tagAt(a.stacks.pack), rack: tagAt(rack, Math.max(rack.h + 8, a.wheels.rear.cy + 12 - rack.y)), fork: [Math.min(VIEW_W - 12, fork.x + fork.w + 6), fork.y + fork.h / 2],
    ...(topFront ? { top: tagAt(boxOf(corners(topFront)), -1.5) } : {}), ...(frame ? { frame: tagAt(frame.boxes[0], frame.boxes[0].h + 9) } : {}),
  };
}

const MEMO = new WeakMap<Anchors, Targets>();
/** The targets and tags of one drawing's anchors, worked out on first use and kept with them (the anchors are shared: read them only). */
export function targetsOf(a: Anchors): Targets {
  let t = MEMO.get(a);
  if (!t) {
    let hits: Hit[] | undefined;
    let tags: Record<string, P> | undefined;
    t = { get hits() { return (hits ??= hitsOf(a)); }, get tags() { return (tags ??= tagsOf(a)); } };
    MEMO.set(a, t);
  }
  return t;
}

/** Trims rectangle targets so no two overlap: each pair is split along its shallower overlap; a bottle's circle wins over a rectangle. */
function separate(hits: Hit[]): void {
  const rects = hits.filter((h) => h.kind === 'rect');
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]!.box;
      const b = rects[j]!.box;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) {
        const l = a.x < b.x ? a : b;
        const r = a.x < b.x ? b : a;
        const mid = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
        l.w = mid - l.x;
        r.w = r.x + r.w - mid;
        r.x = mid;
      } else {
        const t = a.y < b.y ? a : b;
        const u = a.y < b.y ? b : a;
        const mid = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2;
        t.h = mid - t.y;
        u.h = u.y + u.h - mid;
        u.y = mid;
      }
    }
  }
  const circles = hits.filter((h) => h.kind === 'circle');
  for (let i = 0; i < circles.length; i += 1) for (let j = i + 1; j < circles.length; j += 1) {
    const a = circles[i]!.circle!;
    const b = circles[j]!.circle!;
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    if (d < a.r + b.r) a.r = b.r = Math.max(4, d / 2 - 0.05);
  }
  for (const c of circles) {
    const cc = c.circle!;
    c.box = { x: cc.cx - cc.r, y: cc.cy - cc.r, w: 2 * cc.r, h: 2 * cc.r };
    for (const r of rects) {
      const b = r.box;
      const dx = Math.max(b.x - cc.cx, 0, cc.cx - (b.x + b.w));
      const dy = Math.max(b.y - cc.cy, 0, cc.cy - (b.y + b.h));
      if (Math.hypot(dx, dy) >= cc.r) continue;
      // Cut the rectangle back on the side that costs it least.
      const left = cc.cx + cc.r - b.x;
      const right = b.x + b.w - (cc.cx - cc.r);
      const top = cc.cy + cc.r - b.y;
      const bottom = b.y + b.h - (cc.cy - cc.r);
      const least = Math.min(left, right, top, bottom);
      if (least === left) { b.w -= left; b.x += left; }
      else if (least === right) b.w -= right;
      else if (least === top) { b.h -= top; b.y += top; }
      else b.h -= bottom;
    }
  }
}

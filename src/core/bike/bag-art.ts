// The bag planner's bags on its bike (bike.js only): the plan's bags as their real shapes (shapes.ts), in the order bikeArt draws its
// boxes: panniers and the rack-top deck, the bottles inside the triangle, the frame bag, top-tube bags, seat pack, bar roll, fork bags,
// the bar deck, the bottle under the down tube, backpack. The co-pilot's own drawing keeps its boxes, so its first screen stays as it is.
import { bottleArt, deck, fillColour, inside } from './art.ts';
import type { Anchors, P, Placed } from './art.ts';
import { bagShape, PAIR_OFFSET } from './shapes.ts';
import type { Shape } from './shapes.ts';
import type { BagItem, BagView } from './spec.ts';

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** One bag: the silhouette, the fill rising level from its bottom (clipped to the silhouette), the inside lines. */
export function shapeArt(s: Shape, pct: number, theme: 'dark' | 'light', id: string, cls = 'bk-bag'): string {
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const b = s.box;
  const fh = (b.h + 2) * p;
  const fill = p > 0 ? `<clipPath id="${id}"><path d="${s.d}"/></clipPath><rect class="bk-fill" fill="${fillColour(p, theme)}" clip-path="url(#${id})" x="${r2(b.x - 1)}" y="${r2(b.y + b.h + 1 - fh)}" width="${r2(b.w + 2)}" height="${r2(fh)}"/>` : '';
  const turn = s.rot ? ` transform="rotate(${r2(s.rot)} ${r2(s.c[0])} ${r2(s.c[1])})"` : '';
  return `<g class="${cls}"${turn}><path class="bk-shell" d="${s.d}"/>${fill}<g class="bk-detail" aria-hidden="true">${s.detail}</g></g>`;
}

export function bagLayer(view: BagView, a: Anchors, theme: 'dark' | 'light', prefix: string): string {
  const art: string[] = [];
  let n = 0;
  const fills = (item: BagItem): number[] => {
    const list = Array.isArray(item.fill) ? (item.fill as number[]) : [item.fill as number];
    return (item.pair ? [list[0] ?? 0, list[1] ?? list[0] ?? 0] : [list[0] ?? 0]).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  };
  const draw = (pos: string, p: Placed, item: BagItem, pct: number, cls?: string, frame?: string) =>
    art.push(shapeArt(bagShape(pos, p, item.L, { slot: item.slot ?? null, frame }), pct, theme, `${prefix}s${n++}`, cls));
  const of = (pos: string) => view.items.filter((i) => i.pos === pos);
  const pairs = (pos: string, base: Placed) => {
    const off: P = PAIR_OFFSET[pos]!;
    for (const item of of(pos)) {
      const [first, second] = fills(item);
      if (second !== undefined) draw(pos, { ...base, x: base.x + off[0], y: base.y + off[1] }, item, first!, 'bk-bag bk-far');
      draw(pos, base, item, second ?? first!);
    }
  };
  const stacked = (pos: string, base: Placed, gap: number, cls?: string) => {
    const items = of(pos);
    const step = items.length > 1 ? Math.min(base.h + gap, Math.max(4, (base.y - 1) / (items.length - 1))) : 0;
    items.forEach((item, i) => draw(pos, inside({ ...base, y: base.y - i * step }), item, fills(item)[0]!, cls));
  };
  const bottles = (inTriangle: boolean) => {
    for (const b of view.bottles) {
      const s = a.bottles[b.slot];
      if (s && (b.slot !== 'un') === inTriangle) art.push(bottleArt(s, b.L));
    }
  };
  pairs('rack', a.rack);
  if (view.decks.rack !== null) deck(art, a.rackTop, view.decks.rack);
  bottles(true);
  const frameItem = of('frame')[0];
  if (frameItem && a.frame) {
    const i = Math.max(0, Math.min(3, Math.round(frameItem.shape ?? 0)));
    draw('frame', { ...a.frame.boxes[i]!, rot: 0 }, frameItem, fills(frameItem)[0]!, undefined, a.frame.shapes[i]);
  }
  of('top').forEach((item, i) => {
    const slot = item.slot ?? (i === 0 ? 'front' : 'rear');
    const p = slot === 'rear' ? a.top.rear : a.top.front;
    if (p) draw('top', p, { ...item, slot }, fills(item)[0]!);
  });
  stacked('seat', a.seat, 2);
  stacked('bar', a.bar, 2);
  pairs('fork', a.fork);
  if (view.decks.bar !== null) deck(art, a.barDeck, view.decks.bar);
  bottles(false);
  stacked('pack', { ...a.pack, y: a.pack.y + 37 * Math.max(0, of('pack').length - 1) }, 3, 'bk-bag bk-onbody');
  return art.join('');
}

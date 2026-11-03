// The drawing set of contracts/drawing-set, expanded, and a small reader for the drawing's markup.
import axes from '../../../../contracts/drawing-set/axes.json';
import bagSets from '../../../../contracts/drawing-set/bags.json';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import type { BagView } from '../../../../src/core/bike/spec.ts';

export const BAG_SETS = bagSets.sets as unknown as Record<string, BagView | null>;
export const STYLES = axes.styles;
export const SIZES = axes.sizes;

export type Entry = { name: string; bike: BikeRecord; bags: BagView | null };

export function setBike(style: string, size: string, bars: string, ebike: boolean, tyres: string[] = ['', ''], colour: string | null = null, fields: Record<string, unknown> = {}): BikeRecord {
  return normaliseBike({
    id: 'set', fit: { style, size: { kind: 'letter', value: size } }, look: { bars, ebike, colour }, frontTyre: tyres[0], rearTyre: tyres[1], ...fields,
  })!;
}

/** Each style x size x handlebar x e-bike, with and without each bag set (default tyres, no colour). */
export function* drawingSet(): Generator<Entry> {
  for (const style of axes.styles) for (const size of axes.sizes) for (const bars of axes.bars) for (const ebike of axes.ebike) {
    for (const [set, bags] of Object.entries(BAG_SETS)) {
      yield { name: `${style} ${size} ${bars}${ebike ? ' e-bike' : ''} ${set}`, bike: setBike(style, size, bars, ebike), bags };
    }
  }
}

/** Each style x size with each tyre and colour, and the fullest bag set. */
export function* tyreSet(): Generator<Entry> {
  for (const style of axes.styles) for (const size of axes.sizes) for (const tyres of axes.tyres) for (const colour of axes.colours) {
    yield { name: `${style} ${size} ${tyres.join('/')} ${colour}`, bike: setBike(style, size, 'drop', false, tyres, colour), bags: BAG_SETS.everything! };
  }
}

export type El = { tag: string; attrs: Record<string, string>; transforms: string[] };

/** Every element of an SVG string with its attributes and the rotations of the groups around it. */
export function elements(svg: string): El[] {
  const out: El[] = [];
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g)) {
    const [, close, tag, rest, self] = m as unknown as [string, string, string, string, string];
    if (close) { if (tag === 'g') stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    for (const a of rest.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push({ tag, attrs, transforms: [...stack] });
    if (tag === 'g' && !self) stack.push(attrs.transform ?? '');
  }
  return out;
}

const rotate = ([x, y]: [number, number], t: string): [number, number] => {
  const m = /^rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/.exec(t);
  if (!m) return [x, y];
  const [a, cx, cy] = [Number(m[1]) * Math.PI / 180, Number(m[2]), Number(m[3])];
  return [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
};

/** The points that bound an element's shape (its control points for curves), widened by half its stroke, in viewBox units. */
export function boundsOf(el: El): { x0: number; y0: number; x1: number; y1: number } | null {
  const n = (k: string) => Number(el.attrs[k] ?? 0);
  const sw = n('stroke-width') / 2;
  let pts: [number, number][] = [];
  let pad = sw;
  if (el.tag === 'circle') { pts = [[n('cx') - n('r'), n('cy') - n('r')], [n('cx') + n('r'), n('cy') + n('r')]]; }
  else if (el.tag === 'rect') { pts = [[n('x'), n('y')], [n('x') + n('width'), n('y')], [n('x'), n('y') + n('height')], [n('x') + n('width'), n('y') + n('height')]]; }
  else if (el.tag === 'polygon') { const v = el.attrs.points!.trim().split(/[\s,]+/).map(Number); for (let i = 0; i < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]); }
  else if (el.tag === 'path') { const v = (el.attrs.d!.match(/-?\d*\.?\d+/g) ?? []).map(Number); for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i]!, v[i + 1]!]); }
  else return null;
  if (el.tag === 'circle' || el.tag === 'rect') pad = sw;
  for (const t of [...el.transforms].reverse()) pts = pts.map((p) => rotate(p, t));
  if (el.attrs.transform) pts = pts.map((p) => rotate(p, el.attrs.transform!));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

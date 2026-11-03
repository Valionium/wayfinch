import { readFileSync } from 'node:fs';
import { test as fcTest, fc } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { bikeArt, markerArt } from '../../../../src/core/bike/art.ts';
import type { Anchors, Box } from '../../../../src/core/bike/art.ts';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import type { BagView } from '../../../../src/core/bike/spec.ts';
import { BAG_SETS, SIZES, STYLES, boundsOf, drawingSet, elements, setBike, tyreSet } from './drawing-set.ts';

const ALLOWED = new Set(['svg', 'defs', 'clipPath', 'g', 'path', 'circle', 'rect', 'polygon']);
const COLOUR = /^(#[0-9a-f]{6}|rgb\(\d{1,3},\d{1,3},\d{1,3}\)|none)$/;

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
const circleBox = (c: { cx: number; cy: number; r: number }): Box => ({ x: c.cx - c.r, y: c.cy - c.r, w: 2 * c.r, h: 2 * c.r });
const circlesMeet = (a: { cx: number; cy: number; r: number }, b: { cx: number; cy: number; r: number }) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - 1e-6;
const circleMeetsBox = (c: { cx: number; cy: number; r: number }, b: Box) => {
  const dx = Math.max(b.x - c.cx, 0, c.cx - (b.x + b.w));
  const dy = Math.max(b.y - c.cy, 0, c.cy - (b.y + b.h));
  return Math.hypot(dx, dy) < c.r - 1e-6;
};

function checkMarkup(svg: string, name: string) {
  const els = elements(svg);
  expect(els[0]!.tag, name).toBe('svg');
  expect(els[0]!.attrs.viewBox, name).toBe('0 0 320 150');
  expect(svg, name).not.toMatch(/href|<script|<style|<image|<foreignObject|on[a-z]+=/i);
  const ids = new Set(els.filter((e) => e.tag === 'clipPath').map((e) => e.attrs.id));
  for (const el of els) {
    expect(ALLOWED.has(el.tag), `${name}: <${el.tag}>`).toBe(true);
    if (el.attrs.class) for (const c of el.attrs.class.split(' ')) expect(c, name).toMatch(/^bk(-[a-z]+)*$/);
    for (const k of ['stroke', 'fill']) if (el.attrs[k] !== undefined) expect(el.attrs[k], `${name}: ${k}`).toMatch(COLOUR);
    if (el.attrs['clip-path'] !== undefined) {
      const m = /^url\(#([\w-]+)\)$/.exec(el.attrs['clip-path']!);
      expect(m && ids.has(m[1]!), `${name}: clip ${el.attrs['clip-path']}`).toBe(true);
    }
    expect(Object.values(el.attrs).join(' ').replace(/url\(#[\w-]+\)/g, ''), name).not.toContain('url(');
    const b = boundsOf(el);
    if (b && !isInClip(els, el)) {
      const what = `${name}: <${el.tag} ${el.attrs.class ?? ''}>`;
      expect(b.x0, `${what} left`).toBeGreaterThanOrEqual(-0.01);
      expect(b.y0, `${what} top`).toBeGreaterThanOrEqual(-0.01);
      expect(b.x1, `${what} right`).toBeLessThanOrEqual(320.01);
      expect(b.y1, `${what} bottom`).toBeLessThanOrEqual(150.01);
    }
  }
}
/** Clip-path shapes sit inside <defs>; they draw nothing themselves. */
function isInClip(els: ReturnType<typeof elements>, el: ReturnType<typeof elements>[number]): boolean {
  const i = els.indexOf(el);
  return i > 0 && els[i - 1]!.tag === 'clipPath';
}

function checkAnchors(a: Anchors, name: string, mounts: { st: boolean; dt: boolean; un: boolean; top: boolean; frame: boolean }) {
  expect(a.top.front !== null, `${name}: top front`).toBe(mounts.top);
  expect(a.top.rear !== null, `${name}: top rear`).toBe(mounts.top);
  expect(a.frame !== null, `${name}: frame`).toBe(mounts.frame);
  for (const k of ['st', 'dt', 'un'] as const) expect(a.bottles[k] !== null, `${name}: bottle ${k}`).toBe(mounts[k]);
  for (const k of ['seat', 'bar', 'fork', 'rack', 'rackTop', 'barDeck'] as const) expect(a[k], `${name}: ${k}`).not.toBeNull();
  // The backpack stays off the bike: wholly behind the rear wheel.
  expect(a.pack.x + a.pack.w, `${name}: backpack`).toBeLessThan(a.wheels.rear.cx - a.wheels.rear.r);
  // Tap targets never overlap (spec section 14). A bottle sits on top of the frame bag's shape, as in the bag planner today.
  const rects = a.hits.filter((h) => h.kind === 'rect');
  const circles = a.hits.filter((h) => h.kind === 'circle');
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    expect(overlap(rects[i]!.box, rects[j]!.box), `${name}: ${rects[i]!.key} and ${rects[j]!.key}`).toBe(false);
  }
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) expect(circlesMeet(circles[i]!.circle!, circles[j]!.circle!), `${name}: ${circles[i]!.key} and ${circles[j]!.key}`).toBe(false);
    for (const r of rects) expect(circleMeetsBox(circles[i]!.circle!, r.box), `${name}: ${circles[i]!.key} and ${r.key}`).toBe(false);
  }
  // Each target holds its own place: a target never loses its centre to another.
  for (const h of a.hits) expect(h.box.w * h.box.h, `${name}: ${h.key} size`).toBeGreaterThan(40);
  void circleBox;
}

describe('bikeArt (spec section 7.4)', () => {
  test('[BK-ART-ANCHORS] every style, size, handlebar, e-bike and bag set of the drawing set: clean markup, anchors where the frame takes them, no overlapping tap targets', () => {
    let n = 0;
    for (const e of drawingSet()) {
      const spec = resolveBikeSpec(e.bike, e.bags);
      const art = bikeArt(spec, e.bags);
      checkMarkup(art.svg, e.name);
      checkAnchors(art.anchors, e.name, spec.mounts);
      n += 1;
    }
    expect(n).toBe(7 * 5 * 3 * 2 * Object.keys(BAG_SETS).length);
  }, 60_000);

  test('[BK-ART-ANCHORS] a step-through has no top tube, a trapeze a low one, a mixte twin tubes, full suspension a shock', () => {
    const tubes = (style: string) => bikeArt(resolveBikeSpec(setBike(style, 'M', 'flat', false), null), null).anchors.tubes;
    expect(tubes('step-through')).toMatchObject({ top: null, low: null, twin: null, shock: null });
    expect(tubes('trapeze').top).toBeNull();
    expect(tubes('trapeze').low).not.toBeNull();
    expect(tubes('mixte').twin).not.toBeNull();
    expect(tubes('mixte').top).toBeNull();
    expect(tubes('full-suspension').shock).not.toBeNull();
    for (const style of ['diamond-level', 'diamond-sloping', 'compact']) expect(tubes(style), style).toMatchObject({ low: null, twin: null, shock: null });
    for (const style of ['diamond-level', 'diamond-sloping', 'compact', 'full-suspension']) expect(tubes(style).top, style).not.toBeNull();
    // A trapeze's low tube sits well below where a top tube would be.
    const t = bikeArt(resolveBikeSpec(setBike('trapeze', 'M', 'flat', false), null), null).anchors;
    expect(t.tubes.low![0][1]).toBeGreaterThan(t.points.seatTop[1] + 8);
    expect(t.tubes.low![1][1]).toBeGreaterThan(t.points.headTop[1] + 8);
    // A level top tube is level, a compact one slopes more than a sloping one.
    const slope = (style: string) => { const a = bikeArt(resolveBikeSpec(setBike(style, 'M', 'drop', false), null), null).anchors.tubes.top!; return (a[1][1] - a[0][1]) / (a[1][0] - a[0][0]); };
    expect(Math.abs(slope('diamond-level'))).toBeLessThan(0.05);
    expect(slope('compact')).toBeLessThan(slope('diamond-sloping'));
  });

  test('[BK-ART-ANCHORS] the bike alone stays within 40 elements; bags, bottles and decks are drawn only from the plan', () => {
    for (const style of STYLES) for (const ebike of [false, true]) {
      const spec = resolveBikeSpec(normaliseBike({ id: 'x', fit: { style }, look: { ebike, colour: '#2f7d4f', bars: 'drop' }, brakes: 'hydraulic-disc', drive: 'derailleur' }), BAG_SETS.touring!);
      const els = elements(bikeArt(spec, null).svg);
      expect(els.length, style).toBeLessThanOrEqual(40);
      expect(els.some((e) => /bk-bag|bk-bottle|bk-deck/.test(e.attrs.class ?? '')), style).toBe(false);
    }
    const full = bikeArt(resolveBikeSpec(null, BAG_SETS.everything!), BAG_SETS.everything!).svg;
    const classes = elements(full).map((e) => e.attrs.class ?? '');
    expect(classes.filter((c) => c.includes('bk-bag')).length).toBe(13); // pairs drawn twice: 11 entries, 2 pairs
    expect(classes.filter((c) => c === 'bk-bottle').length).toBe(3);
    expect(classes.filter((c) => c.includes('bk-deck')).length).toBe(2);
  });
});

describe('scale and fit (spec section 7.4)', () => {
  test('[BK-FIT-BOX] the outer wheel diameter is the rim plus twice the tyre, at 0.11 units per mm unless the bike shrinks to fit', () => {
    for (const e of tyreSet()) {
      const spec = resolveBikeSpec(e.bike, e.bags);
      const { anchors, svg } = bikeArt(spec, e.bags);
      expect(anchors.scale, e.name).toBeLessThanOrEqual(0.11);
      const want = (w: number) => ((spec.rimMm.value + 2 * w) / 2) * anchors.scale;
      expect(Math.abs(anchors.wheels.rear.r - want(spec.rearMm.value)), e.name).toBeLessThan(0.01);
      expect(Math.abs(anchors.wheels.front.r - want(spec.frontMm.value)), e.name).toBeLessThan(0.01);
      if (anchors.scale === 0.11) expect(Math.abs(anchors.wheels.front.r - ((spec.rimMm.value + 2 * spec.frontMm.value) / 2) * 0.11), e.name).toBeLessThan(0.1);
      // The tyre in the markup reaches exactly the outer diameter.
      const tyres = elements(svg).filter((el) => el.attrs.class === 'bk-tyre').map((el) => Number(el.attrs.r) + Number(el.attrs['stroke-width']) / 2);
      const want2 = [anchors.wheels.rear.r, anchors.wheels.front.r].sort((x, y) => x - y);
      tyres.sort((x, y) => x - y).forEach((r, i) => expect(Math.abs(r - want2[i]!), e.name).toBeLessThan(0.02));
      checkMarkup(svg, e.name);
    }
  }, 60_000);

  test('[BK-FIT-BOX] a 700c x 40 mm gravel bike draws at full scale, and a bike that does not fit shrinks as a whole', () => {
    expect(bikeArt(resolveBikeSpec(null, null), null).anchors.scale).toBe(0.11);
    const big = bikeArt(resolveBikeSpec(setBike('full-suspension', 'XL', 'flat', false, ['26 x 4.8', '26 x 4.8']), null), null).anchors;
    expect(big.scale).toBeLessThan(0.11);
    expect(big.wheels.front.r / big.wheels.rear.r).toBeCloseTo(1, 6);
  });

  fcTest.prop([
    fc.constantFrom(...STYLES), fc.constantFrom(...SIZES), fc.constantFrom('drop', 'flat', 'other'), fc.boolean(),
    fc.constantFrom(406, 507, 559, 571, 584, 622), fc.integer({ min: 18, max: 130 }), fc.integer({ min: 18, max: 130 }),
    fc.constantFrom(...Object.keys(BAG_SETS)), fc.constantFrom('unknown', 'hydraulic-disc', 'rim'), fc.constantFrom('unknown', 'derailleur', 'chain-hub', 'belt'),
  ])('[BK-FIT-BOX] nothing outside the viewBox for any generated spec', (style, size, bars, ebike, rim, fw, rw, set, brakes, drive) => {
    const bags = BAG_SETS[set] as BagView | null;
    const bike = setBike(style, size, bars, ebike, [`${fw}-${rim}`, `${rw}-${rim}`], '#c62f2a', { brakes, drive });
    const spec = resolveBikeSpec(bike, bags);
    const art = bikeArt(spec, bags);
    checkMarkup(art.svg, `${style} ${size} ${fw}/${rw}-${rim} ${set}`);
    checkMarkup(markerArt(spec).replace(/viewBox="[^"]*"/, 'viewBox="0 0 320 150"').replace(/ (width|height)="[^"]*"/g, ''), 'marker');
  });
});

describe('colour and casing (spec sections 3.6 and 7.4)', () => {
  const spec = (colour: string | null) => resolveBikeSpec(normaliseBike({ id: 'c', look: { colour }, fit: { style: 'full-suspension' } }), BAG_SETS.everything!);

  test('[BK-COLOUR-CASING] the colour is only on frame and fork, as stroke="#rrggbb", over a casing 1.5 units wider in muted', () => {
    const els = elements(bikeArt(spec('#2f7d4f'), BAG_SETS.everything!).svg);
    const painted = els.filter((e) => Object.values(e.attrs).some((v) => v.toLowerCase().includes('2f7d4f')));
    expect(painted.length).toBeGreaterThanOrEqual(2);
    for (const e of painted) {
      expect(e.attrs.stroke).toBe('#2f7d4f');
      expect(e.attrs.fill).toBe('none');
      expect(e.attrs.class).toMatch(/^bk-paint bk-(frame|stays|fork)$/);
      const casing = els[els.indexOf(e) - 1]!;
      expect(casing.attrs.class).toBe('bk-casing');
      expect(casing.attrs.d).toBe(e.attrs.d);
      expect(casing.attrs.stroke).toBeUndefined(); // the theme's muted, from the stylesheet
      expect(Number(casing.attrs['stroke-width']) - Number(e.attrs['stroke-width'])).toBeCloseTo(1.5, 6);
    }
    expect(new Set(painted.map((e) => e.attrs.class!.split(' ')[1]))).toEqual(new Set(['bk-frame', 'bk-stays', 'bk-fork']));
    const css = readFileSync('src/ui/bike/bike.css', 'utf8').replace(/\s+/g, '');
    expect(css).toContain('.bk-casing{fill:none;stroke:var(--muted)');
    expect(css).toContain('.bk-frame:not(.bk-paint),.bk-stays:not(.bk-paint),.bk-fork:not(.bk-paint){fill:none;stroke:var(--line)');
    // No rule sets the stroke of a painted part, so the attribute holds.
    const rules = css.replace(/\/\*.*?\*\//g, '').split('}').map((r) => r.split('{')).filter((r) => r.length === 2);
    const painting = rules.filter(([sel]) => sel!.split(',').some((s) => /\.bk-(paint|frame|stays|fork)(?![\w-]|:not)/.test(s.replace(/:not\([^)]*\)/g, ':not'))));
    for (const [sel, body] of painting) expect(`${sel}{${body}}`).not.toMatch(/(^|[;{])stroke:/);
  });

  test("[BK-COLOUR-CASING] the bags' fill ramp does not depend on the frame colour; with no colour the frame is the theme's line", () => {
    const fills = (colour: string | null) => elements(bikeArt(spec(colour), BAG_SETS.everything!).svg).filter((e) => e.attrs.class === 'bk-fill').map((e) => e.attrs.fill);
    expect(fills('#2f7d4f')).toEqual(fills(null));
    expect(fills('#f4f4f2')).toEqual(fills(null));
    expect(new Set(fills(null)).size).toBeGreaterThan(3);
    const plain = elements(bikeArt(spec(null), BAG_SETS.everything!).svg);
    expect(plain.some((e) => /#[0-9a-f]{6}/.test(e.attrs.stroke ?? ''))).toBe(false);
    expect(plain.some((e) => e.attrs.class === 'bk-casing')).toBe(false);
    expect(plain.filter((e) => /^bk-(frame|stays|fork)$/.test(e.attrs.class ?? '')).length).toBeGreaterThanOrEqual(3);
    // The ramp follows the theme, as in the bag planner.
    const light = elements(bikeArt(spec(null), BAG_SETS.everything!, { theme: 'light' }).svg).filter((e) => e.attrs.class === 'bk-fill').map((e) => e.attrs.fill);
    expect(light).not.toEqual(fills(null));
  });

  test('[BK-COLOUR-CASING] two drawings on one page never share a clip path', () => {
    const a = bikeArt(spec(null), BAG_SETS.everything!, { idPrefix: 'one' }).svg;
    const b = bikeArt(spec(null), BAG_SETS.everything!, { idPrefix: 'two' }).svg;
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
  });
});

describe('the marker on the route strip (spec section 7.4)', () => {
  test('[BK-ART-ANCHORS] the marker is wheels, frame and fork only, at most 24 px tall, decorative, in the rider\'s colour', () => {
    const m = markerArt(resolveBikeSpec(normaliseBike({ id: 'm', look: { colour: '#c62f2a' } }), null));
    const els = elements(m);
    expect(els[0]!.attrs['aria-hidden']).toBe('true');
    expect(Number(els[0]!.attrs.height)).toBeLessThanOrEqual(24);
    expect(new Set(els.slice(1).map((e) => e.attrs.class))).toEqual(new Set(['bk-tyre', 'bk-casing', 'bk-paint bk-frame', 'bk-paint bk-fork']));
    expect(m).toContain('stroke="#c62f2a"');
    expect(m).not.toMatch(/aria-label|role=/);
  });
});

describe('the accessible name (spec section 7.4)', () => {
  const label = (fields: Record<string, unknown>, bags: BagView | null = null) => bikeArt(resolveBikeSpec(normaliseBike({ id: 'l', ...fields }), bags), bags).label;

  test('[BK-LABEL] type, tyres, handlebar, colour (the nearest swatch name) and rack', () => {
    expect(label({ frontTyre: '40-622', look: { bars: 'drop', colour: '#2f7d4f' } }, BAG_SETS.touring!)).toBe('Your bike: touring bike, 700 × 40 mm tyres, drop bars, green frame, rear rack.');
  });

  test("[BK-LABEL] each part's absence: no colour, no rack, and the other wheel sizes and bars", () => {
    expect(label({})).toBe('Your bike: gravel bike, 700 × 40 mm tyres, drop bars.');
    expect(label({ frontTyre: '29 x 2.4', look: { colour: '#2f7e50' } })).toBe('Your bike: mountain bike, 29 × 61 mm tyres, flat bars, green frame.');
    expect(label({ frontTyre: '47-584', fit: { style: 'step-through' }, look: { bars: 'other', ebike: true } })).toBe('Your bike: trekking e-bike, 650B × 47 mm tyres, other handlebar.');
    expect(label({ frontTyre: '26 x 4.0' })).toBe('Your bike: fat bike, 26 × 102 mm tyres, flat bars.');
    expect(label({ frontTyre: '28-622', rearTyre: '32-622' })).toBe('Your bike: road bike, 700 × 28 mm front and 32 mm rear tyres, drop bars.');
    expect(label({ frontTyre: '23-571' })).toBe('Your bike: road bike, 650C × 23 mm tyres, drop bars.');
    expect(label({ frontTyre: '50-406' })).toBe('Your bike: gravel bike, 20-inch × 50 mm tyres, drop bars.');
  });
});

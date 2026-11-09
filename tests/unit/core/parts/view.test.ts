// The bike view (design of 9 November 2026; the owner's answers of 9 November): which bike it draws (a typical bike of the rider's type,
// never their colours or details), how each of the 36 parts stands out on it, the view it opens on, and labels that never overlap.
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { P } from '../../../../src/core/bike/art.ts';
import { drawnFor, PART_PLACES, partPoint } from '../../../../src/core/bike/part-points.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import type { BikeType } from '../../../../src/core/bike/spec.ts';
import { stepsShown } from '../../../../src/core/care/lines.ts';
import { careDetails } from '../../../../src/core/care/fit.ts';
import { byType, riderType, TYPE_USUAL, usualOn } from '../../../../src/core/care/type-order.ts';
import type { CareDetails } from '../../../../src/core/care/types.ts';
import { cardParts } from '../../../../src/core/parts/links.ts';
import { GAP, hitsShapes, labelSize, labelWidth, placeLabels, segmentHitsRect } from '../../../../src/core/parts/labels.ts';
import type { Layout, Shapes } from '../../../../src/core/parts/labels.ts';
import { cardSpec, inBox, openingFocus, inkMarkup, outline, outlineOn, partSpot, placeView, tangles, typeSpec, viewMarkup, wholeBox, zoomBox } from '../../../../src/core/parts/view.ts';
import type { ViewBox } from '../../../../src/core/parts/view.ts';
import { C, CARE_TASKS, ROAD_CARDS } from '../../../../src/core/wording/en-care.ts';
import { PART_SHORT, partsLine } from '../../../../src/core/wording/en-part-names.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { setBike, SIZES, STYLES } from '../bike/drawing-set.ts';

const TYPES: BikeType[] = ['road', 'gravel', 'touring', 'trekking', 'mtb', 'fat'];

test("[BV-TYPES] the view draws a typical bike of each type, never a colour; the rider's type is read from the bike, none where nothing tells it", () => {
  for (const t of TYPES) {
    const s = typeSpec(t);
    expect(s.type.value).toBe(t);
    expect(s.colour.value).toBeNull();
    const { svg } = bikeArt(s, null);
    expect(svg, t).not.toMatch(/stroke="#|bk-paint/);
    expect(s.bars.value, t).toBe(t === 'road' || t === 'gravel' || t === 'touring' ? 'drop' : 'flat');
    expect(s.fork.value, t).toBe(t === 'mtb' ? 'suspension' : 'rigid');
  }
  expect(typeSpec(null).type.value).toBe('gravel');
  expect(riderType(null)).toBeNull();
  expect(riderType(resolveBikeSpec(setBike('diamond-sloping', 'M', 'drop', false), null))).toBeNull();
  const typeOf = (tyre: string, extra: Record<string, unknown> = {}) => riderType(resolveBikeSpec(setBike('diamond-sloping', 'M', 'drop', false, [tyre, tyre], '#e46b1f', extra), null));
  expect(typeOf('28-622')).toBe('road');
  expect(typeOf('29 x 2.4')).toBe('mtb');
  expect(typeOf('26 x 4.0')).toBe('fat');
  // the rider's colour and details never reach the drawing: a red road bike with rim brakes and flat bars draws the typical road bike
  const own = resolveBikeSpec(setBike('compact', 'XL', 'flat', true, ['28-622', '28-622'], '#e46b1f', { brakes: 'rim' }), null);
  const view = cardSpec(riderType(own), {}, ['chain']);
  expect(view.colour.value).toBeNull();
  expect([view.style.value, view.size.value, view.bars.value, view.ebike.value, view.brakes.value]).toEqual(['diamond-sloping', 'M', 'drop', false, 'disc']);
});

test("[BV-CARD] the drawing borrows what the card talks about: its conditions first, then each of its parts in turn, never losing an earlier one; a tapped part is borrowed too", () => {
  const item = (id: string) => [...ROAD_CARDS, ...CARE_TASKS].find((x) => x.id === id)!;
  const of = (id: string, tapped: string | null = null) => {
    const it = item(id);
    return cardSpec('gravel', it.applies, cardParts(id, it.steps, it.steps.map((_, i) => i)), tapped as never);
  };
  expect(of('brake-rub-rim').brakes.value).toBe('rim');
  expect(of('brake-rub-disc').brakes.value).toBe('disc');
  expect(of('gears-hub-oil').drive.value).toBe('hub');
  expect(of('ebike-no-power').ebike.value).toBe(true);
  expect(of('susp-wipe-stanchions').fork.value).toBe('suspension');
  // Spoke snapped names rim brakes before disc brakes: the rim brakes are drawn; tapping the disc caliper draws discs
  expect(of('spoke-snapped').brakes.value).toBe('rim');
  expect(of('spoke-snapped', 'caliper').brakes.value).toBe('disc');
  expect(of('brake-rub-disc', 'rim-brake').brakes.value).toBe('rim');
});

const at = (b: ViewBox, p: P, m = 0) => inBox(b, p, m);

test('[BV-SPOT] each of the 36 parts stands out on every type\'s bike that has it, inside the drawing: drawn again from the drawing\'s own elements, as a short piece, or as a ring', () => {
  for (const t of TYPES) {
    for (const id of PART_PLACES) {
      const spec = cardSpec(t, {}, [], id);
      const { svg, anchors } = bikeArt(spec, null);
      const s = partSpot(id, spec, anchors);
      expect(s, `${t} ${id}`).not.toBeNull();
      expect(at(wholeBox(anchors), s!.at, 1), `${t} ${id}`).toBe(true);
      expect(s!.ink.length > 0 || s!.piece !== null || s!.ring, `${t} ${id}`).toBe(true);
      if (s!.ink.length) expect(inkMarkup(svg, s!.ink, 'bv-ink', s!.barOnly), `${t} ${id}`).toMatch(/class="bv-ink/);
      // the pairs: one wheel only, the front's
      if (s!.clip) expect(s!.clip.c, `${t} ${id}`).toEqual([anchors.wheels.front.cx, anchors.wheels.front.cy]);
    }
  }
  // a card about one wheel marks that wheel only: Disc brake rubbing's axle, quick release, dropouts, caliper and disc on the front
  // (design 2.4; review of PR 107, M5)
  const rub = cardSpec(null, { brakes: ['hydraulic-disc'] }, ['thru-axle', 'wheel-qr', 'dropouts', 'caliper', 'disc']);
  const ra = bikeArt(rub, null).anchors;
  for (const id of ['thru-axle', 'wheel-qr', 'dropouts', 'caliper', 'disc'] as const) {
    const p = partSpot(id, rub, ra)!.at;
    expect(Math.hypot(p[0] - ra.wheels.front.cx, p[1] - ra.wheels.front.cy), id).toBeLessThan(ra.wheels.front.r);
  }
  // far side and left side, as the labels say
  const disc = typeSpec('gravel');
  const a = bikeArt(disc, null).anchors;
  expect(partSpot('disc', disc, a)!.side).toBe('other');
  expect(partSpot('caliper', disc, a)!.side).toBe('other');
  const rim = cardSpec('road', { brakes: ['rim'] }, ['brake-qr']);
  expect(partSpot('brake-qr', rim, bikeArt(rim, null).anchors)!.side).toBe('left');
  // the handlebar is the bar alone, not the stem the drawing draws with it
  const bar = inkMarkup(bikeArt(disc, null).svg, ['bk-bar'], 'x', true);
  const all = inkMarkup(bikeArt(disc, null).svg, ['bk-bar'], 'x', false);
  expect(bar.length).toBeLessThan(all.length);
  expect(bar).toMatch(/d="M/);
});

test('[BV-SPOT] on every template and size a part stands out where the drawing has it, and moves with the frame: a size L has its headset higher than a size S', () => {
  for (const style of STYLES) for (const size of SIZES) {
    const own = resolveBikeSpec(setBike(style, size, 'drop', false), null);
    for (const id of PART_PLACES) {
      const spec = drawnFor(own, id);
      if (!spec) continue;
      const { anchors } = bikeArt(spec, null);
      const s = partSpot(id, spec, anchors);
      expect(s, `${style} ${size} ${id}`).not.toBeNull();
      if (id === 'dropouts') expect(s!.at).toEqual([anchors.wheels.front.cx, anchors.wheels.front.cy].map((n) => Math.round(n * 100) / 100));
      else expect(s!.at).toEqual(partPoint(spec, anchors, id));
      expect(at(wholeBox(anchors), s!.at, 1), `${style} ${size} ${id}`).toBe(true);
    }
    if (size === 'S') {
      const big = resolveBikeSpec(setBike(style, 'L', 'drop', false), null);
      const head = (x: typeof own) => partSpot('headset', x, bikeArt(x, null).anchors)!.at[1];
      expect(head(big), style).toBeLessThan(head(own));
    }
  }
});

test("[BV-MOTOR] on an e-bike the view draws the motor round, as a housing round the crank axle, where the drawing has its box (owner's note of 9 November 2026); bikeArt itself is untouched", () => {
  const spec = cardSpec('trekking', { ebike: ['yes'] }, ['battery']);
  const { svg, anchors } = bikeArt(spec, null);
  expect(svg).toMatch(/<rect class="bk-motor"/);
  const view = viewMarkup(svg, anchors);
  expect(view).not.toMatch(/<rect class="bk-motor"/);
  const m = /<circle class="bk-motor bv-motor" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/.exec(view)!;
  expect([Number(m[1]), Number(m[2])]).toEqual(anchors.points.bb.map((n) => Math.round(n * 100) / 100));
  // drawn where the box was: before the chainring and crank, which stay in front of it
  expect(view.indexOf('bv-motor')).toBeLessThan(view.indexOf('class="bk-ring"'));
  expect(view).toContain('aria-hidden="true"');
  expect(view).not.toContain('role="img"');
});

// A pin of today's drawing (design 8): every template, size, handlebar, e-bike and theme, byte for byte as it was before the bike view.
test("[BV-ART-SAME] bikeArt's output for every template is byte for byte what it was before the bike view", () => {
  const h = createHash('sha256');
  for (const style of STYLES) for (const size of SIZES) for (const bars of ['drop', 'flat', 'other']) for (const ebike of [false, true]) {
    for (const theme of ['dark', 'light'] as const) h.update(bikeArt(resolveBikeSpec(setBike(style, size, bars, ebike), null), null, { theme }).svg);
  }
  expect(h.digest('hex')).toBe('947d78ae2f38374e033619fa81830ab37f83c9dba2c871370b98b982417e6a5e');
});

const items = [...ROAD_CARDS, ...CARE_TASKS];
const partsOf = (it: (typeof items)[number], d: CareDetails) => cardParts(it.id, it.steps, stepsShown(it.id, it.steps.length, d));

test('[BV-ZOOM] a card whose parts sit close together opens zoomed in on them; one spread over the bike opens whole; every view stays inside the whole bike', () => {
  const focus = (id: string) => {
    const it = items.find((x) => x.id === id)!;
    const parts = partsOf(it, careDetails(null));
    const spec = cardSpec(null, it.applies, parts);
    const { anchors } = bikeArt(spec, null);
    const spots = parts.flatMap((p) => { const s = partSpot(p, spec, anchors); return s ? [[p, s] as const] : []; });
    const pts = spots.map(([, s]) => s.at);
    return { f: openingFocus(wholeBox(anchors), spots), anchors, pts };
  };
  const chain = focus('chain-broken');
  expect(chain.f.z).toBeGreaterThan(1.3);
  const view = zoomBox(wholeBox(chain.anchors), chain.f.z, chain.f.centre);
  for (const p of chain.pts) expect(at(view, p, 4)).toBe(true);
  // the puncture card opens on its wheel: the warning's brake lever on the bar is left out of the focus (review of PR 107, M3), as the
  // disc card's lever is
  const tube = focus('puncture-tube');
  expect(tube.f.z).toBeGreaterThan(1.3);
  const tubeView = zoomBox(wholeBox(tube.anchors), tube.f.z, tube.f.centre);
  expect(at(tubeView, [tube.anchors.wheels.front.cx, tube.anchors.wheels.front.cy], 4)).toBe(true);
  // and every part of the wheel itself is in that view, the valve at the rim's foot too
  const tubeIt = items.find((x) => x.id === 'puncture-tube')!;
  const tubeSpec = cardSpec(null, tubeIt.applies, partsOf(tubeIt, careDetails(null)));
  const tubeArt = bikeArt(tubeSpec, null).anchors;
  for (const id of ['tyre', 'rim', 'bead', 'tube', 'valve', 'spokes'] as const) expect(at(tubeView, partSpot(id, tubeSpec, tubeArt)!.at, 1), id).toBe(true);
  expect(focus('brake-rub-disc').f.z).toBeGreaterThan(1.3);
  // parts at both tyres' far edges and the bar: spread over the bike, it opens whole (a quarter of three parts is none to leave out)
  const wa = focus('chain-broken').anchors;
  const { rear, front } = wa.wheels;
  const spread: [P, P, P] = [[rear.cx - rear.r, rear.cy], [front.cx + front.r, front.cy], wa.points.bar];
  expect(openingFocus(wholeBox(wa), spread.map((p, i) => [(['tyre', 'rim', 'handlebar'] as const)[i]!, { at: p }] as const)).z).toBe(1);
  expect(focus('tyres-sealant-check').f.z).toBeGreaterThan(1.3);
  // a card naming the frame, which spans the bike, opens whole (an e-bike's battery and display sit close, its frame does not)
  const ebike = items.find((x) => x.id === 'ebike-no-power')!;
  const eParts = partsOf(ebike, careDetails(null));
  expect(eParts).toContain('frame');
  const eSpec = cardSpec(null, ebike.applies, eParts);
  const eArt = bikeArt(eSpec, null).anchors;
  expect(openingFocus(wholeBox(eArt), eParts.map((p) => [p, partSpot(p, eSpec, eArt)!] as const)).z).toBe(1);
  const whole = wholeBox(chain.anchors);
  fc.assert(fc.property(fc.double({ min: 0.5, max: 6, noNaN: true }), fc.double({ min: -50, max: 400, noNaN: true }), fc.double({ min: -50, max: 200, noNaN: true }), (z, x, y) => {
    const b = zoomBox(whole, z, [x, y]);
    expect(b.x).toBeGreaterThanOrEqual(whole.x - 1e-9);
    expect(b.y).toBeGreaterThanOrEqual(whole.y - 1e-9);
    expect(b.x + b.w).toBeLessThanOrEqual(whole.x + whole.w + 1e-9);
    expect(b.y + b.h).toBeLessThanOrEqual(whole.y + whole.h + 1e-9);
    expect(b.w / b.h).toBeCloseTo(whole.w / whole.h, 6);
  }));
});

/**
 * The labels' promises: every one placed, inside the canvas's width, none overlapping, none on the bike (the drawing's outline, `shapes`)
 * nor over a part's point, no leader through another label (parts at one point share their leader and stack their labels).
 */
function checkLayout(l: Layout, n: number, width: number, top: number, areaH: number, shapes: Shapes, why: string): void {
  expect(l.labels.length, why).toBe(n);
  const lift = (sh: Shapes): Shapes => ({ circles: sh.circles.map((c) => ({ c: [c.c[0], c.c[1] + top] as [number, number], r: c.r })), segs: sh.segs.map(([a, b]) => [[a[0], a[1] + top], [b[0], b[1] + top]] as const), pad: 0 });
  const onCanvas = lift(shapes);
  l.labels.forEach((a, i) => {
    expect(a.box.x, why).toBeGreaterThanOrEqual(0);
    expect(a.box.x + a.box.w, why).toBeLessThanOrEqual(width);
    expect(a.box.y, why).toBeGreaterThanOrEqual(0);
    expect(a.box.y + a.box.h, why).toBeLessThanOrEqual(l.height);
    // in the drawing (the bands above and below show none of it: the drawing is cut at its area's edges)
    const inArea = a.box.y + a.box.h > top && a.box.y < top + areaH;
    if (inArea) expect(hitsShapes(a.box, onCanvas), `${why}: ${a.id} on the bike`).toBe(false);
    l.labels.forEach((b, j) => {
      if (i === j) return;
      const apart = a.box.x + a.box.w + GAP <= b.box.x || b.box.x + b.box.w + GAP <= a.box.x || a.box.y + a.box.h + GAP <= b.box.y || b.box.y + b.box.h + GAP <= a.box.y;
      expect(apart, `${why}: ${a.id} and ${b.id} overlap`).toBe(true);
      const box = b.box;
      expect(a.to[0] >= box.x && a.to[0] <= box.x + box.w && a.to[1] >= box.y && a.to[1] <= box.y + box.h, `${why}: ${b.id} over ${a.id}'s part`).toBe(false);
      if (a.to[0] === b.to[0] && a.to[1] === b.to[1]) return;
      expect(segmentHitsRect(a.from, a.to, b.box), `${why}: ${a.id}'s leader crosses ${b.id}`).toBe(false);
    });
  });
  expect(l.top + areaH, why).toBeLessThanOrEqual(l.height);
}

test('[BV-LABELS] on every card, type and width (320 and 360 px phones, the 528 px panel), opened on its focus or on the whole bike, every part in view is labelled off the bike, with no overlap and no leader through another label', () => {
  let layouts = 0;
  const tangled: number[] = [];
  for (const it of items) {
    const parts = partsOf(it, careDetails(null));
    if (parts.length === 0) continue;
    for (const t of [null, ...TYPES]) {
      for (const tapped of [null, parts[0]!]) {
        const spec = cardSpec(t, it.applies, parts, tapped);
        const { anchors, svg } = bikeArt(spec, null);
        const o = outline(svg, anchors);
        const spots = parts.flatMap((p) => { const s = partSpot(p, spec, anchors); return s ? [[p, s] as const] : []; });
        const whole = wholeBox(anchors);
        const f = openingFocus(whole, spots);
        for (const view of [zoomBox(whole, f.z, f.centre), whole]) {
          for (const width of [320, 360, 528]) {
            const ins = spots.filter(([, s]) => inBox(view, s.at, 1)).map(([p, s]) => ({ id: p, at: s.at, w: labelWidth(PART_SHORT[p], s.side ? `(${s.side} side)` : '', labelSize(width)) }));
            const pl = placeView(ins, view, width, o);
            const shapes = outlineOn(o, view, pl.scale, pl.inset);
            checkLayout(pl.layout, ins.length, width, pl.layout.top, pl.areaH, { ...shapes, pad: 0 }, `${it.id} ${t} ${width} ${view.w}`);
            if (tapped === null && view !== whole) tangled.push(tangles(pl.layout));
            layouts += 1;
          }
        }
      }
    }
  }
  expect(layouts).toBeGreaterThan(1000);
  // as each card opens: leaders that cross or pass another part's point are rare and few (review of PR 107, M2)
  expect(Math.max(...tangled)).toBeLessThanOrEqual(6);
  expect(tangled.filter((n) => n > 0).length / tangled.length).toBeLessThan(0.05);
}, 120_000);

test('[BV-LABELS] any few parts anywhere on the drawing get their labels, under the same promises', () => {
  const none: Shapes = { circles: [], segs: [], pad: 0 };
  fc.assert(fc.property(
    fc.constantFrom(320, 360, 528),
    fc.array(fc.record({ x: fc.double({ min: 0, max: 1, noNaN: true }), y: fc.double({ min: 0, max: 1, noNaN: true }), part: fc.constantFrom(...PART_PLACES) }), { minLength: 1, maxLength: 8 }),
    (width, pts) => {
      const areaH = Math.round(width / 2.1);
      const seen = new Set<string>();
      const ins = pts.filter((p) => !seen.has(p.part) && seen.add(p.part)).map((p) => ({ id: p.part, at: [p.x * width, p.y * areaH] as [number, number], w: labelWidth(PART_SHORT[p.part]) }));
      const l = placeLabels(ins, width, areaH, none);
      checkLayout(l, ins.length, width, l.top, areaH, none, JSON.stringify(ins.map((i) => [i.id, i.at])));
    },
  ));
});

const ND: CareDetails = careDetails(null);

test("[BV-ORDER] the type sorts, never hides: cards usual on the rider's type first, the rest after them in their order; a detail the rider told decides alone; with no type nothing moves (the owner's answer 5 (a))", () => {
  const ids = (list: { item: { id: string } }[]) => list.map((x) => x.item.id);
  const road = byType(ROAD_CARDS, 'road', ND);
  expect(road.length).toBe(ROAD_CARDS.length);
  expect(ids(road).at(-1)).toBe('puncture-tubeless');
  expect(road.find((x) => x.item.id === 'puncture-tubeless')!.usual).toBe(false);
  const mtb = byType(ROAD_CARDS, 'mtb', ND);
  expect(ids(mtb).indexOf('puncture-tubeless')).toBeLessThan(ids(mtb).indexOf('puncture-tube'));
  expect(ids(byType(ROAD_CARDS, null, ND))).toEqual(ROAD_CARDS.map((c) => c.id));
  // a road bike the rider told is tubeless: its own detail wins (the tubeless card is usual)
  expect(usualOn({ tyres: ['tubeless'] }, 'road', { ...ND, tyres: 'tubeless' })).toBe(true);
  // the suspension tasks go down on a road bike, up on a mountain bike
  const susp = CARE_TASKS.find((x) => x.id === 'susp-wipe-stanchions')!;
  expect(usualOn(susp.applies, 'road', ND)).toBe(false);
  expect(usualOn(susp.applies, 'mtb', ND)).toBe(true);
  // a card with no conditions is usual on every type
  for (const t of TYPES) expect(usualOn({}, t, ND)).toBe(true);
  for (const t of TYPES) for (const [k, v] of Object.entries(TYPE_USUAL[t])) expect((v as string[]).length, `${t} ${k}`).toBeGreaterThan(0);
});

test("[BV-WORDS] every part has a short name for its label and button, and a card's parts read as one line; no banned word", () => {
  expect(Object.keys(PART_SHORT).sort()).toEqual([...PART_PLACES].sort());
  for (const [id, n] of Object.entries(PART_SHORT)) {
    expect(n.length, id).toBeLessThanOrEqual(20);
    expect(bannedHits(n, false), id).toEqual([]);
  }
  expect(partsLine(['tyre', 'bead', 'tube'])).toBe('Tyre, tyre bead, inner tube');
  for (const t of [C.careWhere, C.careLessUsual('road')]) expect(bannedHits(t, false), t).toEqual([]);
});

// How a bike is built (design of 14 November 2026): the parts a learner meets, their words, what they connect to, which bikes have them,
// where they sit on the shared drawing for every template, handlebar, brake and drive, and which part a tap picks.
import { expect, test } from 'vitest';
import { bikeArt } from '../../../../src/core/bike/art.ts';
import type { P } from '../../../../src/core/bike/art.ts';
import { PART_PLACES } from '../../../../src/core/bike/part-points.ts';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { TEMPLATES } from '../../../../src/core/bike/templates.ts';
import { GUIDE } from '../../../../src/core/parts/guide.ts';
import { EDGES, extrasMarkup, GROUPS, groupOf, hasPart, KINDS, kindBike, LEARN_PARTS, learnSpot, linksOf, NEW_PARTS, ownBike, partsOf, pickAt, spotDistance, stepOf, STEPS, tagOf } from '../../../../src/core/parts/learn.ts';
import type { LearnBike, LearnId } from '../../../../src/core/parts/learn.ts';
import { GROUP_NAMES, KIND_NAMES, LN, LN_DOES, nameOf, tagWords } from '../../../../src/core/wording/en-learn.ts';
import { PART_SHORT } from '../../../../src/core/wording/en-part-names.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { setBike, SIZES, STYLES } from '../bike/drawing-set.ts';

const ALL: LearnId[] = LEARN_PARTS.map((p) => p.id);
const sentences = (s: string): number => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

test('[BL-PARTS] the page knows the guide\'s 36 parts and 19 more, each once, each with a step, a group, a short name and one or two sentences', () => {
  expect(ALL.length).toBe(55);
  expect(new Set(ALL).size).toBe(55);
  expect([...ALL].sort()).toEqual([...PART_PLACES, ...NEW_PARTS].sort());
  // the guide's parts keep the bike view's short names
  for (const g of GUIDE) { expect(ALL).toContain(g.id); expect(nameOf(g.id)).toBe(PART_SHORT[g.id]); expect(tagOf(g.id)).toBe(g.tag); }
  for (const id of ALL) {
    expect(STEPS).toContain(stepOf(id));
    expect(GROUPS).toContain(groupOf(stepOf(id)));
    expect(nameOf(id), id).toMatch(/^[A-Z][A-Za-z -]+$/);
    expect(LN_DOES[id], id).toBeTruthy();
    expect(sentences(LN_DOES[id]), id).toBeGreaterThanOrEqual(1);
    expect(sentences(LN_DOES[id]), id).toBeLessThanOrEqual(2);
  }
  // the list's order follows the build: frame and fork, wheels, drivetrain, brakes, cockpit, saddle, e-bike
  const order = ALL.map((id) => GROUPS.indexOf(groupOf(stepOf(id))));
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(stepOf('fork')).toBe('fork');
  expect(groupOf('fork')).toBe('frame');
});

test('[BL-WORDS] every name, sentence, heading, tag and line of the page has no banned word', () => {
  const texts = [
    ...ALL.map(nameOf), ...Object.values(LN_DOES), ...Object.values(GROUP_NAMES), ...Object.values(KIND_NAMES),
    ...ALL.flatMap((id) => (tagOf(id) ? [tagWords(tagOf(id)!)] : [])),
    ...Object.values(LN).map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('x', 'y', 'z') : v)),
  ];
  for (const t of texts) expect(bannedHits(t), t).toEqual([]);
});

test('[BL-LINKS] "connects to" goes both ways, names only parts the bike has, and every part on a bike connects to another there', () => {
  for (const [a, b] of EDGES) {
    expect(ALL).toContain(a);
    expect(ALL).toContain(b);
    expect(a).not.toBe(b);
  }
  expect(new Set(EDGES.map(([a, b]) => [a, b].sort().join(' '))).size).toBe(EDGES.length);
  for (const kind of KINDS) {
    const bike = kindBike(kind);
    const parts = partsOf(bike);
    for (const id of parts) {
      const links = linksOf(bike, id);
      expect(links.length, `${kind}: ${id}`).toBeGreaterThan(0);
      for (const l of links) {
        expect(parts).toContain(l);
        expect(linksOf(bike, l), `${kind}: ${l} back to ${id}`).toContain(id);
      }
    }
  }
});

test('[BL-KINDS] the type switch draws each kind as it usually is; the rider\'s bike has a front derailleur only as road and touring bikes usually do', () => {
  const has = (b: LearnBike, id: LearnId): boolean => hasPart(b, id);
  const city = kindBike('city');
  expect(city.spec.style.value).toBe('step-through');
  expect([has(city, 'hub-gears'), has(city, 'rim-brake'), has(city, 'grips'), has(city, 'top-tube'), has(city, 'derailleur')]).toEqual([true, true, true, false, false]);
  expect(has(kindBike('full'), 'shock')).toBe(true);
  expect(has(kindBike('mtb'), 'shock')).toBe(false);
  expect(has(kindBike('mtb'), 'stanchions')).toBe(true);
  expect([has(kindBike('ebike'), 'motor'), has(kindBike('ebike'), 'battery'), has(kindBike('ebike'), 'display')]).toEqual([true, true, true]);
  expect(has(kindBike('gravel'), 'motor')).toBe(false);
  expect(has(kindBike('road'), 'front-derailleur')).toBe(true);
  expect(has(kindBike('gravel'), 'front-derailleur')).toBe(false);
  expect([has(kindBike('road'), 'bar-tape'), has(kindBike('road'), 'grips'), has(kindBike('road'), 'thru-axle'), has(kindBike('road'), 'wheel-qr')]).toEqual([true, false, true, false]);
  expect([has(city, 'wheel-qr'), has(city, 'thru-axle')]).toEqual([true, false]);
  for (const kind of KINDS) expect(kindBike(kind).spec.colour.value).toBeNull();
  const own = (fields: Record<string, unknown>) => ownBike(resolveBikeSpec(setBike('diamond-sloping', 'M', 'drop', false, ['', ''], '#123456', fields), null));
  expect(own({}).spec.colour.value).toBe('#123456');
  expect(own({ drive: 'chain-hub' }).frontMech).toBe(false);
  expect(own({ drive: 'belt' }).spec.drive.value).toBe('belt');
  expect(hasPart(own({ drive: 'belt' }), 'belt')).toBe(true);
  expect(hasPart(own({ drive: 'belt' }), 'chain')).toBe(false);
});

/** The drawing's own part each of the page's pieces is drawn over; the shifter's ring sits on the bar or the lever. */
const ON: Partial<Record<LearnId, string>> = {
  'head-tube': 'bk-frame', 'top-tube': 'bk-frame', 'down-tube': 'bk-frame', 'seat-tube': 'bk-frame', chainstay: 'bk-stays', seatstay: 'bk-stays',
  pedal: 'bk-crank', 'seat-clamp': 'bk-frame',
};

function* bikes(): Generator<{ name: string; bike: LearnBike }> {
  for (const kind of KINDS) yield { name: kind, bike: kindBike(kind) };
  for (const style of STYLES) for (const size of SIZES) for (const bars of ['drop', 'flat', 'other']) {
    for (const [brakes, drive, ebike] of [['rim', 'derailleur', false], ['hydraulic-disc', 'chain-hub', true], ['cable-disc', 'belt', false], ['unknown', 'unknown', false]] as const) {
      const spec = resolveBikeSpec(setBike(style, size, bars, ebike, ['', ''], null, { brakes, drive }), null);
      for (const frontMech of [false, true]) yield { name: `${style} ${size} ${bars} ${brakes} ${drive}${ebike ? ' e-bike' : ''}${frontMech ? ' 2x' : ''}`, bike: { spec, frontMech } };
    }
  }
}

test('[BL-POINTS] the page names the templates with no top tube and with a rear shock as TEMPLATES has them', () => {
  expect(Object.entries(TEMPLATES).filter(([, t]) => t.step !== undefined || t.twin).map(([k]) => k).sort()).toEqual(['mixte', 'step-through']);
  expect(Object.entries(TEMPLATES).filter(([, t]) => t.step !== undefined).map(([k]) => k)).toEqual(['step-through']);
  expect(Object.entries(TEMPLATES).filter(([, t]) => t.shock).map(([k]) => k)).toEqual(['full-suspension']);
});

test('[BL-POINTS] every part a bike has stands on the drawing: its point inside it and on the part as drawn (or drawn by the page), for every template, size, bar, brake and drive', () => {
  let checked = 0;
  for (const { name, bike } of bikes()) {
    const { svg, anchors } = bikeArt(bike.spec, null);
    const drawn = svg + extrasMarkup(bike, anchors);
    for (const id of ALL) {
      const spot = learnSpot(bike, anchors, id);
      if (!hasPart(bike, id)) { expect(spot, `${name}: ${id}`).toBeNull(); continue; }
      expect(spot, `${name}: ${id}`).not.toBeNull();
      const [x, y] = spot!.at;
      expect(x >= 0 && x <= 320 && y >= 0 && y <= 150, `${name}: ${id} at ${x} ${y}`).toBe(true);
      // the point is on what lights up: the drawing's own elements, the page's piece, or (a ring) the point itself
      if (!spot!.ring) expect(spotDistance(drawn, { ...spot!, at: [-999, -999] }, spot!.at), `${name}: ${id}`).toBeLessThanOrEqual(2.5);
      // a piece over the shared drawing lies on the drawing's own part (2.5 units, as the guide's points: a curve is read by its control points)
      const on = ON[id];
      if (on) expect(spotDistance(svg, { ...spot!, ink: [on], piece: null, at: [-999, -999] }, spot!.at), `${name}: ${id} on ${on}`).toBeLessThanOrEqual(2.5);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(10_000);
});

test('[BL-POINTS] the page\'s own pieces (front derailleur, brake cable) come only where the bike has them; the shared drawing is untouched', () => {
  const road = kindBike('road');
  const gravel = kindBike('gravel');
  const a = bikeArt(road.spec, null).anchors;
  expect(extrasMarkup(road, a)).toContain('bl-fmech');
  expect(extrasMarkup(gravel, bikeArt(gravel.spec, null).anchors)).not.toContain('bl-fmech');
  expect(extrasMarkup(gravel, bikeArt(gravel.spec, null).anchors)).toContain('bl-cable');
  const none = { ...gravel, spec: { ...gravel.spec, brakes: { value: 'none' as const, mark: 'entered' as const } } };
  expect(extrasMarkup(none, bikeArt(none.spec, null).anchors)).toBe('');
  // bikeArt draws the same markup before and after the page has read it
  const before = bikeArt(road.spec, null).svg;
  for (const id of ALL) learnSpot(road, a, id);
  expect(bikeArt(road.spec, null).svg).toBe(before);
});

test('[BL-PICK] a tap on a part picks a part drawn right there; a tap on empty ground picks nothing; the frame is picked by its tubes', () => {
  for (const kind of KINDS) {
    const bike = kindBike(kind);
    const { svg, anchors } = bikeArt(bike.spec, null);
    const drawn = svg + extrasMarkup(bike, anchors);
    const spots = partsOf(bike).map((id) => [id, learnSpot(bike, anchors, id)!] as const);
    let self = 0;
    for (const [id, s] of spots) {
      const got = pickAt(drawn, spots, s.at, 6);
      expect(got, `${kind}: ${id}`).not.toBeNull();
      const d = spotDistance(drawn, spots.find(([x]) => x === got)![1], s.at);
      expect(d, `${kind}: ${id} picked ${got}`).toBeLessThanOrEqual(0.6);
      if (got === id) self += 1;
    }
    // most parts are picked at their own point; the rest share it (a hub and its axle, a lever and its shifter)
    expect(self / spots.length, kind).toBeGreaterThan(0.6);
    const corner: P = [2, 2];
    expect(pickAt(drawn, spots, corner, 6)).toBeNull();
    const tube = learnSpot(bike, anchors, 'down-tube')!.at;
    expect(pickAt(drawn, spots, tube, 6)).toBe('down-tube');
  }
});

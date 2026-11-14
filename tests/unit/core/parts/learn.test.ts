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
import { LL } from '../../../../src/core/wording/en-learn-link.ts';
import { PART_SHORT } from '../../../../src/core/wording/en-part-names.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { setBike, SIZES, STYLES } from '../bike/drawing-set.ts';

const ALL: LearnId[] = LEARN_PARTS.map((p) => p.id);
const sentences = (s: string): number => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

test('[BL-PARTS] the page knows the guide\'s 37 parts (its 36 and the wheel, the owner\'s ruling of 14 November 2026) and 19 more, each once, each with a step, a group, a short name and one or two sentences', () => {
  expect(ALL.length).toBe(56);
  expect(new Set(ALL).size).toBe(56);
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
    ...Object.values(LL),
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

// The wheel (the owner's ruling of 14 November 2026): put on with the wheels, first of them; it connects to the dropouts it sits in and to
// what holds it there on this bike (a thru-axle or a quick release; on nuts, the dropouts alone); its line says what it is made of.
test('[PG-WHEEL] the page has the wheel: first of the wheels step, connecting to the dropouts and what holds it there, on every kind', () => {
  expect(stepOf('wheel')).toBe('wheels');
  expect(ALL.filter((id) => stepOf(id) === 'wheels')[0]).toBe('wheel');
  expect(nameOf('wheel')).toBe('Wheel');
  for (const part of ['hub', 'spokes', 'rim', 'tyre']) expect(LN_DOES.wheel, part).toContain(part);
  for (const kind of KINDS) {
    const bike = kindBike(kind);
    expect(partsOf(bike), kind).toContain('wheel');
    const holds = hasPart(bike, 'thru-axle') ? ['thru-axle'] : hasPart(bike, 'wheel-qr') ? ['wheel-qr'] : [];
    expect([...linksOf(bike, 'wheel')].sort(), kind).toEqual(['dropouts', ...holds].sort());
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

const recordOf = (fields: Record<string, unknown>) => setBike('diamond-sloping', 'M', 'drop', false, ['', ''], '#123456', fields);
const ownOf = (fields: Record<string, unknown>, type?: string): LearnBike => {
  const r = recordOf(type ? { ...fields, type } : fields);
  return ownBike(resolveBikeSpec(r, null), r);
};

test('[BL-OWN] the rider\'s bike always has brakes and gears: brakes not set or of another kind show disc brakes, gears not set derailleur gears, each said plainly', () => {
  for (const brakes of ['unknown', 'other'] as const) {
    const b = ownOf({ brakes });
    expect(b.spec.brakes.value, brakes).toBe('disc');
    expect(b.shows?.brakes, brakes).toBe(brakes === 'unknown' ? 'unset' : 'other');
    for (const p of ['brake-lever', 'brake-cable', 'caliper', 'disc', 'pads'] as const) expect(hasPart(b, p), `${brakes}: ${p}`).toBe(true);
  }
  for (const brakes of ['rim', 'hydraulic-disc', 'cable-disc']) expect(ownOf({ brakes }).shows?.brakes, brakes).toBeUndefined();
  const gears = ownOf({ drive: 'unknown' });
  expect(gears.spec.drive.value).toBe('derailleur');
  expect(gears.shows?.drive).toBe('unset');
  for (const p of ['cassette', 'derailleur', 'hanger', 'shifter', 'gear-cable'] as const) expect(hasPart(gears, p), p).toBe(true);
  for (const drive of ['derailleur', 'chain-hub', 'belt']) expect(ownOf({ drive }).shows?.drive, drive).toBeUndefined();
  // said plainly, with no banned word
  for (const t of [LN.showsBrakes('unset'), LN.showsBrakes('other'), LN.showsDrive, LN.setThem]) expect(bannedHits(t), t).toEqual([]);
  expect(LN.showsBrakes('unset')).toMatch(/brakes aren't set.*disc brakes/);
  expect(LN.showsBrakes('other')).toMatch(/coaster|drum/);
  expect(LN.showsDrive).toMatch(/gears aren't set.*derailleur/);
});

test('[BL-OWN] a single speed (no gears, drive not told) is drawn and described as one; brakes set as Other are named as the rider set them, with nothing to set', () => {
  const single = ownOf({ drive: 'unknown', shifting: 'none' });
  expect(single.spec.drive.value).toBe('chain');
  expect(single.single).toBe(true);
  expect(single.shows?.drive).toBeUndefined();
  const has = (ids: LearnId[]) => ids.map((id) => hasPart(single, id));
  expect(has(['chain', 'chainring', 'crank', 'quick-link'])).toEqual([true, true, true, true]);
  expect(has(['cassette', 'derailleur', 'hanger', 'hub-gears', 'shifter', 'gear-cable', 'front-derailleur'])).toEqual([false, false, false, false, false, false, false]);
  // gears told elsewhere keep their own drive; only a drive not told with no gears is a single speed
  expect(ownOf({ drive: 'chain-hub', shifting: 'none' }).single).toBeUndefined();
  expect(ownOf({ drive: 'unknown', shifting: 'cable' }).shows?.drive).toBe('unset');
  expect(LN.single).toMatch(/single speed/);
  expect(LN.showsBrakes('other')).toMatch(/set as Other/);
  expect(LN.showsBrakes('other')).not.toMatch(/aren't set/);
  for (const t of [LN.single, LN.showsBrakes('other')]) expect(bannedHits(t), t).toEqual([]);
});

test('[BL-OWN] the rider\'s answers decide the axle, the pad adjuster and the gear cable; a belt bike has hub gears; hub gears keep the rear wheel on nuts', () => {
  const has = (b: LearnBike, ...ids: LearnId[]) => ids.map((id) => hasPart(b, id));
  expect(has(ownOf({ brakes: 'hydraulic-disc' }), 'thru-axle', 'wheel-qr')).toEqual([true, false]);
  expect(has(ownOf({ brakes: 'rim' }), 'thru-axle', 'wheel-qr')).toEqual([false, true]);
  expect(has(ownOf({ brakes: 'hydraulic-disc', axle: 'qr' }), 'thru-axle', 'wheel-qr')).toEqual([false, true]);
  expect(has(ownOf({ brakes: 'rim', axle: 'thru' }), 'thru-axle', 'wheel-qr')).toEqual([true, false]);
  expect(has(ownOf({ brakes: 'rim', axle: 'nuts' }), 'thru-axle', 'wheel-qr')).toEqual([false, false]);
  expect(ownOf({ brakes: 'rim', axle: 'nuts' }).axle).toBe('nuts');
  expect(has(ownOf({ brakes: 'hydraulic-disc' }), 'pad-adjuster')).toEqual([false]);
  expect(has(ownOf({ brakes: 'cable-disc' }), 'pad-adjuster')).toEqual([true]);
  expect(has(ownOf({ shifting: 'electronic' }), 'gear-cable', 'shifter')).toEqual([false, true]);
  expect(has(ownOf({ shifting: 'cable' }), 'gear-cable')).toEqual([true]);
  expect(has(ownOf({ drive: 'belt' }), 'belt', 'hub-gears', 'chain', 'cassette')).toEqual([true, true, false, false]);
  expect(has(kindBike('city'), 'hub-gears', 'wheel-qr')).toEqual([true, true]);
  expect(kindBike('city').rearNuts).toBe(true);
  expect(ownOf({ drive: 'chain-hub', brakes: 'rim' }).rearNuts).toBe(true);
  expect(ownOf({ drive: 'derailleur', brakes: 'rim' }).rearNuts).toBe(false);
  expect(ownOf({ drive: 'chain-hub', brakes: 'rim', axle: 'thru' }).rearNuts).toBe(false);
  // a belt bike's hub gears stand on its drawing too
  const belt = ownOf({ drive: 'belt', brakes: 'hydraulic-disc' });
  expect(learnSpot(belt, bikeArt(belt.spec, null).anchors, 'hub-gears')).not.toBeNull();
});

test('[BL-FACTS] the words say what is so on every bike: a quick link needs pliers to open and is often for one use; disc brakes work with either axle; the chainring and the belt as a belt bike has them', () => {
  expect(LN_DOES['quick-link']).toMatch(/pliers/);
  expect(LN_DOES['quick-link']).toMatch(/one use/);
  expect(LN_DOES['quick-link']).not.toMatch(/by hand/);
  expect(LN_DOES['thru-axle']).not.toMatch(/disc brakes need|need/);
  expect(LN_DOES.chainring).toMatch(/belt/);
  expect(LN_DOES.belt).not.toMatch(/rubber/);
  expect(LN_DOES.fork).not.toMatch(/top tube/);
  expect(LN_DOES['rim-brake']).toMatch(/beside/);
  expect(LN_DOES.disc).toMatch(/lockring/);
  expect(LN_DOES.shifter).toMatch(/bar ends/);
  expect(LN_DOES['bottom-bracket']).toMatch(/motor/);
});

/** The drawing's own part each of the page's pieces is drawn over; the shifter's ring sits on the bar or the lever. */
const ON: Partial<Record<LearnId, string>> = {
  'head-tube': 'bk-frame', 'top-tube': 'bk-frame', 'down-tube': 'bk-frame', 'seat-tube': 'bk-frame', chainstay: 'bk-stays', seatstay: 'bk-stays',
  pedal: 'bk-crank', 'seat-clamp': 'bk-frame',
};

function* bikes(): Generator<{ name: string; bike: LearnBike }> {
  for (const kind of KINDS) yield { name: kind, bike: kindBike(kind) };
  // the rider's own, as the page reads them: each brake, drive, axle and shifting answer (one at a time, beside the others' usual)
  const answers: Record<string, unknown>[] = [
    ...['unknown', 'hydraulic-disc', 'cable-disc', 'rim', 'other'].map((brakes) => ({ brakes })),
    ...['unknown', 'derailleur', 'chain-hub', 'belt'].map((drive) => ({ drive, brakes: 'rim' })),
    ...['thru', 'qr', 'nuts'].flatMap((axle) => [{ axle, brakes: 'rim', drive: 'chain-hub' }, { axle, brakes: 'hydraulic-disc', drive: 'belt' }]),
    { shifting: 'electronic', drive: 'derailleur' },
  ];
  for (const fields of answers) yield { name: `own ${JSON.stringify(fields)}`, bike: ownOf(fields) };
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

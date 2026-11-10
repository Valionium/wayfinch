// Where each part of the parts guide sits on the bike drawing (care pictures design of 7 November 2026, sections 3.4 and 4): a point in
// bikeArt's 320 x 150 units, on the part as bikeArt draws it, for the guide's whole bike with its marker. Pure, from the spec and the
// drawing's anchors only, with the drawing's own measures (art.ts); tests pin each point to the drawn part for every template.
import type { Anchors, P } from './art.ts';
import type { BikeSpec } from './spec.ts';

/** The 36 parts of the guide (design 4.3), in its six groups' order. */
export const PART_PLACES = [
  'frame', 'fork', 'headset', 'stem', 'handlebar', 'seatpost',
  'hub', 'wheel-qr', 'thru-axle', 'spokes', 'rim', 'dropouts',
  'tyre', 'bead', 'tube', 'valve', 'tubeless-valve',
  'brake-lever', 'rim-brake', 'pads', 'brake-qr', 'barrel', 'caliper', 'disc', 'pad-adjuster',
  'chain', 'quick-link', 'chainring', 'cassette', 'derailleur', 'hanger', 'gear-cable', 'hub-gears',
  'battery', 'display', 'stanchions',
] as const;
export type PartPlace = (typeof PART_PLACES)[number];

type Needs = { brakes?: 'rim' | 'disc'; drive?: 'derailleur' | 'hub'; chain?: true; fork?: 'suspension'; ebike?: true };
/** What the drawing must have to show a part: rim brakes for the brake's quick release, a derailleur for the hanger, and so on. */
const NEEDS: Partial<Record<PartPlace, Needs>> = {
  'rim-brake': { brakes: 'rim' }, 'brake-qr': { brakes: 'rim' }, caliper: { brakes: 'disc' }, disc: { brakes: 'disc' }, 'pad-adjuster': { brakes: 'disc' },
  cassette: { drive: 'derailleur' }, derailleur: { drive: 'derailleur' }, hanger: { drive: 'derailleur' }, 'hub-gears': { drive: 'hub' },
  chain: { chain: true }, 'quick-link': { chain: true },
  battery: { ebike: true }, display: { ebike: true }, stanchions: { fork: 'suspension' },
};

/**
 * The bike to draw for a part: the rider's own where it has the part; where a detail the part needs was not told (a guess or a default),
 * the same bike with that detail, so the marker has something to point at; null where the rider told a detail that rules the part out
 * (hub gears on a bike entered with a derailleur). Brake pads follow the bike's brakes, rim brakes where none were told.
 */
export function drawnFor(spec: BikeSpec, id: PartPlace): BikeSpec | null {
  const needs: Needs = id === 'pads' ? { brakes: spec.brakes.value === 'disc' ? 'disc' : 'rim' } : NEEDS[id] ?? {};
  let out = spec;
  const told = (mark: string): boolean => mark === 'entered';
  if (needs.brakes && spec.brakes.value !== needs.brakes) {
    if (told(spec.brakes.mark) && spec.brakes.value !== 'none') return null;
    out = { ...out, brakes: { value: needs.brakes, mark: 'guessed' } };
  }
  const drive = needs.drive ?? (needs.chain && spec.drive.value === 'belt' ? 'derailleur' : undefined);
  if (drive && spec.drive.value !== drive) {
    if (told(spec.drive.mark)) return null;
    out = { ...out, drive: { value: drive, mark: 'guessed' } };
  }
  if (needs.fork && spec.fork.value !== needs.fork) {
    if (told(spec.fork.mark)) return null;
    out = { ...out, fork: { value: needs.fork, mark: 'guessed' } };
  }
  if (needs.ebike && !spec.ebike.value) {
    if (told(spec.ebike.mark)) return null;
    out = { ...out, ebike: { value: true, mark: 'guessed' } };
  }
  return out;
}

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: P): P => mul(a, 1 / (Math.hypot(a[0], a[1]) || 1));
const quad = (a: P, c: P, b: P, t: number): P => add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t));
const at = (c: P, r: number, rad: number): P => [c[0] + Math.cos(rad) * r, c[1] + Math.sin(rad) * r];
const round = (p: P): P => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

/**
 * The part's point on bikeArt's drawing of `spec` (whose anchors are `anchors`), or null where that drawing does not show it: draw
 * `drawnFor(spec, id)` to have one. The front wheel stands for both wheels; the rear has the drive, the dropouts and hub gears.
 */
export function partPoint(spec: BikeSpec, anchors: Anchors, id: PartPlace): P | null {
  const k = anchors.scale / 0.11;
  const { bb, rear, front, headTop, headBottom, seatTop, saddle, bar: clamp } = anchors.points;
  const fc: P = front;
  const rimR = (spec.rimMm.value / 2) * anchors.scale;
  const outer = anchors.wheels.front.r;
  const brakes = spec.brakes.value;
  const drive = spec.drive.value;
  const bars = spec.bars.value;
  // The bar's points as the drawing makes them: mm from the stem's clamp, y up.
  const barAt = (x: number, y: number): P => add(clamp, [x * anchors.scale, -y * anchors.scale]);
  const grip = bars === 'flat' ? barAt(-52, 26) : barAt(-140, 52);
  const hood = barAt(70, -2);
  const discCaliper = add(fc, mul(unit(sub(headBottom, fc)), 7.6 * k));
  const rimTop: P = [fc[0], fc[1] - rimR];
  // The step-through's down tube is the drawing's one curved tube (its template's `step`; named here, so this module, loaded with the guide,
  // takes nothing more from the first screen).
  const down = (s: number): P => {
    if (spec.style.value !== 'step-through') return lerp(bb, headBottom, s);
    const from = lerp(headTop, headBottom, 0.55);
    return quad(bb, [bb[0] + (from[0] - bb[0]) * 0.45, bb[1] + 4], from, s);
  };
  const p = ((): P | null => {
    switch (id) {
      case 'frame': return lerp(bb, seatTop, 0.55);
      case 'fork': return lerp(headBottom, fc, 0.55);
      case 'headset': return headTop;
      case 'stem': {
        const steerTop = add(headTop, mul(unit(sub(headBottom, headTop)), -32 * anchors.scale));
        return lerp(steerTop, clamp, 0.6);
      }
      case 'handlebar': return bars === 'drop' ? barAt(128, -68) : bars === 'flat' ? barAt(-18, 22) : barAt(-60, 72);
      case 'seatpost': return lerp(lerp(bb, seatTop, 0.96), saddle, 0.45);
      case 'hub': case 'wheel-qr': case 'thru-axle': return fc;
      case 'spokes': {
        const a = 0.3 + (13 * 2 * Math.PI) / 16;
        return lerp(at(fc, 2, a + 0.35), at(fc, rimR, a), 0.6);
      }
      case 'rim': return at(fc, rimR, -Math.PI / 3);
      case 'dropouts': return rear;
      case 'tyre': return at(fc, outer - (outer - rimR) / 2, -Math.PI / 4);
      case 'bead': case 'tube': return at(fc, rimR + (outer - rimR) * (id === 'bead' ? 0.25 : 0.5), id === 'bead' ? (-5 * Math.PI) / 6 : -Math.PI / 6);
      case 'valve': case 'tubeless-valve': return [fc[0], fc[1] + rimR];
      case 'brake-lever': return bars === 'drop' ? add(hood, [2 * k, -1.5 * k]) : add(grip, [6 * k, 0]);
      case 'rim-brake': case 'brake-qr': return brakes === 'rim' ? rimTop : null;
      case 'pads': return brakes === 'rim' ? rimTop : brakes === 'disc' ? discCaliper : null;
      case 'barrel':
        // On a road caliper; else on the derailleur's cable stop, else at the lever (flat bars' brake barrels sit there).
        if (brakes === 'rim' && bars === 'drop') return rimTop;
        if (drive === 'derailleur' && brakes !== 'rim') return add(rear, [-1.6 * k, 5 * k]);
        return bars === 'drop' ? add(hood, [2 * k, -1.5 * k]) : add(grip, [6 * k, 0]);
      case 'caliper': case 'pad-adjuster': return brakes === 'disc' ? discCaliper : null;
      case 'disc': return brakes === 'disc' ? at(fc, 8.8 * k, (3 * Math.PI) / 4) : null;
      case 'chain': case 'quick-link':
        return drive === 'belt' ? null : lerp(add(bb, [0, -9.6 * k]), add(rear, [0, -(drive === 'hub' ? 3.2 : 4.2) * k]), id === 'chain' ? 0.5 : 0.3);
      case 'chainring': return at(bb, 9.6 * k, (7 * Math.PI) / 6);
      case 'cassette': return drive === 'derailleur' ? at(rear, 4.2 * k, (-3 * Math.PI) / 4) : null;
      case 'derailleur': return drive === 'derailleur' ? add(rear, [-1.6 * k, 5 * k]) : null;
      case 'hanger': return drive === 'derailleur' ? add(rear, [-0.8 * k, 2.5 * k]) : null;
      case 'gear-cable': return lerp(bb, rear, 0.55);
      case 'hub-gears': return drive === 'hub' ? rear : null;
      case 'battery': {
        if (!spec.ebike.value) return null;
        const c = down(0.5);
        const d = unit(sub(down(0.51), down(0.49)));
        return add(c, mul([d[1], -d[0]], 3.3 * k));
      }
      case 'display': return spec.ebike.value ? clamp : null;
      case 'stanchions': return spec.fork.value === 'suspension' ? lerp(headBottom, fc, 0.3) : null;
    }
  })();
  return p ? round(p) : null;
}

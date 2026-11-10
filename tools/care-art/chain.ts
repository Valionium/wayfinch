// The chain (research note R §5.1): seen from the side, inner and outer links alternate and every plate spans two pins, 12.7 mm apart;
// the outer plates lie outside the inner ones, so from the side they cover the inner plates' round ends and only their waists show
// between. A quick link replaces one outer link: two plates, each with one pin and one keyhole slot, hooked over the two inner-link ends
// from opposite sides; under load each pin slides to the small end of the other plate's keyhole and clicks.
import { frame, type Frame } from './common.ts';
import { add, at, lerp, Path, perp, Pic, pointsAt, poly, rot, scale, sub, touches, unit, type Pt } from './kit.ts';

/** The chain's pitch, pin to pin (mm). */
export const PITCH = 12.7;
/** A plate's round end about its pin, and the half-height of its waist (mm): outer plates are waisted more (a figure eight). */
const END = 3.8, WAIST_IN = 3.1, WAIST_OUT = 2.5, PIN = 1.6;

const ang = (v: Pt): number => (Math.atan2(v[0], -v[1]) * 180) / Math.PI;

/** A plate from pin a to pin b (drawing units): round ends of radius r about the pins, its sides waisted to half-height h at the middle. */
export function plate(a: Pt, b: Pt, r: number, h: number): Path {
  const u = unit(sub(b, a)), nv = perp(u), mid = lerp(a, b, 0.5), w = 2 * h - r;
  return new Path().M(add(a, scale(nv, -r))).Q(add(mid, scale(nv, -w)), add(b, scale(nv, -r))).arcTo(b, ang(scale(nv, r)), true)
    .Q(add(mid, scale(nv, w)), add(a, scale(nv, r))).arcTo(a, ang(scale(nv, -r)), true).Z();
}

/**
 * A run of chain from the side through the pins `pins` (drawing units, a pitch apart): link i joins pins i and i+1, inner when i is even
 * if `innerFirst`. Inner plates first, then the outer plates over their ends, then the outer plates' pin heads. Skips the links in `skip`
 * (where a quick link goes); names each plate 'in-i' or 'out-i', and each pin head 'pin-i'.
 */
export function chainSide(pic: Pic, f: Frame, pins: Pt[], o: { innerFirst?: boolean; skip?: number[]; hi?: number } = {}): void {
  const inner = (i: number) => (i % 2 === 0) === (o.innerFirst ?? true);
  const skip = new Set(o.skip ?? []);
  const links = pins.slice(0, -1).map((p, i) => ({ i, a: p, b: pins[i + 1]! }));
  for (const l of links) if (inner(l.i) && !skip.has(l.i)) pic.path('cp-obj', plate(l.a, l.b, f.mm(END - 0.3), f.mm(WAIST_IN)), { name: `in-${l.i}` });
  for (const l of links) {
    if (inner(l.i) || skip.has(l.i)) continue;
    pic.path(o.hi === l.i ? 'cp-hi' : 'cp-obj', plate(l.a, l.b, f.mm(END), f.mm(WAIST_OUT)), { name: `out-${l.i}` });
    pic.circle('cp-fine', l.a, f.mm(PIN), { name: `pin-${l.i}` });
    pic.circle('cp-fine', l.b, f.mm(PIN), { name: `pin-${l.i + 1}` });
  }
}

/** Pins along a straight line from `start`, `count` of them, a pitch apart, at angle `a` (degrees, 0 = to the right). */
export const pinsAlong = (f: Frame, start: Pt, count: number, a = 0): Pt[] =>
  Array.from({ length: count }, (_, i) => add(start, [f.mm(PITCH * i) * Math.cos((a * Math.PI) / 180), f.mm(PITCH * i) * Math.sin((a * Math.PI) / 180)]));

/** A length of chain from the side, one outer plate marked (the guide's chain). */
export function chainGuide(): Pic {
  const pic = new Pic(320, 200);
  const f = frame(30, 96, 3.3);
  const pins = pinsAlong(f, f.m(0, 0), 7);
  chainSide(pic, f, pins, { hi: 3 });
  pic.label('cp-th', [190, 40], 'outer plate', [188, 36], add(lerp(pins[3]!, pins[4]!, 0.5), [0, -f.mm(2.2)]), undefined, 'leader-out');
  pic.label('cp-tm', [96, 160], 'inner plate', [94, 156], add(lerp(pins[2]!, pins[3]!, 0.5), [0, f.mm(2.4)]), 'end', 'leader-in');
  pic.label('cp-tm', [16, 40], 'pin', [40, 44], add(pins[1]!, [-f.mm(0.6), -f.mm(0.6)]), undefined, 'leader-pin');
  pic.text('cp-tm', [16, 190], 'Seen from the side');
  pic.facts.push(pointsAt(pic, 'leader-out', 'out-3', 1), pointsAt(pic, 'leader-in', 'in-2', 1), pointsAt(pic, 'leader-pin', 'pin-1', 1));
  pic.facts.push(touches(pic, 'out-3', 'in-2', 0), touches(pic, 'out-3', 'in-4', 0));
  pic.fact('pins a pitch apart', Math.abs(Math.hypot(...sub(pins[1]!, pins[0]!)) - f.mm(PITCH)) < 0.01);
  return pic;
}

/**
 * The quick link joining the chain's two ends (broken chain, step 2): the ends are inner links; the link's front plate has its own pin
 * through the left end's roller and its keyhole over the right end's roller, where the back plate's pin shows at the keyhole's big end,
 * not yet clicked into the small end.
 */
export function quickLink(): Pic {
  const pic = new Pic(320, 200);
  const f = frame(26, 96, 3.3);
  const pins = pinsAlong(f, f.m(0, 0), 8);
  // the quick link takes the place of the outer link between pins 3 and 4
  chainSide(pic, f, pins, { skip: [3] });
  const a = pins[3]!, b = pins[4]!, big = sub(b, [f.mm(2.3), 0]);
  pic.circle('cp-halo', lerp(a, b, 0.5), f.mm(10));
  // the front plate: a little longer than a pitch at the keyhole's end, so the pin can enter at the big end and slide to the small end
  pic.path('cp-hi', plate(a, b, f.mm(END), f.mm(WAIST_OUT + 0.2)), { name: 'link' });
  pic.circle('cp-dark', a, f.mm(PIN), { name: 'link-pin' });
  // the keyhole: a round end big enough for the pin's head, a narrow slot to the small end that holds the pin
  const keyhole = new Path().M(add(b, [0, -f.mm(0.95)])).L(add(big, [f.mm(1.2), -f.mm(0.95)]))
    .Q(add(big, [f.mm(1.4), -f.mm(1.9)]), add(big, [0, -f.mm(1.9)])).Q(add(big, [-f.mm(1.9), -f.mm(1.9)]), add(big, [-f.mm(1.9), 0]))
    .Q(add(big, [-f.mm(1.9), f.mm(1.9)]), add(big, [0, f.mm(1.9)])).Q(add(big, [f.mm(1.4), f.mm(1.9)]), add(big, [f.mm(1.2), f.mm(0.95)]))
    .L(add(b, [0, f.mm(0.95)])).Q(add(b, [f.mm(0.95), f.mm(0.95)]), add(b, [f.mm(0.95), 0])).Q(add(b, [f.mm(0.95), -f.mm(0.95)]), add(b, [0, -f.mm(0.95)])).Z();
  pic.path('cp-fine', keyhole, { name: 'keyhole' });
  // the back plate's pin, seen through the keyhole's big end
  pic.circle('cp-dark', big, f.mm(1.1), { name: 'back-pin' });
  pic.label('cp-th', [118, 36], 'quick link', [116, 32], add(lerp(a, b, 0.45), [0, -f.mm(2.4)]), 'end', 'leader-link');
  pic.label('cp-tm', [214, 168], 'keyhole', [212, 164], add(big, [f.mm(0.3), f.mm(1.9)]), undefined, 'leader-key');
  pic.text('cp-tm', [16, 190], 'Seen from the side');
  pic.facts.push(pointsAt(pic, 'leader-link', 'link', 1), pointsAt(pic, 'leader-key', 'keyhole', 1.2));
  pic.facts.push(at(pic, "the link's pin on the left end's roller", a, 'in-2'), at(pic, 'the keyhole over the right end', b, 'in-4'));
  pic.facts.push(touches(pic, 'link', 'in-2', 0), touches(pic, 'link', 'in-4', 0));
  return pic;
}

/**
 * A stiff link found by flexing (broken chain, step 4; skipping gears, step 1): the chain from above, so its plates are thin strips, the
 * rollers short bars between the inner plates and the pins' ends small stubs outside the outer plates; one joint marked, and the chain
 * beyond it shown (dashed) flexed to either side.
 */
export function stiffLink(): Pic {
  const pic = new Pic(320, 170);
  const f = frame(10, 78, 6), { m } = f;
  // from above (mm): rollers 2.2 wide between the inner plates, plates 0.8 thick, the pins' ends 0.4 past the outer plates
  const yIn = 1.1, yMid = 1.9, yOut = 2.7, yPin = 3.1, ROLL = 3.9, e = END - 0.6, joint = 2;
  const x = (i: number) => -3 + PITCH * i;
  const rect = (x0: number, x1: number, y0: number, y1: number): Path => poly([m(x0, y0), m(x1, y0), m(x1, y1), m(x0, y1)]);
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 1) continue;
    // an inner link: a roller at each pin between its plates, the plates either side
    for (const p of [x(i), x(i + 1)]) pic.path('cp-body', rect(p - ROLL, p + ROLL, -yIn, yIn), { name: `roller-${p === x(i) ? i : i + 1}` });
    for (const s2 of [-1, 1]) pic.path('cp-obj', rect(x(i) - e, x(i + 1) + e, s2 * yIn, s2 * yMid), { name: `in-${i}-${s2 < 0 ? 'l' : 'r'}` });
  }
  for (let i = 1; i < 5; i += 2) for (const s2 of [-1, 1]) pic.path('cp-obj', rect(x(i) - e, x(i + 1) + e, s2 * yMid, s2 * yOut), { name: `out-${i}-${s2 < 0 ? 'l' : 'r'}` });
  // the pins' ends outside the outer plates; the stiff joint's marked
  for (let i = 0; i <= 5; i++) for (const s2 of [-1, 1]) {
    pic.path(i === joint ? 'cp-hi' : 'cp-obj', rect(x(i) - PIN, x(i) + PIN, s2 * yOut, s2 * yPin), i === joint ? { name: `pin-${s2 < 0 ? 'l' : 'r'}` } : {});
  }
  pic.circle('cp-halo', m(x(joint), 0), f.mm(5));
  // the chain beyond the joint flexed to either side, dashed: its outer edges turned about the joint
  const c = m(x(joint), 0), reach = f.mm(x(5) + 3 - x(joint)), bend = 8;
  for (const y of [-yOut, yOut]) pic.path('cp-ghost', poly([rot(add(c, [f.mm(PITCH / 2), f.mm(y)]), c, -bend), rot(add(c, [reach, f.mm(y)]), c, -bend)], false));
  const tip = f.mm(x(4) - x(joint));
  pic.turn(c, tip, 90, 90 - bend).turn(c, tip, 90, 90 + bend);
  pic.label('cp-th', [104, 26], 'stiff link', [102, 22], m(x(joint) - PIN, -yPin), 'end', 'leader-stiff');
  pic.label('cp-th', [312, 150], 'flex sideways', [310, 146], add(c, [tip + 3, f.mm(yPin) + 6]), 'end', 'leader-flex');
  pic.text('cp-tm', [10, 162], 'Seen from above');
  pic.facts.push(pointsAt(pic, 'leader-stiff', 'pin-l', 1.5), touches(pic, 'out-1-l', 'in-0-l', 0.5), touches(pic, 'out-1-l', 'in-2-l', 0.5));
  pic.facts.push(touches(pic, 'roller-2', 'in-2-l', 0.5), touches(pic, 'pin-l', 'out-1-l', 0.5));
  return pic;
}

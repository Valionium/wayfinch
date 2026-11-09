// Rim brakes, seen from behind the rear brake with the wheel cut through at the brake (research note R §1.3): the pads sit on the rim's
// flat braking flanks below the tyre, never on the tyre; every arm hangs from what holds it (a caliper on its centre bolt in the stays'
// bridge, V-brake arms and hydraulic cylinders on the bosses on the stays). One function per kind; the state picks the step's view.
import { frame, rimAndTyre, section, bikeInset, boltHead, type Frame, type Section } from './common.ts';
import { Path, Pic, poly, pol, rrect, tube, touches, clear, pointsAt, at, add, type Pt } from './kit.ts';

export type RimState = 'open' | 'close' | 'centre' | 'guide' | 'pads' | 'barrel';

/** A brake arm: an ink casing with a panel core along a path (design 3.2, tubes 7 to 11 wide). */
const arm = (pic: Pic, p: Path, w: number, name?: string, hi = false): void => {
  pic.path(hi ? 'cp-hiline' : 'cp-objline', p, { style: `stroke-width:${w}`, ...(name ? { name } : {}) });
  pic.path('cp-armfill', p, { style: `stroke-width:${Math.max(1, w - 4)}` });
};

/** The seatstays seen from behind, down past the brake, and the stays' bridge at `bridgeY` (mm). */
function stays(pic: Pic, f: Frame, top: number, bottom: number, xTop: number, xBottom: number, bridgeY: number | null, wide = 10): void {
  const { m } = f;
  for (const s of [-1, 1]) {
    const a = m(s * xTop, top), b = m(s * xBottom, bottom);
    pic.path('cp-thin', tube(a, b, f.mm(wide)), { name: s < 0 ? 'stay-l' : 'stay-r' });
    pic.mark(s < 0 ? 'stay-l-axis' : 'stay-r-axis', poly([a, b], false));
  }
  if (bridgeY !== null) {
    const xAt = (y: number) => xTop + ((xBottom - xTop) * (y - top)) / (bottom - top);
    const x = xAt(bridgeY) - 4;
    pic.path('cp-thin', rrect(...m(-x, bridgeY - 3), f.mm(2 * x), f.mm(6), 2), { name: 'bridge' });
  }
}

/** The pad and its shoe on one side, the pad's face `gap` mm off the rim's flank (0 = on it). */
function pad(pic: Pic, f: Frame, s: Section, side: -1 | 1, gap: number, cls: string, name?: string): Pt {
  const { m } = f, face = s.we / 2 + gap;
  const x0 = side < 0 ? -face - 6 : face;
  pic.path(cls === 'cp-ghost' ? 'cp-ghost' : 'cp-rubber', rrect(...m(x0, 1.5), f.mm(6), f.mm(9), 2), name ? { name } : {});
  const shoe = side < 0 ? -face - 8.5 : face + 6;
  if (cls !== 'cp-ghost') pic.path('cp-obj', rrect(...m(shoe, 0.5), f.mm(2.5), f.mm(11), 1.5), name ? { name: `${name}-shoe` } : {});
  return m(side * (face + 8.5), 6);
}

const LEFT = "bike's left";

/** The rim brake's pads stand this far off the rim at rest (mm): a resting brake has clearance; touching pads would read as rubbing. */
const REST = 1.2;

/**
 * A road dual-pivot caliper (the rear one) from behind. The housing stop with its barrel and quick-release lever sits on one arm, and the
 * inner cable runs a short way down to its clamp on the other arm's tail, on the same side (Park Tool, dual-pivot service); that side is
 * the bike's left, as the owner checked on 8 November.
 */
export function caliper(state: RimState): Pic {
  const pic = new Pic(320, 244);
  // the barrel close-up (T15): the same caliper, five times nearer, round its housing stop
  const f = state === 'barrel' ? frame(201, 440, 5.6) : frame(192, 196, 2.2), { m } = f;
  const s = section(22, 17, 28, 20);
  bikeInset(pic, 'rear-brake');
  stays(pic, f, -47, 34, 28, 40, -44);
  rimAndTyre(pic, f, s, { spokes: 40, flankBand: state === 'guide' });
  const hi = state === 'guide';
  // the yoke on its centre bolt in the stays' bridge, the offset pivot beside it
  pic.path(hi ? 'cp-hi' : 'cp-obj', rrect(...m(-12, -52), f.mm(24), f.mm(13), f.mm(4)), { name: 'yoke' });
  boltHead(pic, m(0, -46), f.mm(2.6), { name: 'centre-bolt' });
  pic.circle('cp-fine', m(-7.5, -42), f.mm(1.3));
  const ax = s.we / 2 + REST + 8.5 + 1.8;
  // the left arm (on the offset pivot) rises at its top into the housing stop
  const armL = new Path().M(m(-10, -41)).C(m(-18, -38), m(-ax, -28), m(-ax, -16)).L(m(-ax, 9));
  pic.path(hi ? 'cp-hi' : 'cp-obj', poly([m(-9, -50), m(-12.6, -58), m(-18.4, -58), m(-14, -48)]), { name: 'stop-arm' });
  // the right arm (on the centre bolt) runs up, over the yoke, and ends in a tail on the left, under the stop, with the cable clamp
  const armR = new Path().M(m(ax, 9)).L(m(ax, -16)).C(m(ax, -28), m(18, -38), m(11, -44)).C(m(6, -58), m(-4, -58), m(-9.5, -53.5));
  const aw = state === 'barrel' ? f.mm(4.1) : 9;
  arm(pic, armL, aw, 'arm-l', hi);
  arm(pic, armR, aw, 'arm-r', hi);
  pad(pic, f, s, -1, REST, 'cp-rubber', 'pad-l');
  pad(pic, f, s, 1, REST, 'cp-rubber', 'pad-r');
  if (state === 'pads') {
    pic.path('cp-hi', rrect(...m(-s.we / 2 - REST - 6, 1.5), f.mm(6), f.mm(9), 2));
    pic.path('cp-hi', rrect(...m(s.we / 2 + REST, 1.5), f.mm(6), f.mm(9), 2));
  }
  // the barrel in the stop; the inner cable down to the clamp bolt on the right arm's tail. Unscrewed (T15), it stands a few threads
  // proud of the stop, which pulls the cable tighter; dashed, where it sat
  const up = state === 'barrel' ? 2.4 : 0;
  if (up) {
    pic.path('cp-ghost', rrect(...m(-18.2, -66), f.mm(5.5), f.mm(8), 1.5));
    pic.path('cp-obj', poly([m(-17.2, -58 - up), m(-13.8, -58 - up), m(-13.8, -58), m(-17.2, -58)]), { name: 'thread' });
    for (let y = -58 - up + 0.5; y < -58; y += 0.6) pic.line('cp-fine', m(-17.2, y), m(-13.8, y + 0.3));
  }
  pic.path(up ? 'cp-hi' : 'cp-obj', rrect(...m(-18.2, -66 - up), f.mm(5.5), f.mm(8), up ? 3 : 1.5), { name: 'barrel' });
  if (up) for (let x = -17.2; x < -13; x += 1) pic.line('cp-fine', m(x, -65.2 - up), m(x, -58.8 - up));
  pic.line('cp-fine', m(-15.5, -65 - up), m(-15.5, -58));
  pic.line('cp-fine', m(-15.5, -58), m(-10.6, -54.2));
  boltHead(pic, m(-9.8, -53.6), f.mm(1.8), { name: 'clamp' });
  pic.path('cp-ctx', new Path().M(m(-15.5, -66 - up)).Q(m(-15, -80 - up), m(-4, -86 - up)), { style: 'stroke-width:3' });
  // the quick-release lever on the stop: down is closed, up is open
  const pivot = m(-19.5, -60.5);
  const lever = (a: number) => tube(pivot, pol(pivot[0], pivot[1], f.mm(13), a), f.mm(2.4));
  const closedA = 214, openA = 322;
  if (state === 'open' || state === 'close') {
    const solid = state === 'close' ? openA : closedA, ghost = state === 'close' ? closedA : openA;
    pic.path('cp-ghost', lever(ghost));
    pic.circle('cp-halo', pol(pivot[0], pivot[1], f.mm(7), solid), 16);
    pic.path('cp-hi', lever(solid), { name: 'lever' });
    pic.circle('cp-dark', pivot, 2.2);
    pic.turn(pivot, f.mm(8.5), state === 'close' ? openA - 8 : closedA + 8, state === 'close' ? closedA + 8 : openA - 8);
    const open = pol(pivot[0], pivot[1], f.mm(13), openA), closed = pol(pivot[0], pivot[1], f.mm(13), closedA);
    pic.text('cp-th', add(open, [-5, -3]), 'open', 'end');
    pic.text('cp-th', add(closed, [-8, -1]), 'closed', 'end');
  } else {
    pic.path(hi ? 'cp-hi' : 'cp-obj', lever(closedA), { name: 'lever' });
    pic.circle('cp-dark', pivot, 2.2);
  }
  if (state !== 'barrel') pic.text('cp-t', [4, 232], LEFT);
  pic.facts.push(touches(pic, 'lever', 'barrel', f.mm(2.5 + up)), touches(pic, 'yoke', 'bridge', 1), touches(pic, 'clamp', 'arm-r', f.mm(1)));
  pic.facts.push(touches(pic, 'stop-arm', 'yoke', 1), touches(pic, up ? 'thread' : 'barrel', 'stop-arm', 1));
  if (up) {
    const c = m(-15.45, -62 - up);
    pic.circle('cp-halo', c, f.mm(6.5));
    pic.turnAxis(c, f.mm(5.2), f.mm(1.8), 250, 110);
    pic.label('cp-th', [314, 40], 'barrel adjuster', [312, 36], m(-12.7, -65.5 - up), 'end', 'leader-barrel');
    pic.label('cp-th', [316, 70], 'unscrew', [314, 66], add(c, [f.mm(5.4), f.mm(0.6)]), 'end', 'leader-turn');
    pic.facts.push(pointsAt(pic, 'leader-barrel', 'barrel'), touches(pic, 'thread', 'barrel', 0.5));
  }
  if (state === 'centre') {
    // the centring screw on the right arm's shoulder beside the yoke
    const scr = m(15.5, -39.5);
    pic.circle('cp-halo', scr, 15);
    boltHead(pic, scr, f.mm(1.6), { cls: 'cp-hi', name: 'screw' });
    pic.turn(scr, 12, -150, -30);
    pic.label('cp-th', [312, 44], 'centring screw', [272, 50], add(scr, [2.5, -2.5]), 'end', 'leader-screw');
    pic.facts.push(pointsAt(pic, 'leader-screw', 'screw'), touches(pic, 'screw', 'arm-r', f.mm(1)));
  }
  if (state === 'guide') {
    pic.label('cp-th', [312, 64], 'caliper', [282, 70], m(ax + 0.6, -18), 'end', 'leader-caliper');
    pic.facts.push(pointsAt(pic, 'leader-caliper', 'arm-r'));
  }
  if (state === 'pads') {
    pic.label('cp-th', [8, 210], 'pads', [40, 204], m(-s.we / 2 - REST - 4, 9), undefined, 'leader-pads');
    pic.label('cp-tm', [312, 232], 'rim', [292, 226], m(s.we / 2 - 1.5, 15), 'end', 'leader-rim');
    pic.facts.push(pointsAt(pic, 'leader-pads', 'pad-l'), pointsAt(pic, 'leader-rim', 'rim'));
  }
  rimFacts(pic, s, f, ['arm-l', 'arm-r', 'yoke']);
  return pic;
}

/** The facts every rim brake drawing holds: pads on the flanks, clear of the tyre; arms and body clear of the tyre. */
function rimFacts(pic: Pic, s: Section, f: Frame, parts: string[], studs = false): void {
  // at rest each pad stands just off its flank: clear of it, and no further than the rest gap
  for (const x of ['l', 'r']) pic.facts.push(clear(pic, `pad-${x}`, `flank-${x}`, f.mm(REST - 0.2)), touches(pic, `pad-${x}`, `flank-${x}`, f.mm(REST + 0.2)));
  pic.facts.push(clear(pic, 'pad-l', 'tyre', f.mm(0.8)), clear(pic, 'pad-r', 'tyre', f.mm(0.8)));
  for (const p of parts) pic.facts.push(clear(pic, p, 'tyre', f.mm(1.5)));
  if (studs) {
    for (const x of ['l', 'r']) pic.facts.push(touches(pic, `stud-${x}`, `pad-${x}-shoe`, 1), touches(pic, `stud-${x}`, `arm-${x}`, 1));
  } else pic.facts.push(touches(pic, 'arm-l', 'pad-l-shoe', f.mm(2.2)), touches(pic, 'arm-r', 'pad-r-shoe', f.mm(2.2)));
  void s;
}

/** A V-brake (rear) from behind: arms on the bosses on the stays, below the pads; the curved tube on the left arm. */
export function vbrake(state: RimState): Pic {
  const pic = new Pic(320, 250);
  const f = frame(190, 165, 1.55), { m } = f;
  const s = section(25, 19, 40, 22);
  bikeInset(pic, 'rear-brake');
  stays(pic, f, -72, 58, 27, 37, null);
  rimAndTyre(pic, f, s, { spokes: 50, flankBand: state === 'guide' });
  const bossY = 38, ax = 29.5;
  const atStay = (y: number) => 27 + (10 * (y + 72)) / 130;
  for (const side of [-1, 1] as const) {
    const boss = m(side * atStay(bossY), bossY);
    pic.circle('cp-obj', boss, f.mm(3.2), { name: side < 0 ? 'boss-l' : 'boss-r' });
    pic.facts.push(at(pic, 'boss centre', boss, side < 0 ? 'stay-l-axis' : 'stay-r-axis', 0.5));
  }
  const top = -66;
  for (const side of [-1, 1] as const) {
    const name = side < 0 ? 'arm-l' : 'arm-r';
    const p = new Path().M(m(side * atStay(bossY), bossY)).C(m(side * ax, 20), m(side * ax, -20), m(side * (ax - 1.5), top));
    arm(pic, p, 9, name, state === 'guide');
    pic.circle('cp-dark', m(side * atStay(bossY), bossY), 2.4);
  }
  pad(pic, f, s, -1, REST, 'cp-rubber', 'pad-l');
  pad(pic, f, s, 1, REST, 'cp-rubber', 'pad-r');
  // pad studs through the arms
  pic.line('cp-objline', m(-s.we / 2 - REST - 8.5, 6), m(-ax - 1.5, 6), { style: 'stroke-width:3', name: 'stud-l' });
  pic.line('cp-objline', m(s.we / 2 + REST + 8.5, 6), m(ax + 1.5, 6), { style: 'stroke-width:3', name: 'stud-r' });
  // the curved tube's holder on the left arm's top; the cable through a rubber boot to its clamp on the right arm
  const holder = m(-(ax - 1.5), top + 1);
  const seated: Pt = add(holder, [4, -2]);
  const tubeAt = (base: Pt) => new Path().M(base).C(add(base, [10, -2]), add(base, [14, -14]), add(base, [10, -30]));
  pic.path('cp-obj', rrect(holder[0] - 2, holder[1] - 7, 12, 9, 2.5), { name: 'holder' });
  pic.path('cp-fine', rrect(...m(-12, top - 1.6), f.mm(10), f.mm(4.2), 1.5));
  pic.line('cp-fine', add(holder, [10, -2.6]), m(ax - 1.5, top - 0.4));
  boltHead(pic, m(ax - 1.5, top), f.mm(1.8));
  const out = state === 'open', moving = state === 'open' || state === 'close';
  // solid where the tube is now, dashed where it goes (as on the quick-release pictures)
  const lifted = add(seated, [-6, -16]);
  const shown = state === 'close' ? lifted : seated;
  if (moving) pic.path('cp-ghost', tubeAt(out ? lifted : seated));
  if (moving) pic.path('cp-halowire', tubeAt(shown));
  pic.path(moving ? 'cp-hiline' : 'cp-objline', tubeAt(shown), { style: 'stroke-width:4.5', name: 'noodle' });
  // the housing comes down into the curved tube's top
  const tubeTop = add(shown, [10, -30]);
  pic.path('cp-ctx', new Path().M(tubeTop).Q(add(tubeTop, [-6, -14]), add(tubeTop, [-4, -30])), { style: 'stroke-width:3' });
  if (moving) {
    if (out) pic.arrow(add(seated, [-14, 4]), add(seated, [-14, -14]));
    else pic.arrow(add(seated, [-14, -14]), add(seated, [-14, 4]));
    pic.arrow(m(-ax - 13, -24), m(-ax - 5.5, -24));
    pic.text('cp-th', add(seated, [-20, 22]), out ? 'lift out' : 'put back', 'end');
    pic.text('cp-th', add(m(-ax - 13, -24), [-8, 4.5]), 'squeeze', 'end');
  }
  pic.text('cp-t', [4, 238], LEFT);
  if (state === 'centre') {
    // the spring screw on the side of the left arm, near its foot (each arm has one)
    const scr = m(-ax - 3.2, bossY - 9);
    pic.circle('cp-halo', scr, 14);
    boltHead(pic, scr, f.mm(2), { cls: 'cp-hi', name: 'screw' });
    pic.turn(scr, 12, 210, 330);
    pic.label('cp-th', [118, 200], 'spring screw', [112, 204], add(scr, [-2, 2.5]), 'end', 'leader-screw');
    pic.facts.push(pointsAt(pic, 'leader-screw', 'screw'));
  }
  if (state === 'guide') {
    pic.label('cp-th', [80, 150], 'V-brake', [86, 146], m(-ax, -10), 'end', 'leader-v');
    pic.label('cp-tm', [306, 40], 'curved tube', [262, 44], add(seated, [12, -16]), 'end', 'leader-tube');
    pic.facts.push(pointsAt(pic, 'leader-v', 'arm-l'), pointsAt(pic, 'leader-tube', 'noodle', 3));
  }
  rimFacts(pic, s, f, ['arm-l', 'arm-r'], true);
  pic.facts.push(touches(pic, 'arm-l', 'boss-l', 3), touches(pic, 'arm-r', 'boss-r', 3));
  return pic;
}

/** A hydraulic rim brake (Magura type) from behind: a cylinder on each boss, its pad on the piston; a lever frees the left one. */
export function hydraulic(state: RimState): Pic {
  const pic = new Pic(320, 244);
  const f = frame(190, 120, 2.2), { m } = f;
  const s = section(25, 19, 40, 22);
  bikeInset(pic, 'rear-brake');
  stays(pic, f, -50, 52, 24, 34, null, 8);
  rimAndTyre(pic, f, s, { spokes: 48, flankBand: state === 'guide' });
  const atStay = (y: number) => 24 + (10 * (y + 50)) / 102;
  const cyl = (side: -1 | 1, dx: number, dy: number, cls: string, name?: string): void => {
    const x = side < 0 ? -s.we / 2 - REST - 8.5 - 16 + dx : s.we / 2 + REST + 8.5 + dx;
    pic.path(cls, rrect(...m(x, -9 + dy), f.mm(16), f.mm(28), f.mm(3.5)), name ? { name } : {});
  };
  // the bosses on the stays: each cylinder's mount clamps one, so the cylinder hides it
  const bosses: Pt[] = [];
  for (const side of [-1, 1] as const) {
    const boss = m(side * atStay(14), 14);
    pic.facts.push(at(pic, 'boss centre', boss, side < 0 ? 'stay-l-axis' : 'stay-r-axis', 0.5));
    bosses.push(boss);
  }
  const out = state === 'open';
  const loose = state === 'open' || state === 'close';
  cyl(1, 0, 0, state === 'guide' ? 'cp-hi' : 'cp-obj', 'arm-r');
  pad(pic, f, s, 1, REST, 'cp-rubber', 'pad-r');
  pad(pic, f, s, -1, REST, 'cp-rubber', 'pad-l');
  // the left cylinder's mount on its boss, with the quick-release lever on it, outside the cylinder
  const xo = -s.we / 2 - REST - 8.5 - 16;
  pic.path('cp-obj', rrect(...m(xo - 5, 9), f.mm(6), f.mm(12), 2), { name: 'mount' });
  cyl(-1, 0, 0, state === 'guide' ? 'cp-hi' : 'cp-obj', 'arm-l');
  // the crossover hose over the tyre, from cylinder top to cylinder top
  pic.path('cp-ctx', new Path().M(m(-s.we / 2 - 16, -9)).C(m(-s.we / 2 - 16, -54), m(s.we / 2 + 16, -54), m(s.we / 2 + 16, -9)), { style: 'stroke-width:3', name: 'hose' });
  pic.path('cp-ctx', new Path().M(m(-s.we / 2 - 21, -9)).Q(m(-s.we / 2 - 22, -36), m(-s.we / 2 - 30, -50)), { style: 'stroke-width:3' });
  // the quick-release lever on the left mount: up is closed, down is open (OPEN shows)
  const pivot = m(xo - 2, 18);
  const lever = (a: number) => tube(pivot, pol(pivot[0], pivot[1], f.mm(14), a), f.mm(3));
  const closedA = 345, openA = 200;
  if (loose) {
    const solid = out ? closedA : openA, ghost = out ? openA : closedA;
    pic.path('cp-ghost', lever(ghost));
    pic.circle('cp-halo', pol(pivot[0], pivot[1], f.mm(7), solid), 16);
    pic.path('cp-hi', lever(solid), { name: 'lever' });
    pic.circle('cp-dark', pivot, 2.4);
    pic.turn(pivot, f.mm(9), out ? closedA - 8 : openA + 8, out ? openA + 8 : closedA - 8);
    pic.text('cp-th', add(pol(pivot[0], pivot[1], f.mm(14), closedA), [-7, 2]), 'closed', 'end');
    pic.text('cp-th', add(pol(pivot[0], pivot[1], f.mm(14), openA), [-9, 16]), 'open', 'end');
  } else {
    pic.path('cp-obj', lever(closedA), { name: 'lever' });
    pic.circle('cp-dark', pivot, 2.4);
  }
  pic.text('cp-t', [4, 232], LEFT);
  pic.facts.push(touches(pic, 'mount', 'arm-l', 1), at(pic, 'lever pivot', pivot, 'mount', 0));
  if (state === 'guide') {
    pic.label('cp-th', [190, 16], 'hydraulic', [214, 20], m(s.we / 2 + REST + 8.5 + 10, -9), 'middle', 'leader-h');
    pic.facts.push(pointsAt(pic, 'leader-h', 'arm-r'));
  }
  for (const x of ['l', 'r']) pic.facts.push(clear(pic, `pad-${x}`, `flank-${x}`, f.mm(REST - 0.2)), touches(pic, `pad-${x}`, `flank-${x}`, f.mm(REST + 0.2)));
  pic.facts.push(clear(pic, 'pad-l', 'tyre', f.mm(0.8)), clear(pic, 'pad-r', 'tyre', f.mm(0.8)));
  pic.facts.push(clear(pic, 'arm-l', 'tyre', f.mm(1.5)), clear(pic, 'arm-r', 'tyre', f.mm(1.5)), clear(pic, 'hose', 'tyre', f.mm(1.5)));
  pic.facts.push(at(pic, 'left boss', bosses[0]!, 'arm-l', 0), at(pic, 'right boss', bosses[1]!, 'arm-r', 0));
  return pic;
}


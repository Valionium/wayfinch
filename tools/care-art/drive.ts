// The rear drive from the drive side (research note R §5): the bike's front to the right, so the wheel and the chain turn clockwise.
// A 12-sprocket cassette (10 to 45 teeth) on the axle; the rear derailleur hangs from a UDH-style hanger below and behind the axle; the
// chain leaves the top of the sprocket it is on, forward to the chainring; it comes back along the bottom, round the back of the lower
// (tension) pulley, up and over the front of the upper (guide) pulley, up onto the bottom of the sprocket and round its back. The gear
// housing comes out of the chainstay near the dropout and loops back into the back of the derailleur, where cable gears may have a
// barrel adjuster. Millimetres: the axle at (0, 0), x forward, y down.
import { frame, type Frame } from './common.ts';
import { PITCH } from './chain.ts';
import { add, lerp, Path, Pic, pointsAt, pol, poly, rrect, scale, sub, touches, tube, unit, within, type Pt } from './kit.ts';

const TEETH = [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 40, 45];
/** A sprocket's pitch radius (mm) for its teeth: where the chain's pins sit. */
export const pitchR = (t: number): number => PITCH / (2 * Math.sin(Math.PI / t));
const ON = 21; // the sprocket the chain is on
const R_ON = pitchR(ON), PULLEY = pitchR(12);
/**
 * The derailleur (mm from the axle): its mounting bolt below and a little behind the axle; the body down and back to the cage's pivot;
 * the upper pulley under the sprocket, a few mm below it; the lower pulley down and back on the cage. The chainring is off the picture
 * to the front: 420 mm ahead, 70 mm lower, 40 teeth.
 */
const B_BOLT: Pt = [-4, 26], PIVOT: Pt = [-25, 63], UP: Pt = [-13, R_ON + PULLEY + 6], LOW: Pt = [-38, R_ON + PULLEY + 6 + 68];
const RING: Pt = [420, 70], R_RING = pitchR(40);
/** The barrel adjuster at the back of the derailleur's knuckle, where the housing comes in (mm, its two ends). */
const BARREL: [Pt, Pt] = [[-39, 27.5], [-27, 26.5]];
/** The clamp bolt on the parallelogram's outer link, where the inner cable is held (mm). */
const CLAMP: Pt = [-15, 41];

/** The tangent from circle 1 to circle 2 for a chain moving round 1 then 2 (s = 1 clockwise, -1 anticlockwise): its two touch points. */
export function tangent(c1: Pt, r1: number, s1: number, c2: Pt, r2: number, s2: number): [Pt, Pt] {
  const d = sub(c2, c1), dl = Math.hypot(d[0], d[1]), phi = Math.atan2(d[1], d[0]);
  const th = phi - Math.asin((s2 * r2 - s1 * r1) / dl);
  const t: Pt = [Math.cos(th), Math.sin(th)], n: Pt = [-t[1], t[0]];
  return [sub(c1, scale(n, s1 * r1)), sub(c2, scale(n, s2 * r2))];
}

const angOf = (c: Pt, p: Pt): number => (Math.atan2(p[0] - c[0], -(p[1] - c[1])) * 180) / Math.PI;

/** The chain's path through the drive, in drawing units, from the chainring's bottom round to the chainring's top (front off-picture). */
function chainPath(f: Frame): Path {
  const { m } = f, mm = f.mm;
  const C = m(0, 0), U = m(...UP), L = m(...LOW), Rg = m(...RING);
  const [r0, l0] = tangent(Rg, mm(R_RING), 1, L, mm(PULLEY), 1);
  const [l1, u0] = tangent(L, mm(PULLEY), 1, U, mm(PULLEY), -1);
  const [u1, c0] = tangent(U, mm(PULLEY), -1, C, mm(R_ON), 1);
  const [c1, r1] = tangent(C, mm(R_ON), 1, Rg, mm(R_RING), 1);
  return new Path().M(r0).L(l0).arcTo(L, angOf(L, l1), true).L(u0).arcTo(U, angOf(U, u1), false).L(c0).arcTo(C, angOf(C, c1), true).L(r1);
}

type DriveMark = 'cassette' | 'derailleur' | 'hanger' | 'cable' | 'barrel' | null;

/**
 * Draws the drive into `pic` at frame `f`, marking one part. Names: 'cassette' (the biggest sprocket), 'sprocket' (the one the chain is
 * on), 'hanger', 'body' (the derailleur's knuckle and parallelogram), 'cage', 'pulley-up', 'pulley-low', 'chain', 'housing', 'barrel',
 * 'dropout'. `close: true` is a close-up of the derailleur's knuckle: no sprockets and no chain; `rings: false` keeps only the sprocket
 * the chain is on.
 */
export function drive(pic: Pic, f: Frame, mark: DriveMark, o: { close?: boolean; rings?: boolean } = {}): void {
  const { m } = f, mm = f.mm;
  const C = m(0, 0);
  // the cassette: twelve sprockets, the biggest at the back; from this side each shows as a ring round the axle
  for (const t of TEETH.slice().reverse()) {
    const r = mm(pitchR(t) + 2.2);
    if (o.close) break;
    if (o.rings === false && t !== ON) continue;
    if (t === 45) pic.circle(mark === 'cassette' ? 'cp-hi' : 'cp-body', C, r, { name: 'cassette' });
    else if (t === ON) pic.circle('cp-fine', C, r, { name: 'sprocket' });
    else pic.circle('cp-thin', C, r);
  }
  pic.circle('cp-obj', C, mm(9), { name: 'lockring' });
  pic.circle('cp-fine', C, mm(5));
  // the frame's rear end, outside the cassette: chainstay forward and a little down, seatstay up and forward, the dropout round the axle
  pic.path('cp-body', tube(m(0, 0), m(300, 50), mm(18)));
  pic.path('cp-body', tube(m(0, 0), m(190, -330), mm(14)));
  pic.path('cp-body', new Path().M(m(-15, -6)).Q(m(-16, 14), m(0, 16)).Q(m(18, 17), m(24, 4)).L(m(17, -15)).Q(m(-2, -22), m(-15, -6)).Z(), { name: 'dropout' });
  // the hanger: round the axle against the dropout, a tail down to the derailleur's bolt
  const hanger = new Path().M(m(-11, -4)).Q(m(-13, 8), m(B_BOLT[0] - 8, B_BOLT[1] - 2)).Q(m(B_BOLT[0] - 7, B_BOLT[1] + 8), m(B_BOLT[0], B_BOLT[1] + 8))
    .Q(m(B_BOLT[0] + 8, B_BOLT[1] + 8), m(B_BOLT[0] + 8, B_BOLT[1])).Q(m(9, 12), m(11, 2)).Q(m(10, -10), m(0, -11)).Q(m(-9, -11), m(-11, -4)).Z();
  pic.path(mark === 'hanger' ? 'cp-hi' : 'cp-obj', hanger, { name: 'hanger' });
  pic.circle('cp-fine', C, mm(6.5));
  // the cage: from this side its outer plate, round both pulleys
  const cu = m(...UP), cl = m(...LOW), r = mm(PULLEY + 4.5);
  const dir = unit(sub(cl, cu)), nv: Pt = [-dir[1], dir[0]];
  const cage = new Path().M(add(cu, scale(nv, r))).arcTo(cu, angOf(cu, sub(cu, scale(nv, r))), true).L(sub(cl, scale(nv, r)))
    .arcTo(cl, angOf(cl, add(cl, scale(nv, r))), true).Z();
  pic.path(mark === 'derailleur' ? 'cp-hi' : 'cp-body', cage, { name: 'cage' });
  for (const [c, nm] of [[UP, 'pulley-up'], [LOW, 'pulley-low']] as const) {
    pic.circle('cp-obj', m(...c), mm(PULLEY + 1.8), { name: nm });
    pic.circle('cp-fine', m(...c), mm(4));
  }
  // the chain: a band with its pins a pitch apart
  if (!o.close) {
    const chain = chainPath(f);
    pic.path('cp-objline', chain, { name: 'chain', style: `stroke-width:${mm(7.4).toFixed(1)}` });
    pic.path('cp-armfill', chain, { style: `stroke-width:${(mm(7.4) - 3).toFixed(1)}` });
    pic.path('cp-objline', chain, { style: `stroke-width:${Math.max(1.8, mm(3.2)).toFixed(1)};stroke-dasharray:0 ${mm(PITCH).toFixed(2)}` });
  }
  // the derailleur, outside the chain: its knuckle on the bolt, the barrel at its back; the parallelogram's outer link down and back to the cage's knuckle
  const dcls = mark === 'derailleur' ? 'cp-hi' : 'cp-obj';
  pic.path(dcls, poly([m(-21, 31), m(-6, 31), m(-15, 62), m(-31, 60)]), { name: 'link' });
  pic.path(dcls, rrect(...m(-28, 18.5), mm(33), mm(15), mm(5)), { name: 'body' });
  pic.circle('cp-fine', m(...B_BOLT), mm(3.2));
  pic.path(dcls, rrect(...m(PIVOT[0] - 8, PIVOT[1] - 6), mm(17), mm(12), mm(4)), { name: 'p-knuckle' });
  pic.circle('cp-dark', m(...PIVOT), mm(2.2));
  // the gear housing: out of the chainstay ahead of the dropout, a wide loop down and back, into the barrel at the back of the knuckle
  const housing = new Path().M(m(62, 19)).C(m(58, 96), m(-98, 86), m(...BARREL[0]));
  const cable = mark === 'cable' ? 'cp-hiline' : 'cp-objline';
  pic.path(cable, housing, { name: 'housing', style: `stroke-width:${Math.min(4, Math.max(3, mm(4.5))).toFixed(1)}` });
  pic.path(mark === 'barrel' ? 'cp-hi' : 'cp-obj', tube(m(...BARREL[0]), m(...BARREL[1]), mm(7)), { name: 'barrel' });
  for (let x = BARREL[0][0] + 2.5; x < BARREL[1][0] - 1; x += 2.5) pic.line('cp-fine', m(x, BARREL[0][1] - 3.3 + (x - BARREL[0][0]) * -0.08), m(x, BARREL[0][1] + 3.3 + (x - BARREL[0][0]) * -0.08));
  // the inner cable from the barrel, under the knuckle, to its clamp bolt on the outer link
  pic.path(mark === 'cable' ? 'cp-hiline' : 'cp-fine', new Path().M(m(BARREL[1][0] + 1, BARREL[1][1] + 1.5)).Q(m(-22, 36), m(...CLAMP)), { name: 'cable', style: 'stroke-width:1.4' });
  pic.circle('cp-obj', m(...CLAMP), mm(2.6), { name: 'clamp' });
}

/** The facts every drive drawing holds. */
function driveFacts(pic: Pic, f: Frame, close = false): void {
  if (!close) pic.facts.push(touches(pic, 'chain', 'pulley-up', f.mm(2)), touches(pic, 'chain', 'pulley-low', f.mm(2)), touches(pic, 'chain', 'sprocket', f.mm(2.4)));
  pic.facts.push(touches(pic, 'hanger', 'dropout', 0.5), touches(pic, 'body', 'hanger', 0.5), touches(pic, 'barrel', 'body', 0.6));
  pic.facts.push(touches(pic, 'link', 'body', 0.5), touches(pic, 'link', 'p-knuckle', 0.5), touches(pic, 'housing', 'barrel', 0.6), touches(pic, 'cable', 'clamp', 0.6));
  pic.facts.push(within(pic, 'pulley-up', 'cage', 1), within(pic, 'pulley-low', 'cage', 1));
}

/** The guide's close-ups of the rear drive: one scene, one part marked. */
export function driveGuide(part: 'cassette' | 'derailleur' | 'hanger' | 'cable'): Pic {
  const pic = new Pic(320, 240);
  const f = frame(118, 88, 0.78);
  drive(pic, f, part);
  const { m } = f;
  const to: Record<typeof part, Pt> = {
    cassette: pol(...m(0, 0), f.mm(pitchR(45) + 2.2), 128), derailleur: m(PIVOT[0] + 9, PIVOT[1] + 1), hanger: m(7, 9), cable: pic.get('housing').parts[0]![4]!,
  };
  const words: Record<typeof part, string> = { cassette: 'rear sprockets', derailleur: 'rear derailleur', hanger: 'hanger', cable: 'gear housing' };
  pic.label('cp-th', [316, 182], words[part], [314, 178], to[part], 'end', 'leader');
  pic.facts.push(pointsAt(pic, 'leader', part === 'cable' ? 'housing' : part === 'derailleur' ? 'p-knuckle' : part, 1.5));
  driveFacts(pic, f);
  return pic;
}

/** The gears' barrel adjuster where the housing meets the rear derailleur (gears skipping, step 2): turned a click at a time. */
export function gearsBarrel(): Pic {
  const pic = new Pic(320, 230);
  const f = frame(214, 60, 1.45);
  drive(pic, f, 'barrel', { rings: false });
  const { m } = f;
  const a = m(...BARREL[0]), b = m(...BARREL[1]), mid = lerp(a, b, 0.5);
  pic.circle('cp-halo', mid, f.mm(12));
  pic.turnAxis(mid, f.mm(5.5), f.mm(10), 30, 150);
  pic.label('cp-th', [6, 40], 'barrel adjuster', [8, 36], add(a, [0, -f.mm(3.6)]), undefined, 'leader-barrel');
  pic.facts.push(pointsAt(pic, 'leader-barrel', 'barrel', 1.5));
  driveFacts(pic, f);
  return pic;
}

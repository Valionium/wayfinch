// The e-bike's battery (batch 4; research note R §7): refitting it, in the down tube (the modern default: Bosch's pivot design, the
// contacts at the lower end; seat the bottom in the lower holder, swing the battery up into the tube until the catch holds it, lock it
// with the key) or on top of the down tube (older bikes: the same pivot at the lower end, the battery tilted down onto the tube); and
// the battery taken off, its contacts at its end, wiped with a dry cloth.
import { bikeInset } from './common.ts';
import { add, at, deg, Path, Pic, pointsAt, poly, rot, rrect, scale, touches, within, type Pt } from './kit.ts';

/**
 * Refitting the battery, from the bike's right side, front to the right: the down tube from the motor up to the head tube; the battery
 * (420 by 74 mm) pivoting at its lower end, swung 14° out; a dashed outline where it goes; an arrow pushing it home; the catch at its
 * upper end, where it clicks; the lock beside it.
 */
export function batteryRefit(where: 'in' | 'on'): Pic {
  const pic = new Pic(320, 220);
  const k = 0.4, O: Pt = where === 'in' ? [52, 184] : [66, 188], A = 38;
  const da: Pt = [Math.cos(deg(A)), -Math.sin(deg(A))], nb: Pt = [Math.sin(deg(A)), Math.cos(deg(A))];
  /** a mm along the down tube from the motor, b mm across it towards its underside. */
  const p = (a: number, b: number): Pt => add(O, add(scale(da, a * k), scale(nb, b * k)));
  bikeInset(pic, 'down-tube');
  // the frame: the down tube runs into the head tube, whose top leaves the picture, and down into the motor
  pic.path('cp-body', poly([p(-10, -45), p(640, -45), p(640, 45), p(-10, 45)]), { name: 'down-tube' });
  const hv: Pt = [-Math.sin(deg(18)), -Math.cos(deg(18))], hn: Pt = [hv[1] * -1, hv[0]];
  const H = p(660, -6), hp = (s: number, t: number): Pt => add(H, add(scale(hv, s * k), scale(hn, t * k)));
  pic.path('cp-body', poly([hp(-110, -30), hp(400, -30), hp(400, 30), hp(-110, 30)]), { name: 'head-tube' });
  const mc = p(-30, 0);
  // the motor: a round housing round the crank axle (as Bosch's), the down tube ending in it
  pic.circle('cp-body', mc, 58 * k, { name: 'motor' });
  pic.circle('cp-fine', mc, 16 * k);
  // the battery: seated (dashed) and swung out about its lower end
  const L = 420, W = 74, a0 = 80;
  const b0 = where === 'in' ? 44 - W : -45 - W, b1 = b0 + W;
  const seated = [p(a0, b0), p(a0 + L, b0), p(a0 + L, b1), p(a0, b1)];
  const pivot = where === 'in' ? p(a0, b1) : p(a0, b1);
  const swing = where === 'in' ? 14 : -11;
  const out = seated.map((q) => rot(q, pivot, swing));
  const bat = poly(out);
  pic.path('cp-halostroke', bat);
  pic.path('cp-hi', bat, { name: 'battery' });
  pic.mark('seat-mark', poly(seated));
  pic.path('cp-ghost', poly(seated), { name: 'seated' });
  // the catch at the upper end, which the battery's end clicks into; the key lock beside it
  const cb = where === 'in' ? [b1 - 40, b1] : [-45 - 20, -45];
  pic.path('cp-obj', poly([p(a0 + L, cb[0]!), p(a0 + L + 12, cb[0]!), p(a0 + L + 12, cb[1]!), p(a0 + L, cb[1]!)]), { name: 'catch' });
  const latch = p(a0 + L + 6, (cb[0]! + cb[1]!) / 2);
  const lock = where === 'in' ? p(a0 + L + 30, 22) : p(a0 + L + 30, -28);
  pic.circle('cp-obj', lock, 8 * k, { name: 'lock' });
  pic.line('cp-fine', add(lock, [-4 * k, 0]), add(lock, [4 * k, 0]));
  // the push: an arc about the pivot, outside the swung battery, its head on the battery's face
  const face = where === 'in' ? 1 : -1;
  const r = 300 * k;
  const angOf = (q: Pt): number => (Math.atan2(q[0] - pivot[0], -(q[1] - pivot[1])) * 180) / Math.PI;
  const base = angOf(p(a0 + 300, b1)); // the tube's face from the pivot
  const span = (Math.atan2(W, 300) * 180) / Math.PI; // the battery's width seen from the pivot
  if (where === 'in') pic.turn(pivot, r, base + swing + 18, base + swing + 1.5);
  else pic.turn(pivot, r, base + swing - span - 18, base + swing - span - 1.5);
  pic.label('cp-t', where === 'in' ? [150, 214] : [80, 100], 'battery', [0, 0], rot(p(a0 + 150, (b0 + b1) / 2 + face * 20), pivot, swing),
    where === 'in' ? undefined : 'end', 'leader');
  pic.label('cp-th', where === 'in' ? [196, 40] : [200, 160], 'until it clicks', [0, 0], latch, where === 'in' ? 'end' : undefined, 'leader-click');
  pic.label('cp-t', where === 'in' ? [316, 92] : [316, 126], 'lock', [0, 0], add(lock, [5 * k, 5 * k]), 'end', 'leader-lock');
  pic.facts.push(pointsAt(pic, 'leader', 'battery'), pointsAt(pic, 'leader-click', 'catch'), pointsAt(pic, 'leader-lock', 'lock'), touches(pic, 'catch', 'seated', 0.5), within(pic, 'lock', 'down-tube'),
    touches(pic, 'battery', 'seated', 0.5));
  pic.facts.push(where === 'in' ? within(pic, 'seat-mark', 'down-tube', 0.6) : touches(pic, 'seat-mark', 'down-tube', 0.5));
  pic.fact('the battery swings about its lower end', at(pic, 'the pivot', pivot, 'battery', 0.2).ok);
  return pic;
}

/**
 * The battery off the bike, its end towards you: a box built from its end face and one depth offset, so its edges meet; the contact
 * socket in the end face, two flat blades and two small pins; a dry cloth, an arrow from it to the contacts.
 */
export function batteryContacts(): Pic {
  const pic = new Pic(320, 210);
  const F: Pt[] = [[132, 92], [212, 92], [212, 190], [132, 190]], D: Pt = [-108, -76];
  const B = F.map((q) => add(q, D));
  pic.path('cp-obj', poly([F[0]!, F[1]!, B[1]!, B[0]!]), { name: 'top' });
  pic.path('cp-obj', poly([F[0]!, F[3]!, B[3]!, B[0]!]), { name: 'side' });
  pic.path('cp-obj', poly(F), { name: 'end' });
  pic.circle('cp-halo', [172, 141], 40);
  pic.path('cp-hi', rrect(146, 116, 52, 50, 6), { name: 'socket' });
  pic.path('cp-dark', rrect(156, 126, 7, 30, 1.5)).path('cp-dark', rrect(169, 126, 7, 30, 1.5));
  pic.circle('cp-dark', [187, 132], 3).circle('cp-dark', [187, 150], 3);
  pic.path('cp-body', new Path().M([238, 112]).Q([262, 100], [284, 110]).Q([300, 117], [310, 108]).L([314, 168]).Q([298, 178], [280, 168])
    .Q([258, 158], [242, 170]).Z(), { name: 'cloth' });
  pic.path('cp-fine', new Path().M([248, 128]).Q([268, 120], [292, 130]).M([250, 146]).Q([272, 138], [298, 148]));
  pic.arrow([236, 142], [199, 142]);
  pic.label('cp-th', [312, 40], 'contacts', [310, 36], [192, 120], 'end', 'leader');
  pic.label('cp-t', [312, 200], 'dry cloth', [310, 196], [290, 170], 'end', 'leader-cloth');
  pic.facts.push(touches(pic, 'top', 'end', 0), touches(pic, 'side', 'end', 0), touches(pic, 'top', 'side', 0), within(pic, 'socket', 'end'),
    pointsAt(pic, 'leader', 'socket'), pointsAt(pic, 'leader-cloth', 'cloth', 2), at(pic, "the arrow's head", [199, 142], 'socket', 1.5));
  return pic;
}

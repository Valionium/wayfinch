// Close-ups for batch 3 that are not the chain or the rear drive: a flat-bar brake lever with its barrel adjuster (the V-brake's barrel
// is on the lever, R §1.3), a fork end as a dropout (a closed hole for a thru-axle, an open slot for a quick release, R §2), and the
// chainring and crank (one direct-mount ring, or two on a four-arm spider, R §5).
import { frame } from './common.ts';
import { add, lerp, Path, Pic, pointsAt, pol, poly, rrect, scale, sub, touches, tube, unit, within, type Pt } from './kit.ts';
import { pitchR } from './drive.ts';

/**
 * A flat-bar brake lever from above, the rider's view (brakes not biting, step 3, on a V-brake): the bar across, the lever's clamp on
 * it, the blade in front of the bar towards the grip; at the front of the lever's body the barrel adjuster with its knurled lock ring,
 * the housing out of it towards the brake. Unscrewed a turn or two (T15), it stands a few threads proud of the body.
 */
export function leverBarrel(): Pic {
  const pic = new Pic(320, 220);
  const f = frame(190, 164, 2.6), { m, mm } = f;
  // the bar, its grip at the right end
  pic.path('cp-body', poly([m(-60, -11), m(62, -11), m(62, 11), m(-60, 11)]), { name: 'bar' });
  pic.path('cp-obj', rrect(...m(30, -16), mm(40), mm(32), mm(7)), { name: 'grip' });
  // the lever: its clamp round the bar, its body forward (up in the picture); the blade pivots at the body's front and runs to the grip
  pic.path('cp-obj', rrect(...m(-8, -13), mm(16), mm(26), mm(3)), { name: 'clamp' });
  pic.path('cp-obj', new Path().M(m(-8, -12)).L(m(-10, -30)).Q(m(-10, -38), m(-2, -38)).L(m(6, -38)).Q(m(12, -38), m(12, -30)).L(m(8, -12)).Z(), { name: 'body' });
  pic.path('cp-obj', new Path().M(m(8, -34)).Q(m(34, -40), m(66, -34)).L(m(66, -27)).Q(m(36, -31), m(9, -26)).Z(), { name: 'blade' });
  pic.circle('cp-fine', m(6, -32), mm(1.8));
  // the barrel at the body's front, its axis forward and a little inward; unscrewed, the threads show between body and lock ring
  const axisA = m(-6, -38), dir = unit(sub(m(-16, -70), axisA)), side: Pt = [-dir[1], dir[0]], at = (d: number): Pt => add(axisA, scale(dir, mm(d)));
  pic.path('cp-obj', tube(at(-0.6), at(3), mm(5)), { name: 'thread' });
  for (let d = 0.4; d < 3; d += 0.7) pic.line('cp-fine', add(at(d), scale(side, mm(2.4))), add(at(d + 0.3), scale(side, -mm(2.4))));
  pic.path('cp-ghost', tube(at(0), at(9), mm(7)));
  pic.path('cp-obj', tube(at(3), at(5), mm(8.6)), { name: 'lock-ring' });
  pic.path('cp-hi', tube(at(5), at(14), mm(7)), { name: 'barrel' });
  for (let d = 6.2; d < 13.5; d += 1.4) pic.line('cp-fine', add(at(d), scale(side, mm(3.5))), add(at(d), scale(side, -mm(3.5))));
  pic.path('cp-objline', new Path().M(at(14)).Q(at(26), add(at(32), scale(side, -mm(12)))), { name: 'housing', style: 'stroke-width:4' });
  const c = at(9.5);
  pic.circle('cp-halo', c, mm(9));
  pic.turnAxis(c, mm(6.5), mm(2.6), 250, 110);
  pic.label('cp-th', [6, 104], 'barrel adjuster', [8, 100], add(at(6.5), scale(side, mm(3.5))), undefined, 'leader-barrel');
  pic.label('cp-th', [316, 34], 'unscrew', [314, 30], add(c, [mm(6.8), mm(0.4)]), 'end', 'leader-turn');
  pic.facts.push(pointsAt(pic, 'leader-barrel', 'barrel'), touches(pic, 'thread', 'body', 1), touches(pic, 'lock-ring', 'thread', 0.5), touches(pic, 'barrel', 'lock-ring', 0.5));
  pic.facts.push(touches(pic, 'clamp', 'bar', 0.5), touches(pic, 'body', 'clamp', 0.5), touches(pic, 'blade', 'body', 0.5), touches(pic, 'housing', 'barrel', 0.5));
  return pic;
}

/**
 * A fork end from the bike's left side, as the guide's dropout: for a thru-axle a closed hole round the axle; for a quick release an
 * open slot from below with the axle sitting up in its top. The fork leg comes down to it; the hub's end cap behind.
 */
export function dropout(kind: 'thru' | 'qr'): Pic {
  const pic = new Pic(320, 220);
  const f = frame(150, 128, 3.6), { m, mm } = f;
  // the fork leg: down to the axle, a little forward at the top (the fork's rake)
  pic.path('cp-body', tube(m(14, -60), m(0, 0), mm(26)));
  const axle = kind === 'thru' ? 6 : 4.5;
  if (kind === 'thru') {
    pic.path('cp-hi', new Path().M(m(-13, -6)).Q(m(-15, 15), m(0, 15)).Q(m(15, 15), m(13, -6)).L(m(13, -14)).L(m(-13, -14)).Z(), { name: 'dropout' });
    pic.circle('cp-fine', m(0, 0), mm(axle + 0.3), { name: 'hole' });
    pic.circle('cp-obj', m(0, 0), mm(axle), { name: 'axle' });
    pic.circle('cp-fine', m(0, 0), mm(2.5));
  } else {
    // the slot: 9.5 mm wide, open downwards; the axle (9 mm) up against its top; the skewer's nut outside
    const w = 4.75;
    pic.path('cp-hi', new Path().M(m(-13, -6)).Q(m(-15, 13), m(-6, 14)).L(m(-w, 14)).L(m(-w, 0)).arcTo(m(0, 0), 90, true).L(m(w, 14))
      .L(m(6, 14)).Q(m(15, 13), m(13, -6)).L(m(13, -14)).L(m(-13, -14)).Z(), { name: 'dropout' });
    pic.mark('hole', new Path().M(m(-w, 14)).L(m(-w, 0)).arcTo(m(0, 0), 90, true).L(m(w, 14)).Z());
    pic.circle('cp-obj', m(0, 0.25), mm(axle), { name: 'axle' });
    pic.circle('cp-fine', m(0, 0.25), mm(2.5));
  }
  pic.label('cp-th', [300, 60], 'dropout', [298, 56], m(12, -10), 'end', 'leader');
  pic.label('cp-tm', [300, 196], kind === 'thru' ? 'thru-axle' : 'axle', [298, 192], m(axle * 0.6, axle * 0.6), 'end', 'leader-axle');
  pic.text('cp-tm', [10, 212], kind === 'thru' ? 'A closed hole: for a thru-axle' : 'An open slot: for a quick release');
  pic.facts.push(pointsAt(pic, 'leader', 'dropout'), pointsAt(pic, 'leader-axle', 'axle'), within(pic, 'axle', 'hole', 0.3), touches(pic, 'axle', 'hole', mm(0.35)));
  return pic;
}

/** Teeth round a ring: `t` teeth on the pitch radius r (drawing units), as one closed outline. */
function teeth(c: Pt, r: number, t: number, depth: number): Path {
  const p = new Path();
  for (let i = 0; i < t; i++) {
    const a = (360 * i) / t;
    const pts = [pol(...c, r - depth, a - 360 / t / 2 + 4), pol(...c, r + depth * 0.5, a - 360 / t / 5), pol(...c, r + depth * 0.5, a + 360 / t / 5)];
    if (i === 0) p.M(pts[0]!); else p.L(pts[0]!);
    p.L(pts[1]!).L(pts[2]!);
  }
  return p.Z();
}

/**
 * The chainring and crank from the drive side: one direct-mount ring (no spider arms; 40 teeth) or two rings (50 and 34) on a four-arm
 * spider; the crank, 170 mm, from the axle to the pedal, the pedal's body centred on its spindle.
 */
export function chainring(kind: '1x' | '2x'): Pic {
  const pic = new Pic(320, 230);
  const f = frame(118, 108, 0.72), { m, mm } = f;
  const C = m(0, 0);
  const rings = kind === '1x' ? [40] : [50, 34];
  rings.forEach((t, i) => {
    const r = mm(pitchR(t));
    pic.path('cp-hi', teeth(C, r, t, mm(2.6)), { name: `ring-${i}` });
    pic.circle('cp-fine', C, r - mm(7));
  });
  if (kind === '1x') {
    // direct mount: the ring's web runs to the crank's centre, no arms
    pic.circle('cp-obj', C, mm(26), { name: 'mount' });
  } else {
    // the four-arm spider: one arm hidden behind the crank, the others at uneven angles
    const crankA = 120;
    for (const a of [crankA + 72, crankA + 180, crankA + 252]) pic.path('cp-obj', tube(C, pol(...C, mm(pitchR(50) - 9), a), mm(11)), { name: `arm-${a}` });
    pic.circle('cp-obj', C, mm(22), { name: 'mount' });
  }
  // the crank: wide at the axle, narrowing to the pedal's end
  const end = pol(...C, mm(170), 120);
  const u = unit(sub(end, C)), nv: Pt = [-u[1], u[0]];
  pic.path('cp-obj', poly([add(C, scale(nv, mm(15))), add(end, scale(nv, mm(10))), sub(end, scale(nv, mm(10))), sub(C, scale(nv, mm(15)))]), { name: 'crank' });
  pic.circle('cp-obj', C, mm(14));
  pic.circle('cp-fine', C, mm(7));
  // the pedal, seen end-on along its spindle: its body centred on the spindle
  pic.path('cp-obj', rrect(end[0] - mm(48), end[1] - mm(10), mm(96), mm(20), mm(6)), { name: 'pedal' });
  pic.circle('cp-dark', end, mm(4.5), { name: 'spindle' });
  pic.label('cp-th', [312, 30], kind === '1x' ? 'chainring' : 'chainrings', [310, 26], pol(...C, mm(pitchR(rings[0]!) + 1), 40), 'end', 'leader');
  pic.label('cp-tm', [312, 132], 'crank', [310, 128], lerp(C, end, 0.62), 'end', 'leader-crank');
  pic.text('cp-tm', [10, 222], kind === '1x' ? 'One chainring' : 'Two chainrings');
  pic.facts.push(pointsAt(pic, 'leader', 'ring-0', 2), pointsAt(pic, 'leader-crank', 'crank'), within(pic, 'spindle', 'pedal', 0.5), touches(pic, 'mount', 'crank', 0));
  pic.fact('the pedal centred on its spindle', Math.abs((end[0] - mm(48) + mm(96) / 2) - end[0]) < 0.01);
  return pic;
}

// The parts guide's wheel and fork close-ups (batch 5; research note R §2, §4, §8): the hub, the quick release and the thru-axle from
// behind on the wheel-from-behind kit (the fork ends hold the axle, the hub's end caps against their inner faces); a hub gear between the
// frame's rear ends, its cable box outside the right one (Shimano Nexus and Alfine); spokes near the rim, crossed; and the fork from the
// front: crown, legs either side of the tyre down to the axle, its tapered steerer hidden in the head tube (drawn dashed).
import { boltHead } from './common.ts';
import { add, at, clear, lerp, Path, Pic, pointsAt, pol, poly, rrect, sub, touches, tube, within, type Pt } from './kit.ts';
import { forkHub } from './wheel.ts';

/** The front hub in the fork from behind, one part marked: the hub, the quick release, or the thru-axle. */
export function hubGuide(kind: 'hub' | 'qr' | 'thru'): Pic {
  const pic = new Pic(320, 220);
  const k = 1.75, cx = kind === 'qr' ? 192 : 205, cy = 116, half = 50;
  const m = (x: number, y: number): Pt => [cx + x * k, cy + y * k];
  forkHub(pic, kind === 'qr' ? 'qr' : 'thru', m, k, kind === 'hub' ? 'hub' : kind === 'qr' ? 'qr' : 'axle');
  pic.facts.push(touches(pic, 'cap-l', 'leg-l', 0.6), touches(pic, 'cap-r', 'leg-r', 0.6));
  if (kind === 'hub') {
    pic.label('cp-th', [312, 200], 'hub', [310, 196], m(20, 14), 'end', 'leader');
    pic.label('cp-t', [8, 200], 'disc', [10, 196], m(-42.1, 40), undefined, 'leader-disc');
    pic.facts.push(pointsAt(pic, 'leader', 'hub'), pointsAt(pic, 'leader-disc', 'rotor'));
  } else if (kind === 'qr') {
    pic.label('cp-th', [8, 30], 'lever', [10, 26], m(-half - 15, -26), undefined, 'leader');
    pic.label('cp-t', [312, 200], 'nut', [310, 196], m(half + 12.5, 5), 'end', 'leader-nut');
    pic.facts.push(pointsAt(pic, 'leader', 'lever'), pointsAt(pic, 'leader-nut', 'nut'), touches(pic, 'head', 'leg-l', 0.8), touches(pic, 'nut', 'leg-r', 0.8));
  } else {
    pic.label('cp-th', [312, 200], 'thru-axle', [310, 196], m(20, 6), 'end', 'leader');
    pic.label('cp-t', [8, 30], 'lever', [10, 26], m(-half - 15, -28), undefined, 'leader-lever');
    // the other kind: a head with a hex socket and no lever, seen end-on
    pic.path('cp-frame', rrect(8, 128, 64, 60, 8));
    boltHead(pic, [40, 158], 15, { name: 'hex-head' });
    pic.text('cp-tm', [8, 210], 'or a hex key');
    pic.facts.push(pointsAt(pic, 'leader', 'axle'), pointsAt(pic, 'leader-lever', 'lever'), touches(pic, 'head', 'leg-l', 0.8),
      at(pic, 'axle through the closed left end', m(-half - 4.5, 0), 'leg-l', 0), at(pic, "axle's thread in the right end", m(half + 4.5, 0), 'leg-r', 0));
  }
  return pic;
}

/**
 * A hub gear from behind (Shimano Nexus or Alfine; R §5): the frame's rear ends 135 mm apart with open slots, a solid axle through them
 * with a nut outside each; the big shell between its flanges; the one sprocket inside the right end; the cable box (cassette joint)
 * outside the right end and its nut, the gear cable coming into it from above.
 */
export function hubGears(): Pic {
  const pic = new Pic(320, 220);
  const k = 1.5, cx = 140, cy = 112, half = 67.5;
  const m = (x: number, y: number): Pt => [cx + x * k, cy + y * k];
  for (const side of [-1, 1] as const) {
    const inner = side * half, outer = side * (half + 9), bottom = 6;
    pic.path('cp-ctx', new Path().M(m(inner + side * 3, -74)).L(m(inner, -6)).L(m(inner, bottom - 3)).Q(m(inner, bottom), m(inner + side * 3, bottom))
      .L(m(outer - side * 3, bottom)).Q(m(outer, bottom), m(outer, bottom - 3)).L(m(outer, -6)).L(m(outer + side * 4, -74)).Z(), { name: side < 0 ? 'end-l' : 'end-r' });
  }
  // the spokes, up and down from the flanges
  for (const x of [-39, 39]) for (const dx of [-1.5, 1.5]) {
    pic.line('cp-thin', m(x + dx, -50), m(x * 0.55 + dx, -72));
    pic.line('cp-thin', m(x + dx, 50), m(x * 0.85 + dx, 55));
  }
  pic.path('cp-obj', poly([m(-86, -4.75), m(86, -4.75), m(86, 4.75), m(-86, 4.75)]), { name: 'axle' });
  // the right end cap from the shell to the frame's end, the sprocket on it; the left cap
  pic.path('cp-obj', poly([m(42, -11), m(half, -11), m(half, 11), m(42, 11)]), { name: 'cap-r' });
  pic.path('cp-obj', poly([m(-half, -11), m(-42, -11), m(-42, 11), m(-half, 11)]), { name: 'cap-l' });
  pic.path('cp-obj', poly([m(54, -38), m(56.5, -38), m(56.5, 38), m(54, 38)]), { name: 'sprocket' });
  // the shell and its flanges
  const shell = new Path().M(m(-42, -50)).L(m(-37, -50)).L(m(-37, -40)).Q(m(0, -46), m(37, -40)).L(m(37, -50)).L(m(42, -50)).L(m(42, 50))
    .L(m(37, 50)).L(m(37, 40)).Q(m(0, 46), m(-37, 40)).L(m(-37, 50)).L(m(-42, 50)).Z();
  pic.path('cp-halostroke', shell);
  pic.path('cp-hi', shell, { name: 'shell' });
  // nuts outside both ends; the cable box outside the right nut, the cable into it
  pic.path('cp-obj', rrect(...m(-half - 15.5, -6.5), 6.5 * k, 13 * k, 2), { name: 'nut-l' });
  pic.path('cp-obj', rrect(...m(half + 9, -6.5), 6.5 * k, 13 * k, 2), { name: 'nut-r' });
  pic.path('cp-obj', rrect(...m(half + 15.5, -17), 20 * k, 34 * k, 5 * k), { name: 'box' });
  pic.path('cp-ctx', new Path().M(m(half + 25.5, -17)).Q(m(half + 26, -46), m(half + 14, -74)), { style: 'stroke-width:2.5', name: 'cable' });
  pic.label('cp-th', [106, 212], 'hub gears', [104, 208], m(-20, 41), 'end', 'leader');
  pic.label('cp-t', [312, 200], 'sprocket', [310, 196], m(55.2, 36), 'end', 'leader-sprocket');
  pic.facts.push(pointsAt(pic, 'leader', 'shell'), pointsAt(pic, 'leader-sprocket', 'sprocket'), touches(pic, 'nut-l', 'end-l', 0.8),
    touches(pic, 'nut-r', 'end-r', 0.8), touches(pic, 'box', 'nut-r', 0.8), touches(pic, 'cable', 'box', 0.5), touches(pic, 'cap-r', 'end-r', 0.6),
    touches(pic, 'cap-l', 'end-l', 0.6), at(pic, 'the left axle end in its frame end', m(-half - 4.5, 0), 'end-l', 0),
    at(pic, 'the right axle end in its frame end', m(half + 4.5, 0), 'end-r', 0));
  pic.fact('the cable box outside the right frame end', m(half + 15.5, 0)[0] > m(half + 9, 0)[0]);
  return pic;
}

/** Spokes near the rim (R §4): 32 spokes, three-cross, so neighbours lean alternately; one spoke and its nipple marked. */
export function spokesGuide(): Pic {
  const pic = new Pic(320, 220);
  const C: Pt = [160, 300], k = 0.6, R = 300 * k, Rn = 296 * k, Rf = 28 * k;
  pic.path('cp-obj', new Path().M(pol(C[0], C[1], R + 22 * k, -62)).arcTo(C, 62, true).L(pol(C[0], C[1], Rn, 62)).arcTo(C, -62, false).Z(), { name: 'rim' });
  pic.path('cp-fine', new Path().M(pol(C[0], C[1], R + 6 * k, -62)).arcTo(C, 62, true));
  const marked = 1;
  for (let i = -5; i <= 5; i++) {
    const a = i * 11.25, lean = (i + 8) % 2 === 0 ? 67.5 : -67.5;
    const top = pol(C[0], C[1], Rn, a), hub = pol(C[0], C[1], Rf, a + lean);
    const t = (220 - top[1]) / (hub[1] - top[1]), end = lerp(top, hub, Math.min(1, t));
    const nip = lerp(top, hub, 0.05);
    if (i === marked) {
      pic.path('cp-halowire', poly([top, end], false));
      pic.line('cp-hiline', nip, end, { style: 'stroke-width:2.5', name: 'spoke' });
      pic.path('cp-hi', tube(top, nip, 5), { name: 'nipple' });
    } else {
      pic.line('cp-ctx', nip, end, { style: 'stroke-width:2' });
      pic.path('cp-dark', tube(top, nip, 4));
    }
  }
  const sp = (() => { const a = marked * 11.25, top = pol(C[0], C[1], Rn, a), hub = pol(C[0], C[1], Rf, a - 67.5); return { top, hub }; })();
  pic.label('cp-th', [196, 50], 'spoke', [198, 46], lerp(sp.top, sp.hub, 0.3), undefined, 'leader');
  pic.label('cp-t', [312, 40], 'nipple', [310, 36], lerp(sp.top, sp.hub, 0.03), 'end', 'leader-nipple');
  pic.label('cp-t', [8, 40], 'rim', [10, 36], pol(C[0], C[1], R + 14 * k, -40), undefined, 'leader-rim');
  pic.facts.push(pointsAt(pic, 'leader', 'spoke', 1.5), pointsAt(pic, 'leader-nipple', 'nipple'), pointsAt(pic, 'leader-rim', 'rim'),
    touches(pic, 'nipple', 'rim', 0.6), touches(pic, 'spoke', 'nipple', 0.6));
  return pic;
}

/**
 * The fork from the front (R §8): the crown under the head tube; two legs either side of the tyre down to the axle, 100 mm apart inside
 * at the ends, which close round a thru-axle whose head and lever are on the bike's left (the picture's right); the disc on that side;
 * the steerer, tapered (38.1 mm at the crown to 28.6 mm at the top), runs up inside the head tube, drawn dashed, to the stem.
 */
export function forkFront(): Pic {
  const pic = new Pic(320, 290);
  const k = 0.44, m = (x: number, y: number): Pt => [160 + x * k, 96 + y * k];
  // the head tube and above it the top cover, a spacer, the stem's clamp, seen from the front
  pic.path('cp-body', poly([m(-31, 0), m(-24, -150), m(24, -150), m(31, 0)]), { name: 'head-tube' });
  pic.path('cp-obj', poly([m(-23, -150), m(-17, -157), m(17, -157), m(23, -150)]), { name: 'cover' });
  pic.path('cp-obj', poly([m(-17, -157), m(-17, -167), m(17, -167), m(17, -157)]), { name: 'spacer' });
  pic.path('cp-obj', rrect(...m(-21, -207), 42 * k, 40 * k, 2), { name: 'stem' });
  pic.path('cp-ghost', poly([m(-19, 0), m(-14.3, -205), m(14.3, -205), m(19, 0)]), { name: 'steerer' });
  pic.mark('steerer-in', poly([m(-19, 0), m(-15.5, -150), m(15.5, -150), m(19, 0)]));
  // the wheel behind the legs: the hub and axle, the disc edge-on on the bike's left, the spokes, the tyre in front of them
  const ay = 395;
  pic.path('cp-ctx', poly([m(41, ay - 80), m(43, ay - 80), m(43, ay + 80), m(41, ay + 80)]), { name: 'rotor' });
  for (const x of [-33, 33]) pic.line('cp-thin', m(x, ay - 22), m(x * 0.5, ay - 120));
  pic.path('cp-obj', poly([m(-44, ay - 22), m(44, ay - 22), m(44, ay + 22), m(-44, ay + 22)]), { name: 'hub' });
  pic.path('cp-rubber', rrect(...m(-22.5, 32), 45 * k, 500 * k, 22.5 * k), { name: 'tyre' });
  // the fork: crown and legs, one outline; the axle's ends show outside the legs, its head and lever on the bike's left
  const legOut = 72, legIn = 50, top = 22;
  const fork = new Path().M(m(-66, 0)).L(m(66, 0)).L(m(70, top)).L(m(legOut + 2, 60)).L(m(legOut, ay - 8)).Q(m(legOut, ay + 13), m(61, ay + 13))
    .Q(m(legIn, ay + 13), m(legIn, ay - 8)).L(m(legIn - 4, 60)).L(m(legIn - 8, top)).L(m(-legIn + 8, top)).L(m(-legIn + 4, 60)).L(m(-legIn, ay - 8))
    .Q(m(-legIn, ay + 13), m(-61, ay + 13)).Q(m(-legOut, ay + 13), m(-legOut, ay - 8)).L(m(-legOut - 2, 60)).L(m(-70, top)).Z();
  pic.path('cp-halostroke', fork);
  pic.path('cp-hi', fork, { name: 'fork' });
  pic.path('cp-obj', poly([m(-legOut - 3, ay - 6), m(-legOut, ay - 6), m(-legOut, ay + 6), m(-legOut - 3, ay + 6)]), { name: 'thread' });
  pic.path('cp-obj', rrect(...m(legOut, ay - 9), 7 * k, 18 * k, 2), { name: 'axle-head' });
  pic.path('cp-obj', tube(m(legOut + 4, ay - 4), m(legOut + 4, ay - 60), 9 * k), { name: 'axle-lever' });
  pic.label('cp-th', [312, 190], 'fork', [310, 186], m(legOut + 1, 200), 'end', 'leader');
  pic.label('cp-t', [8, 30], 'steerer', [10, 26], m(-16, -120), undefined, 'leader-steerer');
  pic.label('cp-t', [312, 40], 'head tube', [310, 36], m(26, -90), 'end', 'leader-head');
  pic.facts.push(pointsAt(pic, 'leader', 'fork'), pointsAt(pic, 'leader-steerer', 'steerer'), pointsAt(pic, 'leader-head', 'head-tube'),
    within(pic, 'steerer-in', 'head-tube', 0.6), touches(pic, 'head-tube', 'fork', 0.5), touches(pic, 'cover', 'head-tube', 0.5),
    clear(pic, 'tyre', 'fork', 1), touches(pic, 'axle-head', 'fork', 0.6), touches(pic, 'thread', 'fork', 0.6));
  pic.fact('the steerer tapers: wider at the crown than at the top', 38.1 > 28.6);
  pic.fact('100 mm between the legs inside at the axle', legIn * 2 === 100);
  return pic;
}

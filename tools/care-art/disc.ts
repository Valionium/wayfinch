// Disc brakes (research note R §1.1, §1.2): the rotor on the hub, the caliper astride its edge, held by two bolts. Flat mount: the
// caliper sits flat on the chainstay and its bolts come up from under the stay. Post mount: two posts on the fork or frame, the bolts
// go through the caliper's ears into them. Seen from above: the rotor edge-on between the pads, a thin gap each side.
import { add, at, clear, Path, perp, Pic, pointsAt, pol, poly, rrect, scale, sub, touches, tube, unit, within, type Pt } from './kit.ts';

/** One 6-bolt rotor seen from the side, centre c, outer radius r (units): braking ring with its holes, six curved arms, the bolt circle. */
export function rotor(pic: Pic, c: Pt, r: number, o: { hi?: boolean; name?: string } = {}): void {
  const ri = r * 0.8, rb = r * 0.28;
  pic.path(o.hi ? 'cp-hi' : 'cp-obj', new Path().M(pol(c[0], c[1], r, 0)).arcTo(c, 180, true).arcTo(c, 359.9, true).Z()
    .M(pol(c[0], c[1], ri, 0)).arcTo(c, 180, false).arcTo(c, 0.1, false).Z(), { name: o.name ?? 'rotor', style: 'fill-rule:evenodd' });
  for (let a = 0; a < 360; a += 15) pic.circle('cp-fine', pol(c[0], c[1], (r + ri) / 2, a + 7.5), Math.max(1, r * 0.022));
  for (let a = 0; a < 360; a += 60) {
    const p0 = pol(c[0], c[1], rb, a), p1 = pol(c[0], c[1], ri, a + 34), mid = pol(c[0], c[1], (rb + ri) / 2, a + 6);
    pic.path('cp-fine', new Path().M(p0).Q(mid, p1), { style: 'stroke-width:1.6' });
    pic.circle('cp-dark', p0, Math.max(1.2, r * 0.03));
  }
  pic.circle('cp-fine', c, rb);
}

/**
 * Caliper bolts (brake-rub-disc step 3), both seen from behind the brake, along the stay or the fork leg, so no claim is made on where
 * round the rotor the caliper sits: the rotor edge-on passes up through the caliper's slot between the pads. Flat mount (left): the
 * caliper sits on the chainstay, seen end-on, and its bolts come up from under the stay. Post mount (right): the caliper sits on two
 * posts on the back of the fork leg, and its two bolts face you.
 */
export function discBolts(): Pic {
  const pic = new Pic(320, 226);
  pic.path('cp-frame', rrect(4, 4, 152, 218, 8)).path('cp-frame', rrect(164, 4, 152, 218, 8));
  const k = 2.5;
  // the caliper astride the rotor, halves either side of the slot (mm, relative to its own origin)
  const caliper = (m: (x: number, y: number) => Pt, x0: number, x1: number, y0: number, y1: number, slot: [number, number], name: string): void => {
    const p = new Path().M(m(x0 + 2, y1)).L(m(x0, y1 - 2)).L(m(x0, y0 + 3)).Q(m(x0, y0), m(x0 + 3, y0)).L(m(x1 - 3, y0)).Q(m(x1, y0), m(x1, y0 + 3))
      .L(m(x1, y1 - 6)).L(m(slot[1], y1 - 6)).L(m(slot[1], y0 + 7)).L(m(slot[0], y0 + 7)).L(m(slot[0], y1)).Z();
    pic.path('cp-obj', p, { name });
  };
  const rotorEdge = (m: (x: number, y: number) => Pt, x: number, y0: number, y1: number, name: string) =>
    pic.path('cp-obj', poly([m(x, y0), m(x + 1.8, y0), m(x + 1.8, y1), m(x, y1)]), { name, style: 'stroke-width:1.5' });
  const pads = (m: (x: number, y: number) => Pt, slot: [number, number], y0: number, y1: number, tag: string) => {
    pic.path('cp-rubber', poly([m(slot[0], y0), m(slot[0] + 3.6, y0), m(slot[0] + 3.6, y1), m(slot[0], y1)]), { name: `pad-o-${tag}`, style: 'stroke-width:1.5' });
    pic.path('cp-rubber', poly([m(slot[1] - 3.6, y0), m(slot[1], y0), m(slot[1], y1), m(slot[1] - 3.6, y1)]), { name: `pad-i-${tag}`, style: 'stroke-width:1.5' });
  };
  // ---- flat mount: the left chainstay end-on, the rotor inboard of it (to the right, seen from behind)
  {
    const m = (x: number, y: number): Pt => [58 + x * k, 143 + y * k];
    pic.path('cp-ctx', new Path().M(m(0, -10)).arcTo(m(0, 0), 180, true).arcTo(m(0, 0), 359.9, true).Z(), { name: 'stay' });
    pic.label('cp-tm', [12, 214], 'chainstay', [36, 202], m(-6, 6), undefined, 'leader-stay');
    pic.facts.push(pointsAt(pic, 'leader-stay', 'stay', 1));
    rotorEdge(m, 13.1, -36, 20, 'rotor-flat');
    // the mount's flat face on top of the stay, which gives the mount its name
    pic.path('cp-obj', poly([m(-7.5, -11.8), m(7.5, -11.8), m(6.5, -8.2), m(-6.5, -8.2)]), { name: 'flat' });
    caliper(m, -7, 27, -44, -11.8, [9, 19], 'cal-flat');
    pads(m, [9, 19], -36, -16, 'flat');
    pic.path('cp-ctx', new Path().M(m(-3, -44)).Q(m(-4, -48), m(-10, -50)), { style: 'stroke-width:3' });
    // the bolt up through the stay into the caliper; a second one hides behind it
    pic.line('cp-fine', m(0, 10), m(0, -24), { style: 'stroke-dasharray:3 3' });
    pic.circle('cp-halo', m(0, 12.7), 11);
    pic.path('cp-hi', rrect(...m(-5, 10.4), 5 * 2 * k, 4.6 * k, 2), { name: 'bolt-flat' });
    pic.facts.push(touches(pic, 'bolt-flat', 'stay', 1.2), at(pic, 'bolt shaft top', m(0, -24), 'cal-flat', 0.5));
    pic.facts.push(touches(pic, 'cal-flat', 'flat', 0.6), touches(pic, 'flat', 'stay', 1.5), clear(pic, 'stay', 'rotor-flat', k * 2));
    pic.facts.push(clear(pic, 'rotor-flat', 'cal-flat', 0.5));
    pic.text('cp-t', [148, 26], 'Flat mount', 'end');
    pic.label('cp-th', [146, 214], 'bolts', [118, 205], m(4.6, 12.4), 'end', 'leader-bolts-flat');
    pic.facts.push(pointsAt(pic, 'leader-bolts-flat', 'bolt-flat', 1));
  }
  // ---- post mount: the left fork leg from behind, the rotor inboard; the caliper on the posts, in front of the leg
  {
    const m = (x: number, y: number): Pt => [222 + x * k, 128 + y * k];
    pic.path('cp-ctx', poly([m(-10, -38), m(10, -38), m(9, 36), m(-9, 36)]), { name: 'leg' });
    rotorEdge(m, 19.1, -24, 26, 'rotor-post');
    caliper(m, -8, 32, -32, 22, [15, 25.6], 'cal-post');
    pads(m, [15, 25.6], -24, 14, 'post');
    pic.path('cp-ctx', new Path().M(m(-2, -32)).Q(m(-3, -36), m(-10, -37)), { style: 'stroke-width:3' });
    for (const [i, y] of [-21, 11].entries()) {
      pic.circle('cp-halo', m(3, y), 15);
      // a socket head, round, with its hex key hole
      const c = m(3, y), hex: Pt[] = [];
      for (let a = 0; a < 360; a += 60) hex.push(pol(c[0], c[1], 1.5 * k, a + 30));
      pic.circle('cp-hi', c, 3.2 * k, { name: `bolt-post-${i}` });
      pic.path('cp-dark', poly(hex));
      pic.facts.push(within(pic, `bolt-post-${i}`, 'cal-post', 0.5));
    }
    pic.facts.push(clear(pic, 'leg', 'rotor-post', k * 2), clear(pic, 'rotor-post', 'cal-post', 0.5));
    pic.label('cp-th', [306, 214], 'bolts', [288, 203], m(4.6, 12.4), 'end', 'leader-bolts');
    pic.facts.push(pointsAt(pic, 'leader-bolts', 'bolt-post-1', 1));
    pic.text('cp-t', [308, 26], 'Post mount', 'end');
  }
  for (const t of ['flat', 'post']) {
    pic.facts.push(touches(pic, `pad-o-${t}`, `cal-${t}`, 0.5), touches(pic, `pad-i-${t}`, `cal-${t}`, 0.5));
    pic.facts.push(clear(pic, `pad-o-${t}`, `rotor-${t}`, 0.6), clear(pic, `pad-i-${t}`, `rotor-${t}`, 0.6));
  }
  return pic;
}




/** The caliper's two halves and the bridge over the slot, end-on (mm about the rotor's face at x 0); the rotor's edge stops under the bridge. */
function slotBody(pic: Pic, m: (x: number, y: number) => Pt, slot: [number, number], rot: [number, number], side: Pt): void {
  const body = new Path().M(m(slot[0] - 9, -14)).L(m(slot[1] + 9, -14)).L(m(slot[1] + 9, 12)).L(m(slot[1], 12)).L(m(slot[1], -9))
    .L(m(slot[0], -9)).L(m(slot[0], 12)).L(m(slot[0] - 9, 12)).Z();
  pic.path('cp-obj', body, { name: 'caliper' });
  pic.path('cp-obj', poly([m(rot[0], -8), m(rot[1], -8), m(rot[1], 18), m(rot[0], 18)]), { name: 'rotor', style: 'stroke-width:1.5' });
  pic.text('cp-tm', side, 'wheel side →');
}

/**
 * A disc caliper's slot seen end-on along the disc, close up: the disc's edge in the slot under the caliper's bridge, a pad each side.
 * `mode` picks what is marked (pad-gap: the light between pads and disc; the guide: the pads).
 */
export function caliperSlot(mode: 'gap' | 'pads'): Pic {
  const pic = new Pic(320, 220);
  const k = 5.2, m = (x: number, y: number): Pt => [110 + x * k, 108 + y * k];
  // mm: rotor 1.8 thick at x 0..1.8; pads 3.6 each, gap 0.5 (drawn 0.9 so it shows)
  const g = 0.9, padW = 3.6, rot0 = 0, rot1 = 1.8;
  const slot: [number, number] = [rot0 - g - padW, rot1 + g + padW];
  slotBody(pic, m, slot, [rot0, rot1], m(slot[1] - 3, -16.5));
  const padAt = (x0: number, name: string, cls: string) => pic.path(cls, poly([m(x0, -6), m(x0 + padW, -6), m(x0 + padW, 9), m(x0, 9)]), { name });
  if (mode === 'gap') {
    pic.path('cp-halo', poly([m(rot0 - g, -6), m(rot0, -6), m(rot0, 9), m(rot0 - g, 9)]), { style: 'opacity:0.5' });
    pic.path('cp-halo', poly([m(rot1, -6), m(rot1 + g, -6), m(rot1 + g, 9), m(rot1, 9)]), { style: 'opacity:0.5' });
  }
  const hiPads = mode === 'pads';
  padAt(slot[0], 'pad-o', hiPads ? 'cp-hi' : 'cp-rubber');
  padAt(rot1 + g, 'pad-i', hiPads ? 'cp-hi' : 'cp-rubber');
  pic.path('cp-ctx', new Path().M(m(slot[0] - 5, -14)).Q(m(slot[0] - 6, -19), m(slot[0] - 12, -21)), { style: 'stroke-width:3' });
  pic.label('cp-tm', [14, 210], 'disc', [44, 204], m(rot0, 15.5), undefined, 'leader-disc');
  if (mode === 'gap') pic.label('cp-th', [306, 210], 'a thin gap each side', [254, 198], m(rot1 + g / 2, 8), 'end', 'leader-gap');
  else pic.label('cp-th', [306, 210], 'pads', [282, 198], m(rot1 + g + padW / 2, 8), 'end', 'leader-pads');
  pic.facts.push(clear(pic, 'pad-o', 'rotor', 0.5), clear(pic, 'pad-i', 'rotor', 0.5), touches(pic, 'pad-o', 'caliper', 0.5), touches(pic, 'pad-i', 'caliper', 0.5));
  pic.facts.push(pointsAt(pic, 'leader-disc', 'rotor', 1), clear(pic, 'rotor', 'caliper', 0.5));
  if (mode === 'pads') pic.facts.push(pointsAt(pic, 'leader-pads', 'pad-i', 1));
  return pic;
}

/**
 * A cable disc brake's slot, end-on along the disc (brake-weak-disc step 3): the actuation arm on the outer half with the cable, the pad
 * adjuster on the wheel side, a knurled knob whose axis runs across the picture, so it turns round that line.
 */
export function discAdjust(): Pic {
  const pic = new Pic(320, 220);
  const k = 5.2, m = (x: number, y: number): Pt => [110 + x * k, 112 + y * k];
  const g = 0.9, padW = 3.6, rot0 = 0, rot1 = 1.8, slot: [number, number] = [rot0 - g - padW, rot1 + g + padW];
  slotBody(pic, m, slot, [rot0, rot1], m(slot[1] - 3, -16.5));
  pic.path('cp-rubber', poly([m(slot[0], -6), m(slot[0] + padW, -6), m(slot[0] + padW, 9), m(slot[0], 9)]), { name: 'pad-o' });
  pic.path('cp-rubber', poly([m(rot1 + g, -6), m(rot1 + g + padW, -6), m(rot1 + g + padW, 9), m(rot1 + g, 9)]), { name: 'pad-i' });
  // the actuation arm: a lever on the outer half's face, its pivot low, the cable clamped at its tip from the housing stop above
  // seen end-on the arm turns about the axis across the picture, so it lies flat on the outer face
  pic.path('cp-obj', rrect(...m(slot[0] - 12, -11), 3 * k, 20 * k, 3), { name: 'arm' });
  pic.circle('cp-dark', m(slot[0] - 10.5, 1.5), 3);
  // the housing stop: a bracket on the body's top corner, the bare cable down from it to the arm's tip
  pic.path('cp-obj', rrect(...m(slot[0] - 9, -19), 5 * k, 5 * k, 2), { name: 'stop' });
  pic.line('cp-fine', m(slot[0] - 6.5, -19), m(slot[0] - 10.5, -11));
  pic.path('cp-ctx', new Path().M(m(slot[0] - 6.5, -19)).L(m(slot[0] - 6.5, -22)), { style: 'stroke-width:4' });
  // the pad adjuster on the wheel side: a knurled knob, its knurls along its axis
  const kx0 = slot[1] + 9, kx1 = kx0 + 6;
  pic.circle('cp-halo', m((kx0 + kx1) / 2, 1.5), 26);
  pic.path('cp-hi', rrect(...m(kx0, -3.5), (kx1 - kx0) * k, 10 * k, 3), { name: 'knob' });
  for (let y = -1.8; y < 5.4; y += 1.6) pic.line('cp-fine', m(kx0 + 0.8, y), m(kx1 - 0.8, y));
  pic.turnAxis(m(kx1 + 0.5, 1.5), 9, 30, 20, 160);
  pic.label('cp-th', [312, 210], 'turn in a little', [276, 200], m(kx1 + 1.8, 6), 'end', 'leader-turn');
  pic.label('cp-th', [312, 64], 'pad adjuster', [290, 70], m(kx0 + 3, -3.5), 'end', 'leader-knob');
  pic.facts.push(touches(pic, 'knob', 'caliper', 0.6), touches(pic, 'arm', 'caliper', 1.5), touches(pic, 'stop', 'caliper', 0.6), pointsAt(pic, 'leader-knob', 'knob', 1));
  pic.facts.push(clear(pic, 'pad-o', 'rotor', 0.5), clear(pic, 'pad-i', 'rotor', 0.5), clear(pic, 'rotor', 'caliper', 0.5));
  return pic;
}

/** The front disc brake from the bike's left side: the rotor on the hub, the caliper behind the fork leg above the axle (post mount). */
export function discSide(mark: 'disc' | 'caliper'): Pic {
  const pic = new Pic(320, 236);
  const c: Pt = [150, 130], k = 0.78, r = 80 * k;
  // the fork leg: from the axle up and back (to the right, seen from the left), about 19 degrees off upright
  const legTop = pol(c[0], c[1], 170, 19), u = unit(sub(legTop, c)), q = perp(u), wl = 11;
  const leg = new Path().M(add(c, scale(q, wl))).L(add(legTop, scale(q, wl))).L(add(legTop, scale(q, -wl))).L(add(c, scale(q, -wl)))
    .Q(add(c, add(scale(q, -wl), scale(u, -16))), add(c, scale(u, -15))).Q(add(c, add(scale(q, wl), scale(u, -16))), add(c, scale(q, wl))).Z();
  rotor(pic, c, r, { hi: mark === 'disc', name: 'rotor' });
  pic.path('cp-body', leg, { name: 'leg' });
  pic.circle('cp-obj', c, 10 * k * 1.4);
  pic.circle('cp-dark', c, 3);
  // the caliper astride the braking ring, behind the leg, its two posts on the leg
  const a = 52, rr = r * 0.9, half = 21, w = r * 0.34;
  const body = new Path().M(pol(c[0], c[1], rr + w / 2, a - half)).arcTo(c, a + half, true).L(pol(c[0], c[1], rr - w / 2, a + half))
    .arcTo(c, a - half, false).Z();
  // the two posts: from each end of the caliper square across to the leg's back edge
  const backAt = (p: Pt): Pt => { const o = add(c, scale(q, wl)), t = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]; return add(o, scale(u, t)); };
  for (const t of [a - half + 5, a + half - 5]) { const e = pol(c[0], c[1], rr, t); pic.path('cp-obj', tube(e, backAt(e), 10)); }
  pic.path(mark === 'caliper' ? 'cp-hi' : 'cp-obj', body, { name: 'caliper' });
  pic.path('cp-ctx', new Path().M(pol(c[0], c[1], rr + w / 2, a + 4)).Q(add(legTop, [34, 50]), add(legTop, [22, 4])), { style: 'stroke-width:3' });
  pic.text('cp-tm', [8, 228], "Seen from the bike's left side");
  if (mark === 'disc') pic.label('cp-th', [12, 40], 'disc', [40, 44], pol(c[0], c[1], r * 0.9, 300), undefined, 'leader');
  else pic.label('cp-th', [312, 120], 'caliper', [290, 110], pol(c[0], c[1], rr + w / 2, a + 8), 'end', 'leader');
  pic.facts.push(pointsAt(pic, 'leader', mark === 'disc' ? 'rotor' : 'caliper', 1.5));
  pic.facts.push(at(pic, 'the caliper over the braking ring', pol(c[0], c[1], rr, a), 'caliper', 0), touches(pic, 'caliper', 'leg', 2));
  return pic;
}

/**
 * The wheel out of a hydraulic disc brake (puncture step 1, T1): no disc in the slot, so a squeeze of the lever would push the pads
 * together; a pad spacer between them keeps them apart.
 */
export function padSpacer(): Pic {
  const pic = new Pic(320, 220);
  const k = 5.2, m = (x: number, y: number): Pt => [120 + x * k, 98 + y * k];
  const g = 0.9, padW = 3.6, rot0 = 0, rot1 = 1.8, slot: [number, number] = [rot0 - g - padW, rot1 + g + padW];
  const body = new Path().M(m(slot[0] - 9, -14)).L(m(slot[1] + 9, -14)).L(m(slot[1] + 9, 12)).L(m(slot[1], 12)).L(m(slot[1], -9))
    .L(m(slot[0], -9)).L(m(slot[0], 12)).L(m(slot[0] - 9, 12)).Z();
  pic.path('cp-obj', body, { name: 'caliper' });
  pic.path('cp-rubber', poly([m(slot[0], -6), m(slot[0] + padW, -6), m(slot[0] + padW, 9), m(slot[0], 9)]), { name: 'pad-o' });
  pic.path('cp-rubber', poly([m(rot1 + g, -6), m(rot1 + g + padW, -6), m(rot1 + g + padW, 9), m(rot1 + g, 9)]), { name: 'pad-i' });
  // the spacer: a plastic block in the slot where the disc was, its tab above
  pic.circle('cp-halo', m(0.9, 2), 34);
  pic.path('cp-hi', poly([m(rot0 - g, -4), m(rot1 + g, -4), m(rot1 + g, 13), m(rot0 - g, 13)]), { name: 'spacer' });
  pic.path('cp-hi', rrect(...m(-3.5, 13), 9 * k, 5 * k, 3), { name: 'tab' });
  pic.path('cp-ctx', new Path().M(m(slot[0] - 5, -14)).Q(m(slot[0] - 6, -19), m(slot[0] - 12, -21)), { style: 'stroke-width:3' });
  pic.label('cp-th', [306, 176], 'pad spacer', [262, 170], m(4, 15.5), 'end', 'leader-spacer');
  pic.text('cp-tm', [8, 214], 'The wheel out: no disc in the slot');
  pic.text('cp-tm', m(slot[1] + 10.5, 2), 'wheel side \u2192');
  pic.facts.push(touches(pic, 'spacer', 'pad-o', 0.5), touches(pic, 'spacer', 'pad-i', 0.5), touches(pic, 'tab', 'spacer', 0.5), pointsAt(pic, 'leader-spacer', 'tab', 1));
  return pic;
}


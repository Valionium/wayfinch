// The wheel in the fork, and spokes near the rim (research note R §2 and §4). From behind the fork the fork's ends must hold the axle:
// a thru-axle runs through a closed end, a quick release's hub sits in a slot and the skewer clamps it, nuts clamp a solid axle; the hub's
// ends touch the inner faces. Near the rim, spokes run from their nipples towards the hub's flange at a slant (three-cross lacing).
import { bikeInset } from './common.ts';
import { add, at, lerp, Path, Pic, pointsAt, pol, poly, rrect, sub, touches, tube, unit, perp, scale, type Pt } from './kit.ts';

export type Axle = 'thru' | 'qr' | 'nuts';

/** The front wheel's hub in the fork, from behind; the step's two moves: push the wheel fully in, then tighten. */
export function wheelSeated(kind: Axle): Pic {
  const pic = new Pic(320, 226);
  bikeInset(pic, 'front-hub');
  const k = 1.75, cx = 192, cy = 128;
  const m = (x: number, y: number): Pt => [cx + x * k, cy + y * k];
  const half = 50; // 100 mm between the fork ends' inner faces
  // the fork legs: from above the picture down to the axle; a thru-axle's end closes round it, a slot's ends stop at it
  for (const side of [-1, 1] as const) {
    const inner = side * half, outer = side * (half + 9);
    const bottom = kind === 'thru' ? 12 : 6;
    const p = new Path().M(m(inner + side * 2, -74)).L(m(inner, -6)).L(m(inner, bottom - 3)).Q(m(inner, bottom), m(inner + side * 3, bottom))
      .L(m(outer - side * 3, bottom)).Q(m(outer, bottom), m(outer, bottom - 3)).L(m(outer, -6)).L(m(outer + side * 3, -74)).Z();
    pic.path('cp-ctx', p, { name: side < 0 ? 'leg-l' : 'leg-r' });
  }
  if (kind === 'thru') {
    // the disc on the hub's left end, edge-on: context, behind the hub and the axle
    pic.path('cp-ctx', poly([m(-43, -80), m(-41.2, -80), m(-41.2, 80), m(-43, 80)]), { name: 'rotor' });
  }
  // the hub: end caps between the inner faces, flanges, a shell of 30 mm; spokes up to the rim
  const cap = (side: -1 | 1) => poly([m(side * half, -9.5), m(side * (half - 6), -9.5), m(side * (half - 6), 9.5), m(side * half, 9.5)]);
  pic.path('cp-obj', cap(-1), { name: 'cap-l' }).path('cp-obj', cap(1), { name: 'cap-r' });
  // the shell between the flanges, the flanges (discs, so from behind they stand above and below the axle)
  pic.path('cp-obj', new Path().M(m(-44, -11)).L(m(-36, -11)).L(m(-36, -26)).L(m(-31, -26)).L(m(-31, -15)).L(m(31, -15)).L(m(31, -26)).L(m(36, -26))
    .L(m(36, -11)).L(m(44, -11)).L(m(44, 11)).L(m(36, 11)).L(m(36, 26)).L(m(31, 26)).L(m(31, 15)).L(m(-31, 15)).L(m(-31, 26)).L(m(-36, 26))
    .L(m(-36, 11)).L(m(-44, 11)).Z(), { name: 'hub' });
  for (const x of [-33.5, 33.5]) for (const dx of [-1.6, 1.6]) {
    pic.line('cp-thin', m(x + dx, -26), m(x * 0.7 + dx, -54));
    pic.line('cp-thin', m(x + dx, 26), m(x * 0.84 + dx, 38));
  }
  if (kind === 'thru') {
    pic.path('cp-obj', poly([m(-half - 9, -6), m(half + 6, -6), m(half + 6, 6), m(-half - 9, 6)]), { name: 'axle' });
    for (let x = half + 0.5; x < half + 6; x += 1.5) pic.line('cp-fine', m(x, -6), m(x + 1, 6));
    pic.path('cp-obj', rrect(...m(-half - 16, -9), 7 * k, 18 * k, 4), { name: 'head' });
    pic.path('cp-hi', tube(m(-half - 15, -7), m(-half - 15, -46), 5 * k), { name: 'lever' });
  } else if (kind === 'qr') {
    for (const side of [-1, 1] as const) pic.path('cp-obj', poly([m(side * half, -5), m(side * (half + 9), -5), m(side * (half + 9), 5), m(side * half, 5)]), { name: side < 0 ? 'end-l' : 'end-r' });
    pic.line('cp-objline', m(-half - 10, 0), m(half + 10, 0), { style: 'stroke-width:4', name: 'skewer' });
    pic.path('cp-obj', rrect(...m(half + 9, -6), 7 * k, 12 * k, 3), { name: 'nut' });
    pic.path('cp-obj', rrect(...m(-half - 16, -6), 7 * k, 12 * k, 3), { name: 'head' });
    pic.path('cp-hi', tube(m(-half - 15, -4), m(-half - 15, -44), 4.5 * k), { name: 'lever' });
  } else {
    pic.path('cp-obj', poly([m(-half - 14, -4.75), m(half + 14, -4.75), m(half + 14, 4.75), m(-half - 14, 4.75)]), { name: 'axle' });
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? -half - 15.5 : half + 9;
      pic.path(side < 0 ? 'cp-hi' : 'cp-obj', rrect(...m(x, -6.5), 6.5 * k, 13 * k, 2), { name: side < 0 ? 'nut-l' : 'nut-r' });
    }
  }
  // the moves: weight down on the bike, then tighten
  const legTop = m(half + 4.5, -58);
  pic.arrow(add(legTop, [-15, -6]), add(legTop, [-15, 20]));
  pic.text('cp-th', add(legTop, [-21, -6]), 'push down', 'end');
  if (kind === 'qr') {
    // from behind the lever swings in the picture's plane: out from the leg (open) to along it (closed)
    pic.path('cp-ghost', tube(m(-half - 15, -4), m(-half - 46, -10), 4.5 * k));
    pic.turn(m(-half - 15, -4), 26, 286, 346);
  } else {
    // a thru-axle or a nut turns round the axle's own line, which runs across the picture: the arrow wraps round it
    const c = kind === 'nuts' ? m(-half - 16, 0) : m(-half - 19, 0);
    pic.turnAxis(c, 11, 24, -30, 200);
  }
  // the action beside its arrow, the part's name with its leader, and the side
  pic.text('cp-th', [12, 178], kind === 'thru' ? 'tighten firmly' : kind === 'qr' ? 'close firmly' : 'tighten both');
  const named = kind === 'thru' ? m(20, 6) : kind === 'qr' ? m(20, 0.8) : m(20, 4.75);
  pic.label('cp-t', [312, 214], kind === 'thru' ? 'thru-axle' : kind === 'qr' ? 'quick release' : 'axle nuts', [300, 202], named, 'end', 'leader-name');
  pic.facts.push(pointsAt(pic, 'leader-name', kind === 'qr' ? 'skewer' : 'axle', 2));
  pic.text('cp-t', [12, 214], "bike's left");
  // facts: the hub's ends against the fork ends, the axle held by both ends
  pic.facts.push(touches(pic, 'cap-l', 'leg-l', 0.6), touches(pic, 'cap-r', 'leg-r', 0.6));
  if (kind === 'thru') pic.facts.push(at(pic, 'axle in the left end', m(-half - 4.5, 0), 'leg-l', 0), at(pic, 'axle thread in the right end', m(half + 4.5, 0), 'leg-r', 0), touches(pic, 'head', 'leg-l', 0.8), at(pic, 'leg below the axle', m(-half - 4.5, 8), 'leg-l', 0));
  if (kind === 'qr') pic.facts.push(touches(pic, 'head', 'leg-l', 0.8), touches(pic, 'nut', 'leg-r', 0.8), touches(pic, 'end-l', 'cap-l', 0.6), touches(pic, 'end-r', 'cap-r', 0.6));
  if (kind === 'nuts') pic.facts.push(touches(pic, 'nut-l', 'leg-l', 0.8), touches(pic, 'nut-r', 'leg-r', 0.8));
  return pic;
}

/**
 * A snapped spoke near the rim (snapped-spoke step 1): it broke at its nipple, so only a stub stays in the rim; its long piece, still in
 * the hub, is wound round the spoke it crosses, at their crossing, so it cannot flap.
 */
export function spokeWrap(): Pic {
  const pic = new Pic(320, 236);
  const C: Pt = [160, 236], k = 0.6, R = 300 * k, Rn = 296 * k, Rf = 28 * k;
  // rim: two arcs round the wheel's centre, its inner wall where the nipples sit
  pic.path('cp-obj', new Path().M(pol(C[0], C[1], R + 22 * k, -72)).arcTo(C, 72, true).L(pol(C[0], C[1], Rn, 72)).arcTo(C, -72, false).Z(), { name: 'rim' });
  pic.path('cp-fine', new Path().M(pol(C[0], C[1], R + 6 * k, -72)).arcTo(C, 72, true));
  pic.circle('cp-obj', C, Rf + 3);
  // 32 holes, 11.25 degrees apart; the spokes lean alternately (three-cross: their hub end 67.5 degrees round from their hole)
  const holes: { a: number; lean: number }[] = [];
  for (let i = -6; i <= 6; i++) holes.push({ a: i * 11.25, lean: (i + 8) % 2 === 0 ? 67.5 : -67.5 });
  const line = (h: { a: number; lean: number }) => ({ top: pol(C[0], C[1], Rn, h.a), hub: pol(C[0], C[1], Rf, h.a + h.lean) });
  const cross = (p: { top: Pt; hub: Pt }, q: { top: Pt; hub: Pt }): number | null => {
    // the share t along p (0 at the rim) where it meets q, or null
    const r = sub(p.hub, p.top), s2 = sub(q.hub, q.top), d = r[0] * s2[1] - r[1] * s2[0];
    if (Math.abs(d) < 1e-9) return null;
    const qp = sub(q.top, p.top), t = (qp[0] * s2[1] - qp[1] * s2[0]) / d, u = (qp[0] * r[1] - qp[1] * r[0]) / d;
    return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
  };
  const broken = 7, b = line(holes[broken]!);
  // the crossing nearest the rim that is still in the picture
  let best: { t: number; j: number } | null = null;
  holes.forEach((h, j) => {
    if (j === broken) return;
    const t = cross(b, line(h));
    if (t !== null && lerp(b.top, b.hub, t)[1] < 190 && (!best || t < best.t)) best = { t, j };
  });
  if (!best) throw new Error('spokeWrap: no crossing in view');
  const { t: tx, j: nj } = best as { t: number; j: number };
  const end = (h: { a: number; lean: number }): Pt => { const l = line(h); const t = (236 - l.top[1]) / (l.hub[1] - l.top[1]); return lerp(l.top, l.hub, Math.min(1, t)); };
  holes.forEach((h, j) => {
    if (j === broken) return;
    const l = line(h);
    pic.line(j === nj ? 'cp-objline' : 'cp-ctx', l.top, end(h), { style: 'stroke-width:2', name: `spoke-${j}` });
    pic.path('cp-dark', tube(l.top, lerp(l.top, l.hub, 0.035), 4));
  });
  // the broken spoke's nipple and stub in the rim
  pic.path('cp-dark', tube(b.top, lerp(b.top, b.hub, 0.035), 4));
  pic.line('cp-objline', lerp(b.top, b.hub, 0.035), lerp(b.top, b.hub, 0.075), { style: 'stroke-width:2' });
  // its long piece: up from the hub to the crossing, then wound three times round the neighbour, just above the crossing
  const n = line(holes[nj]!), nd = unit(sub(n.hub, n.top)), np = perp(nd), X = lerp(b.top, b.hub, tx);
  const along = (d: number, side: number): Pt => add(add(X, scale(nd, -d)), scale(np, side * 7));
  const piece = new Path().M(end(holes[broken]!)).L(add(X, scale(unit(sub(b.top, b.hub)), 1)));
  const turns = 3, pitch = 9;
  for (let i = 0; i < turns * 2; i++) piece.L(along((pitch * (i + 1)) / 2 - (pitch * turns) / 2, i % 2 === 0 ? -1 : 1));
  pic.path('cp-halowire', piece);
  pic.path('cp-hiline', piece, { name: 'broken' });
  // where the wire passes behind the neighbour, the neighbour shows over it
  for (let i = 1; i < turns * 2; i += 2) pic.line('cp-objline', add(X, scale(nd, -((pitch * (i + 0.6)) / 2 - (pitch * turns) / 2))), add(X, scale(nd, -((pitch * (i + 1.4)) / 2 - (pitch * turns) / 2))), { style: 'stroke-width:2' });
  const lb = lerp(end(holes[broken]!), X, 0.4);
  pic.label('cp-th', [8, 228], 'broken spoke', [60, 216], lb, undefined, 'leader-broken');
  pic.label('cp-tm', [8, 20], 'wound round its neighbour', [40, 45], along(2 + pitch / 2, -1), undefined, 'leader-wrap');
  pic.facts.push(pointsAt(pic, 'leader-broken', 'broken', 1.5), pointsAt(pic, 'leader-wrap', 'broken', 2.5));
  pic.facts.push(touches(pic, 'broken', `spoke-${nj}`, 0.5));
  return pic;
}


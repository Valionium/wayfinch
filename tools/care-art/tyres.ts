// Tyres, tubes and rims (research note R §3): the wheel cut through at the rim, as a modern hooked, tubeless-ready rim with a 23 mm inside
// and a 40 mm gravel tyre: each bead sits on its bead seat against the flange, under the hook; a dip in the middle of the rim; the casing
// is one circle outside and one inside, round the same centre; a tube fills the casing and rests on the rim's well.
import { frame, type Frame } from './common.ts';
import { add, clear, Path, Pic, pointsAt, pol, poly, rrect, touches, tube, within, type Pt } from './kit.ts';

/** The rim and tyre in millimetres: flange tops at y = 0. */
// a hooked rim: the bead seat 6 mm below the flange's top, the hook a lip 1.2 mm deep over it, the dip's floor 11 mm down
const WI = 23, WALL = 2.6, HOOK = 1.2, LIP = 1.8, SEAT = 6, CH = 11, TYRE = 40, CASING = 2.8, DEPTH = 24;
const R = TYRE / 2, YC = -Math.sqrt(R * R - (WI / 2 - HOOK) ** 2), RI = R - CASING;
const toeX = WI / 2 - 3.2;

/** The rim cut through: flanges with their hooks, bead seats, the dip in the middle, the hollow box below; names 'rim'. */
function rim(pic: Pic, f: Frame, cls = 'cp-obj'): void {
  const { m } = f, i = WI / 2, o = WI / 2 + WALL;
  const p = new Path().M(m(-o, 0.8)).L(m(-o, 9)).L(m(-o + 4, DEPTH - 2)).Q(m(0, DEPTH + 1), m(o - 4, DEPTH - 2)).L(m(o, 9)).L(m(o, 0.8))
    .Q(m(o, 0), m(o - 0.8, 0)).L(m(i - HOOK, 0)).L(m(i - HOOK, LIP - 0.4)).Q(m(i - HOOK, LIP), m(i - HOOK + 0.4, LIP)).L(m(i, LIP)).L(m(i, SEAT))
    .L(m(toeX, SEAT)).L(m(toeX - 2.2, CH)).L(m(-toeX + 2.2, CH)).L(m(-toeX, SEAT)).L(m(-i, SEAT)).L(m(-i, LIP)).L(m(-i + HOOK - 0.4, LIP))
    .Q(m(-i + HOOK, LIP), m(-i + HOOK, LIP - 0.4)).L(m(-i + HOOK, 0)).L(m(-o + 0.8, 0)).Q(m(-o, 0), m(-o, 0.8)).Z();
  pic.path(cls, p, { name: 'rim' });
  pic.path('cp-fine', new Path().M(m(-o + 1.8, 13)).L(m(o - 1.8, 13)).L(m(o - 1.8, 14)).L(m(o - 5, DEPTH - 3.5)).Q(m(0, DEPTH - 1), m(-o + 5, DEPTH - 3.5))
    .L(m(-o + 1.8, 14)).Z());
}

/** The tyre's casing: outer circle from flange to flange over the crown, down inside the flange, a foot on the bead seat; names 'tyre'. */
function casing(pic: Pic, f: Frame, cls = 'cp-rubber', gapAt: [number, number] | null = null): void {
  const { m } = f, c = m(0, YC), i = WI / 2, e = i - HOOK;
  const aOut = (Math.asin(e / R) * 180) / Math.PI, yIn = YC + Math.sqrt(RI * RI - toeX * toeX), aIn = (Math.asin(toeX / RI) * 180) / Math.PI;
  if (!gapAt) {
    const p = new Path().M(m(-e, 0)).arcTo(c, 180 - aOut, true).L(m(e, LIP)).L(m(i, LIP + 0.6)).L(m(i, SEAT)).L(m(toeX, SEAT)).L(m(toeX, yIn))
      .arcTo(c, 180 + aIn, false).L(m(-toeX, SEAT)).L(m(-i, SEAT)).L(m(-i, LIP + 0.6)).L(m(-e, LIP)).Z();
    pic.path(cls, p, { name: 'tyre' });
    return;
  }
  // a cut through the casing between angles gapAt (clockwise from up): the casing in two pieces either side of it
  const [g0, g1] = gapAt;
  const left = new Path().M(m(-e, 0)).arcTo(c, g0, true).L(pol(c[0], c[1], f.mm(RI), g0)).arcTo(c, 180 + aIn, false).L(m(-toeX, SEAT)).L(m(-i, SEAT))
    .L(m(-i, LIP + 0.6)).L(m(-e, LIP)).Z();
  const right = new Path().M(pol(c[0], c[1], f.mm(R), g1)).arcTo(c, 180 - aOut, true).L(m(e, LIP)).L(m(i, LIP + 0.6)).L(m(i, SEAT)).L(m(toeX, SEAT))
    .L(m(toeX, yIn)).arcTo(c, g1, false).Z();
  pic.path(cls, left, { name: 'tyre' });
  pic.path(cls, right, { name: 'tyre-2' });
}

/** The two bead cores, each on its seat against the flange under the hook; names 'bead-l', 'bead-r'. */
function beads(pic: Pic, f: Frame, cls = 'cp-dark'): void {
  for (const s of [-1, 1] as const) pic.circle(cls, f.m(s * (WI / 2 - 1.6), SEAT - 1.7), f.mm(1.3), { name: s < 0 ? 'bead-l' : 'bead-r' });
}

/** The inner tube: the casing's inside, closed by the rim's well; names 'tube'. */
function innerTube(pic: Pic, f: Frame, cls = 'cp-body', dent: [number, number] | null = null): void {
  const { m } = f, c = m(0, YC), r = RI - 0.5, x = toeX - 0.3;
  const yIn = YC + Math.sqrt(r * r - x * x), a = (Math.asin(x / r) * 180) / Math.PI;
  const p = new Path().M(m(-x, yIn));
  if (dent) {
    // where a boot lies against the casing, the tube is pushed in by its thickness
    p.arcTo(c, dent[0], true).L(pol(c[0], c[1], f.mm(RI - 2), dent[0])).arcTo(c, dent[1], true).L(pol(c[0], c[1], f.mm(r), dent[1]));
  }
  p.arcTo(c, 180 - a, true).L(m(x, SEAT - 0.4)).L(m(toeX - 2.3, CH - 0.5)).L(m(-toeX + 2.3, CH - 0.5)).L(m(-x, SEAT - 0.4)).Z();
  pic.path(cls, p, { name: 'tube' });
}

export type SectionMark = 'tube' | 'tyre' | 'bead' | 'rim' | 'boot' | 'dip';

/** The wheel cut through, for the guide's tyre, bead, tube and rim, and for the torn tyre's boot. */
export function wheelSection(mark: SectionMark): Pic {
  const pic = new Pic(320, 240);
  const f = frame(160, 130, 3.4), { m } = f;
  const tubeIn = mark !== 'dip';
  rim(pic, f, mark === 'rim' ? 'cp-hi' : 'cp-obj');
  if (mark === 'boot') {
    // a cut through the casing on the right side, the boot inside over it, the tube pressing it on
    casing(pic, f, 'cp-rubber', [100, 106]);
    const c = m(0, YC);
    const boot = new Path().M(pol(c[0], c[1], f.mm(RI), 72)).arcTo(c, 134, true).L(pol(c[0], c[1], f.mm(RI - 1.4), 134)).arcTo(c, 72, false).Z();
    innerTube(pic, f, 'cp-body', [72, 134]);
    pic.path('cp-hi', boot, { name: 'boot' });
    pic.label('cp-th', [306, 190], 'boot', [292, 182], pol(c[0], c[1], f.mm(RI - 0.7), 116), 'end', 'leader-boot');
    pic.label('cp-tm', [306, 96], 'cut', [292, 100], pol(c[0], c[1], f.mm(R + 0.5), 103), 'end', 'leader-cut');
    pic.label('cp-tm', [14, 46], 'tube', [42, 52], pol(c[0], c[1], f.mm(RI - 0.5), 318), undefined, 'leader-tube');
    pic.facts.push(pointsAt(pic, 'leader-boot', 'boot', 1), pointsAt(pic, 'leader-cut', 'tyre-2', 8), pointsAt(pic, 'leader-tube', 'tube', 1));
    pic.facts.push(touches(pic, 'boot', 'tyre', 1), touches(pic, 'boot', 'tyre-2', 1), touches(pic, 'boot', 'tube', f.mm(0.8)));
  } else {
    casing(pic, f, mark === 'tyre' ? 'cp-hi' : 'cp-rubber');
    if (tubeIn) innerTube(pic, f, mark === 'tube' ? 'cp-hi' : 'cp-body');
  }
  beads(pic, f, mark === 'bead' ? 'cp-hi' : 'cp-dark');
  if (mark === 'tyre') pic.label('cp-th', [306, 40], 'tyre', [290, 46], pol(...m(0, YC), f.mm(R - 1), 40), 'end', 'leader');
  if (mark === 'tube') pic.label('cp-th', [222, 24], 'inner tube', [220, 22], pol(...m(0, YC), f.mm(RI - 0.5), 42), undefined, 'leader');
  if (mark === 'bead') pic.label('cp-th', [228, 150], 'bead', [226, 146], m(WI / 2 - 1.6, SEAT - 1.7), undefined, 'leader');
  if (mark === 'rim') pic.label('cp-th', [306, 200], 'rim', [292, 194], m(WI / 2 + WALL - 0.4, 8), 'end', 'leader');
  if (mark === 'tyre' || mark === 'tube' || mark === 'bead' || mark === 'rim') {
    const target = mark === 'bead' ? 'bead-r' : mark;
    pic.facts.push(pointsAt(pic, 'leader', target, 1.5));
  }
  if (mark === 'rim' || mark === 'tyre' || mark === 'tube' || mark === 'bead') {
    pic.label('cp-tm', [14, 200], 'hook', [36, 192], m(-WI / 2 + HOOK / 2, LIP / 2), undefined, 'leader-hook');
    pic.facts.push(pointsAt(pic, 'leader-hook', 'rim', 1));
  }
  pic.text('cp-tm', [14, 232], 'The wheel cut through');
  // facts: each bead on its seat inside the flange; the casing round the beads; the tube fills the casing and rests on the well
  pic.facts.push(within(pic, 'bead-l', 'tyre', 1.5), touches(pic, 'tyre', 'rim', 0.8));
  pic.facts.push({ what: 'each bead sits on its seat, under the hook', ok: SEAT - 1.7 - 1.3 > LIP && SEAT - 1.7 + 1.3 <= SEAT });
  if (tubeIn) pic.facts.push(touches(pic, 'tube', 'rim', f.mm(0.6)), clear(pic, 'tube', 'rim', 0) );
  return pic;
}

/** A tubeless valve fixed in the rim, cut through at the valve: its rubber base in the rim's dip, its stem through the rim, a nut below. */
export function tubelessValve(): Pic {
  const pic = new Pic(320, 230);
  const f = frame(150, 30, 4.8), { m } = f;
  rim(pic, f);
  // the rim tape over the well and up its sides to the bead seats
  pic.path('cp-fine', poly([m(-toeX - 0.4, SEAT - 0.6), m(-toeX + 1.9, CH - 0.7), m(toeX - 1.9, CH - 0.7), m(toeX + 0.4, SEAT - 0.6)], false), { style: 'stroke-width:3', name: 'tape' });
  // the valve: a cone of rubber in the dip, the stem down through the rim, the nut under the rim
  const base = poly([m(-5.4, CH - 2.8), m(5.4, CH - 2.8), m(3.2, CH + 0.8), m(-3.2, CH + 0.8)]);
  pic.path('cp-hi', base, { name: 'valve' });
  pic.path('cp-hi', poly([m(-3, CH + 0.8), m(3, CH + 0.8), m(3, DEPTH + 8), m(-3, DEPTH + 8)]), { name: 'stem' });
  for (let y = DEPTH + 1; y < DEPTH + 7.6; y += 1.3) pic.line('cp-fine', m(-3, y), m(3, y - 0.8));
  pic.path('cp-obj', poly([m(-1, DEPTH + 8), m(1, DEPTH + 8), m(1, DEPTH + 11.6), m(-1, DEPTH + 11.6)]));
  pic.path('cp-obj', rrect(...m(-2, DEPTH + 9.2), f.mm(4), f.mm(1.4), 1));
  pic.path('cp-obj', rrect(...m(-5.5, DEPTH - 0.4), f.mm(11), f.mm(3.2), 2), { name: 'nut' });
  pic.label('cp-th', [306, 24], 'tubeless valve', [262, 30], m(3.6, CH - 1.6), 'end', 'leader-valve');
  pic.label('cp-tm', [306, 176], 'nut', [292, 170], m(5.5, DEPTH + 1.2), 'end', 'leader-nut');
  pic.label('cp-tm', [14, 60], 'rim', [36, 66], m(-WI / 2 - WALL, 6), undefined, 'leader-rim');
  pic.text('cp-tm', [14, 222], 'The rim cut through at the valve');
  pic.facts.push(touches(pic, 'valve', 'rim', f.mm(0.8)), touches(pic, 'nut', 'rim', 0.8), touches(pic, 'stem', 'nut', 0.5));
  pic.facts.push(pointsAt(pic, 'leader-valve', 'valve', 1), pointsAt(pic, 'leader-nut', 'nut', 1), pointsAt(pic, 'leader-rim', 'rim', 1));
  pic.facts.push(touches(pic, 'tape', 'rim', f.mm(1)), touches(pic, 'valve', 'tape', 1));
  return pic;
}

/** Presta, Schrader and Dunlop valves standing through the rim, side by side (the guide's valve; the bike's own first in the words). */
export function valves(): Pic {
  const pic = new Pic(320, 230);
  const base = 170, rimTop = base, rimBot = base + 12;
  pic.path('cp-obj', poly([[4, rimTop], [316, rimTop], [316, rimBot], [4, rimBot]]), { name: 'rim' });
  // Presta: thin, threaded, a lock nut down on the rim, a little nut on its tip
  const px = 60;
  pic.path('cp-obj', poly([[px - 6, rimTop], [px + 6, rimTop], [px + 6, rimTop - 100], [px - 6, rimTop - 100]]), { name: 'presta' });
  for (let y = rimTop - 10; y > rimTop - 98; y -= 6) pic.line('cp-fine', [px - 6, y], [px + 6, y - 2]);
  pic.path('cp-obj', rrect(px - 11, rimTop - 7, 22, 7, 1.5));
  for (let x = px - 9; x <= px + 9; x += 3) pic.line('cp-fine', [x, rimTop - 6], [x, rimTop - 1]);
  pic.path('cp-obj', poly([[px - 1.5, rimTop - 100], [px + 1.5, rimTop - 100], [px + 1.5, rimTop - 124], [px - 1.5, rimTop - 124]]));
  pic.path('cp-obj', rrect(px - 4, rimTop - 116, 8, 6, 1.5));
  // Schrader: wide, threaded near its top, a pin in the middle of its end
  const sx = 160;
  pic.path('cp-obj', rrect(sx - 8, rimTop - 84, 16, 84, 2), { name: 'schrader' });
  for (let y = rimTop - 70; y < rimTop - 50; y += 4) pic.line('cp-fine', [sx - 8, y], [sx + 8, y - 2]);
  // the pin sits in the valve's mouth, just below its end
  pic.line('cp-fine', [sx - 5, rimTop - 84], [sx + 5, rimTop - 84]);
  pic.line('cp-objline', [sx, rimTop - 82], [sx, rimTop - 74], { style: 'stroke-width:3' });
  // Dunlop (Woods): a wide body, a knurled ring nut near its top holding the core, the core's sleeve above it
  const dx = 260;
  pic.path('cp-obj', rrect(dx - 8, rimTop - 64, 16, 64, 2), { name: 'dunlop' });
  pic.path('cp-obj', rrect(dx - 11, rimTop - 76, 22, 13, 2), { name: 'dunlop-nut' });
  for (let x = dx - 8; x <= dx + 8; x += 4) pic.line('cp-fine', [x, rimTop - 74], [x, rimTop - 65]);
  pic.path('cp-obj', rrect(dx - 4, rimTop - 96, 8, 21, 2));
  pic.text('cp-th', [px, 24], 'Presta', 'middle');
  pic.text('cp-th', [sx, 54], 'Schrader', 'middle');
  pic.text('cp-th', [dx, 54], 'Dunlop', 'middle');
  pic.text('cp-tm', [10, 222], 'Through the rim, seen from the side');
  pic.facts.push(touches(pic, 'presta', 'rim', 0.5), touches(pic, 'schrader', 'rim', 0.5), touches(pic, 'dunlop', 'rim', 0.5), touches(pic, 'dunlop-nut', 'dunlop', 0.5));
  void rimBot;
  return pic;
}

/**
 * The tyre's edge off the rim (puncture step 2, T2): 1, the bead pushed off its seat into the rim's dip all round, which gives slack;
 * 2, two levers: the first under the bead and hooked on a spoke, the second run round the rim.
 */
export function tyreLevers(): Pic {
  const pic = new Pic(320, 236);
  pic.path('cp-frame', rrect(4, 4, 118, 228, 8)).path('cp-frame', rrect(128, 4, 188, 228, 8));
  // ---- 1: the wheel cut through, small: the beads moved from their seats (dashed, where they were) into the dip
  {
    const f = frame(63, 124, 2.5), { m } = f;
    rim(pic, f);
    const c = m(0, YC), i = WI / 2;
    // the casing with its feet down in the dip: outer circle from flange to flange, the feet drawn as they hang in the well
    const aOut = (Math.asin(i / R) * 180) / Math.PI;
    pic.path('cp-rubber', new Path().M(m(-i, 0)).arcTo(c, 180 - aOut, true).L(m(i - 2.6, 0.4)).L(m(3.2, CH - 2.6)).L(m(1, CH - 2.6)).L(m(i - 4.6, 0.6))
      .arcTo(c, 180 + aOut - 6, false).L(m(-1, CH - 2.6)).L(m(-3.2, CH - 2.6)).L(m(-i + 2.6, 0.4)).Z(), { name: 'tyre-dip' });
    for (const s of [-1, 1] as const) {
      pic.circle('cp-dark', m(s * 2.2, CH - 1.5), f.mm(1.2), { name: s < 0 ? 'bead-dip-l' : 'bead-dip-r' });
      pic.circle('cp-ghost', m(s * (WI / 2 - 1.6), SEAT - 1.7), f.mm(2));
    }
    pic.badge([20, 26], '1');
    pic.text('cp-th', [63, 206], 'into the dip', 'middle');
    pic.facts.push(touches(pic, 'bead-dip-l', 'rim', f.mm(1.5)), touches(pic, 'tyre-dip', 'rim', 1.5));
  }
  // ---- 2: the top of the wheel from the side; the rim's two arcs and the tyre round one centre; spokes from their nipples
  {
    const C: Pt = [222, 392], k = 0.95, Rr = 311 * k, Rt = Rr + 36 * k, Rw = Rr - 24 * k, L = 104, span = 14;
    const band = (r0: number, r1: number, a0: number, a1: number) =>
      new Path().M(pol(C[0], C[1], r1, a0)).arcTo(C, a1, true).L(pol(C[0], C[1], r0, a1)).arcTo(C, a0, false).Z();
    // spokes: from their nipples in the rim's inner wall towards the hub, leaning alternately, ending in the panel
    const spokes: { top: Pt; low: Pt }[] = [];
    for (let a = -13.125; a <= 13.2; a += 5.625) {
      const lean = (Math.round((a + 13.125) / 5.625) % 2 === 0 ? 1 : -1) * 3.6;
      const top = pol(C[0], C[1], Rw, a), low = pol(C[0], C[1], 168, a + lean);
      spokes.push({ top, low });
      pic.line('cp-thin', top, low);
    }
    pic.path('cp-obj', band(Rw, Rr, -span, span), { name: 'rim-side' });
    const l1 = -8, l2 = 4;
    const lever = (a: number, name: string, cls: string) => {
      const tip = pol(C[0], C[1], Rr - 2, a), end = pol(C[0], C[1], Rr - 2 - L, a);
      pic.path(cls, tube(tip, end, 10), { name });
      return { tip, end };
    };
    // lever 1's hook end goes round the spoke nearest to it: that spoke drawn first, so the lever lies over it
    const end1 = pol(C[0], C[1], Rr - 2 - L, l1);
    const near = spokes.map((sp) => {
      const t = Math.max(0, Math.min(1, ((end1[0] - sp.top[0]) * (sp.low[0] - sp.top[0]) + (end1[1] - sp.top[1]) * (sp.low[1] - sp.top[1]))
        / ((sp.low[0] - sp.top[0]) ** 2 + (sp.low[1] - sp.top[1]) ** 2)));
      const p: Pt = [sp.top[0] + (sp.low[0] - sp.top[0]) * t, sp.top[1] + (sp.low[1] - sp.top[1]) * t];
      return { sp, p, d: Math.hypot(p[0] - end1[0], p[1] - end1[1]) };
    }).sort((x, y) => x.d - y.d)[0]!;
    pic.line('cp-objline', near.sp.top, near.sp.low, { style: 'stroke-width:1.4', name: 'hooked-spoke' });
    const one = lever(l1, 'lever-1', 'cp-hi');
    lever(l2, 'lever-2', 'cp-obj');
    // the hook: on from the lever's end, round under the spoke and back up its far side, a J
    {
      const su: Pt = [near.sp.low[0] - near.sp.top[0], near.sp.low[1] - near.sp.top[1]], sl = Math.hypot(su[0], su[1]);
      const u: Pt = [su[0] / sl, su[1] / sl];
      const side = (one.end[0] - near.p[0]) * -u[1] + (one.end[1] - near.p[1]) * u[0] >= 0 ? 1 : -1;
      const n: Pt = [-u[1] * side, u[0] * side];
      const at = (a: number, b: number): Pt => [near.p[0] + u[0] * a + n[0] * b, near.p[1] + u[1] * a + n[1] * b];
      pic.path('cp-hiline', new Path().M(one.end).L(at(6, 4)).Q(at(12, 0), at(8, -6)).L(at(2, -6)), { style: 'stroke-width:3.5', name: 'hook' });
    }
    // the tyre over the levers' tips: its edge on the rim, lifted out over the rim's wall between the levers
    pic.path('cp-rubber', new Path().M(pol(C[0], C[1], Rt, -span)).arcTo(C, span, true).L(pol(C[0], C[1], Rr, span)).arcTo(C, l2 + 2, false)
      .Q(pol(C[0], C[1], Rr - 16, l2 - 1), pol(C[0], C[1], Rr - 18, (l1 + l2) / 2)).Q(pol(C[0], C[1], Rr - 16, l1 + 1), pol(C[0], C[1], Rr, l1 - 2))
      .arcTo(C, -span, false).Z(), { name: 'tyre-side' });
    // lever 2 is run along the rim, away from lever 1
    pic.turn(C, Rr - 30, l2 + 3, l2 + 11);
    pic.badge([144, 26], '2');
    pic.facts.push(touches(pic, 'lever-1', 'tyre-side', 1), touches(pic, 'lever-2', 'tyre-side', 1), touches(pic, 'hook', 'hooked-spoke', 1));
  }
  return pic;
}

/** A pinched tube: a length of inner tube laid flat, its valve on the rim side, two slits side by side in the middle. */
export function pinchSlits(): Pic {
  const pic = new Pic(320, 230);
  const C: Pt = [160, 560], r0 = 420, r1 = 466;
  pic.path('cp-rubber', new Path().M(pol(C[0], C[1], r1, -21)).arcTo(C, 21, true).L(pol(C[0], C[1], r0, 21)).arcTo(C, -21, false).Z(), { name: 'tube' });
  const v0 = pol(C[0], C[1], r0, -14), v1 = pol(C[0], C[1], r0 - 46, -14);
  pic.path('cp-obj', tube(v0, v1, 9), { name: 'valve' });
  // two short slits side by side across the tube, each along it: where the rim's two walls cut it
  for (const [k, r] of [[0, r0 + 13], [1, r1 - 13]] as const) {
    pic.path('cp-hiline', new Path().M(pol(C[0], C[1], r, -1.6)).arcTo(C, 1.6, true), { style: 'stroke-width:3', name: `slit-${k}` });
  }
  pic.circle('cp-halo', pol(C[0], C[1], (r0 + r1) / 2, 0), 30);
  pic.label('cp-th', [306, 214], 'two slits side by side', [262, 200], pol(C[0], C[1], r0 + 13, 1.6), 'end', 'leader-slits');
  pic.label('cp-tm', [14, 214], 'valve', [40, 204], add(v1, [0, -2]), undefined, 'leader-valve');
  pic.text('cp-tm', [14, 30], 'A length of tube, seen from the side');
  pic.facts.push(touches(pic, 'valve', 'tube', 0.6), pointsAt(pic, 'leader-valve', 'valve', 2), within(pic, 'slit-0', 'tube', 0), within(pic, 'slit-1', 'tube', 0));
  return pic;
}

/** Patching a tube: the roughened area a bit bigger than the patch (dashed), the patch pressed from the middle outwards. */
export function patchPress(): Pic {
  const pic = new Pic(320, 220);
  const C: Pt = [160, 560], r0 = 430, r1 = 482;
  pic.path('cp-rubber', new Path().M(pol(C[0], C[1], r1, -21)).arcTo(C, 21, true).L(pol(C[0], C[1], r0, 21)).arcTo(C, -21, false).Z(), { name: 'tube' });
  const mid = pol(C[0], C[1], (r0 + r1) / 2, 0);
  pic.path('cp-thin', rrect(mid[0] - 46, mid[1] - 19, 92, 38, 8), { style: 'stroke-dasharray:4 3', name: 'rough' });
  pic.circle('cp-halo', mid, 36);
  pic.path('cp-hi', rrect(mid[0] - 32, mid[1] - 13, 64, 26, 8), { name: 'patch' });
  pic.arrow(add(mid, [-4, 0]), add(mid, [-26, 0]));
  pic.arrow(add(mid, [4, 0]), add(mid, [26, 0]));
  pic.label('cp-tm', [160, 34], 'roughened area', [160, 40], add(mid, [-30, -19]), 'middle', 'leader-rough');
  pic.text('cp-th', [160, 192], 'press from the middle outwards', 'middle');
  pic.facts.push(within(pic, 'patch', 'rough', 0.5), within(pic, 'rough', 'tube', 0.5), pointsAt(pic, 'leader-rough', 'rough', 1));
  return pic;
}

/** A plug pushed into a tubeless tyre's hole: the casing cut through; the strip folded on the tool's forked needle, its tails left outside. */
export function tubelessPlug(): Pic {
  const pic = new Pic(320, 230);
  const top = 132, thick = 26, hole = 168;
  // the casing with its tread knobs, cut through; the hole
  const casingL = poly([[4, top], [hole - 4, top], [hole - 4, top + thick], [4, top + thick]]);
  const casingR = poly([[hole + 4, top], [316, top], [316, top + thick], [hole + 4, top + thick]]);
  pic.path('cp-rubber', casingL, { name: 'casing-l' }).path('cp-rubber', casingR, { name: 'casing-r' });
  for (const x of [30, 84, 236, 290]) pic.path('cp-rubber', rrect(x - 13, top - 9, 26, 10, 3));
  pic.text('cp-tm', [10, top + thick + 22], 'inside the tyre');
  pic.text('cp-tm', [10, top - 18], 'tread');
  // the tool: a handle above, a needle down through the hole, forked at its tip
  pic.path('cp-obj', rrect(hole - 22, 14, 44, 40, 10), { name: 'handle' });
  pic.line('cp-objline', [hole, 54], [hole, top + thick + 4], { style: 'stroke-width:4', name: 'needle' });
  // the needle's fork, the strip through it
  pic.path('cp-objline', new Path().M([hole, top + thick + 2]).L([hole - 4, top + thick + 11]).M([hole, top + thick + 2]).L([hole + 4, top + thick + 11]), { style: 'stroke-width:3' });
  // the plug strip: through the needle's eye, folded; its two tails out of the hole above the tread
  const fold = top + thick + 6;
  const strip = new Path().M([hole - 14, top - 22]).Q([hole - 3, top - 6], [hole - 2.5, top + 4]).L([hole - 2.5, fold - 3]).Q([hole, fold + 3], [hole + 2.5, fold - 3])
    .L([hole + 2.5, top + 4]).Q([hole + 3, top - 6], [hole + 14, top - 22]);
  pic.path('cp-halowire', strip);
  pic.path('cp-hiline', strip, { style: 'stroke-width:5', name: 'plug' });
  pic.arrow([hole + 44, 46], [hole + 44, 104]);
  pic.label('cp-th', [306, 100], 'plug', [282, 96], [hole + 12, top - 16], 'end', 'leader-plug');
  pic.text('cp-th', [hole + 52, 66], 'push in');
  pic.facts.push(touches(pic, 'needle', 'handle', 0.5), touches(pic, 'plug', 'casing-l', 2), pointsAt(pic, 'leader-plug', 'plug', 2.5));
  pic.facts.push({ what: 'the strip folds inside the casing, its tails outside', ok: fold > top + thick && top - 22 < top });
  return pic;
}

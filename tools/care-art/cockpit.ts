// The cockpit (batch 4; research note R §8): the front end from the side (a tapered head tube with its bearings inside, drawn dashed; a
// slim top cover; a stem with two pinch bolts round the steerer and a four-bolt faceplate round the bar), a drop bar at its real
// proportions (reach about 75 mm, drop about 120 mm, a 23.8 mm tube; the hood on the front of the bend), a flat bar from above (a 9°
// backsweep, grips at the ends, the levers just ahead of them, the stem forward of the steerer), and the twist test that checks the
// stem and the bar (book p. 40).
import { boltHead, clipTo, ribbon } from './common.ts';
import { add, at, band, clear, deg, Path, Pic, pointsAt, poly, rbox, rrect, scale, sub, touches, tube, within, type Pt } from './kit.ts';

type Box = readonly [number, number, number, number];
const HEAD = 72, SN = Math.sin(deg(90 - HEAD)), CS = Math.cos(deg(90 - HEAD));
/** Millimetres in the steerer's frame: t forward, square to the steerer; s up along it, from where it leaves the head tube's top. */
const steererAt = (o: Pt, k: number) => (t: number, s: number): Pt => [o[0] + k * (t * CS - s * SN), o[1] + k * (-t * SN - s * CS)];
/** The stem: 100 mm at -6°, its clamp 40 mm tall over a 10 mm spacer and the 7 mm top cover. */
const STEM = 100, RISE = -6, CLAMP_S = 37;
const U: Pt = [Math.cos(deg(RISE)), Math.sin(deg(RISE))], N: Pt = [-Math.sin(deg(RISE)), Math.cos(deg(RISE))];
const BAR_TS: Pt = [STEM * U[0], CLAMP_S + STEM * U[1]];
/** Screen angle (degrees clockwise from up) of a vector. */
const ang = (v: Pt): number => (Math.atan2(v[0], -v[1]) * 180) / Math.PI;
const R_BAR = 15.9, R_CLAMP = 21;

type FrontOpts = { hi?: 'headset' | 'stem' | 'clamp'; box?: Box; fork?: boolean; tubes?: boolean; endOn?: boolean };

/**
 * The front end from the bike's right side, front to the right: top and down tube, the tapered head tube with its two bearings inside
 * (dashed), the top cover, a spacer, the stem round the steerer with its two pinch bolts, the faceplate round the bar with a bolt above
 * and below it (the other two behind), the top cap. Returns the bar's centre and the scale. Parts that run on are cut at `box`.
 */
function frontEnd(pic: Pic, o: Pt, k: number, opt: FrontOpts = {}): { B: Pt; A: (t: number, s: number) => Pt; ring: (r: number, th: number) => Pt } {
  const A = steererAt(o, k);
  const cut = (pts: Pt[]): Pt[] => (opt.box ? clipTo(pts, opt.box) : pts);
  const rear = (s: number): Pt => A(-24 - (7 * -s) / 150, s);
  const away = (p: Pt, a: number, l: number): Pt => [p[0] - l * Math.cos(deg(a)), p[1] + l * Math.sin(deg(a))];
  // the top tube leaves the head tube's back a little downhill, the down tube steeply; both run on out of the picture
  if (opt.tubes !== false) {
    pic.path('cp-body', poly(cut([rear(-14), rear(-58), away(rear(-58), 8, 400), away(rear(-14), 8, 400)])));
    pic.path('cp-body', poly(cut([rear(-92), rear(-148), away(rear(-148), 42, 400), away(rear(-92), 42, 400)])));
  }
  if (opt.fork !== false) {
    pic.path('cp-body', poly(cut([A(-8, -168), A(22, -168), A(44, -420), A(14, -420)])));
    pic.path('cp-body', poly(cut([A(-31, -150), A(31, -150), A(40, -158), A(36, -170), A(-26, -170), A(-34, -160)])), { name: 'crown' });
  }
  pic.path('cp-body', poly(cut([A(-24, 0), A(24, 0), A(31, -150), A(-31, -150)])), { name: 'head-tube' });
  // the bearings, inside the head tube: 41.8 mm at the top, 52 mm (1.5") at the bottom
  const brg = opt.hi === 'headset' ? 'cp-ghost' : 'cp-fine';
  const dash = opt.hi === 'headset' ? {} : { style: 'stroke-dasharray:3 3' };
  if (opt.hi === 'headset') {
    pic.circle('cp-halo', A(0, -6), 26 * k);
    pic.circle('cp-halo', A(0, -144), 32 * k);
  }
  pic.path(brg, poly([A(-20.9, -2), A(20.9, -2), A(20.9, -10), A(-20.9, -10)]), { name: 'bearing-top', ...dash });
  const low = !opt.box || A(0, -150)[1] < opt.box[3];
  if (low) pic.path(brg, poly([A(-26, -140), A(26, -140), A(26, -148), A(-26, -148)]), { name: 'bearing-bottom', ...dash });
  pic.path(opt.hi === 'headset' ? 'cp-hi' : 'cp-obj', poly([A(-23, 0), A(23, 0), A(17, 7), A(-17, 7)]), { name: 'cover' });
  pic.path('cp-obj', poly([A(-17, 7), A(17, 7), A(17, 17), A(-17, 17)]), { name: 'spacer' });
  // the stem: its clamp round the steerer, the body forward to the bar clamp, whose back half it is
  const B = A(...BAR_TS);
  const S = (a: number, b: number): Pt => A(BAR_TS[0] + a * U[0] + b * N[0], BAR_TS[1] + a * U[1] + b * N[1]);
  const ring = (r: number, th: number): Pt => S(r * Math.cos(deg(th)), r * Math.sin(deg(th)));
  const sa = (th: number): number => ang(sub(ring(1, th), B));
  const stem = new Path().M(A(-22, 17)).L(A(-22, 57)).L(A(18, 57)).L(ring(R_CLAMP, 126)).arcTo(B, sa(96), true).L(ring(R_BAR, 96))
    .arcTo(B, sa(264), false).L(ring(R_CLAMP, 264)).arcTo(B, sa(234), true).L(A(18, 17)).Z();
  if (opt.hi === 'clamp') pic.circle('cp-halo', B, 34 * k);
  if (opt.hi === 'stem') pic.path('cp-halostroke', stem);
  pic.path(opt.hi === 'stem' ? 'cp-hi' : 'cp-obj', stem, { name: 'stem' });
  boltHead(pic, A(-15, 27), 4.5 * k, { name: 'pinch-1' });
  boltHead(pic, A(-15, 47), 4.5 * k, { name: 'pinch-2' });
  // the faceplate: the clamp's front half; a bolt head above the bar and one below it face forward
  pic.path('cp-obj', band(B, R_BAR * k, R_CLAMP * k, sa(84), sa(-84)), { name: 'faceplate' });
  const uAng = (Math.atan2(S(1, 0)[1] - B[1], S(1, 0)[0] - B[0]) * 180) / Math.PI;
  pic.path('cp-obj', rbox(S(12.5, 18.6), 5 * k, 6.4 * k, uAng), { name: 'bolt-top' });
  pic.path('cp-obj', rbox(S(12.5, -18.6), 5 * k, 6.4 * k, uAng), { name: 'bolt-bottom' });
  pic.path('cp-obj', poly([A(-15, 57), A(15, 57), A(13, 62), A(-13, 62)]), { name: 'cap' });
  pic.path('cp-fine', poly([A(-4, 62), A(4, 62), A(4, 65), A(-4, 65)]));
  if (opt.endOn !== false) pic.circle('cp-obj', B, R_BAR * k, { name: 'bar' });
  if (low) pic.facts.push(within(pic, 'bearing-bottom', 'head-tube'));
  pic.facts.push(within(pic, 'bearing-top', 'head-tube'), touches(pic, 'cover', 'head-tube', 0.5),
    touches(pic, 'spacer', 'cover', 0.5), touches(pic, 'stem', 'spacer', 0.5), within(pic, 'pinch-1', 'stem'), within(pic, 'pinch-2', 'stem'),
    touches(pic, 'faceplate', 'stem', 4 * k), touches(pic, 'bolt-top', 'faceplate', 0.6), touches(pic, 'bolt-bottom', 'faceplate', 0.6),
    touches(pic, 'cap', 'stem', 0.5));
  return { B, A, ring };
}

/** The guide's headset or stem: the front end from the side. */
export function headset(kind: 'headset' | 'stem'): Pic {
  const pic = new Pic(320, 230);
  const { A, B } = frontEnd(pic, [130, 82], 0.85, { hi: kind });
  if (kind === 'headset') {
    pic.label('cp-th', [8, 84], 'headset', [10, 80], A(-21, -6), undefined, 'leader');
    const from: Pt = [36, 90];
    pic.line('cp-thin', from, A(-26, -144), { name: 'leader-2' });
    pic.label('cp-t', [312, 120], 'stem', [310, 116], A(55, 40), 'end', 'leader-stem');
    pic.facts.push(pointsAt(pic, 'leader', 'bearing-top'), pointsAt(pic, 'leader-2', 'bearing-bottom'), pointsAt(pic, 'leader-stem', 'stem'));
  } else {
    pic.label('cp-th', [312, 120], 'stem', [310, 116], A(55, 40), 'end', 'leader');
    pic.label('cp-t', [226, 40], 'handlebar', [228, 36], add(B, [5 * 0.85, -8 * 0.85]), undefined, 'leader-bar');
    pic.facts.push(pointsAt(pic, 'leader', 'stem'), pointsAt(pic, 'leader-bar', 'bar'));
  }
  return pic;
}

/**
 * A drop bar from the side, its clamp at m(0, 0) (millimetres, x forward, y down): the tops run forward into the bend (reach 76 mm),
 * which curves down and back to the drops (drop 116 mm); the hood sits on the front of the bend, the lever blade hangs in front of it.
 */
function dropBar(pic: Pic, m: (x: number, y: number) => Pt, k: number, hi: 'bar' | 'lever' | null): void {
  const line = new Path().M(m(0, 0)).L(m(28, 0)).arcTo(m(28, 48), 90, true).arcTo(m(8, 48), 180, true).L(m(-42, 120));
  const bar = ribbon(line.parts[0]!, 23.8 * k);
  if (hi === 'bar') pic.path('cp-halostroke', bar);
  pic.path(hi === 'bar' ? 'cp-hi' : 'cp-obj', bar, { name: 'bar' });
  pic.mark('drops', poly([m(8, 104), m(-42, 108), m(-42, 132), m(8, 128)]));
  const blade = ribbon(new Path().M(m(96, -2)).Q(m(112, 58), m(74, 112)).parts[0]!, 11 * k, 8 * k);
  if (hi === 'lever') pic.path('cp-halostroke', blade);
  pic.path(hi === 'lever' ? 'cp-hi' : 'cp-obj', blade, { name: 'blade' });
  const C1 = m(28, 48), r = 59.9 * k;
  const hood = new Path().M(add(C1, [r * Math.sin(deg(72)), -r * Math.cos(deg(72))])).arcTo(C1, 12, false).L(m(44, -34))
    .Q(m(50, -46), m(68, -46)).L(m(88, -46)).Q(m(101, -46), m(100, -30)).L(m(97, -4)).Z();
  pic.path('cp-obj', hood, { name: 'hood' });
  pic.facts.push(touches(pic, 'hood', 'bar', 0.6), clear(pic, 'blade', 'drops', 3 * k));
  pic.fact('the reach is about 0.6 of the drop (76 to 116 mm)', Math.abs(76 / 116 - 0.65) < 0.05);
}

/** The stem's front end and its bar clamp, for a close-up of the bar: the stem runs back out of the picture. */
function stemStub(pic: Pic, B: Pt, k: number): void {
  const a = deg(90 - HEAD + RISE); // the stem's rise above level: 18° - 6° = 12°
  const u: Pt = [Math.cos(a), -Math.sin(a)], nv: Pt = [-u[1], u[0]];
  const p = (x: number, y: number): Pt => add(B, add(scale(u, x * k), scale(nv, y * k)));
  pic.path('cp-body', poly([p(-12, -17), p(-200, -20), p(-200, 20), p(-12, 17)]), { name: 'stem' });
  pic.circle('cp-body', B, R_CLAMP * k, { name: 'clamp' });
  pic.path('cp-fine', poly([p(0, -R_CLAMP), p(0, R_CLAMP)], false));
  for (const y of [-18.6, 18.6]) pic.path('cp-obj', rbox(p(12.5, y), 5 * k, 6.4 * k, (Math.atan2(u[1], u[0]) * 180) / Math.PI));
}

/** The guide's drop bar or its brake lever, from the side. */
export function dropGuide(kind: 'bar' | 'lever'): Pic {
  const pic = new Pic(320, 220);
  const k = 1, B: Pt = [130, 56], m = (x: number, y: number): Pt => [B[0] + x * k, B[1] + y * k];
  stemStub(pic, B, k);
  dropBar(pic, m, k, kind);
  pic.circle(kind === 'bar' ? 'cp-hi' : 'cp-obj', B, R_BAR * k, { name: 'bar-end' });
  if (kind === 'bar') {
    pic.label('cp-th', [10, 190], 'drop bar', [12, 186], m(-30, 112), undefined, 'leader');
    pic.facts.push(pointsAt(pic, 'leader', 'bar'));
  } else {
    pic.label('cp-th', [300, 192], 'brake lever', [298, 188], m(101, 60), 'end', 'leader');
    pic.facts.push(pointsAt(pic, 'leader', 'blade'));
  }
  pic.label('cp-t', [250, 40], 'hood', [252, 36], m(99, -30), undefined, 'leader-hood');
  pic.text('cp-tm', [10, 212], 'Seen from the side, front to the right');
  pic.facts.push(pointsAt(pic, 'leader-hood', 'hood'), touches(pic, 'bar-end', 'clamp', 6));
  return pic;
}

type TopOpts = { kind: 'drop' | 'flat'; dir: 1 | -1; box?: Box; rider?: boolean; hi?: 'stem' | 'bar' | 'display'; levers?: boolean };

/**
 * The front end from above (millimetres: x across, y forward; `dir` 1 draws forward up the page, -1 down it): the head tube's top and
 * the top tube behind it, the stem forward to the bar (100 mm), the bar: a drop bar's tops and its bends forward to the hoods (420 mm
 * across), or a flat bar, 680 mm, swept 9° back from 100 mm out, grips at its ends, the levers just ahead of them. With `rider`, the
 * front wheel between the knees of someone standing in front of the bike, hands on the hoods or the grips.
 */
function topView(pic: Pic, o: Pt, k: number, opt: TopOpts): { m: (x: number, y: number) => Pt; yb: number } {
  const m = (x: number, y: number): Pt => [o[0] + k * x, o[1] - opt.dir * k * y];
  const cut = (pts: Pt[]): Pt[] => (opt.box ? clipTo(pts, opt.box) : pts);
  const yb = 109, flat = opt.kind === 'flat';
  const sweep = (x: number): number => (Math.abs(x) <= 100 ? 0 : -(Math.abs(x) - 100) * Math.tan(deg(9)));
  const on = (x: number, dy = 0): Pt => m(x, yb + sweep(x) + dy);
  if (opt.rider) {
    // the front wheel's tyre, from under the head tube to its front, 40 mm wide
    const t0 = m(-20, -30), t1 = m(20, 500);
    pic.path('cp-rubber', rrect(Math.min(t0[0], t1[0]), Math.min(t0[1], t1[1]), Math.abs(t1[0] - t0[0]), Math.abs(t1[1] - t0[1]), 20 * k), { name: 'tyre' });
  }
  pic.path('cp-body', poly(cut([m(-17, 0), m(17, 0), m(17, -600), m(-17, -600)])), { name: 'top-tube' });
  pic.circle('cp-body', m(0, 0), 26 * k, { name: 'head-tube' });
  // the bar
  if (!flat) for (const sx of [-1, 1]) pic.path('cp-obj', tube(m(sx * 222, yb + 62), m(sx * 240, yb - 45), 23.8 * k), { name: `drop-${sx}` });
  const line = flat
    ? new Path().M(on(-340)).L(on(-100)).L(on(100)).L(on(340))
    : new Path().M(m(-218, yb + 70)).Q(m(-214, yb + 4), m(-176, yb)).L(m(176, yb)).Q(m(214, yb + 4), m(218, yb + 70));
  const bar = ribbon(line.parts[0]!, (flat ? 22.2 : 23.8) * k);
  if (opt.hi === 'bar') pic.path('cp-halostroke', bar);
  pic.path(opt.hi === 'bar' ? 'cp-hi' : 'cp-obj', bar, { name: 'bar' });
  if (flat) {
    for (const sx of [-1, 1]) {
      pic.path('cp-rubber', tube(on(sx * 212), on(sx * 340), 32 * k), { name: `grip-${sx}` });
      if (opt.levers !== false) {
        pic.path('cp-obj', tube(on(sx * 182, -14), on(sx * 182, 30), 16 * k), { name: `lever-body-${sx}` });
        pic.path('cp-obj', tube(on(sx * 186, 34), on(sx * 318, 40), 9 * k), { name: `lever-${sx}` });
      }
    }
  } else {
    for (const sx of [-1, 1]) pic.path('cp-obj', rrect(...m(sx * 218 - 16, yb + 101), 32 * k, 62 * k, 10 * k), { name: `hood-${sx}` });
  }
  // the stem from above: the clamp round the steerer, the body forward, the bar clamp and the faceplate with its two upper bolts
  const box = (x0: number, y0: number, x1: number, y1: number, r: number): Path => {
    const a = m(x0, y0), b = m(x1, y1);
    return rrect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), r * k);
  };
  const stemCls = opt.hi === 'stem' ? 'cp-hi' : 'cp-obj';
  const stem = new Path().M(m(-22, -24)).L(m(22, -24)).L(m(22, 14)).L(m(15, 24)).L(m(15, yb - 16)).L(m(27, yb - 16)).L(m(27, yb))
    .L(m(-27, yb)).L(m(-27, yb - 16)).L(m(-15, yb - 16)).L(m(-15, 24)).L(m(-22, 14)).Z();
  if (opt.hi === 'stem') pic.path('cp-halostroke', stem);
  pic.path(stemCls, stem, { name: 'stem' });
  pic.path(stemCls, box(-27, yb, 27, yb + 16, 2), { name: 'faceplate' });
  for (const sx of [-1, 1]) pic.path('cp-fine', box(sx * 20 - 3, yb + 16, sx * 20 + 3, yb + 21, 1));
  pic.circle('cp-obj', m(0, 0), 15 * k, { name: 'cap' });
  boltHead(pic, m(0, 0), 5 * k);
  pic.facts.push(touches(pic, 'faceplate', 'stem', 0.5), touches(pic, 'bar', 'stem', 0.5), within(pic, 'cap', 'stem'));
  if (opt.rider) {
    // hands on the hoods or the grips; arms back to the rider; the knees either side of the tyre
    const hand: Pt = flat ? [275, yb + sweep(275) - 4] : [222, yb + 74];
    for (const sx of [-1, 1]) {
      pic.path('cp-body', poly(cut([m(sx * (hand[0] - 30), hand[1]), m(sx * (hand[0] + 34), hand[1]), m(sx * (hand[0] + 70), 1200), m(sx * (hand[0] + 6), 1200)])));
      pic.path('cp-hand', box(sx * hand[0] - 40, hand[1] - 46, sx * hand[0] + 40, hand[1] + 46, 26), { name: `hand-${sx}` });
      const x0 = m(sx * 20, 0)[0], x1 = m(sx * 150, 0)[0], yk = m(0, 400)[1], bottom = opt.box ? opt.box[3] : pic.h;
      const xl = Math.min(x0, x1), xr = Math.max(x0, x1), c: Pt = [(xl + xr) / 2, yk];
      pic.path('cp-body', new Path().M([xl, bottom]).L([xl, yk]).arcTo(c, 90, true).L([xr, bottom]).Z(), { name: `knee-${sx}` });
    }
    pic.facts.push(touches(pic, 'knee-1', 'tyre', 0.6), touches(pic, 'knee--1', 'tyre', 0.6));
    pic.facts.push(flat ? touches(pic, 'hand-1', 'grip-1', 0) : touches(pic, 'hand-1', 'hood-1', 0));
  }
  return { m, yb };
}

/** The guide's flat bar, or the e-bike's display and remote on it: from above, forward up. */
export function flatGuide(kind: 'bar' | 'display'): Pic {
  const pic = new Pic(320, 200);
  const { m, yb } = topView(pic, [160, 160], 0.42, { kind: 'flat', dir: 1, hi: kind === 'bar' ? 'bar' : undefined });
  if (kind === 'bar') {
    pic.label('cp-th', [206, 168], 'flat bar', [208, 164], m(150, yb - 15), undefined, 'leader');
    pic.label('cp-t', [10, 186], 'grip', [12, 182], m(-300, yb - 50), undefined, 'leader-grip');
    pic.facts.push(pointsAt(pic, 'leader', 'bar'), pointsAt(pic, 'leader-grip', 'grip--1'));
  } else {
    // the display over the stem, on a mount at the bar; the remote on the bar inside the left lever
    const d0 = m(-34, yb + 72), d1 = m(34, yb + 4);
    pic.circle('cp-halo', m(0, yb + 38), 52 * 0.42 * 1.4);
    pic.path('cp-hi', rrect(d0[0], d0[1], d1[0] - d0[0], d1[1] - d0[1], 4), { name: 'display' });
    pic.path('cp-fine', rrect(d0[0] + 4, d0[1] + 4, d1[0] - d0[0] - 8, d1[1] - d0[1] - 12, 2));
    const r0 = m(-160, yb + 16), r1 = m(-128, yb - 26);
    pic.circle('cp-halo', m(-144, yb - 5), 22);
    pic.path('cp-hi', rrect(r0[0], r0[1], r1[0] - r0[0], r1[1] - r0[1], 3), { name: 'remote' });
    pic.line('cp-fine', m(-152, yb + 6), m(-136, yb + 6)).line('cp-fine', m(-152, yb - 14), m(-136, yb - 14));
    pic.label('cp-th', [312, 64], 'display', [310, 60], m(34, yb + 50), 'end', 'leader');
    pic.label('cp-th', [10, 186], 'remote', [12, 182], m(-150, yb - 26), undefined, 'leader-remote');
    pic.facts.push(pointsAt(pic, 'leader', 'display'), pointsAt(pic, 'leader-remote', 'remote'), touches(pic, 'remote', 'bar', 0.6), touches(pic, 'display', 'faceplate', 1));
  }
  pic.text('cp-tm', [312, 16], 'Seen from above, forward is up', 'end');
  return pic;
}

/**
 * The guide's flat-bar brake lever: the right end of the bar from above, forward up. The lever's clamp on the bar inside the grip, its
 * body forward to the blade's pivot; the blade runs out over the front of the grip; the shifter beside the clamp, inboard.
 */
export function leverFlat(): Pic {
  const pic = new Pic(320, 200);
  const k = 0.82, o: Pt = [-40, 122], m = (x: number, y: number): Pt => [o[0] + k * x, o[1] - k * y];
  const sweep = (x: number): number => (x <= 100 ? 0 : -(x - 100) * Math.tan(deg(9)));
  const on = (x: number, dy = 0): Pt => m(x, sweep(x) + dy);
  pic.path('cp-obj', ribbon(new Path().M(on(50)).L(on(100)).L(on(340)).parts[0]!, 22.2 * k), { name: 'bar' });
  pic.path('cp-rubber', tube(on(212), on(342), 32 * k), { name: 'grip' });
  pic.path('cp-body', tube(on(146, -18), on(146, 16), 26 * k), { name: 'shifter' });
  pic.path('cp-ctx', new Path().M(on(184, 52)).Q(on(150, 90), on(60, 110)), { style: 'stroke-width:3' });
  const blade = ribbon(new Path().M(on(186, 40)).Q(on(260, 46), on(326, 40)).parts[0]!, 14 * k, 10 * k);
  pic.path('cp-halostroke', blade);
  pic.path('cp-obj', tube(on(182, -14), on(182, 50), 18 * k), { name: 'lever-body' });
  pic.path('cp-hi', blade, { name: 'blade' });
  pic.circle('cp-fine', on(186, 42), 4 * k);
  pic.label('cp-th', [312, 52], 'brake lever', [310, 48], on(300, 46), 'end', 'leader');
  pic.label('cp-t', [312, 166], 'grip', [310, 162], on(330, -14), 'end', 'leader-grip');
  pic.text('cp-tm', [10, 192], 'Right end, from above, forward is up');
  pic.facts.push(pointsAt(pic, 'leader', 'blade'), pointsAt(pic, 'leader-grip', 'grip'), touches(pic, 'lever-body', 'bar', 0.5),
    touches(pic, 'shifter', 'bar', 0.5), touches(pic, 'blade', 'lever-body', 0.5), clear(pic, 'blade', 'grip', 2));
  return pic;
}

/** A panel's card with a band across its top for the badge and the title; the drawing goes below the band (`content`). */
function panel(pic: Pic, x: number, w: number, n: string, title: string): Box {
  pic.path('cp-frame', rrect(x, 3, w, 234, 10));
  pic.path('cp-frame', new Path().M([x, 31]).L([x, 13]).arcTo([x + 10, 13], 0, true).L([x + w - 10, 3]).arcTo([x + w - 10, 13], 90, true).L([x + w, 31]).Z());
  pic.badge([x + 14, 17], n);
  pic.text('cp-t', [x + 27, 21.5], title);
  return [x + 1.5, 32, x + w - 1.5, 235.5];
}

/**
 * The twist test (book p. 40): 1, from above, standing in front of the bike with the wheel between the knees, try to turn the bar: the
 * stem must not turn on the steerer; 2, from the side, press down hard on the hoods (drop bars) or the grips (flat bars): the bar must
 * not roll in the stem's clamp.
 */
export function twistTest(kind: 'drop' | 'flat'): Pic {
  const pic = new Pic(320, 240);
  const flat = kind === 'flat';
  const p1 = panel(pic, 3, 164, '1', 'Turn the bar');
  const k1 = flat ? 0.23 : 0.28, o1: Pt = [80, 86];
  const { m } = topView(pic, o1, k1, { kind, dir: -1, box: p1, rider: true, hi: 'stem', levers: false });
  pic.circle('cp-halo', m(0, 50), 80 * k1);
  pic.turn(o1, 23, -112, -12);
  pic.label('cp-th', [165, 52], 'must not', [163, 48], m(15, 30), 'end', 'leader-1');
  pic.text('cp-th', [165, 72], 'turn', 'end');
  pic.facts.push(pointsAt(pic, 'leader-1', 'stem'));
  // panel 2, from the side
  const p2 = panel(pic, 173, 144, '2', 'Press down');
  pic.ns = 'p2-';
  const k = flat ? 0.85 : 0.55, oo: Pt = flat ? [200, 150] : [207, 128];
  const { B, ring } = frontEnd(pic, oo, k, { hi: 'clamp', box: p2, fork: false, tubes: !flat, endOn: flat });
  const mb = (x: number, y: number): Pt => [B[0] + k * x, B[1] + k * y];
  // the press: a hand on the hood (drop) or the grip (flat), an arrow down onto it
  let press: Pt;
  if (!flat) {
    dropBar(pic, mb, k, null);
    pic.circle('cp-obj', B, R_BAR * k, { name: 'bar-end' });
    pic.path('cp-hand', new Path().M(mb(40, -46)).Q(mb(42, -64), mb(62, -64)).L(mb(92, -62)).Q(mb(108, -60), mb(108, -44)).L(mb(106, -18))
      .Q(mb(104, -10), mb(98, -12)).L(mb(98, -44)).L(mb(44, -44)).Z(), { name: 'hand' });
    press = mb(74, -64);
    pic.facts.push(touches(pic, 'hand', 'hood', 1));
  } else {
    // the bar's near half from the clamp to its end: swept 9° back and 5° up from 100 mm out, so the grip (210 to 340 mm out) sits
    // 17 to 38 mm behind the clamp and 10 to 21 mm above it
    pic.path('cp-obj', tube(mb(0, 0), mb(-38, -21), 22.2 * k), { name: 'bar-half' });
    pic.path('cp-rubber', tube(mb(-15, -9), mb(-42, -23), 32 * k), { name: 'grip' });
    pic.path('cp-hand', new Path().M(mb(-60, -34)).Q(mb(-60, -56), mb(-38, -56)).L(mb(-18, -52)).Q(mb(2, -48), mb(0, -28)).L(mb(-2, -14))
      .Q(mb(-4, -6), mb(-10, -8)).Q(mb(-14, -10), mb(-13, -18)).L(mb(-12, -30)).L(mb(-56, -36)).Z(), { name: 'hand' });
    press = mb(-30, -55.2);
    pic.facts.push(touches(pic, 'hand', 'grip', 1), touches(pic, 'bar-half', 'bar', 0));
  }
  pic.arrow([press[0], press[1] - 26], press);
  if (!flat) {
    pic.label('cp-th', [178, 56], 'must not', [180, 52], ring(18.5, 125), undefined, 'leader-2');
    pic.text('cp-th', [178, 76], 'roll');
  } else {
    pic.label('cp-th', [314, 142], 'must not', [312, 138], ring(18.5, -40), 'end', 'leader-2');
    pic.text('cp-th', [314, 162], 'roll', 'end');
  }
  pic.facts.push(at(pic, 'the press', press, 'hand', 1.5), pointsAt(pic, 'leader-2', flat ? 'faceplate' : 'stem', 1.5));
  return pic;
}

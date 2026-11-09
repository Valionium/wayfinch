// Pieces several drawings share: the millimetre frame, the locator insets (design 3.4), and the wheel cut through at the rim (research
// note R §3.1: beads on the bead seats against the flanges, a dip in the middle; the tyre's outline one circle, its inside a second
// circle round the same centre, so the casing keeps its thickness all round).
import { Path, Pic, pol, poly, rrect, type Pt } from './kit.ts';

/** Millimetres to drawing units: `k` units per mm, (ox, oy) where the drawing's millimetre origin sits. */
export const frame = (ox: number, oy: number, k: number) => {
  const m = (x: number, y: number): Pt => [ox + x * k, oy + y * k];
  return { k, m, mm: (v: number): number => v * k, o: [ox, oy] as Pt };
};
export type Frame = ReturnType<typeof frame>;

/** The locator inset: a 56-unit square at the top left with a small bike, the place marked in blaze. */
export function bikeInset(pic: Pic, mark: 'rear-brake' | 'front-brake' | 'rear-hub' | 'front-hub' | 'front-wheel' | 'rear-wheel', at: Pt = [8, 8]): void {
  const [x, y] = at;
  pic.path('cp-frame', rrect(x, y, 56, 56, 8));
  const rw: Pt = [x + 15, y + 37], fw: Pt = [x + 41, y + 37], r = 10.5, bb: Pt = [x + 27, y + 38];
  const seat: Pt = [x + 23, y + 20], head: Pt = [x + 37, y + 21];
  pic.circle('cp-thin', rw, r).circle('cp-thin', fw, r);
  pic.path('cp-thin', poly([rw, bb, seat, rw], true));
  pic.path('cp-thin', poly([seat, head, bb], false));
  pic.path('cp-thin', poly([head, fw], false));
  pic.path('cp-thin', poly([[x + 21, y + 17], [x + 26, y + 17]], false));
  pic.path('cp-thin', poly([head, [x + 38, y + 16], [x + 42, y + 16]], false));
  const mk = (c: Pt, a0: number, a1: number) => pic.path('cp-hiline', new Path().M(pol(c[0], c[1], r + 0.2, a0)).arcTo(c, a1, true), { style: 'stroke-width:3' });
  if (mark === 'rear-brake') mk(rw, -28, 8);
  if (mark === 'front-brake') mk(fw, -8, 28);
  if (mark === 'rear-wheel') pic.circle('cp-hiline', rw, r, { style: 'stroke-width:2.5' });
  if (mark === 'front-wheel') pic.circle('cp-hiline', fw, r, { style: 'stroke-width:2.5' });
  if (mark === 'rear-hub') pic.circle('cp-hiline', rw, 3, { style: 'stroke-width:2.5' });
  if (mark === 'front-hub') pic.circle('cp-hiline', fw, 3, { style: 'stroke-width:2.5' });
}

/** A rim and tyre cut through, as millimetres: rim outside width `we`, inside `wi`, flange tops at y = 0 (the frame's origin row). */
export type Section = {
  we: number; wi: number; tyre: number; depth: number;
  /** The tyre's circle: centre (0, yc) and outer radius R; inside radius Ri. */
  yc: number; R: number; Ri: number;
};
export const section = (we: number, wi: number, tyre: number, depth: number, wall = 2.6): Section => {
  const R = tyre / 2, yc = -Math.sqrt(R * R - (wi / 2) ** 2);
  return { we, wi, tyre, depth, yc, R, Ri: R - wall };
};

/**
 * Draws the rim (a rim-brake rim: straight braking flanks) and the tyre's casing, cut through; names 'rim', 'tyre', 'flank-l', 'flank-r'
 * (the braking surfaces, 1 to 11 mm down). The tyre's casing ends in feet that sit on the bead seats, inside the flanges.
 */
export function rimAndTyre(pic: Pic, f: Frame, s: Section, o: { flankBand?: boolean; spokes?: number } = {}): void {
  const { m } = f, h = s.we / 2, i = s.wi / 2, seat = 3.2, toe = i - 3.2;
  // Rim: outer faces straight for the braking surface, then tapering to the spoke bed; the well inside with its centre dip.
  const rim = new Path().M(m(-h, 0.6)).L(m(-h, 12)).L(m(-h + 3.2, s.depth - 2)).Q(m(0, s.depth + 1.2), m(h - 3.2, s.depth - 2))
    .L(m(h, 12)).L(m(h, 0.6)).Q(m(h, 0), m(h - 0.6, 0)).L(m(i, 0)).L(m(i, seat)).L(m(toe, seat)).L(m(toe - 2, 6.6)).L(m(-toe + 2, 6.6))
    .L(m(-toe, seat)).L(m(-i, seat)).L(m(-i, 0)).L(m(-h + 0.6, 0)).Q(m(-h, 0), m(-h, 0.6)).Z();
  pic.path('cp-obj', rim, { name: 'rim' });
  // the rim's hollow box, a fine line
  pic.path('cp-fine', new Path().M(m(-h + 1.8, 9)).L(m(h - 1.8, 9)).L(m(h - 1.8, 12)).L(m(h - 4.4, s.depth - 3.4))
    .Q(m(0, s.depth - 1), m(-h + 4.4, s.depth - 3.4)).L(m(-h + 1.8, 12)).Z());
  pic.mark('flank-l', poly([m(-h, 1), m(-h, 11)], false)).mark('flank-r', poly([m(h, 1), m(h, 11)], false));
  if (o.spokes) {
    // two spokes leave the nipple and part towards the hub's two flanges
    const bed = m(0, s.depth + 1.2);
    pic.line('cp-ctx', bed, m(-3.5, s.depth + o.spokes)).line('cp-ctx', bed, m(3.5, s.depth + o.spokes));
  }
  // Tyre: outer circle from flange top to flange top over the crown; down inside the flange to the seat; the foot; up to the inner circle.
  const c = m(0, s.yc);
  const aOut = (Math.asin(i / s.R) * 180) / Math.PI; // angle from straight down where the outer circle meets the flange top
  const yIn = s.yc + Math.sqrt(s.Ri * s.Ri - toe * toe), aIn = (Math.asin(toe / s.Ri) * 180) / Math.PI;
  // arcTo needs its start on the circle: the flange top is on the outer circle by construction (yc comes from wi).
  const tyre = new Path().M(m(-i, 0)).arcTo(c, 180 - aOut, true).L(m(i, seat)).L(m(toe, seat)).L(m(toe, yIn))
    .arcTo(c, 180 + aIn, false).L(m(-toe, seat)).L(m(-i, seat)).Z();
  pic.path('cp-rubber', tyre, { name: 'tyre' });
  if (o.flankBand) {
    pic.path('cp-halo', rrect(...m(-h - 1.6, 0.4), f.mm(1.6), f.mm(11.2), 1));
    pic.path('cp-halo', rrect(...m(h, 0.4), f.mm(1.6), f.mm(11.2), 1));
  }
}

/** Where the tyre is widest, in mm from the centre line, and at which height. */
export const tyreWidest = (s: Section): { x: number; y: number } => ({ x: s.R, y: s.yc });

/** A small round bolt head seen end-on, with its hex key socket. */
export function boltHead(pic: Pic, c: Pt, r: number, o: { cls?: string; name?: string } = {}): void {
  pic.circle(o.cls ?? 'cp-obj', c, r, o.name ? { name: o.name } : {});
  const hex: Pt[] = [];
  for (let a = 0; a < 360; a += 60) hex.push(pol(c[0], c[1], r * 0.45, a + 30));
  pic.path('cp-fine', poly(hex));
}


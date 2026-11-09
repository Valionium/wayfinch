// The drawing (spec sections 3.6 and 7.4): the rider's bike in a 320 x 150 viewBox at 0.11 units per mm, its bags, bottles and
// decks from the plan, and the anchors that place bags, bottles, tags and tap targets. Plain strings, so both pages can use it.
// The outline and wheels are the theme's `line`; the rider's colour is a stroke="#rrggbb" on frame and fork only, over a casing
// 1.5 units wider in `muted`. Bags keep the fill ramp, so how full a bag looks never depends on the frame colour.
import { WB as W } from '../wording/en-bike.ts';
import { casingFor, nearestSwatchName } from './colour.ts';
import type { BagItem, BagView, BikeSpec } from './spec.ts';
import { SIZE_FACTOR, TEMPLATES } from './templates.ts';

export type P = [number, number];
export type Box = { x: number; y: number; w: number; h: number };
/** A rectangle turned by `rot` degrees about its centre. */
export type Placed = Box & { rot: number };
export type Spot = { cx: number; cy: number; rot: number };
export type Circle = { cx: number; cy: number; r: number };
export type Anchors = {
  /** Units per mm: 0.11, less when the bike shrinks to fit. */
  scale: number;
  points: { bb: P; rear: P; front: P; seatTop: P; headTop: P; headBottom: P; saddle: P; bar: P };
  wheels: { rear: Circle; front: Circle };
  tubes: { top: [P, P] | null; low: [P, P] | null; twin: [P, P] | null; shock: [P, P] | null };
  seat: Placed; bar: Placed; top: { front: Placed | null; rear: Placed | null };
  /** The frame bag's four shapes (full, three-quarter, half, wedge) as polygon points, or null where no frame bag fits. */
  frame: { shapes: [string, string, string, string]; boxes: [Box, Box, Box, Box] } | null;
  fork: Placed; rack: Placed; rackTop: Placed; barDeck: Placed; pack: Placed;
  bottles: { st: Spot | null; dt: Spot | null; un: Spot | null };
  /** The seat pack, bar roll and backpack with every bag the plan stacks there: the bag planner's targets are worked out from these. */
  stacks: { seat: Placed; bar: Placed; pack: Placed };
};
export type ArtOptions = { theme?: 'dark' | 'light'; idPrefix?: string };

const VIEW_W = 320;
const VIEW_H = 150;
const MM = 0.11;
const GROUND = 139;
const TYPE_WORD = { road: W.bikeTypeRoad, gravel: W.bikeTypeGravel, touring: W.bikeTypeTouring, trekking: W.bikeTypeTrekking, mtb: W.bikeTypeMtb, fat: W.bikeTypeFat };

// ---- small geometry ----
const r2 = (n: number): number => Math.round(n * 100) / 100;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const len = (a: P): number => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const deg = (rad: number): number => (rad * 180) / Math.PI;
const pt = (p: P): string => `${r2(p[0])} ${r2(p[1])}`;
const quad = (a: P, c: P, b: P, t: number): P => add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t));
const quadDir = (a: P, c: P, b: P, t: number): P => unit(add(mul(sub(c, a), 2 * (1 - t)), mul(sub(b, c), 2 * t)));

/** The bag planner's fill ramp: room to spare reads green, filling up amber, packed to the brim red. */
const RAMPS = {
  dark: [[0, [168, 192, 122]], [0.55, [229, 177, 69]], [1, [224, 68, 40]]],
  light: [[0, [107, 143, 58]], [0.55, [192, 130, 20]], [1, [194, 52, 27]]],
} as const;
const FILLS = new Map<string, string>();
export function fillColour(pct: number, theme: 'dark' | 'light' = 'dark'): string {
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  const key = theme + p;
  const known = FILLS.get(key);
  if (known) return known;
  const ramp = RAMPS[theme];
  let out = `rgb(${ramp[ramp.length - 1]![1].join(',')})`;
  for (let i = 1; i < ramp.length; i += 1) {
    const lo = ramp[i - 1]!;
    const hi = ramp[i]!;
    if (p <= hi[0]) {
      const t = (p - lo[0]) / (hi[0] - lo[0]);
      const c = (j: number) => Math.round(lo[1][j]! + (hi[1][j]! - lo[1][j]!) * t);
      out = `rgb(${c(0)},${c(1)},${c(2)})`;
      break;
    }
  }
  FILLS.set(key, out);
  return out;
}

/** Sutherland–Hodgman against one half-plane: keeps the points where `side` is at most 0. */
function clip(poly: P[], side: (p: P) => number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) out.push(lerp(a, b, sa / (sa - sb)));
  }
  return out;
}

/** A convex polygon (clockwise on screen) moved in by `d` on every side. */
function inset(poly: P[], d: number): P[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const u = unit(sub(b, a));
    const normal: P = [-u[1], u[0]];
    return { a: add(a, mul(normal, d)), u };
  });
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n]!;
    const cross = m.u[0] * l.u[1] - m.u[1] * l.u[0];
    if (Math.abs(cross) < 1e-9) return l.a;
    const t = ((l.a[0] - m.a[0]) * l.u[1] - (l.a[1] - m.a[1]) * l.u[0]) / cross;
    return add(m.a, mul(m.u, t));
  });
}

/** Clockwise on screen (y down): the signed area is positive. */
function clockwise(poly: P[]): P[] {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s >= 0 ? poly : [...poly].reverse();
}

export function boxOf(pts: P[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const corners = (b: Placed): P[] => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const a = (b.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = (x: number, y: number): P => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  return [at(b.x, b.y), at(b.x + b.w, b.y), at(b.x + b.w, b.y + b.h), at(b.x, b.y + b.h)];
};
/** Keeps a box inside the viewBox by moving it, never by changing its size. */
export function inside(b: Placed, margin = 1): Placed {
  const c = boxOf(corners(b));
  const dx = c.x < margin ? margin - c.x : c.x + c.w > VIEW_W - margin ? VIEW_W - margin - c.x - c.w : 0;
  const dy = c.y < margin ? margin - c.y : c.y + c.h > VIEW_H - margin ? VIEW_H - margin - c.y - c.h : 0;
  return { ...b, x: b.x + dx, y: b.y + dy };
}

// ---- the bike's geometry ----
type Geometry = ReturnType<typeof geometry>;

function geometry(spec: BikeSpec) {
  const t = TEMPLATES[spec.style.value];
  const f = SIZE_FACTOR[spec.size.value];
  const pts = spec.points.value;
  const rr = spec.rimMm.value / 2 + spec.rearMm.value;
  const rf = spec.rimMm.value / 2 + spec.frontMm.value;
  // Wide tyres need longer stays and more fork: the axles move out, never into the frame.
  const designed = 360;
  const rearMm: P = [pts.rear[0] - Math.max(0, rr - designed) * 0.9, pts.rear[1]];
  const groundMm = rearMm[1] - rr;
  const frontMm: P = [pts.front[0] + Math.max(0, rf - designed) * 0.6, groundMm + rf];
  const ha = (t.headDeg * Math.PI) / 180;
  const headDir: P = [Math.cos(ha), -Math.sin(ha)];
  const headLen = t.headMm * f;
  const headTop: P = [pts.headTop[0], pts.headTop[1]];
  const headBottom = add(headTop, mul(headDir, headLen));
  const seatTop: P = [pts.seatTop[0], pts.seatTop[1]];
  const seatDir = unit(seatTop);
  const saddle = mul(seatDir, t.saddleMm * f);
  const steerTop = add(headTop, mul(headDir, -32));
  const sa = (t.stemDeg * Math.PI) / 180;
  const clampMm = add(steerTop, [Math.cos(sa) * t.stemMm, Math.sin(sa) * t.stemMm]);
  const bars = spec.bars.value;
  const barPts: P[] = bars === 'drop'
    ? [[0, 0], [70, -2], [118, -4], [128, -68], [98, -104], [82, -122], [52, -126], [34, -118]]
    : bars === 'flat' ? [[0, 0], [-18, 22], [-52, 26]]
    : [[0, 0], [14, 55], [-60, 72], [-140, 52]];
  const barMm = barPts.map((p) => add(clampMm, p));
  const ext = [
    [rearMm[0] - rr, groundMm], [frontMm[0] + rf, groundMm], add(saddle, [-150, 40]), add(saddle, [130, 40]), ...barMm.map((p) => add(p, [0, 12])),
    add(headTop, [0, 20]),
  ] as P[];
  const minX = Math.min(...ext.map((p) => p[0]));
  const maxX = Math.max(...ext.map((p) => p[0]));
  const maxY = Math.max(...ext.map((p) => p[1]));
  // The room the bike may take: right of the backpack, under the bags that sit above the saddle and the bar.
  const s = Math.min(1, 264 / ((maxX - minX) * MM), (GROUND - 22) / ((maxY - groundMm) * MM));
  const k = s === 1 ? MM : MM * s;
  const width = (maxX - minX) * k;
  const centre = Math.min(VIEW_W - 6 - width / 2, Math.max(153.5, 48 + width / 2));
  const ox = centre - ((minX + maxX) / 2) * k;
  const oy = GROUND + groundMm * k;
  const T = (p: P): P => [ox + p[0] * k, oy - p[1] * k];
  return {
    t, f, k, T, rr: rr * k, rf: rf * k, rimR: (spec.rimMm.value / 2) * k,
    bb: T([0, 0]), rear: T(rearMm), front: T(frontMm), headTop: T(headTop), headBottom: T(headBottom), seatTop: T(seatTop),
    headAt: (share: number): P => T(add(headTop, mul(headDir, share * headLen))),
    saddle: T(saddle), steerTop: T(steerTop), clamp: T(clampMm), bar: barMm.map(T), bars,
    seatAt: (share: number): P => T(mul(seatTop, share)),
  };
}

/** The tubes, each a line or a quadratic curve, in drawing units. */
type Tube = { a: P; b: P; c?: P };
const tubeAt = (tb: Tube, s: number): P => (tb.c ? quad(tb.a, tb.c, tb.b, s) : lerp(tb.a, tb.b, s));
const tubeDir = (tb: Tube, s: number): P => (tb.c ? quadDir(tb.a, tb.c, tb.b, s) : unit(sub(tb.b, tb.a)));
const tubeD = (tb: Tube): string => (tb.c ? `M${pt(tb.a)} Q${pt(tb.c)} ${pt(tb.b)}` : `M${pt(tb.a)} L${pt(tb.b)}`);

function frameOf(g: Geometry) {
  const t = g.t;
  const seat: Tube = { a: g.bb, b: g.seatTop };
  const head: Tube = { a: g.headTop, b: g.headBottom };
  const join = g.headAt(t.topJoin);
  let top: Tube | null = { a: g.seatTop, b: join };
  let low: Tube | null = null;
  let twin: Tube | null = null;
  let down: Tube = { a: g.bb, b: g.headBottom };
  if (t.low) { top = null; low = { a: g.seatAt(t.low[0]), b: g.headAt(t.low[1]) }; }
  if (t.twin) { top = null; twin = { a: g.headAt(t.topJoin), b: g.rear }; }
  if (t.step !== undefined) {
    top = null;
    const from = g.headAt(0.55);
    down = { a: g.bb, b: from, c: [g.bb[0] + (from[0] - g.bb[0]) * 0.45, g.bb[1] + 4] };
  }
  const stayTop = lerp(g.bb, g.seatTop, 0.94);
  let shock: [P, P] | null = null;
  let rocker: P | null = null;
  if (t.shock) {
    rocker = lerp(g.bb, g.seatTop, 0.6);
    shock = [add(rocker, mul(unit(sub(join, g.seatTop)), 4)), tubeAt(down, 0.36)];
  }
  const chainStay: Tube = { a: t.shock ? add(g.bb, [3, -4]) : g.bb, b: g.rear };
  const seatStay: Tube = { a: g.rear, b: rocker ?? stayTop };
  return { seat, head, top, low, twin, down, chainStay, seatStay, shock, join };
}

// ---- markup pieces ----
const attr = (name: string, value: number | string): string => ` ${name}="${typeof value === 'number' ? r2(value) : value}"`;
const path = (cls: string, d: string, sw: number, extra = ''): string => `<path class="${cls}" d="${d}"${attr('stroke-width', sw)}${extra}/>`;
const circle = (cls: string, c: P, r: number, sw: number | null = null): string =>
  `<circle class="${cls}"${attr('cx', c[0])}${attr('cy', c[1])}${attr('r', Math.max(0.1, r))}${sw === null ? '' : attr('stroke-width', sw)}/>`;

function painted(cls: string, d: string, sw: number, colour: string | null): string {
  if (!colour) return path(cls, d, sw);
  return path('bk-casing', d, sw + 1.5) + `<path class="bk-paint ${cls}" d="${d}"${attr('stroke-width', sw)} stroke="${colour}" fill="none"/>`;
}

function wheel(c: P, outer: number, rim: number, widthUnits: number): string {
  const sw = Math.max(1.2, widthUnits);
  return circle('bk-tyre', c, outer - sw / 2, sw) + circle('bk-rim', c, rim, 1);
}

/** 16 spokes from the hub flange to the rim, angles worked out once. */
const SPOKE_TURNS = [0.1, 0.3].map((turn) => Array.from({ length: 16 }, (_, i) => {
  const a = turn + (i * 2 * Math.PI) / 16;
  return [Math.cos(a), Math.sin(a), Math.cos(a + 0.35) * 2, Math.sin(a + 0.35) * 2] as const;
}));
const SPOKES = new Map<string, string>();
function spokes(c: P, rim: number, which: 0 | 1): string {
  const key = `${which}${c[0]},${c[1]},${rim}`;
  const known = SPOKES.get(key);
  if (known !== undefined) return known;
  if (SPOKES.size > 24) SPOKES.clear();
  let d = '';
  for (const t of SPOKE_TURNS[which]!) d += `${d ? ' ' : ''}M${r2(c[0] + t[2])} ${r2(c[1] + t[3])} L${r2(c[0] + t[0] * rim)} ${r2(c[1] + t[1] * rim)}`;
  SPOKES.set(key, d);
  return d;
}

// ---- the bike ----
function bikeParts(spec: BikeSpec, g: Geometry, fr: ReturnType<typeof frameOf>): string[] {
  const k = g.k / MM; // 1 at full scale
  const colour = spec.colour.value;
  const out: string[] = [];
  const wr = spec.rearMm.value * g.k;
  const wf = spec.frontMm.value * g.k;
  out.push(wheel(g.rear, g.rr, g.rimR, wr), wheel(g.front, g.rf, g.rimR, wf));
  out.push(path('bk-spokes', `${spokes(g.rear, g.rimR, 0)} ${spokes(g.front, g.rimR, 1)}`, 0.45));
  // Rack, behind the wheel's near side.
  if (spec.rack.value) {
    const y = g.rear[1] - g.rr - 3;
    const x0 = g.rear[0] - 13;
    const x1 = fr.seatStay.b[0] - 6;
    const leg = add(g.rear, [-6, -1]);
    const strut = lerp(g.rear, fr.seatStay.b, 0.82);
    out.push(path('bk-rack', `M${pt([x0, y])} L${pt([x1, y])} M${pt([x0 + 6, y])} L${pt(leg)} M${pt([x1 - 3, y])} L${pt(strut)}`, 1.3 * k));
  }
  // Drive: cog or hub gear, chain or belt, the derailleur.
  const ring = 9.6 * k;
  const drive = spec.drive.value;
  const cog = (drive === 'belt' ? 6 : drive === 'hub' ? 3.2 : 4.2) * k;
  const pulley = add(g.rear, [0.5 * k, 10.5 * k]);
  const lowerChain = drive === 'derailleur'
    ? `M${pt(add(g.bb, [0, ring]))} L${pt(pulley)} L${pt(add(g.rear, [0, cog]))}`
    : `M${pt(add(g.bb, [0, ring]))} L${pt(add(g.rear, [0, cog]))}`;
  out.push(path(drive === 'belt' ? 'bk-belt' : 'bk-chain', `M${pt(add(g.bb, [0, -ring]))} L${pt(add(g.rear, [0, -cog]))} ${lowerChain}`, (drive === 'belt' ? 1.6 : 0.9) * k));
  out.push(circle(drive === 'hub' ? 'bk-hubgear' : 'bk-cog', g.rear, cog, (drive === 'hub' ? 2.2 : 1) * k));
  if (drive === 'derailleur') out.push(path('bk-mech', `M${pt(g.rear)} L${pt(add(g.rear, [-1.6 * k, 5 * k]))} L${pt(pulley)} L${pt(add(g.rear, [-2.6 * k, 9.2 * k]))}`, 1.1 * k));
  // Brakes.
  if (spec.brakes.value === 'disc') {
    out.push(circle('bk-rotor', g.rear, 8.4 * k, 0.9 * k), circle('bk-rotor', g.front, 8.8 * k, 0.9 * k));
    const fc = add(g.front, mul(unit(sub(g.headBottom, g.front)), 7.6 * k));
    const rc = add(g.rear, mul(unit(sub(fr.chainStay.a, g.rear)), 7.2 * k));
    out.push(path('bk-caliper', `M${pt(add(fc, [-1.4 * k, -1 * k]))} L${pt(add(fc, [1.4 * k, 1 * k]))} M${pt(add(rc, [0, -1.6 * k]))} L${pt(add(rc, [0, 1.6 * k]))}`, 2.2 * k));
  } else if (spec.brakes.value === 'rim') {
    const fTop = add(g.front, [0, -g.rimR]);
    const rTop = add(g.rear, [0, -g.rimR]);
    out.push(path('bk-caliper', `M${pt(add(fTop, [-1.6 * k, -0.6 * k]))} L${pt(add(fTop, [1.4 * k, 0.4 * k]))} M${pt(add(rTop, [-1.4 * k, 0.4 * k]))} L${pt(add(rTop, [1.6 * k, -0.6 * k]))}`, 1.6 * k));
  }
  out.push(circle('bk-hub', g.rear, 1.6 * k), circle('bk-hub', g.front, 1.6 * k));
  // Frame: stays, then the main tubes, then the fork, each with the rider's colour over its casing.
  const stays = [tubeD(fr.chainStay), tubeD(fr.seatStay), fr.twin ? tubeD(fr.twin) : ''].filter(Boolean).join(' ');
  out.push(painted('bk-stays', stays, 2.1 * k, colour));
  const main = [tubeD(fr.seat), fr.top ? tubeD(fr.top) : '', fr.low ? tubeD(fr.low) : '', tubeD(fr.down)].filter(Boolean).join(' ');
  out.push(painted('bk-frame', main, 3 * k, colour));
  out.push(painted('bk-frame', tubeD(fr.head), 4.4 * k, colour));
  if (fr.shock) out.push(path('bk-shock', `M${pt(fr.shock[0])} L${pt(fr.shock[1])}`, 3.4 * k));
  if (spec.ebike.value) {
    const c = tubeAt(fr.down, 0.5);
    const dir = tubeDir(fr.down, 0.5);
    const up: P = [dir[1], -dir[0]];
    const centre = add(c, mul(up, 3.3 * k));
    const [w, h] = [38 * k, 5.6 * k];
    out.push(`<rect class="bk-battery"${attr('x', centre[0] - w / 2)}${attr('y', centre[1] - h / 2)}${attr('width', w)}${attr('height', h)}${attr('rx', 2.2 * k)} transform="rotate(${r2(deg(Math.atan2(dir[1], dir[0])))} ${r2(centre[0])} ${r2(centre[1])})"/>`);
    out.push(`<rect class="bk-motor"${attr('x', g.bb[0] - 5 * k)}${attr('y', g.bb[1] - 4.6 * k)}${attr('width', 12.5 * k)}${attr('height', 10.5 * k)}${attr('rx', 3 * k)}/>`);
  }
  const forkD = spec.fork.value === 'suspension'
    ? `M${pt(g.headBottom)} L${pt(g.front)}`
    : `M${pt(g.headBottom)} Q${pt(add(g.headBottom, mul(sub(g.front, g.headBottom), 0.78)))} ${pt(g.front)}`;
  out.push(painted('bk-fork', forkD, (spec.fork.value === 'suspension' ? 4.2 : 2.6) * k, colour));
  if (spec.fork.value === 'suspension') {
    const seal = lerp(g.headBottom, g.front, 0.48);
    const across = mul(unit([-(g.front[1] - g.headBottom[1]), g.front[0] - g.headBottom[0]]), 2.6 * k);
    out.push(path('bk-seal', `M${pt(add(seal, across))} L${pt(sub(seal, across))}`, 1.4 * k));
  }
  // Chainring, crank and pedal, the bottom bracket.
  out.push(circle('bk-ring', g.bb, ring, 1.2 * k));
  const pedal = add(g.bb, [11 * k, 14.5 * k]);
  out.push(path('bk-crank', `M${pt(g.bb)} L${pt(pedal)} M${pt(add(pedal, [-4.2 * k, 0]))} L${pt(add(pedal, [4.2 * k, 0]))}`, 1.8 * k));
  out.push(circle('bk-bb', g.bb, 3 * k));
  // Seat post and saddle.
  out.push(path('bk-post', `M${pt(lerp(g.bb, g.seatTop, 0.96))} L${pt(g.saddle)}`, 2 * k));
  const s = g.saddle;
  const sv = (x: number, y: number): P => add(s, [x * k, y * k]);
  out.push(`<path class="bk-saddle" d="M${pt(sv(-15.5, -3))} Q${pt(sv(-15, -6.6))} ${pt(sv(-8, -6))} L${pt(sv(9, -4.4))} Q${pt(sv(14.6, -4))} ${pt(sv(13.6, -1.8))} L${pt(sv(-1.5, -0.6))} Q${pt(sv(-11.5, 0))} ${pt(sv(-15.5, -3))} Z"/>`);
  // Stem and bars, and the hoods on drop bars.
  const b = g.bar;
  const stem = `M${pt(g.headTop)} L${pt(g.steerTop)} L${pt(g.clamp)}`;
  const barD = g.bars === 'drop'
    ? `M${pt(b[0]!)} L${pt(b[1]!)} C${pt(b[2]!)} ${pt(b[3]!)} ${pt(b[4]!)} C${pt(b[5]!)} ${pt(b[6]!)} ${pt(b[7]!)}`
    : g.bars === 'flat' ? `M${pt(b[0]!)} L${pt(b[1]!)}` : `M${pt(b[0]!)} C${pt(b[1]!)} ${pt(b[2]!)} ${pt(b[3]!)}`;
  out.push(path('bk-bar', `${stem} ${barD}`, 2.1 * k));
  if (g.bars === 'drop') {
    const h = b[1]!;
    out.push(`<path class="bk-hood" d="M${pt(add(h, [-1.2 * k, 0.2 * k]))} Q${pt(add(h, [1.8 * k, -4.2 * k]))} ${pt(add(h, [4.6 * k, -2.2 * k]))} L${pt(add(h, [4.4 * k, 1.2 * k]))} Z"/>`);
  } else {
    const end = b[b.length - 1]!;
    out.push(path('bk-grip', `M${pt(end)} L${pt(add(end, [(g.bars === 'flat' ? 3.4 : 2.6) * k, 0]))}`, 3.2 * k));
  }
  return out;
}

// ---- anchors ----
function anchorsOf(spec: BikeSpec, g: Geometry, fr: ReturnType<typeof frameOf>, counts: Record<string, number>): Anchors {
  // The seat pack hangs behind the saddle, over the rear wheel, its front just under the saddle's tail, as in the bag planner today.
  const saddleTail = add(g.saddle, [-15.5 * (g.k / MM), 0]);
  const seat = inside({ x: saddleTail[0] + 4 - 46, y: g.saddle[1] + 1.2, w: 46, h: 17, rot: 0 });
  // A handlebar bag is strapped to the bars and hangs in front of them, over the head tube; never down onto the front tyre.
  const tyreTop = g.front[1] - g.rf;
  const barH = Math.max(10, Math.min(18, tyreTop - 1 - (g.clamp[1] - 4)));
  const bar = inside({ x: g.clamp[0] - 4, y: Math.min(g.clamp[1] - 4, tyreTop - 1 - barH), w: 30, h: barH, rot: 0 });
  // The deck rides beside the bag, in front of it, as before; never down onto the tyre either.
  const barDeck = inside({ x: bar.x + bar.w + 1, y: Math.min(bar.y + 1, tyreTop - 17), w: 13, h: 16, rot: 0 });
  // The top tube (or the tube that stands in for it) takes two bags at set fractions.
  const topTube: Tube | null = spec.mounts.top ? fr.top ?? fr.low ?? (fr.twin ? { a: lerp(fr.twin.a, fr.twin.b, 0.62), b: fr.twin.a } : null) : null;
  let topFront: Placed | null = null;
  let topRear: Placed | null = null;
  if (topTube) {
    const [a, b] = topTube.b[0] > topTube.a[0] ? [topTube.a, topTube.b] : [topTube.b, topTube.a];
    const u = unit(sub(b, a));
    const L = len(sub(b, a));
    const w = Math.min(25, L * 0.42);
    const up: P = [u[1], -u[0]];
    const place = (share: number): Placed => {
      const c = add(lerp(a, b, share), mul(up, 6.8));
      return { x: c[0] - w / 2, y: c[1] - 5, w, h: 10, rot: deg(Math.atan2(u[1], u[0])) };
    };
    topRear = place(0.27);
    topFront = place(0.73);
  }
  // The frame bag follows the triangle: the space inside the tubes, cut lower for the smaller shapes.
  let frame: Anchors['frame'] = null;
  if (spec.mounts.frame) {
    const upper = fr.top ?? fr.low ?? (fr.twin ? { a: lerp(fr.twin.a, fr.twin.b, 0.5), b: fr.twin.a } : null);
    if (upper) {
      const [ua, ub] = upper.b[0] > upper.a[0] ? [upper.a, upper.b] : [upper.b, upper.a];
      const seatPoint = fr.low ? fr.low.a : fr.twin ? crossSeat(fr, ua) : g.seatTop;
      const quadPts = clockwise([seatPoint, ub, fr.down.b, g.bb]);
      const inner = inset(quadPts, 3.4 * (g.k / MM) + 0.6);
      const u = unit(sub(ub, seatPoint));
      const normal: P = [-u[1], u[0]];
      const depth = Math.max(...inner.map((p) => (p[0] - seatPoint[0]) * normal[0] + (p[1] - seatPoint[1]) * normal[1]));
      const below = (share: number) => (p: P) => (p[0] - seatPoint[0]) * normal[0] + (p[1] - seatPoint[1]) * normal[1] - depth * share;
      const along = (p: P) => (p[0] - seatPoint[0]) * u[0] + (p[1] - seatPoint[1]) * u[1];
      const reach = Math.max(...inner.map(along));
      const full = inner;
      const three = clip(inner, below(0.55));
      const half = clip(inner, below(0.36));
      const wedge = clip(clip(inner, (p) => reach * 0.5 - along(p)), below(0.62));
      const shapes = [full, three, half, wedge].map((s) => (s.length >= 3 ? s : inner));
      frame = {
        shapes: shapes.map((s) => s.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ')) as [string, string, string, string],
        boxes: shapes.map(boxOf) as [Box, Box, Box, Box],
      };
    }
  }
  const forkMid = lerp(g.headBottom, g.front, 0.5);
  const forkU = unit(sub(g.front, g.headBottom));
  const fork = inside({ x: forkMid[0] - 6 + forkU[1] * -1.5, y: forkMid[1] - 11, w: 12, h: 22, rot: deg(Math.atan2(forkU[1], forkU[0])) - 90 });
  const rackY = g.rear[1] - g.rr - 3;
  // Panniers hang from the rack rail on their hooks (owner, 8 Nov 2026), beside the wheel, their feet above the axle, the far one too.
  const rack = inside({ x: g.rear[0] - 21, y: rackY + 2.6, w: 46, h: Math.min(33, g.rr - 2.6), rot: 0 });
  const rackTop = inside({ x: g.rear[0] - 22, y: rackY - 6.6, w: 48, h: 6, rot: 0 });
  const pack = { x: 8, y: 24, w: 29, h: 34, rot: 0 };
  // Bottles at the bolts that exist, turned to the tube.
  const spot = (tb: Tube, share: number, side: 1 | -1): Spot => {
    const c = tubeAt(tb, share);
    const d = tubeDir(tb, share);
    const n: P = [d[1] * side, -d[0] * side];
    const p = add(c, mul(n, 7.2));
    return { cx: p[0], cy: p[1], rot: deg(Math.atan2(d[0], -d[1])) };
  };
  const seatInside: 1 | -1 = -1;
  const bottles = {
    st: spec.mounts.st ? spot(fr.seat, 0.42, seatInside) : null,
    dt: spec.mounts.dt ? spot(fr.down, fr.down.c ? 0.5 : 0.4, 1) : null,
    un: spec.mounts.un ? spot(fr.down, fr.down.c ? 0.32 : 0.36, -1) : null,
  };
  if (bottles.st) bottles.st = { ...bottles.st, rot: bottles.st.rot };
  const stack = (b: Placed, n: number, gap: number): Placed => {
    if (n <= 1) return b;
    const step = Math.min(b.h + gap, Math.max(4, (b.y - 1) / (n - 1)));
    return { ...b, y: b.y - step * (n - 1), h: b.h + step * (n - 1) };
  };
  const seatAll = stack(seat, counts.seat ?? 1, 2);
  const barAll = stack(bar, counts.bar ?? 1, 2);
  const packAll = { ...pack, h: pack.h + 37 * Math.max(0, (counts.pack ?? 1) - 1) };
  return {
    scale: g.k,
    points: { bb: g.bb, rear: g.rear, front: g.front, seatTop: g.seatTop, headTop: g.headTop, headBottom: g.headBottom, saddle: g.saddle, bar: g.clamp },
    wheels: { rear: { cx: g.rear[0], cy: g.rear[1], r: g.rr }, front: { cx: g.front[0], cy: g.front[1], r: g.rf } },
    tubes: {
      top: fr.top ? [fr.top.a, fr.top.b] : null, low: fr.low ? [fr.low.a, fr.low.b] : null, twin: fr.twin ? [fr.twin.a, fr.twin.b] : null, shock: fr.shock,
    },
    seat, bar, top: { front: topFront, rear: topRear }, frame, fork, rack, rackTop, barDeck, pack, bottles,
    stacks: { seat: seatAll, bar: barAll, pack: packAll },
  };
}

/** Where a mixte's twin tubes cross the seat tube. */
function crossSeat(fr: ReturnType<typeof frameOf>, fallback: P): P {
  if (!fr.twin) return fallback;
  const [p, r] = [fr.seat.a, sub(fr.seat.b, fr.seat.a)];
  const [q, s] = [fr.twin.a, sub(fr.twin.b, fr.twin.a)];
  const cross = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(cross) < 1e-9) return fallback;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross;
  return t > 0 && t < 1.2 ? add(p, mul(r, Math.min(1, t))) : fallback;
}

// ---- bags ----
function bagsArt(view: BagView, a: Anchors, theme: 'dark' | 'light', prefix: string): { defs: string[]; art: string[] } {
  const defs: string[] = [];
  const art: string[] = [];
  let n = 0;
  const rot = (p: Placed) => (p.rot ? ` transform="rotate(${r2(p.rot)} ${r2(p.x + p.w / 2)} ${r2(p.y + p.h / 2)})"` : '');
  // A rectangle's fill is a path that keeps the shell's rounded bottom: no clip path, so a drawing full of bags stays light.
  const shellRect = (cls: string, p: Placed, pct: number, rx: number) => {
    const fh = Math.max(0, p.h * Math.max(0, Math.min(1, pct)));
    const r = Math.min(rx, p.w / 2, p.h / 2);
    const x0 = r2(p.x);
    const x1 = r2(p.x + p.w);
    const y1 = r2(p.y + p.h);
    const top = r2(p.y + p.h - fh);
    const bend = r2(p.y + p.h - Math.min(r, fh));
    const fill = fh <= 0 ? '' : `<path class="bk-fill" fill="${fillColour(pct, theme)}" d="M${x0} ${top} L${x1} ${top} L${x1} ${bend} Q${x1} ${y1} ${r2(p.x + p.w - r)} ${y1} L${r2(p.x + r)} ${y1} Q${x0} ${y1} ${x0} ${bend} Z"/>`;
    art.push(`<g class="${cls}"${rot(p)}><rect class="bk-shell"${attr('x', p.x)}${attr('y', p.y)}${attr('width', p.w)}${attr('height', p.h)}${attr('rx', r)}/>${fill}</g>`);
  };
  const shellPoly = (pts: string, box: Box, pct: number) => {
    const id = `${prefix}c${n++}`;
    const fh = Math.max(0, box.h * Math.max(0, Math.min(1, pct)));
    defs.push(`<clipPath id="${id}"><polygon points="${pts}"/></clipPath>`);
    art.push(`<g class="bk-bag"><polygon class="bk-shell" points="${pts}"/><rect class="bk-fill" fill="${fillColour(pct, theme)}" clip-path="url(#${id})"${attr('x', box.x)}${attr('y', box.y + box.h - fh)}${attr('width', box.w)}${attr('height', fh)}/></g>`);
  };
  const fills = (item: BagItem): number[] => {
    const f = item.fill;
    const list = Array.isArray(f) ? (f as number[]) : [f as number];
    return (item.pair ? [list[0] ?? 0, list[1] ?? list[0] ?? 0] : [list[0] ?? 0]).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
  };
  const of = (pos: string) => view.items.filter((i) => i.pos === pos);
  const pairs = (pos: string, base: Placed, off: P, rx: number) => {
    for (const item of of(pos)) {
      const both = fills(item);
      const first = both[0];
      const second = both[1];
      if (second !== undefined) shellRect('bk-bag', { ...base, x: base.x + off[0], y: base.y + off[1] }, first!, rx);
      shellRect('bk-bag', base, second ?? first!, rx);
    }
  };
  const stacked = (pos: string, base: Placed, gap: number, rx: number, cls = 'bk-bag') => {
    const items = of(pos);
    const step = items.length > 1 ? Math.min(base.h + gap, Math.max(4, (base.y - 1) / (items.length - 1))) : 0;
    items.forEach((item, i) => shellRect(cls, inside({ ...base, y: base.y - i * step }), fills(item)[0]!, rx));
  };
  // Back to front: panniers and the rack-top deck, the bottles inside the triangle, the frame bag (in front of them, as on the bike),
  // top-tube bags, seat pack, bar roll, fork bags, decks, the bottle under the down tube, backpack.
  pairs('rack', a.rack, [-6, 1.5], 2);
  if (view.decks.rack !== null) deck(art, a.rackTop, view.decks.rack);
  const bottlesOf = (inTriangle: boolean) => {
    for (const b of view.bottles) {
      const s = a.bottles[b.slot];
      if (s && (b.slot !== 'un') === inTriangle) art.push(bottleArt(s, b.L));
    }
  };
  bottlesOf(true);
  const frameItem = of('frame')[0];
  if (frameItem && a.frame) {
    const shape = Math.max(0, Math.min(3, Math.round(frameItem.shape ?? 0)));
    shellPoly(a.frame.shapes[shape]!, a.frame.boxes[shape]!, fills(frameItem)[0]!);
  }
  const tops = of('top');
  tops.forEach((item, i) => {
    const slot = item.slot ?? (i === 0 ? 'front' : 'rear');
    const p = slot === 'rear' ? a.top.rear : a.top.front;
    if (p) shellRect('bk-bag', p, fills(item)[0]!, 2);
  });
  stacked('seat', a.seat, 2, 4);
  stacked('bar', a.bar, 2, 3);
  pairs('fork', a.fork, [-5, -5], 2);
  if (view.decks.bar !== null) deck(art, a.barDeck, view.decks.bar);
  bottlesOf(false);
  stacked('pack', { ...a.pack, y: a.pack.y + 37 * Math.max(0, of('pack').length - 1) }, 3, 5, 'bk-bag bk-onbody');
  return { defs, art };
}

export function deck(art: string[], d: Placed, state: 'empty' | 'loaded'): void {
  art.push(`<g class="bk-deck${state === 'empty' ? ' bk-empty' : ''}"><rect class="bk-shell"${attr('x', d.x)}${attr('y', d.y)}${attr('width', d.w)}${attr('height', d.h)} rx="1.5"/>`
    + `<path class="bk-strap" d="M${pt([d.x - 2, d.y + d.h * 0.34])} L${pt([d.x + d.w + 2, d.y + d.h * 0.34])} M${pt([d.x - 2, d.y + d.h * 0.72])} L${pt([d.x + d.w + 2, d.y + d.h * 0.72])}"/></g>`);
}

/** The bag planner's bottle: real bottles grow mostly in height (0.5 L about 21 cm, 0.75 L 25 cm, 1 L 27 cm). */
export function bottleArt(spot: Spot, litres: number): string {
  const r = (Number.isFinite(litres) && litres > 0 ? litres : 0.75) / 0.75;
  const h = 30 * Math.min(1.16, Math.max(0.78, r ** 0.45));
  const w = 9.6 * Math.min(1.08, Math.max(0.9, r ** 0.15));
  const [x, y] = [spot.cx - w / 2, spot.cy - h / 2];
  return `<g class="bk-bottle" transform="rotate(${r2(spot.rot)} ${r2(spot.cx)} ${r2(spot.cy)})">`
    + `<rect class="bk-cage"${attr('x', x - 2.2)}${attr('y', y + h * 0.13)}${attr('width', w + 4.4)}${attr('height', h * 0.7)} rx="2.5"/>`
    + `<rect class="bk-water"${attr('x', x)}${attr('y', y)}${attr('width', w)}${attr('height', h)} rx="3.5"/>`
    + `<rect class="bk-cap"${attr('x', x + w * 0.28)}${attr('y', y - 2.5)}${attr('width', w * 0.44)} height="3.5" rx="1"/></g>`;
}

// ---- the label ----
function wheelWord(rim: number, widest: number): string {
  if (rim === 622) return widest >= 50 ? '29' : '700';
  if (rim === 584) return widest >= 50 ? '27.5' : '650B';
  if (rim === 571) return '650C';
  if (rim === 559) return '26';
  return `${rim === 507 ? 24 : 20}-inch`;
}

export function labelOf(spec: BikeSpec): string {
  const parts = [W.bikeKind(TYPE_WORD[spec.type.value], spec.ebike.value)];
  const [f, r] = [Math.round(spec.frontMm.value), Math.round(spec.rearMm.value)];
  const wheelName = wheelWord(spec.rimMm.value, Math.max(f, r));
  parts.push(f === r ? W.bikeTyres(wheelName, String(f)) : W.bikeTyresTwo(wheelName, String(f), String(r)));
  parts.push(spec.bars.value === 'drop' ? W.bikeBarsDrop : spec.bars.value === 'flat' ? W.bikeBarsFlat : W.bikeBarsOther);
  const name = nearestSwatchName(spec.colour.value);
  if (name) parts.push(W.bikeColourFrame(name));
  if (spec.rack.value) parts.push(W.bikeRearRack);
  return W.bikeLabel(parts);
}

/** The drawing, its anchors and its accessible name. Bags, bottles and decks come only from `bags`. */
/** The last drawings, without their colour: a tap on a swatch only repaints. */
const RECENT: { key: string; svg: string; anchors: Anchors }[] = [];
const PAINT = '#c010ff';
const NAME = '{{label}}';

/** The drawing, its anchors and its accessible name. Bags, bottles and decks come only from `bags`. The anchors are shared: read them only. */
export function bikeArt(spec: BikeSpec, bags: BagView | null, options: ArtOptions = {}): { svg: string; anchors: Anchors; label: string } {
  const colour = spec.colour.value;
  const label = labelOf(spec);
  const m = spec.mounts;
  // What the drawing is made of, without its colour. The frame points follow from style and size (geometry is empty in this release).
  const key = `${spec.type.value}|${spec.rimMm.value}|${spec.frontMm.value}|${spec.rearMm.value}|${spec.style.value}|${spec.size.value}|${spec.bars.value}|${spec.fork.value}|${spec.brakes.value}|${spec.drive.value}|${spec.rack.value}|${spec.ebike.value}|${colour ? 1 : 0}|${m.st}${m.dt}${m.un}${m.top}${m.frame}|${options.theme ?? 'dark'}|${options.idPrefix ?? 'bk'}|${bags ? JSON.stringify(bags) : ''}`;
  let hit = RECENT.find((r) => r.key === key);
  if (!hit) {
    const plain: BikeSpec = { ...spec, colour: { value: colour ? PAINT : null, mark: spec.colour.mark } };
    const g = geometry(plain);
    const fr = frameOf(g);
    const counts: Record<string, number> = {};
    for (const item of bags?.items ?? []) counts[item.pos] = (counts[item.pos] ?? 0) + 1;
    const anchors = anchorsOf(plain, g, fr, counts);
    const parts = bikeParts(plain, g, fr);
    const b = bags ? bagsArt(bags, anchors, options.theme ?? 'dark', options.idPrefix ?? 'bk') : { defs: [], art: [] };
    const svg = `<svg class="bk" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${NAME}">${b.defs.length ? `<defs>${b.defs.join('')}</defs>` : ''}${parts.join('')}${b.art.join('')}</svg>`;
    hit = { key, svg, anchors };
    RECENT.unshift(hit);
    RECENT.length = Math.min(RECENT.length, 12);
  }
  const svg = withCasing((colour ? hit.svg.split(`stroke="${PAINT}"`).join(`stroke="${colour}"`) : hit.svg).replace(NAME, label), colour, options.theme ?? 'dark');
  return { svg, anchors: hit.anchors, label };
}

/** The casing's tone for this colour and theme (owner's ruling A): muted keeps the plain class, the stylesheet's own. */
function withCasing(svg: string, colour: string | null, theme: 'dark' | 'light'): string {
  if (!colour) return svg;
  const tone = casingFor(colour, theme);
  return tone === 'muted' ? svg : svg.split('class="bk-casing"').join(`class="bk-casing bk-casing-${tone}"`);
}

/** The route-strip marker: wheels, frame and fork only, at most 24 px tall. Decorative: the strip carries the position's label. */
export function markerArt(spec: BikeSpec, theme: 'dark' | 'light' = 'dark'): string {
  const g = geometry(spec);
  const fr = frameOf(g);
  const colour = spec.colour.value;
  const k = g.k / MM;
  const main = [tubeD(fr.seat), fr.top ? tubeD(fr.top) : '', fr.low ? tubeD(fr.low) : '', tubeD(fr.down), tubeD(fr.head), tubeD(fr.chainStay), tubeD(fr.seatStay), fr.twin ? tubeD(fr.twin) : '']
    .filter(Boolean).join(' ');
  const fork = `M${pt(g.headBottom)} L${pt(g.front)}`;
  const tyre = (c: P, r: number) => circle('bk-tyre', c, r - 2.4 * k, 4.8 * k);
  // Without a colour the marker is the theme's muted: at 24 px the outline colour would all but vanish on the strip.
  const paint = (cls: string, d: string, sw: number) => (colour
    ? path('bk-casing', d, sw + 1.5 * 3) + `<path class="bk-paint ${cls}" d="${d}"${attr('stroke-width', sw)} stroke="${colour}" fill="none"/>`
    : path(`bk-plain ${cls}`, d, sw));
  const x0 = g.rear[0] - g.rr - 2;
  const x1 = g.front[0] + g.rf + 2;
  const y0 = Math.min(g.seatTop[1], g.headTop[1]) - 5;
  const y1 = GROUND + 1;
  const w = x1 - x0;
  const h = y1 - y0;
  return withCasing(`<svg class="bk bk-marker" viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}" width="${r2((24 * w) / h)}" height="24" aria-hidden="true" focusable="false">`
    + `${tyre(g.rear, g.rr)}${tyre(g.front, g.rf)}${paint('bk-frame', main, 6.5 * k)}${paint('bk-fork', fork, 6.5 * k)}</svg>`, colour, theme);
}

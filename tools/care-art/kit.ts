// The construction kit for Bike care's drawings (care pictures redo, proposal of 9 November 2026, sections 7 and 8): every shape is built
// from numbers, never placed by eye. A shape keeps two forms: the SVG path a file carries, and a sampled outline the checks measure
// (tests/unit/tools/care-art.test.ts). A drawing states its facts (pads on the rim, an axle through its hole, a leader on its part) with
// the helpers at the end, and the test holds every one. Classes are the shared stylesheet's (src/tools/care/pictures.css); no colour here.

export type Pt = readonly [number, number];

/** One decimal is enough at about one screen pixel a unit, and keeps a file small. */
export const n = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};
export const deg = (a: number): number => (a * Math.PI) / 180;
/** The point at `r` from (cx, cy), at `a` degrees clockwise from straight up (screen y grows downwards). */
export const pol = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(deg(a)), cy - r * Math.cos(deg(a))];
export const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
export const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
export const len = (p: Pt): number => Math.hypot(p[0], p[1]);
export const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
export const unit = (p: Pt): Pt => { const l = len(p) || 1; return [p[0] / l, p[1] / l]; };
export const perp = (p: Pt): Pt => [-p[1], p[0]];
export const scale = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
export const rot = (p: Pt, about: Pt, a: number): Pt => {
  const c = Math.cos(deg(a)), s = Math.sin(deg(a)), x = p[0] - about[0], y = p[1] - about[1];
  return [about[0] + x * c - y * s, about[1] + x * s + y * c];
};

/** A path built step by step: its `d` for the file, its sampled points for the checks (`parts`: one list per subpath). */
export class Path {
  d = '';
  parts: Pt[][] = [];
  closed: boolean[] = [];
  private at: Pt = [0, 0];
  private cur(): Pt[] { return this.parts[this.parts.length - 1]!; }
  M(p: Pt): this { this.d += `M${n(p[0])} ${n(p[1])}`; this.parts.push([p]); this.closed.push(false); this.at = p; return this; }
  L(p: Pt): this { this.d += `L${n(p[0])} ${n(p[1])}`; this.cur().push(p); this.at = p; return this; }
  /** Several straight lines. */
  P(...ps: Pt[]): this { for (const p of ps) this.L(p); return this; }
  /** A circular arc round `c` to the point at angle `a1` (degrees, clockwise from up), from the current point, which must lie on it. */
  arcTo(c: Pt, a1: number, cw: boolean): this {
    const r = len(sub(this.at, c));
    const a0 = (Math.atan2(this.at[0] - c[0], -(this.at[1] - c[1])) * 180) / Math.PI;
    let span = (((a1 - a0) % 360) + 360) % 360;
    if (!cw) span -= 360;
    if (Math.abs(span) < 0.001 || Math.abs(span) >= 359.999) throw new Error('arcTo: no arc, or a full turn (use circle())');
    const end = pol(c[0], c[1], r, a1);
    this.d += `A${n(r)} ${n(r)} 0 ${Math.abs(span) > 180 ? 1 : 0} ${cw ? 1 : 0} ${n(end[0])} ${n(end[1])}`;
    const steps = Math.max(2, Math.ceil(Math.abs(span) / 4));
    for (let i = 1; i <= steps; i++) this.cur().push(pol(c[0], c[1], r, a0 + (span * i) / steps));
    this.at = end;
    return this;
  }
  Q(c: Pt, p: Pt): this {
    this.d += `Q${n(c[0])} ${n(c[1])} ${n(p[0])} ${n(p[1])}`;
    const a = this.at;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      this.cur().push([u * u * a[0] + 2 * u * t * c[0] + t * t * p[0], u * u * a[1] + 2 * u * t * c[1] + t * t * p[1]]);
    }
    this.at = p;
    return this;
  }
  C(c1: Pt, c2: Pt, p: Pt): this {
    this.d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p[0])} ${n(p[1])}`;
    const a = this.at;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      this.cur().push([
        u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p[0],
        u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p[1],
      ]);
    }
    this.at = p;
    return this;
  }
  Z(): this { this.d += 'Z'; this.closed[this.closed.length - 1] = true; const c = this.cur(); this.at = c[0]!; return this; }
}

/** A straight polyline or polygon. */
export const poly = (pts: readonly Pt[], close = true): Path => {
  const p = new Path().M(pts[0]!);
  for (const q of pts.slice(1)) p.L(q);
  return close ? p.Z() : p;
};
/** A rectangle with round corners as a path (so the checks see its outline). */
export const rrect = (x: number, y: number, w: number, h: number, r: number): Path => {
  r = Math.min(r, w / 2, h / 2);
  return new Path().M([x + r, y]).L([x + w - r, y]).arcTo([x + w - r, y + r], 90, true).L([x + w, y + h - r])
    .arcTo([x + w - r, y + h - r], 180, true).L([x + r, y + h]).arcTo([x + r, y + h - r], 270, true).L([x, y + r])
    .arcTo([x + r, y + r], 360, true).Z();
};
/** A rectangle turned by `a` degrees about its centre. */
export const rbox = (c: Pt, w: number, h: number, a: number): Path =>
  poly(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map((p) => rot(add(c, p), c, a)));
/** A ring segment between radii r0 < r1, from angle a0 to a1 (clockwise). */
export const band = (c: Pt, r0: number, r1: number, a0: number, a1: number): Path =>
  new Path().M(pol(c[0], c[1], r1, a0)).arcTo(c, a1, true).L(pol(c[0], c[1], r0, a1)).arcTo(c, a0, false).Z();
/** A tube of width `w` along a straight line, round-ended or square. */
export const tube = (a: Pt, b: Pt, w: number): Path => {
  const s = scale(unit(perp(sub(b, a))), w / 2);
  return poly([add(a, s), add(b, s), sub(b, s), sub(a, s)]);
};

type Item =
  | { kind: 'path'; cls: string; p: Path; style?: string; name?: string }
  | { kind: 'circle'; cls: string; c: Pt; r: number; style?: string; name?: string }
  | { kind: 'text'; cls: string; at: Pt; s: string; anchor?: 'middle' | 'end' };

export type Shape = { name: string; parts: Pt[][]; closed: boolean[] };
export type Fact = { what: string; ok: boolean; detail?: string };

/** One drawing: its items in paint order, its named shapes for the checks, and its facts. */
export class Pic {
  items: Item[] = [];
  shapes = new Map<string, Shape>();
  facts: Fact[] = [];
  /** A prefix for the names that follow, so a second panel can name its parts as the first does. */
  ns = '';
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) { this.w = w; this.h = h; }
  private keep(name: string | undefined, parts: Pt[][], closed: boolean[]): void {
    if (!name) return;
    name = this.ns + name;
    if (this.shapes.has(name)) throw new Error(`shape named twice: ${name}`);
    this.shapes.set(name, { name, parts, closed });
  }
  path(cls: string, p: Path, o: { name?: string; style?: string } = {}): this {
    this.items.push({ kind: 'path', cls, p, ...o });
    this.keep(o.name, p.parts, p.closed);
    return this;
  }
  circle(cls: string, c: Pt, r: number, o: { name?: string; style?: string } = {}): this {
    this.items.push({ kind: 'circle', cls, c, r, ...o });
    const pts: Pt[] = [];
    for (let i = 0; i < 72; i++) pts.push(pol(c[0], c[1], r, i * 5));
    this.keep(o.name, [pts], [true]);
    return this;
  }
  line(cls: string, a: Pt, b: Pt, o: { name?: string; style?: string } = {}): this { return this.path(cls, poly([a, b], false), o); }
  /** A named outline the checks measure but the file does not draw (a braking surface, an axle's hole). */
  mark(name: string, p: Path): this { this.keep(name, p.parts, p.closed); return this; }
  text(cls: 'cp-t' | 'cp-tm' | 'cp-th' | 'cp-badget', at: Pt, s: string, anchor?: 'middle' | 'end'): this {
    this.items.push({ kind: 'text', cls, at, s, ...(anchor ? { anchor } : {}) });
    return this;
  }
  /** A label with its leader: a thin line from near the label to the point on the part. */
  label(cls: 'cp-t' | 'cp-tm' | 'cp-th', at: Pt, s: string, _from: Pt, to: Pt, anchor?: 'middle' | 'end', name?: string): this {
    // the leader starts just outside the label's box, at the point of the box nearest the part, so it never runs into the words; the box
    // is the label as a wide device font draws it (about 6.6 units a letter, a fifth more than this browser's)
    const w = s.length * (cls === 'cp-tm' ? 6.1 : 6.6) * 1.2;
    const x0 = anchor === 'end' ? at[0] - w : anchor === 'middle' ? at[0] - w / 2 : at[0], x1 = x0 + w, y0 = at[1] - 12, y1 = at[1] + 3;
    const cx = Math.max(x0, Math.min(x1, to[0])), cy = Math.max(y0, Math.min(y1, to[1]));
    const out = unit(sub(to, [cx, cy]));
    const from: Pt = [cx + out[0] * 3, cy + out[1] * 3];
    this.line('cp-thin', from, to, name ? { name } : {});
    return this.text(cls, at, s, anchor);
  }
  /** A straight arrow from a to b, its filled head at b (design 3.2: 2.25 wide, head 7 long). */
  arrow(a: Pt, b: Pt): this {
    const u = unit(sub(b, a)), back = sub(b, scale(u, 6.5));
    this.line('cp-arrow', a, back);
    return this.head(b, u);
  }
  /** A turning arrow: an arc round c from angle a0 to a1, its head at a1. */
  turn(c: Pt, r: number, a0: number, a1: number): this {
    const cw = a1 > a0;
    const stop = a1 - (cw ? 1 : -1) * ((6.5 / r) * 180) / Math.PI;
    this.path('cp-arrow', new Path().M(pol(c[0], c[1], r, a0)).arcTo(c, stop, cw));
    const tip = pol(c[0], c[1], r, a1), before = pol(c[0], c[1], r, stop);
    return this.head(tip, unit(sub(tip, before)));
  }
  /**
   * A turning arrow round an axis that lies in the picture (a barrel, a knob, an axle seen side-on): an elliptical arc, `rx` across and
   * `ry` along the turn, from angle a0 to a1 (degrees clockwise from up), its head at a1.
   */
  turnAxis(c: Pt, rx: number, ry: number, a0: number, a1: number): this {
    const at = (a: number): Pt => [c[0] + rx * Math.sin(deg(a)), c[1] - ry * Math.cos(deg(a))];
    const step = (a1 - a0) / 24, p = new Path().M(at(a0));
    for (let i = 1; i <= 21; i++) p.L(at(a0 + step * i));
    this.path('cp-arrow', p);
    const tip = at(a1), before = at(a0 + step * 21);
    return this.head(tip, unit(sub(tip, before)));
  }
  private head(tip: Pt, u: Pt): this {
    const s = scale(perp(u), 4), base = sub(tip, scale(u, 7.5));
    return this.path('cp-head', poly([tip, add(base, s), sub(base, s)]));
  }
  /** A numbered badge (design 3.5). */
  badge(c: Pt, s: string): this {
    this.circle('cp-badge', c, 9);
    return this.text('cp-badget', [c[0], c[1] + 4], s, 'middle');
  }
  fact(what: string, ok: boolean, detail?: string): this { this.facts.push({ what, ok, ...(detail ? { detail } : {}) }); return this; }
  get(name: string): Shape {
    const s = this.shapes.get(this.ns + name);
    if (!s) throw new Error(`no shape named ${name}`);
    return s;
  }
  svg(): string {
    const out = [`<svg class="cp" viewBox="0 0 ${this.w} ${this.h}">`];
    for (const it of this.items) {
      const st = 'style' in it && it.style ? ` style="${it.style}"` : '';
      if (it.kind === 'path') out.push(`<path class="${it.cls}"${st} d="${it.p.d}"/>`);
      else if (it.kind === 'circle') out.push(`<circle class="${it.cls}"${st} cx="${n(it.c[0])}" cy="${n(it.c[1])}" r="${n(it.r)}"/>`);
      else out.push(`<text class="${it.cls}" x="${n(it.at[0])}" y="${n(it.at[1])}"${it.anchor ? ` text-anchor="${it.anchor}"` : ''}>${esc(it.s)}</text>`);
    }
    out.push('</svg>');
    return out.join('');
  }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- measuring, for the facts ----

const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  return len(sub(p, lerp(a, b, t)));
};
const segments = (s: Shape): [Pt, Pt][] =>
  s.parts.flatMap((pts, i) => {
    const out: [Pt, Pt][] = [];
    for (let k = 1; k < pts.length; k++) out.push([pts[k - 1]!, pts[k]!]);
    if (s.closed[i] && pts.length > 2) out.push([pts[pts.length - 1]!, pts[0]!]);
    return out;
  });
/** The shortest distance from a point to a shape's outline. */
export const distTo = (p: Pt, s: Shape): number => Math.min(...segments(s).map(([a, b]) => segDist(p, a, b)));
/** Is the point inside a closed shape (even-odd over its subpaths)? */
export const inside = (p: Pt, s: Shape): boolean => {
  if (!s.closed.some(Boolean)) return false;
  let c = false;
  for (const [a, b] of segments(s)) {
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
const samples = (s: Shape): Pt[] => segments(s).flatMap(([a, b]) => [a, lerp(a, b, 0.5)]);
const side = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Do segments pq and rt cross? */
const cross = (p: Pt, q: Pt, r: Pt, t: Pt): boolean =>
  side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
/** The shortest distance between two outlines (0 when they cross). */
export const gap = (a: Shape, b: Shape): number => {
  const sa = segments(a), sb = segments(b);
  let best = Infinity;
  for (const [p, q] of sa) for (const [r, t] of sb) {
    if (cross(p, q, r, t)) return 0;
    best = Math.min(best, segDist(p, r, t), segDist(q, r, t), segDist(r, p, q), segDist(t, p, q));
    if (best === 0) return 0;
  }
  return best;
};

/** Fact helpers: each returns [ok, detail]. Units are drawing units. */
export const touches = (pic: Pic, a: string, b: string, tol = 1.2): Fact => {
  const g = gap(pic.get(a), pic.get(b));
  return { what: `${a} touches ${b}`, ok: g <= tol, detail: `gap ${g.toFixed(2)}` };
};
export const clear = (pic: Pic, a: string, b: string, min: number): Fact => {
  const g = gap(pic.get(a), pic.get(b));
  const overlap = samples(pic.get(a)).some((p) => inside(p, pic.get(b))) || samples(pic.get(b)).some((p) => inside(p, pic.get(a)));
  return { what: `${a} stays ${min} clear of ${b}`, ok: !overlap && g >= min, detail: `gap ${g.toFixed(2)}${overlap ? ', overlapping' : ''}` };
};
export const within = (pic: Pic, a: string, b: string, tol = 0.6): Fact => {
  const bad = samples(pic.get(a)).filter((p) => !inside(p, pic.get(b)) && distTo(p, pic.get(b)) > tol);
  return { what: `${a} lies within ${b}`, ok: bad.length === 0, detail: bad.length ? `outside at ${n(bad[0]![0])},${n(bad[0]![1])}` : undefined };
};
/** A point lies on (or inside) a shape. */
export const at = (pic: Pic, what: string, p: Pt, part: string, tol = 1.5): Fact => {
  const s = pic.get(part), d = inside(p, s) ? 0 : distTo(p, s);
  return { what: `${what} on ${part}`, ok: d <= tol, detail: `off by ${d.toFixed(2)}` };
};
/** A leader's far end lies on (or inside) the part it names. */
export const pointsAt = (pic: Pic, leader: string, part: string, tol = 1.5): Fact => {
  const pts = pic.get(leader).parts[0]!;
  const end = pts[pts.length - 1]!;
  const s = pic.get(part);
  const d = inside(end, s) ? 0 : distTo(end, s);
  return { what: `${leader} ends on ${part}`, ok: d <= tol, detail: `off by ${d.toFixed(2)}` };
};

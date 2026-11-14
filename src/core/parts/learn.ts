// How a bike is built (design of 14 November 2026): the parts a learner meets on a whole bike, the guide's 37 and 19 more, each with its
// step of the build, its group in the list, which bikes have it, what it connects to, and where it sits on the drawing. Pure: the drawing
// is bikeArt's, untouched; the new parts' points and highlights are worked out from its anchors and frame templates, as part-points.ts
// does for the guide's. The two pieces the shared drawing does not draw (a front derailleur, a brake cable) are drawn by this page only.
import type { Anchors, P } from '../bike/art.ts';
import { partPoint } from '../bike/part-points.ts';
import type { BikeRecord } from '../bike/normalise.ts';
import type { BikeSpec, BikeType } from '../bike/spec.ts';
import { framePoints } from '../bike/templates.ts';
import type { Style } from '../bike/templates.ts';
import type { PartId, PartTag } from './guide.ts';
import { partSpot, typeSpec } from './view.ts';
import type { Spot } from './view.ts';

export const NEW_PARTS = [
  'head-tube', 'top-tube', 'down-tube', 'seat-tube', 'chainstay', 'seatstay', 'shock', 'bottom-bracket', 'crank', 'pedal',
  'front-derailleur', 'belt', 'brake-cable', 'shifter', 'grips', 'bar-tape', 'seat-clamp', 'saddle', 'motor',
] as const;
export type NewPart = (typeof NEW_PARTS)[number];
export type LearnId = PartId | NewPart;

/** The build's steps, in order (the owner's list of 14 November 2026). */
export const STEPS = ['frame', 'fork', 'wheels', 'drive', 'brakes', 'cockpit', 'saddle', 'ebike'] as const;
export type LearnStep = (typeof STEPS)[number];
/** The parts list's seven headings: the frame and the fork share one. */
export const GROUPS = ['frame', 'wheels', 'drive', 'brakes', 'cockpit', 'saddle', 'ebike'] as const;
export type LearnGroup = (typeof GROUPS)[number];
export const groupOf = (step: LearnStep): LearnGroup => (step === 'fork' ? 'frame' : step);

/** Where a part is on some bikes only: the guide's tags, and the new parts' own. */
export type LearnTag = PartTag | 'two-rings' | 'full-suspension' | 'belt' | 'drop-bars' | 'flat-bars';

/** The guide's tags (a copy a test keeps equal: importing the guide would add a chunk to the first screen's list), and the new parts' own. */
const TAGS: Partial<Record<LearnId, LearnTag>> = {
  'tubeless-valve': 'tubeless', 'rim-brake': 'rim', 'brake-qr': 'rim', caliper: 'disc', disc: 'disc', 'pad-adjuster': 'cable-disc',
  cassette: 'derailleur', derailleur: 'derailleur', hanger: 'derailleur', 'hub-gears': 'hub-gears', battery: 'ebike', display: 'ebike',
  stanchions: 'suspension',
  shock: 'full-suspension', 'front-derailleur': 'two-rings', belt: 'belt', 'bar-tape': 'drop-bars', grips: 'flat-bars', motor: 'ebike',
};

/** Every part, in the list's order, with its step. */
export const LEARN_PARTS: readonly { id: LearnId; step: LearnStep }[] = ([
  ['frame', ['frame', 'head-tube', 'top-tube', 'down-tube', 'seat-tube', 'chainstay', 'seatstay', 'dropouts', 'shock']],
  ['fork', ['fork', 'stanchions', 'headset']],
  ['wheels', ['wheel', 'hub', 'thru-axle', 'wheel-qr', 'spokes', 'rim', 'tyre', 'bead', 'tube', 'valve', 'tubeless-valve']],
  ['drive', ['bottom-bracket', 'crank', 'pedal', 'chainring', 'front-derailleur', 'chain', 'quick-link', 'belt', 'cassette', 'derailleur', 'hanger', 'hub-gears']],
  ['brakes', ['brake-lever', 'brake-cable', 'caliper', 'disc', 'rim-brake', 'pads', 'brake-qr', 'pad-adjuster']],
  ['cockpit', ['stem', 'handlebar', 'grips', 'bar-tape', 'shifter', 'gear-cable', 'barrel']],
  ['saddle', ['seatpost', 'seat-clamp', 'saddle']],
  ['ebike', ['motor', 'battery', 'display']],
] as [LearnStep, LearnId[]][]).flatMap(([step, ids]) => ids.map((id) => ({ id, step })));

export const stepOf = (id: LearnId): LearnStep => LEARN_PARTS.find((p) => p.id === id)!.step;
export const tagOf = (id: LearnId): LearnTag | undefined => TAGS[id];

/** What connects to what, each pair once: "connects to" reads it both ways. */
export const EDGES: readonly (readonly [LearnId, LearnId])[] = [
  ['frame', 'head-tube'], ['frame', 'top-tube'], ['frame', 'down-tube'], ['frame', 'seat-tube'], ['frame', 'chainstay'], ['frame', 'seatstay'],
  ['frame', 'dropouts'], ['frame', 'bottom-bracket'], ['frame', 'shock'],
  ['head-tube', 'top-tube'], ['head-tube', 'down-tube'], ['head-tube', 'headset'], ['top-tube', 'seat-tube'],
  ['down-tube', 'bottom-bracket'], ['seat-tube', 'bottom-bracket'], ['chainstay', 'bottom-bracket'], ['seat-tube', 'seatstay'],
  ['seat-tube', 'seatpost'], ['seat-tube', 'seat-clamp'], ['seat-tube', 'front-derailleur'], ['chainstay', 'dropouts'], ['seatstay', 'dropouts'],
  ['shock', 'seatstay'], ['shock', 'down-tube'], ['down-tube', 'battery'],
  ['dropouts', 'fork'], ['dropouts', 'thru-axle'], ['dropouts', 'wheel-qr'], ['dropouts', 'hanger'],
  ['wheel', 'dropouts'], ['wheel', 'thru-axle'], ['wheel', 'wheel-qr'],
  ['fork', 'headset'], ['fork', 'stem'], ['fork', 'caliper'], ['fork', 'rim-brake'], ['fork', 'stanchions'], ['headset', 'stem'],
  ['stem', 'handlebar'], ['handlebar', 'grips'], ['handlebar', 'bar-tape'], ['handlebar', 'brake-lever'], ['handlebar', 'shifter'], ['handlebar', 'display'],
  ['hub', 'thru-axle'], ['hub', 'wheel-qr'], ['hub', 'spokes'], ['hub', 'disc'], ['hub', 'cassette'], ['hub', 'hub-gears'], ['hub', 'motor'], ['hub', 'belt'],
  ['spokes', 'rim'], ['rim', 'tyre'], ['rim', 'bead'], ['rim', 'valve'], ['rim', 'tubeless-valve'], ['rim', 'rim-brake'], ['rim', 'pads'],
  ['tyre', 'bead'], ['tyre', 'tube'], ['tube', 'valve'],
  ['bottom-bracket', 'crank'], ['bottom-bracket', 'motor'], ['crank', 'pedal'], ['crank', 'chainring'],
  ['chainring', 'chain'], ['chainring', 'belt'], ['chainring', 'front-derailleur'], ['chainring', 'motor'],
  ['chain', 'cassette'], ['chain', 'quick-link'], ['chain', 'derailleur'], ['chain', 'hub-gears'], ['chain', 'front-derailleur'],
  ['cassette', 'derailleur'], ['derailleur', 'hanger'], ['derailleur', 'gear-cable'], ['front-derailleur', 'gear-cable'], ['hub-gears', 'gear-cable'],
  ['gear-cable', 'shifter'], ['gear-cable', 'barrel'], ['shifter', 'brake-lever'],
  ['brake-lever', 'brake-cable'], ['brake-cable', 'caliper'], ['brake-cable', 'rim-brake'], ['brake-cable', 'barrel'],
  ['caliper', 'pads'], ['caliper', 'disc'], ['caliper', 'pad-adjuster'], ['rim-brake', 'pads'], ['rim-brake', 'brake-qr'],
  ['seatpost', 'saddle'], ['seatpost', 'seat-clamp'], ['battery', 'motor'], ['battery', 'display'],
];

// ---- the bike ----

/**
 * The bike the page draws: its spec; whether it has a front derailleur (the drawing has no chainring count); how its wheels are held
 * (`axle`: thru-axles, quick releases or nuts; `rearNuts`: hub gears' rear wheel on nuts) where it differs from the brakes' usual one;
 * hydraulic discs (no pad adjuster) and electronic gears (no gear cable) where the rider said; and what the page shows in place of an
 * answer the rider has not given (`shows`: disc brakes for brakes not set or of another kind, derailleur gears for gears not set).
 */
export type LearnBike = {
  spec: BikeSpec; frontMech: boolean; axle?: 'thru' | 'qr' | 'nuts'; rearNuts?: boolean; hydraulic?: boolean; electronic?: boolean;
  /** A single speed: the rider said No gears and no drive, so the drawing's plain chain is the bike's own (follow-up of 14 Nov). */
  single?: true;
  shows?: { brakes?: 'unset' | 'other'; drive?: 'unset' };
};
/** How the wheels are held: the rider's answer, else a thru-axle with disc brakes and a quick release with rim brakes (design choice 5). */
export const axleOf = (bike: LearnBike): 'thru' | 'qr' | 'nuts' => bike.axle ?? (bike.spec.brakes.value === 'disc' ? 'thru' : 'qr');

/** The type switch (design 2): the rider's own bike, or a typical bike of a kind. */
export const KINDS = ['road', 'gravel', 'touring', 'city', 'mtb', 'full', 'fat', 'ebike'] as const;
export type LearnKind = (typeof KINDS)[number];

/** A typical bike of a kind: the bike view's typical bike with what that kind usually has. */
export function kindBike(kind: LearnKind): LearnBike {
  const type: BikeType = kind === 'city' || kind === 'ebike' ? 'trekking' : kind === 'full' ? 'mtb' : kind;
  const base = typeSpec(type);
  const d = <T>(value: T) => ({ value, mark: 'default' as const });
  const style = (s: Style) => ({ style: d(s), points: d(framePoints(s, 'M')) });
  switch (kind) {
    case 'city': return { spec: { ...base, ...style('step-through'), bars: d('other'), brakes: d('rim'), drive: d('hub'), frontMm: d(42), rearMm: d(42) }, frontMech: false, rearNuts: true };
    case 'full': return { spec: { ...base, ...style('full-suspension'), rimMm: d(584), frontMm: d(60), rearMm: d(60) }, frontMech: false };
    case 'mtb': return { spec: { ...base, rimMm: d(622), frontMm: d(57), rearMm: d(57) }, frontMech: false };
    case 'ebike': return { spec: { ...base, ebike: d(true), motor: d('cranks') }, frontMech: false };
    default: return { spec: base, frontMech: kind === 'road' || kind === 'touring' };
  }
}

/**
 * The rider's own bike, from its spec and record: a bike always has brakes and gears, so brakes not set or of another kind (a coaster
 * or drum brake) are shown as disc brakes and gears not set as derailleur gears, each marked in `shows` for the page to say so. A front
 * derailleur where road and touring bikes usually have two chainrings; the axle, hydraulic discs and electronic gears as the rider said.
 */
export function ownBike(spec: BikeSpec, record: BikeRecord | null = null): LearnBike {
  const shows: NonNullable<LearnBike['shows']> = {};
  let out = spec;
  if (spec.brakes.value === 'none') {
    shows.brakes = record?.brakes === 'other' ? 'other' : 'unset';
    out = { ...out, brakes: { value: 'disc', mark: 'guessed' } };
  }
  // No gears and no drive told: a single speed, drawn as the drawing's plain chain; gears not told otherwise show derailleur gears
  const single = out.drive.value === 'chain' && record?.shifting === 'none';
  if (out.drive.value === 'chain' && !single) {
    shows.drive = 'unset';
    out = { ...out, drive: { value: 'derailleur', mark: 'guessed' } };
  }
  const drive = out.drive.value;
  const axle = record?.axle;
  return {
    spec: out,
    frontMech: drive === 'derailleur' && (out.type.value === 'road' || out.type.value === 'touring'),
    ...(axle ? { axle } : {}),
    rearNuts: (drive === 'hub' || drive === 'belt') && axle !== 'thru' && axle !== 'qr',
    ...(record?.brakes === 'hydraulic-disc' ? { hydraulic: true } : {}),
    ...(record?.shifting === 'electronic' ? { electronic: true } : {}),
    ...(single ? { single: true as const } : {}),
    ...(shows.brakes || shows.drive ? { shows } : {}),
  };
}

/** Whether the drawn bike has the part. */
export function hasPart(bike: LearnBike, id: LearnId): boolean {
  const { spec } = bike;
  const style = spec.style.value;
  const brakes = spec.brakes.value;
  const drive = spec.drive.value;
  switch (id) {
    case 'top-tube': return style !== 'step-through' && style !== 'mixte';
    case 'shock': return style === FULL;
    case 'stanchions': return spec.fork.value === 'suspension';
    case 'thru-axle': return axleOf(bike) === 'thru';
    case 'wheel-qr': return axleOf(bike) === 'qr';
    case 'front-derailleur': return bike.frontMech && drive === 'derailleur';
    case 'chain': case 'quick-link': return drive !== 'belt';
    case 'belt': return drive === 'belt';
    case 'cassette': case 'derailleur': case 'hanger': return drive === 'derailleur';
    // a belt runs to one rear sprocket, so its gears are in the hub
    case 'hub-gears': return drive === 'hub' || drive === 'belt';
    // a bike with one gear and no answer about it (a spec's plain chain) has nothing to shift; electronic gears have no gear cable
    case 'shifter': return drive !== 'chain';
    case 'gear-cable': return drive !== 'chain' && !bike.electronic;
    case 'caliper': case 'disc': return brakes === 'disc';
    case 'pad-adjuster': return brakes === 'disc' && !bike.hydraulic;
    case 'rim-brake': case 'brake-qr': return brakes === 'rim';
    case 'pads': case 'brake-lever': case 'brake-cable': return brakes !== 'none';
    case 'grips': return spec.bars.value !== 'drop';
    case 'bar-tape': return spec.bars.value === 'drop';
    case 'motor': case 'battery': case 'display': return spec.ebike.value;
    default: return true;
  }
}

/** The parts of the bike, in the list's order. */
export const partsOf = (bike: LearnBike): LearnId[] => LEARN_PARTS.filter((p) => hasPart(bike, p.id)).map((p) => p.id);

/** What a part connects to on this bike, in the list's order. */
export function linksOf(bike: LearnBike, id: LearnId): LearnId[] {
  const other = new Set(EDGES.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])));
  return partsOf(bike).filter((p) => other.has(p));
}

// ---- the build ----

/** The build's steps for this bike: the brakes only where it has brakes, the e-bike's last step only on an e-bike. */
export const stepsOf = (bike: LearnBike): LearnStep[] =>
  STEPS.filter((s) => (s === 'ebike' ? bike.spec.ebike.value : s === 'brakes' ? bike.spec.brakes.value !== 'none' : true));

/** Parts the build passes over: a tubeless tyre's valve and a cable disc's pad adjuster are other bikes' (they stay in the list). */
const BUILD_SKIP: readonly LearnId[] = ['tubeless-valve', 'pad-adjuster'];
export const stepParts = (bike: LearnBike, step: LearnStep): LearnId[] =>
  partsOf(bike).filter((id) => stepOf(id) === step && !BUILD_SKIP.includes(id));

/** Which line says how a step's parts attach: some steps have one for each kind of bike. */
export type StepLine = 'frame' | 'fork' | 'fork-suspension' | 'wheels-thru' | 'wheels-qr' | 'wheels-nuts' | 'wheels-thru-nuts' | 'wheels-qr-nuts'
  | 'drive-derailleur' | 'drive-two' | 'drive-hub' | 'drive-belt' | 'drive-chain' | 'brakes-disc' | 'brakes-rim'
  | 'cockpit-drop' | 'cockpit-flat' | 'cockpit-drop-plain' | 'cockpit-flat-plain' | 'saddle' | 'ebike-cranks' | 'ebike-hub';
export function stepLine(bike: LearnBike, step: LearnStep): StepLine {
  const s = bike.spec;
  switch (step) {
    case 'fork': return s.fork.value === 'suspension' ? 'fork-suspension' : 'fork';
    case 'wheels': {
      // as the wheels are held: hub gears keep the rear wheel on nuts unless the rider said otherwise (review of PR 128, I4)
      const axle = axleOf(bike);
      if (axle === 'nuts') return 'wheels-nuts';
      if (bike.rearNuts) return axle === 'thru' ? 'wheels-thru-nuts' : 'wheels-qr-nuts';
      return axle === 'thru' ? 'wheels-thru' : 'wheels-qr';
    }
    case 'drive': return s.drive.value === 'belt' ? 'drive-belt' : s.drive.value === 'hub' ? 'drive-hub' : s.drive.value === 'chain' ? 'drive-chain'
      : hasPart(bike, 'front-derailleur') ? 'drive-two' : 'drive-derailleur';
    case 'brakes': return s.brakes.value === 'rim' ? 'brakes-rim' : 'brakes-disc';
    case 'cockpit': return (s.bars.value === 'drop' ? 'cockpit-drop' : 'cockpit-flat') + (hasPart(bike, 'shifter') ? '' : '-plain') as StepLine;
    case 'ebike': return s.motor.value === 'cranks' ? 'ebike-cranks' : 'ebike-hub';
    default: return step;
  }
}

/** The drawing's classes, each with the step that adds it. A casing goes with the painted part it outlines. */
const CLASS_STEP: Readonly<Record<string, LearnStep>> = {
  'bk-frame': 'frame', 'bk-stays': 'frame', 'bk-shock': 'frame', 'bk-fork': 'fork', 'bk-seal': 'fork',
  'bk-tyre': 'wheels', 'bk-rim': 'wheels', 'bk-spokes': 'wheels', 'bk-hub': 'wheels', 'bk-rimband': 'wheels', 'bk-rimedge': 'wheels',
  'bk-chain': 'drive', 'bk-belt': 'drive', 'bk-cog': 'drive', 'bk-hubgear': 'drive', 'bk-mech': 'drive', 'bk-ring': 'drive', 'bk-crank': 'drive', 'bk-bb': 'drive',
  'bk-rotor': 'brakes', 'bk-caliper': 'brakes', 'bk-hood': 'brakes',
  'bk-bar': 'cockpit', 'bk-grip': 'cockpit', 'bk-post': 'saddle', 'bk-saddle': 'saddle', 'bk-battery': 'ebike', 'bk-motor': 'ebike',
};
export const classStep = (cls: string): LearnStep | undefined => CLASS_STEP[cls];

/**
 * The drawing as built up to `upto`: bikeArt's (or paintedArt's) markup with every element of a later step left out. A casing is left
 * out with the painted part after it; elements of no step (a pattern's own shapes) stay.
 */
export function stageMarkup(svg: string, upto: LearnStep): string {
  const at = STEPS.indexOf(upto);
  const later = (cls: string): boolean => {
    const step = cls.split(' ').map((c) => CLASS_STEP[c]).find(Boolean);
    return step !== undefined && STEPS.indexOf(step) > at;
  };
  return svg.replace(/<(?:path|circle|rect)\b[^>]*?\/>/g, (el, offset: number) => {
    const cls = /\bclass="([^"]*)"/.exec(el)?.[1] ?? '';
    if (/\bbk-casing\b/.test(cls)) {
      const next = /^<path class="bk-paint ([^"]*)"/.exec(svg.slice(offset + el.length));
      return next && later(next[1]!) ? '' : el;
    }
    return later(cls) ? '' : el;
  });
}

// ---- where the parts are ----

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const unit = (a: P): P => mul(a, 1 / (Math.hypot(a[0], a[1]) || 1));
const quad = (a: P, c: P, b: P, t: number): P => add(add(mul(a, (1 - t) ** 2), mul(c, 2 * t * (1 - t))), mul(b, t * t));
const r2 = (n: number): number => Math.round(n * 100) / 100;
const pt = (p: P): string => `${r2(p[0])} ${r2(p[1])}`;
const round = (p: P): P => [r2(p[0]), r2(p[1])];

// The templates with no top tube (a step-through's curved down tube, a mixte's twin tubes) and with a rear shock, named here rather than
// read from TEMPLATES, so the page takes nothing more from the first screen (a test keeps them equal).
const STEP: Style = 'step-through';
const FULL: Style = 'full-suspension';

/** The frame's tubes as the drawing draws them (art.ts's frameOf, from the anchors): each a line, or the step-through's curve. */
function tubes(spec: BikeSpec, a: Anchors) {
  const step = spec.style.value === STEP;
  const shock = spec.style.value === FULL;
  const { bb, rear, seatTop, headTop, headBottom } = a.points;
  const headAt = (s: number): P => lerp(headTop, headBottom, s);
  const from = headAt(0.55);
  const down = step ? { a: bb, b: from, c: [bb[0] + (from[0] - bb[0]) * 0.45, bb[1] + 4] as P } : { a: bb, b: headBottom };
  const top = a.tubes.top ?? a.tubes.low;
  const rocker = shock ? lerp(bb, seatTop, 0.6) : null;
  return {
    head: [headTop, headBottom] as [P, P],
    top,
    down,
    seat: [bb, seatTop] as [P, P],
    chainStay: [shock ? add(bb, [3, -4]) : bb, rear] as [P, P],
    seatStay: [rear, rocker ?? lerp(bb, seatTop, 0.94)] as [P, P],
    shock: a.tubes.shock,
  };
}
const downAt = (d: { a: P; b: P; c?: P }, s: number): P => (d.c ? quad(d.a, d.c, d.b, s) : lerp(d.a, d.b, s));
const downD = (d: { a: P; b: P; c?: P }): string => (d.c ? `M${pt(d.a)} Q${pt(d.c)} ${pt(d.b)}` : `M${pt(d.a)} L${pt(d.b)}`);

/** The front derailleur this page draws: a clamp on the seat tube and its cage just over the chainring. */
function frontMech(a: Anchors): { d: string; at: P; w: number } {
  const k = a.scale / 0.11;
  const { bb, seatTop } = a.points;
  const up = unit(sub(seatTop, bb));
  const clamp = add(bb, mul(up, 13.5 * k));
  const cageBack = add(bb, [-3.2 * k, -10.9 * k]);
  const cageFront = add(bb, [2.6 * k, -10.6 * k]);
  return { d: `M${pt(clamp)} L${pt(cageBack)} L${pt(cageFront)}`, at: round(lerp(cageBack, cageFront, 0.5)), w: 1.3 * k };
}

/** The front brake's cable or hose this page draws: from the lever, past the head tube, down the fork to the brake. */
function brakeCable(spec: BikeSpec, a: Anchors): { d: string; at: P; w: number } | null {
  const brakes = spec.brakes.value;
  if (brakes === 'none') return null;
  const k = a.scale / 0.11;
  const lever = partPoint(spec, a, 'brake-lever')!;
  const brake = partPoint(spec, a, brakes === 'disc' ? 'caliper' : 'rim-brake')!;
  const { headTop, headBottom, front } = a.points;
  const past = add(headTop, [5 * k, 1.5 * k]);
  const down = add(lerp(headBottom, front, 0.3), [2.4 * k, 0]);
  return { d: `M${pt(lever)} Q${pt(past)} ${pt(down)} L${pt(brake)}`, at: round(down), w: 0.75 * k };
}

/** The pieces this page draws over the shared drawing (design 2), as markup in drawing units, those of steps up to `upto` only. */
export function extrasMarkup(bike: LearnBike, a: Anchors, upto: LearnStep = 'ebike'): string {
  const at = STEPS.indexOf(upto);
  let out = '';
  if (hasPart(bike, 'front-derailleur') && at >= STEPS.indexOf('drive')) {
    const m = frontMech(a);
    out += `<path class="bl-extra bl-fmech" d="${m.d}" stroke-width="${r2(m.w)}"/>`;
  }
  const c = brakeCable(bike.spec, a);
  if (c && at >= STEPS.indexOf('brakes')) out += `<path class="bl-extra bl-cable" d="${c.d}" stroke-width="${r2(c.w)}"/>`;
  return out;
}

/**
 * The part's spot on the drawing of `bike` (anchors `a`): the guide's own for its parts (the chainring alone, the crank being a part of its
 * own here), else worked out here. Null where the bike does not have it.
 */
export function learnSpot(bike: LearnBike, a: Anchors, id: LearnId): Spot | null {
  if (!hasPart(bike, id)) return null;
  const spec = bike.spec;
  const k = a.scale / 0.11;
  const s0: Spot = { at: [0, 0], ink: [], clip: null, barOnly: false, piece: null, ring: false, side: null };
  const piece = (d: string, w: number, at: P): Spot => ({ ...s0, at: round(at), piece: { d, w: r2(w), dashed: false } });
  const ink = (cls: string[], at: P): Spot => ({ ...s0, at: round(at), ink: cls });
  const ring = (at: P): Spot => ({ ...s0, at: round(at), ring: true });
  const tb = tubes(spec, a);
  const { bb, seatTop, saddle } = a.points;
  const pedal = add(bb, [11 * k, 14.5 * k]);
  switch (id) {
    case 'chainring': return { ...partSpot('chainring', spec, a)!, ink: ['bk-ring'] };
    case 'head-tube': return piece(`M${pt(tb.head[0])} L${pt(tb.head[1])}`, 4.4 * k, lerp(tb.head[0], tb.head[1], 0.5));
    case 'top-tube': return tb.top ? piece(`M${pt(tb.top[0])} L${pt(tb.top[1])}`, 3 * k, lerp(tb.top[0], tb.top[1], 0.5)) : null;
    case 'down-tube': return piece(downD(tb.down), 3 * k, downAt(tb.down, 0.62));
    case 'seat-tube': return piece(`M${pt(tb.seat[0])} L${pt(tb.seat[1])}`, 3 * k, lerp(tb.seat[0], tb.seat[1], 0.36));
    case 'chainstay': return piece(`M${pt(tb.chainStay[0])} L${pt(tb.chainStay[1])}`, 2.1 * k, lerp(tb.chainStay[0], tb.chainStay[1], 0.72));
    case 'seatstay': return piece(`M${pt(tb.seatStay[0])} L${pt(tb.seatStay[1])}`, 2.1 * k, lerp(tb.seatStay[0], tb.seatStay[1], 0.5));
    case 'shock': return tb.shock ? ink(['bk-shock'], lerp(tb.shock[0], tb.shock[1], 0.5)) : null;
    case 'bottom-bracket': return ink(['bk-bb'], bb);
    case 'crank': return ink(['bk-crank'], lerp(bb, pedal, 0.5));
    case 'pedal': return piece(`M${pt(add(pedal, [-4.2 * k, 0]))} L${pt(add(pedal, [4.2 * k, 0]))}`, 1.8 * k, pedal);
    case 'front-derailleur': { const m = frontMech(a); return piece(m.d, m.w, m.at); }
    case 'belt': return ink(['bk-belt'], lerp(add(bb, [0, -9.6 * k]), add(a.points.rear, [0, -6 * k]), 0.5));
    case 'brake-cable': { const c = brakeCable(spec, a)!; return piece(c.d, c.w, c.at); }
    case 'shifter': {
      // On drop bars the shifter is in the brake lever; on other bars it sits on the bar, just inside the lever.
      const lever = partPoint(spec, a, 'brake-lever')!;
      return ring(spec.bars.value === 'drop' ? add(lever, [-1.2 * k, 2.2 * k]) : add(lever, [-2 * k, 1.6 * k]));
    }
    case 'grips': {
      const lever = partPoint(spec, a, 'brake-lever')!;
      return ink(['bk-grip'], add(lever, [-4.3 * k, 0]));
    }
    case 'bar-tape': {
      const clamp = a.points.bar;
      return { ...ink(['bk-bar'], add(clamp, [98 * a.scale, 104 * a.scale])), barOnly: true };
    }
    case 'seat-clamp': return ring(lerp(bb, seatTop, 0.96));
    case 'saddle': return ink(['bk-saddle'], add(saddle, [0, -4 * k]));
    // a belt bike's hub gears: the drawing draws its one sprocket, and the gears are in the hub behind it
    case 'hub-gears': return spec.drive.value === 'belt' ? ring(a.points.rear) : partSpot('hub-gears', spec, a);
    case 'motor': {
      const where = spec.motor.value;
      const c = where === 'cranks' ? bb : where === 'rear-hub' ? a.points.rear : a.points.front;
      return ink(['bk-motor'], add(c, [0, (where === 'cranks' ? 5.5 : -5.5) * k]));
    }
    default: return partSpot(id as PartId, spec, a);
  }
}

// ---- picking a part on the drawing ----

const segDist = (p: P, a: P, b: P): number => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** How far a point is from a path's lines (curves by their control points, as the labels' outline reads them). */
function pathDist(d: string, p: P): number {
  let best = Infinity;
  for (const run of d.split(/(?=M)/)) {
    const n = (run.match(/-?[\d.]+/g) ?? []).map(Number);
    const pts: P[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i]!, n[i + 1]!]);
    if (pts.length === 1) best = Math.min(best, Math.hypot(p[0] - pts[0]![0], p[1] - pts[0]![1]));
    for (let i = 0; i + 1 < pts.length; i += 1) best = Math.min(best, segDist(p, pts[i]!, pts[i + 1]!));
  }
  return best;
}
const FILLED = ['bk-hub', 'bk-bb', 'bk-motor', 'bk-saddle', 'bk-hood', 'bk-battery'];

/** How far a point is from the part as drawn: its drawing's elements (both wheels), its piece, else its point. */
export function spotDistance(svg: string, spot: Spot, p: P): number {
  let best = Math.hypot(p[0] - spot.at[0], p[1] - spot.at[1]);
  if (spot.piece) best = Math.min(best, pathDist(spot.piece.d, p) - spot.piece.w / 2);
  for (const m of svg.matchAll(/<(path|circle|rect)\b([^>]*?)\/>/g)) {
    const attrs = m[2]!;
    const own = /\bclass="([^"]*)"/.exec(attrs)?.[1]?.split(' ') ?? [];
    const hit = own.find((c) => spot.ink.includes(c));
    if (!hit) continue;
    const num = (name: string): number => Number(new RegExp(`(?:^|\\s)${name}="([-\\d.]+)"`).exec(attrs)?.[1] ?? NaN);
    const half = (num('stroke-width') || 0) / 2;
    if (m[1] === 'circle') {
      const d = Math.hypot(p[0] - num('cx'), p[1] - num('cy'));
      best = Math.min(best, FILLED.includes(hit) ? Math.max(0, d - num('r')) : Math.abs(d - num('r')) - half);
    } else if (m[1] === 'rect') {
      best = Math.min(best, Math.max(0, Math.hypot(p[0] - (num('x') + num('width') / 2), p[1] - (num('y') + num('height') / 2)) - num('height')));
    } else {
      let d = /\bd="([^"]*)"/.exec(attrs)?.[1] ?? '';
      if (spot.barOnly && hit === 'bk-bar') d = d.replace(/^M[^M]*/, '');
      best = Math.min(best, pathDist(d, p) - (FILLED.includes(hit) ? 2 : half));
    }
  }
  return Math.max(0, best);
}

/**
 * The part a tap at `p` picks (drawing units): the nearest drawn part within `reach`, the frame's own tubes before the frame as a whole
 * (the frame is picked from its label or the list). Ties go to the smaller part, the later in the list.
 */
export function pickAt(svg: string, spots: readonly (readonly [LearnId, Spot])[], p: P, reach: number): LearnId | null {
  let best: { id: LearnId; d: number } | null = null;
  for (const [id, s] of spots) {
    if (id === 'frame') continue;
    const d = spotDistance(svg, s, p);
    if (d <= reach && (!best || d <= best.d)) best = { id, d };
  }
  return best?.id ?? null;
}

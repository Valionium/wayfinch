// The Bike finder (design of 14 November 2026): five questions, one table of points, and the bike types that fit, best first. Pure: the
// page (src/tools/finder/ui.tsx) hands in the rider's answers; the words are in src/core/wording/en-finder.ts. Types only (How a bike is
// built's eight), never models, brands or prices.
import type { LearnKind } from '../parts/learn.ts';

/** How a bike is built's types, in its order (`KINDS`): each result opens its own drawing there. */
export const TYPES = ['road', 'gravel', 'touring', 'city', 'mtb', 'full', 'fat', 'ebike'] as const satisfies readonly LearnKind[];
export type FinderType = (typeof TYPES)[number];

export const QUESTIONS = {
  rides: ['day', 'commute', 'touring', 'bikepacking'],
  ground: ['paved', 'mixed', 'gravel', 'trails', 'soft'],
  carry: ['little', 'day', 'days'],
  pace: ['speed', 'balance', 'comfort'],
  motor: ['yes', 'no', 'unsure'],
} as const;
export type Question = keyof typeof QUESTIONS;
export const ORDER: readonly Question[] = ['rides', 'ground', 'carry', 'pace', 'motor'];
export type Answers = { [Q in Question]?: (typeof QUESTIONS)[Q][number] };
export type Full = Required<Answers>;
export type AnswerKey = `${Question}:${string}`;
export const answerKey = (q: Question, v: string): AnswerKey => `${q}:${v}`;

/**
 * Each answer's points for each type, in TYPES' order: road, gravel, touring, city, mountain hardtail, full suspension, fat, e-bike (the
 * learn page's everyday e-bike). A type's total is the sum over the five answers.
 */
export const POINTS: Readonly<Record<string, readonly number[]>> = {
  'rides:day': [3, 2, 0, 1, 1, 1, 0, 1],
  'rides:commute': [1, 2, 2, 3, 0, -1, -2, 3],
  'rides:touring': [-1, 1, 3, 0, 1, -1, 0, 1],
  'rides:bikepacking': [-2, 2, 1, -3, 3, 1, 1, -1],
  'ground:paved': [3, 1, 2, 2, -1, -2, -3, 2],
  'ground:mixed': [0, 3, 2, 1, 1, 0, -1, 1],
  'ground:gravel': [-2, 3, 1, -1, 2, 1, 0, 0],
  'ground:trails': [-3, -1, -2, -3, 3, 3, 1, -2],
  'ground:soft': [-3, -2, -2, -3, 1, -1, 4, -2],
  'carry:little': [1, 0, -1, 1, 1, 1, 0, 0],
  'carry:day': [0, 1, 1, 2, 0, 0, 0, 1],
  'carry:days': [-2, 2, 3, 0, 1, -1, 1, 1],
  'pace:speed': [3, 2, -1, -2, 0, 0, -2, 0],
  'pace:balance': [1, 2, 1, 1, 1, 0, 0, 1],
  'pace:comfort': [-2, 1, 2, 3, 1, 2, 1, 2],
  'motor:yes': [0, 0, 0, 0, 0, 0, 0, 4],
  'motor:no': [0, 0, 0, 0, 0, 0, 0, 0],
  'motor:unsure': [0, 0, 0, 0, 0, 0, 0, 1],
};

/**
 * The ground that needs a type of its own (review of PR 158, C1 and C2): rough trails a mountain bike, sand or snow a fat bike. Those types
 * are always listed, first, whatever the other answers say.
 */
export const NEEDS: Readonly<Partial<Record<Full['ground'], readonly FinderType[]>>> = { trails: ['mtb', 'full'], soft: ['fat'] };

/** The questions not answered yet, in order. */
export const missing = (a: Answers): Question[] => ORDER.filter((q) => !(QUESTIONS[q] as readonly string[]).includes(a[q] ?? ''));
export const complete = (a: Answers): a is Full => missing(a).length === 0;

/**
 * A reason: an answer that counts for the type, or `need:<ground>`, the line of a ground that needs the type, for a type the ground alone
 * speaks for.
 */
export type Reason = AnswerKey | `need:${string}`;
/**
 * One type that fits: its total, its reasons (the answers for it, most points first, at most three) and the answer most against it, if any;
 * `needed` when the ground needs it.
 */
export type Fit = { type: FinderType; total: number; why: Reason[]; mind: AnswerKey | null; needed: boolean };

/**
 * The types that fit, at most three: the types the ground needs (NEEDS) first, always; then the rest, best first. Left out: a type whose
 * ground answer is -2 or less (not made for that ground), the e-bike when the rider wants no motor, and, unless the ground needs it, a type
 * with fewer than two answers for it, a total of zero or less, or under half the best total. Best first: more points, then the better fit
 * for the ground, then TYPES' order.
 */
export function findTypes(a: Full): Fit[] {
  const needs = NEEDS[a.ground] ?? [];
  const ground = answerKey('ground', a.ground);
  const fits: Fit[] = [];
  TYPES.forEach((type, col) => {
    const given = ORDER.map((q) => answerKey(q, a[q]));
    const pts = (k: AnswerKey): number => POINTS[k]![col]!;
    if (pts(ground) <= -2 || (type === 'ebike' && a.motor === 'no')) return;
    const needed = needs.includes(type);
    const forIt = given.filter((k) => pts(k) > 0);
    const total = given.reduce((s, k) => s + pts(k), 0);
    if (!needed && (forIt.length < 2 || total <= 0)) return;
    // a stable sort keeps the question order on a tie; a type only its ground speaks for gets that ground's own line too
    const why: Reason[] = [...forIt].sort((x, y) => pts(y) - pts(x)).slice(0, 3);
    if (why.length < 2) why.push(`need:${a.ground}`);
    const against = given.filter((k) => pts(k) < 0);
    const mind = against.length ? against.reduce((lo, k) => (pts(k) < pts(lo) ? k : lo)) : null;
    fits.push({ type, total, why, mind, needed });
  });
  const fit = (f: Fit): number => POINTS[ground]![TYPES.indexOf(f.type)]!;
  fits.sort((x, y) => Number(y.needed) - Number(x.needed) || y.total - x.total || fit(y) - fit(x));
  const best = Math.max(...fits.map((f) => f.total));
  return fits.filter((f) => f.needed || f.total * 2 >= best).slice(0, 3);
}

/** What to look for on a type: its tyres, mounts (for kit for several days, those that carry it), gears and brakes, then what it adds. */
export type Look = 'tyres' | 'mounts' | 'mountsDays' | 'gears' | 'brakes' | 'suspension' | 'motor' | 'motorToo';
export function lookFor(type: FinderType, a: Full): Look[] {
  const out: Look[] = ['tyres', a.carry === 'days' ? 'mountsDays' : 'mounts', 'gears', 'brakes'];
  if (type === 'mtb' || type === 'full') out.push('suspension');
  if (type === 'ebike') out.push('motor');
  else if (a.motor === 'yes') out.push('motorToo');
  return out;
}

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
  'ground:soft': [-3, -1, -2, -3, 1, -1, 4, -2],
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

/** The questions not answered yet, in order. */
export const missing = (a: Answers): Question[] => ORDER.filter((q) => !(QUESTIONS[q] as readonly string[]).includes(a[q] ?? ''));
export const complete = (a: Answers): a is Full => missing(a).length === 0;

/** One type that fits: its total, the answers for it (most points first, at most three) and the one most against it, if any. */
export type Fit = { type: FinderType; total: number; why: AnswerKey[]; mind: AnswerKey | null };

/**
 * The types that fit, best first, at most three. Left out: a type whose ground answer is -2 or less (not made for that ground), the e-bike
 * when the rider wants no motor, a type with fewer than two answers for it, a total of zero or less, or under half the best total. A tie
 * keeps TYPES' order.
 */
export function findTypes(a: Full): Fit[] {
  const fits: Fit[] = [];
  TYPES.forEach((type, col) => {
    const given = ORDER.map((q) => answerKey(q, a[q]));
    const pts = (k: AnswerKey): number => POINTS[k]![col]!;
    if (pts(answerKey('ground', a.ground)) <= -2 || (type === 'ebike' && a.motor === 'no')) return;
    const forIt = given.filter((k) => pts(k) > 0);
    const total = given.reduce((s, k) => s + pts(k), 0);
    if (forIt.length < 2 || total <= 0) return;
    // a stable sort keeps the question order on a tie
    const why = [...forIt].sort((x, y) => pts(y) - pts(x)).slice(0, 3);
    const against = given.filter((k) => pts(k) < 0);
    const mind = against.length ? against.reduce((lo, k) => (pts(k) < pts(lo) ? k : lo)) : null;
    fits.push({ type, total, why, mind });
  });
  fits.sort((x, y) => y.total - x.total);
  const best = fits[0]?.total ?? 0;
  return fits.filter((f) => f.total * 2 >= best).slice(0, 3);
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

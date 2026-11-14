// The Bike finder (design of 14 November 2026): five questions, one table of points, the types that fit with their reasons, at most one
// Keep in mind line, and what to look for. Every one of the 540 answer sets is walked: each gives one to three types, the type its ground
// needs first (review of PR 158, C1 and C2), then the rest best first.
import { expect, test } from 'vitest';
import { answerKey, complete, findTypes, lookFor, missing, NEEDS, ORDER, POINTS, QUESTIONS, TYPES } from '../../../../src/core/finder/rank.ts';
import type { AnswerKey, Answers, FinderType, Full, Question } from '../../../../src/core/finder/rank.ts';
import { KINDS } from '../../../../src/core/parts/learn.ts';
import { FN, FN_ANSWERS, FN_LOOK, FN_LOOK_LABEL, FN_MIND, FN_MOTOR_TOO, FN_NEED, FN_QUESTIONS, FN_TYPES, FN_WHY } from '../../../../src/core/wording/en-finder.ts';
import { FL } from '../../../../src/core/wording/en-finder-link.ts';
import { bannedHits } from '../../../fixtures/banned.ts';

/** Every answer set: 4 x 5 x 3 x 3 x 3. */
function allSets(): Full[] {
  let sets: Answers[] = [{}];
  for (const q of ORDER) sets = sets.flatMap((a) => QUESTIONS[q].map((v) => ({ ...a, [q]: v })));
  return sets as Full[];
}
const ALL = allSets();
const first = (a: Full): FinderType | undefined => findTypes(a)[0]?.type;
const set = (rides: Full['rides'], ground: Full['ground'], carry: Full['carry'], pace: Full['pace'], motor: Full['motor']): Full => ({ rides, ground, carry, pace, motor });

test('[BF-QUESTIONS] five questions in order, each with its own answers, its words and each answer\'s words', () => {
  expect(ORDER).toEqual(['rides', 'ground', 'carry', 'pace', 'motor']);
  expect(QUESTIONS).toEqual({
    rides: ['day', 'commute', 'touring', 'bikepacking'],
    ground: ['paved', 'mixed', 'gravel', 'trails', 'soft'],
    carry: ['little', 'day', 'days'],
    pace: ['speed', 'balance', 'comfort'],
    motor: ['yes', 'no', 'unsure'],
  });
  expect(ALL.length).toBe(540);
  for (const q of ORDER) {
    expect(FN_QUESTIONS[q], q).toMatch(/\?$/);
    for (const v of QUESTIONS[q]) expect((FN_ANSWERS[q] as Record<string, string>)[v], `${q}:${v}`).toBeTruthy();
  }
  // the types are How a bike is built's, in its order, so every result opens its own drawing
  expect(TYPES).toEqual(KINDS);
  expect(missing({})).toEqual(ORDER);
  expect(missing({ rides: 'day', carry: 'little' })).toEqual(['ground', 'pace', 'motor']);
  expect(complete({ rides: 'day', carry: 'little' })).toBe(false);
  expect(complete(set('day', 'paved', 'little', 'speed', 'no'))).toBe(true);
});

test('[BF-RANK] every answer set gives one to three types: the types its ground needs first, always; then the rest best first by points, each with two answers or more for it', () => {
  // the table: one row per answer, a number per type, from -3 to +4
  for (const q of ORDER) for (const v of QUESTIONS[q]) {
    const row = POINTS[answerKey(q, v)];
    expect(row, `${q}:${v}`).toHaveLength(TYPES.length);
    for (const p of row!) expect(p >= -3 && p <= 4, `${q}:${v}`).toBe(true);
  }
  // the ground that needs its own type: rough trails a mountain bike, sand or snow a fat bike (review of PR 158, C1 and C2)
  expect(NEEDS).toEqual({ trails: ['mtb', 'full'], soft: ['fat'] });
  const col = (t: FinderType): number => TYPES.indexOf(t);
  const pts = (a: Full, q: Question, t: FinderType): number => POINTS[answerKey(q, a[q])]![col(t)]!;
  const total = (a: Full, t: FinderType): number => ORDER.reduce((s, q) => s + pts(a, q, t), 0);
  // best first: more points, then the better fit for the ground, then the learn page's order
  const before = (a: Full, x: FinderType, y: FinderType): boolean =>
    total(a, x) > total(a, y) || (total(a, x) === total(a, y) && (pts(a, 'ground', x) > pts(a, 'ground', y) || (pts(a, 'ground', x) === pts(a, 'ground', y) && col(x) < col(y))));
  for (const a of ALL) {
    const fits = findTypes(a);
    const label = JSON.stringify(a);
    expect(fits.length, label).toBeGreaterThanOrEqual(1);
    expect(fits.length, label).toBeLessThanOrEqual(3);
    expect(new Set(fits.map((f) => f.type)).size, label).toBe(fits.length);
    const needs = NEEDS[a.ground] ?? [];
    // every type the ground needs is listed, at the front
    const lead = fits.filter((f) => needs.includes(f.type));
    expect(lead.length, label).toBe(needs.length);
    expect(fits.slice(0, lead.length), label).toEqual(lead);
    const best = Math.max(...fits.map((f) => f.total));
    fits.forEach((f, i) => {
      expect(f.total, label).toBe(total(a, f.type));
      expect(f.needed, label).toBe(needs.includes(f.type));
      // ground the type is not made for (-2 or less) leaves it out
      expect(pts(a, 'ground', f.type), label).toBeGreaterThan(-2);
      if (i > 0 && fits[i - 1]!.needed === f.needed) expect(before(a, fits[i - 1]!.type, f.type), label).toBe(true);
      if (f.needed) return;
      expect(f.total, label).toBeGreaterThan(0);
      expect(f.total * 2, label).toBeGreaterThanOrEqual(best);
      expect(ORDER.filter((q) => pts(a, q, f.type) > 0).length, label).toBeGreaterThanOrEqual(2);
    });
    if (a.motor === 'no') expect(fits.some((f) => f.type === 'ebike'), label).toBe(false);
  }
  // the same answers always give the same list
  const a = set('bikepacking', 'gravel', 'days', 'balance', 'no');
  expect(findTypes(a)).toEqual(findTypes({ ...a }));
});

test('[BF-SENSIBLE] answer sets a rider would give get the type a bike shop would name first; every one of the 540 sets keeps the rules of its ground', () => {
  expect(first(set('day', 'paved', 'little', 'speed', 'no'))).toBe('road');
  expect(first(set('commute', 'paved', 'day', 'comfort', 'no'))).toBe('city');
  expect(first(set('commute', 'paved', 'day', 'comfort', 'yes'))).toBe('ebike');
  expect(first(set('touring', 'mixed', 'days', 'balance', 'no'))).toBe('touring');
  expect(first(set('bikepacking', 'gravel', 'days', 'balance', 'no'))).toBe('gravel');
  expect(first(set('bikepacking', 'trails', 'days', 'comfort', 'no'))).toBe('mtb');
  expect(first(set('day', 'trails', 'little', 'comfort', 'no'))).toBe('full');
  expect(first(set('day', 'trails', 'little', 'speed', 'no'))).toBe('mtb');
  expect(first(set('day', 'soft', 'little', 'comfort', 'no'))).toBe('fat');
  expect(first(set('day', 'mixed', 'day', 'balance', 'no'))).toBe('gravel');
  // the review's two cases (PR 158, C1 and C2)
  expect(first(set('day', 'soft', 'day', 'balance', 'no'))).toBe('fat');
  expect(findTypes(set('commute', 'trails', 'day', 'speed', 'no')).map((f) => f.type).slice(0, 2)).toEqual(['mtb', 'full']);
  // each ground's rules, over every answer set
  const RULES: Record<Full['ground'], { first: readonly FinderType[]; never: readonly FinderType[] }> = {
    paved: { first: ['road', 'gravel', 'touring', 'city', 'ebike'], never: ['full', 'fat'] },
    mixed: { first: ['gravel', 'touring', 'city', 'mtb', 'ebike'], never: [] },
    gravel: { first: ['gravel', 'touring', 'mtb', 'full', 'ebike'], never: ['road'] },
    trails: { first: ['mtb', 'full'], never: ['road', 'touring', 'city', 'ebike'] },
    soft: { first: ['fat'], never: ['road', 'gravel', 'touring', 'city', 'ebike'] },
  };
  for (const a of ALL) {
    const types = findTypes(a).map((f) => f.type);
    const label = JSON.stringify(a);
    expect(RULES[a.ground].first, label).toContain(types[0]);
    for (const t of RULES[a.ground].never) expect(types, label).not.toContain(t);
    // rough trails list both mountain bikes; sand or snow the fat bike; neither ever shows a gravel bike alone or first
    if (a.ground === 'trails') expect(types, label).toEqual(expect.arrayContaining(['mtb', 'full']));
    if (a.ground === 'soft') expect(types, label).toContain('fat');
  }
});

test('[BF-REASONS] each type has two or three reasons, each one of the rider\'s answers for it, most points first, or its ground\'s own line for the type that ground needs; at most one Keep in mind line, its lowest answer', () => {
  for (const a of ALL) {
    for (const f of findTypes(a)) {
      const label = `${JSON.stringify(a)} ${f.type}`;
      const col = TYPES.indexOf(f.type);
      expect(f.why.length, label).toBeGreaterThanOrEqual(2);
      expect(f.why.length, label).toBeLessThanOrEqual(3);
      expect(new Set(f.why).size, label).toBe(f.why.length);
      const answers = f.why.filter((k): k is AnswerKey => !k.startsWith('need:'));
      const pts = answers.map((k) => POINTS[k]![col]!);
      for (const k of answers) {
        // a key of an answer the rider gave, with words for this type
        expect(ORDER.some((q) => answerKey(q, a[q]) === k), label).toBe(true);
        expect(POINTS[k]![col]!, label).toBeGreaterThan(0);
        expect(FN_WHY[k]?.[f.type], `${label} ${k}`).toBeTruthy();
      }
      for (let i = 1; i < pts.length; i++) expect(pts[i - 1]! >= pts[i]!, label).toBe(true);
      // the ground's own line: only for the type it needs, only when fewer than two answers count for it, and last
      const need = f.why.filter((k) => k.startsWith('need:'));
      if (need.length > 0) {
        expect(need, label).toEqual([`need:${a.ground}`]);
        expect(f.needed, label).toBe(true);
        expect(answers.length, label).toBe(1);
        expect(f.why[f.why.length - 1], label).toBe(need[0]);
        expect(FN_NEED[need[0]!], label).toBeTruthy();
      }
      const given = ORDER.map((q) => answerKey(q, a[q]));
      const below = given.filter((k) => POINTS[k]![col]! < 0);
      if (below.length === 0) expect(f.mind, label).toBeNull();
      else {
        const low = Math.min(...below.map((k) => POINTS[k]![col]!));
        expect(f.mind, label).toBe(below.find((k) => POINTS[k]![col] === low));
        expect(FN_MIND[f.mind!], `${label} ${f.mind}`).toBeTruthy();
      }
    }
  }
  // a reason from another answer never names a ground, so it never disagrees with the rider's (review of PR 158, M1)
  for (const [k, byType] of Object.entries(FN_WHY)) {
    if (k.startsWith('ground:')) continue;
    for (const [t, words] of Object.entries(byType)) expect(words, `${k} ${t}`).not.toMatch(/paved|gravel|trail|sand|snow|off.?road|rough|track|street|path/i);
  }
  const touring = findTypes(set('touring', 'mixed', 'days', 'balance', 'no'))[0]!;
  expect(touring.why[0]).toBe('rides:touring');
  expect(FN_WHY['rides:touring']!.touring).toBe('Built for touring with a rack and panniers.');
  // a road bike for kit for several days says where it falls short
  const road = findTypes(set('day', 'paved', 'days', 'speed', 'no')).find((f) => f.type === 'road')!;
  expect(road.mind).toBe('carry:days');
  // a fat bike that only the ground speaks for gets the ground's own line too
  const fat = findTypes(set('commute', 'soft', 'little', 'speed', 'no'))[0]!;
  expect(fat.type).toBe('fat');
  expect(fat.why).toEqual(['ground:soft', 'need:soft']);
});

test('[BF-LOOK] each type says what to look for: tyres, mounts, gears, brakes; kit for several days its own mounts; suspension, a motor where they belong', () => {
  for (const a of ALL) {
    for (const f of findTypes(a)) {
      const look = lookFor(f.type, a);
      const label = `${JSON.stringify(a)} ${f.type}`;
      expect(look.slice(0, 4), label).toEqual(['tyres', a.carry === 'days' ? 'mountsDays' : 'mounts', 'gears', 'brakes']);
      expect(look.includes('suspension'), label).toBe(f.type === 'mtb' || f.type === 'full');
      expect(look.includes('motor'), label).toBe(f.type === 'ebike');
      // a motor wanted: every other type says it is also made with one
      expect(look.includes('motorToo'), label).toBe(a.motor === 'yes' && f.type !== 'ebike');
    }
  }
  for (const t of TYPES) {
    const w = FN_LOOK[t];
    for (const k of ['tyres', 'mounts', 'mountsDays', 'gears', 'brakes'] as const) expect(w[k], `${t} ${k}`).toBeTruthy();
    // tyre widths in mm, always
    expect(w.tyres, t).toMatch(/\d+–\d+ mm/);
  }
  expect(FN_LOOK.mtb.suspension).toBeTruthy();
  expect(FN_LOOK.full.suspension).toBeTruthy();
  expect(FN_LOOK.ebike.motor).toBeTruthy();
  for (const k of ['tyres', 'mounts', 'mountsDays', 'gears', 'brakes', 'suspension', 'motor', 'motorToo'] as const) expect(FN_LOOK_LABEL[k]).toBeTruthy();
  // frame size: the maker's size chart, no fitting advice
  expect(FN.frame).toContain('size chart');
  expect(FN.frame).not.toMatch(/\bcm\b|inseam|height|tall/i);
});

test('[BF-WORDS] every word of the finder and its card has no banned word, and names no brand, model or price', () => {
  const texts: string[] = [
    ...Object.values(FN).map((v) => (typeof v === 'function' ? (v as (n: number) => string)(2) : v)),
    ...Object.values(FL), ...Object.values(FN_QUESTIONS), ...Object.values(FN_TYPES), FN_MOTOR_TOO,
    ...Object.values(FN_ANSWERS).flatMap((m) => Object.values(m as Record<string, string>)),
    ...Object.values(FN_WHY).flatMap((m) => Object.values(m as Record<string, string>)),
    ...Object.values(FN_MIND), ...Object.values(FN_NEED), ...Object.values(FN_LOOK_LABEL),
    ...Object.values(FN_LOOK).flatMap((m) => Object.values(m as Record<string, string>)),
  ];
  expect(texts.length).toBeGreaterThan(100);
  for (const s of texts) {
    expect(typeof s).toBe('string');
    expect(bannedHits(s), s).toEqual([]);
    expect(s, s).not.toMatch(/[€$£¥]|\b(eur|usd|gbp|price|prices|cost|cheap)\b/i);
    expect(s, s).not.toMatch(/\b(shimano|sram|campagnolo|bosch|yamaha|brose|rohloff|trek|specialized|giant|cube|canyon|cannondale|surly|brompton|scott|bianchi|riese|gazelle|schwalbe|continental|fox|rockshox)\b/i);
  }
  for (const q of ORDER as Question[]) expect(FN_QUESTIONS[q]).toBeTruthy();
});

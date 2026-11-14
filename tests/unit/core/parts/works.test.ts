// How it works (design of 14 November 2026, "How a bike works"): the learn page's third way in. Six topics in the order the push of a
// foot reaches the road, each a few short steps naming the parts they move; a step about a part the bike shown lacks names a typical
// bike that has it; the words are plain, short and say only what is so.
import { expect, test } from 'vitest';
import { resolveBikeSpec } from '../../../../src/core/bike/spec.ts';
import { hasPart, KINDS, kindBike, LEARN_PARTS, ownBike, partsOf } from '../../../../src/core/parts/learn.ts';
import type { LearnBike, LearnId } from '../../../../src/core/parts/learn.ts';
import { missingOf, stepMarked, TOPICS, WORK_STEPS } from '../../../../src/core/parts/works.ts';
import { LN } from '../../../../src/core/wording/en-learn.ts';
import { LW, TOPIC_NAMES, TOPIC_STEPS, worksHeading, worksSaid } from '../../../../src/core/wording/en-works.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { setBike } from '../bike/drawing-set.ts';

const ALL: LearnId[] = LEARN_PARTS.map((p) => p.id);
const sentencesOf = (s: string): string[] => s.split(/(?<=[.!?])\s+/).filter(Boolean);
const wordsOf = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const text = (topic: (typeof TOPICS)[number]): string => TOPIC_STEPS[topic].join(' ');

test('[BW-TOPICS] six topics from the pedals to the road, each 4 or 5 steps, every step with its words and the parts it moves', () => {
  expect(TOPICS).toEqual(['cranks', 'chain', 'gears', 'freehub', 'brakes', 'pressure']);
  expect(TOPICS.map((t) => TOPIC_NAMES[t])).toEqual(['Cranks and bottom bracket', 'Chain and gear ratio', 'Gears and shifting', 'Freehub and coasting', 'Brakes', 'Tyre pressure']);
  for (const t of TOPICS) {
    const steps = WORK_STEPS[t];
    expect(steps.length, t).toBeGreaterThanOrEqual(4);
    expect(steps.length, t).toBeLessThanOrEqual(5);
    expect(TOPIC_STEPS[t].length, t).toBe(steps.length);
    steps.forEach((s, i) => {
      expect(s.parts.length, `${t} ${i}`).toBeGreaterThan(0);
      for (const p of s.parts) expect(ALL, `${t} ${i} ${p}`).toContain(p);
      // a step's own part, where it has one, is one of its parts
      if (s.key) expect(s.parts).toContain(s.key);
      // some typical bike shows at least one of the step's parts
      expect(KINDS.some((k) => s.parts.some((p) => hasPart(kindBike(k), p))), `${t} ${i}`).toBe(true);
      expect(TOPIC_STEPS[t][i]!.length, `${t} ${i}`).toBeGreaterThan(20);
    });
  }
});

test('[BW-TOPICS] the drawing marks the step\'s parts that the bike shown has, in the step\'s order, never one it lacks', () => {
  const gravel = kindBike('gravel');
  expect(stepMarked(gravel, 'gears', 0)).toEqual(['shifter', 'gear-cable']);
  // a gravel bike has one chainring: the front derailleur step marks only the chainring
  expect(stepMarked(gravel, 'gears', 2)).toEqual(['chainring']);
  expect(stepMarked(kindBike('road'), 'gears', 2)).toEqual(['front-derailleur', 'chainring']);
  expect(stepMarked(kindBike('city'), 'brakes', 1)).toEqual(['pads', 'rim-brake']);
  expect(stepMarked(gravel, 'brakes', 1)).toEqual(['caliper', 'disc', 'pads']);
  for (const k of KINDS) {
    const bike = kindBike(k);
    for (const t of TOPICS) WORK_STEPS[t].forEach((_, i) => {
      for (const p of stepMarked(bike, t, i)) expect(partsOf(bike), `${k} ${t} ${i}`).toContain(p);
    });
  }
  // the rider's electronic gears have no gear cable to mark
  const r = setBike('diamond-sloping', 'M', 'drop', false, ['28-622', '28-622'], null, { brakes: 'hydraulic-disc', drive: 'derailleur', shifting: 'electronic' });
  const own = ownBike(resolveBikeSpec(r, null), r);
  expect(stepMarked(own, 'gears', 0)).toEqual(['shifter']);
  // review of PR 157, M5: a hydraulic bike's brakes step marks no barrel adjuster (the cable's) and no pad adjuster
  expect(stepMarked(own, 'brakes', 3)).toEqual(['brake-cable', 'caliper']);
  for (const s of WORK_STEPS.brakes) expect(s.parts).not.toContain('barrel');
  expect(stepMarked(kindBike('city'), 'brakes', 3)).toEqual(['brake-cable', 'rim-brake']);
});

test('[BW-TOPICS] the freehub steps mark the rear of the bike: the rear gears or the hub gears, never the hub, whose label is the front one', () => {
  for (const s of WORK_STEPS.freehub) expect(s.parts).not.toContain('hub');
  // the Wheel (PR 161) is labelled on the front wheel too: no step marks it, so the rear wheel's steps never name the front one, and
  // the tyre pressure steps mean the rim itself (dented; its highest pressure), so they keep the Rim
  for (const s of TOPICS.flatMap((t) => WORK_STEPS[t])) expect(s.parts).not.toContain('wheel');
  expect(WORK_STEPS.pressure[2]!.parts).toContain('rim');
  expect(WORK_STEPS.pressure[3]!.parts).toContain('rim');
  expect(stepMarked(kindBike('gravel'), 'freehub', 0)).toEqual(['cassette', 'derailleur']);
  expect(stepMarked(kindBike('gravel'), 'freehub', 2)).toEqual(['cassette']);
  expect(stepMarked(kindBike('city'), 'freehub', 1)).toEqual(['hub-gears', 'chain']);
  expect(stepMarked(kindBike('city'), 'freehub', 2)).toEqual(['hub-gears']);
  expect(stepMarked(kindBike('city'), 'freehub', 4)).toEqual(['hub-gears']);
});

test('[BW-MISSING] a step about a part the bike shown lacks names the first typical bike that has it; with the part there, no line', () => {
  const gravel = kindBike('gravel');
  expect(missingOf(gravel, 'gears', 2)).toEqual({ part: 'front-derailleur', kind: 'road' });
  expect(missingOf(gravel, 'gears', 3)).toEqual({ part: 'hub-gears', kind: 'city' });
  expect(missingOf(gravel, 'cranks', 4)).toEqual({ part: 'motor', kind: 'ebike' });
  expect(missingOf(kindBike('road'), 'gears', 2)).toBeNull();
  expect(missingOf(kindBike('city'), 'gears', 1)).toEqual({ part: 'derailleur', kind: 'road' });
  expect(missingOf(kindBike('ebike'), 'cranks', 4)).toBeNull();
  for (const k of KINDS) {
    const bike: LearnBike = kindBike(k);
    for (const t of TOPICS) WORK_STEPS[t].forEach((s, i) => {
      const m = missingOf(bike, t, i);
      if (!s.key || hasPart(bike, s.key)) { expect(m, `${k} ${t} ${i}`).toBeNull(); return; }
      expect(m!.part).toBe(s.key);
      expect(hasPart(kindBike(m!.kind), s.key)).toBe(true);
      expect(KINDS.slice(0, KINDS.indexOf(m!.kind)).some((o) => hasPart(kindBike(o), s.key!))).toBe(false);
    });
  }
  // review of PR 157, C1: a bike with hub gears has rear gears, in its hub: no line ever says it has none; the freehub's first step is
  // about derailleur gears, so a hub-gear bike is told it has no rear derailleur, which is so
  for (const s of TOPICS.flatMap((t) => WORK_STEPS[t])) expect(s.key).not.toBe('cassette');
  expect(missingOf(kindBike('city'), 'freehub', 0)).toEqual({ part: 'derailleur', kind: 'road' });
  const belt = setBike('diamond-sloping', 'M', 'flat', false, ['40-622', '40-622'], null, { brakes: 'hydraulic-disc', drive: 'belt' });
  const hubs: LearnBike[] = [kindBike('city'), ownBike(resolveBikeSpec(belt, null), belt)];
  for (const bike of hubs) {
    expect(hasPart(bike, 'hub-gears')).toBe(true);
    for (const t of TOPICS) WORK_STEPS[t].forEach((_, i) => {
      const m = missingOf(bike, t, i);
      if (m) expect(LW.none(m.part, m.kind), `${t} ${i}`).not.toMatch(/rear gears|hub gears/i);
    });
  }
  // review of PR 157, M3: what a step says politely carries its line
  expect(worksSaid('gears', 2, missingOf(kindBike('gravel'), 'gears', 2))).toBe(`Step 3 of 5: Gears and shifting. ${TOPIC_STEPS.gears[2]} No front derailleur on the bike shown: choose Road in Bike to show.`);
  expect(worksSaid('gears', 2, null)).toBe(`Step 3 of 5: Gears and shifting. ${TOPIC_STEPS.gears[2]}`);
  expect(LW.none('front-derailleur', 'road')).toBe('No front derailleur on the bike shown: choose Road in Bike to show.');
  expect(LW.none('hub-gears', 'city')).toBe('No hub gears on the bike shown: choose City in Bike to show.');
});

test('[BW-WORDS] every word of How it works is plain: no banned word, every sentence at most 25 words, a step at most three sentences', () => {
  const texts = [
    ...TOPICS.map((t) => TOPIC_NAMES[t]), ...TOPICS.flatMap((t) => TOPIC_STEPS[t]),
    ...Object.values(LW).map((v) => (typeof v === 'function' ? (v as (...a: string[]) => string)('motor', 'ebike') : v)),
    worksHeading('brakes', 1), worksSaid('brakes', 1), LN.works, LN.worksFailed, LN.worksRetry,
  ];
  for (const t of texts) {
    expect(bannedHits(t), t).toEqual([]);
    for (const s of sentencesOf(t)) expect(wordsOf(s), s).toBeLessThanOrEqual(25);
  }
  for (const t of TOPICS) for (const s of TOPIC_STEPS[t]) expect(sentencesOf(s).length, s).toBeLessThanOrEqual(3);
  expect(worksHeading('brakes', 1)).toBe('Step 2 of 5: Brakes');
  expect(worksSaid('brakes', 1)).toBe(`Step 2 of 5: Brakes. ${TOPIC_STEPS.brakes[1]}`);
});

test('[BW-FACTS] the words say what is so: the ratio sum, easy and hard gears, coasting, the fluids never mixed, pedal threads, no tyre pressures', () => {
  // the gear ratio: teeth divided by teeth, one worked example that adds up
  expect(text('chain')).toMatch(/chainring's teeth divided by the cog's/);
  expect(text('chain')).toMatch(/40-tooth chainring and a 20-tooth cog give 2/);
  expect(text('chain')).toMatch(/small chainring or a big cog gives an easy gear/);
  expect(text('chain')).toMatch(/big chainring or a small cog gives a hard gear/);
  // shifting: the derailleur needs the chain turning; hub gears shift standing still; electronic gears have no cable
  expect(text('gears')).toMatch(/Keep pedalling/);
  expect(text('gears')).toMatch(/hub gears[^.]*\. [^.]*standing still/i);
  expect(text('gears')).toMatch(/Electronic gears have no gear cable/);
  // the freehub: pawls lock one way and slip the other; a fixed gear has none
  expect(text('freehub')).toMatch(/pawls/);
  expect(text('freehub')).toMatch(/fixed-gear bike has no freehub/);
  // brakes: friction into heat; mineral oil and DOT fluid never mixed, the brake says which
  expect(text('brakes')).toMatch(/heat/);
  expect(text('brakes')).toMatch(/mineral oil or DOT fluid/);
  expect(text('brakes')).toMatch(/Never mix/);
  expect(text('brakes')).not.toMatch(/Shimano|SRAM|Magura|Tektro|Hayes/);
  // review of PR 157: what holds on some bikes only says so (I1: cable gears; M1: a mid-drive's chainring; M2: a freewheel's ratchet)
  expect(TOPIC_STEPS.gears[0]).toMatch(/cable gears/);
  expect(TOPIC_STEPS.gears[1]).toMatch(/or on electronic gears a small motor/);
  expect(TOPIC_STEPS.cranks[2]).toMatch(/^On most bikes/);
  expect(TOPIC_STEPS.freehub[0]).toMatch(/^With derailleur gears, the rear gears usually/);
  // the left pedal's thread is reversed
  expect(text('cranks')).toMatch(/left pedal's thread runs the other way/);
  // tyre pressure: no figure anywhere (the Tyre pressure tool works it out), and never above the tyre's or rim's highest
  expect(text('pressure')).not.toMatch(/\d/);
  expect(text('pressure')).not.toMatch(/\b(bar|psi|kPa)\b/i);
  expect(text('pressure')).toMatch(/highest pressure the tyre or the rim allows/);
  expect(LW.tyreLink).toBe('Open Tyre pressure');
  expect(LW.tyreHref).toBe('#/tools/tyre');
});

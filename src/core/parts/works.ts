// How it works (design of 14 November 2026, "How a bike works"): the topics of the learn page's third way in, in the order the push of a
// foot reaches the road, and for each step the parts it moves (marked on the drawing) and, where the step is about one part, that part.
// Pure; the words are en-works.ts's. In the page's How it works chunk, never the first screen.
import { hasPart, KINDS, kindBike } from './learn.ts';
import type { LearnBike, LearnId, LearnKind } from './learn.ts';

export const TOPICS = ['cranks', 'chain', 'gears', 'freehub', 'brakes', 'pressure'] as const;
export type WorkTopic = (typeof TOPICS)[number];

/** A step's parts, and `key`: the part the step is about, where a bike without it gets a line naming a bike with it. */
export type WorkStep = { parts: readonly LearnId[]; key?: LearnId };

export const WORK_STEPS: Readonly<Record<WorkTopic, readonly WorkStep[]>> = {
  cranks: [
    { parts: ['bottom-bracket', 'crank'] },
    { parts: ['crank', 'pedal'] },
    { parts: ['crank', 'chainring', 'chain', 'belt'] },
    { parts: ['pedal', 'crank'] },
    { parts: ['motor', 'crank'], key: 'motor' },
  ],
  chain: [
    { parts: ['crank', 'chainring', 'chain'] },
    { parts: ['chain', 'belt', 'cassette', 'hub-gears'] },
    { parts: ['chainring', 'cassette', 'hub-gears'] },
    { parts: ['chainring', 'cassette'] },
    { parts: ['chainring', 'cassette', 'hub-gears'] },
  ],
  gears: [
    { parts: ['shifter', 'gear-cable'], key: 'shifter' },
    { parts: ['derailleur', 'cassette', 'chain'], key: 'derailleur' },
    { parts: ['front-derailleur', 'chainring'], key: 'front-derailleur' },
    { parts: ['hub-gears', 'shifter'], key: 'hub-gears' },
    { parts: ['shifter', 'derailleur', 'hub-gears'] },
  ],
  freehub: [
    { parts: ['cassette', 'hub'], key: 'cassette' },
    { parts: ['hub', 'cassette', 'chain'] },
    { parts: ['hub', 'cassette'] },
    { parts: ['pedal', 'crank', 'hub'] },
    { parts: ['hub-gears'], key: 'hub-gears' },
  ],
  brakes: [
    { parts: ['brake-lever', 'brake-cable'] },
    { parts: ['caliper', 'disc', 'pads', 'rim-brake'] },
    { parts: ['pads', 'disc', 'rim-brake'] },
    { parts: ['brake-cable', 'barrel', 'pad-adjuster', 'caliper'] },
    { parts: ['brake-lever', 'brake-cable', 'caliper'] },
  ],
  pressure: [
    { parts: ['tyre', 'valve'] },
    { parts: ['tyre'] },
    { parts: ['tyre', 'tube', 'rim'] },
    { parts: ['tyre', 'rim'] },
    { parts: ['tyre'] },
  ],
};

/** The step's parts the bike has, in the step's order: what the drawing marks and names. */
export const stepMarked = (bike: LearnBike, topic: WorkTopic, i: number): LearnId[] =>
  (WORK_STEPS[topic][i]?.parts ?? []).filter((p) => hasPart(bike, p));

/** The step's own part when the bike lacks it, with the first typical bike that has it; else null. */
export function missingOf(bike: LearnBike, topic: WorkTopic, i: number): { part: LearnId; kind: LearnKind } | null {
  const part = WORK_STEPS[topic][i]?.key;
  if (!part || hasPart(bike, part)) return null;
  const kind = KINDS.find((k) => hasPart(kindBike(k), part));
  return kind ? { part, kind } : null;
}

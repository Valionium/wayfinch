// How it works (design of 14 November 2026, "How a bike works"): the words of the learn page's third way in, in its own chunk (never the
// first screen's, nor the learn page's). Each topic's steps: what moves, then why, in short plain sentences; nothing that holds on some
// bikes only without saying so, no brand, no pressure figure. Under the banned-words test (tests/unit/core/parts/works.test.ts).
import type { LearnId, LearnKind } from '../parts/learn.ts';
import type { WorkTopic } from '../parts/works.ts';
import { KIND_NAMES, LN, nameOf } from './en-learn.ts';

export const TOPIC_NAMES: Readonly<Record<WorkTopic, string>> = {
  cranks: 'Cranks and bottom bracket', chain: 'Chain and gear ratio', gears: 'Gears and shifting', freehub: 'Freehub and coasting',
  brakes: 'Brakes', pressure: 'Tyre pressure',
};

/** Each topic's steps, one entry per step of WORK_STEPS (works.ts). */
export const TOPIC_STEPS: Readonly<Record<WorkTopic, readonly string[]>> = {
  cranks: [
    'The bottom bracket is a pair of bearings at the frame\'s lowest point. An axle, the spindle, runs through them and joins the two cranks.',
    'The cranks point opposite ways, so one pedal is up when the other is down. A push on a pedal turns its crank round, like a lever.',
    'On most bikes the chainring is fixed to the right crank, so each turn of the cranks turns it once. Its teeth pull the chain, or on some bikes a belt.',
    'Each pedal screws into its crank and turns on its own bearings. The left pedal\'s thread runs the other way, so pedalling does not unscrew it.',
    'On an e-bike with the motor at the cranks, the motor takes the bottom bracket\'s place. The cranks turn in it, and it adds its push to yours.',
  ],
  chain: [
    'As you pedal, the chainring turns with the cranks. Its teeth pull the chain round, so the length of chain along the top goes tight.',
    'The chain pulls a cog on the rear wheel round, and the cog turns the wheel. On a belt bike, a toothed belt does the chain\'s job.',
    'The gear ratio is the chainring\'s teeth divided by the cog\'s. A 40-tooth chainring and a 20-tooth cog give 2: the wheel turns twice for each turn of the pedals.',
    'A small chainring or a big cog gives an easy gear. Each turn of the pedals moves you a shorter way, so a climb needs less force.',
    'A big chainring or a small cog gives a hard gear: each turn takes you further, but needs more force. Hub gears change the ratio inside the hub as well.',
  ],
  gears: [
    'You move the shifter. On cable gears, it pulls or lets out the gear cable: a steel wire that slides inside a casing.',
    'The cable, or on electronic gears a small motor, swings the rear derailleur sideways. Its top wheel leads the chain onto a bigger cog for an easier gear, or a smaller one for a harder gear. Keep pedalling: the chain only moves across while it turns.',
    'With two or three chainrings, a front derailleur pushes the chain from one ring to the next. A smaller ring makes pedalling easier, a bigger one harder.',
    'Hub gears shift inside the rear hub, where small gears are sealed in. The chain stays on one sprocket, so you can shift standing still.',
    'Electronic gears have no gear cable. The shifter sends a signal, by wire or by radio, to a small motor that shifts the gears. A battery powers it.',
  ],
  freehub: [
    'With derailleur gears, the rear gears usually slide onto the freehub, a part of the rear hub. It drives the wheel one way and turns freely the other way.',
    'Inside, small spring-loaded catches called pawls lock into teeth in the hub as you pedal, so the chain turns the wheel. Some hubs use two toothed rings instead.',
    'Stop pedalling and the wheel turns faster than the gears. The catches slide over the teeth: that is the ticking many bikes make as they roll.',
    'So the pedals can stay still while the wheel rolls on. A fixed-gear bike has no freehub: its pedals turn whenever the wheel does.',
    'Most hub gears have the same kind of catch inside the hub, so you can coast on them too.',
  ],
  brakes: [
    'You pull the brake lever. It pulls a steel cable, or on hydraulic brakes it pushes fluid down a hose.',
    'At the wheel, a disc brake\'s caliper squeezes a pad onto each side of the disc. A rim brake squeezes its pads onto the sides of the rim.',
    'The pads rub and slow the wheel, turning your speed into heat. That is why a disc or a rim can be too hot to touch after a long descent.',
    'Mechanical brakes use a cable: it stretches a little over time, and the brake needs adjusting as the pads wear. Hydraulic disc brakes take up the wear by themselves.',
    'Hydraulic brakes are filled with one kind of fluid: mineral oil or DOT fluid. Never mix them or use the wrong one: it damages the seals, and the brake can fail. The brake, its lever or its manual says which.',
  ],
  pressure: [
    'The air in the tyre pushes out on it from inside. That pressure holds the tyre in shape and carries you, the bike and its load.',
    'Where the tyre meets the ground, it flattens into a patch. Less air makes the patch bigger: more grip and comfort, as the tyre soaks up bumps.',
    'Too little air, and a bump or an edge can squash the tyre right down onto the rim. That can pinch a tube (two small holes side by side, a snakebite) or dent the rim.',
    'Too much air, and the tyre bounces off small bumps: less grip, less comfort, and often slower on rough ground. Never go above the highest pressure the tyre or the rim allows.',
    'The right pressure depends on the weight the tyre carries, its width and the ground. More weight needs more air, and a wider tyre needs less. The Tyre pressure tool suggests one for your bike.',
  ],
};

export const LW = {
  topic: 'Topic',
  none: (part: LearnId, kind: LearnKind) => `No ${nameOf(part).toLowerCase()} on the bike shown: choose ${KIND_NAMES[kind]} in ${LN.kinds}.`,
  tyreLink: 'Open Tyre pressure',
  tyreHref: '#/tools/tyre',
};

/** "Step n of N: <topic>", as Build-up names its steps. */
export const worksHeading = (topic: WorkTopic, i: number): string => LN.step(i + 1, TOPIC_STEPS[topic].length, TOPIC_NAMES[topic]);
/** What a turn of the steps says politely: the heading, the step's words, and the line for a part the bike shown lacks (review of PR 157, M3). */
export const worksSaid = (topic: WorkTopic, i: number, missing: { part: LearnId; kind: LearnKind } | null = null): string =>
  `${worksHeading(topic, i)}. ${TOPIC_STEPS[topic][i]}${missing ? ` ${LW.none(missing.part, missing.kind)}` : ''}`;

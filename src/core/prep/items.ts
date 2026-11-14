// Trip prep: which "Before you leave" items show for a trip and a bike, and where in the app each is done (design of 15 November 2026).
// The bike checks are Bike care's own tasks, by their names and conditions, fitted as Bike care fits them (a Not sure detail shows the
// task, ruling R3 on PR 58); tests hold the names, the conditions and the fit equal to Bike care's. They are not imported from Bike care:
// that would split its chunk (BC-CHUNK) and name one chunk more in the first screen (TRIP-PREP-FIRST). Pure: no DOM, no storage, no clock.
import type { BikeRecord } from '../bike/normalise.ts';
import type { Conditions } from '../care/types.ts';
import type { Trip } from '../types.ts';
import { PR, PREP_CHECKS } from '../wording/en-prep.ts';

/** Where an item is done: Bike care, or not elsewhere in the app (outside it, or in the step the list is in). */
export type PrepLink = 'care' | null;
export type PrepItem = { id: string; text: string; link: PrepLink };
/** `days`: the route's stages; `bike`: Trip's bike (null: none, every detail Not sure). */
export type PrepFacts = { days: number; bike: Pick<BikeRecord, 'brakes' | 'drive'> | null };

/** Bike care's tasks with their conditions (en-care.ts): those for every trip, then those added for two days or more, in this order. */
export const EVERY_TRIP: readonly { id: string; applies: Conditions }[] = [
  { id: 'brakes-lever-test', applies: {} },
  { id: 'tyres-pressure', applies: {} },
];
export const LONGER_TRIP: readonly { id: string; applies: Conditions }[] = [
  { id: 'chain-wear-check', applies: { drive: ['chain'] } },
  { id: 'brakes-pads-disc', applies: { brakes: ['cable-disc', 'hydraulic-disc'] } },
  { id: 'brakes-pads-rim', applies: { brakes: ['rim'] } },
  { id: 'frame-bolts-check', applies: {} },
];

/** The facts of a trip and Trip's bike that the list depends on. */
export function prepFacts(trip: Trip, bike: BikeRecord | null): PrepFacts {
  return { days: trip.route.stages.length, bike: bike && { brakes: bike.brakes, drive: bike.drive } };
}

/**
 * Bike care's fit (care/fit.ts, careDetails and fitOf) on the two details these checks depend on: a Not sure detail passes, a value in
 * the list passes, any other value (Other included) hides the check.
 */
function fits(applies: Conditions, bike: PrepFacts['bike']): boolean {
  const brakes = !bike || bike.brakes === 'unknown' ? null : bike.brakes;
  const drive = !bike || bike.drive === 'unknown' ? null : bike.drive === 'belt' ? 'belt' : 'chain';
  return (brakes === null || !applies.brakes || (applies.brakes as readonly string[]).includes(brakes))
    && (drive === null || !applies.drive || applies.drive.includes(drive));
}

/** The list, in its order: the bike checks, then the kit, charging, the forecast, telling someone and, for two days or more, the first night. */
export function prepItems(f: PrepFacts): PrepItem[] {
  const longer = f.days >= 2;
  const checks = (longer ? [...EVERY_TRIP, ...LONGER_TRIP] : EVERY_TRIP)
    .filter((t) => fits(t.applies, f.bike))
    .map((t): PrepItem => ({ id: t.id, text: PREP_CHECKS[t.id]!, link: 'care' }));
  return [
    ...checks,
    { id: 'kit', text: PR.prepKit, link: 'care' },
    { id: 'charge', text: PR.prepCharge, link: null },
    // in the step the list is in: its own button
    { id: 'forecast', text: PR.prepForecast, link: null },
    // En route's Share progress needs a position on the route, so before leaving this is done outside the app.
    { id: 'tell', text: PR.prepTell, link: null },
    ...(longer ? [{ id: 'night', text: PR.prepNight, link: null }] : []),
  ];
}

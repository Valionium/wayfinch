// Trip prep: which "Before you leave" items show for a trip and a bike, and where in the app each is done (design of 15 November 2026).
// The bike checks are Bike care's own tasks, by their names, fitted as Bike care fits them (a Not sure detail shows the task, ruling R3 on
// PR 58). Pure: no DOM, no storage, no clock.
import type { BikeRecord } from '../bike/normalise.ts';
import { careDetails, fitOf } from '../care/fit.ts';
import type { CareDetails } from '../care/types.ts';
import { dayStopOf } from '../route/day-stops.ts';
import type { Trip } from '../types.ts';
import { CARE_TASKS } from '../wording/en-care.ts';
import { PR } from '../wording/en-prep.ts';

/** Where an item is done: Bike care, Trip's Prepare this route step, En route (Share progress), or outside the app. */
export type PrepLink = 'care' | 'prepare' | 'ahead' | null;
export type PrepItem = { id: string; text: string; link: PrepLink };
/** `days`: the route's stages; `prepared`: Prepare this route has ended once for this route; `firstStop`: the place day 1 ends at. */
export type PrepFacts = { days: number; details: CareDetails; prepared: boolean; firstStop: string | null };

/** Bike care's tasks for every trip, and those added for a trip of two days or more, in this order. */
const EVERY_TRIP: readonly string[] = ['brakes-lever-test', 'tyres-pressure'];
const LONGER_TRIP: readonly string[] = ['chain-wear-check', 'brakes-pads-disc', 'brakes-pads-rim', 'frame-bolts-check'];

/** The facts of a trip and Trip's bike that the list depends on. */
export function prepFacts(trip: Trip, bike: BikeRecord | null, prepared: boolean): PrepFacts {
  const stop = trip.route.stages.length >= 2 ? dayStopOf(trip, 0) : null;
  return { days: trip.route.stages.length, details: careDetails(bike), prepared, firstStop: stop && stop.placeId !== null && stop.name ? stop.name : null };
}

/** The list, in its order: the bike checks, then the kit, charging, the forecast, telling someone and, for two days or more, the first night. */
export function prepItems(f: PrepFacts): PrepItem[] {
  const longer = f.days >= 2;
  const checks = (longer ? [...EVERY_TRIP, ...LONGER_TRIP] : EVERY_TRIP).flatMap((id): PrepItem[] => {
    const task = CARE_TASKS.find((t) => t.id === id);
    return task && fitOf(task.applies, f.details).show ? [{ id: task.id, text: task.name, link: 'care' }] : [];
  });
  return [
    ...checks,
    { id: 'kit', text: PR.prepKit, link: 'care' },
    { id: 'charge', text: PR.prepCharge, link: null },
    { id: 'forecast', text: PR.prepForecast, link: 'prepare' },
    // En route's Share progress needs what Prepare this route saves.
    { id: 'tell', text: PR.prepTell, link: f.prepared ? 'ahead' : null },
    ...(longer ? [{ id: 'night', text: PR.prepNight(f.firstStop), link: null }] : []),
  ];
}

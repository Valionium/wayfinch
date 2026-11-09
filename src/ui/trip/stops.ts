// The stops on Trip's height profile (TRIP-STOPS), read from the store: the very inputs Ahead reads, through routeStops. A chunk of
// its own, loaded once the route summary shows a route Get ready offline has saved places for.
import { routeStops } from '../../core/screen/route-stops.ts';
import type { RouteStop } from '../../core/screen/route-stops.ts';
import { readInputs } from '../../store/inputs.ts';
import { dayBeds } from '../../core/engines/day-beds.ts';
import type { DayBed } from '../../core/engines/day-beds.ts';

/** Asked within this long of each other, the stops and the day-end beds share one read of the saved places (review of PR 98, M7). */
const SHARED_MS = 250;
let shared: { at: number; inputs: ReturnType<typeof readInputs> } | null = null;
function inputsAt(at: Date): ReturnType<typeof readInputs> {
  const now = Date.now();
  if (!shared || now - shared.at > SHARED_MS) shared = { at: now, inputs: readInputs(at) };
  return shared.inputs;
}

export async function readStops(at: Date): Promise<RouteStop[]> {
  const inputs = await inputsAt(at);
  return inputs ? routeStops(inputs) : [];
}

/** A place to sleep near each day's end (TRIP-DAY-BEDS), from the places Prepare this route saved, judged for each day's night. */
export async function readDayBeds(at: Date): Promise<DayBed[]> {
  const inputs = await inputsAt(at);
  return inputs ? dayBeds(inputs.trip.route, inputs.places, inputs.matches, inputs.trip.stay, { departureDate: inputs.trip.departureDate, hours: inputs.hours }) : [];
}

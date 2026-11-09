// The stops on Trip's height profile (TRIP-STOPS), read from the store: the very inputs Ahead reads, through routeStops. A chunk of
// its own, loaded once the route summary shows a route Get ready offline has saved places for.
import { routeStops } from '../../core/screen/route-stops.ts';
import type { RouteStop } from '../../core/screen/route-stops.ts';
import { readInputs } from '../../store/inputs.ts';
import { dayBeds } from '../../core/engines/day-beds.ts';
import type { DayBed } from '../../core/engines/day-beds.ts';

export async function readStops(at: Date): Promise<RouteStop[]> {
  const inputs = await readInputs(at);
  return inputs ? routeStops(inputs) : [];
}

/** A place to sleep near each day's end (TRIP-DAY-BEDS), from the places Get ready offline saved. */
export async function readDayBeds(at: Date): Promise<DayBed[]> {
  const inputs = await readInputs(at);
  return inputs ? dayBeds(inputs.trip.route, inputs.places, inputs.matches, inputs.trip.stay) : [];
}

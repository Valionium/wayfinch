// The stops on Trip's height profile (TRIP-STOPS), read from the store: the very inputs Ahead reads, through routeStops. A chunk of
// its own, loaded once the route summary shows a route Get ready offline has saved places for.
import { routeStops } from '../../core/screen/route-stops.ts';
import type { RouteStop } from '../../core/screen/route-stops.ts';
import { readInputs } from '../../store/inputs.ts';

export async function readStops(at: Date): Promise<RouteStop[]> {
  const inputs = await readInputs(at);
  return inputs ? routeStops(inputs) : [];
}

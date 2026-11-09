// What En route shows (owner's finding K, 8 Nov 2026): on a trip day before the ride with no position to count from, the answers
// count from the route start (km 0), as on day 1, and say so (screen.ts's routeNoPositionFromStart note); Emergency keeps the real
// day's card. After the day's ride the real screen stays: it plans tomorrow from tonight's stop and says there is no position.
// Pure: `real` is screen()'s own result for these inputs, and what the store keeps after a read (day start, route end) is its.
import type { ScreenInputs } from '../types.ts';
import { buildScreen } from './screen.ts';

type Built = ReturnType<typeof buildScreen>;

export function shownScreen(i: ScreenInputs, real: Built = buildScreen(i)): Built {
  const r = real.screen;
  if (r.positionLine !== null || r.phase !== 'before-ride' || !(r.ride.startKm > 0)) return real;
  const shown = buildScreen({ ...i, trip: { ...i.trip, departureDate: r.ride.date }, positions: [], dayStarts: [] });
  shown.screen.chips.emergency = r.chips.emergency;
  return shown;
}

// The stops on Trip's height profile (guided Trip design §6): Ahead's strip icon rule run for each day of the stage plan, on the
// morning of that day at its start, and the days joined, so every icon on the profile is one Ahead's strip would show that day.
// Pure: the inputs are the very ScreenInputs Ahead reads, and the clock is theirs.
import { addDaysIso, instantAt, localIsoDate } from '../answers/time.ts';
import { zoneLookupOf } from '../engines/tripday.ts';
import type { ScreenInputs } from '../types.ts';
import { buildScreen } from './screen.ts';
import type { StripIcon } from './screen.ts';

/** A strip icon with the name of the place at its kilometre, when it has one. */
export type RouteStop = StripIcon & { label: string | null };

const HOUR_MS = 3_600_000;

export function routeStops(i: ScreenInputs): RouteStop[] {
  const { trip } = i;
  const zone = zoneLookupOf(i.routeZones);
  const first = trip.departureDate ?? localIsoDate(i.now, zone(0).timeZone);
  const stages = trip.route.stages.length > 0 ? trip.route.stages : [{ startKm: 0 }];
  const out: RouteStop[] = [];
  // The name of a place matched at the icon's very kilometre: the strip draws an icon only where its card names a place.
  const names = new Map(i.places.filter((p) => typeof p.name === 'string' && p.name.trim() !== '').map((p) => [p.id, p.name!.trim()]));
  const nameAt = (km: number): string | null => {
    for (const m of i.matches) if (Math.abs(m.km - km) < 1e-6 && names.has(m.placeId)) return names.get(m.placeId)!;
    return null;
  };
  stages.forEach((stage, k) => {
    const date = addDaysIso(first, k);
    // The morning of that day, an hour before the daily start, with no position: the day the stage plan gives, from its start.
    const now = new Date(instantAt(date, trip.startTime, zone(stage.startKm).timeZone).getTime() - HOUR_MS);
    const { screen } = buildScreen({
      ...i, trip: { ...trip, departureDate: first }, now, positions: [], dayStarts: [], planTomorrow: null, routeEndDate: null,
    });
    for (const icon of screen.strip.icons) {
      if (out.some((o) => o.kind === icon.kind && o.km === icon.km)) continue;
      out.push({ ...icon, label: nameAt(icon.km) });
    }
  });
  return out.sort((a, b) => a.km - b.km);
}

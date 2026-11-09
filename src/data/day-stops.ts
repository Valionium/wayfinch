// Days that end where you can sleep, on the store (owner's ruling of 9 Nov 2026, "the stop is saved, and it carries over to the
// Bag planner and En route"). A chunk of its own: Prepare this route settles the stops once places are saved, and Trip's summary
// settles them again whenever its route or plan changes, and when the rider picks another place or "No stop" (with Undo).
// The stops are kept with the trip, for its route and its plan alone (core/route/day-stops.ts), and the route's stages end there,
// so every card, the forecast grid and the handoff read the same days.
import { candidatesNear, closedThatNight } from '../core/engines/day-beds.ts';
import type { BedChoice } from '../core/engines/day-beds.ts';
import { chooseStops, stopsHold, withStops } from '../core/route/day-stops.ts';
import { sampleGrid } from '../core/route/grid.ts';
import { planStages } from '../core/route/stages.ts';
import type { ScreenInputs, Stage, TripStop, TripStops } from '../core/types.ts';
import { announceHere } from '../store/changed.ts';
import { readInputs } from '../store/inputs.ts';
import { readLocalSettings } from '../store/settings-local.ts';
import { readTrip, saveTrip } from '../store/trip.ts';

/** A day's stop changed by the rider (a place, or null: "No stop", the planned end), or the stops as they were (Undo). */
export type StopChange = { day: number; to: BedChoice | null } | { restore: TripStops | null };

/** The stage model's plan for the trip as it stands: its speed and pace, the nights as set (or suggested). */
function planOf(inputs: ScreenInputs): Stage[] {
  const { trip } = inputs;
  const local = readLocalSettings().settings;
  const pace = trip.pace ?? local.pace;
  const nights = local.nights ?? planStages(trip.route, { flatKph: trip.flatKph, pace, nights: 0 }).suggestedNights;
  return [...planStages(trip.route, { flatKph: trip.flatKph, pace, nights })];
}
const nightsOf = (inputs: ScreenInputs) => ({ departureDate: inputs.trip.departureDate, hours: inputs.hours });

/** The places the rider may pick for a day's end: those near its planned end, not closed that night. */
export async function stopChoices(now: Date, day: number): Promise<BedChoice[]> {
  const inputs = await readInputs(now);
  if (!inputs) return [];
  const s = planOf(inputs)[day - 1];
  return s ? candidatesNear(s, inputs.places, inputs.matches, inputs.trip.stay, nightsOf(inputs)) : [];
}

/**
 * The held stops judged again for the nights and the places as they are now (review of PR 101, I1 and I2): an automatic stop is
 * chosen afresh (a place closed that night, gone or outranked gives way); the rider's own stays, marked when it is closed that
 * night, and gives way to an automatic one, said, when its place is gone; the rider's "No stop" stays.
 */
function judged(held: TripStops, fresh: TripStops | null, inputs: ScreenInputs): TripStops {
  const byId = new Map(inputs.places.map((p) => [p.id, p]));
  const matched = new Set(inputs.matches.map((m) => m.placeId));
  const days = held.days.map((d, i): TripStop => {
    const now = fresh?.days[i] ?? { placeId: null, km: held.basis[i]!, name: null, town: null, by: 'auto' as const };
    if (d.by === 'auto') return d.was && now.placeId === d.placeId ? { ...now, was: d.was } : now;
    if (d.placeId === null) return d;
    const place = byId.get(d.placeId);
    if (!place || !matched.has(d.placeId)) return { ...now, ...(d.name ? { was: d.name } : {}) };
    const { closed: _was, ...kept } = d;
    void _was;
    return closedThatNight(place, i + 1, nightsOf(inputs)) ? { ...kept, closed: true } : kept;
  });
  return { ...held, days };
}

/**
 * Settles the stops of the stored trip, with the rider's change if any, and writes the trip when its days change. Resolves to the
 * stops now in force, or null when there are none (no places saved, a day ride, or the route gone meanwhile).
 */
export async function settleStops(now: Date, change?: StopChange, o: { announce?: boolean } = {}): Promise<TripStops | null> {
  const inputs = await readInputs(now);
  if (!inputs) return null;
  const { trip } = inputs;
  const { route } = trip;
  const plan = planOf(inputs);
  const fresh = plan.length > 1 && inputs.matches.length > 0 ? chooseStops(route, plan, inputs.places, inputs.matches, trip.stay, nightsOf(inputs)) : null;
  const held = stopsHold(trip.stops, route, plan) ? trip.stops : null;
  let next: TripStops | null;
  if (change && 'restore' in change) next = change.restore && stopsHold(change.restore, route, plan) ? judged(change.restore, fresh, inputs) : null;
  else next = held && fresh ? judged(held, fresh, inputs) : fresh;
  if (next && change && 'day' in change) {
    const i = change.day - 1;
    if (i >= 0 && i < next.days.length) {
      const to = change.to;
      const days = [...next.days];
      days[i] = to ? { placeId: to.placeId, km: to.km, name: to.name, town: to.town, by: 'rider' } : { placeId: null, km: next.basis[i]!, name: null, town: null, by: 'rider' };
      next = { ...next, days };
    }
  }
  const stages = withStops(route, plan, next, trip.flatKph);
  const grid = sampleGrid(route, route.climbs, stages);
  const same = JSON.stringify(stages) === JSON.stringify(route.stages) && JSON.stringify(grid) === JSON.stringify(route.sampleGrid)
    && JSON.stringify(next ?? null) === JSON.stringify(trip.stops ?? null);
  if (same) return next;
  const stored = await readTrip();
  if (!stored || stored.route.id !== route.id) return null;
  const { stops: _old, ...rest } = stored;
  void _old;
  await saveTrip({ ...rest, route: { ...stored.route, stages, sampleGrid: grid }, ...(next ? { stops: next } : {}) });
  // Trip and En route in this window read the new days at once; other windows by the store's own mark. Prepare this route says
  // nothing mid-run: a screen read again then would drop its run's own ending (Ahead's waiting card), and the run's end reads all.
  if (o.announce !== false) announceHere('trip');
  return next;
}

// Days that end where you can sleep, on the store (owner's ruling of 9 Nov 2026, "the stop is saved, and it carries over to the
// Bag planner and En route"). A chunk of its own: Prepare this route settles the stops once places are saved, and Trip's summary
// settles them again whenever its route or plan changes, and when the rider picks another place or "No stop" (with Undo).
// The stops are kept with the trip, for its route and its plan alone (core/route/day-stops.ts), and the route's stages end there,
// so every card, the forecast grid and the handoff read the same days.
import { candidatesNear, closedThatNight } from '../core/engines/day-beds.ts';
import type { BedChoice } from '../core/engines/day-beds.ts';
import { chooseStops, planAround, plannedEnds, sameKms, stagesEndingAt, stopsHold, withStops } from '../core/route/day-stops.ts';
import type { Around } from '../core/route/day-stops.ts';
import { sampleGrid } from '../core/route/grid.ts';
import { planStages } from '../core/route/stages.ts';
import type { ScreenInputs, Stage, Trip, TripStop, TripStops } from '../core/types.ts';
import { announceHere } from '../store/changed.ts';
import { readInputs } from '../store/inputs.ts';
import { readLocalSettings } from '../store/settings-local.ts';
import { readTrip, saveTrip } from '../store/trip.ts';

/** A day's stop changed by the rider (a place, or null: "No stop", the planned end), or the stops as they were (Undo). */
export type StopChange = { day: number; to: BedChoice | null } | { restore: TripStops | null };

/** Ends that can be a plan's for `nights` nights on a route `lengthKm` long: as many, in order, inside the route. */
const usableEnds = (ends: unknown, nights: number, lengthKm: number): ends is number[] =>
  Array.isArray(ends) && ends.length === nights && ends.every((km, i) => typeof km === 'number' && km > (i === 0 ? 0 : (ends[i - 1] as number)) && km < lengthKm);

/**
 * The plan the stops are worked out on (the owner's ruling of 14 Nov 2026, "plan around"): while the nights are the same, the plan
 * the stops hold for, the stage model's own or one planned around the rider's own stops; otherwise the nights as set (or suggested)
 * planned again around the rider's own stops (`around`: what became of them). The pace and the speed set the suggested nights and the
 * hours; the ends depend on the nights and the effort alone.
 */
function planOf(inputs: ScreenInputs): { plan: Stage[]; around: Around | null } {
  const { trip } = inputs;
  const { route } = trip;
  const local = readLocalSettings().settings;
  const pace = trip.pace ?? local.pace;
  const nights = local.nights ?? planStages(route, { flatKph: trip.flatKph, pace, nights: 0 }).suggestedNights;
  const even = [...planStages(route, { flatKph: trip.flatKph, pace, nights })];
  const held = trip.stops?.routeId === route.id ? trip.stops : undefined;
  // the stage model's own stages when the ends are its own, so a plan that did not change is the very same
  const ends = (to: number[]): Stage[] => (sameKms(to, plannedEnds(even)) ? even : stagesEndingAt(route, to, trip.flatKph));
  if (held && usableEnds(held.basis, plannedEnds(even).length, route.lengthKm) && Array.isArray(held.days) && held.days.length === held.basis.length) return { plan: ends(held.basis), around: null };
  const around = planAround(held, route, plannedEnds(even).length);
  return { plan: ends(around.basis), around };
}
const nightsOf = (inputs: ScreenInputs) => ({ departureDate: inputs.trip.departureDate, hours: inputs.hours });

/** The places the rider may pick for a day's end: those near its planned end, not closed that night. */
export async function stopChoices(now: Date, day: number): Promise<BedChoice[]> {
  const inputs = await readInputs(now);
  if (!inputs) return [];
  const s = planOf(inputs).plan[day - 1];
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
/**
 * Every stop write of this window, one after another (review of PR 101, I5): Trip's automatic settles, the rider's picks and Undo,
 * and Prepare's. Each reads the trip only once the one before has written, so a pick is never overwritten by a settle that read
 * the trip before it.
 */
let turn: Promise<unknown> = Promise.resolve();

/** What a settle works the stops out from, besides the places and the nights: the route's days, the stops held, the stay, the date, the pace and the speed. */
/**
 * The trip changed under a settle: the store's refusal (NewerDataError) or this file's own check. Told by the error's name, not its
 * class, so this chunk adds no import from the first screen's (review of the Trip PRs, I2).
 */
const STALE = 'NewerDataError';
const isStale = (e: unknown): boolean => e instanceof Error && e.name === STALE;
const stale = (): Error => Object.assign(new Error('The trip changed while its stops were settled.'), { name: STALE });

const basisOf = (t: Trip): string => JSON.stringify([t.route.id, t.route.stages, t.stops ?? null, t.stay, t.departureDate, t.pace ?? null, t.flatKph]);

export function settleStops(now: Date, change?: StopChange, o: { announce?: boolean } = {}): Promise<TripStops | null> {
  // The trip changed while this settle worked (review of PR 101, M6): once more, on the trip as it is now, so both changes stay.
  const mine = turn.then(() => settling(now, change, o).catch((e: unknown) => {
    if (isStale(e)) return settling(now, change, o);
    throw e;
  }));
  turn = mine.catch(() => undefined);
  return mine;
}

async function settling(now: Date, change: StopChange | undefined, o: { announce?: boolean }): Promise<TripStops | null> {
  const inputs = await readInputs(now);
  if (!inputs) return null;
  const { trip } = inputs;
  const { route } = trip;
  const { plan, around } = planOf(inputs);
  const fresh = plan.length > 1 && inputs.matches.length > 0 ? chooseStops(route, plan, inputs.places, inputs.matches, trip.stay, nightsOf(inputs)) : null;
  // Other nights are planned around the rider's own stops (the owner's ruling of 14 Nov 2026): they keep their nights, judged as held
  // ones; the other nights are chosen afresh. The line beside the nights names them (core planAround, the same rule).
  const held = stopsHold(trip.stops, route, plan) ? trip.stops : fresh && around ? { ...fresh, days: fresh.days.map((d, i) => around.days[i] ?? d) } : null;
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
  // What the stops were worked out from must still be what is stored (M6): another window, or this one, may have changed it since
  // the inputs were read. From here on the store's own guard refuses a write over a trip another window changed after this read.
  if (basisOf(stored) !== basisOf(trip)) throw stale();
  const { stops: _old, ...rest } = stored;
  void _old;
  await saveTrip({ ...rest, route: { ...stored.route, stages, sampleGrid: grid }, ...(next ? { stops: next } : {}) });
  // Trip and En route in this window read the new days at once; other windows by the store's own mark. Prepare this route says
  // nothing mid-run: a screen read again then would drop its run's own ending (Ahead's waiting card), and the run's end reads all.
  if (o.announce !== false) announceHere('trip');
  return next;
}

// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026: "the stop is saved, and it carries over to the Bag
// planner and En route": Yes). The stage model's plan stays the basis; the stops move each day's end.
import { describe, expect, test } from 'vitest';
import { carryOwn, chooseStops, dayStopOf, endsOf, plannedEnds, stagesEndingAt, stopsHold, withStops } from '../../../../src/core/route/day-stops.ts';
import { planStages } from '../../../../src/core/route/stages.ts';
import type { Place, RouteMatch, TripStop, TripStops } from '../../../../src/core/types.ts';
import { flatRoute, pointAtKm } from '../../../fixtures/build.ts';
import { placeAt } from '../../../fixtures/places.ts';
import { loadFixtureRoute } from '../../../fixtures/packs/index.ts';
import { buildRoute } from '../../../../src/core/route/profile.ts';

const route = flatRoute(270, { stageEnds: [90, 180, 270] });
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];

function at(kind: Place['kind'], km: number, name: string, offM = 0): { place: Place; match: RouteMatch } {
  const p = pointAtKm(km, offM);
  const place = placeAt(kind, p.lat, p.lon, { id: `${kind}-${km}`, name });
  return { place, match: { placeId: place.id, km, offRouteM: offM } };
}
const of = (list: { place: Place; match: RouteMatch }[]) => [list.map((x) => x.place), list.map((x) => x.match)] as const;

describe('day stops', () => {
  test('[TRIP-DAY-STOPS] each night ends at the best sleep place near its planned end; the days are worked out between the stops as the stage model works out its own', () => {
    expect(plannedEnds(plan)).toEqual([90, 180]);
    const [places, matches] = of([at('campsite', 92.4, 'Camping Mainz'), at('lodging', 176, 'Hotel Koblenz'), at('settlement', 92.6, 'Mainz')]);
    const stops = chooseStops(route, plan, places, matches, 'camping');
    expect(stops).toEqual({ routeId: route.id, basis: [90, 180], days: [
      { placeId: 'campsite-92.4', km: 92.4, name: 'Camping Mainz', town: 'Mainz', by: 'auto' },
      { placeId: 'lodging-176', km: 176, name: 'Hotel Koblenz', town: null, by: 'auto' },
    ] });
    const days = withStops(route, plan, stops, 25);
    expect(days.map((s) => [s.day, s.startKm, s.endKm])).toEqual([[1, 0, 92.4], [2, 92.4, 176], [3, 176, 270]]);
    // The same model: hours from the effort between the ends, so the days add up to the plan's whole.
    const hours = (list: typeof days) => list.reduce((n, s) => n + s.ridingHours, 0);
    expect(hours(days)).toBeCloseTo(hours(plan), 9);
    expect(days[0]!.ridingHours).toBeCloseTo(92.4 / (25 * 0.82), 9);
  });

  test('[TRIP-DAY-STOPS] with nothing near a planned end, or the rider\'s "No stop", that day keeps its planned end', () => {
    const [places, matches] = of([at('campsite', 176, 'Camping')]);
    const stops = chooseStops(route, plan, places, matches, 'mixed');
    expect(stops.days[0]).toEqual({ placeId: null, km: 90, name: null, town: null, by: 'auto' });
    expect(withStops(route, plan, stops, 25).map((s) => s.endKm)).toEqual([90, 176, 270]);
    const none: TripStops = { ...stops, days: [stops.days[0]!, { placeId: null, km: 180, name: null, town: null, by: 'rider' }] };
    expect(withStops(route, plan, none, 25)).toBe(plan);
  });

  test('[TRIP-DAY-STOPS] stops hold only for the route and the plan they were chosen for: another route, other nights or a damaged record change nothing', () => {
    const [places, matches] = of([at('campsite', 92, 'A'), at('campsite', 178, 'B')]);
    const stops = chooseStops(route, plan, places, matches, 'mixed');
    expect(stopsHold(stops, route, plan)).toBe(true);
    expect(withStops({ ...route, id: 'other' }, plan, stops, 25)).toBe(plan);
    const threeNights = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 3 })];
    expect(stopsHold(stops, route, threeNights)).toBe(false);
    expect(withStops(route, threeNights, stops, 25)).toBe(threeNights);
    expect(stopsHold({ ...stops, days: [] }, route, plan)).toBe(false);
    expect(stopsHold(undefined, route, plan)).toBe(false);
  });

  test('[TRIP-DAY-STOPS] a stop that would leave a day of almost nothing, or not in order, is not taken', () => {
    const stops: TripStops = { routeId: route.id, basis: [90, 180], days: [
      { placeId: 'x', km: 179.5, name: 'Too far on', town: null, by: 'rider' },
      { placeId: 'y', km: 0.5, name: 'Behind', town: null, by: 'rider' },
    ] };
    expect(endsOf(stops, 270)).toEqual([90, 180]);
  });

  test('[TRIP-DAY-STOPS] on a real route with climbing, days ending at the planned ends are the stage model\'s days', async () => {
    const f = await loadFixtureRoute('heidelberg-strasbourg');
    const real = await buildRoute(f.points, f.name, 'gpx');
    const p = [...planStages(real, { flatKph: 22, pace: 'hard', nights: 2 })];
    const again = stagesEndingAt(real, plannedEnds(p), 22);
    again.forEach((s, i) => {
      expect(s.endKm).toBeCloseTo(p[i]!.endKm, 9);
      expect(s.ridingHours).toBeCloseTo(p[i]!.ridingHours, 6);
      expect(s.ascentM!).toBeCloseTo(p[i]!.ascentM!, 6);
    });
  });

  test('[TRIP-DAY-STOPS] a day never ends at a place closed that night (review of PR 98, I1): a November trip passes the Apr-Oct campsite by', () => {
    const camp = at('campsite', 91, 'Camping Rheinaue');
    camp.place.seasonal = 'Apr-Oct';
    const [places, matches] = of([camp, at('lodging', 95, 'Gasthof Adler')]);
    expect(chooseStops(route, plan, places, matches, 'camping', { departureDate: '2026-11-10', hours: [] }).days[0]!.name).toBe('Gasthof Adler');
    expect(chooseStops(route, plan, places, matches, 'camping', { departureDate: '2026-06-10', hours: [] }).days[0]!.name).toBe('Camping Rheinaue');
  });
});

test('[TRIP-DAY-STOPS] a day\'s stop is read only where the trip\'s days end at it', () => {
  const [places, matches] = of([at('campsite', 92, 'A'), at('campsite', 178, 'B')]);
  const stops = chooseStops(route, plan, places, matches, 'mixed');
  const snapped = { route: { ...route, stages: withStops(route, plan, stops, 25) }, stops };
  expect(dayStopOf(snapped, 0)!.name).toBe('A');
  expect(dayStopOf(snapped, 2)).toBeNull(); // the last day ends at the route's end
  expect(dayStopOf({ route: { ...route, stages: plan }, stops }, 0)).toBeNull(); // planned again: not ending there now
  expect(dayStopOf({ route: { ...snapped.route, id: 'x' }, stops }, 0)).toBeNull();
});

// The owner's ruling of 14 Nov 2026: a change of nights keeps the rider's own stops where they still fit; only the other nights are
// chosen again, and nothing the rider chose goes without a word. "Fit": near a new night's planned end, as near as that night's own
// choices are (its window), so a kept stop is one the rider could have picked for it.
describe('the rider\'s own stops on other nights', () => {
  const own = (km: number, name: string | null): TripStop => ({ placeId: name ? `p-${km}` : null, km, name, town: null, by: 'rider' });
  const auto = (km: number, name: string): TripStop => ({ placeId: `p-${km}`, km, name, town: null, by: 'auto' });
  const nightsOf = (n: number) => [...planStages(route, { flatKph: 25, pace: 'sporting', nights: n })];
  const ends = (n: number) => plannedEnds(nightsOf(n)).map((km) => Math.round(km * 1000) / 1000);
  const old: TripStops = { routeId: route.id, basis: [90, 180], days: [own(92, 'Camping A'), auto(176, 'Hotel Auto')] };

  test('[TRIP-STOPS-KEEP] 2 → 5 nights: an own stop near a new night\'s planned end is kept, for that night; an automatic one is not carried', () => {
    expect(ends(5)).toEqual([45, 90, 135, 180, 225]);
    const c = carryOwn(old, route, nightsOf(5));
    expect(c.days).toEqual([null, own(92, 'Camping A'), null, null, null]);
    expect(c.kept).toEqual([{ stop: own(92, 'Camping A'), night: 2, was: 1 }]);
    expect(c.lost).toEqual([]);
  });

  test('[TRIP-STOPS-KEEP] 2 → 3 nights: an own stop near no new end is not kept, and is named with the night it had', () => {
    expect(ends(3)).toEqual([67.5, 135, 202.5]);
    const c = carryOwn(old, route, nightsOf(3));
    expect(c.days).toEqual([null, null, null]);
    expect(c.kept).toEqual([]);
    expect(c.lost).toEqual([{ stop: own(92, 'Camping A'), night: 1 }]);
  });

  test('[TRIP-STOPS-KEEP] the window is the new night\'s own: 4.5 km on a 45 km day, so 94.4 km is kept for 90 and 94.6 km is not', () => {
    expect(carryOwn({ ...old, days: [own(94.4, 'Near'), auto(176, 'X')] }, route, nightsOf(5)).kept.map((k) => k.night)).toEqual([2]);
    expect(carryOwn({ ...old, days: [own(94.6, 'Far'), auto(176, 'X')] }, route, nightsOf(5)).lost.map((k) => k.stop.name)).toEqual(['Far']);
  });

  test('[TRIP-STOPS-KEEP] the rider\'s No stop is kept when a new night ends near its old end, at that new end; otherwise it is named as not kept', () => {
    const none = { ...old, days: [auto(92, 'Camping Auto'), own(180, null)] };
    expect(carryOwn(none, route, nightsOf(5))).toEqual({ days: [null, null, null, own(180, null), null], kept: [{ stop: own(180, null), night: 4, was: 2 }], lost: [] });
    expect(carryOwn(none, route, nightsOf(3)).lost).toEqual([{ stop: own(180, null), night: 2 }]);
  });

  test("[TRIP-STOPS-KEEP] two own stops near the same new end: the first in the route's order keeps that night, the other is not kept", () => {
    const two: TripStops = { routeId: route.id, basis: [90, 180], days: [own(88, 'Nearer'), own(93.9, 'Farther')] };
    // (a record no screen makes: both near the new night 2 at 90 km)
    const c = carryOwn(two, route, nightsOf(5));
    expect(c.kept).toEqual([{ stop: own(88, 'Nearer'), night: 2, was: 1 }]);
    expect(c.lost).toEqual([{ stop: own(93.9, 'Farther'), night: 2 }]);
  });

  test('[TRIP-STOPS-KEEP] a day ride has no nights: every own stop is named as not kept; the stops of this very plan, another route or none carry nothing', () => {
    expect(carryOwn(old, route, nightsOf(0))).toEqual({ days: [], kept: [], lost: [{ stop: own(92, 'Camping A'), night: 1 }] });
    expect(carryOwn(old, route, plan)).toEqual({ days: [null, null], kept: [], lost: [] });
    expect(carryOwn({ ...old, routeId: 'other' }, route, nightsOf(5))).toEqual({ days: [null, null, null, null, null], kept: [], lost: [] });
    expect(carryOwn(undefined, route, nightsOf(5)).kept).toEqual([]);
    // a damaged record carries nothing and throws nothing
    expect(carryOwn({ ...old, days: 'x' as unknown as TripStop[] }, route, nightsOf(5)).kept).toEqual([]);
  });
});

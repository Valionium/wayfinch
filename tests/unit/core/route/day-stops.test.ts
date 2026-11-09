// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026: "the stop is saved, and it carries over to the Bag
// planner and En route": Yes). The stage model's plan stays the basis; the stops move each day's end.
import { describe, expect, test } from 'vitest';
import { chooseStops, endsOf, plannedEnds, stagesEndingAt, stopsHold, withStops } from '../../../../src/core/route/day-stops.ts';
import { planStages } from '../../../../src/core/route/stages.ts';
import type { Place, RouteMatch, TripStops } from '../../../../src/core/types.ts';
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
});

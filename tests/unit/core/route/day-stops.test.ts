// Days that end where the rider can sleep (owner's ruling of 9 Nov 2026: "the stop is saved, and it carries over to the Bag
// planner and En route": Yes). The stage model's plan stays the basis; the stops move each day's end.
import { describe, expect, test } from 'vitest';
import { chooseStops, dayStopOf, endsOf, planAround, plannedEnds, stagesEndingAt, stopsHold, unevenDays, withStops } from '../../../../src/core/route/day-stops.ts';
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

// The owner's rulings of 14 Nov 2026: a change of nights keeps the rider's own stops, and then "Yes, plan around": each own stop is a
// fixed end, the stretches between them are split into days at equal effort, the nights added or taken away going to the stretches
// with the longest days. An own stop goes only when it truly cannot stay (fewer nights than own stops, a day ride, not on the route),
// and is named with its old night; days that turn much longer or shorter than an even day are said, the stop is not moved.
describe('planning the nights around the rider\'s own stops', () => {
  const own = (km: number, name: string | null): TripStop => ({ placeId: name ? `p-${km}` : null, km, name, town: null, by: 'rider' });
  const auto = (km: number, name: string): TripStop => ({ placeId: `p-${km}`, km, name, town: null, by: 'auto' });
  const r3 = (km: number) => Math.round(km * 1000) / 1000;
  const held = (days: TripStop[], basis = days.map((d) => d.km)): TripStops => ({ routeId: route.id, basis, days });
  const ends = (stops: TripStops | undefined, nights: number) => planAround(stops, route, nights).basis.map(r3);

  test('[TRIP-STOPS-KEEP] no own stop: the stage model\'s own even days, for any nights; automatic stops anchor nothing', () => {
    for (const n of [0, 1, 3, 5]) expect(ends(undefined, n)).toEqual(plannedEnds([...planStages(route, { flatKph: 25, pace: 'sporting', nights: n })]));
    const a = planAround(held([auto(92, 'A'), auto(176, 'B')], [90, 180]), route, 3);
    expect(a.basis.map(r3)).toEqual([67.5, 135, 202.5]);
    expect(a).toMatchObject({ days: [null, null, null], kept: [], dropped: [] });
  });

  test('[TRIP-STOPS-KEEP] one own stop: it stays an end; nights up (2 → 3, 2 → 5) and down (2 → 1) go to the stretch with the longest days', () => {
    const one = held([own(92, 'Camping A'), auto(176, 'B')], [90, 180]);
    // 92 km before it, 178 after: the third night splits the longer stretch first, then the shorter one is longest
    expect(ends(one, 3)).toEqual([46, 92, 181]);
    expect(ends(one, 2)).toEqual([92, 181]);
    expect(ends(one, 1)).toEqual([92]);
    expect(ends(one, 5)).toEqual([46, 92, 136.5, 181, 225.5]);
    const three = planAround(one, route, 3);
    expect(three.days).toEqual([null, own(92, 'Camping A'), null]);
    expect(three.kept).toEqual([{ stop: own(92, 'Camping A'), night: 2, was: 1 }]);
    expect(three.dropped).toEqual([]);
    expect(unevenDays(route, three.basis)).toEqual([]);
  });

  test('[TRIP-STOPS-KEEP] two own stops: both stay; the night added goes to the first of the two longest stretches', () => {
    const two = held([own(92, 'Camping A'), own(178.5, 'Hotel C')]);
    expect(ends(two, 3)).toEqual([46, 92, 178.5]);
    expect(planAround(two, route, 3).kept.map((k) => [k.stop.name, k.night, k.was])).toEqual([['Camping A', 2, 1], ['Hotel C', 3, 2]]);
    expect(ends(two, 2)).toEqual([92, 178.5]);
  });

  test('[TRIP-STOPS-KEEP] three own stops near the start and the end: all stay; the very short and very long days are found on the days as they end, not moved', () => {
    const near = planAround(held([own(1.5, 'Start Camp'), own(135, 'Mid Hotel'), own(268.8, 'End Camp')]), route, 3);
    expect(near.basis.map(r3)).toEqual([1.5, 135, 268.8]);
    expect(near.dropped).toEqual([]);
    expect(unevenDays(route, near.basis).map((u) => [u.day, r3(u.km), u.long])).toEqual([[1, 1.5, false], [2, 133.5, true], [3, 133.8, true], [4, 1.2, false]]);
    // the days as they end once the other nights have their places (review of the rework, m-3): an end moved by an automatic stop moves the figure
    expect(unevenDays(route, [10, 150]).map((u) => [u.day, r3(u.km), u.long])).toEqual([[1, 10, false], [2, 140, true]]);
    expect(unevenDays(route, [90, 180])).toEqual([]);
  });

  test('[TRIP-STOPS-KEEP] more own stops than nights: the stop between the two shortest days next to each other goes, named with its old night; a day ride keeps none', () => {
    const three = held([own(60, 'A'), own(92, 'B'), own(200, 'C')]);
    const two = planAround(three, route, 2);
    // days of 60, 32, 108 and 70 km: the 60 and the 32 become one
    expect(two.basis.map(r3)).toEqual([92, 200]);
    expect(two.dropped).toEqual([{ stop: own(60, 'A'), night: 1 }]);
    const one = planAround(three, route, 1);
    expect(one.basis.map(r3)).toEqual([92]);
    expect(one.dropped.map((d) => [d.stop.name, d.night])).toEqual([['A', 1], ['C', 3]]);
    const ride = planAround(three, route, 0);
    expect(ride.basis).toEqual([]);
    expect(ride.kept).toEqual([]);
    expect(ride.dropped.map((d) => d.night)).toEqual([1, 2, 3]);
  });

  // The coordinator's ruling on the rework's review (I-2): a rider's "No stop" is no fixed end, only "no place picked for that night".
  test("[TRIP-STOPS-KEEP] the rider's No stop is no fixed end: the night keeps it while it exists, at the even split; otherwise it goes, named; a stop not on the route goes, named", () => {
    const none = held([auto(92, 'A'), own(180, null)], [90, 180]);
    const a = planAround(none, route, 3);
    expect(a.basis.map(r3)).toEqual([67.5, 135, 202.5]);
    expect(a.days.map((d) => d && [d.placeId, r3(d.km), d.by])).toEqual([null, [null, 135, 'rider'], null]);
    expect(a.kept.map((k) => [k.stop.name, k.night, k.was])).toEqual([[null, 2, 2]]);
    expect(planAround(none, route, 1)).toMatchObject({ kept: [], dropped: [{ stop: own(180, null), night: 2 }] });
    // its night now ends at a place the rider picked: the No stop cannot be that night's too
    const both = planAround(held([own(92, 'Camping A'), own(180, null)]), route, 3);
    expect(both.kept.map((k) => [k.stop.name, k.night])).toEqual([['Camping A', 2]]);
    expect(both.dropped).toEqual([{ stop: own(180, null), night: 2 }]);
    const off = planAround(held([own(0.5, 'At start'), own(150, 'Fine'), own(120, 'Behind'), own(269.5, 'At end')]), route, 3);
    expect(off.kept.map((k) => k.stop.name)).toEqual(['Fine']);
    expect(off.dropped.map((d) => [d.stop.name, d.night])).toEqual([['At start', 1], ['Behind', 3], ['At end', 4]]);
  });

  test('[TRIP-STOPS-KEEP] another route\'s stops or a damaged record anchor nothing and throw nothing', () => {
    const one = held([own(92, 'Camping A')], [90]);
    expect(planAround({ ...one, routeId: 'other' }, route, 3)).toMatchObject({ kept: [], dropped: [] });
    expect(planAround({ ...one, days: 'x' as unknown as TripStop[] }, route, 3).kept).toEqual([]);
    expect(planAround({ ...one, days: [{ ...own(92, 'NaN'), km: Number.NaN }] }, route, 3).dropped.map((d) => d.stop.name)).toEqual(['NaN']);
    expect(ends({ ...one, routeId: 'other' }, 3)).toEqual([67.5, 135, 202.5]);
  });
});

// Re-review 2 of the rework, I-3 (the coordinator's ruling): while the number of nights stays the same, each pick stays on its night;
// only a change of nights shares the nights out again.
describe('a pick keeps its night while the nights stay the same', () => {
  const own = (km: number, name: string | null): TripStop => ({ placeId: name ? `p-${km}` : null, km, name, town: null, by: 'rider' });
  const auto = (km: number, name: string): TripStop => ({ placeId: `p-${km}`, km, name, town: null, by: 'auto' });
  const r1 = (km: number) => Math.round(km * 10) / 10;

  test('[TRIP-STOPS-KEEP] alpine-pass, 3 nights: a place picked for night 1 at 23.7 km (offered within its 3 km window) stays night 1', async () => {
    const f = await loadFixtureRoute('alpine-pass');
    const alpine = await buildRoute(f.points, f.name, 'gpx');
    const before = planAround({ routeId: alpine.id, basis: [], days: [] }, alpine, 3).basis;
    const held: TripStops = { routeId: alpine.id, basis: before, days: [own(before[0]!, 'Here'), auto(before[1]!, 'B'), auto(before[2]!, 'C')] };
    const moved: TripStops = { ...held, days: [own(23.7, 'There'), held.days[1]!, held.days[2]!] };
    const kept = planAround(moved, alpine, 3, true);
    expect(kept.kept.map((k) => [k.stop.name, k.night])).toEqual([['There', 1]]);
    expect(r1(kept.basis[0]!)).toBe(23.7);
    expect(kept.basis.length).toBe(3);
    // shared out afresh, as for a change of nights, the near tie hands the night over: what the rule keeps from happening
    expect(planAround(moved, alpine, 3).kept.map((k) => k.night)).not.toEqual([1]);
  });

  test('[TRIP-STOPS-KEEP] the same nights: each picked place, and each No stop, stays on its night for any pick within its window', () => {
    const three = plannedEnds([...planStages(route, { flatKph: 25, pace: 'sporting', nights: 3 })]);
    for (let night = 0; night < 3; night += 1) {
      for (const off of [-6.75, -3, 0, 3, 6.75]) {
        const days = three.map((km, i) => (i === night ? own(km + off, 'Pick') : i === (night + 1) % 3 ? own(km, null) : auto(km, 'A')));
        const a = planAround({ routeId: route.id, basis: three, days }, route, 3, true);
        expect(a.kept.find((k) => k.stop.name === 'Pick')?.night, `night ${night + 1}, ${off} km`).toBe(night + 1);
        const none = a.kept.find((k) => k.stop.placeId === null);
        if (none) expect(none.night).toBe(((night + 1) % 3) + 1);
        expect(a.dropped).toEqual([]);
      }
    }
  });
});

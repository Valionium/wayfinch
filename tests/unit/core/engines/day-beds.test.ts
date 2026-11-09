// Trip's days name a place to sleep near each day's end (owner, 9 Nov 2026: "the days were split evenly into thirds without
// looking for towns or hotels where you could stop"). The days themselves stay the stage model's (spec §6.2, Stages).
import { describe, expect, test } from 'vitest';
import { BED_WINDOW_KM, dayBeds } from '../../../../src/core/engines/day-beds.ts';
import type { Place, RouteMatch } from '../../../../src/core/types.ts';
import { flatRoute, pointAtKm } from '../../../fixtures/build.ts';
import { placeAt } from '../../../fixtures/places.ts';

const route = flatRoute(270, { stageEnds: [90, 180, 270] });

/** A place at a route kilometre, with its match. */
function at(kind: Place['kind'], km: number, o: Partial<Place> & { offM?: number } = {}): { place: Place; match: RouteMatch } {
  const { offM = 0, ...over } = o;
  const p = pointAtKm(km, offM);
  const place = placeAt(kind, p.lat, p.lon, { id: `${kind}-${km}-${offM}`, ...over });
  return { place, match: { placeId: place.id, km, offRouteM: offM } };
}
const beds = (list: { place: Place; match: RouteMatch }[], stay: 'camping' | 'mixed' | 'accommodation' = 'mixed') =>
  dayBeds(route, list.map((x) => x.place), list.map((x) => x.match), stay);

describe('day beds', () => {
  test('[TRIP-DAY-BEDS] each day but the last names the sleep place nearest its end, with its kilometre and the town by it', () => {
    const out = beds([
      at('lodging', 92.4, { name: 'Hotel Krone', tags: { tourism: 'hotel' } }),
      at('settlement', 92.9, { name: 'Mainz' }),
      at('campsite', 70, { name: 'Too far back' }),
      at('campsite', 178.5, { name: 'Camping am Rhein' }),
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ day: 1, endKm: 90, bed: { name: 'Hotel Krone', km: 92.4, town: 'Mainz' } });
    expect(out[1]).toMatchObject({ day: 2, endKm: 180, bed: { name: 'Camping am Rhein', km: 178.5, town: null } });
    expect(out[2]).toMatchObject({ day: 3, last: true, bed: null }); // the route end is where the last day goes
  });

  test('[TRIP-DAY-BEDS] the trip\'s stay counts first: a camper gets the campsite in the window over a nearer hotel, and the other way round', () => {
    const list = [at('lodging', 90.5, { name: 'Hotel' }), at('campsite', 96, { name: 'Camping' })];
    expect(beds(list, 'camping')[0]!.bed!.name).toBe('Camping');
    expect(beds(list, 'accommodation')[0]!.bed!.name).toBe('Hotel');
    expect(beds(list, 'mixed')[0]!.bed!.name).toBe('Hotel');
  });

  test('[TRIP-DAY-BEDS] a detour off the route counts as riding it: a place 4 km off loses to one 1 km further along but on the route', () => {
    const out = beds([at('lodging', 90.5, { name: 'Off', offM: 4000 }), at('lodging', 91.5, { name: 'On' })]);
    expect(out[0]!.bed!.name).toBe('On');
  });

  test('[TRIP-DAY-BEDS] nothing beyond the window, no lean-to or basic hut and no weather shelter: none is said plainly', () => {
    const out = beds([
      at('lodging', 90 + BED_WINDOW_KM + 0.5),
      at('shelter', 90, { tags: { shelter_type: 'lean_to' } }),
      at('shelter', 90.2, { tags: { shelter_type: 'weather_shelter' } }),
      at('settlement', 93, { name: 'Bingen' }),
    ]);
    expect(out[0]).toMatchObject({ bed: null, town: { name: 'Bingen', km: 93 } });
    expect(beds([])[0]).toMatchObject({ bed: null, town: null });
  });

  test('[TRIP-DAY-BEDS] the window is a tenth of the day either side, at most 10 km, at least 3', () => {
    expect(BED_WINDOW_KM).toBe(10);
    const short = flatRoute(40, { stageEnds: [20, 40] });
    const p = pointAtKm(23.5);
    const q = pointAtKm(22.5);
    const far = placeAt('lodging', p.lat, p.lon, { id: 'far' });
    const near = placeAt('lodging', q.lat, q.lon, { id: 'near' });
    expect(dayBeds(short, [far], [{ placeId: 'far', km: 23.5, offRouteM: 0 }], 'mixed')[0]!.bed).toBeNull();
    expect(dayBeds(short, [near], [{ placeId: 'near', km: 22.5, offRouteM: 0 }], 'mixed')[0]!.bed).not.toBeNull();
  });

  test('[TRIP-DAY-BEDS] a place without a name is named by its kind; the answer is the same in any order', () => {
    const list = [at('campsite', 91, { name: '' }), at('lodging', 89, { name: null as unknown as string, tags: { tourism: 'guest_house' } })];
    const a = beds(list);
    const b = beds([...list].reverse());
    expect(a).toEqual(b);
    expect(a[0]!.bed!.name).toMatch(/campsite|guest house/i);
  });
});

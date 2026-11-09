// The words of a day that ends at a stop (review of PR 101): closed that night and gone from the map data are said; the window named
// is the planned day's, the one the places were searched in (M2).
import { expect, test } from 'vitest';
import { planStages } from '../../../src/core/route/stages.ts';
import { withStops } from '../../../src/core/route/day-stops.ts';
import type { Trip, TripStops } from '../../../src/core/types.ts';
import { BD } from '../../../src/core/wording/en-beds.ts';
import { dayEndWords } from '../../../src/ui/trip/summary.tsx';
import { flatRoute } from '../../fixtures/build.ts';

const route = flatRoute(270);
const plan = [...planStages(route, { flatKph: 25, pace: 'sporting', nights: 2 })];
const tripWith = (stops: TripStops): Trip => ({ route: { ...route, stages: withStops(route, plan, stops, 25) }, departureDate: '2026-11-10', startTime: '08:30', flatKph: 25, stay: 'mixed', campWaterL: 2, stops });
const none = { placeId: null, name: null, town: null, by: 'auto' as const };

test('[TRIP-DAY-STOPS] a rider\'s stop closed that night is said, with the day still ending there (I1)', () => {
  const t = tripWith({ routeId: route.id, basis: [90, 180], days: [{ placeId: 'p', km: 92, name: 'Seasonal Camp', town: null, by: 'rider', closed: true }, { ...none, km: 180 }] });
  const w = dayEndWords(t, 0, 'Day 1 · 92 km')!;
  expect(w.text).toBe(BD.appTripDayTo(1, '92', 'Seasonal Camp'));
  expect(w.below).toBe(BD.appTripStopClosed);
});

test('[TRIP-DAY-STOPS] a rider\'s stop gone from the map data is said, with the place the day ends at now (I2)', () => {
  const t = tripWith({ routeId: route.id, basis: [90, 180], days: [{ placeId: 'q', km: 93, name: 'Newer', town: null, by: 'auto', was: 'Other' }, { ...none, km: 180 }] });
  expect(dayEndWords(t, 0, 'Day 1 · 93 km')!.below).toBe(BD.appTripStopGone('Other'));
});

test('[TRIP-DAY-STOPS] with no place near, the window named is the planned day\'s, not the day as moved by the stop before (M2)', () => {
  const t = tripWith({ routeId: route.id, basis: [90, 180], days: [{ placeId: 'p', km: 98, name: 'Far on', town: null, by: 'auto' }, { ...none, km: 180 }] });
  // Day 2 now runs 82 km (98 to 180); its places were searched within 9 km of 180, a tenth of the planned 90 km day.
  expect(dayEndWords(t, 1, 'Day 2 · 82 km')!.below).toBe(BD.appTripStopNone('9'));
});

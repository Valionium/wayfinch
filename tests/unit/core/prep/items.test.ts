// Trip prep, "Before you leave" on Trip's Go step (design of 15 November 2026): which items show for which trip and bike, and where each
// is done in the app. The bike checks are Bike care's own tasks, by their names, fitted as Bike care fits them.
import { expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import { careDetails } from '../../../../src/core/care/fit.ts';
import { prepFacts, prepItems } from '../../../../src/core/prep/items.ts';
import type { PrepFacts } from '../../../../src/core/prep/items.ts';
import { CARE_TASKS } from '../../../../src/core/wording/en-care.ts';
import { PR } from '../../../../src/core/wording/en-prep.ts';
import { flatRoute, testTrip } from '../../../fixtures/build.ts';

const bike = (extra: Record<string, unknown>): BikeRecord => normaliseBike({ id: 'bike_1', name: 'Test', ...extra })!;
const DISC_CHAIN = careDetails(bike({ brakes: 'hydraulic-disc', tyres: 'tubeless', drive: 'derailleur', shifting: 'cable' }));
const facts = (over: Partial<PrepFacts> = {}): PrepFacts => ({ days: 1, details: DISC_CHAIN, prepared: true, firstStop: null, ...over });
const ids = (f: PrepFacts): string[] => prepItems(f).map((i) => i.id);
const careName = (id: string): string => CARE_TASKS.find((t) => t.id === id)!.name;

test('[TRIP-PREP-ITEMS] a day ride: the two every-ride checks from Bike care by name, then the kit, charging, the forecast and telling someone; no night, chain, pads or bolts', () => {
  const items = prepItems(facts());
  expect(items.map((i) => i.id)).toEqual(['brakes-lever-test', 'tyres-pressure', 'kit', 'charge', 'forecast', 'tell']);
  expect(items[0]!.text).toBe(careName('brakes-lever-test'));
  expect(items[1]!.text).toBe(careName('tyres-pressure'));
  expect(items.find((i) => i.id === 'kit')!.text).toBe(PR.prepKit);
  expect(items.find((i) => i.id === 'charge')!.text).toBe(PR.prepCharge);
  expect(items.find((i) => i.id === 'forecast')!.text).toBe(PR.prepForecast);
  expect(items.find((i) => i.id === 'tell')!.text).toBe(PR.prepTell);
  // no stages at all reads as a day ride
  expect(ids(facts({ days: 0 }))).toEqual(ids(facts()));
});

test("[TRIP-PREP-ITEMS] two days or more add the chain, the pads that fit the brakes and the bolts, and the first night's stop", () => {
  for (const days of [2, 3, 12]) {
    expect(ids(facts({ days }))).toEqual([
      'brakes-lever-test', 'tyres-pressure', 'chain-wear-check', 'brakes-pads-disc', 'frame-bolts-check', 'kit', 'charge', 'forecast', 'tell', 'night',
    ]);
  }
  const items = prepItems(facts({ days: 2 }));
  for (const id of ['chain-wear-check', 'brakes-pads-disc', 'frame-bolts-check']) expect(items.find((i) => i.id === id)!.text).toBe(careName(id));
});

test('[TRIP-PREP-ITEMS] fitted as Bike care fits: a belt drive has no chain check, rim brakes only the rim pads, a Not sure detail shows both', () => {
  const belt = careDetails(bike({ brakes: 'rim', drive: 'belt' }));
  expect(ids(facts({ days: 3, details: belt })).filter((i) => !['kit', 'charge', 'forecast', 'tell', 'night'].includes(i)))
    .toEqual(['brakes-lever-test', 'tyres-pressure', 'brakes-pads-rim', 'frame-bolts-check']);
  // No bike at all: every detail is Not sure, so each task shows, as in Bike care (ruling R3: a needed task missed is worse than one extra)
  expect(ids(facts({ days: 3, details: careDetails(null) })).slice(0, 6))
    .toEqual(['brakes-lever-test', 'tyres-pressure', 'chain-wear-check', 'brakes-pads-disc', 'brakes-pads-rim', 'frame-bolts-check']);
  // a brake answered "Other" is not a disc or a rim brake: neither pads task
  expect(ids(facts({ days: 3, details: careDetails(bike({ brakes: 'other', drive: 'chain-hub' })) }))).not.toContain('brakes-pads-disc');
  expect(ids(facts({ days: 3, details: careDetails(bike({ brakes: 'other', drive: 'chain-hub' })) }))).toContain('chain-wear-check');
});

test("[TRIP-PREP-ITEMS] the first night names the stop Trip chose for day 1, and says it plainly without one", () => {
  expect(prepItems(facts({ days: 2, firstStop: 'Camping Rheinaue' })).find((i) => i.id === 'night')!.text).toBe(PR.prepNight('Camping Rheinaue'));
  expect(PR.prepNight('Camping Rheinaue')).toContain('Camping Rheinaue');
  expect(prepItems(facts({ days: 2 })).find((i) => i.id === 'night')!.text).toBe(PR.prepNight(null));
  // a day ride has no night, whatever the stops say
  expect(ids(facts({ days: 1, firstStop: 'Camping Rheinaue' }))).not.toContain('night');
});

test("[TRIP-PREP-ITEMS] prepFacts: the days are the route's stages, the bike's details as Bike care reads them, and the stop day 1 ends at", () => {
  const trip = testTrip();
  expect(trip.route.stages.length).toBe(4);
  const f = prepFacts(trip, bike({ brakes: 'rim', drive: 'belt' }), false);
  expect(f).toEqual({ days: 4, details: careDetails(bike({ brakes: 'rim', drive: 'belt' })), prepared: false, firstStop: null });
  expect(prepFacts(trip, null, true).details).toEqual(careDetails(null));
  expect(prepFacts({ ...trip, route: flatRoute(60) }, null, true).days).toBe(1);
  // a stop Trip chose for day 1 (at the stage's end) is named; one for another route, or with no place, is not
  const stops = { routeId: trip.route.id, basis: [78, 150, 222], days: [
    { placeId: 'p1', km: 78, name: 'Camping Rheinaue', town: null, by: 'auto' as const },
    { placeId: 'p2', km: 150, name: 'Hotel Krone', town: null, by: 'auto' as const },
    { placeId: null, km: 222, name: null, town: null, by: 'auto' as const },
  ] };
  expect(prepFacts({ ...trip, stops }, null, true).firstStop).toBe('Camping Rheinaue');
  expect(prepFacts({ ...trip, stops: { ...stops, routeId: 'another-route' } }, null, true).firstStop).toBeNull();
  expect(prepFacts({ ...trip, stops: { ...stops, days: [{ ...stops.days[0]!, placeId: null, name: null }, ...stops.days.slice(1)] } }, null, true).firstStop).toBeNull();
});

test('[TRIP-PREP-LINKS] each item says where it is done: Bike care, Prepare this route, En route once prepared; charging and the first night have none', () => {
  const links = (f: PrepFacts) => Object.fromEntries(prepItems(f).map((i) => [i.id, i.link]));
  expect(links(facts({ days: 3 }))).toEqual({
    'brakes-lever-test': 'care', 'tyres-pressure': 'care', 'chain-wear-check': 'care', 'brakes-pads-disc': 'care', 'frame-bolts-check': 'care',
    kit: 'care', charge: null, forecast: 'prepare', tell: 'ahead', night: null,
  });
  // En route has no Share progress before Prepare this route has run: telling someone then links nowhere
  expect(links(facts({ prepared: false })).tell).toBeNull();
});

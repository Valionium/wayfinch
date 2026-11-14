// Trip prep, "Before you leave" on Trip's Go step (design of 15 November 2026): which items show for which trip and bike, and where each
// is done in the app. The bike checks are Bike care's own tasks, by their names, fitted as Bike care fits them.
import { expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import { careDetails, fitOf } from '../../../../src/core/care/fit.ts';
import { EVERY_TRIP, LONGER_TRIP, prepFacts, prepItems } from '../../../../src/core/prep/items.ts';
import type { PrepFacts } from '../../../../src/core/prep/items.ts';
import { CARE_TASKS } from '../../../../src/core/wording/en-care.ts';
import { PR, PREP_CHECKS } from '../../../../src/core/wording/en-prep.ts';
import { flatRoute, testTrip } from '../../../fixtures/build.ts';

const bike = (extra: Record<string, unknown>): BikeRecord => normaliseBike({ id: 'bike_1', name: 'Test', ...extra })!;
const DISC_CHAIN = bike({ brakes: 'hydraulic-disc', tyres: 'tubeless', drive: 'derailleur', shifting: 'cable' });
const facts = (over: Partial<PrepFacts> = {}): PrepFacts => ({ days: 1, bike: DISC_CHAIN, ...over });
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
  const belt = bike({ brakes: 'rim', drive: 'belt' });
  expect(ids(facts({ days: 3, bike: belt })).filter((i) => !['kit', 'charge', 'forecast', 'tell', 'night'].includes(i)))
    .toEqual(['brakes-lever-test', 'tyres-pressure', 'brakes-pads-rim', 'frame-bolts-check']);
  // No bike at all: every detail is Not sure, so each task shows, as in Bike care (ruling R3: a needed task missed is worse than one extra)
  expect(ids(facts({ days: 3, bike: null })).slice(0, 6))
    .toEqual(['brakes-lever-test', 'tyres-pressure', 'chain-wear-check', 'brakes-pads-disc', 'brakes-pads-rim', 'frame-bolts-check']);
  // a brake answered "Other" is not a disc or a rim brake: neither pads task
  expect(ids(facts({ days: 3, bike: bike({ brakes: 'other', drive: 'chain-hub' }) }))).not.toContain('brakes-pads-disc');
  expect(ids(facts({ days: 3, bike: bike({ brakes: 'other', drive: 'chain-hub' }) }))).toContain('chain-wear-check');
});

test("[TRIP-PREP-ITEMS] the first night is one plain line for two days or more, never on a day ride", () => {
  expect(prepItems(facts({ days: 2 })).find((i) => i.id === 'night')!.text).toBe(PR.prepNight);
  expect(ids(facts({ days: 1 }))).not.toContain('night');
});

// Sweep 2 of 15 Nov 2026, #6: no "the day before you leave" once that day is past; the first night names the stop Trip holds for it.
test('[TRIP-PREP-ITEMS] a trip that starts today, or has started, has no "the day before you leave" line; tomorrow, later or with no date it has', () => {
  const trip = testTrip({ departureDate: '2026-10-17' });
  const forecastOn = (today: string | undefined, t = trip): boolean => ids(prepFacts(t, DISC_CHAIN, today)).includes('forecast');
  expect(forecastOn('2026-10-17')).toBe(false);
  expect(forecastOn('2026-10-18')).toBe(false);
  expect(forecastOn('2026-10-16')).toBe(true);
  expect(forecastOn('2026-10-01')).toBe(true);
  expect(forecastOn('2026-10-17', { ...trip, departureDate: null })).toBe(true);
  // no date known for today: as before
  expect(forecastOn(undefined)).toBe(true);
  // everything else stays, in its order
  expect(ids(prepFacts(trip, DISC_CHAIN, '2026-10-17'))).toEqual(ids(prepFacts(trip, DISC_CHAIN)).filter((i) => i !== 'forecast'));
});

test("[TRIP-PREP-ITEMS] the first night's line names the place Trip holds for night 1; with no place held (none, or the rider's No stop) it is the plain line", () => {
  const trip = testTrip();
  const basis = trip.route.stages.slice(0, -1).map((s) => s.endKm);
  const day = (placeId: string | null, name: string | null, by: 'auto' | 'rider' = 'auto') => ({ placeId, km: basis[0]!, name, town: null, by });
  const rest = basis.slice(1).map((km) => ({ placeId: null, km, name: null, town: null, by: 'auto' as const }));
  const held = (d: ReturnType<typeof day>) => ({ ...trip, stops: { routeId: trip.route.id, basis, days: [d, ...rest] } });
  const night = (t: typeof trip) => prepItems(prepFacts(t, null)).find((i) => i.id === 'night')!.text;
  expect(night(held(day('p1', 'Campingpark Eberbach')))).toBe(PR.prepNightAt('Campingpark Eberbach'));
  expect(PR.prepNightAt('Campingpark Eberbach')).toBe('Check where you sleep the first night (Campingpark Eberbach): open that night, and booked if it takes bookings.');
  expect(night(held(day('p1', 'Camping am See', 'rider')))).toBe(PR.prepNightAt('Camping am See'));
  expect(night(held(day(null, null, 'rider')))).toBe(PR.prepNight);
  expect(night(trip)).toBe(PR.prepNight);
  // stops held for another route are not this trip's
  expect(night({ ...held(day('p1', 'Campingpark Eberbach')), stops: { routeId: 'other', basis, days: [day('p1', 'Campingpark Eberbach'), ...rest] } })).toBe(PR.prepNight);
});

test("[TRIP-PREP-ITEMS] prepFacts: the days are the route's stages, and the bike's brakes and drive", () => {
  const trip = testTrip();
  expect(trip.route.stages.length).toBe(4);
  expect(prepFacts(trip, bike({ brakes: 'rim', drive: 'belt' }))).toEqual({ days: 4, bike: { brakes: 'rim', drive: 'belt' } });
  expect(prepFacts(trip, null)).toEqual({ days: 4, bike: null });
  expect(prepFacts({ ...trip, route: flatRoute(60) }, null).days).toBe(1);
});

test('[TRIP-PREP-LINKS] the bike checks and the kit link to Bike care; charging, the forecast (this step), telling someone and the first night link nowhere', () => {
  const links = (f: PrepFacts) => Object.fromEntries(prepItems(f).map((i) => [i.id, i.link]));
  expect(links(facts({ days: 3 }))).toEqual({
    'brakes-lever-test': 'care', 'tyres-pressure': 'care', 'chain-wear-check': 'care', 'brakes-pads-disc': 'care', 'frame-bolts-check': 'care',
    kit: 'care', charge: null, forecast: null, tell: null, night: null,
  });
  // En route's Share progress needs a position on the route: before leaving there is none, so telling someone is done outside the app
});

test("[TRIP-PREP-ITEMS] the bike checks are Bike care's tasks word for word: the same names and the same conditions as en-care.ts", () => {
  const checks = [...EVERY_TRIP, ...LONGER_TRIP];
  expect(Object.keys(PREP_CHECKS).sort()).toEqual(checks.map((c) => c.id).sort());
  for (const c of checks) {
    const task = CARE_TASKS.find((t) => t.id === c.id);
    expect(task, c.id).toBeDefined();
    expect(PREP_CHECKS[c.id], c.id).toBe(task!.name);
    expect(c.applies, c.id).toEqual(task!.applies);
  }
});

test("[TRIP-PREP-ITEMS] the checks fit every bike exactly as Bike care fits them (careDetails, fitOf): each answer of brakes and drive, and no bike", () => {
  const checks = [...EVERY_TRIP, ...LONGER_TRIP];
  // the checks depend on no other detail than these two
  for (const c of checks) expect(Object.keys(c.applies).every((k) => k === 'brakes' || k === 'drive'), c.id).toBe(true);
  const bikes: (BikeRecord | null)[] = [null];
  for (const brakes of ['unknown', 'hydraulic-disc', 'cable-disc', 'rim', 'other']) {
    for (const drive of ['unknown', 'derailleur', 'chain-hub', 'belt']) bikes.push(bike({ brakes, drive }));
  }
  for (const b of bikes) {
    const care = careDetails(b);
    const expected = checks.filter((c) => fitOf(CARE_TASKS.find((t) => t.id === c.id)!.applies, care).show).map((c) => c.id);
    expect(ids(facts({ days: 3, bike: b })).filter((i) => i in PREP_CHECKS), JSON.stringify(b && [b.brakes, b.drive])).toEqual(expected);
  }
});

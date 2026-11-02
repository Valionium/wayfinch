import { describe, expect, test } from 'vitest';
import { findS1S2, sourceAt, waterAnswer, type WaterFacts } from '../../../../src/core/engines/water.ts';
import { openAtArrival } from '../../../../src/core/hours/check.ts';
import { waterClass } from '../../../../src/core/places/water.ts';
import type { Baseline, LoadSummary, Place, RouteMatch } from '../../../../src/core/types.ts';
import { at, fuelShop, restaurant, shop, tap, toilet, bakery, flatRoute, testTrip, type PlaceOptions } from '../../../fixtures/build.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { factsOf, hoursOf, SAT } from './water-helpers.ts';

const JULY = '2026-07-11 12:00';
const judge = (p: Place, arrival: string | Date, f: WaterFacts = factsOf()): ReturnType<typeof sourceAt> => {
  const m: RouteMatch = { placeId: p.id, km: 30, offRouteM: 0 };
  return sourceAt(p, m, arrival instanceof Date ? arrival : at(arrival), f);
};
const tapWith = (over: PlaceOptions = {}): Place => tap(over).atKm(30);
const classed = (tags: Record<string, string>, inCemetery = false): Place => {
  const cls = waterClass(tags, { inCemetery });
  return tap({ waterClass: cls, tags }).atKm(30);
};

describe('classes', () => {
  test('[W-CLASSES] class A counts', () => {
    for (const tags of [{ amenity: 'drinking_water' }, { man_made: 'water_tap', drinking_water: 'yes' }, { man_made: 'water_tap', 'drinking_water:legal': 'yes' }] as Record<string, string>[]) {
      const p = classed(tags);
      expect(p.waterClass).toBe('A');
      expect(judge(p, JULY)).toEqual({ reliable: true, reason: null });
    }
  });

  test('[W-CLASSES] class B: a spring with drinking_water=yes, a refill venue. Never reliable', () => {
    for (const tags of [{ natural: 'spring', drinking_water: 'yes' }, { amenity: 'cafe', 'drinking_water:refill': 'yes' }] as Record<string, string>[]) {
      const p = classed(tags);
      expect(p.waterClass).toBe('B');
      const v = judge(p, JULY);
      expect(v.reliable).toBe(false);
      expect(v.reason).toBeTruthy();
    }
  });

  test('[W-CLASSES] class C: an untagged spring, a cemetery tap. Never reliable', () => {
    const spring = classed({ natural: 'spring' });
    const cemetery = classed({ man_made: 'water_tap', in_cemetery: 'yes' }, true);
    expect(spring.waterClass).toBe('C');
    expect(cemetery.waterClass).toBe('C');
    expect(judge(spring, JULY).reliable).toBe(false);
    expect(judge(cemetery, JULY).reliable).toBe(false);
  });

  test('[W-CLASSES] class D: drinking_water=no, a decorative fountain. Never reliable', () => {
    for (const tags of [{ man_made: 'water_tap', drinking_water: 'no' }, { amenity: 'fountain' }] as Record<string, string>[]) {
      const p = classed(tags);
      expect(p.waterClass).toBe('D');
      expect(judge(p, JULY).reliable).toBe(false);
    }
  });

  test('[W-CLASSES] the engine reads the class, not the kind or tags: a class B place with class A tags stays B', () => {
    expect(judge(tap({ waterClass: 'B' }).atKm(30), JULY).reliable).toBe(false);
    expect(judge(shop('24/7', { waterClass: 'C' }).atKm(30), JULY).reliable).toBe(false);
  });

  test('[W-CLASSES] a place that is no water source at all (a toilet without water, a restaurant) is not reliable', () => {
    const allYear = (x: Place): WaterFacts => factsOf({ hours: [hoursOf(x, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] });
  for (const p of [toilet('24/7').atKm(30), restaurant('24/7').atKm(30)]) {
    expect(judge(p, JULY, allYear(p))).toEqual({ reliable: false, reason: 'not a water source' });
  }
  });
});

describe('outdoor class A points', () => {
  test('[W-SOURCE-OUTDOOR] counts in summer', () => {
    expect(judge(tapWith(), JULY)).toEqual({ reliable: true, reason: null });
  });
  test('[W-SOURCE-OUTDOOR] seasonal=no counts all year', () => {
    for (const when of [JULY, '2026-01-15 12:00', '2026-11-15 12:00']) expect(judge(tapWith({ seasonal: 'no' }), when).reliable).toBe(true);
  });
  test('[W-SOURCE-OUTDOOR] "Apr-Oct": inside it counts, outside it is uncertain with the window as the reason', () => {
    const p = tapWith({ seasonal: 'Apr-Oct' });
    expect(judge(p, JULY).reliable).toBe(true);
    expect(judge(p, '2026-10-31 12:00').reliable).toBe(true);
    expect(judge(p, '2026-11-01 12:00')).toEqual({ reliable: false, reason: 'seasonal: Apr–Oct' });
    expect(judge(p, '2026-03-31 12:00')).toEqual({ reliable: false, reason: 'seasonal: Apr–Oct' });
  });
  test('[W-SOURCE-OUTDOOR] seasons are meteorological, and lists and windows over the new year read', () => {
    expect(judge(tapWith({ seasonal: 'summer' }), '2026-06-01 12:00').reliable).toBe(true);
    expect(judge(tapWith({ seasonal: 'summer' }), '2026-09-01 12:00')).toEqual({ reliable: false, reason: 'seasonal: summer' });
    expect(judge(tapWith({ seasonal: 'spring;autumn' }), '2026-09-15 12:00').reliable).toBe(true);
    expect(judge(tapWith({ seasonal: 'spring;autumn' }), '2026-07-15 12:00').reliable).toBe(false);
    expect(judge(tapWith({ seasonal: 'Oct-Mar' }), '2026-01-15 12:00').reliable).toBe(true);
    expect(judge(tapWith({ seasonal: 'Oct-Mar' }), '2026-07-15 12:00').reliable).toBe(false);
    expect(judge(tapWith({ seasonal: 'winter' }), '2026-01-15 12:00').reliable).toBe(true);
  });
  test('[W-SOURCE-OUTDOOR] seasonal=yes, dry_season, wet_season and unparseable values give no window', () => {
    for (const seasonal of ['yes', 'dry_season', 'wet_season', 'when it rains', 'Foo-Bar']) {
      expect(judge(tapWith({ seasonal }), JULY).reliable).toBe(true);
      expect(judge(tapWith({ seasonal }), '2026-01-15 12:00')).toEqual({ reliable: false, reason: 'may be switched off for winter' });
    }
  });
});

const baseline = (over: Partial<Baseline['points'][number]>[]): Baseline => ({
  years: '2021-2025', points: over.map((o) => ({ km: 0, eleM: 100, month: 10, p10LowC: 4, meanLowC: 7, p90HighC: 18, meanHighC: 14, rainDays: 8, ...o })),
});

describe('winter', () => {
  const off = { reliable: false, reason: 'may be switched off for winter' };
  test('[W-WINTER] 1 Nov to 31 Mar, on the place\'s own calendar', () => {
    expect(judge(tapWith(), '2026-10-31 23:30').reliable).toBe(true);
    expect(judge(tapWith(), '2026-11-01 00:30')).toEqual(off);
    expect(judge(tapWith(), '2026-03-31 23:30')).toEqual(off);
    expect(judge(tapWith(), '2026-04-01 00:30').reliable).toBe(true);
    // 23:30 UTC on 31 October is already 1 November in Berlin, and still 31 October in Lisbon.
    const instant = new Date('2026-10-31T23:30:00Z');
    expect(judge(tapWith(), instant)).toEqual(off);
    expect(judge(tapWith({ timeZone: 'Europe/Lisbon' }), instant).reliable).toBe(true);
  });
  test('[W-WINTER] in winter it counts with seasonal=no or a window with the arrival', () => {
    expect(judge(tapWith({ seasonal: 'no' }), '2026-12-15 12:00').reliable).toBe(true);
    expect(judge(tapWith({ seasonal: 'Nov-Feb' }), '2026-12-15 12:00').reliable).toBe(true);
  });
  test('[W-WINTER] or with hours open for the whole +-30 minutes', () => {
    const p = tapWith();
    const date = '2026-12-15';
    const f = (from: string, to: string): WaterFacts => factsOf({ hours: [hoursOf(p, [{ from, to }], date)] });
    expect(judge(p, `${date} 12:00`, f('11:30', '12:30')).reliable).toBe(true);
    expect(judge(p, `${date} 12:00`, f('11:31', '13:00'))).toEqual(off);
    expect(judge(p, `${date} 12:00`, f('11:00', '12:29'))).toEqual(off);
  });
  test('[W-WINTER] also any month whose 10th-percentile low at the nearest baseline point is at or below 0 °C', () => {
    const f = (p10LowC: number): WaterFacts => factsOf({ baseline: baseline([{ p10LowC }]) });
    expect(judge(tapWith(), '2026-10-10 12:00', f(0))).toEqual(off);
    expect(judge(tapWith(), '2026-10-10 12:00', f(-2))).toEqual(off);
    expect(judge(tapWith(), '2026-10-10 12:00', f(0.1)).reliable).toBe(true);
    expect(judge(tapWith(), '2026-09-10 12:00', f(-2)).reliable).toBe(true); // another month
  });
  test('[W-WINTER] the low is moved to the route\'s height at the match, 0.65 °C per 100 m', () => {
    const route = flatRoute(100, { ele: 1100 });
    const trip = testTrip({ route });
    // The baseline point at 100 m: 3 °C. At 1,100 m: 3 - 6.5 = -3.5.
    expect(judge(tapWith(), '2026-10-10 12:00', factsOf({ trip, baseline: baseline([{ p10LowC: 3, eleM: 100 }]) }))).toEqual(off);
    // The baseline point at 1,100 m: -3. At 100 m: -3 + 6.5 = 3.5.
    const low = testTrip({ route: flatRoute(100, { ele: 100 }) });
    expect(judge(tapWith(), '2026-10-10 12:00', factsOf({ trip: low, baseline: baseline([{ p10LowC: -3, eleM: 1100 }]) })).reliable).toBe(true);
  });
  test('[W-WINTER] the nearest baseline point by route kilometre answers', () => {
    const b = baseline([{ km: 0, p10LowC: 5 }, { km: 40, p10LowC: -1 }, { km: 300, p10LowC: 5 }]);
    expect(judge(tapWith(), '2026-10-10 12:00', factsOf({ baseline: b }))).toEqual(off);
  });
  test('[W-WINTER] a baseline figure that is not a number makes the point uncertain, never reliable', () => {
    expect(judge(tapWith(), '2026-10-10 12:00', factsOf({ baseline: baseline([{ p10LowC: NaN }]) }))).toEqual(off);
  });
});

test('[W-BERLIN-NOV] a November route through Berlin with untagged fountains never targets them', () => {
  const trip = testTrip({ departureDate: '2026-11-14' });
  const fountain = waterClass({ amenity: 'fountain' }, { inCemetery: false });
  const f = factsOf({
    trip, now: '2026-11-14 09:00',
    spots: [
      { b: tap({ waterClass: fountain, tags: { amenity: 'fountain' } }), km: 20 },
      { b: tap({ tags: { amenity: 'fountain', drinking_water: 'yes' } }), km: 25 },
      { b: tap({ tags: { amenity: 'drinking_water' } }), km: 30 },
      { b: tap({ waterClass: 'B', tags: { man_made: 'water_tap' } }), km: 35 },
    ],
  });
  const { s1, s2 } = findS1S2(f);
  expect(s1.kind).toBe('end');
  expect(s2.kind).toBe('end');
  const a = waterAnswer(f);
  expect(a.status).not.toBe('fine');
  expect(a.items.map((i) => i.detail).join(' ')).toContain('may be switched off for winter');
});

describe('indoor and limited sources', () => {
  const inside = (hours: string | null, over: PlaceOptions = {}): Place => toilet(hours, { waterClass: 'A', indoorOrLimited: true, ...over }).atKm(30);
  const noon = `${SAT} 12:00`;

  test('[W-INDOOR] a toilet with unknown hours is never a target', () => {
    const p = inside(null);
    expect(judge(p, noon).reliable).toBe(false);
    expect(judge(p, noon, factsOf({ hours: [hoursOf(p, [{ from: '00:00', to: '23:59', state: 'unknown', reason: 'hours unknown' }])] }))).toEqual({ reliable: false, reason: 'hours unknown' });
    expect(judge(p, noon, factsOf({ hours: [hoursOf(p, [{ from: '00:00', to: '23:59', state: 'possibly-closed', reason: 'probably closed' }])] })).reliable).toBe(false);
  });
  test('[W-INDOOR] class A in a building counts only when open from -30 to +30 minutes', () => {
    const p = inside('x');
    const with_ = (from: string, to: string): WaterFacts => factsOf({ hours: [hoursOf(p, [{ from, to }])] });
    expect(judge(p, noon, with_('11:30', '12:30')).reliable).toBe(true);
    expect(judge(p, noon, with_('11:31', '13:00')).reliable).toBe(false);
    expect(judge(p, noon, with_('11:00', '12:29')).reliable).toBe(false);
  });
  test('[W-INDOOR] or 24/7', () => {
    const p = inside('24/7');
    expect(judge(p, noon, factsOf({ hours: [hoursOf(p, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] })).reliable).toBe(true);
  });
  test('[W-INDOOR] winter makes no difference to an open building', () => {
    const p = inside('x');
    expect(judge(p, '2026-12-15 12:00', factsOf({ hours: [hoursOf(p, [{ from: '08:00', to: '18:00' }], '2026-12-15')] })).reliable).toBe(true);
  });
  test('[W-INDOOR] refill venues never, even when open, with the hours shown', () => {
    const p = bakery('x', { waterClass: 'B', tags: { 'drinking_water:refill': 'yes' } }).atKm(30);
    const f = factsOf({ hours: [hoursOf(p, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] });
    expect(judge(p, noon, f).reliable).toBe(false);
  });
});

test('[W-SHOP-WINDOW] a shop closing 10 min after arrival is not reliable; Food still lists it open at arrival', () => {
  const p = shop('x').atKm(30);
  const hours = hoursOf(p, [{ from: '08:00', to: '20:00' }]);
  const f = factsOf({ hours: [hours] });
  const arrival = at(`${SAT} 19:50`);
  const verdict = judge(p, arrival, f);
  expect(verdict.reliable).toBe(false);
  expect(verdict.reason).toBe('closes or opens within 30 minutes of arrival');
  expect(openAtArrival(hours, arrival)).toBe(true);
  expect(judge(p, at(`${SAT} 19:30`), f).reliable).toBe(true);
  expect(judge(p, at(`${SAT} 08:30`), f).reliable).toBe(true);
  expect(judge(p, at(`${SAT} 08:29`), f).reliable).toBe(false);
});

test('[W-SHOP-WINDOW] a closed shop, and shops and cafés with unknown or may-be-open hours, are not reliable', () => {
  const p = shop(null).atKm(30);
  expect(judge(p, `${SAT} 12:00`).reliable).toBe(false);
  const closed = hoursOf(p, [{ from: '08:00', to: '10:00' }]);
  expect(judge(p, `${SAT} 12:00`, factsOf({ hours: [closed] }))).toEqual({ reliable: false, reason: 'closed at arrival' });
  const mayBe = hoursOf(p, [{ from: '00:00', to: '23:59', state: 'unknown', reason: 'may be open, an assumption' }]);
  expect(judge(p, `${SAT} 12:00`, factsOf({ hours: [mayBe] }))).toEqual({ reliable: false, reason: 'may be open, an assumption' });
});

describe('fuel', () => {
  const open = (p: Place): WaterFacts => factsOf({ hours: [hoursOf(p, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] });
  test('[W-FUEL] a fuel-station shop that is open counts', () => {
    const p = fuelShop('x').atKm(30);
    expect(judge(p, `${SAT} 12:00`, open(p)).reliable).toBe(true);
  });
  test('[W-FUEL] a fuel station without a shop is not reliable', () => {
    for (const shopTag of [undefined, 'no']) {
      const base = fuelShop('x').atKm(30);
      const tags: Record<string, string> = { amenity: 'fuel' };
      if (shopTag) tags['shop'] = shopTag;
      const p: Place = { ...base, tags };
      expect(judge(p, `${SAT} 12:00`, open(p))).toEqual({ reliable: false, reason: 'no shop mapped at this fuel station' });
    }
  });
  test('[W-FUEL] an automated one is not reliable', () => {
    const p = fuelShop('x', { tags: { automated: 'yes' } }).atKm(30);
    expect(judge(p, `${SAT} 12:00`, open(p)).reliable).toBe(false);
  });
});

const fullSummary = (filter: boolean): LoadSummary => ({
  app: 'load-check', kind: 'load-summary', v: 1, at: 'x', planUpdatedAt: 'x', nights: 1, month: 7, departureDate: null, mode: 'comfort', foodDays: 1, bikeId: null,
  bags: { count: 0, positions: [], items: [] }, decks: { bar: null, rack: null },
  water: { bottles: [{ slot: 'st', L: 1.25 }], cageL: 1.25, extraL: 0, totalL: 1.25 },
  weight: { kitKg: 5, cageWaterKg: 1, carriedKg: 6, bikeKg: null, emptyLuggageKg: null, byPositionKg: { fork: 0, bar: 0, top: 0, frame: 0, bottle: 0, seat: 0, rack: 0, pack: 0 }, unplacedKg: 0 },
  kit: { waterFilter: filter },
});

test('[W-FILTER] class C with a filter reads "usable with your filter" and stays uncertain', () => {
  const p = tap({ waterClass: 'C', tags: { natural: 'spring' } }).atKm(30);
  const withFilter = judge(p, JULY, factsOf({ summary: fullSummary(true) }));
  expect(withFilter).toEqual({ reliable: false, reason: 'usable with your filter' });
  expect(judge(p, JULY, factsOf({ summary: fullSummary(false) }))).toEqual({ reliable: false, reason: 'treat or filter first' });
  expect(judge(p, JULY, factsOf())).toEqual({ reliable: false, reason: 'treat or filter first' });
  // A filter changes nothing for class B: the label is for class C.
  expect(judge(tap({ waterClass: 'B' }).atKm(30), JULY, factsOf({ summary: fullSummary(true) })).reason).toBe('water not verified');
});

describe('labels', () => {
  const card = (over: PlaceOptions) => waterAnswer(factsOf({ spots: [{ b: tap(over), km: 30 }, { b: tap({ id: 'n999' }), km: 60, id: 'n999' }] }));
  const textOf = (a: ReturnType<typeof waterAnswer>): string => [a.title, a.detail, ...a.basis, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');

  test('[W-LABELS] "mapped as drinking water", never "safe"', () => {
    const text = textOf(card({}));
    expect(text).toContain('mapped as drinking water');
    expect(bannedHits(text)).toEqual([]);
  });
  test('[W-LABELS] a check_date older than 3 years: "unverified since YYYY"', () => {
    expect(textOf(card({ checkDate: '2021-05-02' }))).toContain('unverified since 2021');
    expect(textOf(card({ checkDate: '2023-10-16' }))).toContain('unverified since 2023');
    expect(textOf(card({ checkDate: '2023-10-18' }))).not.toContain('unverified since');
  });
  test('[W-LABELS] fees shown', () => {
    expect(textOf(card({ tags: { fee: 'yes' } }))).toMatch(/\bfee\b/);
    expect(textOf(card({ tags: { fee: 'no' } }))).not.toMatch(/\bfee\b/);
    expect(textOf(card({}))).not.toMatch(/\bfee\b/);
  });
  test('[W-LABELS] "© OpenStreetMap contributors" in the basis', () => {
    expect(card({}).basis).toContain('© OpenStreetMap contributors');
  });
  test('[W-LABELS] a shop is not called mapped drinking water', () => {
    const p = shop('x').atKm(30);
    const a = waterAnswer(factsOf({ spots: [{ b: shop('x'), km: 30 }], hours: [{ ...hoursOf(p, [{ from: '00:00', to: '23:59' }]), placeId: p.id }] }));
    expect(a.items.map((i) => i.detail ?? '').join(' ')).not.toContain('mapped as drinking water');
  });
});

test('[W-CLASSES] an arrival that is not a time never makes a source reliable, and does not throw', () => {
  const bad = new Date(NaN);
  const indoor = toilet('x', { waterClass: 'A', indoorOrLimited: true }).atKm(30);
  const store = shop('x').atKm(30);
  for (const p of [tapWith(), tapWith({ seasonal: 'no' }), tapWith({ seasonal: 'Apr-Oct' }), indoor, store]) {
    const f = factsOf({ hours: [hoursOf(p, [{ from: '2026-01-01 00:00', to: '2027-01-01 00:00' }])] });
    expect(judge(p, bad, f).reliable).toBe(false);
  }
});

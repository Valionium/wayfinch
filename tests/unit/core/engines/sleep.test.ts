import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { callAhead, sleepAnswer, type SleepFacts } from '../../../../src/core/engines/sleep.ts';
import { arrivalRidingOn } from '../../../../src/core/engines/leaveby.ts';
import { stateWithin } from '../../../../src/core/hours/check.ts';
import { nowSchedule } from '../../../../src/core/engines/tripday.ts';
import { ALL_KINDS } from '../../../../src/core/places/types.ts';
import type { Answer, AnswerItem, Km, Place, PlaceHours } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { W } from '../../../../src/core/wording/en.ts';
import { at, bakery, bikeShop, campsite, hut, lodging, pos, shelter, testTrip, type PlaceBuilder } from '../../../fixtures/build.ts';
import { placeAt } from '../../../fixtures/places.ts';
import { leaveFacts, preparedHours, type LeaveCase } from './leaveby-helpers.ts';
import { hoursOf, type Spot } from './water-helpers.ts';
import { openAllYear } from './weather-helpers.ts';

const FRI = '2026-10-16';
const SAT = '2026-10-17';
const SUN = '2026-10-18';
const MON = '2026-10-19';
const THU = '2026-10-22';

type Case = Omit<LeaveCase, 'hours'> & { hours?: 'open' | PlaceHours[] | 'prepared' };
function facts(c: Case = {}): SleepFacts {
  const { hours, ...rest } = c;
  const f = leaveFacts({ trip: testTrip(), now: `${SAT} 08:00`, ...rest });
  const hoursList = hours === 'open' ? f.places.map((p) => openAllYear(p.id)) : Array.isArray(hours) ? hours : f.hours;
  return { ...f, hours: hoursList };
}
const sleep = (c: Case = {}): Answer => sleepAnswer(facts(c));
const named = (name: string, o: Parameters<typeof campsite>[0] = {}) => ({ name, ...o });
const camp = (name = 'Camping Rheinaue', o: Parameters<typeof campsite>[0] = {}): PlaceBuilder => campsite(named(name, o));
const itemAt = (a: Answer, km: Km): AnswerItem => {
  const i = a.items.find((x) => x.stamp?.km === km);
  if (!i) throw new Error(`no item at km ${km}: ${JSON.stringify(a.items.map((x) => x.label))}`);
  return i;
};
const textOf = (a: Answer): string => [a.title, a.detail, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
const kms = (a: Answer): (number | undefined)[] => a.items.map((i) => i.stamp?.km);

describe('[SL-CANDIDATES] which places', () => {
  test('before the ride: the places on the ride, and those beyond the stop reached fine or action riding on', () => {
    const f = facts({
      spots: [
        { b: camp('On ride'), km: 60 }, { b: lodging(named('Beyond fine')), km: 150 }, { b: camp('Beyond action'), km: 180 },
        { b: camp('Beyond dark'), km: 200 }, { b: camp('Behind start'), km: 2 },
      ],
      positions: [], hours: 'open',
    });
    // The rider is at the route start at 08:00: km 2 lies on the ride, so it is listed too.
    const a = sleepAnswer(f);
    expect(kms(a)).toEqual([2, 60, 150, 180]);
    // Riding on past km 78 without a night's stop: the arrival is that evening, not tomorrow's.
    // 08:30 plus the km at 20.5 km/h loaded, 15% of breaks added: written out, not read from the pace function.
    const clock = (km: number): Date => new Date(at(`${SAT} 08:30`).getTime() + ((km / 20.5) * 60 * 1.15) * 60_000);
    for (const km of [60, 150, 180]) expect(Math.abs(itemAt(a, km).stamp!.at!.getTime() - clock(km).getTime())).toBeLessThanOrEqual(1000);
    expect(itemAt(a, 60).detail).toContain('about 11:50');
    expect(itemAt(a, 150).status).toBe('fine');
    expect(itemAt(a, 180).status).toBe('action');
    expect(itemAt(a, 180).detail).toContain('lights on from 18:42');
  });

  test('a place beyond the stop is never a warning: one reached after dusk is left out', () => {
    const a = sleep({ spots: [{ b: camp('Beyond dark'), km: 200 }], hours: 'open' });
    expect(a.items).toEqual([]);
  });

  test('the arrival matches the strip: one function for every card (INV-20)', () => {
    const f = facts({ spots: [{ b: camp('On ride'), km: 60, off: 400 }], hours: 'open' });
    expect(Math.abs(sleepAnswer(f).items[0]!.stamp!.at!.getTime() - f.schedule.atPlace(f.matches[0]!).getTime())).toBe(0);
  });

  test('beyond the stop the arrival is riding on, with the place\'s own detour', () => {
    const f = facts({ spots: [{ b: lodging(named('Off route')), km: 150, off: 600 }], hours: 'open' });
    const m = f.matches[0]!;
    expect(sleepAnswer(f).items[0]!.stamp!.at!.getTime()).toBe(arrivalRidingOn(f.schedule, f.ride.stopKm, f.trip.flatKph, m).getTime());
  });

  test('order is by kilometre, then place id as text', () => {
    const spotsIn: Spot[] = [
      { b: camp('B'), km: 50, id: 'n20' }, { b: camp('A'), km: 50, id: 'n10' }, { b: camp('C'), km: 40, id: 'n30' },
    ];
    const a = sleep({ spots: spotsIn, hours: 'open' });
    expect(a.items.map((i) => i.label.split(' · ')[0])).toEqual(['C', 'A', 'B']);
    const reversed = sleep({ spots: [...spotsIn].reverse(), hours: 'open' });
    expect(reversed.items.map((i) => i.label)).toEqual(a.items.map((i) => i.label));
  });

  test('a place on two passes is listed on each, at its own kilometre', () => {
    const a = sleep({ spots: [{ b: camp('Twice'), km: [60, 120] }], hours: 'open' });
    expect(kms(a)).toEqual([60, 120]);
    expect(itemAt(a, 120).stamp!.at!.getTime()).toBeGreaterThan(itemAt(a, 60).stamp!.at!.getTime());
  });

  test('with an approximate position, a place within its radius is near you with no arrival', () => {
    const a = sleep({
      spots: [{ b: camp('Close'), km: 76.3 }, { b: camp('Ahead'), km: 77.5 }],
      positions: [pos({ km: 76, at: `${SAT} 07:00`, acc: 800 })], hours: 'open', now: `${SAT} 07:10`,
    });
    const close = itemAt(a, 76.3);
    expect(close.stamp?.at).toBeUndefined();
    expect(close.detail).toContain('near you, may be behind');
    expect(itemAt(a, 77.5).stamp?.at).toBeDefined();
  });

  test('hotels, hostels, huts and lean-tos are candidates; a bakery is not', () => {
    const a = sleep({
      spots: [
        { b: lodging(named('Hotel One')), km: 10 }, { b: hut(named('Alpine Hut')), km: 20 },
        { b: shelter(named('Leanto', { tags: { shelter_type: 'lean_to' } })), km: 30 }, { b: bakery(null, { name: 'Baker' }), km: 40 },
      ],
      hours: 'open',
    });
    expect(kms(a)).toEqual([10, 20, 30]);
  });

  test('a place off the route by more than its match is not invented: matches decide', () => {
    const a = sleep({ spots: [], hours: 'open' });
    expect(a.items).toEqual([]);
  });

  test('a bad speed reads unknown, not a calm list', () => {
    const f = facts({ trip: testTrip({ flatKph: 0 }), spots: [{ b: camp('On ride'), km: 60 }], hours: 'open' });
    const a = sleepAnswer(f);
    expect(a.status).toBe('unknown');
    expect(textOf(a)).not.toMatch(/NaN|Invalid|undefined|Infinity|null/);
  });
});

describe('[SL-STATUS] the status for the night', () => {
  const dayHours = (p: Place, state: 'open' | 'closed' | 'unknown' | 'possibly-closed'): PlaceHours =>
    hoursOf(p, [{ from: '00:00', to: '23:59', state }]);

  test('fine when a campsite is open for the night', () => {
    const f = facts({ spots: [{ b: camp(), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'open')] });
    expect(a.status).toBe('fine');
    expect(a.title).toBe('Open for the night as mapped: Camping Rheinaue, km 60');
    expect(a.stamp?.km).toBe(60);
    expect(itemAt(a, 60).status).toBe('fine');
    expect(itemAt(a, 60).detail).toContain('open for tonight');
  });

  test('unknown when none is open and one has unknown hours', () => {
    const f = facts({ spots: [{ b: camp('Closed'), km: 50 }, { b: camp('Unknown'), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'closed'), dayHours(f.places[1]!, 'unknown')] });
    expect(a.status).toBe('unknown');
    expect(a.title).toBe('Hours not known: Unknown, km 60');
    expect(itemAt(a, 50).status).toBe('action');
    expect(itemAt(a, 60).status).toBe('unknown');
  });

  test('a possibly closed stretch never counts as open', () => {
    const f = facts({ spots: [{ b: camp(), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'possibly-closed')] });
    expect(a.status).toBe('unknown');
  });

  test('action when all are closed, and when nothing is mapped on saved ground', () => {
    const f = facts({ spots: [{ b: camp(), km: 60 }] });
    const closed = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'closed')] });
    expect(closed.status).toBe('action');
    expect(closed.title).toBe('No open sleep place mapped here');
    const none = sleep({ spots: [] });
    expect(none.status).toBe('action');
    expect(none.missing).toEqual([]);
  });

  test('a lean-to or basic hut never makes it fine: open alone it reads action', () => {
    const f = facts({ spots: [{ b: shelter(named('Leanto', { tags: { shelter_type: 'lean_to' } })), km: 40 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'open')] });
    expect(a.status).toBe('action');
    expect(a.title).not.toContain('Leanto');
  });

  test('a lean-to with unknown hours makes the card unknown, as the rule says', () => {
    const f = facts({ spots: [{ b: shelter(named('Leanto', { tags: { shelter_type: 'basic_hut' } })), km: 40 }] });
    expect(sleepAnswer(f).status).toBe('unknown');
  });

  test('a closed campsite beside an open lean-to is not fine', () => {
    const f = facts({ spots: [{ b: camp('Closed'), km: 50 }, { b: shelter(named('Leanto', { tags: { shelter_type: 'lean_to' } })), km: 40 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'closed'), dayHours(f.places[1]!, 'open')] });
    expect(a.status).toBe('action');
  });

  test('real tags: the weekday rule decides the night, Saturday', () => {
    const open = camp('Open', { openingHours: 'Mo-Su 08:00-22:00' }).atKm(60, { id: 'n1' });
    const shut = camp('Shut', { openingHours: 'Mo-Fr 08:00-12:00' }).atKm(70, { id: 'n2' });
    const f = facts();
    const a = sleepAnswer({
      ...f, places: [open, shut], matches: [{ placeId: 'n1', km: 60, offRouteM: 0 }, { placeId: 'n2', km: 70, offRouteM: 0 }],
      hours: [preparedHours(open), preparedHours(shut)],
    });
    expect(itemAt(a, 60).detail).toContain('open for tonight');
    expect(itemAt(a, 70).detail).toContain('closed for tonight');
    expect(a.status).toBe('fine');
  });

  test('the season decides: in season is open, out of season is closed for the season', () => {
    const f = facts({ spots: [{ b: camp('In', { seasonal: 'Apr-Oct' }), km: 50 }, { b: camp('Out', { seasonal: 'Nov-Mar' }), km: 60 }, { b: camp('All year', { seasonal: 'no' }), km: 70 }] });
    const a = sleepAnswer(f);
    expect(itemAt(a, 50).detail).toContain('open for tonight (season Apr–Oct)');
    expect(itemAt(a, 50).status).toBe('fine');
    expect(itemAt(a, 60).detail).toContain('closed for the season (Nov–Mar)');
    expect(itemAt(a, 60).status).toBe('action');
    expect(itemAt(a, 70).detail).toContain('open for tonight');
    expect(a.status).toBe('fine');
  });

  test('a season that is out wins over hours that say open', () => {
    const f = facts({ spots: [{ b: camp('Out', { seasonal: 'Nov-Mar' }), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'open')] });
    expect(a.status).toBe('action');
  });

  test('a season word that is not a season gives no season: unknown, never calm', () => {
    const f = facts({ spots: [{ b: camp('Odd', { seasonal: 'constructor' }), km: 60 }, { b: camp('Odd2', { seasonal: '__proto__' }), km: 61 }] });
    const a = sleepAnswer(f);
    expect(a.status).toBe('unknown');
  });

  test('hours not prepared for the night: unknown, and the data named as missing', () => {
    const f = facts({ spots: [{ b: camp('Mapped', { openingHours: 'Mo-Su 08:00-22:00' }), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [] });
    expect(a.status).toBe('unknown');
    expect(a.missing).toEqual(['hours']);
  });

  test('places not saved for the ride: unknown, with the places named as missing', () => {
    const a = sleep({ spots: [{ b: camp(), km: 60 }], hours: 'open', savedKm: [{ fromKm: 0, toKm: 40 }] });
    expect(a.status).toBe('fine');
    const empty = sleep({ spots: [], savedKm: [] });
    expect(empty.status).toBe('unknown');
    expect(empty.missing).toEqual(['places']);
    expect(empty.title).toBe('No place data here');
  });

  test('no date or clock that is no time cannot make a place open', () => {
    const f = facts({ spots: [{ b: camp(), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [dayHours(f.places[0]!, 'open')], ride: { ...f.ride, date: '' } });
    expect(a.status).not.toBe('fine');
    expect(textOf(a)).not.toMatch(/null|undefined|NaN/);
  });

  fcTest.prop([
    fc.array(fc.record({ km: fc.integer({ min: 0, max: 260 }), state: fc.constantFrom('open', 'closed', 'unknown', 'possibly-closed', 'none'), shelter: fc.boolean() }), { maxLength: 6 }),
    fc.constantFrom(`${FRI} 20:00`, `${SAT} 08:00`),
  ])('never warning; a title never names a lean-to; no banned word; no stray text', (list, now) => {
    const spotsIn: Spot[] = list.map((s, i) => ({ b: s.shelter ? shelter(named(`Hut ${i}`, { tags: { shelter_type: 'lean_to' } })) : camp(`Camp ${i}`), km: s.km, id: `n${100 + i}` }));
    const f = facts({ spots: spotsIn, now });
    const hours = f.places.flatMap((p, i) => (list[i]!.state === 'none' ? [] : [dayHours(p, list[i]!.state as 'open')]));
    const a = sleepAnswer({ ...f, hours });
    expect(a.status).not.toBe('warning');
    expect(a.title).not.toMatch(/Hut \d/);
    expect(bannedHits(JSON.stringify(a))).toEqual([]);
    expect(textOf(a)).not.toMatch(/NaN|undefined|null|Infinity|\[object/);
    for (const i of a.items) if (i.stamp!.km! > f.ride.stopKm) expect(i.status).not.toBe('warning');
  });
});

describe('[SL-SHELTERS] lean-tos and weather shelters', () => {
  test('a lean-to or basic hut is labelled, and never the title', () => {
    const f = facts({
      spots: [
        { b: shelter(named('Little Leanto', { tags: { shelter_type: 'lean_to' } })), km: 70 },
        { b: shelter(named('Basic Hut', { tags: { shelter_type: 'basic_hut' } })), km: 71 },
        { b: camp('Camping Far'), km: 40 },
      ],
      hours: 'open',
    });
    const a = sleepAnswer(f);
    expect(itemAt(a, 70).detail).toContain('Shelter — not a campsite; overnight use depends on local rules');
    expect(itemAt(a, 71).detail).toContain('Shelter — not a campsite; overnight use depends on local rules');
    expect(itemAt(a, 40).detail).not.toContain('Shelter');
    // The leanto lies nearer the stop (km 78), but only the campsite can be the answer.
    expect(a.title).toBe('Open for the night as mapped: Camping Far, km 40');
    expect(a.stamp?.km).toBe(40);
  });

  test('weather shelters, picnic shelters and wetterpilz are never candidates', () => {
    const a = sleep({
      spots: [
        { b: shelter(named('Weather')), km: 10 },
        { b: shelter(named('Picnic', { tags: { shelter_type: 'picnic_shelter' } })), km: 20 },
        { b: shelter(named('Pilz', { tags: { shelter_type: 'wetterpilz' } })), km: 30 },
        { b: shelter(named('Odd', { tags: { shelter_type: 'constructor' } })), km: 40 },
        { b: shelter(named('Proto', { tags: { shelter_type: '__proto__' } })), km: 50 },
        { b: shelter(named('None', { tags: {} })), km: 55 },
      ],
      hours: 'open',
    });
    expect(a.items).toEqual([]);
  });

  test('a lean-to beyond the stop is listed as a shelter too, never as the stop', () => {
    const a = sleep({ spots: [{ b: shelter(named('Beyond Leanto', { tags: { shelter_type: 'lean_to' } })), km: 100 }], hours: 'open' });
    expect(a.items).toHaveLength(1);
    expect(a.status).toBe('action');
  });
});

describe('[SL-AFTER] after the day\'s ride', () => {
  const positions = [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 151, at: `${SUN} 17:30` })];
  const after = (spots: Spot[], now = `${SUN} 17:40`, extra: Case = {}): { f: SleepFacts; a: Answer } => {
    const f = facts({ spots, positions, now, sun: { sunset: '18:00', dusk: '18:35' }, hours: 'open', ...extra });
    return { f, a: sleepAnswer(f) };
  };
  const contact = { phones: ['+49 7221 123456'], website: null };

  test('at km 151 at 17:30: the places within 3 km of km 151, including the campsite with its Call', () => {
    const { f, a } = after([
      { b: camp('Camping Rheinaue', { contact }), km: 151.2 }, { b: lodging(named('Gasthof Behind')), km: 148.5 },
      { b: lodging(named('Gasthof Far')), km: 154.5 }, { b: shelter(named('Weather')), km: 151 },
    ]);
    expect(f.ride.phase).toBe('after-ride');
    expect(f.ride.tonightKm).toBe(151);
    expect(kms(a)).toEqual([148.5, 151.2]);
    expect(itemAt(a, 151.2).detail).toContain('Call +49 7221 123456');
    expect(itemAt(a, 151.2).contact).toEqual(contact);
  });

  test('timed for riding there now, ahead and back, not for tomorrow\'s 08:30', () => {
    const { f, a } = after([{ b: camp('Camping Rheinaue'), km: 151.2 }, { b: lodging(named('Gasthof Behind')), km: 148.5 }]);
    const now = nowSchedule(f.ride, f.trip, f.now, { sun: f.sun, routeZones: f.routeZones });
    expect(itemAt(a, 151.2).stamp!.at!.getTime()).toBe(now.atPlace(f.matches[0]!).getTime());
    expect(itemAt(a, 148.5).stamp!.at!.getTime()).toBe(now.behind(f.matches[1]!).getTime());
    expect(itemAt(a, 151.2).detail).toContain('about 17:40');
    expect(itemAt(a, 148.5).detail).toContain('2.5 km back');
    expect(itemAt(a, 148.5).detail).toContain('about 17:50');
  });

  test('whatever their arrival: after dark they are still listed, with the daylight line', () => {
    const { a } = after([{ b: camp('Late'), km: 152 }], `${SUN} 19:10`);
    expect(a.items).toHaveLength(1);
    expect(a.items[0]!.detail).toContain('dark from 18:35');
  });

  test('with none within 3 km: the nearest one ahead and the nearest one behind', () => {
    const { a } = after([
      { b: camp('Behind far'), km: 140 }, { b: camp('Behind near'), km: 145 }, { b: camp('Ahead near'), km: 160 }, { b: camp('Ahead far'), km: 170 },
    ]);
    expect(kms(a)).toEqual([145, 160]);
  });

  test('with none at all, an honest empty answer', () => {
    const { a } = after([]);
    expect(a.items).toEqual([]);
    expect(a.status).toBe('action');
  });

  test('a place beyond tonight\'s stop is not "riding on": its time is riding there now', () => {
    const { f, a } = after([{ b: camp('Next'), km: 153 }]);
    const now = nowSchedule(f.ride, f.trip, f.now, { sun: f.sun, routeZones: f.routeZones });
    expect(a.items[0]!.stamp!.at!.getTime()).toBe(now.atPlace(f.matches[0]!).getTime());
  });

  test('a rider far behind tonight\'s stop sees the places back to them, timed riding there now', () => {
    const f = facts({
      spots: [{ b: camp('Behind'), km: 150 }], positions: [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 151, at: `${SUN} 17:30` })],
      now: `${SUN} 17:40`, sun: { sunset: '18:00', dusk: '18:35' }, hours: 'open',
    });
    expect(sleepAnswer(f).items[0]!.detail).toContain('1 km back');
  });
});

describe('[SL-ROUTE-END] at the route end', () => {
  test('on Monday at km 298: within 3 km of km 298', () => {
    const f = facts({
      spots: [{ b: camp('Near end'), km: 299.5 }, { b: lodging(named('Behind')), km: 296 }, { b: camp('Far'), km: 290 }],
      positions: [pos({ km: 298, at: `${MON} 12:00` })], now: `${MON} 12:30`, hours: 'open',
    });
    expect(f.ride.phase).toBe('route-end');
    expect(kms(sleepAnswer(f))).toEqual([296, 299.5]);
  });

  test('once no position is left: within 3 km of km 300, the route end', () => {
    const f = facts({
      spots: [{ b: camp('At end'), km: 299 }, { b: lodging(named('Edge')), km: 297.2 }, { b: camp('Out'), km: 296.5 }],
      positions: [], now: `${THU} 10:00`, routeEndDate: MON, hours: 'open',
    });
    expect(f.ride.phase).toBe('route-end');
    expect(f.ride.tonightKm).toBe(300);
    const a = sleepAnswer(f);
    expect(kms(a)).toEqual([297.2, 299]);
    // Timed for riding there now, from the route end, back.
    expect(a.items[0]!.detail).toContain('km back');
  });

  test('a route that ends a few metres off its last stage end is still the end', () => {
    const f = facts({ spots: [{ b: camp('At end'), km: 299.99 }], positions: [pos({ km: 299.5, at: `${MON} 12:00` })], now: `${MON} 12:30`, hours: 'open' });
    expect(sleepAnswer(f).items).toHaveLength(1);
  });
});

describe('[SL-PLAN-TOMORROW] the way to end the day', () => {
  const planLine = 'Stopping for the night? Plan tomorrow';
  test('before the ride and while riding the card ends with it', () => {
    expect(sleep({ hours: 'open' }).detail.endsWith(planLine)).toBe(true);
    const riding = sleep({ positions: [pos({ km: 30, at: `${SAT} 10:00` })], now: `${SAT} 10:10`, hours: 'open' });
    expect(riding.detail.endsWith(planLine)).toBe(true);
  });
  test('not before the trip, not after the ride, not at the route end', () => {
    expect(sleep({ now: `${FRI} 20:00`, hours: 'open' }).detail).not.toContain('Plan tomorrow');
    const after = sleep({ positions: [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 151, at: `${SUN} 17:30` })], now: `${SUN} 17:40`, sun: { sunset: '18:00', dusk: '18:35' }, hours: 'open' });
    expect(after.detail).not.toContain('Plan tomorrow');
    const end = sleep({ positions: [pos({ km: 298, at: `${MON} 12:00` })], now: `${MON} 12:30`, hours: 'open' });
    expect(end.detail).not.toContain('Plan tomorrow');
  });
});

describe('[CA-SHOW] Call and Website', () => {
  const withContact = (c: Place['contact'], o: Partial<Place> = {}): Place => placeAt('campsite', 49, 8.4, { name: 'Camping Rheinaue', country: 'DE', contact: c, ...o });

  test('a mapped number gets Call with a tel link; the text shown is the mapped one', () => {
    const c = callAhead(withContact({ phones: ['+49 7221 123456'], website: null }));
    expect(c.eligible).toBe(true);
    expect(c.calls).toEqual([{ text: '+49 7221 123456', tel: 'tel:+497221123456', secondary: false, label: 'Call Camping Rheinaue, +49 7221 123456' }]);
    expect(c.website).toBeNull();
  });

  test('a national number gets the place\'s country code', () => {
    expect(callAhead(withContact({ phones: ['07221/123456'], website: null })).calls[0]!.tel).toBe('tel:+497221123456');
    expect(callAhead(withContact({ phones: ['33 12 34 56'], website: null }, { country: 'DK' })).calls[0]!.tel).toBe('tel:+4533123456');
  });

  test('a text-only number shows as text with no Call', () => {
    const c = callAhead(withContact({ phones: ['Tel. 07221 123456'], website: null }));
    expect(c.calls).toEqual([{ text: 'Tel. 07221 123456', tel: null, secondary: false, label: 'Phone Camping Rheinaue, Tel. 07221 123456' }]);
  });

  test('a second number is a smaller link', () => {
    const c = callAhead(withContact({ phones: ['+49 7221 123456', '+49 171 1234567'], website: null }));
    expect(c.calls.map((x) => [x.tel, x.secondary])).toEqual([['tel:+497221123456', false], ['tel:+491711234567', true]]);
  });

  test('a website shows its host name and (online)', () => {
    const c = callAhead(withContact({ phones: [], website: 'https://camping-rheinaue.de/de/' }));
    expect(c.website).toEqual({ host: 'camping-rheinaue.de', url: 'https://camping-rheinaue.de/de/', label: 'Website of Camping Rheinaue, camping-rheinaue.de (online)', shown: 'Website camping-rheinaue.de (online)' });
  });

  test('a website that is not http or https gives nothing, whatever the pack held', () => {
    expect(callAhead(withContact({ phones: [], website: 'javascript:alert(1)' })).website).toBeNull();
    expect(callAhead(withContact({ phones: [], website: 'https://user:pw@x.de' })).website).toBeNull();
  });

  test('a café never has a Call, even with a contact passed by mistake', () => {
    const cafePlace = placeAt('cafe', 49, 8.4, { name: 'Café', contact: { phones: ['+49 7221 123456'], website: 'https://x.de' } });
    expect(callAhead(cafePlace)).toEqual({ eligible: false, calls: [], website: null });
  });

  test('only campsites, lodging, huts and bike shops (INV-25)', () => {
    for (const kind of ALL_KINDS) {
      const c = callAhead(placeAt(kind, 49, 8.4, { contact: { phones: ['+49 7221 123456'], website: 'https://x.de' } }));
      expect(c.eligible, kind).toBe(['campsite', 'lodging', 'hut', 'bike_shop'].includes(kind));
      expect(c.calls.length > 0, kind).toBe(c.eligible);
    }
    expect(callAhead(bikeShop(null, { contact: { phones: ['+49 7221 123456'], website: null } }).atKm(5)).calls).toHaveLength(1);
  });

  test('a country the table does not know cannot throw: international numbers still call, national ones are text', () => {
    for (const country of ['constructor', '__proto__', 'toString', '']) {
      const c = callAhead(withContact({ phones: ['+49 7221 123456', '07221 123456'], website: null }, { country }));
      expect(c.calls.map((x) => x.tel)).toEqual(['tel:+497221123456', null]);
    }
  });

  test('a place with no name uses the kind\'s word in the label', () => {
    expect(callAhead(withContact({ phones: ['+49 7221 123456'], website: null }, { name: null })).calls[0]!.label).toBe('Call Campsite, +49 7221 123456');
  });

  test('in a sleep item: Call and Website sit in the detail, and the contact travels with the item', () => {
    const contact = { phones: ['+49 7221 123456', '+49 171 1234567'], website: 'https://camping-rheinaue.de/' };
    const a = sleep({ spots: [{ b: camp('Camping Rheinaue', { contact, tags: { reservation: 'recommended' } }), km: 60 }], hours: 'open' });
    const d = a.items[0]!.detail!;
    expect(d).toContain('Call +49 7221 123456 · also +49 171 1234567 · Website camping-rheinaue.de (online)');
    expect(a.items[0]!.contact).toEqual(contact);
  });

  test('a place with no phone or website carries no contact on its item', () => {
    const a = sleep({ spots: [{ b: camp(), km: 60 }], hours: 'open' });
    expect(a.items[0]!.contact).toBeUndefined();
  });
});

describe('[CA-HONEST] as mapped, not checked', () => {
  const contact = { phones: ['+49 7221 123456'], website: 'https://camping-rheinaue.de/' };

  test('the source line sits under the first item with data, once, with the map date', () => {
    const a = sleep({
      spots: [{ b: camp('No data'), km: 40 }, { b: camp('First', { contact, dataDate: '2026-10-28' }), km: 50 }, { b: camp('Second', { contact, dataDate: '2026-10-28' }), km: 60 }],
      hours: 'open',
    });
    const line = 'As mapped in OpenStreetMap (28 Oct), not checked.';
    expect(itemAt(a, 40).detail).not.toContain(line);
    expect(itemAt(a, 50).detail).toContain(line);
    expect(itemAt(a, 60).detail).not.toContain(line);
  });

  test('"Free pitches and rooms are not known to the app." sits under the first Call only', () => {
    const a = sleep({
      spots: [{ b: camp('Site only', { contact: { phones: [], website: 'https://x.de' } }), km: 40 }, { b: camp('First', { contact }), km: 50 }, { b: camp('Second', { contact }), km: 60 }],
      hours: 'open',
    });
    const line = 'Free pitches and rooms are not known to the app.';
    expect(itemAt(a, 40).detail).not.toContain(line);
    expect(itemAt(a, 50).detail).toContain(line);
    expect(itemAt(a, 60).detail).not.toContain(line);
  });

  test('a text-only number gives no Call, so it is not the first Call', () => {
    const a = sleep({ spots: [{ b: camp('Text', { contact: { phones: ['Tel. 07221 123456'], website: null } }), km: 40 }], hours: 'open' });
    expect(a.items[0]!.detail).not.toContain('Free pitches');
    expect(a.items[0]!.detail).not.toContain('Call ');
  });

  test('unknown hours and a phone: season and hours not mapped, you could call ahead', () => {
    const f = facts({ spots: [{ b: camp('Unknown', { contact }), km: 60 }, { b: camp('Known', { contact }), km: 70 }, { b: camp('No phone', { contact: { phones: [], website: 'https://x.de' } }), km: 65 }] });
    const a = sleepAnswer({ ...f, hours: [hoursOf(f.places[0]!, [{ from: '00:00', to: '23:59', state: 'unknown' }]), hoursOf(f.places[1]!, [{ from: '00:00', to: '23:59' }]), hoursOf(f.places[2]!, [{ from: '00:00', to: '23:59', state: 'unknown' }])] });
    expect(itemAt(a, 60).detail).toContain('Season and hours not mapped; you could call ahead.');
    expect(itemAt(a, 70).detail).not.toContain('you could call ahead');
    expect(itemAt(a, 65).detail).not.toContain('you could call ahead');
  });

  test('none: "No phone or website mapped." for the kinds that could have one, not for shelters', () => {
    const a = sleep({
      spots: [{ b: camp(), km: 40 }, { b: shelter(named('Leanto', { tags: { shelter_type: 'lean_to' } })), km: 50 }, { b: lodging(named('Hotel', { contact: { phones: [], website: null } })), km: 60 }],
      hours: 'open',
    });
    expect(itemAt(a, 40).detail).toContain('No phone or website mapped.');
    expect(itemAt(a, 60).detail).toContain('No phone or website mapped.');
    expect(itemAt(a, 50).detail).not.toContain('No phone or website mapped.');
  });

  test('reservation, fee and locked are shown as mapped; anything else is left out', () => {
    const a = sleep({
      spots: [
        { b: camp('Booked', { tags: { reservation: 'required', fee: 'yes', locked: 'yes' } }), km: 40 },
        { b: camp('Odd', { tags: { reservation: 'constructor', fee: '__proto__', locked: 'toString' } }), km: 50 },
        { b: camp('Free', { tags: { fee: 'no', reservation: 'recommended' } }), km: 60 },
      ],
      hours: 'open',
    });
    expect(itemAt(a, 40).detail).toContain('reservation: required (map data) · fee: yes (map data) · locked: yes (map data)');
    expect(itemAt(a, 50).detail).not.toMatch(/reservation|fee:|locked/);
    expect(itemAt(a, 60).detail).toContain('reservation: recommended (map data)');
    expect(itemAt(a, 60).detail).toContain('fee: no (map data)');
  });

  test('the card never says there is space, and the words stay honest', () => {
    const a = sleep({ spots: [{ b: camp('Booked', { contact, tags: { reservation: 'required' } }), km: 40 }], hours: 'open' });
    expect(bannedHits(JSON.stringify(a))).toEqual([]);
    expect(JSON.stringify(a)).not.toMatch(/space available|free pitch(es)? (available|left)|vacan/i);
  });

  test('the example item of section 6.13, in order', () => {
    const f = facts({
      spots: [{ b: camp('Camping Rheinaue', { contact: { phones: ['+49 7221 123456'], website: 'https://camping-rheinaue.de' }, seasonal: 'Apr-Oct', tags: { reservation: 'recommended' }, dataDate: '2026-10-28' }), km: 60 }],
      hours: 'open',
    });
    const d = sleepAnswer(f).items[0]!.detail!;
    expect(d.startsWith('+60 km · about 11:50 · open for tonight (season Apr–Oct) · reservation: recommended (map data) · Call +49 7221 123456 · Website camping-rheinaue.de (online)')).toBe(true);
  });
});

describe('the hours of a whole day (section 6.8: the night\'s date)', () => {
  const day = (from: string, to: string) => [at(`${SAT} ${from}`), at(`${SAT} ${to}`)] as const;
  const p = placeAt('campsite', 49, 8.4, { id: 'n1' });
  test('open at any moment of the stretch is open; only unknown or possibly closed is unknown; only closed is closed', () => {
    const [from, to] = [at(`${SAT} 00:00`), at(`${SUN} 00:00`)];
    expect(stateWithin(hoursOf(p, [{ from: '08:00', to: '09:00' }]), from, to)).toBe('open');
    expect(stateWithin(hoursOf(p, [{ from: '08:00', to: '09:00', state: 'unknown' }]), from, to)).toBe('unknown');
    expect(stateWithin(hoursOf(p, [{ from: '08:00', to: '09:00', state: 'possibly-closed' }]), from, to)).toBe('unknown');
    expect(stateWithin(hoursOf(p, [{ from: '08:00', to: '09:00', state: 'closed' }]), from, to)).toBe('closed');
    expect(stateWithin(hoursOf(p, [{ from: '08:00', to: '09:00', state: 'unknown' }, { from: '10:00', to: '11:00' }]), from, to)).toBe('open');
  });
  test('a stretch the prepared window does not cover, or no hours, or a date that is no date, is outside', () => {
    const h = hoursOf(p, [{ from: '08:00', to: '09:00' }]);
    expect(stateWithin(undefined, ...day('00:00', '23:00'))).toBe('outside');
    expect(stateWithin(h, at('2025-12-31 00:00'), at(`${SAT} 12:00`))).toBe('outside');
    expect(stateWithin(h, at(`${SAT} 12:00`), at('2027-01-02 00:00'))).toBe('outside');
    expect(stateWithin(h, new Date(Number.NaN), at(`${SAT} 12:00`))).toBe('outside');
    expect(stateWithin(h, at(`${SAT} 12:00`), at(`${SAT} 12:00`))).toBe('outside');
    expect(stateWithin(h, at(`${SAT} 13:00`), at(`${SAT} 12:00`))).toBe('outside');
  });
});

describe('families of bug that passed the tests before', () => {
  test('a place at the stop, as its rounded kilometre reads, is on the ride even when the ride ends in the dark', () => {
    // The stage end is km 78 exactly; the place's match is a few metres further, as rounded data is.
    const a = sleep({ spots: [{ b: camp('At the stop'), km: 78.0004 }], hours: 'open', sun: { sunset: '09:30', dusk: '10:00' } });
    expect(kms(a)).toEqual([78.0004]);
    expect(a.items[0]!.detail).not.toContain('riding on');
  });

  test('a place a few metres behind the start is still on the ride', () => {
    const a = sleep({
      spots: [{ b: camp('At the start'), km: 75.9996 }], positions: [pos({ km: 76, at: `${SAT} 07:00` })], now: `${SAT} 07:10`, hours: 'open',
    });
    expect(kms(a)).toEqual([75.9996]);
  });

  test('names that are object keys cannot break a place, its time zone, its lodging kind or the route\'s zone', () => {
    const f = facts({ spots: [{ b: lodging(named('constructor', { contact: { phones: ['07221 123456'], website: null } })), km: 60 }], hours: 'open' });
    const place = { ...f.places[0]!, timeZone: 'constructor', country: '__proto__', tags: { tourism: 'constructor', reservation: '__proto__' } };
    const a = sleepAnswer({ ...f, places: [place], routeZones: [{ fromKm: 0, toKm: 300, timeZone: 'toString', holidayZone: null, country: 'constructor' }] });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]!.label).toContain('constructor');
    expect(textOf(a)).not.toMatch(/NaN|undefined|Invalid/);
  });
});

describe('boundaries', () => {
  const positions = [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 151, at: `${SUN} 17:30` })];
  const after = (spotsIn: Spot[]): Answer => sleep({ spots: spotsIn, positions, now: `${SUN} 17:40`, sun: { sunset: '18:00', dusk: '18:35' }, hours: 'open' });

  test('exactly 3 km from tonight\'s stop is within it; a few metres more is not', () => {
    expect(kms(after([{ b: camp('Edge ahead'), km: 154 }, { b: camp('Edge behind'), km: 148 }, { b: camp('Inside'), km: 152 }]))).toEqual([148, 152, 154]);
    expect(kms(after([{ b: camp('Just out'), km: 154.01 }, { b: camp('Just out behind'), km: 147.99 }]))).toEqual([147.99, 154.01]);
  });

  test('a place ahead of the rider is "+" km ahead, not back', () => {
    const a = after([{ b: camp('Ahead'), km: 151.2 }]);
    expect(a.items[0]!.detail).toContain('+0.2 km');
    expect(a.items[0]!.detail).not.toContain('back');
  });

  test('hours mapped but not known, in season: unknown, not open', () => {
    const f = facts({ spots: [{ b: camp('Mapped', { openingHours: 'Mo-Su 08:00-22:00', seasonal: 'Apr-Oct' }), km: 60 }] });
    const a = sleepAnswer({ ...f, hours: [hoursOf(f.places[0]!, [{ from: '00:00', to: '23:59', state: 'unknown' }])] });
    expect(a.status).toBe('unknown');
    expect(itemAt(a, 60).detail).toContain('hours not known for tonight');
  });

  test('the night of another day is named by its date', () => {
    const a = sleep({ spots: [{ b: camp(), km: 60 }], hours: 'open', now: `${FRI} 20:00` });
    expect(a.items[0]!.detail).toContain('open for the night of Sat 17 Oct');
  });
});

describe('[TRIP-DAY-STOPS] the stop chosen in Trip (owner, 9 Nov 2026)', () => {
  test('is marked on the Sleep card as the stop for that night; with no stops, or another route\'s, nothing is', () => {
    const f = facts({ spots: [{ b: camp('Planned'), km: 78 }, { b: camp('Other'), km: 72 }], positions: [], hours: 'open' });
    const planned = f.places.find((p) => p.name === 'Planned')!;
    const none = { placeId: null, name: null, town: null, by: 'auto' as const };
    const stops = { routeId: f.trip.route.id, basis: [78, 150, 222], days: [{ placeId: planned.id, km: 78, name: 'Planned', town: null, by: 'auto' as const }, { ...none, km: 150 }, { ...none, km: 222 }] };
    const a = sleepAnswer({ ...f, trip: { ...f.trip, stops } });
    expect(itemAt(a, 78).detail).toContain(W.sleepYourStop);
    expect(itemAt(a, 72).detail ?? '').not.toContain(W.sleepYourStop);
    expect(textOf(sleepAnswer(f))).not.toContain(W.sleepYourStop);
    expect(textOf(sleepAnswer({ ...f, trip: { ...f.trip, stops: { ...stops, routeId: 'another' } } }))).not.toContain(W.sleepYourStop);
  });
});

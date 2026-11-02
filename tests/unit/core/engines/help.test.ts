import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { helpChip, type HelpFacts, type HelpKind } from '../../../../src/core/engines/help.ts';
import type { Answer, AnswerItem, Km, PlaceHours, Position } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, bikeShop, cafe, flatRoute, hospital, pharmacy, pos, repairStation, station, sun, testTrip, toilet, type PlaceBuilder } from '../../../fixtures/build.ts';
import { placeAt } from '../../../fixtures/places.ts';
import { hoursOf, SAT, spots, type Spot } from './water-helpers.ts';
import { momentOf, openAllYear, type Moment } from './weather-helpers.ts';

// Flat route at 25 km/h flat: 20.5 km/h loaded, clock time x 1.15.
const clockMs = (km: Km): number => ((km / 20.5) * 60 * 1.15) * 60_000;
const LONG = (): ReturnType<typeof testTrip> => testTrip({ route: flatRoute(300, { stageEnds: [78, 150, 222, 300] }) });

type Case = { moment?: Moment; spots?: Spot[]; hours?: 'open' | PlaceHours[]; savedKm?: { fromKm: Km; toKm: Km }[] };
function facts(c: Case = {}): HelpFacts {
  const m = momentOf({ trip: LONG(), ...c.moment });
  const { places, matches } = spots(c.spots ?? []);
  return {
    trip: m.trip, places, matches,
    hours: c.hours === undefined || c.hours === 'open' ? places.map((p) => openAllYear(p.id)) : c.hours,
    savedKm: c.savedKm ?? [{ fromKm: 0, toKm: m.trip.route.lengthKm }],
    positions: m.positions, now: m.now, routeZones: m.routeZones, sun: m.env.sun, ride: m.ride,
  };
}
const riding = (km: Km, t = '12:00', o: { acc?: number; off?: number } = {}): Moment => ({ positions: [pos({ km, at: `${SAT} ${t}`, ...o })], now: `${SAT} ${t}` });
const chip = (kind: HelpKind, c: Case = {}): Answer => helpChip(kind, facts(c));
const itemAt = (a: Answer, km: Km): AnswerItem => {
  const i = a.items.find((x) => x.stamp?.km === km);
  if (!i) throw new Error(`no item at km ${km}: ${JSON.stringify(a.items.map((x) => x.label))}`);
  return i;
};
const near = (a: Date, b: Date): void => expect(Math.abs(a.getTime() - b.getTime())).toBeLessThanOrEqual(1000);
const named = (b: (h: string | null, o: { name: string; tags?: Record<string, string> }) => PlaceBuilder, name: string, tags: Record<string, string> = {}): PlaceBuilder => b(null, { name, tags });

describe('bike shop chip', () => {
  test('[EM-BIKE] the nearest shop each way, with its status at arrival', () => {
    const a = chip('bike', {
      moment: riding(100),
      spots: [
        { b: named(bikeShop, 'Ahead near'), km: 110 }, { b: named(bikeShop, 'Ahead far'), km: 120 },
        { b: named(bikeShop, 'Behind near'), km: 95 }, { b: named(bikeShop, 'Behind far'), km: 80 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110, 95]);
    expect(itemAt(a, 110).label).toBe('Ahead near · km 110');
    expect(itemAt(a, 110).status).toBe('fine');
    expect(itemAt(a, 110).detail).toMatch(/^\+10 km · about 12:3\d · open on arrival/);
    expect(itemAt(a, 95).detail).toMatch(/^5 km back · about 12:1\d · open on arrival/);
    expect(a.title).toBe('Nearest bike shop: Behind near, km 95');
    expect(a.topic).toBe('help');
  });
  test('[EM-BIKE] status is read at the arrival, not now', () => {
    const shop = bikeShop(null, { name: 'Closes' });
    const place = shop.atKm(120, { id: 'n1' });
    // 20 km ahead is about 67 min: open at noon, shut by the arrival.
    const a = chip('bike', {
      moment: riding(100),
      spots: [{ b: shop, km: 120, id: 'n1' }],
      hours: [hoursOf(place, [{ from: '08:00', to: '12:30' }, { from: '12:30', to: '23:59', state: 'closed' }])],
    });
    expect(itemAt(a, 120).status).toBe('warning');
    expect(itemAt(a, 120).detail).toContain('closed on arrival');
  });
  test('[EM-BIKE] open until its closing time; unknown hours read unknown, never open', () => {
    const open = bikeShop(null, { name: 'A' }).atKm(110, { id: 'n1' });
    const a = chip('bike', {
      moment: riding(100),
      spots: [{ b: bikeShop(null, { name: 'A' }), km: 110, id: 'n1' }, { b: bikeShop(null, { name: 'B' }), km: 90, id: 'n2' }],
      hours: [hoursOf(open, [{ from: '08:00', to: '18:00' }])],
    });
    expect(itemAt(a, 110).detail).toContain('open until 18:00');
    expect(itemAt(a, 90).status).toBe('unknown');
    expect(itemAt(a, 90).detail).toContain('hours unknown');
    expect(a.missing).toContain('hours');
  });
  test('[EM-BIKE] repairs preferred: the repair shop comes first, and a nearer shop is still shown', () => {
    const a = chip('bike', {
      moment: riding(100),
      spots: [
        { b: named(bikeShop, 'Sales only'), km: 105 },
        { b: named(bikeShop, 'Workshop', { 'service:bicycle:repair': 'yes' }), km: 112 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([112, 105]);
    expect(itemAt(a, 112).detail).toContain('repairs mapped');
    expect(itemAt(a, 105).detail).toContain('repairs not mapped');
  });
  test('[EM-BIKE] the title names the nearest, not a far repair shop; the repair shop stays first in the list', () => {
    const a = chip('bike', {
      moment: riding(100),
      spots: [{ b: named(bikeShop, 'Sales only'), km: 105 }, { b: named(bikeShop, 'Workshop', { 'service:bicycle:repair': 'yes' }), km: 290 }],
    });
    expect(a.title).toBe('Nearest bike shop: Sales only, km 105');
    expect(a.items.map((i) => i.stamp?.km)).toEqual([290, 105]);
  });
  test('[EM-BIKE] within 5 km of the route only; 5 km counts', () => {
    const a = chip('bike', {
      moment: riding(100),
      spots: [{ b: named(bikeShop, 'In'), km: 110, off: 5000 }, { b: named(bikeShop, 'Out'), km: 104, off: 5001 }],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110]);
    expect(itemAt(a, 110).label).toBe('In · km 110, 5000 m off route');
  });
  test('[EM-BIKE] repair stations and pumps within 2 km, with valve types', () => {
    const pump = { atKm: (km: Km, o = {}) => ({ ...repairStation({ name: 'Pump', tags: { amenity: 'compressed_air', valves: 'presta;schrader' } }).atKm(km, o), kind: 'air' as const }) };
    const a = chip('bike', {
      moment: riding(100),
      spots: [
        { b: repairStation({ name: 'Stand', tags: {} }), km: 103, off: 2000 },
        { b: pump, km: 104 },
        { b: repairStation({ name: 'Too far' }), km: 101, off: 2001 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([103, 104]);
    expect(itemAt(a, 103).detail).toContain('valve types not mapped');
    expect(itemAt(a, 104).detail).toContain('valves: presta;schrader');
  });
  test('[EM-BIKE] Call and Website where mapped, and nothing invented where not', () => {
    const contact = { phones: ['+497211234567'], website: 'https://velo.example' };
    const a = chip('bike', {
      moment: riding(100),
      spots: [{ b: bikeShop(null, { name: 'A', contact }), km: 110 }, { b: bikeShop(null, { name: 'B' }), km: 90 }],
    });
    expect(itemAt(a, 110).contact).toEqual(contact);
    expect('contact' in itemAt(a, 90)).toBe(false);
  });
  test('[EM-BIKE] says so when one side has none', () => {
    const a = chip('bike', { moment: riding(100), spots: [{ b: named(bikeShop, 'A'), km: 110 }] });
    expect(a.detail).toContain('No bike shop mapped behind.');
    expect(a.detail).not.toContain('ahead');
  });
  test('[EM-BIKE] none at all reads unknown, never fine', () => {
    const a = chip('bike', { moment: riding(100) });
    expect(a.title).toBe('No bike shop mapped near your route');
    expect(a.status).toBe('unknown');
    expect(a.items).toEqual([]);
  });
});

describe('pharmacy chip', () => {
  test('[EM-PHARMACY] the nearest pharmacy each way with status at arrival', () => {
    const a = chip('pharmacy', { moment: riding(100), spots: [{ b: pharmacy(null, { name: 'Linden' }), km: 104 }, { b: pharmacy(null, { name: 'Far' }), km: 120 }, { b: pharmacy(null, { name: 'Back' }), km: 98 }] });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([104, 98]);
    expect(itemAt(a, 104).detail).toContain('open on arrival');
    expect(a.title).toBe('Nearest pharmacy: Back, km 98');
  });
  test('[EM-PHARMACY] nearest hospital within 20 km with an emergency department', () => {
    const a = chip('pharmacy', {
      moment: riding(100),
      spots: [
        { b: hospital({ name: 'Klinikum' }), km: 110, off: 20000 },
        { b: hospital({ name: 'Too far' }), km: 105, off: 20001 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110]);
    expect(itemAt(a, 110).detail).toContain('emergency department mapped');
    expect(itemAt(a, 110).status).toBe('fine');
  });
  test('[EM-PHARMACY] a missing tag reads unknown, never yes', () => {
    const untagged = { atKm: (km: Km, o = {}) => { return { ...hospital({ name: 'Plain' }).atKm(km, o), tags: { amenity: 'hospital' } }; } };
    const a = chip('pharmacy', { moment: riding(100), spots: [{ b: untagged, km: 110 }] });
    expect(itemAt(a, 110).detail).toContain('emergency department not known');
    expect(itemAt(a, 110).detail).not.toContain('department mapped');
    expect(itemAt(a, 110).status).toBe('unknown');
  });
  test('[EM-PHARMACY] emergency=no is not offered; a department comes first even when an unknown one is nearer', () => {
    const untagged = { atKm: (km: Km, o = {}) => { return { ...hospital({ name: 'Plain' }).atKm(km, o), tags: { amenity: 'hospital' } }; } };
    const a = chip('pharmacy', {
      moment: riding(100),
      spots: [
        { b: hospital({ name: 'No dept', tags: { emergency: 'no' } }), km: 101 },
        { b: untagged, km: 103 },
        { b: hospital({ name: 'Dept' }), km: 108 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([108, 103]);
  });
});

describe('train chip', () => {
  test('[EM-TRAIN] stations preferred over halts: the station first, a nearer halt still shown', () => {
    const a = chip('train', {
      moment: riding(100),
      spots: [
        { b: station({ name: 'Halt', tags: { railway: 'halt' } }), km: 102 },
        { b: station({ name: 'Main' }), km: 108 },
        { b: station({ name: 'Back' }), km: 90 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([108, 102, 90]);
    expect(a.title).toBe('Nearest halt: Halt, km 102');
  });
  test('[EM-TRAIN] distance and arrival next to sunset, with the label', () => {
    const f = facts({ moment: riding(100), spots: [{ b: station({ name: 'Main' }), km: 110, off: 500 }] });
    const a = helpChip('train', f);
    const d = itemAt(a, 110).detail!;
    expect(d).toMatch(/^\+10 km · about 12:\d\d · sunset 18:42/);
    expect(d).toContain('Station only — train times and bike carriage not checked');
    expect(a.detail).toContain('Station only — train times and bike carriage not checked');
    expect(itemAt(a, 110).label).toBe('Main · km 110, 500 m off route');
  });
  test('[EM-TRAIN] an arrival after sunset says so', () => {
    const a = chip('train', { moment: riding(100, '18:30'), spots: [{ b: station({ name: 'Main' }), km: 110 }] });
    expect(itemAt(a, 110).detail).toContain('after sunset (18:42)');
    expect(itemAt(a, 110).status).toBe('warning');
  });
  test('[EM-TRAIN] an arrival before sunrise says so, and is not fine', () => {
    const a = chip('train', { moment: { positions: [pos({ km: 100, at: `${SAT} 01:00` })], now: `${SAT} 01:00` }, spots: [{ b: station({ name: 'Main' }), km: 110 }] });
    expect(itemAt(a, 110).detail).toContain('before sunrise (07:55)');
    expect(itemAt(a, 110).status).toBe('warning');
  });
  test('[EM-TRAIN] within 10 km of the route only', () => {
    const a = chip('train', { moment: riding(100), spots: [{ b: station({ name: 'In' }), km: 110, off: 10000 }, { b: station({ name: 'Out' }), km: 105, off: 10001 }] });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110]);
  });
  test('[EM-TRAIN] no sunset that day leaves the line out', () => {
    const f = facts({ moment: riding(100), spots: [{ b: station({ name: 'Main' }), km: 110 }] });
    const a = helpChip('train', { ...f, sun: sun({ sunset: null }) });
    expect(itemAt(a, 110).detail).not.toContain('sunset');
  });
});

describe('toilets chip', () => {
  test('[EM-TOILETS] the nearest along the route each way, with access, fee and hours', () => {
    const a = chip('toilets', {
      moment: riding(100),
      spots: [
        { b: toilet(null, { name: null, tags: { access: 'customers', fee: 'yes' } }), km: 101 },
        { b: toilet(null, { name: 'Far' }), km: 130 },
        { b: toilet(null, { name: 'Park', tags: { access: 'yes', fee: 'no' } }), km: 99 },
      ],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([101, 99]);
    const d = itemAt(a, 101).detail!;
    expect(itemAt(a, 101).label).toBe('toilets · km 101');
    expect(d).toContain('access: customers');
    expect(d).toContain('· fee');
    expect(d).toContain('open on arrival');
    expect(itemAt(a, 99).detail).toContain('access: yes');
    expect(itemAt(a, 99).detail).toContain('free');
  });
  test('[EM-TOILETS] what is not mapped reads not mapped', () => {
    const a = chip('toilets', { moment: riding(100), hours: [], spots: [{ b: toilet(null, { name: 'Plain' }), km: 101 }] });
    const d = itemAt(a, 101).detail!;
    expect(d).toContain('access not mapped');
    expect(d).toContain('fee not mapped');
    expect(d).toContain('hours unknown');
    expect(itemAt(a, 101).status).toBe('unknown');
  });
  test('[EM-TOILETS] a fee amount is shown; private toilets are not offered', () => {
    const a = chip('toilets', {
      moment: riding(100),
      spots: [{ b: toilet(null, { name: 'Private', tags: { access: 'private' } }), km: 101 }, { b: toilet(null, { name: 'Paid', tags: { fee: '0.50 EUR' } }), km: 102 }],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([102]);
    expect(itemAt(a, 102).detail).toContain('fee: 0.50 EUR');
  });
  test('[EM-TOILETS] toilets=yes on another place counts, within 1 km', () => {
    const flags = { indoorSeating: null, outdoorSeating: null, toilets: true, takeaway: null, kitchenHours: null, bikeParking50m: false };
    const a = chip('toilets', {
      moment: riding(100),
      spots: [{ b: cafe(null, { name: 'Linde', stop: flags }), km: 103, off: 900 }, { b: cafe(null, { name: 'None', stop: { ...flags, toilets: null } }), km: 101 }],
    });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([103]);
    expect(itemAt(a, 103).label).toBe('toilets at Linde · km 103, 900 m off route');
  });
});

describe('every chip rides there now', () => {
  const KINDS: [HelpKind, PlaceBuilder][] = [['bike', bikeShop(null, { name: 'P' })], ['pharmacy', pharmacy(null, { name: 'P' })], ['train', station({ name: 'P' })], ['toilets', toilet(null, { name: 'P' })]];

  test.each(KINDS)('[EM-NOW] %s: ±800 m at km 76 goes ahead from km 75.2 and behind from km 76.8', (kind, b) => {
    const now = at(`${SAT} 12:00`);
    const a = chip(kind, { moment: riding(76, '12:00', { acc: 800 }), spots: [{ b, km: 85.2, id: 'n1' }, { b, km: 66.8, id: 'n2' }] });
    near(itemAt(a, 85.2).stamp!.at!, new Date(now.getTime() + clockMs(10)));
    near(itemAt(a, 66.8).stamp!.at!, new Date(now.getTime() + clockMs(10)));
    expect(itemAt(a, 85.2).detail).toMatch(/^\+10 km/);
    expect(itemAt(a, 66.8).detail).toMatch(/^10 km back/);
  });
  test('[EM-NOW] inside the radius: near you, may be behind, no arrival', () => {
    const a = chip('bike', { moment: riding(76, '12:00', { acc: 800 }), spots: [{ b: bikeShop(null, { name: 'P' }), km: 76.3 }] });
    expect(itemAt(a, 76.3).detail).toMatch(/^near you, may be behind/);
    expect(itemAt(a, 76.3).stamp!.at).toBeUndefined();
    expect(itemAt(a, 76.3).status).toBe('unknown');
  });
  test('[EM-NOW] a place inside the radius counts for the title: alone, it is no "none mapped"', () => {
    const a = chip('pharmacy', { moment: riding(76, '12:00', { acc: 800 }), spots: [{ b: pharmacy(null, { name: 'P' }), km: 76.2 }] });
    expect(a.title).toBe('Nearest pharmacy: P, km 76.2');
    expect(a.status).toBe('unknown');
    expect(a.detail).not.toContain('No pharmacy mapped');
  });
  test('[EM-NOW] a place inside the radius beats a far one, and "none behind" is not claimed: it may be behind', () => {
    const a = chip('pharmacy', { moment: riding(76, '12:00', { acc: 800 }), spots: [{ b: pharmacy(null, { name: 'P' }), km: 76.2 }, { b: pharmacy(null, { name: 'Far' }), km: 150 }] });
    expect(a.title).toBe('Nearest pharmacy: P, km 76.2');
    expect(a.status).toBe('unknown');
    expect(a.detail).not.toContain('No pharmacy mapped');
  });
  test('[EM-NOW] a position past the route end counts from the route end', () => {
    const now = at(`${SAT} 12:00`);
    const a = chip('pharmacy', { moment: riding(500), spots: [{ b: pharmacy(null, { name: 'P' }), km: 290 }] });
    expect(itemAt(a, 290).detail).toMatch(/^10 km back/);
    near(itemAt(a, 290).stamp!.at!, new Date(now.getTime() + clockMs(10)));
  });
  test('[EM-NOW] after the day\'s ride it still rides there now, from the position', () => {
    const now = at(`${SAT} 19:00`);
    const f = facts({ moment: riding(78, '19:00'), spots: [{ b: pharmacy(null, { name: 'P' }), km: 88 }] });
    expect(f.ride.phase).toBe('after-ride');
    near(itemAt(helpChip('pharmacy', f), 88).stamp!.at!, new Date(now.getTime() + clockMs(10)));
  });
  test('[EM-NOW] before the trip it rides there now from the position, not from the route start', () => {
    const when = '2026-10-16 12:00';
    const f = facts({ moment: { positions: [pos({ km: 76, at: when })], now: when }, spots: [{ b: pharmacy(null, { name: 'P' }), km: 86 }] });
    expect(f.ride.phase).toBe('before-trip');
    near(itemAt(helpChip('pharmacy', f), 86).stamp!.at!, new Date(at(when).getTime() + clockMs(10)));
  });
  test('[EM-NOW] before the trip the chip adds the position\'s own rejoin leg (INV-19)', () => {
    const when = '2026-10-16 12:00';
    const f = facts({ moment: { positions: [pos({ km: 76, at: when, off: 1000 })], now: when }, spots: [{ b: pharmacy(null, { name: 'P' }), km: 86 }] });
    near(itemAt(helpChip('pharmacy', f), 86).stamp!.at!, new Date(at(when).getTime() + clockMs(11.3)));
  });
  test('[EM-NOW] with no position it measures from the ride\'s start and says so', () => {
    const f = facts({ moment: { now: `${SAT} 08:00` }, spots: [{ b: pharmacy(null, { name: 'P' }), km: 10 }] });
    const a = helpChip('pharmacy', f);
    expect(a.detail).toContain('No position yet: measured from km 0.');
    near(itemAt(a, 10).stamp!.at!, new Date(at(`${SAT} 08:00`).getTime() + clockMs(10)));
  });
  test('[EM-NOW] a broken latest position does not decide: the good one before it does', () => {
    const good = pos({ km: 76, at: `${SAT} 11:50` });
    const bad: Position = { ...pos({ km: 200, at: `${SAT} 11:55` }), km: NaN };
    const a = chip('pharmacy', { moment: { positions: [bad, good], now: `${SAT} 12:00` }, spots: [{ b: pharmacy(null, { name: 'P' }), km: 86 }] });
    expect(itemAt(a, 86).detail).toMatch(/^\+10 km/);
  });
});

describe('two passes of one place', () => {
  test('[EM-NOW] an out-and-back place behind and ahead is shown once on each side, on its own pass', () => {
    const a = chip('pharmacy', { moment: riding(100), spots: [{ b: pharmacy(null, { name: 'Twice' }), km: [90, 170] }] });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([170, 90]);
    expect(itemAt(a, 170).detail).toMatch(/^\+70 km/);
    expect(itemAt(a, 90).detail).toMatch(/^10 km back/);
  });
  test('[EM-NOW] of two passes ahead, the nearer counts, whichever way the matches are listed', () => {
    const a = chip('toilets', { moment: riding(100), spots: [{ b: toilet(null, { name: 'Twice' }), km: [170, 110] }] });
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110]);
  });
});

describe('bad data reads honest', () => {
  test('[EM-BIKE] a broken first match or place does not decide the answer', () => {
    const f = facts({ moment: riding(100), spots: [{ b: named(bikeShop, 'Good'), km: 110, id: 'n2' }] });
    const broken = { ...f, matches: [{ placeId: 'n2', km: NaN, offRouteM: 0 }, { placeId: 'missing', km: 101, offRouteM: 0 }, { placeId: 'n2', km: 105, offRouteM: NaN }, ...f.matches] };
    const a = helpChip('bike', broken);
    expect(a.items.map((i) => i.stamp?.km)).toEqual([110]);
  });
  test.each([-5, 301, 1e300])('[EM-BIKE] a kilometre outside the route (%d) is no pass', (km) => {
    const f = facts({ moment: riding(100), spots: [{ b: named(bikeShop, 'A'), km: 110, id: 'n2' }] });
    const a = helpChip('bike', { ...f, matches: [{ placeId: 'n2', km, offRouteM: 0 }] });
    expect(a.items).toEqual([]);
  });
  test.each([['flat speed 0', 0], ['flat speed NaN', NaN], ['flat speed 100', 100]])('[EM-BIKE] %s reads unknown', (_n, flatKph) => {
    const f = facts({ moment: riding(100), spots: [{ b: named(bikeShop, 'A'), km: 110 }] });
    const a = helpChip('bike', { ...f, trip: { ...f.trip, flatKph } });
    expect(a.title).toBe("Help can't be worked out from these settings. Check your speed in You.");
    expect(a.status).toBe('unknown');
    expect(a.items).toEqual([]);
  });
  test('[EM-BIKE] an invalid clock reads unknown and does not throw', () => {
    const f = facts({ moment: riding(100), spots: [{ b: named(bikeShop, 'A'), km: 110 }] });
    expect(helpChip('bike', { ...f, now: new Date(NaN) }).status).toBe('unknown');
  });
  test('[EM-BIKE] no saved data on the stretch names places as missing', () => {
    const a = chip('bike', { moment: riding(100), savedKm: [] });
    expect(a.missing).toContain('places');
    expect(a.title).toBe('No place data for this stretch. Refresh it.');
    expect(a.status).toBe('unknown');
  });
  test('[EM-BIKE] a place zone the phone does not know falls back to the route zone', () => {
    const a = chip('bike', { moment: riding(100), spots: [{ b: bikeShop(null, { name: 'A', timeZone: 'constructor' }), km: 110 }] });
    expect(itemAt(a, 110).detail).toMatch(/about 12:3\d/);
  });
  test('[EM-BIKE] a closed status never comes from the chip\'s own clock when hours lie outside the window', () => {
    const windowStart = at('2026-10-01 00:00');
    const windowEnd = at('2026-10-02 00:00');
    const hours: PlaceHours = { placeId: 'n1', windowStart, windowEnd, spans: [{ from: windowStart, to: windowEnd, state: 'closed' }] };
    const a = chip('bike', { moment: riding(100), spots: [{ b: bikeShop(null, { name: 'A' }), km: 110, id: 'n1' }], hours: [hours] });
    expect(itemAt(a, 110).status).toBe('unknown');
    expect(a.missing).toContain('hours');
  });

  const STRANGE = ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', 'yes'];
  fcTest.prop([
    fc.constantFrom<HelpKind>('bike', 'pharmacy', 'train', 'toilets'),
    fc.array(fc.record({ key: fc.constantFrom('access', 'fee', 'valves', 'emergency', 'railway', 'service:bicycle:repair', '__proto__', 'constructor'), value: fc.constantFrom(...STRANGE) }), { maxLength: 6 }),
    fc.oneof(fc.double(), fc.constant(NaN), fc.constant(Infinity)),
    fc.constantFrom('bike_shop', 'pharmacy', 'hospital', 'station', 'toilets', 'air', 'repair_station'),
  ])('[EM-BIKE] tags from strangers and strange kilometres never throw, and never read as fine without a known state', (kind, tagged, km, placeKind) => {
    const tags: Record<string, string> = {};
    for (const t of tagged) Object.defineProperty(tags, t.key, { value: t.value, enumerable: true, configurable: true, writable: true });
    const base = facts({ moment: riding(100) });
    const place = placeAt(placeKind as never, 49.5, 8.4, { id: 'n1', tags, timeZone: 'constructor' });
    const a = helpChip(kind, { ...base, places: [place], matches: [{ placeId: 'n1', km, offRouteM: 10 }], hours: [] });
    expect(typeof a.title).toBe('string');
    for (const i of a.items) if (['bike_shop', 'pharmacy', 'toilets'].includes(placeKind)) expect(i.status).toBe('unknown');
    expect(bannedHits([a.title, a.detail, ...a.items.map((i) => `${i.label} ${i.detail ?? ''}`)].join(' '))).toEqual([]);
  });
});

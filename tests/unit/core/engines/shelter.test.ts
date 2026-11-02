import { describe, expect, test } from 'vitest';
import type { StopFacts } from '../../../../src/core/engines/covers.ts';
import { shelterChip, thunderNear } from '../../../../src/core/engines/shelter.ts';
import type { Answer } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, busStop, cafe, flatRoute, pos, shelter, station, supermarket, testTrip } from '../../../fixtures/build.ts';
import { momentOf, SAT, stamps, stopFactsOf, type Moment, type StopCase } from './weather-helpers.ts';
import { hoursOf } from './water-helpers.ts';

const LONG = (): ReturnType<typeof testTrip> => testTrip({ route: flatRoute(300, { stageEnds: [200, 300] }) });
const riding = (km: number, t: string, over: Moment = {}): Moment => ({ trip: LONG(), positions: [pos({ km, at: `${SAT} ${t}` })], now: `${SAT} ${t}`, ...over });
const LIGHTNING = 'Roofs, shelters and huts give no protection from lightning.';
const chip = (c: StopCase): Answer => {
  const f: StopFacts = stopFactsOf(c);
  return shelterChip(f, thunderNear(f));
};
const labels = (a: Answer): string[] => a.items.map((i) => i.label);

describe('what it lists', () => {
  const m = riding(100, '12:00');
  const many: StopCase['spots'] = [
    ...[101, 102, 103, 104].map((km) => ({ b: shelter({ name: `A${km}` }), km })),
    ...[99, 98, 97, 96].map((km) => ({ b: shelter({ name: `B${km}` }), km })),
  ];

  test('[STOP-CHIP] three ahead and three behind, any class', () => {
    const a = chip({ moment: m, spots: many });
    const kms = a.items.map((i) => i.stamp!.km);
    expect(kms).toEqual([101, 102, 103, 99, 98, 97]);
  });
  test('[STOP-CHIP] the exact line of a weather shelter', () => {
    const a = chip({
      moment: riding(90, '12:00'),
      spots: [{ b: shelter({ tags: { bench: 'yes' }, dataDate: '2026-10-28' }), km: 96, off: 120 }],
    });
    expect(a.items[0]!.label).toBe('Mapped as a weather shelter, not checked · bench mapped · km 96, 120 m off route · map data from 28 Oct.');
  });
  test('[STOP-CHIP] ahead: its arrival, riding there now; behind: its distance', () => {
    const f = stopFactsOf({ moment: m, spots: [{ b: shelter(), km: 110 }, { b: shelter(), km: 90 }] });
    const a = shelterChip(f, false);
    const ahead = a.items.find((i) => i.stamp!.km === 110)!;
    const back = a.items.find((i) => i.stamp!.km === 90)!;
    expect(ahead.detail).toMatch(/^\+10 km · about \d\d:\d\d/);
    expect(ahead.stamp!.at!.getTime()).toBe(f.schedule.atKm(110).getTime());
    expect(back.detail).toMatch(/^10 km back/);
    expect(back.stamp!.at).toBeUndefined();
  });
  test('[STOP-CHIP] indoor places only when open on arrival, with their hours, seats and map date', () => {
    const c = cafe('x', { name: 'Open' }).atKm(105, { id: 'n1' });
    const s = supermarket('x', { name: 'Shut' }).atKm(106, { id: 'n2' });
    const a = chip({
      moment: m,
      spots: [{ b: cafe('x', { name: 'Open', dataDate: '2026-10-28' }), km: 105, id: 'n1' }, { b: supermarket('x', { name: 'Shut' }), km: 106, id: 'n2' }],
      hours: [hoursOf(c, [{ from: '07:00', to: '18:00' }]), hoursOf(s, [{ from: '07:00', to: '12:05' }])],
    });
    const text = labels(a).join(' | ');
    expect(text).toContain('Open');
    expect(text).toContain('open until 18:00');
    expect(text).toContain('seating not mapped');
    expect(text).toContain('map data from 28 Oct');
    expect(text).not.toContain('Shut');
  });
  test('[STOP-CHIP] arrivals are for riding there now, in every phase: after the ride too', () => {
    const f = stopFactsOf({
      moment: { positions: [pos({ km: 100, at: `${SAT} 19:30` })], now: `${SAT} 19:30`, plan: { date: SAT, backToTodayAt: null } },
      spots: [{ b: shelter(), km: 110 }],
    });
    expect(f.ride.phase).toBe('after-ride');
    const a = shelterChip(f, false);
    const t = a.items[0]!.stamp!.at!.getTime();
    expect(t).toBeGreaterThan(at(`${SAT} 19:30`).getTime());
    expect(t).toBeLessThan(at(`${SAT} 21:00`).getTime());
  });
  test('[STOP-CHIP] the order of the input decides nothing, and roofs tie after places', () => {
    const s: StopCase['spots'] = [{ b: shelter(), km: 101, id: 'n3' }, { b: shelter(), km: 101, id: 'n2' }];
    const r = [busStop().atKm(101)];
    expect(labels(chip({ moment: m, spots: s, roofs: r }))).toEqual(labels(chip({ moment: m, spots: [...s].reverse(), roofs: r })));
    expect(chip({ moment: m, spots: s, roofs: r }).items.map((i) => i.detail)).toHaveLength(3);
    expect(labels(chip({ moment: m, spots: s, roofs: r }))[2]).toContain('a bus shelter');
  });
  test('[STOP-CHIP] one place on two passes is listed once', () => {
    const a = chip({ moment: m, spots: [{ b: shelter(), km: [110, 120] }] });
    expect(a.items).toHaveLength(1);
    expect(a.items[0]!.stamp!.km).toBe(110);
  });
  test('[STOP-CHIP] no cover anywhere: says so, and no all-clear', () => {
    const a = chip({ moment: m });
    expect(a.title).toBe('No mapped cover near here');
    expect(a.status).toBe('unknown');
  });
  test('[STOP-CHIP] outside the saved place data: names places as missing', () => {
    expect(chip({ moment: m, savedKm: [{ fromKm: 0, toKm: 50 }] }).missing).toContain('places');
    expect(chip({ moment: m }).missing).not.toContain('places');
  });
  test('[STOP-CHIP] hours not worked out: named as missing, and the place is listed as not counted', () => {
    const a = chip({ moment: m, spots: [{ b: cafe('x', { name: 'Unsure' }), km: 105 }], hours: [] });
    expect(a.missing).toContain('hours');
    const item = a.items.find((i) => i.label.includes('Unsure'))!;
    expect(item.status).toBe('unknown');
    expect(item.detail).toContain('hours unknown');
  });
  test('[STOP-CHIP] a station without a mapped roof is marked, and does not take one of the three', () => {
    const a = chip({ moment: m, spots: [{ b: station({ platformRoof: null, name: 'Halt' }), km: 101, id: 'n0' }, { b: shelter(), km: 102 }, { b: shelter(), km: 103 }, { b: shelter(), km: 104 }] });
    expect(a.items.slice(0, 3).map((i) => i.stamp!.km)).toEqual([102, 103, 104]);
    expect(a.items[3]!.label).toContain('Halt');
    expect(a.items[3]!.detail).toContain('station, shelter not mapped');
  });
  test('[STOP-CHIP] with any forecast or none: it is offered, and does not claim the weather', () => {
    const a = chip({ moment: m, forecast: null, spots: [{ b: shelter(), km: 101 }] });
    expect(a.status).toBe('fine');
    expect(a.items).toHaveLength(1);
    expect(a.basis).toContain('© OpenStreetMap contributors');
    expect(a.basis.join(' ')).not.toContain('Open-Meteo');
  });
  test('[STOP-CHIP] it says when the forecast it looked at is stale', () => {
    const a = chip({ moment: m, opts: { fetchedAt: '2026-10-16 07:00' } });
    expect(a.freshness.stale).toBe(true);
    expect(chip({ moment: m, opts: { fetchedAt: `${SAT} 07:00` } }).freshness.stale).toBe(false);
  });
  test('[STOP-CHIP] no usable speed or clock: an honest unknown, no throw', () => {
    const noSpeed = chip({ moment: riding(100, '12:00', { trip: testTrip({ flatKph: Number.NaN }) }), spots: [{ b: shelter(), km: 101 }] });
    expect(noSpeed.status).toBe('unknown');
    const noClock = chip({ moment: { now: new Date(Number.NaN) }, spots: [{ b: shelter(), km: 10 }] });
    expect(noClock.status).toBe('unknown');
  });
  test.each(['constructor', '__proto__'])('[STOP-CHIP] a stranger\'s %s in the tags takes down no card', (word) => {
    const a = chip({ moment: m, spots: [{ b: shelter({ tags: { shelter_type: word } }), km: 101 }, { b: shelter({ tags: { bench: word, access: word } }), km: 102 }, { b: cafe('x', { tags: { amenity: word } }), km: 103 }] });
    expect(a.items.map((i) => i.stamp!.km)).toEqual([102, 103]);
  });
  test('[STOP-CHIP] a broken place date reads as none, and no throw', () => {
    const a = chip({ moment: m, spots: [{ b: shelter({ dataDate: 'not a date' }), km: 101 }, { b: shelter({ dataDate: '2026-13-40' }), km: 102 }] });
    expect(a.items).toHaveLength(2);
    expect(a.items[0]!.label).not.toContain('map data');
    expect(a.items[1]!.label).not.toContain('map data');
  });
  test('[STOP-CHIP] weather shelters are only ever "mapped, not checked": no word for safe, dry or usable', () => {
    const a = chip({ moment: m, spots: [{ b: shelter(), km: 101 }, { b: cafe('x'), km: 102 }], roofs: [busStop().atKm(99)] });
    const text = [a.title, a.detail, ...a.basis, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
    expect(bannedHits(text, true)).toEqual([]);
  });
});

describe('thunderstorm near', () => {
  const m = riding(100, '12:00');
  const storm = [{ km: 100, stamps: [`${SAT} 12:00`, `${SAT} 13:00`], pp: 30, code: 95 }];
  const roofs = [101, 102, 103].map((km) => busStop().atKm(km));
  const rooms: StopCase['spots'] = [{ b: cafe('x', { name: 'Ahead' }), km: 140, id: 'nA' }, { b: cafe('x', { name: 'Behind' }), km: 60, id: 'nB' }];

  test('[STOP-CHIP-THUNDER] the nearest open building each way heads the list even beyond the three nearest', () => {
    const a = chip({ moment: m, spells: storm, roofs: [...roofs, ...[99, 98, 97].map((km) => busStop().atKm(km))], spots: rooms });
    expect(a.items.slice(0, 2).map((i) => i.stamp!.km)).toEqual([140, 60]);
    expect(a.items.map((i) => i.stamp!.km)).toEqual([140, 60, 101, 102, 103, 99, 98, 97]);
    expect(a.status).toBe('warning');
  });
  test('[STOP-CHIP-THUNDER] every roof has the lightning line; a building does not need it', () => {
    const a = chip({ moment: m, spells: storm, roofs, spots: [...rooms, { b: shelter({ tags: { shelter_type: 'lean_to' } }), km: 104 }] });
    for (const i of a.items) {
      if (i.stamp!.km === 140 || i.stamp!.km === 60) expect(i.detail).not.toContain(LIGHTNING);
      else expect(i.detail).toContain(LIGHTNING);
    }
  });
  test('[STOP-CHIP-THUNDER] without a storm near, buildings beyond the three nearest do not come forward, and no line', () => {
    const a = chip({ moment: m, roofs, spots: rooms });
    expect(a.items.map((i) => i.stamp!.km)).toEqual([101, 102, 103, 60]);
    expect(a.items[0]!.detail).not.toContain(LIGHTNING);
    expect(a.status).toBe('fine');
  });
  test('[STOP-CHIP-THUNDER] an open building already among the three is not listed twice', () => {
    const a = chip({ moment: m, spells: storm, spots: [{ b: cafe('x'), km: 101, id: 'nA' }, { b: shelter(), km: 102 }] });
    expect(a.items.map((i) => i.stamp!.km)).toEqual([101, 102]);
  });
  test('[STOP-CHIP-THUNDER] a building that is not open is not put first', () => {
    const c = cafe('x').atKm(110, { id: 'nA' });
    const a = chip({ moment: m, spells: storm, roofs, spots: [{ b: cafe('x'), km: 110, id: 'nA' }], hours: [hoursOf(c, [{ from: '07:00', to: '12:05' }])] });
    expect(a.items[0]!.stamp!.km).toBe(101);
  });

  const near = (spell: { km: number; stamps: string[]; pp: number; code: number }, moment: Moment = m): boolean => thunderNear(stopFactsOf({ moment, spells: [spell] }));
  test('[STOP-CHIP-THUNDER] thunderNear: an hour within 1 h of now at the nearest point', () => {
    expect(near({ km: 100, stamps: [`${SAT} 13:00`], pp: 10, code: 96 })).toBe(true);
    expect(near({ km: 100, stamps: [`${SAT} 12:00`], pp: 10, code: 96 })).toBe(true);
    expect(near({ km: 100, stamps: [`${SAT} 14:00`], pp: 10, code: 96 })).toBe(true); // 13:00-14:00, from 13:00 is exactly 1 h
    expect(near({ km: 100, stamps: [`${SAT} 15:00`], pp: 10, code: 96 })).toBe(false);
    expect(near({ km: 100, stamps: [`${SAT} 10:00`], pp: 10, code: 96 })).toBe(false);
  });
  test('[STOP-CHIP-THUNDER] thunderNear: or a thunderstorm window on the day\'s ride', () => {
    const f = { km: 150, stamps: stamps(SAT, 14, 17), pp: 30, code: 95 };
    expect(near(f, riding(100, '12:00', { trip: testTrip() }))).toBe(true);
    expect(near({ ...f, km: 160 }, riding(100, '12:00', { trip: testTrip() }))).toBe(false);
  });
  test('[STOP-CHIP-THUNDER] thunderNear: a broken first hour, no forecast or no clock find no storm and no throw', () => {
    expect(thunderNear(stopFactsOf({ moment: m, forecast: null }))).toBe(false);
    expect(thunderNear(stopFactsOf({ moment: { now: new Date(Number.NaN) } }))).toBe(false);
    const c = momentOf(m);
    const f = stopFactsOf({ moment: m, spells: storm });
    f.forecast!.grid.forEach((g) => g.hours.unshift({ ...g.hours[0]!, at: new Date(Number.NaN), code: 0 }));
    expect(thunderNear(f)).toBe(true);
    expect(c.ride.phase).toBe('riding');
  });
  test('[STOP-THUNDER] the worked case: the chip lists the shelter with the lightning line', () => {
    const c = cafe('x', { name: 'Café Lindenhof' }).atKm(131, { id: 'nC' });
    const a = chip({
      moment: { positions: [pos({ km: 110, at: `${SAT} 14:00` })], now: `${SAT} 14:00` },
      spells: [{ km: 140, stamps: [`${SAT} 15:00`], pp: 40, code: 95 }],
      spots: [{ b: cafe('x', { name: 'Café Lindenhof' }), km: 131, id: 'nC' }, { b: shelter(), km: 135 }],
      hours: [hoursOf(c, [{ from: '07:00', to: '18:00' }])],
    });
    expect(a.items[0]!.label).toContain('Café Lindenhof');
    const s = a.items.find((i) => i.stamp!.km === 135)!;
    expect(s.label).toContain('Mapped as a weather shelter, not checked');
    expect(s.detail).toContain(LIGHTNING);
  });
});

describe('an approximate position', () => {
  const m: Moment = { trip: LONG(), positions: [pos({ km: 100, at: `${SAT} 12:00`, acc: 2000 })], now: `${SAT} 12:00` };
  test('[STOP-APPROX] a cover inside the radius reads "near you, may be behind"', () => {
    const a = chip({ moment: m, spots: [{ b: shelter(), km: 100 }, { b: shelter(), km: 105 }, { b: shelter(), km: 95 }] });
    const inside = a.items.find((i) => i.stamp!.km === 100)!;
    expect(inside.detail).toContain('near you, may be behind');
    expect(inside.status).toBe('unknown');
    expect(a.items.find((i) => i.stamp!.km === 105)!.detail).toMatch(/^\+7 km/);
    expect(a.items.find((i) => i.stamp!.km === 95)!.detail).toMatch(/^7 km back/);
  });
});

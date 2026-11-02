import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { formatAbout } from '../../../../src/core/answers/time.ts';
import { dayRide, scheduleFor } from '../../../../src/core/engines/tripday.ts';
import { waterAnswer, type WaterFacts } from '../../../../src/core/engines/water.ts';
import { buildScreen, screen, type Screen } from '../../../../src/core/screen/screen.ts';
import type { Answer, Position, ScreenInputs, Trip, ZoneSpan } from '../../../../src/core/types.ts';
import { at, busStop, cafe, campsite, flatRoute, pos, restaurant, settlement, shop, sun, supermarket, tap, testTrip } from '../../../fixtures/build.ts';
import { preparedHours } from '../engines/leaveby-helpers.ts';
import { stamps } from '../engines/weather-helpers.ts';
import { inputsOf } from './screen-helpers.ts';

const FRI = '2026-10-16';
const SAT = '2026-10-17';
const SUN = '2026-10-18';
const TZ = 'Europe/Berlin';
const CARDS = ['water', 'food', 'daylight', 'weather', 'climbing', 'sleep'];
const CHIPS = ['bike', 'pharmacy', 'train', 'toilets', 'shelter', 'emergency'];
const allAnswers = (s: Screen): Answer[] => [...Object.values(s.cards), ...Object.values(s.chips)];
const allText = (s: Screen): string => JSON.stringify(s);
const itemText = (a: Answer): string => [a.title, a.detail, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');

function complete(s: Screen): void {
  expect(Object.keys(s.cards)).toEqual(CARDS);
  expect(Object.keys(s.chips)).toEqual(CHIPS);
  for (const a of allAnswers(s)) {
    expect(a.title.trim()).not.toBe('');
    expect(a.basis.some((b) => b.trim() !== '')).toBe(true);
  }
}
function emergencyStands(s: Screen): void {
  expect(s.chips.emergency.numbers).toContain('112');
  expect(s.chips.emergency.detail).toMatch(/\S/);
}

describe('one input, the whole screen', () => {
  test('[HON-ONE-SCREEN] all six cards in order and all six chips, each with its own topic', () => {
    const s = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })] }));
    complete(s);
    expect(CARDS.map((c) => s.cards[c as keyof Screen['cards']].topic)).toEqual(['water', 'food', 'daylight', 'weather', 'climbing', 'sleep']);
    for (const c of CHIPS) expect(s.chips[c as keyof Screen['chips']].topic).toBe('help');
    expect(s.phase).toBe('riding');
    expect(s.ride.phase).toBe('riding');
    expect(s.ride.stopKm).toBe(78);
  });

  test('[HON-ONE-SCREEN] water gets the forecast held to the route: a grid point elsewhere changes nothing', () => {
    const base = inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })], spots: [{ b: tap(), km: 60 }, { b: tap(), km: 70, side: 'west' }] });
    const f = base.forecast!;
    const hot = (g: (typeof f.grid)[number]): (typeof f.grid)[number] => ({ ...g, hours: g.hours.map((h) => ({ ...h, t: 45, rh: 90, ghi: 900 })) });
    const isNear = (km: number): boolean => km >= 30 && km <= 70;
    // Grid points from another route, a hot day there, at the rider's kilometres.
    const stray = { ...f, grid: f.grid.map((g) => (isNear(g.km) ? { ...hot(g), lat: g.lat + 3 } : g)) };
    const clean = { ...f, grid: f.grid.filter((g) => !isNear(g.km)) };
    const onRoute = { ...f, grid: f.grid.map((g) => (isNear(g.km) ? hot(g) : g)) };
    expect(screen({ ...base, forecast: stray }).cards.water).toEqual(screen({ ...base, forecast: clean }).cards.water);
    expect(screen({ ...base, forecast: stray }).cards.water).not.toEqual(screen({ ...base, forecast: onRoute }).cards.water);
  });

  test('[HON-ONE-SCREEN] the card is the water engine\'s own, for the one ride and schedule', () => {
    const i = inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })], spots: [{ b: tap(), km: 60 }] });
    const env = { sun: i.sun, routeZones: i.routeZones };
    const ride = dayRide(i.trip, i.positions, null, null, i.now, env);
    const f: WaterFacts = { ...i, ride, schedule: scheduleFor(ride, i.trip, env) };
    const s = screen(i);
    expect(s.ride).toEqual(ride);
    expect(s.cards.water).toEqual(waterAnswer(f));
  });

  test('[HON-ONE-SCREEN] stored day starts reach the trip day, and the ride says what to keep', () => {
    const positions = [pos({ km: 35, at: `${SAT} 20:00` }), pos({ km: 90, at: `${SUN} 12:00` })];
    const kept = { day: SUN, km: 76 };
    const withStart = screen(inputsOf({ positions, now: `${SUN} 12:00`, dayStarts: [kept] }));
    expect(withStart.ride.dayStartKm).toBe(76);
    expect(screen(inputsOf({ positions, now: `${SUN} 12:00` })).ride.dayStartKm).toBe(35);
    expect(withStart.ride.keepDayStart).toEqual(kept);
  });
});

describe('the Emergency chip', () => {
  const border: ZoneSpan[] = [
    { fromKm: 0, toKm: 100, timeZone: TZ, holidayZone: 'DE-BY', country: 'DE' },
    { fromKm: 100, toKm: 300, timeZone: 'Europe/Vienna', holidayZone: 'AT-7', country: 'AT' },
  ];
  test('[HON-ONE-SCREEN] the country follows the position: Germany shows no 140, Austria does', () => {
    const de = screen(inputsOf({ zones: border, positions: [pos({ km: 40, at: `${SAT} 14:00` })] }));
    expect(de.chips.emergency.numbers).toContain('112');
    expect(de.chips.emergency.numbers).not.toContain('140');
    const austria = screen(inputsOf({ zones: border, positions: [pos({ km: 140, at: `${SAT} 14:00` })] }));
    expect(austria.chips.emergency.numbers).toContain('140');
  });
  test('[HON-ONE-SCREEN] with no position, 112 only, and the fallback line', () => {
    const s = screen(inputsOf({ zones: border }));
    expect(s.chips.emergency.numbers).toEqual(['112']);
    expect(s.chips.emergency.coords).toBeNull();
    emergencyStands(s);
  });
  test('[HON-ONE-SCREEN] far off the route the country comes from the nearest settlement, not the route', () => {
    const far = pos({ km: 40, at: `${SAT} 14:00`, off: 9000 });
    const town = settlement('Lech', { country: 'AT' }).atKm(40, { off: 8000 });
    const i = inputsOf({ zones: border, positions: [far] });
    expect(screen(i).chips.emergency.numbers).toEqual(['112']);
    expect(screen({ ...i, places: [town] }).chips.emergency.numbers).toContain('140');
  });
  test('[HON-ONE-SCREEN] a thunderstorm near reaches the Shelter chip and Weather alike', () => {
    const spell = { range: [30, 60] as [number, number], stamps: stamps(SAT, 13, 16), pp: 80, code: 95, mm: 1 };
    const s = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })], spells: [spell] }));
    expect(s.chips.shelter.status).toBe('warning');
    expect(s.cards.weather.status).toBe('warning');
  });
});

describe('the worked screen of section 3.2', () => {
  const trip = (): Trip => testTrip({ route: flatRoute(165, { stageEnds: [70, 165] }), departureDate: FRI, stay: 'accommodation' });
  const example = (): ScreenInputs => {
    const lindenhof = cafe('Mo-Su 08:00-18:00', { name: 'Café Lindenhof', tags: { indoor_seating: 'yes' } }).atKm(131);
    const i = inputsOf({
      trip: trip(), now: `${SAT} 14:20`, positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 125, at: `${SAT} 14:20` })],
      spells: [{ range: [100, 137], stamps: stamps(SAT, 13, 15), pp: 80, mm: 1 }], opts: { from: `${FRI} 01:00`, extraKms: [125, 131, 137] },
    });
    // Strasbourg at the stop: a dinner place open on arrival, so T1 does not fire.
    const dinner = restaurant('Mo-Su 11:00-23:00', { name: 'Winstub' }).atKm(164.8);
    return { ...i, places: [lindenhof, dinner], matches: [{ placeId: lindenhof.id, km: 131, offRouteM: 0 }, { placeId: dinner.id, km: 164.8, offRouteM: 0 }], hours: [preparedHours(lindenhof), preparedHours(dinner)] };
  };

  test('[HON-EXAMPLE] the strip: a likely band from here to about km 137, a café at km 131, then "40 km · about 16:35"', () => {
    const { strip } = screen(example());
    expect(strip.endText).toBe('40 km · about 16:35');
    expect(strip.startKm).toBe(125);
    expect(strip.endKm).toBe(165);
    expect(strip.bands).toEqual([{ fromKm: 125, toKm: 137, kind: 'likely', opens: 'weather' }]);
    expect(strip.icons.filter((x) => x.km === 131).map((x) => x.opens)).toContain('food');
  });
  test('[HON-EXAMPLE] Weather and Food titles and stamps', () => {
    const s = screen(example());
    expect(s.cards.weather.status).toBe('fine');
    expect(s.cards.weather.title).toBe('Rain likely here until about 15:00');
    expect(s.cards.weather.stamp).toEqual({ at: at(`${SAT} 14:20`) });
    expect(s.cards.food.status).toBe('fine');
    expect(s.cards.food.title).toBe('Stop idea: Café Lindenhof, open until 18:00');
    expect(s.cards.food.stamp?.km).toBe(131);
    expect(formatAbout(s.cards.food.stamp!.at!, TZ)).toBe('about 14:40');
  });
  test('[HON-EXAMPLE] Weather expanded opens with wait or go', () => {
    const s = screen(example());
    expect(s.cards.weather.items[0]!.label).toBe("Waiting until about 15:00 could save about 35 min of riding in likely rain, here. Tonight's stop then about 17:15 instead of 16:35, before sunset (18:42).");
  });
});

describe('one stop on every card', () => {
  const near222 = [{ b: campsite({ name: 'Camp 222' }), km: 221 }, { b: cafe('Mo-Su 06:00-23:00', { name: 'Cafe 200' }), km: 200 }, { b: tap(), km: 190 }, { b: tap(), km: 230 }];
  const spell = { range: [205, 205] as [number, number], stamps: stamps(SUN, 8, 20).concat(stamps('2026-10-19', 8, 20)), pp: 90, mm: 1 };
  const spellBeyond = { range: [260, 270] as [number, number], stamps: stamps('2026-10-19', 8, 20), pp: 90, mm: 1 };
  const day = { sun: sun({ sunset: '18:00', dusk: '18:35' }), opts: { extraKms: [205], days: 9 }, spots: near222, spells: [spell, spellBeyond] };

  function allUse222(s: Screen, startKm: number): void {
    expect(s.strip.endKm).toBe(222);
    expect(s.strip.startKm).toBe(startKm);
    expect(s.ride.stopKm).toBe(222);
    expect(itemText(s.cards.climbing)).toContain('222');
    expect(s.cards.weather.items.some((i) => i.stamp?.km === 205)).toBe(true);
    expect(s.cards.weather.items.some((i) => (i.stamp?.km ?? 0) >= 260)).toBe(false);
    expect(s.strip.bands.every((b) => b.toKm <= 222)).toBe(true);
    expect(itemText(s.cards.daylight)).toContain('km 222');
    expect(s.shareText).toContain('222');
    expect(s.cards.food.stamp?.km).toBe(200);
  }

  test('[HON-ONE-STOP] sunset 18:00, night at km 149: strip, cards, leave-by and Share all use km 222', () => {
    const began76 = pos({ km: 76, at: `${SAT} 19:00` });
    const night = pos({ km: 149, at: `${SUN} 13:00`, manual: true });
    const s = screen(inputsOf({ ...day, positions: [began76, night], now: `${SUN} 13:30` }));
    expect(s.phase).toBe('after-ride');
    expect(s.ride.tonightKm).toBe(149);
    allUse222(s, 149);
  });

  test('[HON-ONE-STOP] km 151 at 17:30 after a day from km 76: all plan tomorrow from km 151 at 08:30 to km 222; no wait or go', () => {
    const s = screen(inputsOf({ ...day, positions: [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 151, at: `${SUN} 17:30` })], now: `${SUN} 17:30` }));
    expect(s.phase).toBe('after-ride');
    expect(s.ride.startKm).toBe(151);
    expect(s.ride.departure).toEqual(at('2026-10-19 08:30'));
    allUse222(s, 151);
    expect(itemText(s.cards.weather)).not.toMatch(/Waiting/);
  });

  test('[HON-ONE-STOP] before and while riding Sleep looks at the same stop as the strip', () => {
    const s = screen(inputsOf({ ...day, positions: [pos({ km: 76, at: `${SAT} 19:00` }), pos({ km: 160, at: '2026-10-18 12:00' })], now: `${SUN} 12:00` }));
    expect(s.phase).toBe('riding');
    expect(s.ride.stopKm).toBe(222);
    expect(s.cards.sleep.items.some((i) => i.label.includes('Camp 222'))).toBe(true);
  });
});

describe('before the trip', () => {
  test('[HON-BEFORE-TRIP] Fri 16 Oct at 21:00: Daylight and Share plan day 1 from the route start, leaving 08:30 on Saturday, to km 78; no wait or go', () => {
    const s = screen(inputsOf({ now: `${FRI} 21:00`, positions: [pos({ km: 0, at: `${FRI} 20:50` })], spots: [{ b: tap(), km: 30 }, { b: tap(), km: 60 }], spells: [{ range: [0, 20], stamps: stamps(SAT, 8, 12), pp: 90, mm: 1 }] }));
    expect(s.phase).toBe('before-trip');
    expect(s.ride.startKm).toBe(0);
    expect(s.ride.stopKm).toBe(78);
    expect(s.ride.departure).toEqual(at(`${SAT} 08:30`));
    expect(s.ride.tonightKm).toBeNull();
    expect(s.strip.label).toBe('Day 1');
    expect(s.strip.endKm).toBe(78);
    expect(itemText(s.cards.daylight)).toContain('km 78');
    expect(s.shareText).toContain('km 78');
    expect(s.shareText).toContain('08:30');
    expect(itemText(s.cards.weather)).not.toMatch(/Waiting/);
  });
  test('[HON-BEFORE-TRIP] a position at home 40 km off the route changes nothing but says where day 1 starts', () => {
    const home = pos({ km: 30, at: `${FRI} 20:50`, off: 40_000 });
    const s = screen(inputsOf({ now: `${FRI} 21:00`, positions: [home] }));
    const none = screen(inputsOf({ now: `${FRI} 21:00` }));
    expect(s.ride.startKm).toBe(0);
    expect(s.strip).toEqual(none.strip);
    expect(s.cards.daylight.title).toBe(none.cards.daylight.title);
    expect(s.notes).toContain('Day 1 starts at the route start (km 0)');
    expect(s.notes.join(' ')).not.toMatch(/approximate|back to the route/);
    expect(s.positionLine).toContain('off route');
  });
});

describe('degraded', () => {
  test('[HON-NO-ROUTE-DATA] not prepared: every card still answers, naming places, hours and weather, with distance, climbing and daylight from the route', () => {
    const s = screen(inputsOf({ forecast: null, savedKm: [], hours: [], litres: null, positions: [pos({ km: 40, at: `${SAT} 14:00` })] }));
    complete(s);
    const missing = new Set(allAnswers(s).flatMap((a) => a.missing));
    for (const code of ['places', 'hours', 'weather'] as const) expect(missing).toContain(code);
    expect(s.strip.endText).toMatch(/^38 km · about /);
    expect(s.cards.climbing.status).not.toBe('unknown');
    expect(s.cards.daylight.title).not.toMatch(/can't be worked out/);
    expect(s.cards.food.status).toBe('unknown');
    expect(s.cards.weather.status).toBe('unknown');
    emergencyStands(s);
  });

  test('[HON-SHORT-ROUTE] a 0.4 km route with every engine: a complete screen, no NaN', () => {
    const trip = testTrip({ route: flatRoute(0.4) });
    for (const now of [`${FRI} 21:00`, `${SAT} 08:00`, `${SAT} 12:00`, '2026-10-20 12:00']) {
      for (const positions of [[], [pos({ km: 0.2, at: `${SAT} 07:50` })], [pos({ km: 0.4, at: `${SAT} 07:50` })]]) {
        const r = buildScreen(inputsOf({ trip, now, positions, spots: [{ b: tap(), km: 0.3 }, { b: shop('Mo-Su 06:00-22:00'), km: 0.1 }] }));
        complete(r.screen);
        expect(r.faults).toEqual([]);
        expect(allText(r.screen)).not.toMatch(/NaN|Infinity|undefined|\[object/);
      }
    }
  });

  test('[HON-SHORT-ROUTE] no departure date: distances only, with the reason, and no time on the strip', () => {
    const s = screen(inputsOf({ trip: testTrip({ departureDate: null }), positions: [pos({ km: 40, at: `${SAT} 14:00` })] }));
    complete(s);
    expect(s.strip.endText).not.toMatch(/about|\d\d:\d\d/);
    expect(s.notes.join(' ')).toMatch(/departure date/);
  });
});

describe('the screen never falls over', () => {
  const riding = (): ScreenInputs => inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })], spots: [{ b: tap(), km: 60 }, { b: tap(), km: 70, side: 'west' }, { b: campsite(), km: 78 }] });

  test('[HON-ONE-SCREEN] the water engine failing leaves the other cards as they were, and Emergency', () => {
    const clean = riding();
    const good = screen(clean);
    const broken = buildScreen({ ...clean, profile: null as never });
    complete(broken.screen);
    expect(broken.faults.some((x) => x.startsWith('water'))).toBe(true);
    expect(broken.screen.cards.water.status).toBe('unknown');
    expect(broken.screen.cards.climbing).toEqual(good.cards.climbing);
    expect(broken.screen.cards.weather).toEqual(good.cards.weather);
    expect(broken.screen.cards.sleep).toEqual(good.cards.sleep);
    expect(broken.screen.chips.emergency).toEqual(good.chips.emergency);
  });
  test('[HON-ONE-SCREEN] a sun source that throws: Climbing and Emergency stand, and the fault is reported', () => {
    const clean = riding();
    const good = screen(clean);
    const r = buildScreen({ ...clean, sun: () => { throw new Error('no sun'); } });
    complete(r.screen);
    expect(r.faults.length).toBeGreaterThan(0);
    expect(r.screen.cards.climbing.title).toMatch(/climbing/);
    expect(r.screen.chips.emergency).toEqual(good.chips.emergency);
  });
  test('[HON-ONE-SCREEN] a route that cannot be read: Emergency still shows numbers, the fallback and the position', () => {
    const clean = riding();
    const s = screen({ ...clean, trip: { ...clean.trip, route: null as never } });
    complete(s);
    emergencyStands(s);
    expect(s.chips.emergency.coords).not.toBeNull();
  });
  test('[HON-ONE-SCREEN] a broken first item of each list drops only that item', () => {
    const clean = riding();
    const good = screen(clean);
    const r = buildScreen({
      ...clean,
      places: [null as never, ...clean.places], matches: [null as never, ...clean.matches], hours: [undefined as never, ...clean.hours], roofs: [null as never],
      rescuePoints: [null as never], positions: [null as never, ...clean.positions], dayStarts: [null as never], savedKm: [null as never, ...clean.savedKm], routeZones: [null as never, ...clean.routeZones],
    });
    expect(r.faults).toEqual([]);
    expect(r.screen.cards).toEqual(good.cards);
    expect(r.screen.ride).toEqual(good.ride);
  });

  const junk = fc.constantFrom<unknown>(null, undefined, NaN, Infinity, 0, -1, '', 'constructor', {}, [], new Date(NaN), [null], { length: 3 }, () => { throw new Error('boom'); });
  const FIELDS: (keyof ScreenInputs)[] = ['trip', 'matches', 'places', 'roofs', 'hours', 'rescuePoints', 'savedKm', 'forecast', 'baseline', 'positions', 'dayStarts', 'routeEndDate', 'planTomorrow', 'profile', 'loadSummary', 'waterLeft', 'settings', 'now', 'sun', 'routeZones', 'holidays', 'demo'];
  fcTest.prop([fc.array(fc.tuple(fc.constantFrom(...FIELDS), junk), { maxLength: 4 })])('[HON-ONE-SCREEN] junk in any field: it never throws, and Emergency always stands', (changes) => {
    const i = riding() as unknown as Record<string, unknown>;
    for (const [k, v] of changes) i[k] = v;
    const s = screen(i as unknown as ScreenInputs);
    complete(s);
    emergencyStands(s);
  });
  const TRIP_FIELDS = ['flatKph', 'departureDate', 'startTime', 'stay', 'campWaterL'] as const;
  fcTest.prop([fc.constantFrom(...TRIP_FIELDS), junk])('[HON-ONE-SCREEN] junk in a trip setting: it never throws, and no broken number shows', (k, v) => {
    const i = riding();
    const s = screen({ ...i, trip: { ...i.trip, [k]: v } });
    complete(s);
    emergencyStands(s);
    expect(s.strip.endText).not.toMatch(/NaN|Infinity|undefined|Invalid/);
  });
  test('[HON-ONE-SCREEN] a clock that is no time: every card says so, no card throws', () => {
    const s = screen({ ...riding(), now: new Date(NaN) });
    complete(s);
    emergencyStands(s);
    expect(s.strip.endText).not.toMatch(/NaN|Invalid/);
  });
});

describe('the strip', () => {
  test('[HON-ONE-SCREEN] the strip adds the rejoin leg to its distance, once', () => {
    const s = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00`, off: 1000 })] }));
    expect(s.ride.startOffRouteM).toBe(1000);
    expect(s.strip.endText).toMatch(/^39\.3 km · about /);
    expect(s.notes.join(' ')).toMatch(/1\.3 km/);
  });
  test('[HON-ONE-SCREEN] labels: Today, Day 1, Tomorrow with its date, and the route end', () => {
    expect(screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })] })).strip.label).toBe('Today');
    expect(screen(inputsOf({ now: `${FRI} 21:00` })).strip.label).toBe('Day 1');
    const after = screen(inputsOf({ positions: [pos({ km: 78, at: `${SAT} 18:00` })], now: `${SAT} 18:30` }));
    expect(after.phase).toBe('after-ride');
    expect(after.strip.label).toBe('Tomorrow, Sun 18 Oct');
    const end = screen(inputsOf({ positions: [pos({ km: 300, at: '2026-10-20 15:00' })], now: '2026-10-20 15:30', routeEndDate: '2026-10-20' }));
    expect(end.phase).toBe('route-end');
    expect(end.strip.label).toBe('Route end');
    expect(end.strip.endText).toBe('End of your route');
  });
  test('[HON-ONE-SCREEN] thunderstorm and possible rain bands, in route order', () => {
    const s = screen(inputsOf({
      positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`,
      spells: [{ range: [20, 30], stamps: stamps(SAT, 9, 12), pp: 35, mm: 0.5 }, { range: [50, 60], stamps: stamps(SAT, 10, 14), pp: 80, code: 95, mm: 2 }],
    }));
    expect(s.strip.bands.map((b) => [b.kind, b.fromKm, b.toKm])).toEqual([['possible', 20, 30], ['thunder', 50, 60]]);
    expect(s.strip.bands.every((b) => b.opens === 'weather')).toBe(true);
  });
  test('[HON-ONE-SCREEN] each plan\'s first cover has an icon that opens Weather; possible rain gets none', () => {
    const later = cafe('Mo-Su 06:00-22:00', { name: 'Later', tags: { indoor_seating: 'yes' } });
    const s = screen(inputsOf({
      positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, spots: [{ b: later, km: 40 }],
      spells: [{ range: [50, 60], stamps: stamps(SAT, 9, 14), pp: 80, mm: 1 }],
    }));
    expect(s.strip.icons).toContainEqual({ kind: 'cover', km: 40, opens: 'weather' });
    const possible = screen(inputsOf({
      positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, spots: [{ b: later, km: 40 }],
      spells: [{ range: [50, 60], stamps: stamps(SAT, 9, 14), pp: 35, mm: 0.5 }],
    }));
    expect(possible.strip.icons.filter((x) => x.kind === 'cover')).toEqual([]);
  });
  test('[HON-ONE-SCREEN] with rain at the start, the list\'s first cover is drawn, and a plain roof is not drawn in a thunderstorm', () => {
    const rain = { range: [0, 60] as [number, number], stamps: stamps(SAT, 8, 16), pp: 80, mm: 1 };
    const roof = busStop({ bench: true }).atKm(42);
    const wet = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, roofs: [roof], spells: [rain], opts: { extraKms: [40] } }));
    expect(wet.strip.icons.filter((x) => x.kind === 'cover').map((x) => Math.round(x.km))).toEqual([42]);
    const stormy = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, roofs: [roof], spells: [{ ...rain, code: 95 }], opts: { extraKms: [40] } }));
    expect(stormy.strip.icons.filter((x) => x.kind === 'cover')).toEqual([]);
  });
  test('[HON-ONE-SCREEN] water, food and sleep icons sit at their kilometres, on the strip only, and each card lists its icon', () => {
    const s = screen(inputsOf({
      positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, litres: 3,
      spots: [{ b: tap(), km: 5 }, { b: tap(), km: 30 }, { b: tap(), km: 50 }, { b: supermarket('Mo-Sa 07:00-21:00'), km: 45 }, { b: campsite(), km: 77 }, { b: campsite(), km: 120 }],
    }));
    const kms = (k: string): number[] => s.strip.icons.filter((x) => x.kind === k).map((x) => x.km);
    expect(kms('water')).toEqual([30, 45]);
    expect(kms('food')).toContain(45);
    expect(kms('sleep')).toEqual([77]);
    for (const icon of s.strip.icons) {
      expect(icon.km).toBeGreaterThanOrEqual(s.strip.startKm);
      expect(icon.km).toBeLessThanOrEqual(s.strip.endKm);
      const card = s.cards[icon.opens as 'water'];
      expect([card.stamp?.km, ...card.items.map((i) => i.stamp?.km)]).toContain(icon.km);
    }
  });
  test('[HON-ONE-SCREEN] one place on two passes gets an icon per pass, never one lookup by id', () => {
    const route = flatRoute(100, { stageEnds: [100] });
    const s = screen(inputsOf({ trip: testTrip({ route }), positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, litres: 3, spots: [{ b: tap(), km: [30, 70] }] }));
    expect(s.strip.icons.filter((x) => x.kind === 'water').map((x) => x.km)).toEqual([30, 70]);
    const food = screen(inputsOf({ trip: testTrip({ route }), positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, litres: 3, spots: [{ b: tap(), km: 30 }, { b: tap(), km: [40, 70], side: 'west' }] }));
    expect(food.strip.icons.filter((x) => x.kind === 'water').map((x) => x.km)).toEqual([30, 40]);
  });
  test('[HON-ONE-SCREEN] a window ending just past a stage end by grid rounding stays one band within the ride', () => {
    const route = flatRoute(100, { stageEnds: [33.33333] });
    route.sampleGrid = [0, 10, 20, 30, 33.333, 40, 100];
    const s = screen(inputsOf({ trip: testTrip({ route }), positions: [pos({ km: 10, at: `${SAT} 09:00` })], now: `${SAT} 09:00`, spells: [{ range: [30, 34], stamps: stamps(SAT, 9, 12), pp: 80, mm: 1 }] }));
    expect(s.strip.endKm).toBeCloseTo(33.33333, 5);
    expect(s.strip.bands).toEqual([{ fromKm: 30, toKm: 33.33333, kind: 'likely', opens: 'weather' }]);
  });
});

describe('the position line and the notes', () => {
  const near = settlement('Rheinstetten').atKm(80, { off: 400 });
  const withTown = (p: Position, now: string): ScreenInputs => {
    const i = inputsOf({ trip: testTrip({ route: flatRoute(165, { stageEnds: [78, 165] }) }), positions: [p], now });
    return { ...i, places: [near], matches: [{ placeId: near.id, km: 80, offRouteM: 400 }] };
  };
  const at80 = (o: Partial<Parameters<typeof pos>[0]> = {}): Position => pos({ km: 80, at: `${SAT} 14:20`, acc: 12, ...o });
  test('[HON-ONE-SCREEN] km, settlement, accuracy and time', () => {
    expect(screen(withTown(at80(), `${SAT} 14:20`)).positionLine).toBe('km 80 of 165 · near Rheinstetten · ±12 m · 14:20');
  });
  test('[HON-ONE-SCREEN] an old position gives its age; a future one counts as now', () => {
    expect(screen(withTown(at80(), `${SAT} 15:00`)).positionLine).toBe('km 80 of 165 · near Rheinstetten · ±12 m · as of 14:20, 40 min ago');
    expect(screen(withTown(at80(), `${SAT} 17:30`)).positionLine).toContain('as of 14:20, 3 h ago');
    expect(screen(withTown(at80(), `${SAT} 14:00`)).positionLine).toBe('km 80 of 165 · near Rheinstetten · ±12 m · 14:20');
  });
  test('[HON-ONE-SCREEN] approximate, manual and off-route positions say so', () => {
    expect(screen(withTown(at80({ acc: 800 }), `${SAT} 14:20`)).positionLine).toContain('±800 m, approximate');
    expect(screen(withTown(at80({ acc: 1200 }), `${SAT} 14:20`)).positionLine).toContain('±1.2 km, approximate');
    expect(screen(withTown(at80({ manual: true }), `${SAT} 14:20`)).positionLine).toContain('set by hand');
    expect(screen(withTown(at80({ off: 1500 }), `${SAT} 14:20`)).positionLine).toContain('1.5 km off route');
  });
  test('[HON-ONE-SCREEN] the position line uses the zone of its own kilometre', () => {
    const zones: ZoneSpan[] = [{ fromKm: 0, toKm: 100, timeZone: TZ, holidayZone: null, country: 'DE' }, { fromKm: 100, toKm: 300, timeZone: 'Europe/Lisbon', holidayZone: null, country: 'PT' }];
    expect(screen(inputsOf({ zones, positions: [pos({ km: 120, at: `${SAT} 14:20` })] })).positionLine).toContain('13:20');
  });
  test('[HON-ONE-SCREEN] no position: no line; broken values: no broken text', () => {
    expect(screen(inputsOf()).positionLine).toBeNull();
    const broken = { ...at80(), accuracyM: NaN };
    expect(screen(withTown(broken, `${SAT} 14:20`)).positionLine ?? '').not.toMatch(/NaN|undefined/);
    const noWhen = { ...at80(), at: new Date(NaN) };
    expect(screen(withTown(noWhen, `${SAT} 14:20`)).positionLine ?? '').not.toMatch(/NaN|Invalid/);
  });
  test('[HON-ONE-SCREEN] over 5 km off the route the screen says the answers are approximate', () => {
    const s = screen(inputsOf({ positions: [pos({ km: 90, at: `${SAT} 14:00` }), pos({ km: 90, at: `${SAT} 14:20`, off: 6000 })] }));
    expect(s.notes.join(' ')).toMatch(/more than 5 km/);
    expect(s.notes.join(' ')).toMatch(/approximate/);
  });
  test('[HON-ONE-SCREEN] Share progress gets the Plan tomorrow choice: a stop away from a stage end counts as a stop', () => {
    const positions = [pos({ km: 10, at: `${SAT} 09:00` }), pos({ km: 40, at: `${SAT} 12:00` })];
    const chosen = screen(inputsOf({ positions, now: `${SAT} 12:05`, plan: { date: SAT, backToTodayAt: null } }));
    expect(chosen.phase).toBe('after-ride');
    expect(chosen.shareText).toMatch(/[Ss]topped/);
  });
  test('[HON-ONE-SCREEN] a map link is only in the second text', () => {
    const s = screen(inputsOf({ positions: [pos({ km: 40, at: `${SAT} 14:00` })] }));
    expect(s.shareText).not.toContain('openstreetmap');
    expect(s.shareMapText).toContain('openstreetmap');
  });
  test('[HON-ONE-SCREEN] T1 reads the same leave-by: Food and Daylight agree on the Sunday closure', () => {
    const market = supermarket('Mo-Sa 07:00-16:00', { name: 'Markt' });
    const i = inputsOf({ trip: testTrip({ route: flatRoute(300, { stageEnds: [90, 200, 300] }) }), now: `${FRI} 20:00`, spots: [{ b: market, km: 89.5 }, { b: tap(), km: 30 }, { b: tap(), km: 60, side: 'west' }], litres: 3 });
    const s = screen({ ...i, hours: i.places.map((p) => preparedHours(p)) });
    expect(s.cards.food.title.toLowerCase()).toContain('sunday');
    expect(itemText(s.cards.daylight).toLowerCase()).toContain('sunday');
  });
});

test('[HON-SPEED] one screen on a 200 km route: measured and printed', () => {
  const trip = testTrip({ route: flatRoute(200, { stageEnds: [70, 140, 200] }) });
  const spots = Array.from({ length: 200 }, (_, i) => ({ b: i % 3 === 0 ? tap() : i % 3 === 1 ? shop('Mo-Sa 08:00-20:00') : cafe('Mo-Su 09:00-22:00'), km: i + 0.5, off: 50 + (i % 5) * 50 }));
  const spells = [{ range: [20, 60] as [number, number], stamps: stamps(SAT, 8, 18), pp: 80, mm: 1 }];
  const i = inputsOf({ trip, spots, spells, positions: [pos({ km: 15, at: `${SAT} 09:00` })], now: `${SAT} 09:00` });
  const times: number[] = [];
  for (let n = 0; n < 15; n++) {
    const t0 = performance.now();
    screen(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`[HON-SPEED] 200 km, ${i.places.length} places: median ${times[7]!.toFixed(1)} ms, worst ${times[14]!.toFixed(1)} ms`);
  expect(times[7]).toBeGreaterThan(0);
});

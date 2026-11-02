import { describe, expect, test } from 'vitest';
import { amountLine, chanceLine, onTheRide, rainAtStart, rainHereNow, rainWindows, shownKm, windowWhen, within48h } from '../../../../src/core/engines/weather-windows.ts';
import type { RainWindow, StoredForecast } from '../../../../src/core/types.ts';
import { at, flatRoute, pointAtKm, pos, testTrip } from '../../../fixtures/build.ts';
import { forecastOf, momentOf, SAT, stamps, SUN, type Moment, type Spell, type ForecastOpts } from './weather-helpers.ts';

const BER = 'Europe/Berlin';
const LONG = (): ReturnType<typeof testTrip> => testTrip({ route: flatRoute(300, { stageEnds: [200, 300] }) });

/** The rider at km `km` at `t` on Saturday, on one long ride, unless the moment says otherwise. */
const riding = (km: number, t: string, over: Moment = {}): Moment => ({ trip: LONG(), positions: [pos({ km, at: `${SAT} ${t}` })], now: `${SAT} ${t}`, ...over });

function windowsOf(spells: Spell[], m: Moment = {}, o: ForecastOpts = {}): { windows: RainWindow[]; f: StoredForecast; c: ReturnType<typeof momentOf> } {
  const c = momentOf(m);
  const f = forecastOf(c.trip.route, spells, o);
  return { windows: rainWindows(f, c.schedule, c.stops, c.zone), f, c };
}
const likely = (w: RainWindow[]): RainWindow[] => w.filter((x) => x.cls === 'likely');

describe('hour stamps and the two numbers', () => {
  test('[WX-STAMP] 3.0 mm at 80% stamped 15:00 reads "from about 14:00"', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 80, mm: 3 }], riding(60, '14:00'));
    expect(windows).toHaveLength(1);
    expect(windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
    expect(windowWhen(windows[0]!, BER)).toContain('from about 14:00');
  });
  test('[WX-TWO-NUMBERS] 93% with 0.0 mm reads as both numbers, never combined', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 93, mm: 0 }], riding(60, '14:00'));
    expect(windows[0]!.cls).toBe('likely');
    expect(amountLine(windows[0]!)).toBe('under 0.1 mm/h (one model)');
    expect(chanceLine(windows[0]!)).toBe('9 in 10 forecast scenarios');
  });
  test('[WX-TWO-NUMBERS] an amount of 0.1 mm or more is shown, with its label', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 93, mm: 1.26 }], riding(60, '14:00'));
    expect(amountLine(windows[0]!)).toBe('1.3 mm/h (one model)');
  });
  test('[WX-POSSIBLE] 40% with 4 mm is a possible window, not a likely one', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 40, mm: 4 }], riding(60, '14:00'));
    expect(windows).toHaveLength(1);
    expect(windows[0]!.cls).toBe('possible');
    expect(likely(windows)).toEqual([]);
  });
  test('[WX-HEAVY] 70% at 14:00 and 3 mm at 15:00 with T = 14:30 is a heavy window', () => {
    const { windows, c } = windowsOf([{ km: 60, stamps: [`${SAT} 14:00`], pp: 70 }, { km: 60, stamps: [`${SAT} 15:00`], pp: 10, mm: 3 }], riding(60, '14:30'));
    expect(c.schedule.atKm(60)).toEqual(at(`${SAT} 14:30`));
    expect(windows[0]!.heavy).toBe(true);
    expect(windows[0]!.maxMm).toBe(3);
  });
  test('[WX-HEAVY] a heavy hour outside the band makes nothing heavy', () => {
    const { windows } = windowsOf([{ km: 60, stamps: [`${SAT} 14:00`], pp: 70 }, { km: 60, stamps: [`${SAT} 17:00`], pp: 10, mm: 3 }], riding(60, '14:30'));
    expect(windows[0]!.heavy).toBe(false);
  });
});

describe('onset and end', () => {
  const rainy: Spell[] = [{ km: 70, stamps: [`${SAT} 15:00`, `${SAT} 16:00`], pp: 80, mm: 1 }];
  const opts = (more: ForecastOpts = {}): ForecastOpts => ({ fetchedAt: `${SAT} 11:00`, has15: true, ...more });

  test('[WX-ONSET-15] a 15-minute onset at 14:40 reads "about 14:30"', () => {
    // The step stamped 14:55 holds the 15 minutes before it, so the rain starts at 14:40.
    const { windows } = windowsOf(rainy, riding(60, '14:30'), opts({ rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(windows[0]!.onset).toEqual(at(`${SAT} 14:40`));
    expect(windowWhen(windows[0]!, BER)).toContain('from about 14:30');
  });
  test('[WX-ONSET-15] steps under 0.1 mm do not count; with none left, hour boundaries are used', () => {
    const { windows } = windowsOf(rainy, riding(60, '14:30'), opts({ rain15: [{ km: 70, at: `${SAT} 14:30`, mm: 0.09 }, { km: 70, at: `${SAT} 14:45`, mm: Number.NaN }] }));
    expect(windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-ONSET-15] the forecast says it holds no 15-minute rain: hour boundaries', () => {
    const { windows } = windowsOf(rainy, riding(60, '14:30'), opts({ has15: false, rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-ONSET-15] 15-minute values are ignored at a KNMI point', () => {
    const { windows } = windowsOf(rainy, riding(60, '14:30', { country: 'NL' }), opts({ rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-ONSET-15] in France they count up to 6 h after the fetch, not beyond', () => {
    const france = riding(60, '14:30', { country: 'FR' });
    const near = windowsOf(rainy, france, opts({ rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(near.windows[0]!.onset).toEqual(at(`${SAT} 14:40`));
    const far = windowsOf(rainy, france, opts({ fetchedAt: `${SAT} 08:00`, rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(far.windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-ONSET-15] in Germany they count up to 48 h after the fetch, not beyond', () => {
    const germany = riding(60, '14:30');
    const near = windowsOf(rainy, germany, opts({ fetchedAt: '2026-10-16 15:00', rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(near.windows[0]!.onset).toEqual(at(`${SAT} 14:40`));
    const far = windowsOf(rainy, germany, opts({ fetchedAt: '2026-10-15 14:00', rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] }));
    expect(far.windows[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-END] end 15:50 followed by two hours under 20% reads "likely dry again from about 16:00"', () => {
    const { windows } = windowsOf(rainy, riding(60, '14:30'), opts({ rain15: [{ km: 70, at: `${SAT} 15:50`, mm: 0.3 }] }));
    expect(windows[0]!.end).toEqual(at(`${SAT} 15:50`));
    expect(windowWhen(windows[0]!, BER)).toContain('likely dry again from about 16:00');
  });
  test('[WX-END] a 35% hour at 17:00 hides the end', () => {
    const { windows } = windowsOf([...rainy, { km: 70, stamps: [`${SAT} 17:00`], pp: 35 }], riding(60, '14:30'), opts({ rain15: [{ km: 70, at: `${SAT} 15:50`, mm: 0.3 }] }));
    expect(windows.find((w) => w.cls === 'likely')!.end).toBeNull();
    expect(windowWhen(windows.find((w) => w.cls === 'likely')!, BER)).not.toContain('dry');
  });
  test('[WX-END] the end needs every met point quiet: a later hour at another met point hides it', () => {
    const { windows } = windowsOf([...rainy, { km: 80, stamps: [`${SAT} 15:00`], pp: 80 }, { km: 80, stamps: [`${SAT} 18:00`], pp: 30 }], riding(60, '14:30'));
    const w = windows.find((x) => x.cls === 'likely')!;
    expect(w.metKms).toEqual([70, 80]);
    expect(w.end).toBeNull();
  });
  test('[WX-END] a forecast that stops before the two hours are out shows no end', () => {
    const { windows } = windowsOf(rainy, riding(60, '14:30'), opts({ until: `${SAT} 17:00` }));
    expect(windows[0]!.end).toBeNull();
  });
  test('[WX-END] a broken hour among the two hours shows no end', () => {
    const c = momentOf(riding(60, '14:30'));
    const f = forecastOf(c.trip.route, rainy, opts());
    f.grid.find((g) => g.km === 70)!.hours.find((h) => h.at.getTime() === at(`${SAT} 17:00`).getTime())!.pp = Number.NaN;
    expect(rainWindows(f, c.schedule, c.stops, c.zone)[0]!.end).toBeNull();
  });
});

describe('areas and storms', () => {
  test('[WX-AREA] code 81 at km 60 and km 140: area wording, kilometres and whole hours, no onset', () => {
    const { windows } = windowsOf([
      { km: 60, stamps: [`${SAT} 11:00`, `${SAT} 12:00`], pp: 60, code: 81 },
      { km: 140, stamps: [`${SAT} 16:00`], pp: 60, code: 81 },
    ], { trip: LONG() });
    expect(windows.map((w) => [w.kind, w.fromKm, w.toKm])).toEqual([['showers', 60, 60], ['showers', 140, 140]]);
    expect(windows[0]!.onset).toBeNull();
    expect(windowWhen(windows[0]!, BER)).toBe("10:00–12:00. Exact places and times can't be forecast.");
    expect(windowWhen(windows[1]!, BER)).toBe("15:00–16:00. Exact places and times can't be forecast.");
  });
  test('[WX-THUNDER-MET] a 30% thunderstorm hour overlapping T plus or minus 1 h makes a met point and a window', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 30, code: 95 }], riding(60, '14:00'));
    expect(windows).toHaveLength(1);
    expect(windows[0]!).toMatchObject({ kind: 'thunder', cls: 'likely', onset: null, end: null, metKms: [70], thunderKms: [70] });
    expect(chanceLine(windows[0]!)).toBe('3 in 10 forecast scenarios');
    expect(windowWhen(windows[0]!, BER)).toContain("14:00–15:00. Exact places and times can't be forecast.");
  });
  test('[WX-THUNDER-MET] a thunderstorm hour with no chance given still makes a window, and no chance line', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: null, code: 99 }], riding(60, '14:00'));
    expect(windows[0]!.kind).toBe('thunder');
    expect(windows[0]!.chancePct).toBeNull();
    expect(chanceLine(windows[0]!)).toBe('');
  });
  test('[WX-THUNDER-MET] a thunderstorm hour far from T makes no met point', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 20:00`], pp: 90, code: 95 }], riding(60, '14:00'));
    expect(windows).toEqual([]);
  });
  test('[WX-THUNDER-MET] at exactly one hour the storm still counts: the band is closed, the careful side', () => {
    const c = momentOf(riding(60, '14:00'));
    const stamp = new Date(c.schedule.atKm(70).getTime() - 3_600_000);
    const f = forecastOf(c.trip.route, []);
    const h = f.grid.find((g) => g.km === 70)!.hours;
    h.push({ ...h[0]!, at: stamp, pp: 90, code: 95 });
    expect(rainWindows(f, c.schedule, c.stops, c.zone).map((w) => w.kind)).toEqual(['thunder']);
  });
});

describe('windows along the route', () => {
  test("[WX-WINDOW-STOP] today's window ends at the stop; the thunderstorm is on tomorrow's ride, with no red band today", () => {
    const trip = testTrip({ route: flatRoute(300, { stageEnds: [99.6, 200, 300] }) });
    const spells: Spell[] = [
      { range: [58, 99.6], stamps: stamps(SAT, 13, 18), pp: 70, mm: 1 },
      { km: [100, 103, 116], stamps: [`${SUN} 09:00`, `${SUN} 10:00`], pp: 40, code: 95 },
    ];
    const { windows, c } = windowsOf(spells, { trip, positions: [pos({ km: 58, at: `${SAT} 14:00` })], now: `${SAT} 14:00` }, { extraKms: [58, 99.6, 103, 116] });
    expect(c.ride.stopKm).toBe(99.6);
    const met = likely(windows);
    expect(met[0]).toMatchObject({ kind: 'rain', fromKm: 58, toKm: 99.6 });
    expect(met[1]).toMatchObject({ kind: 'thunder', fromKm: 100, toKm: 116, metKms: [100, 103, 116], onAndOff: true });
    const today = onTheRide(met, c.ride);
    expect(today.map((w) => w.kind)).toEqual(['rain']);
  });
  test("[WX-WINDOW-STOP] a met point at a stop belongs to the ride that ends there, one beyond starts a new window", () => {
    const trip = testTrip({ route: flatRoute(300, { stageEnds: [100, 200, 300] }) });
    const spells: Spell[] = [{ km: [90, 100], stamps: stamps(SAT, 12, 16), pp: 70 }, { km: [110], stamps: stamps(SUN, 8, 11), pp: 70 }];
    const { windows, c } = windowsOf(spells, { trip, positions: [pos({ km: 80, at: `${SAT} 13:00` })], now: `${SAT} 13:00` });
    expect(windows.map((w) => [w.fromKm, w.toKm])).toEqual([[90, 100], [110, 110]]);
    expect(onTheRide(windows, c.ride).map((w) => w.toKm)).toEqual([100]);
  });
  test('[WX-BRIDGE] one unmet point between met points is bridged, and reads "on and off"', () => {
    const { windows } = windowsOf([{ km: [30, 50], stamps: stamps(SAT, 6, 23), pp: 80 }], { trip: LONG() });
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ fromKm: 30, toKm: 50, onAndOff: true, metKms: [30, 50] });
    expect(windowWhen(windows[0]!, BER)).toContain('on and off');
  });
  test('[WX-BRIDGE] two unmet points are not bridged', () => {
    const { windows } = windowsOf([{ km: [30, 60], stamps: stamps(SAT, 6, 23), pp: 80 }], { trip: LONG() });
    expect(windows.map((w) => [w.fromKm, w.toKm, w.onAndOff])).toEqual([[30, 30, false], [60, 60, false]]);
  });
  test('[WX-BRIDGE] no bridge across a stop', () => {
    const trip = testTrip({ route: flatRoute(300, { stageEnds: [100, 200, 300] }) });
    const { windows } = windowsOf([{ km: [90], stamps: stamps(SAT, 6, 23), pp: 80 }, { km: [110], stamps: stamps(SUN, 6, 23), pp: 80 }], { trip });
    expect(windows.map((w) => w.onAndOff)).toEqual([false, false]);
  });
  test('[WX-KM-ROUND] kilometres round outward to 5 km: 58-99 becomes 55-100; chance rounds to tens: 67% is 7 in 10', () => {
    const { windows, c } = windowsOf([{ range: [58, 99], stamps: stamps(SAT, 6, 23), pp: 67, mm: 1 }], { trip: LONG() }, { extraKms: [58, 99] });
    expect([windows[0]!.fromKm, windows[0]!.toKm]).toEqual([58, 99]);
    expect(shownKm(windows[0]!, c.trip.route.lengthKm)).toEqual([55, 100]);
    expect(chanceLine(windows[0]!)).toBe('7 in 10 forecast scenarios');
  });
  test('[WX-KM-ROUND] rounding stays on the route', () => {
    const trip = testTrip({ route: flatRoute(297, { stageEnds: [200] }) });
    const { windows } = windowsOf([{ km: [297], stamps: stamps(SUN, 6, 23), pp: 67 }], { trip });
    expect(shownKm(windows[0]!, 297)).toEqual([295, 297]);
  });
  test('[WX-THUNDER-MET] the chance is the highest of the rain hours in the window', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 62 }, { km: 80, stamps: [`${SAT} 15:00`, `${SAT} 16:00`], pp: 88 }], riding(60, '14:00'));
    expect(windows[0]!.chancePct).toBe(88);
  });
});

describe('detail in a window', () => {
  const fetched = { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00', days: 8 };
  const early: Moment = { now: '2026-10-14 08:00' };

  test('[WX-DETAIL] beyond 48 h a window gives day parts, with no half-hour time', () => {
    const { windows } = windowsOf([{ km: 20, stamps: stamps(SAT, 9, 11), pp: 80, mm: 1 }], early, fetched);
    expect(windows[0]!.detail).toBe('daypart');
    const text = windowWhen(windows[0]!, BER);
    expect(text).toBe('Saturday morning');
    expect(text).not.toMatch(/\d\d:\d\d/);
  });
  test('[WX-DETAIL] a storm beyond 48 h gives day parts too, with its caveat', () => {
    const { windows } = windowsOf([{ km: 20, stamps: stamps(SAT, 13, 14), pp: 40, code: 96 }], { now: '2026-10-14 08:00', trip: testTrip({ startTime: '12:00' }) }, fetched);
    expect(windowWhen(windows[0]!, BER)).toBe("Saturday afternoon. Exact places and times can't be forecast.");
  });
  test('[WX-DETAIL] beyond day 5 a window gives the trend: the day alone', () => {
    const trip = testTrip({ departureDate: '2026-10-21' });
    const { windows } = windowsOf([{ km: 20, stamps: stamps('2026-10-21', 9, 11), pp: 80 }], { now: '2026-10-14 08:00', trip }, fetched);
    expect(windows[0]!.detail).toBe('trend');
    expect(windowWhen(windows[0]!, BER)).toBe('Wednesday');
  });
  test('[WX-DETAIL] a window reached within 48 h whose rain runs past it shows no time beyond', () => {
    const { windows, c } = windowsOf([{ km: 10, stamps: [`${SAT} 10:00`, `${SAT} 11:00`], pp: 80 }], { now: `${SAT} 08:00` }, { fetchedAt: '2026-10-15 09:30' });
    expect(within48h(windows[0]!, c.now)).toBe(true);
    expect(windows[0]!.detail).toBe('daypart');
    expect(windowWhen(windows[0]!, BER)).not.toMatch(/\d\d:\d\d/);
  });
  test('[WX-DETAIL] a window beyond 48 h is not within 48 h', () => {
    const { windows, c } = windowsOf([{ km: 20, stamps: stamps(SAT, 9, 11), pp: 80 }], early, fetched);
    expect(within48h(windows[0]!, c.now)).toBe(false);
  });
});

describe('rain here now and rain at the start', () => {
  const route = flatRoute(300, { stageEnds: [78, 150, 222] });
  const wetAt = (km: number, stamp: string): StoredForecast => forecastOf(route, [{ km, stamps: [stamp], pp: 80 }]);
  const here = (km: number) => pos({ km, at: `${SAT} 14:20` });
  const NOW = at(`${SAT} 14:20`);

  test('[WX-HERE-START] rain here now comes from the stored point nearest the position, for the current hour', () => {
    const f = wetAt(120, `${SAT} 15:00`);
    expect(rainHereNow(f, here(122), NOW)!.pp).toBe(80);
    expect(rainHereNow(f, here(126), NOW)!.pp).toBe(0); // km 130 is nearer
    expect(rainHereNow(f, here(122), at(`${SAT} 15:20`))!.pp).toBe(0); // the next hour
  });
  test('[WX-HERE-START] the point is the one nearest the position on the ground, also off the route', () => {
    const f = forecastOf(route, [{ km: 120, stamps: [`${SAT} 15:00`], pp: 80 }]);
    const off = { ...here(125.1), ...pointAtKm(121, 800) };
    expect(rainHereNow(f, off, NOW)!.pp).toBe(80);
  });
  test('[WX-HERE-START] with no position, an invalid clock, an empty forecast or no hour left, it is not known', () => {
    const f = wetAt(120, `${SAT} 15:00`);
    expect(rainHereNow(f, null, NOW)).toBeNull();
    expect(rainHereNow(f, here(120), new Date(Number.NaN))).toBeNull();
    expect(rainHereNow(null, here(120), NOW)).toBeNull();
    expect(rainHereNow({ ...f, grid: [] }, here(120), NOW)).toBeNull();
    expect(rainHereNow(forecastOf(route, [], { until: `${SAT} 12:00` }), here(120), NOW)).toBeNull();
  });
  test('[WX-HERE-START] a broken first grid point or first hour decides nothing', () => {
    const f = wetAt(120, `${SAT} 15:00`);
    const point = f.grid.find((g) => g.km === 120)!;
    point.hours.unshift({ ...point.hours[0]!, at: new Date(Number.NaN), pp: 100 });
    f.grid.unshift({ km: Number.NaN, lat: Number.NaN, lon: Number.NaN, hours: [{ ...point.hours[1]!, at: at(`${SAT} 15:00`), pp: 100 }] });
    expect(rainHereNow(f, here(122), NOW)!.pp).toBe(80);
    expect(rainHereNow(f, here(126), NOW)!.pp).toBe(0);
  });
  test('[WX-HERE-START] hours given out of order are read in order', () => {
    const f = wetAt(120, `${SAT} 15:00`);
    f.grid.forEach((g) => g.hours.reverse());
    expect(rainHereNow(f, here(122), NOW)!.pp).toBe(80);
  });
  test("[WX-HERE-START] rain at the start comes from the point nearest the ride's start, at its departure", () => {
    const c = momentOf({ now: `${SAT} 08:00` });
    expect(c.ride.startKm).toBe(0);
    expect(rainAtStart(forecastOf(c.trip.route, [{ km: 0, stamps: [`${SAT} 09:00`], pp: 80 }]), c.ride)).toBe(true);
    expect(rainAtStart(forecastOf(c.trip.route, [{ km: 0, stamps: [`${SAT} 08:00`], pp: 80 }]), c.ride)).toBe(false);
    expect(rainAtStart(forecastOf(c.trip.route, [{ km: 10, stamps: [`${SAT} 09:00`], pp: 80 }]), c.ride)).toBe(false);
  });
  test('[WX-HERE-START] while the ride departs now from the position, the two are equal', () => {
    for (const km of [120, 124, 126]) {
      const p = pos({ km, at: `${SAT} 14:20` });
      const c = momentOf({ trip: testTrip(), positions: [p], now: `${SAT} 14:20` });
      const f = wetAt(120, `${SAT} 15:00`);
      expect(c.ride.departure).toEqual(NOW);
      expect(rainAtStart(f, c.ride, p)).toBe(rainHereNow(f, p, NOW)!.pp === 80);
    }
  });
  test('[WX-HERE-START] the two stay equal for an approximate position, whose ride starts behind it', () => {
    const p = pos({ km: 126, at: `${SAT} 14:20`, acc: 2000 });
    const c = momentOf({ positions: [p], now: `${SAT} 14:20` });
    expect(c.ride.startKm).toBe(124);
    const f = wetAt(130, `${SAT} 15:00`);
    expect(rainHereNow(f, p, NOW)!.pp).toBe(80);
    expect(rainAtStart(f, c.ride, p)).toBe(true);
  });
  test("[WX-HERE-START] before the trip, day 1's start, not the position at home", () => {
    const home = pos({ km: 150, off: 300, at: '2026-10-16 20:00' });
    const c = momentOf({ positions: [home], now: '2026-10-16 20:00' });
    expect(c.ride.phase).toBe('before-trip');
    const atHome = forecastOf(c.trip.route, [{ km: 150, stamps: [`${SAT} 09:00`], pp: 80 }]);
    const atStart = forecastOf(c.trip.route, [{ km: 0, stamps: [`${SAT} 09:00`], pp: 80 }]);
    expect(rainAtStart(atHome, c.ride, home)).toBe(false);
    expect(rainAtStart(atStart, c.ride, home)).toBe(true);
  });
  test('[WX-HERE-START] a first grid point with no kilometre is not the nearest to anything', () => {
    const c = momentOf({ now: `${SAT} 08:00` });
    const f = forecastOf(c.trip.route, []);
    const wet = forecastOf(c.trip.route, [{ km: 0, stamps: [`${SAT} 09:00`], pp: 90 }]).grid[0]!.hours;
    f.grid.unshift({ km: Number.NaN, lat: 49, lon: 8.4, hours: wet });
    expect(rainAtStart(f, c.ride)).toBe(false);
  });
  test('[WX-HERE-START] a broken hour, or none, is not rain at the start', () => {
    const c = momentOf({ now: `${SAT} 08:00` });
    expect(rainAtStart(null, c.ride)).toBe(false);
    expect(rainAtStart(forecastOf(c.trip.route, [{ km: 0, stamps: [`${SAT} 09:00`], pp: Number.NaN }]), c.ride)).toBe(false);
    expect(rainAtStart(forecastOf(c.trip.route, [], { until: `${SAT} 08:00` }), c.ride)).toBe(false);
  });
});

describe('the start of the ride between grid points', () => {
  test('[WX-HERE-START] rain at the grid point just behind the rider, when it is the nearest, starts the window here', () => {
    const { windows, c } = windowsOf([{ km: 120, stamps: [`${SAT} 15:00`], pp: 80 }], { trip: LONG(), positions: [pos({ km: 122, at: `${SAT} 14:20` })], now: `${SAT} 14:20` });
    expect(windows).toHaveLength(1);
    expect(windows[0]!.fromKm).toBe(122);
    expect(windows[0]!.reachAt).toEqual(c.ride.departure);
  });
  test('[WX-HERE-START] a grid point behind the rider that is not the nearest is passed', () => {
    const { windows } = windowsOf([{ km: 120, stamps: [`${SAT} 15:00`], pp: 80 }], { trip: LONG(), positions: [pos({ km: 126, at: `${SAT} 14:20` })], now: `${SAT} 14:20` });
    expect(windows).toEqual([]);
  });
});

describe('forecasts with holes', () => {
  const m = riding(60, '14:00');
  test('[WX-CLASS] a grid point with no kilometre makes no window, even with rain in it', () => {
    const c = momentOf(m);
    const f = forecastOf(c.trip.route, []);
    const hours = forecastOf(c.trip.route, [{ km: 70, stamps: stamps(SAT, 10, 20), pp: 90 }]).grid.find((g) => g.km === 70)!.hours;
    f.grid.splice(3, 0, { km: Number.NaN, lat: 49, lon: 8.4, hours });
    expect(rainWindows(f, c.schedule, c.stops, c.zone)).toEqual([]);
  });
  test('[WX-HERE-START] a broken hour in the middle of the list hides nothing and answers nothing', () => {
    const route = flatRoute(300);
    const f = forecastOf(route, [{ km: 120, stamps: [`${SAT} 15:00`], pp: 80 }]);
    const point = f.grid.find((g) => g.km === 120)!;
    const kept = point.hours.find((h) => h.at.getTime() === at(`${SAT} 15:00`).getTime())!;
    const broken = { ...kept, at: new Date(Number.NaN), pp: 100, code: 95 };
    point.hours = [broken, kept, broken, broken, broken];
    expect(rainHereNow(f, pos({ km: 120, at: `${SAT} 14:20` }), at(`${SAT} 14:20`))!.pp).toBe(80);
  });
  test('[WX-ONSET-15] at a KNMI point not even a step from before the fetch counts', () => {
    const c = momentOf(riding(60, '14:30', { country: 'NL' }));
    const f = forecastOf(c.trip.route, [{ km: 70, stamps: [`${SAT} 15:00`], pp: 80 }], { fetchedAt: `${SAT} 16:00`, has15: true, rain15: [{ km: 70, at: `${SAT} 14:55`, mm: 0.2 }] });
    expect(rainWindows(f, c.schedule, c.stops, c.zone)[0]!.onset).toEqual(at(`${SAT} 14:00`));
  });
  test('[WX-POSSIBLE] a point met by a likely hour is not a possible point too', () => {
    const { windows } = windowsOf([{ km: 70, stamps: [`${SAT} 14:00`], pp: 80 }, { km: 70, stamps: [`${SAT} 15:00`], pp: 30 }], riding(60, '14:00'));
    expect(windows.map((w) => w.cls)).toEqual(['likely']);
  });
  test('[WX-CLASS] an empty forecast gives no window and does not throw', () => {
    const c = momentOf(m);
    expect(rainWindows({ fetchedAt: at(`${SAT} 07:00`), runs: [], grid: [], has15: false }, c.schedule, c.stops, c.zone)).toEqual([]);
  });
  test('[WX-CLASS] an invalid fetch time reads as no forecast', () => {
    const c = momentOf(m);
    const f = forecastOf(c.trip.route, [{ km: 70, stamps: [`${SAT} 15:00`], pp: 80 }]);
    expect(rainWindows({ ...f, fetchedAt: new Date(Number.NaN) }, c.schedule, c.stops, c.zone)).toEqual([]);
  });
  test('[WX-CLASS] a broken first grid point and first hour do not hide the rain, and a broken chance makes no band', () => {
    const c = momentOf(m);
    const f = forecastOf(c.trip.route, [{ km: 70, stamps: [`${SAT} 15:00`], pp: 80 }]);
    const point = f.grid.find((g) => g.km === 70)!;
    point.hours.unshift({ ...point.hours[0]!, at: new Date(Number.NaN), pp: Number.NaN });
    f.grid.unshift({ km: Number.NaN, lat: 0, lon: 0, hours: [] });
    expect(rainWindows(f, c.schedule, c.stops, c.zone).map((w) => w.metKms)).toEqual([[70]]);
    const broken = forecastOf(c.trip.route, [{ km: 70, stamps: [`${SAT} 15:00`], pp: Number.NaN }]);
    expect(rainWindows(broken, c.schedule, c.stops, c.zone)).toEqual([]);
  });
  test('[WX-CLASS] a schedule with no usable times makes no met point', () => {
    const c = momentOf({ ...m, trip: { ...LONG(), flatKph: Number.NaN } });
    const f = forecastOf(c.trip.route, [{ km: 70, stamps: [`${SAT} 15:00`], pp: 80 }]);
    expect(rainWindows(f, c.schedule, c.stops, c.zone)).toEqual([]);
  });
  test('[WX-CLASS] windows are the same whatever order the grid comes in', () => {
    const c = momentOf(m);
    const f = forecastOf(c.trip.route, [{ range: [70, 90], stamps: stamps(SAT, 13, 18), pp: 80 }]);
    const shuffled = { ...f, grid: [...f.grid].reverse() };
    expect(rainWindows(shuffled, c.schedule, c.stops, c.zone)).toEqual(rainWindows(f, c.schedule, c.stops, c.zone));
  });
});

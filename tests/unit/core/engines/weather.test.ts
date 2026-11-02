import { describe, expect, test } from 'vitest';
import { latestPosition } from '../../../../src/core/engines/locate.ts';
import { headwind, isStale, nightLow, stampLine, weatherAnswer, weatherStatus, weatherWindows, type WaitOrGo, type WeatherFacts } from '../../../../src/core/engines/weather.ts';
import type { Answer, Baseline, ModelRun, StoredForecast } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, flatRoute, pos, testTrip } from '../../../fixtures/build.ts';
import { forecastOf, momentOf, SAT, stamps, SUN, type ForecastOpts, type Moment, type Spell } from './weather-helpers.ts';

const BER = 'Europe/Berlin';
const textOf = (a: Answer): string => [a.title, a.detail, ...a.basis, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
const riding = (km: number, t: string, over: Moment = {}): Moment => ({ positions: [pos({ km, at: `${SAT} ${t}` })], now: `${SAT} ${t}`, ...over });

function factsOf(spells: Spell[] = [], m: Moment = {}, o: ForecastOpts = {}, more: { forecast?: StoredForecast | null; baseline?: Baseline | null } = {}): WeatherFacts {
  const c = momentOf(m);
  const forecast = more.forecast === undefined ? forecastOf(c.trip.route, spells, o) : more.forecast;
  return { forecast, baseline: more.baseline ?? null, trip: c.trip, ride: c.ride, schedule: c.schedule, now: c.now, position: latestPosition(c.positions), routeZones: c.routeZones };
}
const answerOf = (f: WeatherFacts, wg: WaitOrGo | null = null): Answer => weatherAnswer(f, weatherWindows(f), [], wg);
const statusOf = (f: WeatherFacts): string => weatherStatus(f, weatherWindows(f)).status;

/** All of Saturday and the night after it, at the given kilometres. */
const allDay = (o: Omit<Spell, 'stamps'>): Spell => ({ ...o, stamps: [...stamps(SAT, 1, 23), ...stamps(SUN, 0, 23)] });

const BASELINE: Baseline = { years: '2021–2025', points: [{ km: 0, eleM: 100, month: 10, p10LowC: 2, meanLowC: 6, p90HighC: 19, meanHighC: 15, rainDays: 9 }] };

describe('warning: thunderstorms', () => {
  test.each(['camping', 'mixed', 'accommodation'] as const)('[WX-WARN-THUNDER] within 1 h at the stop of the day\'s ride, %s: warning, title with km range and hours', (stay) => {
    const f = factsOf([{ km: 78, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }], { trip: testTrip({ stay }) });
    expect(statusOf(f)).toBe('warning');
    const a = answerOf(f);
    expect(a.status).toBe('warning');
    expect(a.title).toBe("Thunderstorms possible km 75–80, 12:00–13:00. Exact places and times can't be forecast.");
  });
  test("[WX-WARN-THUNDER] on tomorrow's ride it is no warning today", () => {
    const f = factsOf([{ km: 90, stamps: [`${SUN} 09:00`, `${SUN} 10:00`], pp: 90, code: 95 }]);
    expect(weatherWindows(f).some((w) => w.kind === 'thunder')).toBe(true);
    expect(statusOf(f)).not.toBe('warning');
  });
  test('[WX-WARN-THUNDER] a storm far from the rider\'s time at that kilometre is no warning', () => {
    expect(statusOf(factsOf([{ km: 78, stamps: [`${SAT} 09:00`], pp: 90, code: 95 }]))).toBe('fine');
  });
  test('[WX-WARN-THUNDER] the card names the band, and the lightning line stands beside every storm', () => {
    const a = answerOf(factsOf([{ km: [60, 70], stamps: stamps(SAT, 11, 14), pp: 40, code: 95 }]));
    const item = a.items.find((i) => i.label.startsWith('Thunderstorms possible'))!;
    expect(item.status).toBe('warning');
    expect(item.detail).toContain('Roofs, shelters and huts give no protection from lightning.');
  });
  test('[WX-WARN-THUNDER] a storm code with no chance given still warns', () => {
    expect(statusOf(factsOf([{ km: 78, stamps: [`${SAT} 13:00`], pp: null, code: 97 }]))).toBe('warning');
  });
});

describe('warning: thunderstorms at night', () => {
  const NIGHT: Spell = { km: 150, stamps: [`${SAT} 23:00`, `${SUN} 00:00`, `${SUN} 01:00`], pp: 40, code: 95 };
  test.each(['camping', 'mixed'] as const)('[WX-WARN-NIGHT] %s: the title gives the stop and the hours', (stay) => {
    const f = factsOf([NIGHT], riding(100, '14:00', { trip: testTrip({ stay }) }));
    expect(statusOf(f)).toBe('warning');
    expect(answerOf(f).title).toBe("Thunderstorm possible at km 150 tonight, 22:00–01:00. Exact places and times can't be forecast.");
  });
  test('[WX-WARN-NIGHT] an indoor stay has no such warning, and the hours are not named as its reason', () => {
    const f = factsOf([NIGHT], riding(100, '14:00', { trip: testTrip({ stay: 'accommodation' }) }));
    expect(statusOf(f)).toBe('fine');
    expect(answerOf(f).title).not.toContain('Thunderstorm');
  });
  test("[WX-WARN-NIGHT] before the trip: day 1's night at day 1's stop", () => {
    const f = factsOf([{ km: 78, stamps: [`${SAT} 23:00`, `${SUN} 00:00`, `${SUN} 01:00`], pp: 40, code: 95 }], { now: '2026-10-16 20:00' });
    expect(f.ride.phase).toBe('before-trip');
    expect(statusOf(f)).toBe('warning');
    expect(answerOf(f).title).toBe("Thunderstorm possible at km 78 on the night of Sat 17 Oct, 22:00–01:00. Exact places and times can't be forecast.");
  });
  test('[WX-WARN-NIGHT] beyond 48 h it names the night and no hours', () => {
    const f = factsOf([{ km: 78, stamps: [`${SAT} 23:00`, `${SUN} 00:00`], pp: 40, code: 95 }], { now: '2026-10-14 20:00' }, { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 19:00', days: 8 });
    expect(answerOf(f).title).toBe("Thunderstorm possible at km 78 on the night of Sat 17 Oct. Exact places and times can't be forecast.");
  });
  test('[WX-WARN-NIGHT] after the ride, from now until tomorrow\'s departure at tonight\'s stop', () => {
    const m = riding(140, '19:30', { plan: { date: SAT, backToTodayAt: null } });
    const f = factsOf([{ km: 140, stamps: [`${SUN} 01:00`], pp: 40, code: 96 }], m);
    expect(f.ride.phase).toBe('after-ride');
    expect(statusOf(f)).toBe('warning');
    expect(answerOf(f).title).toBe("Thunderstorm possible at km 140 tonight, 00:00–01:00. Exact places and times can't be forecast.");
    const past = factsOf([{ km: 140, stamps: [`${SAT} 18:00`], pp: 40, code: 96 }], m);
    expect(statusOf(past)).toBe('fine');
    const morning = factsOf([{ km: 140, stamps: [`${SUN} 12:00`], pp: 40, code: 96 }], m);
    expect(answerOf(morning).title).not.toContain('tonight');
  });
  test('[WX-WARN-NIGHT] a storm before the arrival at the stop, and out of its band, does not count', () => {
    expect(statusOf(factsOf([{ km: 150, stamps: [`${SAT} 15:00`], pp: 40, code: 95 }], riding(100, '14:00')))).toBe('fine');
  });
  test('[WX-WARN-NIGHT] nightLow reports the thunderstorm hours', () => {
    const f = factsOf([NIGHT], riding(100, '14:00'));
    const n = nightLow(f, f.ride, f.baseline);
    expect(n.thunderHours).toEqual({ from: at(`${SAT} 22:00`), to: at(`${SUN} 01:00`) });
  });
  test('[WX-WARN-NIGHT] a forecast that ends in the night cannot say the night is quiet', () => {
    const f = factsOf([], riding(100, '14:00'), { until: `${SAT} 22:00` });
    const n = nightLow(f, f.ride, f.baseline);
    expect(n.known).toBe(false);
    expect(statusOf(f)).toBe('unknown');
    expect(answerOf(f).missing).toContain('weather');
  });
  test('[WX-WARN-NIGHT] an indoor stay does not need the night', () => {
    expect(statusOf(factsOf([], riding(100, '14:00', { trip: testTrip({ stay: 'accommodation' }) }), { until: `${SAT} 22:00` }))).toBe('fine');
  });
});

describe('action', () => {
  test('[WX-ACTION] gusts of 60 km/h on the ride: action; 59.9: not', () => {
    expect(statusOf(factsOf([allDay({ km: 40, gustKmh: 60 })]))).toBe('action');
    expect(statusOf(factsOf([allDay({ km: 40, gustKmh: 59.9 })]))).toBe('fine');
  });
  test('[WX-ACTION] gusts only count where the rider is then, and on the day\'s ride', () => {
    expect(statusOf(factsOf([{ km: 40, stamps: [`${SAT} 20:00`], gustKmh: 90 }]))).toBe('fine');
    expect(statusOf(factsOf([allDay({ km: 90, gustKmh: 90 })]))).toBe('fine');
  });
  test('[WX-ACTION] a heavy hour in a met band: action', () => {
    expect(statusOf(factsOf([{ km: 60, stamps: [`${SAT} 14:00`], pp: 70 }, { km: 60, stamps: [`${SAT} 15:00`], pp: 10, mm: 3 }], riding(60, '14:30')))).toBe('action');
  });
  test('[WX-HEAVY] 70% at 14:00 and 3 mm at 15:00 with T = 14:30: the card is action, with the heavy title', () => {
    const a = answerOf(factsOf([{ km: 60, stamps: [`${SAT} 14:00`], pp: 70 }, { km: 60, stamps: [`${SAT} 15:00`], pp: 10, mm: 3 }], riding(60, '14:30', { positions: [pos({ km: 58, at: `${SAT} 14:23` })] })));
    expect(a.status).toBe('action');
    expect(a.title).toContain('Heavy rain');
  });
  test('[WX-POSSIBLE] 40% with 4 mm stays fine: possible rain is no met point', () => {
    const f = factsOf([{ km: 70, stamps: [`${SAT} 15:00`], pp: 40, mm: 4 }], riding(60, '14:00'));
    expect(statusOf(f)).toBe('fine');
    const a = answerOf(f);
    expect(a.items.some((i) => i.label.includes('possible'))).toBe(true);
    expect(a.title).not.toContain('likely');
  });
  test('[WX-ACTION] a night\'s low of 0 °C at a camping stop: action; 0.1 °C or lodging: not', () => {
    const cold = (t: number): Spell => ({ km: 78, stamps: [`${SUN} 04:00`], t });
    expect(statusOf(factsOf([cold(0)]))).toBe('action');
    expect(statusOf(factsOf([cold(0.1)]))).toBe('fine');
    expect(statusOf(factsOf([cold(0)], { trip: testTrip({ stay: 'mixed' }) }))).toBe('action');
    expect(statusOf(factsOf([cold(0)], { trip: testTrip({ stay: 'accommodation' }) }))).toBe('fine');
  });
  test("[WX-ACTION] the night's low is the night's: a cold morning after the departure counts for nothing", () => {
    expect(statusOf(factsOf([{ km: 78, stamps: [`${SUN} 11:00`], t: -3 }]))).toBe('fine');
    const f = factsOf([{ km: 78, stamps: [`${SUN} 04:00`], t: -3 }]);
    expect(nightLow(f, f.ride, f.baseline).lowC).toBe(-3);
  });
  test("[WX-ACTION] before the trip: day 1's night at day 1's stop", () => {
    expect(statusOf(factsOf([{ km: 78, stamps: [`${SUN} 04:00`], t: -1 }], { now: '2026-10-16 20:00' }))).toBe('action');
    expect(statusOf(factsOf([{ km: 150, stamps: [`${SUN} 04:00`], t: -1 }], { now: '2026-10-16 20:00' }))).toBe('fine');
  });
  test("[WX-ACTION] a broken temperature is not the night's low", () => {
    const f = factsOf([{ km: 78, stamps: [`${SUN} 03:00`], t: Number.NaN }, { km: 78, stamps: [`${SUN} 04:00`], t: 5 }]);
    expect(nightLow(f, f.ride, f.baseline).lowC).toBeLessThanOrEqual(5);
    expect(Number.isFinite(nightLow(f, f.ride, f.baseline).lowC)).toBe(true);
  });
});

describe('fine', () => {
  test('[WX-FINE-LIGHT] likely light rain stays fine, with its window', () => {
    const f = factsOf([{ range: [40, 60], stamps: stamps(SAT, 9, 13), pp: 80, mm: 1 }]);
    expect(statusOf(f)).toBe('fine');
    const a = answerOf(f);
    expect(a.status).toBe('fine');
    expect(a.items[0]!.label).toContain('Rain likely');
    expect(a.items[0]!.status).toBe('fine');
  });
  test('[WX-TWO-NUMBERS] 93% with 0.0 mm: "Rain likely", the amount, fine; never one number', () => {
    const a = answerOf(factsOf([{ km: 40, stamps: stamps(SAT, 9, 12), pp: 93, mm: 0 }]));
    expect(a.status).toBe('fine');
    expect(a.title).toContain('Rain likely');
    expect(a.items[0]!.detail).toContain('under 0.1 mm/h (one model)');
    expect(a.items[0]!.detail).toContain('9 in 10 forecast scenarios');
  });
});

describe('hail', () => {
  test.each([[96, true], [99, true], [95, false], [97, false]])('[WX-HAIL] code %i: hail mentioned %s', (code, yes) => {
    const a = answerOf(factsOf([{ km: 40, stamps: stamps(SAT, 9, 12), pp: 60, code }]));
    expect(/hail/i.test(textOf(a))).toBe(yes);
  });
  test('[WX-HAIL] at night too', () => {
    const a = answerOf(factsOf([{ km: 78, stamps: [`${SUN} 01:00`], pp: 40, code: 99 }]));
    expect(/hail/i.test(textOf(a))).toBe(true);
  });
});

describe('the title', () => {
  const STORM: Spell = { km: 130, stamps: [`${SAT} 15:00`], pp: 60, code: 95 };
  const NIGHT_STORM: Spell = { km: 150, stamps: [`${SUN} 01:00`], pp: 60, code: 95 };
  const HERE: Spell = { km: 120, stamps: [`${SAT} 15:00`], pp: 70 };
  const HEAVY: Spell = { km: 140, stamps: [`${SAT} 16:00`], pp: 70, mm: 4 };
  const GUST: Spell = { km: 130, stamps: [`${SAT} 15:00`], gustKmh: 70 };
  const LOW: Spell = { km: 150, stamps: [`${SUN} 04:00`], t: -2 };
  const NEXT: Spell = { km: 140, stamps: [`${SAT} 16:00`], pp: 70 };
  const m = riding(120, '14:20');

  test('[WX-TITLE-ORDER] thunderstorm first, also before rain here', () => {
    expect(answerOf(factsOf([STORM, HERE, HEAVY, GUST, LOW], m)).title).toMatch(/^Thunderstorms possible/);
  });
  test('[WX-TITLE-ORDER] a thunderstorm at tonight\'s stop comes before rain here', () => {
    expect(answerOf(factsOf([NIGHT_STORM, HERE], m)).title).toMatch(/^Thunderstorm possible at km 150 tonight/);
  });
  test('[WX-TITLE-ORDER] then rain here now', () => {
    expect(answerOf(factsOf([HERE, HEAVY, GUST, LOW], m)).title).toMatch(/^Rain likely here/);
  });
  test('[WX-TITLE-ORDER] then heavy rain', () => {
    expect(answerOf(factsOf([HEAVY, GUST, LOW], m)).title).toMatch(/^Heavy rain/);
  });
  test('[WX-TITLE-ORDER] then gusts', () => {
    expect(answerOf(factsOf([GUST, LOW, NEXT], m)).title).toMatch(/^Gusts up to 70 km\/h/);
  });
  test('[WX-TITLE-ORDER] then the low', () => {
    expect(answerOf(factsOf([LOW, NEXT], m)).title).toMatch(/^Night's low about -2 °C at km 150/);
  });
  test('[WX-TITLE-ORDER] then the next window', () => {
    const a = answerOf(factsOf([NEXT], m));
    expect(a.title).toMatch(/^Rain likely/);
    expect(a.stamp).toEqual({ km: 140, at: a.stamp!.at });
    expect(stampLine(a.stamp, 120, BER)).toMatch(/^\+20 km · \d\d:\d[05]$/);
  });
  test('[WX-TITLE-ORDER] then the day\'s summary, which gives no all-clear', () => {
    const a = answerOf(factsOf([], m));
    expect(a.title).toMatch(/^Rain unlikely on today's ride/);
    expect(a.stamp).toBeNull();
  });
  test('[WX-TITLE-ORDER] not "here now" before the trip', () => {
    const home = pos({ km: 40, off: 200, at: '2026-10-16 15:00' });
    const f = factsOf([{ km: 40, stamps: ['2026-10-16 16:00'], pp: 90 }], { positions: [home], now: '2026-10-16 15:00' });
    expect(f.ride.phase).toBe('before-trip');
    expect(answerOf(f).title).not.toContain('here');
  });
  test('[WX-TITLE-ORDER] with no position there is no "here now"', () => {
    const f = factsOf([HERE], { now: `${SAT} 14:20` });
    expect(answerOf(f).title).not.toContain('here');
  });
  test('[WX-EXAMPLE] at km 125 at 14:20, likely until 15:00: the title, the stamp and fine', () => {
    const f = factsOf([{ range: [120, 137], stamps: [`${SAT} 14:00`, `${SAT} 15:00`], pp: 70, mm: 1 }], riding(125, '14:20'));
    const a = answerOf(f);
    expect(a.title).toBe('Rain likely here until about 15:00');
    expect(stampLine(a.stamp, 125, BER)).toBe('here · 14:20');
    expect(a.status).toBe('fine');
  });
  test('[WX-EXAMPLE] with no hour to say when it eases, it does not say', () => {
    const f = factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 70 }], riding(125, '14:20'), { until: `${SAT} 15:00` });
    expect(answerOf(f).title).toBe('Rain likely here');
  });
  test('[WX-EXAMPLE] with likely hours running on, the eases time moves with them', () => {
    const f = factsOf([{ range: [120, 137], stamps: stamps(SAT, 15, 17), pp: 70 }], riding(125, '14:20'));
    expect(answerOf(f).title).toBe('Rain likely here until about 17:00');
  });
  test('[WX-EXAMPLE] an unknown next hour says no "until"', () => {
    const f = factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 70 }, { range: [120, 137], stamps: [`${SAT} 16:00`], pp: Number.NaN }], riding(125, '14:20'));
    expect(answerOf(f).title).toBe('Rain likely here');
  });
});

describe('what the card shows, in order', () => {
  test('[WX-TITLE-ORDER] wait or go, windows, possible rain, wind and the low, then Shelter', () => {
    const wg: WaitOrGo = { where: 'here', d: at(`${SAT} 15:00`), savedMin: 35, arrivalNow: at(`${SAT} 16:35`), arrivalWait: at(`${SAT} 17:15`), lines: ['Waiting could save about 35 min.'] };
    const a = answerOf(factsOf([{ km: 40, stamps: stamps(SAT, 9, 12), pp: 70 }, { km: 60, stamps: stamps(SAT, 10, 13), pp: 30 }]), wg);
    const labels = a.items.map((i) => i.label);
    expect(labels[0]).toBe('Waiting could save about 35 min.');
    expect(labels[1]).toContain('Rain likely');
    expect(labels[2]).toContain('Rain possible');
    expect(labels[3]).toMatch(/wind/i);
    expect(labels[4]).toMatch(/Night's low/);
    expect(labels[labels.length - 1]).toBe('Raining anyway? Shelter');
  });
});

describe('stale', () => {
  const NOW = `${SAT} 12:00`;
  test('[WX-STALE] exactly 12 h is not stale; a moment more is', () => {
    const f = forecastOf(flatRoute(100), [], { fetchedAt: `${SAT} 00:00` });
    expect(isStale(f, at(`${SAT} 12:00`))).toBe(false);
    expect(isStale(f, new Date(at(`${SAT} 12:00`).getTime() + 1000))).toBe(true);
  });
  test('[WX-STALE] no fetch time or no clock can\'t read as fresh', () => {
    const f = forecastOf(flatRoute(100), [], { fetchedAt: `${SAT} 00:00` });
    expect(isStale({ ...f, fetchedAt: new Date(Number.NaN) }, at(NOW))).toBe(true);
    expect(isStale(f, new Date(Number.NaN))).toBe(true);
  });
  test('[WX-STALE] the card says so and keeps its windows', () => {
    const f = factsOf([{ km: 70, stamps: stamps(SAT, 12, 15), pp: 80 }], riding(60, '13:00'), { fetchedAt: '2026-10-16 22:00' });
    const a = answerOf(f);
    expect(a.freshness.stale).toBe(true);
    expect(a.basis.join(' ')).toContain('stale');
    expect(a.items.some((i) => i.label.includes('Rain likely'))).toBe(true);
    const fresh = answerOf(factsOf([{ km: 70, stamps: stamps(SAT, 12, 15), pp: 80 }], riding(60, '13:00'), { fetchedAt: `${SAT} 11:00` }));
    expect(fresh.freshness.stale).toBe(false);
    expect(fresh.basis.join(' ')).not.toContain('stale');
  });
});

describe('temperatures', () => {
  test('[WX-RAW] shown temperatures are raw, with no +1 °C', () => {
    const f = factsOf([allDay({ range: [0, 80], t: 19 }), { km: 78, stamps: stamps(SUN, 0, 8), t: 7 }]);
    const text = textOf(answerOf(f));
    expect(text).toContain('19 °C');
    expect(text).not.toContain('20 °C');
    expect(text).toContain("Night's low about 7 °C");
    expect(text).not.toContain('8 °C');
    expect(nightLow(f, f.ride, f.baseline).lowC).toBe(7);
  });
});

describe('wind', () => {
  test('[WX-WIND] 10 m/s from 180° on a route bearing 180° is +10; on bearing 0° it is -10, a tailwind', () => {
    expect(headwind(10, 180, 180)).toBeCloseTo(10, 9);
    expect(headwind(10, 180, 0)).toBeCloseTo(-10, 9);
    expect(headwind(10, 90, 0)).toBeCloseTo(0, 9);
  });
  test('[WX-WIND] the card says head or tail, with gusts apart. The test route runs north', () => {
    const head = textOf(answerOf(factsOf([allDay({ range: [0, 80], windMs: 5, windFrom: 0, gustKmh: 40 })])));
    expect(head).toContain('Headwind about 5 m/s');
    expect(head).toContain('gusts up to 40 km/h');
    const tail = textOf(answerOf(factsOf([allDay({ range: [0, 80], windMs: 5, windFrom: 180 })])));
    expect(tail).toContain('Tailwind about 5 m/s');
  });
});

describe('the basis line', () => {
  const run = (model: string, t: string): ModelRun => ({ model, run: at(t), availableAt: at(t) });
  const base = (runs: ModelRun[], country = 'DE') => answerOf(factsOf([], riding(60, '12:00', { country }), { fetchedAt: `${SAT} 11:20`, runs })).basis;

  test('[WX-BASIS] the fetch, the model run, attribution, warnings and the detail range', () => {
    const b = base([run('ICON-D2', `${SAT} 10:00`)]);
    expect(b).toContain('Open-Meteo forecast fetched 11:20 · model run 10:00');
    expect(b).toContain('Weather data by Open-Meteo.com');
    expect(b).toContain('Official weather warnings are not included.');
    expect(b).toContain('30-minute detail to Monday 11:20, day parts to Thursday');
  });
  test('[WX-BASIS] the oldest latest run among the models that matter', () => {
    const b = base([run('ICON-D2', `${SAT} 07:00`), run('ICON-D2', `${SAT} 10:00`), run('AROME France HD', `${SAT} 09:00`), run('MET Nordic', `${SAT} 03:00`)], 'FR');
    expect(b).toContain('Open-Meteo forecast fetched 11:20 · model run 09:00');
  });
  test('[WX-BASIS] no run that matters: no run is claimed; a broken run is none', () => {
    expect(base([run('MET Nordic', `${SAT} 03:00`)])).toContain('Open-Meteo forecast fetched 11:20');
    expect(base([{ model: 'ICON-D2', run: new Date(Number.NaN), availableAt: new Date(Number.NaN) }])).toContain('Open-Meteo forecast fetched 11:20');
  });
  test('[WX-BASIS] an older fetch names its day', () => {
    const b = answerOf(factsOf([], riding(60, '12:00'), { fetchedAt: '2026-10-16 11:20' })).basis;
    expect(b).toContain('Open-Meteo forecast fetched Fri 16 Oct, 11:20');
  });
});

describe('beyond the forecast', () => {
  test('[WX-SEASONAL] no forecast, a baseline: "seasonal estimate", raw figures, no missing, not fine', () => {
    const a = answerOf(factsOf([], {}, {}, { forecast: null, baseline: BASELINE }));
    expect(textOf(a)).toContain('seasonal estimate');
    expect(textOf(a)).toContain('2021–2025');
    expect(a.missing).toEqual([]);
    expect(a.status).toBe('unknown');
  });
  test('[WX-SEASONAL] neither forecast nor baseline: "unknown", missing has weather', () => {
    const a = answerOf(factsOf([], {}, {}, { forecast: null, baseline: null }));
    expect(a.status).toBe('unknown');
    expect(a.title.toLowerCase()).toContain('unknown');
    expect(a.missing).toContain('weather');
  });
  test('[WX-SEASONAL] a baseline of other months or broken figures is no baseline', () => {
    const other: Baseline = { years: 'x', points: [{ ...BASELINE.points[0]!, month: 3 }, { ...BASELINE.points[0]!, km: Number.NaN }] };
    const a = answerOf(factsOf([], {}, {}, { forecast: null, baseline: other }));
    expect(a.missing).toContain('weather');
  });
  test('[WX-SEASONAL] a forecast that runs out before the rider arrives: the rest is seasonal, and never fine', () => {
    const f = factsOf([], {}, { until: `${SAT} 10:00` }, { baseline: BASELINE });
    expect(statusOf(f)).toBe('unknown');
    expect(textOf(answerOf(f))).toContain('seasonal estimate');
    expect(answerOf(f).missing).toEqual([]);
  });
  test('[WX-SEASONAL] with no baseline either, missing has weather and the card names the kilometre', () => {
    const f = factsOf([], {}, { until: `${SAT} 10:00` });
    const a = answerOf(f);
    expect(a.status).toBe('unknown');
    expect(a.missing).toContain('weather');
    expect(a.title).toMatch(/No forecast from km \d+/);
  });
  test('[WX-SEASONAL] what the forecast did see still stands: a storm on the covered part warns', () => {
    const f = factsOf([{ km: 10, stamps: [`${SAT} 09:00`], pp: 40, code: 95 }], {}, { until: `${SAT} 10:00` });
    const a = answerOf(f);
    expect(a.status).toBe('warning');
    expect(a.missing).toContain('weather');
  });
  test('[WX-SEASONAL] a stretch of the ride with no grid points is not calm', () => {
    const f = factsOf([], {}, { onlyKms: [0, 10, 20] });
    expect(statusOf(f)).toBe('unknown');
    expect(answerOf(f).missing).toContain('weather');
  });
  test('[WX-SEASONAL] a grid point with only broken hours is not calm', () => {
    const f = factsOf([{ km: 40, stamps: stamps(SAT, 1, 23), pp: Number.NaN }]);
    expect(statusOf(f)).toBe('unknown');
  });
  test('[WX-SEASONAL] an empty forecast is no forecast', () => {
    const c = momentOf();
    const f = factsOf([], {}, {}, { forecast: { fetchedAt: at(`${SAT} 07:00`), runs: [], grid: [], has15: false } });
    expect(answerOf(f).status).toBe('unknown');
    expect(answerOf(f).missing).toContain('weather');
    expect(c.ride.phase).toBe('before-ride');
  });
  test('[WX-SEASONAL] a broken first hour or point does not stop the card reading the rest', () => {
    const c = momentOf();
    const forecast = forecastOf(c.trip.route, [{ km: 78, stamps: [`${SAT} 13:00`], pp: 40, code: 95 }]);
    forecast.grid.forEach((g) => g.hours.unshift({ ...g.hours[0]!, at: new Date(Number.NaN), pp: 100, gustMs: Number.NaN }));
    forecast.grid.unshift({ km: Number.NaN, lat: Number.NaN, lon: Number.NaN, hours: [] });
    expect(answerOf(factsOf([], {}, {}, { forecast })).status).toBe('warning');
  });
  test('[WX-ACTION] a broken gust is not a calm one', () => {
    expect(statusOf(factsOf([allDay({ km: 40, gustMs: Number.NaN })]))).toBe('unknown');
    expect(statusOf(factsOf([allDay({ km: 40, gustMs: Infinity })]))).toBe('unknown');
  });
  test('[WX-SEASONAL] no departure date: no windows, the card says why', () => {
    const f = factsOf([{ km: 10, stamps: stamps(SAT, 7, 12), pp: 90 }], { trip: testTrip({ departureDate: null }) });
    expect(weatherWindows(f)).toEqual([]);
    const a = answerOf(f);
    expect(a.status).toBe('unknown');
    expect(a.missing).toEqual(['date']);
    expect(a.title).toContain('departure date');
  });
  test.each([
    ['no clock', { now: new Date(Number.NaN) }],
    ['no usable speed', { trip: testTrip({ flatKph: Number.NaN }) }],
  ])('[WX-SEASONAL] %s: an honest unknown, no throw', (_name, m) => {
    const f = factsOf([{ km: 10, stamps: stamps(SAT, 7, 12), pp: 90 }], m);
    const a = answerOf(f);
    expect(a.status).toBe('unknown');
    expect(a.items).toEqual([]);
    expect(a.basis.length).toBeGreaterThan(0);
  });
  test('[WX-SEASONAL] an invalid fetch time reads as no forecast', () => {
    const c = momentOf();
    const forecast = { ...forecastOf(c.trip.route, []), fetchedAt: new Date(Number.NaN) };
    const a = answerOf(factsOf([], {}, {}, { forecast }));
    expect(a.status).toBe('unknown');
    expect(a.missing).toContain('weather');
  });
});

describe('broken figures', () => {
  const INDOOR = { trip: testTrip({ stay: 'accommodation' as const }) };
  test('[WX-SEASONAL] a hole in the middle of the grid is not calm, also for an indoor stay', () => {
    expect(statusOf(factsOf([], INDOOR, { onlyKms: [0, 10, 50, 60, 70, 78] }))).toBe('unknown');
    expect(statusOf(factsOf([], INDOOR, { onlyKms: [0, 10, 20, 30, 40, 50, 60, 70, 78] }))).toBe('fine');
  });
  test('[WX-SEASONAL] grid points that stop short of the day\'s stop are not calm, also for an indoor stay', () => {
    expect(statusOf(factsOf([], INDOOR, { onlyKms: [0, 10, 20] }))).toBe('unknown');
  });
  test("[WX-ACTION] a broken temperature in the night means the night isn't known", () => {
    const f = factsOf([{ km: 78, stamps: [`${SUN} 03:00`], t: Number.NaN }]);
    expect(nightLow(f, f.ride, f.baseline).known).toBe(false);
    expect(statusOf(f)).toBe('unknown');
  });
  test("[WX-ACTION] a partly seen night: the seen low stands beside the baseline's, the colder of the two", () => {
    const f = factsOf([{ km: 78, stamps: [`${SAT} 22:00`], t: -1 }], {}, { until: `${SAT} 23:00` }, { baseline: BASELINE });
    const n = nightLow(f, f.ride, f.baseline);
    expect(n.known).toBe(false);
    expect(n.seasonal).toBe(true);
    expect(n.lowC).toBe(-1);
  });
  test('[WX-BASIS] runs in any order: the latest of each model', () => {
    const run = (t: string): ModelRun => ({ model: 'ICON-D2', run: at(t), availableAt: at(t) });
    const b = answerOf(factsOf([], riding(60, '12:00'), { fetchedAt: `${SAT} 11:20`, runs: [run(`${SAT} 10:00`), run(`${SAT} 07:00`)] })).basis;
    expect(b).toContain('Open-Meteo forecast fetched 11:20 · model run 10:00');
  });
  test('[WX-HONEST] gusts beyond 48 h name the day, not the time; within 48 h, about a time', () => {
    const far = factsOf([allDay({ km: 40, gustKmh: 70 })], { now: '2026-10-14 08:00' }, { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00' });
    expect(answerOf(far).title).toBe('Gusts up to 70 km/h near km 40, Saturday');
    expect(answerOf(factsOf([allDay({ km: 40, gustKmh: 70 })])).title).toMatch(/^Gusts up to 70 km\/h near km 40, about \d\d:\d[05]$/);
  });
  test('[WX-HONEST] when it eases beyond 48 h, the title does not say when', () => {
    const f = factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 70 }], riding(125, '14:20'), { fetchedAt: '2026-10-15 14:30' });
    expect(answerOf(f).title).toBe('Rain likely here');
  });
  test('[WX-TITLE-ORDER] the next window comes before what lies beyond the forecast', () => {
    const f = factsOf([{ km: 10, stamps: [`${SAT} 09:00`], pp: 70 }], {}, { until: `${SAT} 10:00` });
    expect(answerOf(f).title).toMatch(/^Rain likely/);
    expect(answerOf(f).status).toBe('unknown');
  });
  test('[WX-SEASONAL] a baseline point with broken figures is no estimate: "NaN" never reaches the card', () => {
    const broken: Baseline = { years: 'x', points: [{ ...BASELINE.points[0]!, meanHighC: Number.NaN }] };
    const a = answerOf(factsOf([], {}, {}, { forecast: null, baseline: broken }));
    expect(textOf(a)).not.toContain('NaN');
    expect(a.missing).toContain('weather');
  });
  test('[WX-SEASONAL] a position with no coordinates finds no "here"', () => {
    const f = factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 70 }], riding(125, '14:20'));
    expect(answerOf({ ...f, position: { ...f.position!, lat: Number.NaN } }).title).not.toContain('here');
  });
  test('[WX-TWO-NUMBERS] a thunderstorm window gives its amount too', () => {
    const a = answerOf(factsOf([{ km: 40, stamps: stamps(SAT, 9, 12), pp: 60, mm: 3, code: 95 }]));
    expect(a.items[0]!.detail).toContain('3.0 mm/h (one model)');
  });
});

describe('honesty', () => {
  const scenes: [string, WeatherFacts][] = [
    ['rain', factsOf([{ range: [40, 60], stamps: stamps(SAT, 9, 13), pp: 80, mm: 1 }])],
    ['storm', factsOf([{ km: [60, 70], stamps: stamps(SAT, 11, 14), pp: 40, code: 96 }])],
    ['here', factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 70 }], riding(125, '14:20'))],
    ['calm', factsOf([])],
    ['seasonal', factsOf([], {}, {}, { forecast: null, baseline: BASELINE })],
    ['nothing', factsOf([], {}, {}, { forecast: null })],
    ['beyond 48 h', factsOf([{ km: 20, stamps: stamps(SAT, 9, 11), pp: 80 }], { now: '2026-10-14 08:00' }, { from: '2026-10-14 01:00', fetchedAt: '2026-10-14 07:00', days: 8 })],
  ];
  test.each(scenes)('[WX-HONEST] %s: no banned word, no radar, no live data, no all-clear', (_n, f) => {
    const text = textOf(answerOf(f));
    expect(bannedHits(text, true)).toEqual([]);
    expect(text).not.toMatch(/radar/i);
  });
  test.each(scenes)('[WX-HONEST] %s: rain times on the card lie on 5-minute steps', (_n, f) => {
    const a = answerOf(f);
    const shown = [a.title, ...a.items.flatMap((i) => [i.label, i.detail ?? ''])].join(' | ');
    for (const m of shown.matchAll(/\b\d\d:(\d\d)\b/g)) expect(Number(m[1]) % 5).toBe(0);
  });
  test('[WX-HONEST] no hour beyond 48 h', () => {
    const a = answerOf(scenes[6]![1]);
    expect(a.items[0]!.label).not.toMatch(/\d\d:\d\d/);
    expect(a.items[0]!.detail ?? '').not.toMatch(/\d\d:\d\d/);
    expect(a.stamp).not.toBeNull();
    expect(stampLine(a.stamp, 0, BER)).toBe('+20 km');
  });
  test('[WX-HONEST] the scenario line reads byte for byte', () => {
    const a = answerOf(factsOf([{ range: [120, 137], stamps: [`${SAT} 15:00`], pp: 67 }], riding(125, '14:20')));
    expect(a.detail).toContain('7 in 10 forecast scenarios show rain here around 14:30.');
  });
  test('[WX-HONEST] no second thunderstorm-free claim: a calm card never says thunder at all', () => {
    expect(textOf(answerOf(factsOf([]))).toLowerCase()).not.toContain('thunder');
  });
});

describe('the stamp', () => {
  test('[WX-EXAMPLE] an invalid or missing stamp never throws', () => {
    expect(stampLine(null, 0, BER)).toBeNull();
    expect(stampLine({ km: 10, at: new Date(Number.NaN) }, 0, BER)).toBe('+10 km');
  });
});

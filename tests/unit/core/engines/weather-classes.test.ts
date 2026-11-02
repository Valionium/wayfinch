import { describe, expect, test } from 'vitest';
import { coversHour, detailFor, fifteenMinuteHours, hourClass, modelsForRoute } from '../../../../src/core/engines/weather-classes.ts';
import type { GridHour } from '../../../../src/core/types.ts';
import { at } from '../../../fixtures/build.ts';

const hour = (o: Partial<GridHour> = {}): GridHour => ({ at: at('2026-10-17 15:00'), t: 12, rh: 60, ghi: 0, pp: 0, mm: 0, code: 0, windMs: 2, windFrom: 180, gustMs: 5, ...o });

describe('rain classes', () => {
  test('[WX-CLASS] 50% is likely, 49% possible, 20% possible, 19% unlikely', () => {
    expect(hourClass(hour({ pp: 50 })).cls).toBe('likely');
    expect(hourClass(hour({ pp: 49 })).cls).toBe('possible');
    expect(hourClass(hour({ pp: 20 })).cls).toBe('possible');
    expect(hourClass(hour({ pp: 19 })).cls).toBe('unlikely');
    expect(hourClass(hour({ pp: 19 })).known).toBe(true);
  });
  test('[WX-CLASS] 2.4 mm is not heavy, 2.5 mm is', () => {
    expect(hourClass(hour({ mm: 2.4 })).heavy).toBe(false);
    expect(hourClass(hour({ mm: 2.5 })).heavy).toBe(true);
  });
  test('[WX-CLASS] codes 80-82 are showers, 79 and 83 not', () => {
    for (const code of [80, 81, 82]) expect(hourClass(hour({ code })).showers).toBe(true);
    for (const code of [79, 83]) expect(hourClass(hour({ code })).showers).toBe(false);
  });
  test('[WX-CLASS] codes 95, 96, 97, 99 are a thunderstorm, 98 and 94 not', () => {
    for (const code of [95, 96, 97, 99]) expect(hourClass(hour({ code })).thunder).toBe(true);
    for (const code of [98, 94]) expect(hourClass(hour({ code })).thunder).toBe(false);
  });
  test.each([[Number.NaN], [Infinity], [-1], [101], [null]])('[WX-CLASS] a chance of %s is not known, and never counts as a real class', (pp) => {
    const c = hourClass(hour({ pp }));
    expect(c.known).toBe(false);
    expect(c.cls).not.toBe('likely');
  });
  test('[WX-CLASS] broken amounts and codes are not known; a storm code with no chance still is a storm', () => {
    expect(hourClass(hour({ pp: 10, mm: Number.NaN })).known).toBe(false);
    expect(hourClass(hour({ pp: 10, mm: Number.NaN })).heavy).toBe(false);
    expect(hourClass(hour({ pp: 10, mm: -0.5 })).known).toBe(false);
    expect(hourClass(hour({ pp: 10, code: Number.NaN })).known).toBe(false);
    expect(hourClass(hour({ pp: null, code: 95 })).thunder).toBe(true);
  });
});

describe('hour stamps', () => {
  test('[WX-STAMP] the hour stamped 15:00 covers 14:00 to 15:00', () => {
    const c = coversHour(at('2026-10-17 15:00'));
    expect(c.from).toEqual(at('2026-10-17 14:00'));
    expect(c.to).toEqual(at('2026-10-17 15:00'));
  });
});

describe('detail by range', () => {
  const fetched = at('2026-10-14 11:00');
  const after = (h: number, s = 0): Date => new Date(fetched.getTime() + h * 3_600_000 + s * 1000);
  test('[WX-DETAIL] half hours to 48 h, day parts to day 5, then trend, then the seasonal estimate', () => {
    expect(detailFor(after(1), fetched)).toBe('30min');
    expect(detailFor(after(48), fetched)).toBe('30min');
    expect(detailFor(after(48, 1), fetched)).toBe('daypart');
    expect(detailFor(after(120), fetched)).toBe('daypart');
    expect(detailFor(after(120, 1), fetched)).toBe('trend');
    expect(detailFor(after(16 * 24), fetched)).toBe('trend');
    expect(detailFor(after(16 * 24, 1), fetched)).toBe('seasonal');
  });
  test('[WX-DETAIL] an invalid date never reads as half-hour detail', () => {
    expect(detailFor(new Date(Number.NaN), fetched)).toBe('seasonal');
    expect(detailFor(after(1), new Date(Number.NaN))).toBe('seasonal');
  });
});

describe('models that matter', () => {
  const p = (lon: number) => ({ lat: 52, lon });
  const of = (country: string, lon = 10): string[] => modelsForRoute([p(lon)], () => country);
  test('[WX-MODELS] each country has its models', () => {
    for (const c of ['DE', 'CZ', 'AT', 'CH']) expect(of(c)).toEqual(['ICON-D2']);
    expect(of('FR')).toEqual(['ICON-D2', 'AROME France HD']);
    for (const c of ['NL', 'BE', 'LU']) expect(of(c)).toEqual(['KNMI HARMONIE-AROME']);
    expect(of('DK')).toEqual(['MET Nordic']);
  });
  test('[WX-MODELS] Poland at 20.2 E reads ICON-D2, at 20.4 E DMI HARMONIE-AROME', () => {
    expect(of('PL', 20.2)).toEqual(['ICON-D2']);
    expect(of('PL', 20.4)).toEqual(['DMI HARMONIE-AROME']);
  });
  test('[WX-MODELS] a route through several countries lists each model once, in route order', () => {
    const route = [p(8), p(8.1), p(8.2), p(8.3)];
    const country = (q: { lon: number }): string => (q.lon < 8.1 ? 'DE' : q.lon < 8.3 ? 'NL' : 'FR');
    expect(modelsForRoute(route, country)).toEqual(['ICON-D2', 'KNMI HARMONIE-AROME', 'AROME France HD']);
  });
  test.each(['constructor', '__proto__', 'toString', 'IT', ''])('[WX-MODELS] country %s has no model and does not throw', (c) => {
    expect(of(c)).toEqual([]);
  });
  test('[WX-MODELS] a point with no coordinates adds nothing', () => {
    expect(modelsForRoute([{ lat: Number.NaN, lon: Number.NaN }, p(10)], () => 'DE')).toEqual(['ICON-D2']);
  });
  test('[WX-ONSET-15] 15-minute rain: 48 h in the ICON-D2-only rows, 6 h in France, none elsewhere', () => {
    for (const c of ['DE', 'CZ', 'AT', 'CH']) expect(fifteenMinuteHours(c, 10)).toBe(48);
    expect(fifteenMinuteHours('PL', 20.2)).toBe(48);
    expect(fifteenMinuteHours('PL', 20.4)).toBe(0);
    expect(fifteenMinuteHours('FR', 3)).toBe(6);
    for (const c of ['NL', 'BE', 'LU', 'DK', 'constructor', '__proto__']) expect(fifteenMinuteHours(c, 5)).toBe(0);
    expect(fifteenMinuteHours('PL', Number.NaN)).toBe(0);
  });
});

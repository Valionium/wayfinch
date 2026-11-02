import { getPosition } from 'suncalc';
import { expect, test } from 'vitest';
import { arrivalStatus, daylightLeft, fineLimit, sunFromSuncalc } from '../../../../src/core/engines/daylight.ts';
import type { SunTimes } from '../../../../src/core/types.ts';
import { at, sun } from '../../../fixtures/build.ts';
import { withDeviceZone } from '../../../fixtures/zones.ts';

const SAT = '2026-10-17';
const BERLIN = 'Europe/Berlin';
const sat = (spec: Parameters<typeof sun>[0] = {}): SunTimes => sun(spec)(49, 8.4, SAT);
const sunTomorrow = (spec: Parameters<typeof sun>[0] = {}): SunTimes => sun(spec)(49, 8.4, '2026-10-18');
const t = (hms: string): Date => at(`${SAT} ${hms}`);
const status = (hms: string, ridingMin = 60) => arrivalStatus(t(hms), sat(), ridingMin, BERLIN);

test('[D-STATUS] sunset 18:42, dusk 19:17, 60 min of riding', () => {
  expect(status('18:12:00')).toEqual({ status: 'fine', line: null });
  expect(status('18:12:01')).toEqual({ status: 'action', line: 'lights on from 18:42' });
  expect(status('19:16:59')).toEqual({ status: 'action', line: 'lights on from 18:42' });
  expect(status('19:17:00')).toEqual({ status: 'warning', line: 'dark from 19:17' });
});

test('[D-STATUS] the line is on the place\'s own clock', () => {
  expect(arrivalStatus(t('18:50'), sat(), 60, 'Europe/Lisbon').line).toBe('lights on from 17:42');
});

test('[D-MARGIN] the margin is 30 min up to 200 min of riding, and 39.5 min for 263.4 min', () => {
  const sunset = t('18:42').getTime();
  const margin = (ridingMin: number): number => (sunset - fineLimit(sat(), ridingMin)!.getTime()) / 60_000;
  expect(margin(10)).toBe(30);
  expect(margin(200)).toBe(30);
  expect(margin(201)).toBeCloseTo(30.15, 9);
  expect(margin(263.4)).toBeCloseTo(39.5, 1);
});

test('[D-MARGIN] no sunset, no limit', () => {
  expect(fineLimit(sat({ sunset: null, dusk: null, lightAllNight: true }), 60)).toBeNull();
});

test('[D-MIDNIGHT] on a Saturday ride, an arrival at 00:48 Sunday is judged against Saturday\'s dusk: warning', () => {
  const r = arrivalStatus(at('2026-10-18 00:48'), sat(), 400, BERLIN);
  expect(r).toEqual({ status: 'warning', line: 'dark from 19:17' });
});

test('[D-FAR-NORTH] no sunset: light all night, fine', () => {
  const white = sat({ sunset: null, dusk: null, dawn: null, sunrise: null, lightAllNight: true });
  expect(arrivalStatus(t('23:30'), white, 60, BERLIN)).toEqual({ status: 'fine', line: 'light all night' });
  expect(daylightLeft(t('23:30'), white, white, BERLIN)).toBe('light all night');
});

test('[D-FAR-NORTH] a sunset but no civil dusk: past the fine limit is action, never warning', () => {
  const late = sat({ sunset: '22:40', dusk: null, dawn: null });
  expect(arrivalStatus(t('22:10'), late, 60, BERLIN).status).toBe('fine');
  expect(arrivalStatus(t('22:10:01'), late, 60, BERLIN)).toEqual({ status: 'action', line: 'lights on from 22:40' });
  expect(arrivalStatus(t('23:59'), late, 60, BERLIN).status).toBe('action');
  expect(arrivalStatus(at('2026-10-18 01:30'), late, 60, BERLIN).status).toBe('action');
});

test('[D-FAR-NORTH] a day the sun never rises reads dark, never fine', () => {
  const polar = sat({ sunset: null, sunrise: null, dusk: null, dawn: null });
  expect(arrivalStatus(t('12:00'), polar, 60, BERLIN)).toEqual({ status: 'warning', line: 'dark all day' });
  const twilight = sat({ sunset: null, sunrise: null, dawn: '10:00', dusk: '13:00' });
  expect(arrivalStatus(t('12:00'), twilight, 60, BERLIN)).toEqual({ status: 'action', line: 'lights on all day' });
  expect(arrivalStatus(t('13:00'), twilight, 60, BERLIN)).toEqual({ status: 'warning', line: 'dark from 13:00' });
});

test('[D-LEFT] the minutes left run from now to sunset', () => {
  expect(daylightLeft(t('15:12'), sat(), sunTomorrow(), BERLIN)).toBe('3 h 30 min of daylight left');
  expect(daylightLeft(t('18:20'), sat(), sunTomorrow(), BERLIN)).toBe('22 min of daylight left');
  expect(daylightLeft(t('18:41:30'), sat(), sunTomorrow(), BERLIN)).toBe('0 min of daylight left');
  expect(daylightLeft(t('18:42'), sat(), sunTomorrow(), BERLIN)).toBe('0 min of daylight left');
});

test('[D-LEFT] before sunrise it counts from sunrise and says so', () => {
  expect(daylightLeft(t('06:00'), sat(), sunTomorrow(), BERLIN)).toBe('10 h 47 min of daylight from sunrise at 07:55');
});

test('[D-LEFT] after sunset: the sun set at 18:42, first light tomorrow 07:20', () => {
  expect(daylightLeft(t('18:42:01'), sat(), sunTomorrow(), BERLIN)).toBe('The sun set at 18:42. First light tomorrow 07:20.');
  expect(daylightLeft(t('22:00'), sat(), sunTomorrow(), BERLIN)).toBe('The sun set at 18:42. First light tomorrow 07:20.');
});

test('[D-LEFT] tomorrow without a dawn falls back to its sunrise, and without either says only the sunset', () => {
  expect(daylightLeft(t('22:00'), sat(), sunTomorrow({ dawn: null }), BERLIN)).toBe('The sun set at 18:42. First light tomorrow 07:55.');
  expect(daylightLeft(t('22:00'), sat(), sunTomorrow({ dawn: null, sunrise: null }), BERLIN)).toBe('The sun set at 18:42.');
});

const KARLSRUHE = { lat: 49.0069, lon: 8.4037 };
const rad = Math.PI / 180;

/** The sun's true altitude in degrees, without refraction, by the NOAA low-precision formulas: a check apart from suncalc. */
function trueAltitude(when: Date, lat: number, lon: number): number {
  const jd = when.getTime() / 86_400_000 + 2440587.5;
  const c = (jd - 2451545) / 36525;
  const l0 = (280.46646 + c * (36000.76983 + c * 0.0003032)) % 360;
  const m = 357.52911 + c * (35999.05029 - 0.0001537 * c);
  const centre = Math.sin(m * rad) * (1.914602 - c * (0.004817 + 0.000014 * c)) + Math.sin(2 * m * rad) * (0.019993 - 0.000101 * c) + Math.sin(3 * m * rad) * 0.000289;
  const lambda = l0 + centre - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * c) * rad);
  const eps = 23.439291 - 0.0130042 * c + 0.00256 * Math.cos((125.04 - 1934.136 * c) * rad);
  const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const ra = Math.atan2(Math.cos(eps * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad));
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545);
  const h = (gmst + lon) * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(h)) / rad;
}

/*
 * The plan reads the altitudes through suncalc's getPosition. Version 2.1.1, the pinned one, returns the apparent altitude
 * from getPosition, with 0.484 degrees of refraction added, while its sunset and dusk stay defined by the true altitude.
 * So the same thresholds (within 0.2 degrees of -0.833 and -6) are asserted on the true altitude: once from an independent
 * formula, and once from getPosition with that refraction taken back out.
 */
const REFRACTION_AT_HORIZON = 0.484;

test('[D-SUNCALC] Karlsruhe, 17 Oct 2026: sunset before dusk, at the sun altitudes of -0.833 and -6 degrees', () => {
  const s = sunFromSuncalc(KARLSRUHE.lat, KARLSRUHE.lon, SAT);
  expect(s.lightAllNight).toBe(false);
  expect(s.sunset!.getTime()).toBeLessThan(s.dusk!.getTime());
  expect(s.sunrise!.getTime()).toBeLessThan(s.sunset!.getTime());
  expect(s.dawn!.getTime()).toBeLessThan(s.sunrise!.getTime());
  expect(Math.abs(trueAltitude(s.sunset!, KARLSRUHE.lat, KARLSRUHE.lon) - -0.833)).toBeLessThan(0.2);
  expect(Math.abs(trueAltitude(s.dusk!, KARLSRUHE.lat, KARLSRUHE.lon) - -6)).toBeLessThan(0.2);
  const reading = (d: Date): number => getPosition(d, KARLSRUHE.lat, KARLSRUHE.lon).altitude - REFRACTION_AT_HORIZON;
  expect(Math.abs(reading(s.sunset!) - -0.833)).toBeLessThan(0.2);
  expect(Math.abs(reading(s.dusk!) - -6)).toBeLessThan(0.2);
  // The riding date's own evening: 18:3x in Karlsruhe.
  expect(s.sunset!.toISOString().slice(0, 10)).toBe(SAT);
});

test('[D-SUNCALC] 70 N on 21 June: light all night. 62 N on 21 June: a sunset but no dusk', () => {
  const far = sunFromSuncalc(70, 20, '2026-06-21');
  expect(far).toEqual({ dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: true });
  const near = sunFromSuncalc(62, 10, '2026-06-21');
  expect(near.lightAllNight).toBe(false);
  expect(near.sunset).not.toBeNull();
  expect(near.dusk).toBeNull();
});

test('[D-SUNCALC] 70 N on 21 December: the sun never rises, and that is not light all night', () => {
  expect(sunFromSuncalc(70, 20, '2026-12-21').lightAllNight).toBe(false);
  expect(sunFromSuncalc(70, 20, '2026-12-21').sunset).toBeNull();
});

test('[D-SUNCALC] the result is the same under TZ=Pacific/Kiritimati', () => {
  const here = sunFromSuncalc(KARLSRUHE.lat, KARLSRUHE.lon, SAT);
  const there = withDeviceZone('Pacific/Kiritimati', () => sunFromSuncalc(KARLSRUHE.lat, KARLSRUHE.lon, SAT));
  expect(here.sunset).not.toBeNull();
  expect(there).toEqual(here);
});

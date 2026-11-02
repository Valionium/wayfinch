// Daylight (spec section 6.5): the sun times, the fine limit and the status of an arrival. The card comes with leave-by.
// This is the only file that imports suncalc. It takes and gives UTC instants, so the device's zone plays no part.
import { getTimes } from 'suncalc';
import { formatHm } from '../answers/time.ts';
import type { Status, SunSource, SunTimes } from '../types.ts';
import { W } from '../wording/en.ts';

const MIN = 60_000;
const MARGIN_MIN = 30;
const MARGIN_SHARE = 0.15;

/**
 * Sun times of a riding date at a point. Noon UTC lies inside that date's solar day at every longitude, so the evening's
 * sunset belongs to the date even where it falls after local midnight.
 */
export const sunFromSuncalc: SunSource = (lat, lon, ridingDate) => {
  const [y, m, d] = ridingDate.split('-').map(Number) as [number, number, number];
  const t = getTimes(new Date(Date.UTC(y, m - 1, d, 12)), lat, lon);
  return { dawn: t.dawn, sunrise: t.sunrise, sunset: t.sunset, dusk: t.dusk, lightAllNight: t.alwaysUp === true };
};

/** Sunset minus the larger of 30 minutes and 15% of the riding time. Null on a day without a sunset. */
export function fineLimit(sun: SunTimes, ridingMin: number): Date | null {
  if (!sun.sunset) return null;
  return new Date(sun.sunset.getTime() - Math.max(MARGIN_MIN, MARGIN_SHARE * ridingMin) * MIN);
}

/**
 * The status of an arrival, judged on the ride's date whatever date it falls on. `tz` is the zone of the place the sun
 * times belong to. A day the sun never rises has no fine limit: dark from dusk, or all day without a dusk.
 */
export function arrivalStatus(arrival: Date, sun: SunTimes, ridingMin: number, tz: string): { status: Status; line: string | null } {
  if (sun.lightAllNight) return { status: 'fine', line: W.daylightAllNight };
  const dark = sun.dusk ? arrival.getTime() >= sun.dusk.getTime() : false;
  if (dark) return { status: 'warning', line: W.daylightDarkFrom(formatHm(sun.dusk!, tz)) };
  const limit = fineLimit(sun, ridingMin);
  if (!limit) return sun.dusk ? { status: 'action', line: W.daylightLightsOnAllDay } : { status: 'warning', line: W.daylightDarkAllDay };
  if (arrival.getTime() <= limit.getTime()) return { status: 'fine', line: null };
  return { status: 'action', line: W.daylightLightsOnFrom(formatHm(sun.sunset!, tz)) };
}

const span = (ms: number): string => {
  const total = Math.floor(ms / MIN);
  const h = Math.floor(total / 60);
  return h > 0 ? `${h} h ${total % 60} min` : `${total} min`;
};

/** Daylight left today, in every phase. Whole minutes, rounded down, so it never overstates. */
export function daylightLeft(now: Date, sun: SunTimes, sunTomorrow: SunTimes, tz: string): string {
  if (sun.lightAllNight) return W.daylightAllNight;
  if (!sun.sunset) return W.daylightDarkAllDay;
  const t = now.getTime();
  const sunset = sun.sunset.getTime();
  if (t > sunset) {
    const first = sunTomorrow.dawn ?? sunTomorrow.sunrise;
    return W.daylightSunSet(formatHm(sun.sunset, tz), first ? formatHm(first, tz) : null);
  }
  if (sun.sunrise && t < sun.sunrise.getTime()) return W.daylightFromSunrise(span(sunset - sun.sunrise.getTime()), formatHm(sun.sunrise, tz));
  return W.daylightLeft(span(sunset - t));
}

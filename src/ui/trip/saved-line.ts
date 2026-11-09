// What Get ready offline saved, in one line: the Get ready step's folded line and its body both show it.
import { W } from '../../core/wording/en.ts';
import { agoText, packDate, thousands } from './model.ts';
import { forecastDay } from './services.ts';
import type { TripSnapshot } from './services.ts';

/** "1,214 places, weather to Friday, updated 2 h ago": only what is stored. */
export function savedLine(snap: TripSnapshot): string | null {
  const { prepared, places, forecastTo, forecastFetchedAt, zone, now } = snap;
  if (!prepared && places === 0 && forecastTo === null) return null;
  const pack = packDate(prepared?.build);
  const placesText = places > 0 ? `${W.appTripPlaces(thousands(places))}${pack ? ` (${W.appTripMapDate(pack.date, pack.fromSource)})` : ''}` : W.appTripNoPlaces;
  // The forecast is read against now: one that has ended says so, and its time is its own fetch time.
  let weather = W.appTripNoWeather;
  if (forecastTo) {
    const day = forecastDay(forecastTo, now, zone);
    weather = forecastTo.getTime() > now.getTime() ? W.appTripWeatherTo(day) : W.appTripWeatherEnded(day);
    if (forecastFetchedAt) weather += ` (${W.appTripFetched(agoText(forecastFetchedAt, now))})`;
  }
  return [placesText, weather].join(', ');
}

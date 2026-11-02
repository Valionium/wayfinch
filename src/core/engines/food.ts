// The Food card (spec sections 6.4 and 6.11): the stop idea, the other ideas in route order, then the next places open at
// arrival. It asks less of those than of an idea: open at the arrival itself, not for the 30 minutes after.
import { compareFinal, formatAbout, formatHm, makeAnswer } from '../answers/index.ts';
import { openAtArrival, stateAt } from '../hours/check.ts';
import type { Answer, AnswerItem, StopIdea } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { newestMapDate, shortMapDate, spotName } from './covers.ts';
import { arrivalRidingOn, hoursIndex, insideRadius, isFoodPlace, open247, passesOf, zoneOfPass } from './leaveby.ts';
import { noteFor } from './tripday.ts';
import { routeForecast, gridOf } from './weather-windows.ts';
import type { FoodFacts, Ideas } from './stop-ideas.ts';

const NEXT_PLACES = 3;
const AT_STOP_KM = 1;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

const itemOf = (x: StopIdea): AnswerItem => ({
  label: x.reason, stamp: x.km === null ? null : { km: x.km, ...(x.arrival ? { at: x.arrival } : {}) }, status: x.status, detail: x.lines.join(' '),
});

/** The next places open at the arrival itself, with when they close (section 6.4). */
function nextOpenItems(f: FoodFacts): AnswerItem[] {
  if (f.trip.departureDate === null || !validDate(f.ride.departure)) return [];
  const hoursOf = hoursIndex(f);
  const { startKm, stopKm } = f.ride;
  const onRide = passesOf(f).filter((x) => isFoodPlace(x.place) && x.match.km >= startKm && x.match.km <= stopKm + AT_STOP_KM);
  // Inside an approximate position's radius it may already be behind: no distance, no arrival (section 8).
  const near: AnswerItem[] = onRide.filter((x) => insideRadius(f.ride, x.match.km)).sort((a, b) => a.match.km - b.match.km || compareFinal(a.place, b.place)).map((x) => ({
    label: spotName({ place: x.place, roof: null, match: x.match }), stamp: { km: x.match.km }, status: 'unknown', detail: W.waterNearYou,
  }));
  const named = new Set<string>();
  const next = onRide
    .filter((x) => !insideRadius(f.ride, x.match.km))
    .map((x) => ({ x, arrival: arrivalRidingOn(f.schedule, stopKm, f.trip.flatKph, x.match) }))
    .filter(({ x, arrival }) => openAtArrival(hoursOf(x.place.id), arrival))
    .sort((a, b) => a.arrival.getTime() - b.arrival.getTime())
    .filter(({ x }) => {
      if (named.has(x.place.id)) return false; // its next pass
      named.add(x.place.id);
      return true;
    })
    .slice(0, NEXT_PLACES)
    .map(({ x, arrival }) => {
      const tz = zoneOfPass(x, f);
      const until = stateAt(hoursOf(x.place.id), arrival).until;
      return {
        label: spotName({ place: x.place, roof: null, match: x.match }), stamp: { km: x.match.km, at: arrival }, status: 'fine' as const,
        detail: `${W.waterAhead(showKm(Math.abs(x.match.km - startKm)))} · ${formatAbout(arrival, tz)} · ${until ? W.stopOpenAtArrivalCloses(formatHm(until, tz)) : open247(x.place) ? W.stopOpen247 : W.stopOpenOnArrival}`,
      };
    });
  return [...near, ...next];
}

export function foodAnswer(f: FoodFacts, ideas: Ideas): Answer {
  const title = ideas.title;
  const newest = newestMapDate(f);
  const date = shortMapDate(newest);
  const forecast = f.forecast && gridOf(routeForecast(f.forecast, f.trip.route)).length > 0 ? f.forecast : null;
  const basis = [W.waterBasisOsm, ...(date ? [W.stopMapDate(date)] : []), ...(forecast ? [W.weatherAttribution] : [])];
  const dataDates: Record<string, string> = {};
  if (newest !== null) dataDates['places'] = newest;
  if (forecast) dataDates['weather'] = forecast.fetchedAt.toISOString();
  const note = noteFor(f.ride);
  const items = ideas.status === 'unknown' && !title ? [] : [...ideas.timeline.map(itemOf), ...nextOpenItems(f)];
  return makeAnswer({
    topic: 'food', status: ideas.status, title: title?.reason ?? ideas.line ?? W.stopNoneAtArrival,
    stamp: title && title.km !== null ? { km: title.km, ...(title.arrival ? { at: title.arrival } : {}) } : null,
    detail: [...(title?.lines ?? []), ...(note ? [note] : [])].join(' '), items, basis, freshness: { dataDates, stale: false }, missing: ideas.missing,
  });
}

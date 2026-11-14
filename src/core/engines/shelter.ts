// The Shelter chip (spec section 6.11): the nearest covers ahead and behind, riding there now. It is for a shower the
// forecast missed, so it answers with any forecast or none. A storm near puts open buildings first.
import { formatAbout, makeAnswer } from '../answers/index.ts';
import type { Answer, AnswerItem, Cover, Position, StoredForecast } from '../types.ts';
import { showKm, W } from '../wording/en.ts';
import { latestPosition, usablePosition } from './locate.ts';
import { coverLine, coverOfSpot, finalOrder, hoursLookup, hoursNotWorkedOut, insideRadius, isCover, missingFor, newestMapDate, reachKm, shortMapDate, spotsOf, zoneOfSpot, type NotCover, type Spot, type StopFacts } from './covers.ts';
import { usableFlatKph, type Schedule } from './pace.ts';
import { fromNowNote } from './help.ts';
import { chipRide, nowSchedule, zoneLookupOf } from './tripday.ts';
import { hourClass } from './weather-classes.ts';
import { isStale, weatherWindows } from './weather.ts';
import { gridOf, hoursTouching, onTheRide, pointNearKm, pointNearPosition, routeForecast, type GridPoint } from './weather-windows.ts';

const HOUR = 3_600_000;
const NEAREST = 3;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

export const latestUsable = (f: Pick<StopFacts, 'positions'>): Position | null => latestPosition(f.positions.filter(usablePosition));

const stormAt = (g: GridPoint | null, t: Date): boolean => {
  const ms = t.getTime();
  return g !== null && Number.isFinite(ms) && hoursTouching(g.hours, ms - HOUR, ms + HOUR).some((h) => hourClass(h).thunder);
};

const stormWindowOnRide = (f: StopFacts): boolean =>
  onTheRide(weatherWindows(f).filter((w) => w.cls === 'likely'), f.ride).some((w) => w.thunderKms.length > 0);

const held = (f: StopFacts): StoredForecast | null => {
  const forecast = f.forecast && routeForecast(f.forecast, f.trip.route);
  return forecast && gridOf(forecast).length > 0 ? forecast : null;
};

/** A thunderstorm hour within 1 hour of now at the nearest grid point, or a thunderstorm window on the day's ride. */
export function thunderNear(f: StopFacts): boolean {
  const forecast = held(f);
  if (!forecast) return false;
  const p = latestUsable(f);
  const g = p ? pointNearPosition(forecast, p) : pointNearKm(forecast, f.ride.startKm);
  return stormAt(g, f.now) || stormWindowOnRide(f);
}

/** The chip's thunderstorm rule, as it would be at the ride's start at its departure. */
export function stormAroundStart(f: StopFacts): boolean {
  const forecast = held(f);
  return forecast !== null && (stormAt(pointNearKm(forecast, f.ride.startKm), f.ride.departure) || stormWindowOnRide(f));
}

/** One line of the list. `cover` is null for what is listed and not counted. */
export type ShelterEntry = {
  spot: Spot; cover: Cover | null; item: AnswerItem; text: string; unworked: boolean;
};

const withoutPasses = (list: Spot[], from: number): Spot[] => {
  const seen = new Set<unknown>();
  return [...list]
    .sort((a, b) => reachKm(a, from) - reachKm(b, from) || finalOrder(a, b))
    .filter((s) => {
      const key = s.place ?? s.roof;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

function entryOf(spot: Spot, r: Cover | NotCover, f: StopFacts, arrival: Date, where: string, ahead: boolean, thunder: boolean, unworked: boolean): ShelterEntry {
  const covered = isCover(r);
  const roofy = thunder && covered && r.coverClass > 2;
  const cover = covered ? { ...r, lightning: roofy } : null;
  const tz = zoneOfSpot(spot, f);
  const parts = ahead ? [where, formatAbout(arrival, tz)] : [where];
  if (!covered) parts.push(r.notCover);
  if (roofy) parts.push(W.weatherNoLightningProtection);
  const detail = parts.join(' · ');
  const label = coverLine(spot, cover ?? r, f);
  const stamp = ahead && covered ? { km: spot.match.km, at: arrival } : { km: spot.match.km };
  const item: AnswerItem = { label, stamp, status: covered ? 'fine' : 'unknown', detail };
  return { spot, cover, item, text: `${label} ${detail}`, unworked };
}

/** The list, riding there at `at` from the ride's start: open buildings first when a storm is near, then the nearest covers. */
export function shelterEntries(f: StopFacts, at: Date, thunder: boolean): ShelterEntry[] {
  const schedule: Schedule = nowSchedule(f.ride, f.trip, at, { sun: f.sun, routeZones: f.routeZones });
  const hoursOf = hoursLookup(f);
  const spots = spotsOf(f);
  const { startKm, behindFromKm } = f.ride;

  const side = (list: Spot[], from: number, ahead: boolean, arrivalOf: (s: Spot) => Date, whereOf: (s: Spot) => string): { covers: ShelterEntry[]; rest: ShelterEntry[] } => {
    const covers: ShelterEntry[] = [];
    const rest: ShelterEntry[] = [];
    for (const spot of withoutPasses(list, from)) {
      const arrival = arrivalOf(spot);
      const r = coverOfSpot(spot, arrival, null, hoursOf);
      const entry = (): ShelterEntry => entryOf(spot, r, f, arrival, whereOf(spot), ahead, thunder, hoursNotWorkedOut(spot, arrival, hoursOf));
      if (isCover(r)) covers.push(entry());
      else if (r.listed) rest.push(entry());
    }
    return { covers, rest };
  };

  const inside = spots.filter((s) => insideRadius(f.ride, s.match.km));
  const ahead = side(
    spots.filter((s) => s.match.km >= startKm && !insideRadius(f.ride, s.match.km)), startKm, true,
    (s) => schedule.atPlace(s.match), (s) => W.weatherStampAhead(showKm(s.match.km - startKm)),
  );
  const behind = side(
    spots.filter((s) => s.match.km < behindFromKm && !insideRadius(f.ride, s.match.km)), behindFromKm, false,
    (s) => schedule.behind(s.match), (s) => W.waterBack(showKm(behindFromKm - s.match.km)),
  );

  const open = (e: ShelterEntry): boolean => e.cover !== null && e.cover.coverClass <= 2;
  const firsts = thunder ? [ahead.covers.find(open), behind.covers.find(open)].flatMap((e) => (e ? [e] : [])) : [];
  const nearest = [...ahead.covers.slice(0, NEAREST), ...behind.covers.slice(0, NEAREST)].filter((e) => !firsts.includes(e));
  const marked = [...ahead.rest, ...behind.rest]
    .sort((a, b) => a.spot.match.km - b.spot.match.km || finalOrder(a.spot, b.spot))
    .slice(0, NEAREST);
  const near = withoutPasses(inside, startKm).flatMap((spot) => {
    const arrival = schedule.atPlace(spot.match);
    const r = coverOfSpot(spot, arrival, null, hoursOf);
    if (!isCover(r) && !r.listed) return [];
    const e = entryOf(spot, r, f, arrival, W.waterNearYou, false, thunder, hoursNotWorkedOut(spot, arrival, hoursOf));
    return [{ ...e, cover: null, item: { ...e.item, stamp: { km: spot.match.km }, status: 'unknown' as const } }];
  }).slice(0, NEAREST);
  return [...firsts, ...nearest, ...marked, ...near];
}

/** The chip, riding there now. */
export function shelterChip(facts: StopFacts, thunder: boolean): Answer {
  const f: StopFacts = { ...facts, ride: chipRide(facts.ride, facts.trip, facts.positions) };
  const newest = newestMapDate(f);
  const date = shortMapDate(newest);
  const forecast = held(f);
  const basis = [W.waterBasisOsm, ...(date ? [W.stopMapDate(date)] : []), ...(forecast ? [W.weatherAttribution] : [])];
  const dataDates: Record<string, string> = {};
  if (newest !== null) dataDates['places'] = newest;
  if (forecast) dataDates['weather'] = forecast.fetchedAt.toISOString();
  const freshness = { dataDates, stale: forecast !== null && isStale(forecast, f.now) };

  if (!usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !Number.isFinite(f.ride.startKm)) {
    return makeAnswer({ topic: 'help', status: 'unknown', title: W.shelterCantWorkOut, stamp: null, detail: '', items: [], basis, freshness });
  }
  const list = shelterEntries(f, f.now, thunder);
  const first = list.find((e) => e.cover !== null);
  const missing = missingFor(f, Math.min(f.ride.startKm, f.ride.behindFromKm), Math.max(f.ride.startKm, f.ride.behindFromKm), list.some((e) => e.unworked));
  const title = thunder ? W.shelterThunderTitle : first ? W.shelterNearest(showKm(first.spot.match.km)) : W.shelterNone;
  return makeAnswer({
    topic: 'help', status: thunder ? 'warning' : first ? 'fine' : 'unknown', title, stamp: first ? first.item.stamp : null,
    detail: [...(thunder ? [W.weatherNoLightningProtection] : []), ...fromNowNote(f.ride, f.now, zoneLookupOf(f.routeZones)(f.ride.startKm).timeZone)].join(' '), items: list.map((e) => e.item), basis, freshness, missing,
  });
}

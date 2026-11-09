// The Sleep card (spec section 6.8) and call ahead (section 6.13). A sleep place is judged on the ride's arrival at it, the
// same one every card shows, and on the night's date: open, closed for the season, or hours unknown. Unknown never counts
// as open. Lean-tos and basic huts are listed with their own label and are never the answer; weather shelters are not
// sleep places. The card is never a warning.
import { compareFinal, formatAbout, makeAnswer } from '../answers/index.ts';
import { stateWithin } from '../hours/check.ts';
import { addDaysIso, instantAt, localIsoDate } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { telLink, websiteLink } from '../places/contact.ts';
import { COUNTRIES, type CountryCode } from '../places/countries.ts';
import { GRID_KM_ROUNDING } from '../route/grid.ts';
import { normaliseShelterType } from '../places/shelter.ts';
import type { Answer, AnswerItem, DayRide, ItemLink, Km, Missing, Place, PlaceHours, PlaceKind, RouteMatch, ScreenInputs, Status, SunTimes } from '../types.ts';
import { shortIsoDay, shortMapDate, showKm, W } from '../wording/en.ts';
import { newestMapDate, savedCovers } from './covers.ts';
import { arrivalStatus } from './daylight.ts';
import { arrivalRidingOn, hoursIndex, insideRadius, passesOf, routeZoneAt, sunReadable, zoneOfPass, type Pass } from './leaveby.ts';
import { rejoinKm } from './locate.ts';
import { flatLegRidingMin, ridingMin, usableFlatKph, type Schedule } from './pace.ts';
import { noteFor, nowSchedule, offersPlanTomorrow, ridingDate } from './tripday.ts';
import { seasonalWindow } from './water.ts';

export type SleepFacts = Pick<ScreenInputs, 'trip' | 'places' | 'matches' | 'hours' | 'savedKm' | 'now' | 'routeZones' | 'sun'> & { ride: DayRide; schedule: Schedule };

const NIGHT_RADIUS_KM = 3;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

// ---- call ahead (section 6.13) -------------------------------------------------------------------------------------

export type CallLine = { text: string; tel: string | null; secondary: boolean; label: string };
export type CallAhead = {
  eligible: boolean; calls: CallLine[];
  website: { host: string; url: string; label: string; shown: string } | null;
};

/** Campsites, lodging, alpine huts and bike shops only (INV-25). */
const CONTACT_KINDS = new Set<PlaceKind>(['campsite', 'lodging', 'hut', 'bike_shop']);

// Tag values come from strangers: they are compared through Maps, never used as object keys.
const LODGING_WORDS = new Map<string, string>([
  ['hostel', W.sleepWordHostel], ['guest_house', W.sleepWordGuestHouse], ['hotel', W.sleepWordHotel], ['motel', W.sleepWordMotel],
]);
const SHELTER_WORDS = new Map<string, string>([['lean_to', W.sleepWordLeanTo], ['basic_hut', W.sleepWordBasicHut]]);

const shelterType = (p: Place): string | null => normaliseShelterType(p.tags['shelter_type']);
/** A lean-to or basic hut: listed on the Sleep card, labelled, never counted for the night. */
const isLeanTo = (p: Place): boolean => p.kind === 'shelter' && SHELTER_WORDS.has(shelterType(p) ?? '');
const isSleepPlace = (p: Place): boolean => p.kind === 'campsite' || p.kind === 'lodging' || p.kind === 'hut' || isLeanTo(p);

function wordOf(p: Place): string {
  if (p.kind === 'campsite') return W.sleepWordCampsite;
  if (p.kind === 'hut') return W.sleepWordHut;
  if (p.kind === 'lodging') return LODGING_WORDS.get(p.tags['tourism'] ?? '') ?? W.sleepWordLodging;
  if (p.kind === 'shelter') return SHELTER_WORDS.get(shelterType(p) ?? '') ?? W.sleepWordLeanTo;
  return W.sleepWordLodging;
}
const nameOf = (p: Place): string => (typeof p.name === 'string' && p.name.trim() !== '' ? p.name.trim() : wordOf(p));

/** The call link of a mapped number. A country the table doesn't know cannot make a national number callable. */
function telOf(text: string, country: string): string | null {
  const known = Object.hasOwn(COUNTRIES, country);
  if (!known && !/^\s*(\+|00)/.test(text)) return null;
  try {
    return telLink(text, (known ? country : 'DE') as CountryCode);
  } catch {
    return null;
  }
}

export function callAhead(place: Place): CallAhead {
  if (!CONTACT_KINDS.has(place.kind)) return { eligible: false, calls: [], website: null };
  const name = nameOf(place);
  const phones = (place.contact?.phones ?? []).filter((t): t is string => typeof t === 'string' && t.trim() !== '').slice(0, 2);
  const calls: CallLine[] = phones.map((text, i) => {
    const tel = telOf(text, place.country);
    return { text, tel, secondary: i > 0, label: tel === null ? W.callTextLabel(name, text) : W.callLabel(name, text) };
  });
  let website: CallAhead['website'] = null;
  const url = typeof place.contact?.website === 'string' ? websiteLink(place.contact.website) : null;
  if (url !== null) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    if (host !== '') website = { host, url, label: W.callWebsiteLabel(name, host), shown: W.callWebsite(host) };
  }
  return { eligible: true, calls, website };
}

/** Whether a place of a call-ahead kind has a number or a website mapped. */
export const hasCallData = (c: CallAhead): boolean => c.eligible && (c.calls.length > 0 || c.website !== null);

/** The words an item carries for its calls: "Call +49 …", "also …", "Website host (online)", or "No phone or website mapped." */
export function callPartsOf(c: CallAhead): string[] {
  if (!c.eligible) return [];
  if (!hasCallData(c)) return [W.callNoContact];
  const first = c.calls[0];
  return [
    ...(first ? [first.tel === null ? W.callText(first.text) : W.callCall(first.text)] : []),
    ...c.calls.slice(1).map((x) => W.callAlso(x.text)),
    ...(c.website ? [c.website.shown] : []),
  ];
}

/** The buttons for those words: one for each callable number and the website. A number that can't be called stays text. */
export function linksOf(c: CallAhead): ItemLink[] {
  if (!hasCallData(c)) return [];
  const out: ItemLink[] = [];
  c.calls.forEach((x, i) => {
    if (x.tel !== null) out.push({ kind: 'tel', shown: i === 0 ? W.callCall(x.text) : W.callAlso(x.text), href: x.tel, label: x.label, secondary: i > 0 });
  });
  if (c.website) out.push({ kind: 'web', shown: c.website.shown, href: c.website.url, label: c.website.label, secondary: false });
  return out;
}

// ---- the night -----------------------------------------------------------------------------------------------------

type Night = { state: 'open' | 'closed' | 'unknown'; why: 'season' | 'hours' | null; unworked: boolean; season: string | null };

const RESERVATION = new Map<string, string>([
  ['required', 'required'], ['recommended', 'recommended'], ['yes', 'yes'], ['no', 'no'], ['optional', 'optional'], ['members_only', 'members only'],
]);
const YES_NO = new Map<string, string>([['yes', 'yes'], ['no', 'no']]);

/**
 * Open, closed or unknown for the night of `date` (the place's own calendar day). An open stretch anywhere on that day
 * means open, since reception hours are no check-in rule; stretches that are only unknown or possibly closed mean unknown.
 */
export function nightOf(place: Place, h: PlaceHours | undefined, date: string, tz: string): Night {
  const window = seasonalWindow(place.seasonal);
  const label = window !== null && window !== 'year-round' ? window.label : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { state: 'unknown', why: null, unworked: false, season: label };
  const month = Number(date.slice(5, 7));
  const seasonIn = window === 'year-round' || (window !== null && window.months.has(month));
  if (window !== null && window !== 'year-round' && !seasonIn) return { state: 'closed', why: 'season', unworked: false, season: label };

  const dayStart = instantAt(date, '00:00', tz).getTime();
  const dayEnd = instantAt(addDaysIso(date, 1), '00:00', tz).getTime();
  const mapped = typeof place.openingHours === 'string' && place.openingHours.trim() !== '';
  const verdict = stateWithin(h, new Date(dayStart), new Date(dayEnd));
  if (verdict === 'open') return { state: 'open', why: null, unworked: false, season: label };
  if (verdict === 'closed') return { state: 'closed', why: 'hours', unworked: false, season: label };
  // Hours not known or not prepared: a season that is in is the only thing left to go on, and only without hours mapped.
  if (seasonIn && !mapped) return { state: 'open', why: 'season', unworked: false, season: label };
  return { state: 'unknown', why: null, unworked: verdict === 'outside' && mapped, season: label };
}

// ---- candidates ----------------------------------------------------------------------------------------------------

type Side = 'ahead' | 'behind' | 'near';
type Candidate = { pass: Pass; side: Side; riding: 'ride' | 'beyond' | 'now'; arrival: Date | null; ridingMinutes: number };

const worse = (a: Status, b: Status): Status => {
  for (const s of ['warning', 'action', 'unknown'] as const) if (a === s || b === s) return s;
  return 'fine';
};

/** With none within 3 km of the stop: the nearest pass ahead of it and the nearest behind it. */
function nearestEachWay(passes: Pass[], target: Km): Pass[] {
  const pick = (list: Pass[], gap: (x: Pass) => number): Pass[] => {
    const best = [...list].sort((a, b) => gap(a) - gap(b) || compareFinal(a.place, b.place))[0];
    return best ? [best] : [];
  };
  return [
    ...pick(passes.filter((x) => x.match.km >= target), (x) => x.match.km - target),
    ...pick(passes.filter((x) => x.match.km < target), (x) => target - x.match.km),
  ];
}

export function sleepAnswer(f: SleepFacts): Answer {
  const { ride } = f;
  const newest = newestMapDate(f);
  const date = shortMapDate(newest);
  const basis = [W.waterBasisOsm, ...(date ? [W.stopMapDate(date)] : [])];
  const dataDates: Record<string, string> = newest === null ? {} : { places: newest };
  const freshness = { dataDates, stale: false };
  const unusable = !usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !validDate(ride.departure)
    || ![ride.startKm, ride.stopKm, ride.behindFromKm, f.trip.route.lengthKm].every((k) => Number.isFinite(k));
  if (unusable) return makeAnswer({ topic: 'sleep', status: 'unknown', title: W.sleepCantWorkOut, stamp: null, detail: '', items: [], basis, freshness });

  const route = f.trip.route;
  const env = { sun: f.sun, routeZones: f.routeZones };
  const night = ride.phase === 'after-ride' || ride.phase === 'route-end';
  const nightDate = night ? ridingDate(f.now, routeZoneAt(f, 0)) : ride.date;
  const dayLabel = shortIsoDay(nightDate);
  const when = dayLabel === null || nightDate === localIsoDate(f.now, routeZoneAt(f, 0)) ? W.sleepTonight : W.sleepNightOf(dayLabel);
  const flat = f.trip.flatKph;
  const sleepPasses = passesOf(f).filter((x) => isSleepPlace(x.place));

  // The ride the arrivals are read from: the day's ride, or riding there now after the ride.
  const schedule = night ? nowSchedule(ride, f.trip, f.now, env) : f.schedule;
  const target = night ? ride.tonightKm ?? ride.stopKm : ride.stopKm;

  const ridingOf = (side: Side, m: RouteMatch): number =>
    ridingMin(route, side === 'behind' ? ride.behindFromKm : schedule.startKm, m.km, flat, schedule.r)
    + flatLegRidingMin(schedule.startLegKm + rejoinKm(m.offRouteM), flat, schedule.r);

  const sunOf = (km: Km): SunTimes => {
    const p = pointAtRouteKm(route, Math.max(0, Math.min(route.lengthKm, km)));
    return f.sun(p.lat, p.lon, nightDate);
  };
  const judged = (x: Pass, arrival: Date | null, minutes: number): { status: Status; line: string | null } => {
    if (arrival === null || !validDate(arrival) || !ISO_DATE.test(nightDate)) return { status: 'unknown', line: null };
    const sun = sunOf(x.match.km);
    return sunReadable(sun) ? arrivalStatus(arrival, sun, minutes, zoneOfPass(x, f)) : { status: 'unknown', line: null };
  };

  const classify = (x: Pass): Candidate | null => {
    const km = x.match.km;
    if (night) {
      if (insideRadius(ride, km)) return { pass: x, side: 'near', riding: 'now', arrival: null, ridingMinutes: 0 };
      if (km >= ride.startKm) return { pass: x, side: 'ahead', riding: 'now', arrival: schedule.atPlace(x.match), ridingMinutes: ridingOf('ahead', x.match) };
      return { pass: x, side: 'behind', riding: 'now', arrival: schedule.behind(x.match), ridingMinutes: ridingOf('behind', x.match) };
    }
    if (km < ride.startKm - GRID_KM_ROUNDING) return null;
    if (insideRadius(ride, km)) return { pass: x, side: 'near', riding: 'ride', arrival: null, ridingMinutes: 0 };
    if (km <= ride.stopKm + GRID_KM_ROUNDING) return { pass: x, side: 'ahead', riding: 'ride', arrival: schedule.atPlace(x.match), ridingMinutes: ridingOf('ahead', x.match) };
    // Beyond the stop: riding on that evening, kept only if it would be reached fine or action (never a warning).
    const arrival = arrivalRidingOn(schedule, ride.stopKm, flat, x.match);
    const c: Candidate = { pass: x, side: 'ahead', riding: 'beyond', arrival, ridingMinutes: ridingOf('ahead', x.match) };
    const status = judged(x, arrival, c.ridingMinutes).status;
    return status === 'fine' || status === 'action' ? c : null;
  };

  const chosen: Candidate[] = [];
  if (night) {
    const within = sleepPasses.filter((x) => Math.abs(x.match.km - target) <= NIGHT_RADIUS_KM + 1e-9);
    for (const x of within.length > 0 ? within : nearestEachWay(sleepPasses, target)) chosen.push(classify(x)!);
  } else {
    for (const x of sleepPasses) {
      const c = classify(x);
      if (c) chosen.push(c);
    }
  }
  chosen.sort((a, b) => a.pass.match.km - b.pass.match.km || compareFinal(a.pass.place, b.pass.place));

  // Each candidate's night, status and lines.
  const hoursOf = hoursIndex(f);
  const rows = chosen.map((c) => {
    const p = c.pass.place;
    const tz = zoneOfPass(c.pass, f);
    const n = nightOf(p, hoursOf(p.id), nightDate, tz);
    const dl = c.side === 'near' ? { status: 'unknown' as Status, line: null } : judged(c.pass, c.arrival, c.ridingMinutes);
    const nightStatus: Status = n.state === 'open' ? 'fine' : n.state === 'closed' ? 'action' : 'unknown';
    const status = worse(nightStatus, dl.status === 'unknown' ? 'fine' : dl.status);
    return { c, p, tz, n, dl, status, calls: callAhead(p) };
  });
  type Row = (typeof rows)[number];

  const counted = rows.filter((r) => !isLeanTo(r.p));
  const nearestToTarget = (list: Row[]): Row | undefined =>
    [...list].sort((a, b) => Math.abs(a.c.pass.match.km - target) - Math.abs(b.c.pass.match.km - target))[0];
  const bestOpen = nearestToTarget(counted.filter((r) => r.n.state === 'open'));
  const bestUnknown = nearestToTarget(counted.filter((r) => r.n.state === 'unknown'));

  const lengthKm = route.lengthKm;
  const rangeFrom = night ? Math.max(0, target - NIGHT_RADIUS_KM) : ride.startKm;
  const rangeTo = night ? Math.min(lengthKm, target + NIGHT_RADIUS_KM) : ride.stopKm;
  const saved = savedCovers(f, rangeFrom, rangeTo);

  let status: Status = bestOpen ? 'fine' : rows.some((r) => r.n.state === 'unknown') ? 'unknown' : 'action';
  if (status !== 'fine' && !saved) status = 'unknown';
  const missing: Missing[] = [];
  if (status !== 'fine' && !saved) missing.push('places');
  if (status !== 'fine' && rows.some((r) => r.n.unworked)) missing.push('hours');

  const titleOf = (r: Row, make: (name: string, km: string) => string): string => make(nameOf(r.p), showKm(r.c.pass.match.km));
  const title = bestOpen ? titleOf(bestOpen, W.sleepTitleOpen)
    : status === 'unknown' && !saved && rows.length === 0 ? W.stopNoPlaceDataHere
      : bestUnknown ? titleOf(bestUnknown, W.sleepTitleUnknown) : W.sleepTitleNone;

  // The items, with the source line under the first item with data and the pitches line under the first Call.
  let sourceShown = false;
  let pitchesShown = false;
  const items: AnswerItem[] = rows.map((r) => {
    const { c, p, n } = r;
    const m = c.pass.match;
    const off = Math.round(m.offRouteM);
    const label = `${nameOf(p)} · ${off > 0 ? W.stopKmOff(showKm(m.km), String(off)) : W.stopKm(showKm(m.km))}`;
    const where = c.side === 'near' ? [W.waterNearYou]
      : c.side === 'ahead' ? [W.weatherStampAhead(showKm(m.km - schedule.startKm))]
        : [W.waterBack(showKm(ride.behindFromKm - m.km))];
    const timed = c.arrival !== null && validDate(c.arrival) && c.side !== 'near';
    const nightText = n.state === 'open' ? W.sleepOpen(when, n.season)
      : n.state === 'closed' ? (n.why === 'season' ? W.sleepClosedSeason(n.season ?? '') : W.sleepClosedDay(when))
        : W.sleepHoursUnknown(when);
    const reservation = RESERVATION.get(p.tags['reservation'] ?? '');
    const fee = YES_NO.get(p.tags['fee'] ?? '');
    const locked = YES_NO.get(p.tags['locked'] ?? '');
    const hasData = hasCallData(r.calls);
    const callParts = callPartsOf(r.calls);
    const lines: string[] = [];
    if (hasData && !sourceShown) {
      sourceShown = true;
      const mapped = shortMapDate(p.dataDate);
      if (mapped) lines.push(W.callAsMapped(mapped));
    }
    if (r.calls.calls.some((x) => x.tel !== null) && !pitchesShown) {
      pitchesShown = true;
      lines.push(W.sleepFreePitchesUnknown);
    }
    if (n.state === 'unknown' && r.calls.calls.length > 0) lines.push(W.sleepCallAhead);
    const detail = [
      ...where,
      ...(timed ? [formatAbout(c.arrival!, r.tz)] : []),
      ...(r.dl.line ? [r.dl.line] : []),
      ...(c.riding === 'beyond' ? [W.sleepRidingOn] : []),
      nightText,
      ...(isLeanTo(p) ? [W.sleepShelterNote] : []),
      ...(reservation ? [W.sleepReservation(reservation)] : []),
      ...(fee ? [W.sleepFee(fee)] : []),
      ...(locked ? [W.sleepLocked(locked)] : []),
      ...callParts, ...lines,
    ].join(' · ');
    const item: AnswerItem = { label, stamp: timed ? { km: m.km, at: c.arrival! } : { km: m.km }, status: r.status, detail };
    if (hasData) {
      item.contact = { phones: r.calls.calls.map((x) => x.text), website: r.calls.website?.url ?? null };
      const links = linksOf(r.calls);
      if (links.length > 0) item.links = links;
    }
    return item;
  });

  const note = noteFor(ride);
  const detail = [...(note ? [note] : []), ...(offersPlanTomorrow(ride) ? [W.sleepPlanTomorrow] : [])].join(' ');
  const best = bestOpen;
  const stamp = best
    ? (best.c.arrival !== null && validDate(best.c.arrival) && best.c.side !== 'near' ? { km: best.c.pass.match.km, at: best.c.arrival } : { km: best.c.pass.match.km })
    : null;
  return makeAnswer({ topic: 'sleep', status, title, stamp, detail, items, basis, freshness, missing });
}

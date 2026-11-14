// The help chips (spec section 6.9): bike shop, pharmacy, bail out by train, toilets. Each rides there now from the position,
// in every phase (section 6.2a), ahead and behind. A place reached on two passes is judged on each pass.
import { compareFinal, formatAbout, formatHm, makeAnswer } from '../answers/index.ts';
import { isKnownZone } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { stateAt } from '../hours/check.ts';
import { radiusKmFor } from '../route/matches.ts';
import type { Answer, AnswerItem, DayRide, Km, Missing, Place, PlaceKind, RouteMatch, ScreenInputs, Status } from '../types.ts';
import { shortMapDate, showKm, W } from '../wording/en.ts';
import { newestMapDate, savedCovers } from './covers.ts';
import { rejoinKm } from './locate.ts';
import { usableFlatKph, type Schedule } from './pace.ts';
import { callAhead, callPartsOf, hasCallData, linksOf } from './sleep.ts';
import { chipRide, chipStart, nowSchedule, zoneLookupOf } from './tripday.ts';

export type HelpFacts = Pick<ScreenInputs, 'trip' | 'places' | 'matches' | 'hours' | 'savedKm' | 'positions' | 'now' | 'routeZones' | 'sun'> & { ride: DayRide };
export type HelpKind = 'bike' | 'pharmacy' | 'train' | 'toilets';

/** One pass of a place. */
type Pass = { place: Place; match: RouteMatch };

/** One kind of place on a chip: which count, which come first, and the lines each adds. */
type Group = {
  what: string;
  counts: (p: Place) => boolean;
  preferred?: (p: Place) => boolean;
  hasHours?: boolean;
  label?: (p: Place) => string;
  lines?: (p: Place) => string[];
  status?: (p: Place) => Status;
};

const KIND_WORD = new Map<PlaceKind, string>([
  ['bike_shop', W.helpWordBikeShop], ['repair_station', W.helpWordRepairStation], ['air', W.helpWordPump], ['pharmacy', W.helpWordPharmacy],
  ['hospital', W.helpWordHospital], ['toilets', W.helpWordToilets],
]);

const isKind = (...kinds: PlaceKind[]) => (p: Place): boolean => kinds.includes(p.kind);
const wordOf = (p: Place): string => (p.kind === 'station' ? (p.tags['railway'] === 'halt' ? W.helpWordHalt : W.helpWordStation) : KIND_WORD.get(p.kind) ?? W.helpWordToilets);
const hasName = (p: Place): p is Place & { name: string } => typeof p.name === 'string' && p.name.trim() !== '';
/**
 * A place with no name is called unnamed: its kind is never shown as if it were its name ("Nearest halt: halt"). Public
 * toilets are the one kind whose plain word is a fair label ("toilets · km 101", EM-TOILETS).
 */
const nameOf = (p: Place): string => (hasName(p) ? p.name : p.kind === 'toilets' ? W.helpWordToilets : W.helpUnnamed(wordOf(p)));
const closedAccess = (value: string | undefined): boolean => value === 'private' || value === 'no';

const repairLine = (p: Place): string => {
  const v = p.tags['service:bicycle:repair'];
  return v === 'yes' ? W.helpRepairsMapped : v === 'no' ? W.helpNoRepairs : W.helpRepairsNotMapped;
};
const valveLine = (p: Place): string => (p.tags['valves'] ? W.helpValves(p.tags['valves']) : W.helpValvesNotMapped);
/**
 * A specialist clinic: mapped as other care than a hospital (healthcare=doctor or clinic; OSM way 155203932, a child psychiatry), or
 * with non-acute specialities only. Its emergency=yes may be for that care alone, so it is never offered as an emergency department.
 * A hospital mapped with acute specialities (trauma;surgery, say) stays one: a real emergency department is never demoted (review
 * of #140, I2).
 */
// psychiatry, child_psychiatry, psychotherapy, psychosomatics, rehabilitation, palliative, dentistry.
const NON_ACUTE = /^(child_)?psych|^rehab|^palliat|^dent/;
const specialityList = (p: Place): string[] => (p.tags['healthcare:speciality'] ?? '').toLowerCase().split(';').map((x) => x.trim()).filter(Boolean);
const specialist = (p: Place): boolean => {
  const care = p.tags['healthcare']?.trim().toLowerCase();
  const list = specialityList(p);
  return (!!care && care !== 'hospital' && care !== 'yes') || (list.length > 0 && list.every((x) => NON_ACUTE.test(x)));
};
const mappedYes = (p: Place): boolean => p.tags['emergency'] === 'yes';
const departmentYes = (p: Place): boolean => mappedYes(p) && !specialist(p);
/** A hospital mapped access=private or no stays listed, said plainly: in OSM that is often only who runs it (review of #140, I3). */
const hospitalLines = (p: Place): string[] => {
  const list = specialityList(p);
  const lines = specialist(p)
    ? [list.length > 0 ? W.helpSpecialist(list.join(', ').replace(/_/g, ' ')) : W.helpNotHospital, mappedYes(p) ? W.helpEmergencyLimited : W.helpEmergencyUnknown]
    : [departmentYes(p) ? W.helpEmergencyDepartment : W.helpEmergencyUnknown];
  const access = p.tags['access'];
  const closed = closedAccess(access);
  return [...lines, ...(closed ? [W.helpAccess(access!)] : []), ...(closed || (mappedYes(p) && specialist(p)) ? [W.helpCheckFirst] : [])];
};

const toiletsAccess = (p: Place): string | undefined => (p.kind === 'toilets' ? p.tags['access'] : p.tags['toilets:access'] ?? p.tags['access']);
const accessLine = (p: Place): string => {
  const v = toiletsAccess(p);
  return v ? W.helpAccess(v) : W.helpAccessNotMapped;
};
const feeLine = (p: Place): string => {
  const v = p.tags['fee'];
  if (!v) return W.helpFeeNotMapped;
  return v === 'yes' ? W.helpFee : v === 'no' ? W.helpFree : W.helpFeeAmount(v);
};

const GROUPS: Record<HelpKind, Group[]> = {
  bike: [
    { what: W.helpWordBikeShop, counts: isKind('bike_shop'), preferred: (p) => p.tags['service:bicycle:repair'] === 'yes', hasHours: true, lines: (p) => [repairLine(p)] },
    { what: W.helpWordRepairStation, counts: isKind('repair_station'), lines: (p) => [valveLine(p)] },
    { what: W.helpWordPump, counts: isKind('air'), lines: (p) => [valveLine(p)] },
  ],
  pharmacy: [
    { what: W.helpWordPharmacy, counts: isKind('pharmacy'), hasHours: true },
    {
      what: W.helpWordHospital, counts: (p) => p.kind === 'hospital' && p.tags['emergency'] !== 'no', preferred: (p) => departmentYes(p) && !closedAccess(p.tags['access']),
      lines: hospitalLines,
      status: (p) => (departmentYes(p) && !closedAccess(p.tags['access']) ? 'fine' : 'unknown'),
    },
  ],
  train: [
    { what: W.helpWordStation, counts: isKind('station'), preferred: (p) => p.tags['railway'] !== 'halt' },
  ],
  toilets: [
    {
      what: W.helpWordToilets, counts: (p) => (p.kind === 'toilets' || p.stop?.toilets === true) && !closedAccess(toiletsAccess(p)), hasHours: true,
      label: (p) => (p.kind === 'toilets' ? nameOf(p) : hasName(p) ? W.helpToiletsAt(p.name) : W.helpToiletsAtUnnamed), lines: (p) => [accessLine(p), feeLine(p)],
    },
  ],
};

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

/**
 * The chips ride there now (EM-NOW), while the cards ride from the planned start. When that start is still to come (before
 * the trip, before the day's ride, after it), the chip says its times count from now, so "closed on arrival" at 00:30 is not
 * read as the arrival on the day's ride (finding 13 of 14 Nov 2026). Shelter's chip says the same.
 */
export function fromNowNote(ride: DayRide, now: Date, timeZone: string): string[] {
  if (!validDate(now) || !validDate(ride.departure) || ride.departure.getTime() - now.getTime() < 60_000) return [];
  return [W.helpFromNow(formatHm(now, isKnownZone(timeZone) ? timeZone : 'UTC'))];
}

const reach = (s: Pass, from: Km): number => Math.abs(s.match.km - from) + rejoinKm(s.match.offRouteM);

/** The nearest pass on one side, and the nearest of the preferred before it when that is another one. */
function picks(list: Pass[], from: Km, g: Group): Pass[] {
  const sorted = [...list].sort((a, b) => reach(a, from) - reach(b, from) || compareFinal(a.place, b.place));
  const nearest = sorted[0];
  if (!nearest) return [];
  const better = g.preferred ? sorted.find((s) => g.preferred!(s.place)) : undefined;
  return better && better !== nearest ? [better, nearest] : [nearest];
}

// A place's prepared hours, the first for its id, as `find` gives it; looked up once per list, not once per row (PERF-SCREEN).
const FIRST_HOURS = new WeakMap<readonly unknown[], Map<string, HelpFacts['hours'][number]>>();
function firstHoursOf(f: HelpFacts, id: string): HelpFacts['hours'][number] | undefined {
  let byId = FIRST_HOURS.get(f.hours);
  if (!byId) {
    byId = new Map();
    for (const h of f.hours) if (!byId.has(h.placeId)) byId.set(h.placeId, h);
    FIRST_HOURS.set(f.hours, byId);
  }
  return byId.get(id);
}

function hoursLine(f: HelpFacts, s: Pass, at: Date, tz: string): { status: Status; line: string; unworked: boolean } {
  const h = firstHoursOf(f, s.place.id);
  const st = stateAt(h, at);
  const unworked = !h || !(at.getTime() >= h.windowStart.getTime() && at.getTime() < h.windowEnd.getTime());
  if (st.state === 'open') return { status: 'fine', line: st.until ? W.helpOpenUntil(formatHm(st.until, tz)) : W.helpOpenOnArrival, unworked };
  if (st.state === 'closed') return { status: 'warning', line: W.stopClosedOnArrival, unworked };
  return { status: 'unknown', line: st.reason ?? W.foodHoursUnknown, unworked };
}

function sunsetLine(f: HelpFacts, schedule: Schedule, km: Km, at: Date, tz: string): { status: Status; line: string[] } {
  const p = pointAtRouteKm(f.trip.route, km);
  const { sunset, sunrise } = f.sun(p.lat, p.lon, schedule.rideOf(km).date);
  if (!sunset || !validDate(sunset)) return { status: 'unknown', line: [] };
  const hm = formatHm(sunset, tz);
  if (sunrise && at.getTime() < sunrise.getTime()) return { status: 'warning', line: [W.helpBeforeSunrise(formatHm(sunrise, tz)), W.helpSunset(hm)] };
  return at.getTime() <= sunset.getTime() ? { status: 'fine', line: [W.helpSunset(hm)] } : { status: 'warning', line: [W.helpAfterSunset(hm)] };
}

type Row = { item: AnswerItem; pass: Pass; unworked: boolean; reach: number; called: boolean };

export function helpChip(kind: HelpKind, f: HelpFacts): Answer {
  const places = new Map(f.places.map((p) => [p.id, p]));
  const newest = newestMapDate(f);
  const date = shortMapDate(newest);
  const basis = [W.waterBasisOsm, ...(date ? [W.stopMapDate(date)] : [])];
  const dataDates: Record<string, string> = newest === null ? {} : { places: newest };
  const freshness = { dataDates, stale: false };
  const start = chipStart(f.ride, f.trip, f.positions);
  if (!usableFlatKph(f.trip.flatKph) || !validDate(f.now) || !Number.isFinite(start.aheadKm) || !Number.isFinite(start.behindKm)) {
    return makeAnswer({ topic: 'help', status: 'unknown', title: W.helpCantWorkOut, stamp: null, detail: '', items: [], basis, freshness });
  }
  const env = { sun: f.sun, routeZones: f.routeZones };
  const schedule = nowSchedule(chipRide(f.ride, f.trip, f.positions), f.trip, f.now, env);
  const zone = zoneLookupOf(f.routeZones);
  const zoneOf = (s: Pass): string => {
    if (isKnownZone(s.place.timeZone)) return s.place.timeZone;
    const tz = zone(s.match.km).timeZone;
    return isKnownZone(tz) ? tz : 'UTC';
  };
  const isTrain = kind === 'train';

  const rowOf = (s: Pass, side: 'ahead' | 'behind' | 'near', g: Group): Row => {
    const tz = zoneOf(s);
    const arrival = side === 'behind' ? schedule.behind(s.match) : schedule.atPlace(s.match);
    const off = Math.round(s.match.offRouteM);
    const label = `${g.label ? g.label(s.place) : nameOf(s.place)} · ${off > 0 ? W.stopKmOff(showKm(s.match.km), String(off)) : W.stopKm(showKm(s.match.km))}`;
    const where = side === 'near' ? [W.waterNearYou]
      : side === 'ahead' ? [W.weatherStampAhead(showKm(s.match.km - start.aheadKm)), formatAbout(arrival, tz)]
        : [W.waterBack(showKm(start.behindKm - s.match.km)), formatAbout(arrival, tz)];
    const hours = g.hasHours ? hoursLine(f, s, side === 'near' ? f.now : arrival, tz) : null;
    const sun = isTrain && side !== 'near' ? sunsetLine(f, schedule, s.match.km, arrival, tz) : null;
    const status: Status = side === 'near' ? 'unknown' : hours?.status ?? g.status?.(s.place) ?? (sun && sun.status !== 'unknown' ? sun.status : 'fine');
    const stamp = side === 'near' ? { km: s.match.km } : { km: s.match.km, at: arrival };
    const contact = s.place.contact && (s.place.contact.phones.length > 0 || s.place.contact.website) ? { contact: s.place.contact } : {};
    // Call ahead (section 6.13): a bike shop shows its Call and Website, or says it has none mapped.
    const calls = callAhead(s.place);
    const links = linksOf(calls);
    const detail = [
      ...where, ...(sun?.line ?? []), ...(hours ? [hours.line] : []), ...(g.lines?.(s.place) ?? []), ...(isTrain ? [W.helpStationOnly] : []), ...callPartsOf(calls),
    ].join(' · ');
    return {
      item: { label, stamp, status, detail, ...contact, ...(links.length > 0 ? { links } : {}) }, pass: s, unworked: hours?.unworked ?? false, called: hasCallData(calls),
      reach: side === 'near' ? rejoinKm(s.match.offRouteM) : reach(s, side === 'behind' ? start.behindKm : start.aheadKm),
    };
  };

  const lengthKm = f.trip.route.lengthKm;
  const inside = (s: Pass): boolean => start.aheadKm < start.behindKm && s.match.km >= start.aheadKm && s.match.km <= start.behindKm;
  const rows: Row[] = [];
  const noneLines: string[] = [];
  const firsts: Row[] = [];
  GROUPS[kind].forEach((g, index) => {
    const passes: Pass[] = [];
    for (const m of f.matches) {
      const place = places.get(m.placeId);
      // A place mapped access=private or no is no help to a passing rider (a private funicular halt, finding 14 of 14 Nov 2026).
      if (!place || !g.counts(place) || (closedAccess(place.tags['access']) && place.kind !== 'hospital')) continue;
      // Written so that a broken kilometre or distance fails.
      const onRoute = m.km >= 0 && m.km <= lengthKm;
      if (onRoute && m.offRouteM >= 0 && m.offRouteM <= radiusKmFor(place) * 1000) passes.push({ place, match: m });
    }
    const ahead = picks(passes.filter((s) => s.match.km >= start.aheadKm && !inside(s)), start.aheadKm, g).map((s) => rowOf(s, 'ahead', g));
    const behind = picks(passes.filter((s) => s.match.km < start.behindKm && !inside(s)), start.behindKm, g).map((s) => rowOf(s, 'behind', g));
    const near = picks(passes.filter(inside), start.aheadKm, g).map((s) => rowOf(s, 'near', g));
    rows.push(...ahead, ...behind, ...near);
    if (index === 0) {
      // A place inside the radius may lie either way, so neither side can be called empty.
      if (near.length === 0 && ahead.length === 0) noneLines.push(W.helpNoneAhead(g.what));
      if (near.length === 0 && behind.length === 0) noneLines.push(W.helpNoneBehind(g.what));
      firsts.push(...ahead, ...behind, ...near);
    }
  });

  // The source line under the first item with a number or website (section 6.13).
  const firstCalled = rows.find((r) => r.called);
  const calledDate = firstCalled ? shortMapDate(firstCalled.pass.place.dataDate) : null;
  if (firstCalled) firstCalled.item.detail = [firstCalled.item.detail ?? '', calledDate ? W.callAsMapped(calledDate) : W.emergencyMappedNoDate].filter(Boolean).join(' · ');

  const saved = savedCovers(f, Math.min(start.aheadKm, start.behindKm), Math.max(start.aheadKm, start.behindKm));
  const missing: Missing[] = [...(saved ? [] : ['places' as const]), ...(rows.some((r) => r.unworked) ? ['hours' as const] : [])];

  const group = GROUPS[kind][0]!;
  // The title says "nearest", so it names the nearest; what is preferred comes first in the list.
  const first = [...firsts].sort((a, b) => a.reach - b.reach || compareFinal(a.pass.place, b.pass.place))[0];
  const firstPlace = first?.pass.place;
  const title = first && firstPlace
    ? W.helpNearest(wordOf(firstPlace), hasName(firstPlace) ? firstPlace.name : W.helpNoName, showKm(first.pass.match.km))
    : !saved && rows.length === 0 ? W.helpNoPlaceData : W.helpNone(group.what);
  const detail = [
    ...(isTrain ? [W.helpStationOnly] : []),
    ...(start.position ? [] : [W.helpFromNoPosition(showKm(start.aheadKm))]),
    ...(first ? noneLines : []),
    ...fromNowNote(f.ride, f.now, zone(start.aheadKm).timeZone),
  ].join(' ');
  return makeAnswer({
    topic: 'help', status: first ? first.item.status : 'unknown', title, stamp: first ? first.item.stamp : null,
    detail, items: rows.map((r) => r.item), basis, freshness, missing,
  });
}

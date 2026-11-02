// The help chips (spec section 6.9): bike shop, pharmacy, bail out by train, toilets. Each rides there now from the position,
// in every phase (section 6.2a), ahead and behind. A place reached on two passes is judged on each pass.
import { compareFinal, formatAbout, formatHm, makeAnswer } from '../answers/index.ts';
import { isKnownZone } from '../answers/time.ts';
import { pointAtRouteKm } from '../geo/project.ts';
import { stateAt } from '../hours/check.ts';
import { radiusKmFor } from '../route/matches.ts';
import type { Answer, AnswerItem, DayRide, Km, Missing, Place, PlaceKind, RouteMatch, ScreenInputs, Status } from '../types.ts';
import { shortMapDate, showKm, W } from '../wording/en.ts';
import { savedCovers } from './covers.ts';
import { rejoinKm } from './locate.ts';
import { usableFlatKph, type Schedule } from './pace.ts';
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
const nameOf = (p: Place): string => (typeof p.name === 'string' && p.name.trim() !== '' ? p.name : wordOf(p));
const closedAccess = (value: string | undefined): boolean => value === 'private' || value === 'no';

const repairLine = (p: Place): string => {
  const v = p.tags['service:bicycle:repair'];
  return v === 'yes' ? W.helpRepairsMapped : v === 'no' ? W.helpNoRepairs : W.helpRepairsNotMapped;
};
const valveLine = (p: Place): string => (p.tags['valves'] ? W.helpValves(p.tags['valves']) : W.helpValvesNotMapped);
const departmentYes = (p: Place): boolean => p.tags['emergency'] === 'yes';

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
      what: W.helpWordHospital, counts: (p) => p.kind === 'hospital' && p.tags['emergency'] !== 'no', preferred: departmentYes,
      lines: (p) => [departmentYes(p) ? W.helpEmergencyDepartment : W.helpEmergencyUnknown],
      status: (p) => (departmentYes(p) ? 'fine' : 'unknown'),
    },
  ],
  train: [
    { what: W.helpWordStation, counts: isKind('station'), preferred: (p) => p.tags['railway'] !== 'halt' },
  ],
  toilets: [
    {
      what: W.helpWordToilets, counts: (p) => (p.kind === 'toilets' || p.stop?.toilets === true) && !closedAccess(toiletsAccess(p)), hasHours: true,
      label: (p) => (p.kind === 'toilets' ? nameOf(p) : W.helpToiletsAt(nameOf(p))), lines: (p) => [accessLine(p), feeLine(p)],
    },
  ],
};

const validDate = (d: Date): boolean => Number.isFinite(d.getTime());

const reach = (s: Pass, from: Km): number => Math.abs(s.match.km - from) + rejoinKm(s.match.offRouteM);

/** The nearest pass on one side, and the nearest of the preferred before it when that is another one. */
function picks(list: Pass[], from: Km, g: Group): Pass[] {
  const sorted = [...list].sort((a, b) => reach(a, from) - reach(b, from) || compareFinal(a.place, b.place));
  const nearest = sorted[0];
  if (!nearest) return [];
  const better = g.preferred ? sorted.find((s) => g.preferred!(s.place)) : undefined;
  return better && better !== nearest ? [better, nearest] : [nearest];
}

function hoursLine(f: HelpFacts, s: Pass, at: Date, tz: string): { status: Status; line: string; unworked: boolean } {
  const h = f.hours.find((x) => x.placeId === s.place.id);
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

type Row = { item: AnswerItem; pass: Pass; unworked: boolean; reach: number };

export function helpChip(kind: HelpKind, f: HelpFacts): Answer {
  const places = new Map(f.places.map((p) => [p.id, p]));
  const dates = f.places.map((p) => p.dataDate).filter((d) => shortMapDate(d) !== null).sort();
  const newest = dates[dates.length - 1] ?? null;
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
    const detail = [...where, ...(sun?.line ?? []), ...(hours ? [hours.line] : []), ...(g.lines?.(s.place) ?? []), ...(isTrain ? [W.helpStationOnly] : [])].join(' · ');
    return {
      item: { label, stamp, status, detail, ...contact }, pass: s, unworked: hours?.unworked ?? false,
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
      if (!place || !g.counts(place)) continue;
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

  const saved = savedCovers(f, Math.min(start.aheadKm, start.behindKm), Math.max(start.aheadKm, start.behindKm));
  const missing: Missing[] = [...(saved ? [] : ['places' as const]), ...(rows.some((r) => r.unworked) ? ['hours' as const] : [])];

  const group = GROUPS[kind][0]!;
  // The title says "nearest", so it names the nearest; what is preferred comes first in the list.
  const first = [...firsts].sort((a, b) => a.reach - b.reach || compareFinal(a.pass.place, b.pass.place))[0];
  const title = first
    ? W.helpNearest(wordOf(first.pass.place), nameOf(first.pass.place), showKm(first.pass.match.km))
    : !saved && rows.length === 0 ? W.helpNoPlaceData : W.helpNone(group.what);
  const detail = [
    ...(isTrain ? [W.helpStationOnly] : []),
    ...(start.position ? [] : [W.helpFromNoPosition(showKm(start.aheadKm))]),
    ...(first ? noneLines : []),
  ].join(' ');
  return makeAnswer({
    topic: 'help', status: first ? first.item.status : 'unknown', title, stamp: first ? first.item.stamp : null,
    detail, items: rows.map((r) => r.item), basis, freshness, missing,
  });
}

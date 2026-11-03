// Which country, time zone and holiday zone a place lies in, from the bundled boundary file (spec section 5, plan Task 8).
// Pure: the file comes in as an argument. An area's rings count even-odd, so holes and exclaves need nothing special, and the
// first area holding a point is the one that counts: the local zones come first in the file.
import { haversineKm } from '../geo/haversine.ts';
import type { Route, ZoneSpan } from '../types.ts';

export type BoundaryArea = { country: string; holidayZone: string; timeZone: string; rings: number[][][] };
export type BoundaryFile = { v: 1; source: string; areas: BoundaryArea[] };
export type Zone = { country: string; holidayZone: string; timeZone: string };

/** A place in no area joins the nearest zone found along the route, within this. */
const JOIN_KM = 5;
/** A shorter stretch is the file's rounding, or a route along a border: it goes to its neighbours. */
const MIN_SPAN_KM = 0.1;
/** Route points further apart than this are looked between. */
const WALK_KM = 0.25;
/** How close two looks are when a border between them has been found. */
const CUT_KM = 0.02;
/** One band of latitude of the index, in degrees. */
const BAND_DEG = 0.1;

type IndexedArea = { area: BoundaryArea; south: number; north: number; west: number; east: number; bands: Map<number, number[]> };

const indexes = new WeakMap<BoundaryFile, IndexedArea[]>();

function indexOf(file: BoundaryFile): IndexedArea[] {
  const kept = indexes.get(file);
  if (kept) return kept;
  const out = file.areas.map((area): IndexedArea => {
    const bands = new Map<number, number[]>();
    let south = Infinity;
    let north = -Infinity;
    let west = Infinity;
    let east = -Infinity;
    for (const ring of area.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const [ax, ay] = a as [number, number];
        const [bx, by] = b as [number, number];
        south = Math.min(south, ay);
        north = Math.max(north, ay);
        west = Math.min(west, ax);
        east = Math.max(east, ax);
        if (ay === by) continue;
        const from = Math.floor(Math.min(ay, by) / BAND_DEG);
        const to = Math.floor(Math.max(ay, by) / BAND_DEG);
        for (let band = from; band <= to; band++) {
          let list = bands.get(band);
          if (!list) bands.set(band, list = []);
          list.push(ax, ay, bx, by);
        }
      }
    }
    return { area, south, north, west, east, bands };
  });
  indexes.set(file, out);
  return out;
}

function holds(a: IndexedArea, lat: number, lon: number): boolean {
  if (lat < a.south || lat > a.north || lon < a.west || lon > a.east) return false;
  const edges = a.bands.get(Math.floor(lat / BAND_DEG));
  if (!edges) return false;
  let inside = false;
  for (let i = 0; i < edges.length; i += 4) {
    const ax = edges[i]!;
    const ay = edges[i + 1]!;
    const bx = edges[i + 2]!;
    const by = edges[i + 3]!;
    if ((ay > lat) !== (by > lat) && lon < ax + ((lat - ay) * (bx - ax)) / (by - ay)) inside = !inside;
  }
  return inside;
}

const zoneOf = (a: BoundaryArea): Zone => ({ country: a.country, holidayZone: a.holidayZone, timeZone: a.timeZone });

/** The country of the file's last area: outside the first countries, known as such. */
export const OUTSIDE_COUNTRY = 'XX';
const OUT = 'outside' as const;

/** The zone of a point, `outside` in the outside area, null in no area at all (a gap in the shapes). */
function placeOf(lat: number, lon: number, file: BoundaryFile): Zone | typeof OUT | null {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null; // written so that NaN fails
  for (const a of indexOf(file)) if (holds(a, lat, lon)) return a.area.country === OUTSIDE_COUNTRY ? OUT : zoneOf(a.area);
  return null;
}

/** The zone of a point; null outside the first countries. */
export function zoneAt(lat: number, lon: number, file: BoundaryFile): Zone | null {
  const z = placeOf(lat, lon, file);
  return z === OUT ? null : z;
}

/** The time zone of the area with the nearest corner: for a place in none, where only a clock is asked of it. */
function nearestTimeZone(lat: number, lon: number, file: BoundaryFile): string {
  let best = Infinity;
  let zone = file.areas[0]?.timeZone ?? 'UTC';
  for (const area of file.areas) {
    if (area.country === OUTSIDE_COUNTRY) continue;
    for (const ring of area.rings) {
      for (const c of ring) {
        const d = haversineKm({ lat, lon }, { lat: c[1]!, lon: c[0]! });
        if (d < best) {
          best = d;
          zone = area.timeZone;
        }
      }
    }
  }
  return zone;
}

type Found = Zone | typeof OUT | null;
type Look = { km: number; lat: number; lon: number; zone: Found };

const sameZone = (a: Found, b: Found): boolean => (a === null || b === null || a === OUT || b === OUT ? a === b : a.holidayZone === b.holidayZone && a.country === b.country && a.timeZone === b.timeZone);

/** The looks along the route: each route point, and steps between far ones, with a border found to within `CUT_KM`. */
function walk(route: Route, file: BoundaryFile): Look[] {
  const looks: Look[] = [];
  const look = (lat: number, lon: number, km: number): Look => ({ km, lat, lon, zone: placeOf(lat, lon, file) });
  const between = (a: Look, b: Look, out: Look[]): void => {
    if (sameZone(a.zone, b.zone) || b.km - a.km <= CUT_KM) return;
    const mid = look((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, (a.km + b.km) / 2);
    between(a, mid, out);
    out.push(mid);
    between(mid, b, out);
  };
  route.points.forEach((p, i) => {
    const here = look(p.lat, p.lon, p.km);
    const before = looks.at(-1);
    if (before) {
      const prev = route.points[i - 1]!;
      const steps = Math.ceil((p.km - prev.km) / WALK_KM);
      let last = before;
      for (let s = 1; s < steps; s++) {
        const f = s / steps;
        const step = look(prev.lat + (p.lat - prev.lat) * f, prev.lon + (p.lon - prev.lon) * f, prev.km + (p.km - prev.km) * f);
        between(last, step, looks);
        looks.push(step);
        last = step;
      }
      between(last, here, looks);
    }
    looks.push(here);
  });
  return looks;
}

/**
 * The route's stretches, cut at each change along it, covering it with no gap or overlap. A point in the outside area is `XX`,
 * with the nearest clock. A point in no area, a gap in the shapes, joins the nearest look along the route within 5 km, unless
 * that look is outside; further from any it is `XX` too.
 * No stretch under 100 m stays, unless it's the whole route: a route along a border doesn't flip back and forth.
 */
export function routeZones(route: Route, file: BoundaryFile): ZoneSpan[] {
  const looks = walk(route, file);
  const known = looks.filter((l) => l.zone !== null);
  let nextKnown = 0;
  type Kept = { km: number; zone: Zone | null };
  const settled: Kept[] = looks.map((l) => {
    // Outside the first countries is known, and never joined to a neighbour: 112 and the fallback line there.
    if (l.zone === OUT) return { km: l.km, zone: null };
    if (l.zone) return { km: l.km, zone: l.zone };
    while (nextKnown < known.length && known[nextKnown]!.km < l.km) nextKnown++;
    const after = known[nextKnown];
    const before = known[nextKnown - 1];
    const dAfter = after ? after.km - l.km : Infinity;
    const dBefore = before ? l.km - before.km : Infinity;
    const near = dBefore <= dAfter ? before : after;
    const joined = near && Math.min(dBefore, dAfter) <= JOIN_KM ? near.zone : null;
    return { km: l.km, zone: joined === OUT ? null : joined };
  });

  // Runs of one zone. A run ends where the next begins, at the middle of the last two looks.
  type Run = { fromKm: number; toKm: number; zone: Zone | null };
  const runs: Run[] = [];
  settled.forEach((s, i) => {
    const last = runs.at(-1);
    if (last && sameZone(last.zone, s.zone)) return;
    const cut = i === 0 ? 0 : (settled[i - 1]!.km + s.km) / 2;
    if (last) last.toKm = cut;
    runs.push({ fromKm: cut, toKm: route.lengthKm, zone: s.zone });
  });

  // The shortest under the limit goes first, to the longer of its neighbours, until none is left.
  for (;;) {
    let shortest = -1;
    runs.forEach((r, i) => {
      if (r.toKm - r.fromKm < MIN_SPAN_KM && (shortest < 0 || r.toKm - r.fromKm < runs[shortest]!.toKm - runs[shortest]!.fromKm)) shortest = i;
    });
    if (shortest < 0 || runs.length === 1) break;
    const r = runs[shortest]!;
    const left = runs[shortest - 1];
    const right = runs[shortest + 1];
    const toLeft = left !== undefined && (right === undefined || left.toKm - left.fromKm >= right.toKm - right.fromKm);
    if (toLeft) left.toKm = r.toKm;
    else right!.fromKm = r.fromKm;
    runs.splice(shortest, 1);
    // Two neighbours of one zone, now side by side, are one.
    for (let i = runs.length - 1; i > 0; i--) {
      if (sameZone(runs[i - 1]!.zone, runs[i]!.zone)) {
        runs[i - 1]!.toKm = runs[i]!.toKm;
        runs.splice(i, 1);
      }
    }
  }

  return runs.map((r) => {
    if (r.zone) return { fromKm: r.fromKm, toKm: r.toKm, country: r.zone.country, holidayZone: r.zone.holidayZone, timeZone: r.zone.timeZone };
    const p = looks.find((l) => l.km >= r.fromKm) ?? looks[0]!;
    return { fromKm: r.fromKm, toKm: r.toKm, country: 'XX', holidayZone: null, timeZone: nearestTimeZone(p.lat, p.lon, file) };
  });
}

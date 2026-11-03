// Refresh this stretch (spec section 5): a live OpenStreetMap query of one stretch, only after the rider's yes to a notice.
// The public Overpass service is not a backend for an app, so at most 50 km go, as a simplified line, one request at a time,
// and it is given room when it refuses. Places are classified on the phone by the pipeline's own code (classify-all.ts).
import { addDaysIso, instantAt, localIsoDate } from '../core/answers/time.ts';
import { zoneLookupOf } from '../core/engines/tripday.ts';
import { pointAtRouteKm } from '../core/geo/project.ts';
import { buildSegmentIndex } from '../core/geo/index.ts';
import { kitchenHoursId } from '../core/hours/check.ts';
import { holidaysFor } from '../core/hours/holidays.ts';
import type { RuleClass } from '../core/hours/rules.ts';
import { classifyAll, keepPolygons, objectOf } from '../core/places/classify-all.ts';
import type { ClassifyOptions, Zone } from '../core/places/classify.ts';
import type { CountryCode } from '../core/places/countries.ts';
import { PLACE_FILTERS } from '../core/places/filters.ts';
import { kindOf } from '../core/places/classify.ts';
import type { OsmObject, PackRescuePoint, Place, Roof } from '../core/places/types.ts';
import { matchPlaces, matchRescuePoints, matchRoofs, radiusKmFor } from '../core/route/matches.ts';
import type { Km, PlaceHours, Route } from '../core/types.ts';
import { showKm, W } from '../core/wording/en.ts';
import type { FetchLike } from './openmeteo.ts';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export const MAX_STRETCH_KM = 50;
const SIMPLIFY_M = 100;
const QUERY_TIMEOUT_S = 90;
const FETCH_TIMEOUT_MS = 120_000;
const TOO_MANY_WAIT_MS = 30_000;
const MAX_TOO_MANY_WAIT_MS = 300_000;
const MAX_TOO_MANY = 2;
const FIRST_BACKOFF_MS = 5_000;
const MIN_HALVED_KM = 6;
const MAX_REQUESTS = 10;
const NO_DATE_WINDOW_DAYS = 14;
const M_PER_DEG = 111_320;

type LineStop = { lat: number; lon: number };

/** Douglas-Peucker on a flat picture of the line, good enough over 50 km: no point is further than `toleranceM` from the result. */
export function simplifyLine(points: LineStop[], toleranceM: number): LineStop[] {
  if (points.length < 3) return points;
  const cos = Math.cos((points[0]!.lat * Math.PI) / 180);
  const x = (p: LineStop): number => p.lon * M_PER_DEG * cos;
  const y = (p: LineStop): number => p.lat * M_PER_DEG;
  const keep = new Set<number>([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay, bx, by] = [x(points[first]!), y(points[first]!), x(points[last]!), y(points[last]!)];
    const [dx, dy] = [bx - ax, by - ay];
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let at = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = [x(points[i]!) - ax, y(points[i]!) - ay];
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > toleranceM) {
      keep.add(at);
      stack.push([first, at], [at, last]);
    }
  }
  return points.filter((_, i) => keep.has(i));
}

/** The stretch's outline, as it leaves the phone: simplified at 100 m, 4 decimals. */
export function stretchLine(route: Route, fromKm: Km, toKm: Km): string[] {
  const inside = route.points.filter((p) => p.km > fromKm && p.km < toKm);
  const line = simplifyLine([pointAtRouteKm(route, fromKm), ...inside, pointAtRouteKm(route, toKm)], SIMPLIFY_M);
  const texts = line.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`);
  return texts.filter((t, i) => t !== texts[i - 1]);
}

// How far around the line each tag set matters: the radius of the kind it makes (section 6.0), or of what it supports.
const SUPPORT_KM = new Map<string, number>([
  ['highway=emergency_access_point', 3], ['emergency=access_point', 3], // rescue points are kept up to 3 km off
]);
const OTHER_SUPPORT_KM = 1; // bus stops, bike parking, cemeteries, fuel stations; and platforms, as a station's roof counts only within 300 m

export function radiusFor(key: string, value: string): number {
  const support = SUPPORT_KM.get(`${key}=${value}`);
  if (support !== undefined) return support;
  const kind = kindOf({ [key]: value }, { drinkPlaces: true, settlementAltNames: false });
  return kind === null ? OTHER_SUPPORT_KM : radiusKmFor({ kind } as Place);
}

/** One statement per tag key and radius, and the cemetery and campsite areas with the rest. Ways and relations come with their geometry. */
export function stretchQuery(line: string[]): string {
  const groups = new Map<string, { key: string; km: number; values: string[] }>();
  for (const { key, values } of PLACE_FILTERS) {
    for (const value of values) {
      const km = radiusFor(key, value);
      const id = `${key}|${km}`;
      const group = groups.get(id);
      if (group) group.values.push(value);
      else groups.set(id, { key, km, values: [value] });
    }
  }
  const around = line.join(',');
  const statements = [...groups.values()].map((g) => `nwr["${g.key}"~"^(${g.values.join('|')})$"](around:${g.km * 1000},${around});`);
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(${statements.join('')});out geom;`;
}

type Coord = { lat: number; lon: number };
export type OverpassElement = {
  type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: (Coord | null)[];
  members?: { type: string; role: string; geometry?: (Coord | null)[] }[];
};

const pairs = (g: (Coord | null)[] | undefined): [number, number][] => (g ?? []).filter((c): c is Coord => c !== null).map((c) => [c.lat, c.lon]);
const same = (a: [number, number] | undefined, b: [number, number] | undefined): boolean => a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1];

/** A relation's member ways joined end to end into closed rings. What doesn't close is no ring. */
function ringsOf(lines: [number, number][][]): [number, number][][] {
  const open = lines.filter((l) => l.length > 1).map((l) => [...l]);
  const rings: [number, number][][] = [];
  while (open.length > 0) {
    const ring = open.shift()!;
    for (let grown = true; grown && !same(ring[0], ring[ring.length - 1]);) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const l = open[i]!;
        if (same(ring[ring.length - 1], l[0])) ring.push(...l.slice(1));
        else if (same(ring[ring.length - 1], l[l.length - 1])) ring.push(...[...l].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

/** An Overpass element as the pipeline's reader makes the same object from osmium: `n1`, `w1`, `r1`, a closed way a polygon. */
export function objectFromElement(e: OverpassElement): OsmObject | null {
  const tags = Object.fromEntries(Object.entries(e.tags ?? {}).filter(([, v]) => typeof v === 'string'));
  if (e.type === 'node') return typeof e.lat === 'number' && typeof e.lon === 'number' ? objectOf(`n${e.id}`, tags, [[e.lat, e.lon]], null) : null;
  if (e.type === 'way') {
    const vertices = pairs(e.geometry);
    if (vertices.length === 0) return null;
    const closed = vertices.length >= 4 && same(vertices[0], vertices[vertices.length - 1]);
    return objectOf(`w${e.id}`, tags, vertices, closed ? [vertices] : null);
  }
  if (e.type === 'relation') {
    const rings = ringsOf((e.members ?? []).filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner' || m.role === '')).map((m) => pairs(m.geometry)));
    return rings.length > 0 ? objectOf(`r${e.id}`, tags, rings.flat(), rings) : null;
  }
  return null;
}

/** Elements in, places out, by the pipeline's code. Only `source` differs from what the pipeline would write. */
export function classifyElements(elements: OverpassElement[], zoneOf: (lat: number, lon: number) => Zone | null, date: string, opts: ClassifyOptions): { places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] } {
  const objects = elements.map(objectFromElement).filter((o) => o !== null);
  const out = classifyAll(keepPolygons(objects), zoneOf, date, opts);
  return { ...out, places: out.places.map((p) => ({ ...p, source: 'overpass' as const })) };
}

export type BoundaryZone = { country: string; holidayZone: string | null; timeZone: string };

/**
 * The classifier's zone from what the bundled boundary file says (Task 8's `zoneAt`). The boundary file's holiday zone is the
 * region key where a country has regional holidays, a local zone inside one (`DE-BY-Augsburg`), or the country code.
 */
export function zoneFromBoundary(z: BoundaryZone): Zone {
  const zone = z.holidayZone ?? z.country;
  const region = zone === z.country ? null : /^[A-Z]{2}-[^-]+/.exec(zone)?.[0] ?? null;
  return { country: z.country as CountryCode, subdivision: region, hoursRegionKey: region, holidayZone: zone, timeZone: z.timeZone };
}

const KEPT_ZONE = ['country', 'subdivision', 'hoursRegionKey', 'holidayZone', 'timeZone'] as const;
const withPackZones = (p: Place, pack: Place | undefined): Place => {
  if (!pack) return p;
  const out = { ...p };
  for (const k of KEPT_ZONE) (out as Record<string, unknown>)[k] = pack[k];
  return out;
};

/** What the hours rules read of a place's kind. */
export function ruleClassOf(p: Place): RuleClass {
  const shop = p.tags['shop'];
  const kind: RuleClass['kind'] = p.kind === 'fuel_shop' ? 'fuel-shop' : shop === 'bakery' ? 'bakery' : shop === 'kiosk' ? 'kiosk'
    : p.kind === 'shop' ? 'food-shop' : p.kind === 'bike_shop' || p.kind === 'pharmacy' ? 'other-shop' : 'other';
  return { kind, nearStation: false };
}

const hoursWindow = (state: StretchState, now: Date, tz: string): { from: string; to: string; start: Date; end: Date } => {
  const today = localIsoDate(now, tz);
  const departure = state.departureDate;
  const from = departure !== null && departure > today ? departure : today;
  const lastDay = state.route.stages.reduce((most, s) => Math.max(most, s.day), 1);
  const planned = departure === null ? addDaysIso(today, NO_DATE_WINDOW_DAYS) : addDaysIso(departure, lastDay);
  const to = planned > from ? planned : addDaysIso(from, 1);
  return { from, to, start: instantAt(from, '00:00', tz), end: instantAt(to, '00:00', tz) };
};

/** Hour spans for the trip window, worked out on the phone. The library stays a lazy chunk. */
async function workOutHours(places: Place[], state: StretchState, now: Date, tz: string): Promise<{ hours: PlaceHours[]; holidays: Record<string, string[]> }> {
  const window = hoursWindow(state, now, tz);
  const zones = [...new Set(places.map((p) => p.holidayZone ?? p.hoursRegionKey ?? p.country))];
  const holidays = holidaysFor(zones, window.from, window.to);
  const { placeSpans } = await import('../core/hours/spans.ts');
  const cache = new Map<string, ReturnType<typeof placeSpans>>();
  const hours: PlaceHours[] = [];
  for (const p of places) {
    const rule = ruleClassOf(p);
    const spans = (tag: string | null): ReturnType<typeof placeSpans> => placeSpans(tag, p, rule, instantAt(window.from, '00:00', p.timeZone), instantAt(window.to, '00:00', p.timeZone), holidays, cache);
    hours.push({ placeId: p.id, windowStart: instantAt(window.from, '00:00', p.timeZone), windowEnd: instantAt(window.to, '00:00', p.timeZone), spans: spans(p.openingHours) });
    if (p.stop?.kitchenHours) hours.push({ placeId: kitchenHoursId(p.id), windowStart: instantAt(window.from, '00:00', p.timeZone), windowEnd: instantAt(window.to, '00:00', p.timeZone), spans: spans(p.stop.kitchenHours) });
  }
  return { hours, holidays };
}

export type StretchState = { route: Route; departureDate: string | null; routeZones: Parameters<typeof zoneLookupOf>[0] };
export type StretchStore = {
  read(): Promise<StretchState | null>;
  known(ids: string[]): Promise<Map<string, Place>>;
  save(routeId: string, batch: {
    fromKm: Km; toKm: Km; date: string; places: Place[]; matches: ReturnType<typeof matchPlaces>; roofs: Roof[]; rescuePoints: ReturnType<typeof matchRescuePoints>; hours: PlaceHours[]; holidays: Record<string, string[]>;
  }): Promise<boolean>;
};

export type StretchDeps = {
  /** Shows the notice, and answers the rider's yes. Nothing is sent before a true. */
  askNotice: (notice: string) => Promise<boolean>;
  fetch: FetchLike; now: () => Date; sleep: (ms: number) => Promise<void>; store: StretchStore;
  /** Task 8's `zoneAt`, over the bundled boundary file: null outside the first countries. */
  zoneAt: (lat: number, lon: number) => BoundaryZone | null;
  /** Whether the current build's kinds list carries drink places (section 5a step 11). */
  drinkPlaces: boolean;
};

type Range = { fromKm: Km; toKm: Km };
export type StretchReport = {
  status: 'declined' | 'busy' | 'nothing' | 'saved' | 'partial' | 'failed' | 'storage';
  saved: Range[]; failed: (Range & { reason: string })[]; places: number; say: string | null;
};

type Asked = { kind: 'ok'; elements: OverpassElement[] } | { kind: 'empty' } | { kind: 'too-many'; waitMs: number } | { kind: 'server'; reason: string } | { kind: 'refused'; reason: string };

async function ask(query: string, f: FetchLike): Promise<Asked> {
  let response: Response;
  try {
    response = await f(OVERPASS_URL, {
      method: 'POST', body: `data=${encodeURIComponent(query)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' },
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'server', reason: 'no answer' };
  }
  if (response.status === 429) {
    const said = Number(response.headers.get('retry-after')) * 1000;
    return { kind: 'too-many', waitMs: Math.min(MAX_TOO_MANY_WAIT_MS, Math.max(TOO_MANY_WAIT_MS, Number.isFinite(said) ? said : 0)) };
  }
  if (response.status >= 500) return { kind: 'server', reason: `HTTP ${response.status}` };
  if (!response.ok) return { kind: 'refused', reason: `HTTP ${response.status}` };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: 'server', reason: 'not JSON' };
  }
  const b = body as { elements?: unknown; remark?: unknown } | null;
  // A timeout or lack of memory comes back as 200, with what was found so far and a remark: a part of the stretch is no stretch.
  if (typeof b?.remark === 'string' && /error/i.test(b.remark)) return { kind: 'server', reason: 'runtime error' };
  if (!Array.isArray(b?.elements)) return { kind: 'server', reason: 'no elements' };
  // Nothing at all, not even a village within 5 km, isn't believed. Measured on 3 November 2026: of the service's two servers, one
  // answered a good query with 200 and no elements, the other with 148. Recorded, that would read as a stretch without water.
  if (b.elements.length === 0) return { kind: 'empty' };
  return { kind: 'ok', elements: b.elements as OverpassElement[] };
}

async function batchOf(elements: OverpassElement[], range: Range, state: StretchState, deps: StretchDeps): Promise<Parameters<StretchStore['save']>[1]> {
  const now = deps.now();
  const lookup = zoneLookupOf(state.routeZones);
  const here = lookup(range.fromKm);
  const date = localIsoDate(now, here.timeZone);
  // Outside the first countries a place still counts: the country isn't known, its zone is the route's.
  const fallback = zoneFromBoundary({ country: 'XX', holidayZone: null, timeZone: here.timeZone });
  const zoneOf = (lat: number, lon: number): Zone => {
    const z = deps.zoneAt(lat, lon);
    return z ? zoneFromBoundary(z) : { ...fallback };
  };
  const found = classifyElements(elements, zoneOf, date, { drinkPlaces: deps.drinkPlaces, settlementAltNames: false });
  const pack = await deps.store.known(found.places.map((p) => p.id));
  const idx = buildSegmentIndex(state.route);
  const placed = found.places.map((p) => withPackZones(p, pack.get(p.id)));
  const matches = matchPlaces(placed, state.route, idx);
  const near = new Set(matches.map((m) => m.placeId));
  const places = placed.filter((p) => near.has(p.id));
  const { hours, holidays } = await workOutHours(places, state, now, here.timeZone);
  return {
    fromKm: range.fromKm, toKm: range.toKm, date, places, matches, hours, holidays,
    roofs: matchRoofs(found.roofs, state.route).map((m) => m.roof), rescuePoints: matchRescuePoints(found.rescuePoints, state.route),
  };
}

const sayOf = (r: Omit<StretchReport, 'say'>, range: Range): string | null => {
  const span = (x: Range): [string, string] => [showKm(x.fromKm), showKm(x.toKm)];
  if (r.status === 'saved') return W.appStretchSaved(...span(range), r.places);
  if (r.status === 'partial') return W.appStretchPartial(r.saved.map((s) => span(s).join('–')).join(', '), r.places);
  if (r.status === 'failed') return W.appStretchFailed(...span(range));
  if (r.status === 'storage') return W.appStretchNotKept;
  return null;
};

let running = false;

/** One stretch, at most 50 km of what was asked for: the rider asks for the next one after. Never throws. */
export async function refreshStretch(fromKm: Km, toKm: Km, deps: StretchDeps): Promise<StretchReport> {
  const none = (status: StretchReport['status']): StretchReport => ({ status, saved: [], failed: [], places: 0, say: null });
  if (running) return none('busy');
  running = true;
  try {
    let state: StretchState | null;
    try {
      state = await deps.store.read();
    } catch {
      return none('nothing');
    }
    if (!state) return none('nothing');
    const start = Math.max(0, fromKm);
    const end = Math.min(state.route.lengthKm, toKm, start + MAX_STRETCH_KM);
    if (!(end > start)) return none('nothing');
    let yes = false;
    try {
      yes = (await deps.askNotice(W.appStretchNotice)) === true;
    } catch {
      yes = false;
    }
    if (!yes) return none('declined');
    return await runQueue(state, { fromKm: start, toKm: end }, deps);
  } finally {
    running = false;
  }
}

async function runQueue(state: StretchState, range: Range, deps: StretchDeps): Promise<StretchReport> {
  const queue: Range[] = [range];
  const saved: Range[] = [];
  const failed: StretchReport['failed'] = [];
  let places = 0;
  let requests = 0;
  let backoffs = 0;
  let storageRefused = false;
  while (queue.length > 0) {
    const part = queue.shift()!;
    if (requests >= MAX_REQUESTS) { failed.push({ ...part, reason: 'too many requests' }); continue; }
    const query = stretchQuery(stretchLine(state.route, part.fromKm, part.toKm));
    let asked: Asked = { kind: 'server', reason: 'not asked' };
    let emptyOnce = false;
    for (let waits = 0; requests < MAX_REQUESTS; waits++) {
      requests++;
      asked = await ask(query, deps.fetch);
      if (asked.kind === 'empty' && !emptyOnce) { // once more: the next request may reach the other server
        emptyOnce = true;
        await deps.sleep(FIRST_BACKOFF_MS);
        continue;
      }
      if (asked.kind !== 'too-many') break;
      if (waits >= MAX_TOO_MANY) break;
      await deps.sleep(asked.waitMs);
    }
    if (asked.kind === 'too-many') { failed.push({ ...part, reason: 'too many requests' }); continue; }
    if (asked.kind === 'empty') { failed.push({ ...part, reason: 'empty answer' }); continue; }
    if (asked.kind === 'refused') { failed.push({ ...part, reason: asked.reason }); continue; }
    if (asked.kind === 'server') {
      const half = (part.toKm - part.fromKm) / 2;
      if (half < MIN_HALVED_KM) { failed.push({ ...part, reason: asked.reason }); continue; }
      await deps.sleep(FIRST_BACKOFF_MS * 2 ** backoffs++);
      queue.unshift({ fromKm: part.fromKm, toKm: part.fromKm + half }, { fromKm: part.fromKm + half, toKm: part.toKm });
      continue;
    }
    let batch: Parameters<StretchStore['save']>[1];
    try {
      batch = await batchOf(asked.elements, part, state, deps);
    } catch {
      failed.push({ ...part, reason: 'not readable' });
      continue;
    }
    try {
      if (!(await deps.store.save(state.route.id, batch))) return { status: 'nothing', saved, failed, places, say: null }; // the route has gone
    } catch {
      storageRefused = true;
      failed.push({ ...part, reason: 'not kept' });
      break;
    }
    saved.push(part);
    places += batch.places.length;
  }
  const status: StretchReport['status'] = storageRefused ? 'storage' : failed.length === 0 ? 'saved' : saved.length > 0 ? 'partial' : 'failed';
  const report = { status, saved, failed, places };
  return { ...report, say: sayOf(report, range) };
}

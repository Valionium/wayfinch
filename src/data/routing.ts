// Plan from A to B (spec section 7.1): a ride between two places from a bike router, and the place search that finds the two.
//
// Bike routers only, tried in the order of `ROUTERS`. Their full line is kept (no thinning) and goes through the same route
// building as a GPX file. A car, foot or estimated line is never accepted: if no bike router answers the answer is `none`, and the
// rider is asked for a GPX. Only the two end points go to a router, and only the search text to a place search. Nothing else:
// no cookie, no header, no referrer.
//
// Task 21's policy check reads `ROUTERS`: a router whose usage policy fails is taken out of this table, and nothing else changes.
import { GPX_MAX_POINTS } from '../core/route/gpx.ts';
import type { RawPoint } from '../core/route/gpx.ts';
import { haversineKm } from '../core/geo/haversine.ts';

export type LatLon = { lat: number; lon: number };
type Fetch = typeof globalThis.fetch;

export type Router = {
  id: 'osrm-bike' | 'valhalla-bicycle' | 'brouter-trekking';
  name: string;
  /** Where the service's usage terms are published: what Task 21's policy check reads. Recorded here, not yet confirmed. */
  terms: string;
  /** What the policy check should know about it. */
  note: string;
  /** The one profile this router is asked for; never a car or foot one. */
  profile: 'routed-bike' | 'bicycle' | 'trekking';
  /** The request for a ride from `a` to `b`. */
  url: (a: LatLon, b: LatLon) => string;
  /** The line of the answer, or null when it holds none. */
  line: (answer: unknown) => RawPoint[] | null;
};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);

/** A coordinate pair as [longitude, latitude, height?] to a point; null if it is not one. */
function pointOf(c: unknown): RawPoint | null {
  if (!Array.isArray(c)) return null;
  const lon = num(c[0]);
  const lat = num(c[1]);
  if (lon === null || lat === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const ele = num(c[2]);
  return { lat, lon, ele: ele !== null && ele >= -500 && ele <= 10_000 ? ele : null };
}

function pointsOf(coordinates: unknown): RawPoint[] | null {
  if (!Array.isArray(coordinates)) return null;
  const out: RawPoint[] = [];
  for (const c of coordinates) {
    const p = pointOf(c);
    if (p === null) return null;
    out.push(p);
  }
  return out;
}

/** Google's encoded line, as Valhalla writes it (six decimals). */
function decodeLine(encoded: string, precision: number): RawPoint[] | null {
  const f = 10 ** precision;
  const out: RawPoint[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      if (i >= encoded.length) return null;
      byte = encoded.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && shift < 35);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    const dLat = next();
    const dLon = next();
    if (dLat === null || dLon === null) return null;
    lat += dLat;
    lon += dLon;
    out.push({ lat: lat / f, lon: lon / f, ele: null });
  }
  return out;
}

export const ROUTERS: readonly Router[] = [
  {
    id: 'osrm-bike', name: 'FOSSGIS OSRM, bike', profile: 'routed-bike',
    terms: 'https://routing.openstreetmap.de/about.html',
    note: 'The routing service behind openstreetmap.org directions; public, free, no key, fair use. Line without heights.',
    url: (a, b) => `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`,
    line: (answer) => {
      if (!isRecord(answer) || answer.code !== 'Ok' || !Array.isArray(answer.routes)) return null;
      const route: unknown = answer.routes[0];
      return isRecord(route) && isRecord(route.geometry) ? pointsOf(route.geometry.coordinates) : null;
    },
  },
  {
    id: 'valhalla-bicycle', name: 'FOSSGIS Valhalla, bicycle', profile: 'bicycle',
    terms: 'https://valhalla1.openstreetmap.de/',
    note: 'Volunteer-run Valhalla instance; the request carries the bicycle costing. Line without heights.',
    url: (a, b) => `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify({
      locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }],
      costing: 'bicycle', costing_options: { bicycle: { bicycle_type: 'Hybrid' } }, directions_options: { units: 'kilometers' },
    }))}`,
    line: (answer) => {
      if (!isRecord(answer) || !isRecord(answer.trip) || !Array.isArray(answer.trip.legs)) return null;
      const leg: unknown = answer.trip.legs[0];
      return isRecord(leg) && typeof leg.shape === 'string' ? decodeLine(leg.shape, 6) : null;
    },
  },
  {
    id: 'brouter-trekking', name: 'BRouter, trekking', profile: 'trekking',
    terms: 'https://brouter.de/',
    note: 'BRouter public server with the trekking profile; it limits how far it will route. Line with heights.',
    url: (a, b) => `https://brouter.de/brouter?lonlats=${a.lon},${a.lat}|${b.lon},${b.lat}&profile=trekking&alternativeidx=0&format=geojson`,
    line: (answer) => {
      if (!isRecord(answer) || !Array.isArray(answer.features)) return null;
      const feature: unknown = answer.features[0];
      return isRecord(feature) && isRecord(feature.geometry) ? pointsOf(feature.geometry.coordinates) : null;
    },
  },
];

const ROUTER_MS = 20_000;
const SEARCH_MS = 8_000;
/** A router snaps the ends to a road; further than this from what was asked, it has routed something else. */
const SNAP_KM = 5;
/** A line that is only its two ends is a drawn estimate, not a ride, unless the ends are this close. */
const STRAIGHT_OK_KM = 1;

/** Only these fixed settings go with a request: nothing identifies the page or the rider. */
const PLAIN: RequestInit = { credentials: 'omit', referrerPolicy: 'no-referrer' };

async function getJson(fetchIt: Fetch, url: string, ms: number): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetchIt(url, { ...PLAIN, signal: abort.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a line is a ride from `a` to `b`: real points, ending where it was asked to, and more than a drawn straight line. */
function isRide(line: RawPoint[] | null, a: LatLon, b: LatLon): line is RawPoint[] {
  if (line === null || line.length < 2 || line.length > GPX_MAX_POINTS) return false;
  if (haversineKm(line[0]!, a) > SNAP_KM || haversineKm(line[line.length - 1]!, b) > SNAP_KM) return false;
  return line.length > 2 || haversineKm(a, b) <= STRAIGHT_OK_KM;
}

/**
 * The ride from `a` to `b` from the first bike router that gives one, its line whole; or `{ none: true }` when none does. A router
 * that fails, is refused, times out or answers with something that is no ride is skipped, and the next one asked.
 */
export async function planRoute(a: LatLon, b: LatLon, fetchIt: Fetch, routers: readonly Router[] = ROUTERS): Promise<RawPoint[] | { none: true }> {
  for (const router of routers) {
    try {
      const line = router.line(await getJson(fetchIt, router.url(a, b), ROUTER_MS));
      if (isRide(line, a, b)) return line;
    } catch {
      // This router is down, slow or refused: the next one.
    }
  }
  return { none: true };
}

// ---- place search ---------------------------------------------------------------------------------------------------------

export type FoundPlace = { name: string; where: string; lat: number; lon: number };

const METEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const PHOTON_URL = 'https://photon.komoot.io/api/';
const MAX_HITS = 8;

const clean = (x: unknown, max: number): string => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const joined = (parts: unknown[]): string => parts.map((p) => clean(p, 80)).filter((p, i, all) => p !== '' && all.indexOf(p) === i).join(', ').slice(0, 200);
const validLatLon = (lat: unknown, lon: unknown): lat is number => typeof lat === 'number' && typeof lon === 'number'
  && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;

function meteoHits(answer: unknown): FoundPlace[] {
  const results = isRecord(answer) && Array.isArray(answer.results) ? (answer.results as unknown[]) : [];
  const out: FoundPlace[] = [];
  for (const r of results) {
    if (!isRecord(r) || clean(r.name, 160) === '' || !validLatLon(r.latitude, r.longitude)) continue;
    out.push({ name: clean(r.name, 160), where: joined([r.admin1, r.country]), lat: r.latitude, lon: r.longitude as number });
  }
  return out.slice(0, MAX_HITS);
}

const PHOTON_KEYS = ['place', 'natural', 'water', 'waterway', 'mountain_pass', 'boundary'];

function photonHits(answer: unknown): FoundPlace[] {
  const features = isRecord(answer) && Array.isArray(answer.features) ? (answer.features as unknown[]) : [];
  const out: FoundPlace[] = [];
  for (const f of features) {
    if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry) || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
    const [lon, lat] = f.geometry.coordinates as unknown[];
    const p = f.properties;
    if (clean(p.name, 160) === '' || !validLatLon(lat, lon) || !PHOTON_KEYS.includes(String(p.osm_key))) continue;
    out.push({ name: clean(p.name, 160), where: joined([p.city, p.state, p.country]), lat, lon: lon as number });
  }
  return out.slice(0, MAX_HITS);
}

const FEATURE_WORD = /\b(?:lake|lago|lac|loch|see|valley|valle|vallee|tal|pass|col|mount|mountain|berg|river|island|forest)\b/i;
const FEATURE_ENDING = /\b[a-zäöüß]+(?:see|tal|pass)\b/i;
const withoutAccents = (q: string): string => q.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** A search for a lake, valley or pass goes to Photon first; a town to Open-Meteo. */
const isFeature = (q: string): boolean => FEATURE_WORD.test(withoutAccents(q)) || FEATURE_ENDING.test(q);

const viaMeteo = async (q: string, f: Fetch): Promise<FoundPlace[]> =>
  meteoHits(await getJson(f, `${METEO_URL}?name=${encodeURIComponent(q)}&count=${MAX_HITS}&language=en&format=json`, SEARCH_MS));

async function viaPhoton(q: string, f: Fetch): Promise<FoundPlace[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(MAX_HITS));
  url.searchParams.set('lang', 'en');
  // Fixed filters, so a search finds places and not shops or streets of a similar name.
  for (const tag of ['place', 'natural', 'water', 'waterway', 'mountain_pass', 'boundary:administrative']) url.searchParams.append('osm_tag', tag);
  return photonHits(await getJson(f, url.toString(), SEARCH_MS));
}

/**
 * Places for the words typed: Open-Meteo's geocoding for towns, Photon for natural features, each the fallback of the other. Only
 * the text is sent. An empty list means nothing was found; both services failing throws.
 */
export async function searchPlace(text: string, fetchIt: Fetch): Promise<FoundPlace[]> {
  const q = text.trim();
  if (q.length < 2 || q.length > 200) return [];
  const order = isFeature(q) ? [viaPhoton, viaMeteo] : [viaMeteo, viaPhoton];
  let failures = 0;
  for (const ask of order) {
    try {
      const hits = await ask(q, fetchIt);
      if (hits.length > 0) return hits;
    } catch {
      failures += 1;
    }
  }
  if (failures === order.length) throw new Error('no place search answered');
  return [];
}

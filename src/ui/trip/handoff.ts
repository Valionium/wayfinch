// Contract 2, the trip handoff (co-pilot to bag planner, spec section 7.1). The co-pilot writes the route as GPX 1.1 into its own
// database, one small envelope into `copilot:handoff:v1`, and opens `/tools/bags/#copilot-handoff=<id>`. It never writes or frees
// a `loadcheck:*` key. The bag planner answers in `loadcheck:handoff-done`; the co-pilot then deletes its handoff, or after 24 hours.
import type { Place } from '../../core/places/types.ts';
import type { Route, Stay, Trip } from '../../core/types.ts';
import { haversineKm } from '../../core/geo/haversine.ts';
import { W } from '../../core/wording/en.ts';
import { HO } from '../../core/wording/en-handoff.ts';
import { planStages } from '../../core/route/stages.ts';
import { dayStopOf } from '../../core/route/day-stops.ts';
import { DEFAULT_SETTINGS } from '../../store/rules.ts';
import type { Settings } from '../../store/rules.ts';

export const HANDOFF_KEY = 'copilot:handoff:v1';
export const HANDOFF_DONE_KEY = 'loadcheck:handoff-done';
export const HANDOFF_STORE = 'handoffs';
/** The namespace of the one extension element, `<cp:trip>`. Readers that don't know it ignore it (Contract rule 3). */
export const CP_NS = 'urn:x-wayfinch:trip:1';
export const HANDOFF_TTL_MS = 24 * 3_600_000;
/** A record younger than this may be another window's, put just before its envelope: the cleanup leaves it (re-check N2). */
export const HANDOFF_FRESH_MS = 10 * 60_000;
// Load Check's own limits (spec 7.1 Contract 2): over them a route is not handed off.
export const HANDOFF_MAX_BYTES = 20 * 1024 * 1024;
export const HANDOFF_MAX_POINTS = 200_000;

export type HandoffEnvelope = { app: 'copilot'; kind: 'handoff'; v: 1; id: string; createdAt: string };
export type HandoffRecord = { id: string; gpx: string; createdAt: string };
export type HandoffOutcome = { ok: true; id: string } | { ok: false; reason: string };

const STAY_WORD: Record<Stay, 'camp' | 'mixed' | 'indoor'> = { camping: 'camp', mixed: 'mixed', accommodation: 'indoor' };
const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Coordinates as the route holds them: its rounded form (6 decimals, heights to the centimetre) prints exactly. */
const num = (n: number): string => String(n);

/** The nearest settlement to a point, within 5 km: the end's name needs no lookup in the bag planner (spec 7.1 item 8). */
export function settlementNear(places: readonly Place[], at: { lat: number; lon: number }): string | null {
  let best: { name: string; km: number } | null = null;
  for (const p of places) {
    if (p.kind !== 'settlement' || !p.name) continue;
    const km = haversineKm(at, p);
    if (km <= 5 && (!best || km < best.km)) best = { name: p.name, km };
  }
  return best ? best.name.slice(0, 160) : null;
}

/**
 * The `<cp:trip>` settings. The nights always travel, so both apps end the days at the same place and count the same food (review
 * of PR 43, I4): the stage model's suggestion when the rider left them to it, then marked `nightsFrom="suggested"`. The pace, the
 * flat speed and the stay go only when the rider set them in the co-pilot, so a bag-planner rider's own are kept (re-check N1); so
 * does the date. The route's hash always travels.
 */
export function tripAttributes(trip: Trip, settings: Settings, names: { start: string | null; end: string | null }): [string, string][] {
  const out: [string, string][] = [['v', '1']];
  // readSettings lays the trip's own speed and pace over the settings: what the co-pilot plans with
  const nights = settings.nights ?? planStages(trip.route, { flatKph: settings.flatKph, pace: settings.pace, nights: 0 }).suggestedNights;
  out.push(['nights', String(nights)]);
  if (settings.nights === null) out.push(['nightsFrom', 'suggested']);
  // Where each day ends, when the days end at places to sleep (owner, 9 Nov 2026): the bag planner ends its days there too.
  const nightsHere = trip.route.stages.length - 1;
  const held = nightsHere === nights && nightsHere > 0 ? trip.route.stages.slice(0, -1).map((_, i) => dayStopOf(trip, i)) : [];
  if (held.length > 0 && held.every((d) => d !== null) && held.some((d) => d!.placeId !== null)) {
    out.push(['stops', trip.route.stages.slice(0, -1).map((st) => String(st.endKm)).join(',')]);
    out.push(['stopNames', JSON.stringify(held.map((d) => (d!.placeId !== null ? d!.name : null)))]);
  }
  if (trip.departureDate) {
    out.push(['departureDate', trip.departureDate]);
    out.push(['month', String(Number(trip.departureDate.slice(5, 7)))]);
  }
  if (settings.stay !== DEFAULT_SETTINGS.stay) out.push(['sleep', STAY_WORD[settings.stay]]);
  if (settings.pace !== DEFAULT_SETTINGS.pace) out.push(['pace', settings.pace]);
  if (settings.flatKph !== DEFAULT_SETTINGS.flatKph) out.push(['flatKph', String(settings.flatKph)]);
  if (names.start) out.push(['startName', names.start]);
  if (names.end) out.push(['endName', names.end]);
  out.push(['route', trip.route.hash]);
  return out;
}

/** The route as GPX 1.1: every point, in order, with `<ele>` wherever a height is known; one extension in the metadata. */
export function handoffGpx(route: Route, attributes: [string, string][]): string {
  const name = xml(route.name || 'Route');
  const trip = attributes.map(([k, v]) => ` ${k}="${xml(v)}"`).join('');
  const points = route.points.map((p) => `<trkpt lat="${num(p.lat)}" lon="${num(p.lon)}">${p.ele === null ? '' : `<ele>${num(p.ele)}</ele>`}</trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wayfinch" xmlns="http://www.topografix.com/GPX/1/1" xmlns:cp="${CP_NS}">\n`
    + `<metadata><name>${name}</name><extensions><cp:trip${trip}/></extensions></metadata>\n`
    + `<trk><name>${name}</name><trkseg>\n${points}\n</trkseg></trk>\n</gpx>\n`;
}

const byteLength = (s: string): number => new TextEncoder().encode(s).length;

/** Why a route can't be handed off, in the rider's words; null when it can. */
export function handoffRefusal(route: Route, gpx: string | null): string | null {
  if (route.points.length < 2) return W.appHandoffNoRoute;
  if (route.points.length > HANDOFF_MAX_POINTS) return HO.appHandoffTooManyPoints;
  if (gpx !== null && byteLength(gpx) > HANDOFF_MAX_BYTES) return HO.appHandoffTooLarge;
  return null;
}

export type HandoffDeps = {
  /** Every handoff record the database holds (for the cleanup); absent where it can't be listed. */
  listRecords?: () => Promise<{ id: string; createdAt: string }[]>;
  now: () => Date;
  randomId: () => string;
  /** The settlements the co-pilot holds for this route (its places), for the end names; [] when none. */
  places: () => Promise<Place[]>;
  putRecord: (record: HandoffRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  go: (href: string) => void;
};

export const handoffHref = (id: string): string => `/tools/bags/#copilot-handoff=${id}`;

/**
 * Hands the trip to the bag planner: the GPX into the database, the envelope into localStorage, then the bag planner opens. When
 * localStorage is full, it says so and takes the record back; it never frees space by touching the bag planner's keys.
 */
export async function handOffTrip(trip: Trip, settings: Settings, deps: HandoffDeps): Promise<HandoffOutcome> {
  const early = handoffRefusal(trip.route, null);
  if (early) return { ok: false, reason: early };
  const places = await deps.places().catch(() => [] as Place[]);
  const first = trip.route.points[0]!, last = trip.route.points[trip.route.points.length - 1]!;
  const gpx = handoffGpx(trip.route, tripAttributes(trip, settings, { start: settlementNear(places, first), end: settlementNear(places, last) }));
  const refusal = handoffRefusal(trip.route, gpx);
  if (refusal) return { ok: false, reason: refusal };
  const id = deps.randomId();
  const createdAt = deps.now().toISOString();
  try {
    await deps.putRecord({ id, gpx, createdAt });
  } catch {
    return { ok: false, reason: HO.appHandoffNotKept };
  }
  const envelope: HandoffEnvelope = { app: 'copilot', kind: 'handoff', v: 1, id, createdAt };
  try {
    deps.storage.setItem(HANDOFF_KEY, JSON.stringify(envelope));
  } catch (e) {
    await deps.deleteRecord(id).catch(() => undefined);
    return { ok: false, reason: (e as { name?: string } | null)?.name === 'QuotaExceededError' ? HO.appHandoffStorageFull : HO.appHandoffNotKept };
  }
  deps.go(handoffHref(id));
  return { ok: true, id };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const readJson = (storage: HandoffDeps['storage'], key: string): unknown => {
  try { return JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; }
};

/** The stored envelope, when it is one of Contract 2's; else null. */
export function readEnvelope(storage: HandoffDeps['storage']): HandoffEnvelope | null {
  const e = readJson(storage, HANDOFF_KEY);
  return isObject(e) && e.app === 'copilot' && e.kind === 'handoff' && e.v === 1 && typeof e.id === 'string' && /^[0-9a-f]{32}$/.test(e.id)
    && typeof e.createdAt === 'string' && Number.isFinite(Date.parse(e.createdAt)) ? (e as HandoffEnvelope) : null;
}

/**
 * Deletes the handoff once the bag planner has answered for its id, or after 24 hours; and any record no envelope points at any more
 * (a second handoff before the first was answered), so no route stays behind (review M5). True when the envelope went.
 */
export async function cleanupHandoff(deps: Pick<HandoffDeps, 'now' | 'deleteRecord' | 'storage' | 'listRecords'>): Promise<boolean> {
  let envelope = readEnvelope(deps.storage);
  let went = false;
  if (envelope) {
    const done = readJson(deps.storage, HANDOFF_DONE_KEY);
    const answered = isObject(done) && done.kind === 'handoff-done' && done.id === envelope.id;
    const old = deps.now().getTime() - Date.parse(envelope.createdAt) > HANDOFF_TTL_MS;
    if (answered || old) {
      await deps.deleteRecord(envelope.id).catch(() => undefined);
      try { deps.storage.removeItem(HANDOFF_KEY); } catch { /* it goes next time */ }
      envelope = null;
      went = true;
    }
  }
  const records = deps.listRecords ? await deps.listRecords().catch(() => []) : [];
  const now = deps.now().getTime();
  for (const r of records) {
    const young = now - Date.parse(r.createdAt) < HANDOFF_FRESH_MS;
    if (r.id !== envelope?.id && !young) await deps.deleteRecord(r.id).catch(() => undefined);
  }
  return went;
}

/** At start-up: the handoff goes once the bag planner has answered for it, or after 24 hours. Only ever deletes. */
export async function cleanupStoredHandoff(): Promise<void> {
  // No envelope, nothing handed off since the last cleanup (each handoff cleans before it writes): the database is not touched.
  try { if (localStorage.getItem(HANDOFF_KEY) === null) return; } catch { return; }
  const { inExistingTx } = await import('../../store/db.ts');
  await cleanupHandoff({
    now: () => new Date(),
    storage: localStorage,
    deleteRecord: (id) => inExistingTx([HANDOFF_STORE], async (tx) => { await tx.objectStore(HANDOFF_STORE).delete(id); }),
    listRecords: () => inExistingTx([HANDOFF_STORE], async (tx) => (await tx.objectStore(HANDOFF_STORE).getAll()) as { id: string; createdAt: string }[]),
  }).catch(() => false);
}

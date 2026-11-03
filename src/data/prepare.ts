// Get ready offline (spec section 5): heights, places, hours, weather, baseline, save. Each step is reported on its own, and a
// failed step never discards the others. Weather's requests come in as arguments; the grid, days and points are openmeteo.ts's
// own, so a forecast asked for here is the very request Update weather sends.
import { addDaysIso, localIsoDate } from '../core/answers/time.ts';
import { modelsForRoute } from '../core/engines/weather-classes.ts';
import { zoneLookupOf } from '../core/engines/tripday.ts';
import { hoursWindowDates, ridingDaysOf } from '../core/hours/window.ts';
import { haversineKm } from '../core/geo/haversine.ts';
import type { LatLng } from '../core/geo/haversine.ts';
import { buildSegmentIndex } from '../core/geo/index.ts';
import { kitchenHoursId } from '../core/hours/check.ts';
import { ruleClassOf } from '../core/hours/rules.ts';
import { CORRIDOR_KM, savedKmRanges, tileHolds, tileKey } from '../core/places/tiles.ts';
import type { ManifestTile } from '../core/places/types.ts';
import { matchPlaces, matchRoofs, rescuePointsNear } from '../core/route/matches.ts';
import { buildRoute } from '../core/route/profile.ts';
import type { RawPoint } from '../core/route/gpx.ts';
import { sampleGrid } from '../core/route/grid.ts';
import { planStages } from '../core/route/stages.ts';
import { routeZones } from '../core/route/zones.ts';
import type { Baseline, Km, ModelRun, Place, PlaceHours, Roof, Route, StoredForecast, Trip, ZoneSpan } from '../core/types.ts';
import { showKm, W } from '../core/wording/en.ts';
import { readPackRun } from '../store/packs.ts';
import { markChanged } from '../store/changed.ts';
import { preparedStore, readBaselineYears, readForecastDate, readHeldHolidays, readHours, readMatchedIds, readPrepared, readStoredZones, readTileData } from '../store/prepared.ts';
import type { PreparedRecord, PreparedStore } from '../store/prepared.ts';
import { readLocalSettings } from '../store/settings-local.ts';
import { RouteGoneError, readTrip } from '../store/trip.ts';
import { loadBoundaries } from './boundaries.ts';
import { checkConnectivity } from './connectivity.ts';
import { downloadTiles, isStorageFull, STORAGE_FULL } from './packs/download.ts';
import type { TileReport, TileStore } from './packs/download.ts';
import { baselinePoints, forecastDaysFor, gridPoints } from './openmeteo.ts';
import type { FetchLike, GridPoint } from './openmeteo.ts';
import { withoutUnknownHolidays } from './overpass.ts';
import { WEATHER_MODE } from './weather-mode.ts';

export type StepName = 'heights' | 'places' | 'hours' | 'weather' | 'baseline' | 'save';
export type StepReport = { step: StepName; ok: boolean; note: string | null };


type WakeLockLike = { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
/** The parts of `navigator` used here; each may be missing on a phone. */
export type PrepareNavigator = { wakeLock?: WakeLockLike; storage?: { persist?: () => Promise<boolean> } };

type Fetch = typeof globalThis.fetch;

/** As openmeteo.ts's own functions take them. */
export type PrepareDeps = {
  fetch: Fetch;
  fetchForecast: (grid: GridPoint[], o: { days: number; with15: boolean; fetch: FetchLike; now?: () => Date; runs?: ModelRun[] }) => Promise<StoredForecast>;
  fetchBaseline: (points: GridPoint[], months: number[], fetch: FetchLike) => Promise<Baseline>;
  fetchElevation: (points: LatLng[], fetch: FetchLike) => Promise<(number | null)[]>;
  /** The model-run check before the forecast (section 5, step 3). Its failure stops nothing. */
  fetchModelRuns?: (fetch: FetchLike) => Promise<ModelRun[]>;
  now: () => Date;
  /** Said before any heights are sent. */
  onNotice?: (text: string) => void;
  /** 15-minute rain: only in the automatic weather mode (Decision 3), as Update weather asks. */
  with15?: boolean;
  nav?: PrepareNavigator;
  store?: PreparedStore;
  origin?: string; sleep?: (ms: number) => Promise<void>; timeoutMs?: number;
};

const DAY_MS = 86_400_000;
const HOURS_BATCH = 200;
/** As Update weather's tap (refresh.ts): no second request within 30 minutes, whatever asks. */
const WEATHER_GAP_MS = 30 * 60_000;
/** Heights asked for no closer than this along the route; those between are interpolated (section 5). */
const HEIGHT_STEP_KM = 0.2;
const SHELTER_KINDS: readonly Place['kind'][] = ['settlement', 'shelter'];
const STATION_NEAR_KM = 0.1;

/** Ends the whole run: the route it was for isn't the stored one any more. */
const routeGone = (e: unknown): boolean => e instanceof RouteGoneError;

const noteFor = (e: unknown, otherwise: string): string => (isStorageFull(e) ? W.appPrepStorageFullStep : otherwise);

// ---- heights -----------------------------------------------------------------------------------------------------------

/** The route's points as raw points, section breaks kept: a break shows as no distance between two different places. */
function rawOf(route: Route, ele: (i: number) => number | null): RawPoint[] {
  return route.points.map((p, i) => {
    const before = route.points[i - 1];
    const isBreak = before !== undefined && before.km === p.km && (before.lat !== p.lat || before.lon !== p.lon);
    return { lat: p.lat, lon: p.lon, ele: ele(i), ...(isBreak ? { break: true } : {}) };
  });
}

/** Heights for every point from a sample of those missing them, or null when any sample stays unanswered. */
async function lookedUpHeights(route: Route, deps: PrepareDeps): Promise<(number | null)[] | null> {
  const pts = route.points;
  const asked: number[] = [];
  let lastKm = -Infinity;
  pts.forEach((p, i) => {
    if (p.ele !== null) return;
    if (p.km - lastKm >= HEIGHT_STEP_KM || i === pts.length - 1) {
      asked.push(i);
      lastKm = p.km;
    }
  });
  const answers = await deps.fetchElevation(asked.map((i) => ({ lat: pts[i]!.lat, lon: pts[i]!.lon })), deps.fetch);
  if (answers.length !== asked.length || answers.some((h) => h === null || !Number.isFinite(h))) return null;
  const known = new Map<number, number>();
  pts.forEach((p, i) => { if (p.ele !== null) known.set(i, p.ele); });
  asked.forEach((i, n) => known.set(i, answers[n]!));
  const anchors = [...known.keys()].sort((a, b) => a - b);
  let a = 0;
  return pts.map((p, i) => {
    const direct = known.get(i);
    if (direct !== undefined) return direct;
    while (a + 1 < anchors.length && anchors[a + 1]! < i) a++;
    const from = anchors[a]!;
    const to = anchors[a + 1];
    if (to === undefined || from > i) return known.get(from)!;
    const span = pts[to]!.km - pts[from]!.km;
    const f = span > 0 ? (p.km - pts[from]!.km) / span : 0;
    return known.get(from)! + (known.get(to)! - known.get(from)!) * f;
  });
}

function withPlan(trip: Trip, route: Route): Route {
  const local = readLocalSettings().settings;
  const pace = trip.pace ?? local.pace;
  const nights = local.nights ?? planStages(route, { flatKph: trip.flatKph, pace, nights: 0 }).suggestedNights;
  const stages = [...planStages(route, { flatKph: trip.flatKph, pace, nights })];
  return { ...route, stages, sampleGrid: sampleGrid(route, route.climbs, stages) };
}

async function heightsStep(deps: PrepareDeps, store: PreparedStore, online: boolean, trip: Trip): Promise<{ report: StepReport; trip: Trip }> {
  const missing = trip.route.points.some((p) => p.ele === null);
  let route = trip.route;
  let report: StepReport = { step: 'heights', ok: true, note: null };
  if (missing) {
    if (!online) report = { step: 'heights', ok: false, note: W.appPrepNoConnection };
    else {
      deps.onNotice?.(W.appPrepHeightsNotice);
      let heights: (number | null)[] | null = null;
      try {
        heights = await lookedUpHeights(route, deps);
      } catch {
        heights = null;
      }
      if (heights) route = await buildRoute(rawOf(route, (i) => heights[i] ?? null), route.name, route.source);
      else report = { step: 'heights', ok: false, note: W.appPrepHeightsFailed };
    }
  }
  // Stages and the grid are fixed only now, with the heights final.
  if (route === trip.route && route.stages.length > 0 && route.sampleGrid.length > 0) return { report, trip };
  const next: Trip = { ...trip, route: withPlan(trip, route) };
  const current = await store.readTrip();
  if (!current || current.route.id !== trip.route.id) throw new RouteGoneError();
  try {
    await store.saveTrip({ ...current, route: next.route });
  } catch (e) {
    // Another window changed the trip, or there's no room: the next steps go on with the route that is stored.
    return { report: { step: 'heights', ok: false, note: noteFor(e, W.appPrepSaveFailed) }, trip: current };
  }
  return { report, trip: { ...current, route: next.route } };
}

// ---- places ------------------------------------------------------------------------------------------------------------

async function zonesOfRoute(deps: PrepareDeps, route: Route): Promise<ZoneSpan[] | null> {
  try {
    return routeZones(route, await loadBoundaries(deps.fetch));
  } catch {
    return null;
  }
}

const dedupe = <T>(list: T[], keyOf: (x: T) => string): T[] => [...new Map(list.map((x) => [keyOf(x), x])).values()];

/** A kilometre with data: inside the countries the manifest holds, with every listed tile near it saved (section 9.10). */
function coveredBy(report: TileReport, zones: ZoneSpan[] | null, corridor: ManifestTile[]): (km: Km, p: LatLng) => boolean {
  if (zones === null) return (_km, p) => corridor.some((t) => tileHolds(t, p, CORRIDOR_KM));
  const held = new Set(Object.entries(report.manifest.countries).filter(([, c]) => c.status !== 'missing').map(([code]) => code));
  return (km) => {
    const span = zones.find((z) => km >= z.fromKm && km <= z.toKm);
    return span !== undefined && held.has(span.country);
  };
}

/** Matches the route to all that's saved. Run again after more tiles, it gives the same as if they had all come at once. */
async function matchAll(store: PreparedStore, route: Route, report: TileReport, zones: ZoneSpan[] | null): Promise<{ fromKm: Km; toKm: Km }[]> {
  const data = await store.readTileData();
  const idx = buildSegmentIndex(route);
  const matches = matchPlaces(data.places, route, idx);
  const matched = new Set(matches.map((m) => m.placeId));
  // Only what an answer can read stays: a corridor holds many times as much, and every open of the app reads it all.
  const places = data.places.filter((p) => matched.has(p.id) || SHELTER_KINDS.includes(p.kind));
  const roofs: Roof[] = dedupe(data.roofs, (r) => `${r.kind}|${r.lat}|${r.lon}`);
  const nearRoofs = [...new Set(matchRoofs(roofs, route).map((m) => m.roof))];
  const rescuePoints = rescuePointsNear(dedupe(data.rescuePoints, (r) => `${r.ref}|${r.lat}|${r.lon}`), route);
  const saved = new Set(report.saved.map(tileKey));
  const savedKm = savedKmRanges(route, report.manifest.tiles, saved, coveredBy(report, zones, report.manifest.tiles));
  return store.saveMatched(route.id, { places, roofs: nearRoofs, rescuePoints, matches, savedKm });
}

/** The kilometres of the route that have no place data, as "a–b, c–d"; null when there are none. Edges within 50 m are none. */
function withoutData(route: Route, savedKm: { fromKm: Km; toKm: Km }[]): string | null {
  const gaps: [Km, Km][] = [];
  let at = 0;
  for (const r of [...savedKm].sort((a, b) => a.fromKm - b.fromKm)) {
    if (r.fromKm - at > 0.05) gaps.push([at, r.fromKm]);
    at = Math.max(at, r.toKm);
  }
  if (route.lengthKm - at > 0.05) gaps.push([at, route.lengthKm]);
  return gaps.length === 0 ? null : gaps.map(([a, b]) => `${showKm(a)}–${showKm(b)}`).join(', ');
}

async function placesStep(deps: PrepareDeps, store: PreparedStore, online: boolean, trip: Trip, onProgress: (done: number, total: number) => void): Promise<{ report: StepReport; tiles: TileReport | null }> {
  const { route } = trip;
  const zones = await zonesOfRoute(deps, route);
  if (zones) await store.saveZones(route.id, zones);

  const tileStore: TileStore = {
    readRun: store.readRun, savedTileKeys: store.savedTileKeys, readStage: store.readStage, stagedTileKeys: store.stagedTileKeys,
    startRun: (run) => store.startRun(run, route.id),
    saveTiles: (content, report) => store.saveTiles(content, report, route.id),
    startStage: (run) => store.startStage(run, route.id),
    stageTiles: (list, buildId) => store.stageTiles(list, buildId, route.id),
    swapIn: (buildId) => store.swapIn(buildId, route.id),
  };
  let tiles: TileReport | null = null;
  let note: string | null = null;
  if (online) {
    try {
      tiles = await downloadTiles(route, {
        fetch: deps.fetch, store: tileStore, onProgress,
        ...(deps.origin === undefined ? {} : { origin: deps.origin }),
        ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
        ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
      });
    } catch (e) {
      if (routeGone(e)) throw e;
      note = isStorageFull(e) ? W.appPrepStorageFullStep : W.appPrepPacksNoAnswer;
    }
  } else {
    const run = await store.readRun();
    if (run) {
      const had = await store.savedTileKeys();
      const notSaved = run.manifest.tiles.filter((t) => !had.has(tileKey(t)));
      tiles = {
        buildId: run.buildId, manifest: run.manifest, saved: run.manifest.tiles.filter((t) => had.has(tileKey(t))),
        failed: notSaved.map((tile) => ({ tile, reason: 'no-connection' })),
      };
    }
    if (!tiles || tiles.failed.length > 0) note = W.appPrepNoConnection;
  }

  if (!tiles) return { report: { step: 'places', ok: false, note: note ?? (zones ? W.appPrepPacksNoAnswer : W.appPrepZonesMissing) }, tiles: null };

  if (tiles.saved.length > 0) {
    // A wish to the browser, which may say no. Its absence is no error.
    try {
      const granted = await deps.nav?.storage?.persist?.();
      if (granted !== undefined && online) await store.savePersist(granted, deps.now());
    } catch {
      /* nothing depends on it */
    }
  }

  const full = tiles.failed.some((f) => f.reason === STORAGE_FULL) || tiles.pending?.full === true;
  let savedKm: { fromKm: Km; toKm: Km }[];
  try {
    savedKm = await matchAll(store, route, tiles, zones);
  } catch (e) {
    if (routeGone(e)) throw e;
    if (!isStorageFull(e)) return { report: { step: 'places', ok: false, note: W.appPrepPlacesNotMatched }, tiles };
    return { report: { step: 'places', ok: false, note: W.appPrepStorageFull(tiles.saved.length, tiles.manifest.tiles.length) }, tiles };
  }
  const gaps = withoutData(route, savedKm);
  if (full) note = tiles.pending ? W.appPrepStorageFullStep : W.appPrepStorageFull(tiles.saved.length, tiles.manifest.tiles.length);
  else if (note === null && tiles.pending) note = W.appPrepNewDataUnfinished;
  else if (note === null && tiles.failed.length > 0) note = W.appPrepTilesFailed(tiles.failed.length);
  else if (note === null && zones === null) note = W.appPrepZonesMissing;
  // Said plainly whatever else is said: a stretch with no place data, outside the covered countries or not saved.
  else if (note === null && gaps !== null) note = [...(tiles.restartedFrom ? [W.appPrepPacksRestarted] : []), W.appPrepNoPlaceData(gaps)].join(' ');
  if (note !== null) return { report: { step: 'places', ok: false, note }, tiles };
  return { report: { step: 'places', ok: true, note: tiles.restartedFrom ? W.appPrepPacksRestarted : null }, tiles };
}

// ---- hours -------------------------------------------------------------------------------------------------------------

const startZoneOf = (zones: ZoneSpan[]): string => zones[0]?.timeZone ?? 'UTC';

const windowDates = (trip: Trip, today: string): ReturnType<typeof hoursWindowDates> =>
  hoursWindowDates({ departureDate: trip.departureDate, ridingDays: ridingDaysOf(trip.route.stages), today });

function nearStations(places: Place[]): (p: Place) => boolean {
  const stations = places.filter((p) => p.kind === 'station');
  return (p) => stations.some((s) => haversineKm(s, p) <= STATION_NEAR_KM);
}

/** Hour spans for the matched places, batch by batch, through the lazy chunk that alone reaches the library. */
/** Resolves to how many places were worked out. */
async function workOutHours(store: Pick<PreparedStore, 'saveHours'>, routeId: string, places: Place[], matched: ReadonlySet<string>, from: string, toExclusive: string, onProgress: (done: number, total: number) => void = () => undefined): Promise<number> {
  const { placeSpans, wallToInstant } = await import('../core/hours/spans.ts');
  const cache = new Map<string, PlaceHours['spans']>();
  const near = nearStations(places);
  const midnight = (iso: string, zone: string): Date => {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    return wallToInstant(y, m, d, 0, 0, zone);
  };
  let batch: PlaceHours[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await store.saveHours(routeId, batch);
    batch = [];
  };
  const worked = places.filter((p) => matched.has(p.id) && p.kind !== 'settlement');
  for (const [n, place] of worked.entries()) {
    if (n % HOURS_BATCH === 0) onProgress(n, worked.length);
    const windowStart = midnight(from, place.timeZone);
    const windowEnd = midnight(toExclusive, place.timeZone);
    const rule = ruleClassOf(place, near(place));
    // Outside the first countries no holidays are known: their PH rules go, as for a refreshed stretch.
    const tag = (raw: string | null): string | null => withoutUnknownHolidays(raw, place.country);
    batch.push({ placeId: place.id, windowStart, windowEnd, spans: placeSpans(tag(place.openingHours), place, rule, windowStart, windowEnd, {}, cache) });
    // "Mapped but not prepared never counts for a meal": the kitchen's hours are a record of their own.
    const kitchen = place.stop?.kitchenHours;
    if (kitchen) {
      batch.push({ placeId: kitchenHoursId(place.id), windowStart, windowEnd, spans: placeSpans(tag(kitchen), place, { kind: 'other', nearStation: false }, windowStart, windowEnd, {}, cache) });
    }
    if (batch.length >= HOURS_BATCH) await flush();
  }
  await flush();
  return worked.length;
}

/** Every holiday zone the route or a place on it lies in. */
function zonesNamed(zones: ZoneSpan[], places: Place[]): string[] {
  const named = new Set<string>();
  for (const z of zones) if (z.holidayZone !== null) named.add(z.holidayZone);
  for (const p of places) if (p.holidayZone !== null) named.add(p.holidayZone);
  return [...named];
}

async function hoursStep(store: PreparedStore, trip: Trip, zones: ZoneSpan[], now: Date, onProgress: (done: number, total: number) => void): Promise<StepReport> {
  try {
    const { places } = await store.readTileData();
    const matched = new Set(await readMatchedIds());
    const today = localIsoDate(now, startZoneOf(zones));
    const { from, toExclusive } = windowDates(trip, today);
    const worked = await workOutHours(store, trip.route.id, places, matched, from, toExclusive, onProgress);
    const { holidaysFor } = await import('../core/hours/holidays.ts');
    await store.saveHolidays(trip.route.id, holidaysFor(zonesNamed(zones, places), from, addDaysIso(toExclusive, -1)));
    return worked === 0 ? { step: 'hours', ok: false, note: W.appPrepNoHours } : { step: 'hours', ok: true, note: null };
  } catch (e) {
    if (routeGone(e)) throw e;
    return { step: 'hours', ok: false, note: noteFor(e, W.appPrepHoursFailed) };
  }
}

// ---- weather -----------------------------------------------------------------------------------------------------------

/** The model-run check, of the models that matter for this route; one read for only some of them counts as none. */
async function runsFor(deps: PrepareDeps, route: Route, zones: ZoneSpan[]): Promise<ModelRun[]> {
  try {
    const zone = zoneLookupOf(zones);
    const models = modelsForRoute(route.points, (p) => zone((p as Route['points'][number]).km).country);
    const read = (await deps.fetchModelRuns?.(deps.fetch)) ?? [];
    const mattering = read.filter((r) => models.includes(r.model));
    return models.length > 0 && models.every((m) => mattering.some((r) => r.model === m)) ? mattering : [];
  } catch {
    return [];
  }
}

async function weatherStep(deps: PrepareDeps, store: PreparedStore, online: boolean, trip: Trip, zones: ZoneSpan[], now: Date): Promise<StepReport> {
  if (!online) return { step: 'weather', ok: false, note: W.appPrepNoConnection };
  const { route } = trip;
  try {
    const grid = gridPoints(route);
    if (grid.length === 0) return { step: 'weather', ok: false, note: W.appPrepWeatherFailed };
    // The turn to ask, held with Update weather's: a forecast fetched minutes ago stays, and no second request is sent.
    if (!(await store.reserveWeather(route.id, now, WEATHER_GAP_MS))) {
      return (await readForecastDate()) ? { step: 'weather', ok: true, note: W.appPrepWeatherRecent } : { step: 'weather', ok: false, note: W.appPrepWeatherFailed };
    }
    const runs = await runsFor(deps, route, zones);
    const today = localIsoDate(now, startZoneOf(zones));
    const forecast = await deps.fetchForecast(grid, {
      days: forecastDaysFor(route, trip.departureDate, today), with15: deps.with15 ?? WEATHER_MODE === 'auto', fetch: deps.fetch, now: () => now, runs,
    });
    await store.saveForecast(route.id, runs.length > 0 && forecast.runs.length === 0 ? { ...forecast, runs } : forecast, now);
    return { step: 'weather', ok: true, note: null };
  } catch (e) {
    if (routeGone(e)) throw e;
    return { step: 'weather', ok: false, note: noteFor(e, W.appPrepWeatherFailed) };
  }
}

async function baselineStep(deps: PrepareDeps, store: PreparedStore, online: boolean, trip: Trip, zones: ZoneSpan[], now: Date): Promise<StepReport> {
  if (!online) return { step: 'baseline', ok: false, note: W.appPrepNoConnection };
  try {
    // The window's own end: for a rider behind the plan it reaches past the planned end, so the current month is in.
    const { from, toExclusive } = windowDates(trip, localIsoDate(now, startZoneOf(zones)));
    const last = addDaysIso(toExclusive, -4);
    const months = new Set<number>();
    for (let d = from; d <= last; d = addDaysIso(d, 1)) months.add(Number(d.slice(5, 7)));
    await store.saveBaseline(trip.route.id, await deps.fetchBaseline(baselinePoints(trip.route), [...months], deps.fetch));
    return { step: 'baseline', ok: true, note: null };
  } catch (e) {
    if (routeGone(e)) throw e;
    return { step: 'baseline', ok: false, note: noteFor(e, W.appPrepBaselineFailed) };
  }
}

// ---- the whole ----------------------------------------------------------------------------------------------------------

function browserNavigator(): PrepareNavigator {
  return typeof navigator === 'undefined' ? {} : (navigator as unknown as PrepareNavigator);
}

async function keepAwake(nav: PrepareNavigator): Promise<() => Promise<void>> {
  try {
    const lock = await nav.wakeLock?.request('screen');
    return async () => {
      try {
        await lock?.release();
      } catch {
        /* the phone took it back already */
      }
    };
  } catch {
    return async () => undefined;
  }
}

/** Runs the steps in order. Never throws for a failed step; a trip is marked prepared when they end, also partly (Decision 2). */
export async function prepareTrip(deps: PrepareDeps, onProgress: (step: StepName, done: number, total: number) => void): Promise<StepReport[]> {
  const store = deps.store ?? preparedStore;
  const first = await store.readTrip();
  if (!first) return [];
  const release = await keepAwake(deps.nav ?? browserNavigator());
  const reports: StepReport[] = [];
  let step: StepName = 'heights';
  const begin = (name: StepName): void => {
    step = name;
    onProgress(name, 0, 1);
  };
  /** A step that blows up in a way of its own is that step's failure; the next ones still run. */
  const failed = (name: StepName, e: unknown): StepReport => {
    if (routeGone(e)) throw e;
    return { step: name, ok: false, note: noteFor(e, W.appPrepSaveFailed) };
  };
  try {
    const { online } = await checkConnectivity(deps.fetch);
    begin('heights');
    let trip = first;
    try {
      const heights = await heightsStep(deps, store, online, first);
      reports.push(heights.report);
      trip = heights.trip;
    } catch (e) {
      reports.push(failed('heights', e));
    }

    begin('places');
    let tiles: TileReport | null = null;
    try {
      const places = await placesStep(deps, store, online, trip, (done, total) => onProgress('places', done, total));
      reports.push(places.report);
      tiles = places.tiles;
    } catch (e) {
      reports.push(failed('places', e));
    }
    const zones = await readStoredZones();

    begin('hours');
    reports.push(await hoursStep(store, trip, zones, deps.now(), (done, total) => onProgress('hours', done, total)));
    begin('weather');
    reports.push(await weatherStep(deps, store, online, trip, zones, deps.now()));
    begin('baseline');
    reports.push(await baselineStep(deps, store, online, trip, zones, deps.now()));

    begin('save');
    const held = await readPrepared();
    const run = tiles ? null : await readPackRun();
    const record: PreparedRecord = {
      at: deps.now(), steps: [...reports],
      build: tiles ? {
        id: tiles.buildId, builtAt: tiles.manifest.builtAt,
        countries: Object.fromEntries(Object.entries(tiles.manifest.countries).map(([code, c]) => [code, c.sourceDate])),
      } : run ? {
        // The places step broke midway: the record names the build the stored data is of.
        id: run.buildId, builtAt: run.manifest.builtAt,
        countries: Object.fromEntries(Object.entries(run.manifest.countries).map(([code, c]) => [code, c.sourceDate])),
      } : held?.build ?? null,
      forecastFetchedAt: await readForecastDate(), baselineYears: await readBaselineYears(),
    };
    try {
      await store.savePrepared(trip.route.id, record);
      reports.push({ step: 'save', ok: true, note: null });
    } catch (e) {
      if (routeGone(e)) throw e;
      reports.push({ step: 'save', ok: false, note: noteFor(e, W.appPrepSaveFailed) });
    }
    return reports;
  } catch (e) {
    if (routeGone(e)) return [...reports, { step, ok: false, note: W.appPrepRouteReplaced }];
    return [...reports, { step, ok: false, note: noteFor(e, W.appPrepSaveFailed) }];
  } finally {
    await release();
  }
}

// ---- a trip past its window (section 4.5) --------------------------------------------------------------------------------

type IdleRequest = (run: () => void) => void;

function browserIdle(run: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => unknown }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 0);
}

/**
 * When the trip runs past the worked-out window, works out the hours again on the phone, offline too, in idle time, after the
 * answers on screen are shown. The UI calls this once a screen is up. Resolves to whether it did anything.
 */
export async function catchUpHours(now: Date, o: { requestIdle?: IdleRequest; store?: Pick<PreparedStore, 'saveHours'> } = {}): Promise<boolean> {
  const hours = await readHours();
  const trip = await readTrip();
  if (!trip || hours.length === 0 || !Number.isFinite(now.getTime())) return false;
  const ends = Math.min(...hours.map((h) => h.windowEnd.getTime()));
  // Tomorrow's answers read the window too.
  if (now.getTime() + DAY_MS < ends) return false;
  await new Promise<void>((resolve) => (o.requestIdle ?? browserIdle)(resolve));

  const zones = await readStoredZones();
  const today = localIsoDate(now, startZoneOf(zones));
  const { from, toExclusive } = windowDates(trip, today);
  const { places } = await readTileData();
  const matched = new Set(await readMatchedIds());
  const store = o.store ?? preparedStore;
  await workOutHours(store, trip.route.id, places, matched, from, toExclusive);
  const { holidaysFor } = await import('../core/hours/holidays.ts');
  const named = zonesNamed(zones, places);
  const held = await readHeldHolidays();
  const fresh = holidaysFor(named, from, addDaysIso(toExclusive, -1));
  await preparedStore.saveHolidays(trip.route.id, Object.fromEntries(named.map((z) => [z, [...new Set([...(held[z] ?? []), ...(fresh[z] ?? [])])].sort()])));
  markChanged('day');
  return true;
}

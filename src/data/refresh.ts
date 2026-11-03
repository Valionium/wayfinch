// When to ask for a new forecast (spec section 6.6, "Refresh modes" and "Model-run check and refresh"). `decideRefresh` is the
// rule, pure. `refreshWeather` does what it says on the real store, and contacts nothing before the rule allows it: no trip
// prepared, no signal or no reason means no request of any kind.
import { formatHm, localIsoDate } from '../core/answers/time.ts';
import { zoneLookupOf } from '../core/engines/tripday.ts';
import { fetchedLabel } from '../core/engines/weather.ts';
import { modelsForRoute } from '../core/engines/weather-classes.ts';
import type { Km, ModelRun, RoutePoint, StoredForecast } from '../core/types.ts';
import { W } from '../core/wording/en.ts';
import { fetchForecast, fetchModelRuns, forecastDaysFor, gridPoints, WeatherServiceError } from './openmeteo.ts';
import type { FetchLike } from './openmeteo.ts';
import type { WeatherMode } from './weather-mode.ts';

export type Trigger = 'open' | 'foreground' | 'tap';

const MIN = 60_000;
const HOUR = 60 * MIN;
const SPACING_MS = 30 * MIN;
const AUTO_SPACING_MS = 3 * HOUR;
const AUTO_NEWER_MS = 3 * HOUR;
const SETTLE_MS = 10 * MIN; // Open-Meteo advises waiting this long after a run becomes available

export type RefreshFacts = {
  mode: WeatherMode; trigger: Trigger;
  /** The latest runs of the models that matter for this route. Null or empty: no check to go by. */
  runs: ModelRun[] | null;
  /** The runs the stored forecast was fetched with. */
  held: ModelRun[];
  /** The stored forecast's fetch time. Null: no forecast stored. */
  lastFetchAt: Date | null;
  /** When a request last set out, also a refused one: it counts for the spacing, or a tap could ask a refusing service again and again. */
  lastAttemptAt?: Date | null;
  now: Date; keepFresh: boolean; signal: boolean;
  /** The place's zone, for what is said. */
  timeZone: string;
};

const goodDate = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime());

/** Time since the later of the two, in ms. A stamp ahead of now can't hold anything up: the clock moved, and a new request sets it right. */
function sinceLast(o: Pick<RefreshFacts, 'lastFetchAt' | 'lastAttemptAt' | 'now'>): number {
  const stamps = [o.lastFetchAt, o.lastAttemptAt].filter(goodDate).map((d) => o.now.getTime() - d.getTime()).filter((ms) => ms >= 0);
  return stamps.length > 0 ? Math.min(...stamps) : Infinity;
}

/** Whether anything may be sent at all: also the model-run check waits for this. */
function mayAsk(o: Pick<RefreshFacts, 'mode' | 'trigger' | 'keepFresh' | 'signal' | 'now' | 'lastFetchAt' | 'lastAttemptAt'>): boolean {
  if (!goodDate(o.now) || !o.signal) return false;
  if (o.trigger === 'tap') return sinceLast(o) >= SPACING_MS;
  return o.mode === 'auto' && o.keepFresh && sinceLast(o) >= AUTO_SPACING_MS;
}

const latestHeld = (held: ModelRun[], model: string): number | null => {
  const times = held.filter((r) => r.model === model && goodDate(r.run)).map((r) => r.run.getTime());
  return times.length > 0 ? Math.max(...times) : null;
};

const settled = (r: ModelRun, now: Date): boolean => now.getTime() - r.availableAt.getTime() >= SETTLE_MS;

const fetchedText = (o: RefreshFacts): string | null => (goodDate(o.lastFetchAt) ? fetchedLabel(o.lastFetchAt, o.now, o.timeZone) : null);

function newestSay(o: RefreshFacts, runs: ModelRun[]): string {
  const held = runs.map((r) => latestHeld(o.held, r.model)).filter((t) => t !== null);
  const run = held.length > 0 ? formatHm(new Date(Math.min(...held)), o.timeZone) : null;
  // A newer run still settling is the next one; otherwise each model's availability plus its interval.
  const expected = runs.flatMap((r): number[] => {
    const had = latestHeld(o.held, r.model);
    if ((had === null || r.run.getTime() > had) && !settled(r, o.now)) return [r.availableAt.getTime() + SETTLE_MS];
    return r.intervalS ? [r.availableAt.getTime() + r.intervalS * 1000] : [];
  }).filter((t) => t > o.now.getTime());
  return W.weatherNewest(run, expected.length > 0 ? formatHm(new Date(Math.min(...expected)), o.timeZone) : null);
}

/** What a trigger leads to. `say` is for the rider who tapped; the automatic triggers say nothing. */
export function decideRefresh(o: RefreshFacts): { fetch: boolean; say: string | null } {
  const tap = o.trigger === 'tap';
  if (!goodDate(o.now)) return { fetch: false, say: null };
  const fetched = fetchedText(o);
  if (!mayAsk(o)) {
    if (!tap) return { fetch: false, say: null };
    if (!o.signal) return { fetch: false, say: W.weatherNoSignal(fetched) };
    const again = formatHm(new Date(o.now.getTime() - sinceLast(o) + SPACING_MS), o.timeZone);
    return { fetch: false, say: W.weatherSpaced(fetched, again) };
  }
  if (!goodDate(o.lastFetchAt)) return { fetch: true, say: null }; // nothing stored to wait over
  const runs = o.runs && o.runs.length > 0 ? o.runs : null;
  if (!runs) {
    // A tap has waited out its 30 minutes in mayAsk. Automatic: when the forecast is over 3 hours old.
    return { fetch: tap || o.now.getTime() - o.lastFetchAt.getTime() > AUTO_SPACING_MS, say: null };
  }
  const worthIt = runs.some((r) => {
    if (!settled(r, o.now)) return false;
    const had = latestHeld(o.held, r.model);
    if (had === null) return true;
    return tap ? r.run.getTime() > had : r.run.getTime() - had >= AUTO_NEWER_MS;
  });
  if (worthIt) return { fetch: true, say: null };
  return { fetch: false, say: tap ? newestSay(o, runs) : null };
}

/** Whether "Keep trip data fresh when online" is shown at all (section 3.3). */
export const keepFreshOffered = (mode: WeatherMode): boolean => mode === 'auto';

export type WeatherStore = {
  read(): Promise<{
    route: Parameters<typeof gridPoints>[0]; departureDate: string | null; prepared: boolean; forecast: StoredForecast | null; lastAttemptAt: Date | null;
    routeZones: Parameters<typeof zoneLookupOf>[0]; finished?: boolean;
  } | null>;
  reserve(routeId: string, now: Date, gapMs: number): Promise<boolean>;
  save(routeId: string, forecast: StoredForecast): Promise<'saved' | 'gone' | 'older'>;
};

export type RefreshDeps = {
  mode: WeatherMode; fetch: FetchLike; now: () => Date; signal: boolean; keepFresh: boolean; store: WeatherStore;
  /** Where the rider about is, only to say times in the place's zone. It never goes into a request. */
  atKm?: Km;
};

export type RefreshResult = { fetched: boolean; say: string | null };

const NOTHING: RefreshResult = { fetched: false, say: null };

/**
 * One trigger, from start to finish. A new forecast goes in whole by one write once its answer has been checked whole, so
 * every failure leaves the stored forecast as it was. Never throws: the rider sees the sentence, and the old forecast.
 */
export async function refreshWeather(deps: RefreshDeps, trigger: Trigger): Promise<RefreshResult> {
  const tapped = trigger === 'tap';
  const told = (say: string): RefreshResult => ({ fetched: false, say: tapped ? say : null });
  let state: Awaited<ReturnType<WeatherStore['read']>>;
  try {
    state = await deps.store.read();
  } catch {
    return told(W.appStoreNotKept);
  }
  if (!state) return NOTHING; // no route, no Update weather
  const grid = gridPoints(state.route);
  if (!state.prepared || grid.length === 0) return told(W.weatherNotPrepared); // without a prepared trip, nothing is contacted

  const now = deps.now();
  const zone = zoneLookupOf(state.routeZones);
  const timeZone = zone(deps.atKm ?? 0).timeZone;
  const facts: RefreshFacts = {
    mode: deps.mode, trigger, runs: null, held: state.forecast?.runs ?? [], lastFetchAt: state.forecast?.fetchedAt ?? null, lastAttemptAt: state.lastAttemptAt,
    now, keepFresh: deps.keepFresh, signal: deps.signal, timeZone,
  };
  if (!mayAsk(facts)) {
    const { say } = decideRefresh(facts);
    return { fetched: false, say };
  }

  const models = modelsForRoute(state.route.points, (p) => zone((p as RoutePoint).km).country);
  const read = await fetchModelRuns(deps.fetch);
  const mattering = read.filter((r) => models.includes(r.model));
  // A check that failed in part is a failed check: a run read for only some models would name the wrong "oldest latest run".
  const whole = models.length > 0 && models.every((m) => mattering.some((r) => r.model === m));
  const decision = decideRefresh({ ...facts, runs: whole ? mattering : null });
  if (!decision.fetch) return { fetched: false, say: decision.say };

  const fetched = fetchedText(facts);
  let turn: boolean;
  try {
    turn = await deps.store.reserve(state.route.id, now, trigger === 'tap' ? SPACING_MS : AUTO_SPACING_MS);
  } catch {
    return told(W.weatherNotKept(fetched));
  }
  if (!turn) return told(W.weatherOtherWindow); // another window has just asked, or the route has gone

  const today = localIsoDate(now, zone(0).timeZone);
  let forecast: StoredForecast;
  try {
    forecast = await fetchForecast(grid, {
      days: forecastDaysFor(state.route, state.departureDate, today, state.finished === true), with15: deps.mode === 'auto', fetch: deps.fetch, now: () => now, runs: whole ? mattering : [],
    });
  } catch (e) {
    return told(e instanceof WeatherServiceError && e.kind === 'incomplete' ? W.weatherIncomplete(fetched) : W.weatherNoAnswer(fetched));
  }
  try {
    const saved = await deps.store.save(state.route.id, forecast);
    if (saved === 'saved') return { fetched: true, say: null };
    return told(saved === 'gone' ? W.weatherRouteChanged : W.weatherNewerSaved);
  } catch {
    return told(W.weatherNotKept(fetched));
  }
}

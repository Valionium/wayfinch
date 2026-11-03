// What the Trip screen reads and does, in one object, so the components hold no store or fetch of their own and a test can put
// a fake in its place. `browserTripServices()` is the real one: the store, Get ready offline and the browser.
//
// The store's rule for a window that writes: read what you are about to change first (`readTrip` before `saveTrip`, `readSettings`
// before `writeSettings`), and read the trip again after `writeSettings`, or the write is refused as older than another window's.
import { addDaysIso, formatLeaveBy, localIsoDate } from '../../core/answers/time.ts';
import { zoneLookupOf } from '../../core/engines/tripday.ts';
import type { XmlDocLike } from '../../core/route/gpx.ts';
import { buildScreen } from '../../core/screen/screen.ts';
import type { Route, Trip } from '../../core/types.ts';
import { shortIsoDay, W } from '../../core/wording/en.ts';
import { prepareTrip } from '../../data/prepare.ts';
import type { StepName, StepReport } from '../../data/prepare.ts';
import { fetchBaseline, fetchElevation, fetchForecast, fetchModelRuns } from '../../data/openmeteo.ts';
import { WEATHER_MODE } from '../../data/weather-mode.ts';
import type { WeatherMode } from '../../data/weather-mode.ts';
import { NewerDataError, RefusedError } from '../../store/changed.ts';
import { DB_NAME, openDb } from '../../store/db.ts';
import { readLocalSettings } from '../../store/settings-local.ts';
import { readInputs } from '../../store/inputs.ts';
import { readPrepared, readStoredZones } from '../../store/prepared.ts';
import type { PreparedRecord } from '../../store/prepared.ts';
import { DEFAULT_SETTINGS, goodDate } from '../../store/rules.ts';
import type { Settings } from '../../store/rules.ts';
import { readSettings, writeSettings } from '../../store/settings.ts';
import { readTrip, replaceRoute, RouteGoneError, sameLine, saveTrip } from '../../store/trip.ts';
import { preparedStore } from '../../store/prepared.ts';
import type { PreparedStore } from '../../store/prepared.ts';
import { planned, tripRuns } from './model.ts';

export type TripSnapshot = {
  now: Date;
  /** False when the browser would not open the database: nothing can be read or kept. */
  available: boolean;
  trip: Trip | null;
  settings: Settings;
  /** What Get ready offline last recorded; null if it has never ended for this route. */
  prepared: PreparedRecord | null;
  places: number;
  forecastTo: Date | null;
  /** When the stored forecast was fetched: its own time, not the time Get ready ended. */
  forecastFetchedAt: Date | null;
  /** The time zone of the route's start. */
  zone: string;
  storageMb: number | null;
  /** The Daylight card's leave-by for day 1, only on the day before the departure date. */
  day1LeaveBy: string | null;
  heightsLookedUp: boolean;
  running: boolean;
};

/** `dateNotSaved`: the route was replaced, but the write of its departure date was refused. */
export type AddOutcome = { kind: 'added' | 'replaced' | 'same'; name: string; dateNotSaved?: true };
export type SettingsOutcome = { ok: boolean; reasons: Partial<Record<keyof Settings, string>>; note: string | null };

export type TripEnv = {
  weatherMode: WeatherMode;
  userAgent: string;
  maxTouchPoints: number;
  platform: string;
  /** Running as the installed app; null when the page can't tell. */
  standalone: boolean | null;
};

export type TripServices = {
  now: () => Date;
  env: TripEnv;
  fetch: typeof fetch;
  parseXml: (text: string) => XmlDocLike;
  load: () => Promise<TripSnapshot>;
  /** Puts a route in: the first one, or in place of the old (the caller has asked the rider already, naming `expectedOldRouteId`). */
  addRoute: (found: { route: Route; hadHeights: boolean }, expectedOldRouteId: string | null) => Promise<AddOutcome>;
  /** The store Get ready writes through: its stage writes take their turn and use the settings as they are then. */
  prepareStore: (base: PreparedStore) => PreparedStore;
  writeSettings: (partial: Partial<Record<keyof Settings, unknown>>) => Promise<SettingsOutcome>;
  setDeparture: (date: string | null) => Promise<string | null>;
  prepare: (onProgress: (step: StepName, done: number, total: number) => void, onNotice: (text: string) => void) => Promise<StepReport[]>;
};

const HEIGHTS_FLAG = 'copilot:heights-lookup';
type Fingerprint = { n: number; a: [number, number]; b: [number, number] };

const fingerprint = (route: Route): Fingerprint => {
  const first = route.points[0]!;
  const last = route.points[route.points.length - 1]!;
  return { n: route.points.length, a: [first.lat, first.lon], b: [last.lat, last.lon] };
};

/** A route that came without heights is marked, so the credit for looked-up heights is told only of those. */
function noteHeights(route: Route, hadHeights: boolean): void {
  try {
    if (hadHeights) localStorage.removeItem(HEIGHTS_FLAG);
    else localStorage.setItem(HEIGHTS_FLAG, JSON.stringify(fingerprint(route)));
  } catch {
    // Storage blocked: the credit is simply not shown.
  }
}

function heightsLookedUp(route: Route): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(HEIGHTS_FLAG) ?? 'null') as Fingerprint | null;
    if (!raw || route.points.some((p) => p.ele === null)) return false;
    const now = fingerprint(route);
    return raw.n === now.n && raw.a[0] === now.a[0] && raw.a[1] === now.a[1] && raw.b[0] === now.b[0] && raw.b[1] === now.b[1];
  } catch {
    return false;
  }
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

async function counts(): Promise<{ places: number; forecastTo: Date | null; forecastFetchedAt: Date | null; lastPositionAt: Date | null }> {
  const db = await openDb();
  const places = await db.count('places');
  const forecast = (await db.get('forecast', 'current')) as { fetchedAt?: unknown; grid?: { hours?: { at: Date }[] }[] } | undefined;
  let forecastTo: Date | null = null;
  for (const g of forecast?.grid ?? []) {
    const at = g.hours?.[g.hours.length - 1]?.at;
    if (at instanceof Date && Number.isFinite(at.getTime()) && (forecastTo === null || at > forecastTo)) forecastTo = at;
  }
  let lastPositionAt: Date | null = null;
  for (const p of (await db.getAll('positions')) as { at?: unknown }[]) {
    if (p.at instanceof Date && Number.isFinite(p.at.getTime()) && (lastPositionAt === null || p.at > lastPositionAt)) lastPositionAt = p.at;
  }
  const fetched = forecast?.fetchedAt;
  return { places, forecastTo, forecastFetchedAt: fetched instanceof Date && Number.isFinite(fetched.getTime()) ? fetched : null, lastPositionAt };
}

/** Whether the database exists: reading it must not make one, or data the rider just deleted would be brought back by an open window. */
export async function dbExists(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some((d) => d.name === DB_NAME);
  } catch {
    return true;
  }
}

async function storageMb(): Promise<number | null> {
  try {
    const usage = (await navigator.storage?.estimate?.())?.usage;
    return typeof usage === 'number' && Number.isFinite(usage) ? Math.round(usage / 100_000) / 10 : null;
  } catch {
    return null;
  }
}

/** The device's own zone, only to say which day "today" is when a route is added. */
const deviceZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Why the store refused or failed, in the rider's words. */
export const reasonOf = (e: unknown): string => (e instanceof NewerDataError ? W.appStoreChangedElsewhere : e instanceof RefusedError ? e.message : W.appStoreNotKept);

/** The forecast's last day in the route's zone: a weekday within a week of now, otherwise the date, so a bare weekday is never ambiguous. */
export function forecastDay(forecastTo: Date, now: Date, zone: string): string {
  const date = localIsoDate(forecastTo, zone);
  const apart = Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localIsoDate(now, zone)}T00:00:00Z`)) / 86_400_000;
  return apart <= 6 ? W.timeWeekday(weekdayOf(date)) : (shortIsoDay(date) ?? date);
}

/** Whether the page runs as the installed app; null when the browser can't say (section 9.4: then nothing is asked or blocked). */
function standaloneNow(): boolean | null {
  if (typeof navigator === 'undefined') return null;
  const ios = (navigator as { standalone?: unknown }).standalone;
  if (typeof ios === 'boolean') return ios;
  return typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)').matches : null;
}

export function browserTripServices(now: () => Date = () => new Date()): TripServices {
  // One write at a time: the store refuses a write over a version this window has not read, so taps that follow each other fast must not overlap.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const nothing = (at: Date, settings: Settings, available: boolean): TripSnapshot => ({
    now: at, available, trip: null, settings, prepared: null, places: 0, forecastTo: null, forecastFetchedAt: null, zone: 'UTC', storageMb: null, day1LeaveBy: null, heightsLookedUp: false, running: false,
  });

  const load = async (): Promise<TripSnapshot> => {
    const at = now();
    if (!(await dbExists())) return { ...nothing(at, readLocalSettings().settings, true), storageMb: await storageMb() };
    let settings: Settings;
    let trip: Trip | null;
    try {
      settings = await readSettings();
      trip = await readTrip();
    } catch {
      return nothing(at, DEFAULT_SETTINGS, false);
    }
    if (!trip) return { ...nothing(at, settings, true), storageMb: await storageMb() };
    try {
      const prepared = await readPrepared();
      const zone = zoneLookupOf(await readStoredZones())(0).timeZone;
      const { places, forecastTo, forecastFetchedAt, lastPositionAt } = await counts();
      const today = localIsoDate(at, zone);
      let day1LeaveBy: string | null = null;
      if (trip.departureDate !== null && addDaysIso(today, 1) === trip.departureDate) {
        const inputs = await readInputs(at);
        const lb = inputs ? buildScreen(inputs).parts.lb?.unrounded : null;
        if (lb && Number.isFinite(lb.getTime())) day1LeaveBy = formatLeaveBy(lb, zone);
      }
      return {
        now: at, available: true, trip, settings, prepared, places, forecastTo, forecastFetchedAt, zone, storageMb: await storageMb(), day1LeaveBy,
        heightsLookedUp: heightsLookedUp(trip.route),
        running: tripRuns({ prepared: prepared !== null, departureDate: trip.departureDate, days: trip.route.stages.length || 1, today, lastPositionAt, now: at }),
      };
    } catch {
      return { ...nothing(at, settings, true), trip };
    }
  };

  /** After pace, speed or nights change, the days (and the forecast grid made with them) are made again, so Trip and Ahead agree. */
  const replan = async (): Promise<void> => {
    const settings = await readSettings();
    const trip = await readTrip();
    if (!trip) return;
    const route = planned(trip.route, { flatKph: trip.flatKph, pace: trip.pace ?? settings.pace, nights: settings.nights });
    if (JSON.stringify(route.stages) === JSON.stringify(trip.route.stages) && JSON.stringify(route.sampleGrid) === JSON.stringify(trip.route.sampleGrid)) return;
    await saveTrip({ ...trip, route });
  };

  const addRoute = async ({ route, hadHeights }: { route: Route; hadHeights: boolean }, expected: string | null): Promise<AddOutcome> => {
    const settings = await readSettings();
    const before = await readTrip();
    // The question the rider answered named a route; if another window has put in a different one since, nothing is replaced.
    if ((before?.route.id ?? null) !== expected) throw new RefusedError(W.appStoreChangedElsewhere);
    // The same line is the same route, whatever heights it has now.
    if (before && sameLine(before.route, route)) return { kind: 'same', name: before.route.name };
    const flatKph = before?.flatKph ?? settings.flatKph;
    const pace = before?.pace ?? settings.pace;
    // A replaced route starts with the stage model's nights; the first one takes what was set for the next trip.
    const withDays = planned(route, { flatKph, pace, nights: before ? null : settings.nights });
    const today = localIsoDate(now(), deviceZone());
    if (before) {
      await replaceRoute(withDays);
      // The route is replaced from here on. If only the date is refused, that is said as it is.
      try {
        const stored = await readTrip();
        if (stored) await saveTrip({ ...stored, departureDate: today });
      } catch {
        noteHeights(withDays, hadHeights);
        return { kind: 'replaced', name: route.name, dateNotSaved: true };
      }
    } else {
      await saveTrip({ route: withDays, departureDate: today, startTime: settings.startTime, flatKph, stay: settings.stay, campWaterL: settings.campWaterL, pace });
    }
    noteHeights(withDays, hadHeights);
    return { kind: before ? 'replaced' : 'added', name: route.name };
  };

  const changeSettings = async (partial: Partial<Record<keyof Settings, unknown>>): Promise<SettingsOutcome> => {
    try {
      await readSettings();
      const result = await writeSettings(partial);
      const replans = ['flatKph', 'pace', 'nights'].some((k) => k in partial && !(k in result.reasons));
      let note = result.newerReason;
      if (result.newer.length === 0 && replans) {
        try {
          await replan();
        } catch {
          // The setting is kept; only the days are behind. Said on its own, not as a refusal of the setting.
          note = W.appTripReplanFailed;
        }
      }
      return { ok: result.ok, reasons: result.reasons, note };
    } catch (e) {
      return { ok: false, reasons: {}, note: reasonOf(e) };
    }
  };

  const changeDeparture = async (date: string | null): Promise<string | null> => {
    if (date !== null && !goodDate(date)) return W.appStoreDepartureDate;
    try {
      const trip = await readTrip();
      if (!trip) return W.appStoreNotKept;
      await saveTrip({ ...trip, departureDate: date });
      return null;
    } catch (e) {
      return reasonOf(e);
    }
  };

  const services: TripServices = {
    now,
    env: {
      weatherMode: WEATHER_MODE, userAgent: nav?.userAgent ?? '', maxTouchPoints: nav?.maxTouchPoints ?? 0, platform: nav?.platform ?? '',
      standalone: standaloneNow(),
    },
    fetch: (input, init) => fetch(input, init),
    parseXml: (text) => new DOMParser().parseFromString(text, 'application/xml') as unknown as XmlDocLike,
    load,

    addRoute: (found, expected) => inTurn(() => addRoute(found, expected)),
    prepareStore: (base) => ({
      ...base,
      saveTrip: (trip) => inTurn(async () => {
        const settings = await readSettings();
        const current = await readTrip();
        if (!current || !sameLine(current.route, trip.route)) throw new RouteGoneError();
        // Planned again with the settings as they are now: the last word is the rider's current pace, speed and nights.
        const route = planned(trip.route, { flatKph: current.flatKph, pace: current.pace ?? settings.pace, nights: settings.nights });
        await base.saveTrip({ ...current, route });
      }),
    }),
    writeSettings: (partial) => inTurn(() => changeSettings(partial)),
    setDeparture: (date) => inTurn(() => changeDeparture(date)),

    prepare(onProgress, onNotice) {
      return prepareTrip({
        fetch: (input, init) => fetch(input, init),
        fetchForecast, fetchBaseline, fetchElevation, fetchModelRuns,
        now, onNotice, with15: WEATHER_MODE === 'auto', store: services.prepareStore(preparedStore),
      }, onProgress);
    },
  };
  return services;
}

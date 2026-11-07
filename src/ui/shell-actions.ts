// Ahead's real actions (plan Task 15): the one file that touches the store and the network for Ahead. It reads the inputs, builds
// the screen with `screen()`, and hands the components the screen, a few plain facts and the actions. Nothing is sent on its own:
// the position is asked for only on a tap, the forecast only on Update weather's tap (weatherMode "tap"), and sharing is the
// rider's own, through the apps they choose.
//
// The store's rules hold: positions and day starts take the route id they were measured on, and every write goes through one
// queue, so two taps in a row never write over each other.
import { effect, signal, untracked } from '@preact/signals';
import type { Signal } from '@preact/signals';
import { formatHm } from '../core/answers/time.ts';
import { emergencyCard } from '../core/engines/emergency.ts';
import type { Fix } from '../core/engines/locate.ts';
import { usableFlatKph } from '../core/engines/pace.ts';
import { zoneLookupOf } from '../core/engines/tripday.ts';
import { waterNow } from '../core/engines/water.ts';
import { thunderNear } from '../core/engines/shelter.ts';
import { buildScreen } from '../core/screen/screen.ts';
import type { Screen } from '../core/screen/screen.ts';
import type { Km, Position, Route, ScreenInputs } from '../core/types.ts';
import { showKm, W } from '../core/wording/en.ts';
import { checkConnectivity } from '../data/connectivity.ts';
import { refreshWeather } from '../data/refresh.ts';
import { WEATHER_MODE } from '../data/weather-mode.ts';
import { announceHere, onChanged } from '../store/changed.ts';
import { keepAfterScreen, readInputs } from '../store/inputs.ts';
import { addPosition, backToToday, confirmWater, setPlanTomorrow } from '../store/positions.ts';
import { readMapLink, writeMapLink } from '../store/share-choice.ts';
import { weatherStore } from '../store/weather.ts';
import type { AheadActions, AheadTrip, AheadView, PositionState, Town } from './ahead/actions.ts';
import { bikeSource } from './bike/live.ts';
import { noteRoute, noteTripFacts } from './degraded.ts';
import { isFailure, locateFix, manualAt, onPass, ROUTINE, watchBest } from './position.ts';
import type { Failure } from './position.ts';
import { agoText } from './trip/model.ts';
import { whileVisible } from './screen-clock.ts';

const APPROXIMATE_HELP_M = 1000; // section 9.2: worse than about 1 km usually means approximate location only
const SHARE_OLD_MS = 30 * 60_000; // section 6.14
/** While Ahead is in front, the screen is built again for the time now this often: ages, "here" and stamps follow the clock. */
export const TICK_MS = 60_000;

export type AheadDeps = {
  now: () => Date;
  geolocation: () => Geolocation | undefined;
  /** navigator.onLine: only a hint; Update weather checks with one HEAD to the app's own address (section 9.4). */
  online: () => boolean;
  fetch: typeof fetch;
  share: ((data: { text: string }) => Promise<void>) | null;
  writeClipboard: ((text: string) => Promise<void>) | null;
};

function browserDeps(): AheadDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    now: () => new Date(),
    geolocation: () => nav?.geolocation,
    online: () => nav?.onLine !== false,
    fetch: (input, init) => fetch(input, init),
    share: nav && typeof nav.share === 'function' ? (data) => nav.share(data) : null,
    writeClipboard: nav?.clipboard && typeof nav.clipboard.writeText === 'function' ? (text) => nav.clipboard.writeText(text) : null,
  };
}

const FAILURE_TEXT: Record<Failure['kind'], string> = {
  denied: W.appAheadDenied, unavailable: W.appAheadNoFix, timeout: W.appAheadNoFix, unsupported: W.appAheadNoGeo,
};
type HereWords = typeof import('../core/wording/en-here.ts').H;
type AskWords = typeof import('../core/wording/en-ask.ts').A;
/** With no route there is no setting it by hand: each says what to do instead (its words load on the tap, review of PR 53, M6). */
const hereFailure = (h: HereWords, kind: Failure['kind']): string =>
  kind === 'denied' ? h.hereDenied : kind === 'timeout' ? h.hereTimeout : kind === 'unavailable' ? h.hereNoFix : W.appAheadNoGeo;
/** A fix a phone can mean: on the globe, and not the 0, 0 it gives for none. */
const usableFix = (f: Fix): boolean => Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180 && !(Math.abs(f.lat) < 5e-6 && Math.abs(f.lon) < 5e-6);
/** A fix as it came, on no route kilometre: Emergency's own view of it. With no route its distance off one is unknown (NaN). */
const asCame = (f: Fix, offRouteM = NaN): Position => ({ ...f, km: NaN, offRouteM, source: 'gps', approximate: !(f.accuracyM <= APPROXIMATE_HELP_M) });

const escaped = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * While Ahead asks which pass, no line of the screen says "No position yet": a position was found and waits for the rider's answer
 * (after the launch, 7 Nov 2026). The notes, and the help chips' "measured from km …" (review of PR 65, M1).
 */
function whileAsking(s: Screen, words: AskWords): void {
  s.notes = s.notes.map((n) => (n === W.routeNoPositionFromStart ? words.askPassFromStart : n));
  const [before, after] = W.helpFromNoPosition('\u0000').split('\u0000') as [string, string];
  const said = new RegExp(`${escaped(before)}(.+?)${escaped(after)}(?= |$)`);
  for (const chip of Object.values(s.chips)) chip.detail = chip.detail.replace(said, (_, km: string) => words.askPassMeasuredFrom(km));
}

/** The settlements the route passes, in route order: the manual picker's towns. */
function townsOf(i: ScreenInputs): Town[] {
  const names = new Map(i.places.filter((p) => p.kind === 'settlement' && typeof p.name === 'string' && p.name.trim() !== '').map((p) => [p.id, p.name!.trim()]));
  const out: Town[] = [];
  for (const m of i.matches) {
    const name = names.get(m.placeId);
    if (name !== undefined && Number.isFinite(m.km) && m.km >= 0 && m.km <= i.trip.route.lengthKm) out.push({ name, km: m.km });
  }
  return out.sort((a, b) => a.km - b.km || (a.name < b.name ? -1 : 1));
}

export type AheadShell = {
  view: Signal<AheadView>;
  actions: AheadActions;
  /** Reads the store now and whenever another window changes it. Returns how to stop. */
  start(): () => void;
  /** Shows the screen of these inputs instead of the store's, and stops reading the store: only test builds call it. */
  show(inputs: ScreenInputs): void;
};

export function browserAhead(deps: AheadDeps = browserDeps()): AheadShell {
  const view = signal<AheadView>({ kind: 'loading' });
  let inputs: ScreenInputs | null = null;
  let position: PositionState = { kind: 'idle' };
  let weatherSay: string | null = null;
  let weatherBusy = false;
  let notice: string | null = null;
  /**
   * The fix Ahead asks about, as Emergency shows it: on no route kilometre, at its distance from the route, so Emergency's notes on
   * what is not stored are true for it (review of PR 53, N1).
   */
  let pendingFix: Position | null = null;
  /** A pass of the route the pending fix may lie on: where its country and clock are read while Ahead asks which pass. */
  let pendingKm: Km | null = null;
  /** The which-pass question's words, there whenever a fix is pending (they load with the tap: not on the first screen). */
  let askWords: AskWords | null = null;
  let hooked = false;
  let reading = 0;
  // With no route: the fix Emergency's Update position found, for this page only. Positions are kept on a route, so it is not stored.
  let here: Position | null = null;

  // One write at a time, as on Trip: the store refuses a write over a version this window has not read.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  const present = (i: ScreenInputs): void => {
    const now = i.now;
    const built = buildScreen(i);
    const s = built.screen;
    const p = built.parts.position;
    // While Ahead asks which pass, Emergency already shows the fix as it came (review of PR 53, I1): it never waits on a question.
    if (pendingFix && pendingKm !== null) {
      try {
        const z = zoneLookupOf(i.routeZones)(pendingKm);
        let dataDate = '';
        for (const q of i.places) if (typeof q.dataDate === 'string' && q.dataDate > dataDate) dataDate = q.dataDate;
        s.chips.emergency = emergencyCard({
          position: pendingFix, now, country: z.country, timeZone: z.timeZone, dataDate, rescuePoints: i.rescuePoints,
          settlements: i.places.filter((q) => q.kind === 'settlement'), shelters: i.places.filter((q) => q.kind === 'shelter'),
          thunderNear: thunderNear(built.parts.stop),
        });
      } catch { /* the stored position's card stays */ }
      if (askWords) whileAsking(s, askWords);
    }
    let stillAboutL: number | null = null;
    try {
      const w = waterNow(built.parts.water);
      if (!w.confirmed && w.stillAbout !== null && Number.isFinite(w.stillAbout)) stillAboutL = Math.round(w.stillAbout * 10) / 10;
    } catch {
      stillAboutL = null;
    }
    let shareOld: string | null = null;
    if (p && now.getTime() - p.at.getTime() > SHARE_OLD_MS) {
      try {
        shareOld = W.appAheadShareOld(formatHm(p.at, zoneLookupOf(i.routeZones)(p.km).timeZone), agoText(p.at, now));
      } catch {
        shareOld = null;
      }
    }
    const dayOne = i.trip.departureDate === null || s.phase === 'before-trip' || (s.ride.date === i.trip.departureDate && s.ride.startKm === 0);
    const next: AheadTrip = {
      kind: 'trip', screen: s, answers: s.positionLine !== null || dayOne, lengthKm: i.trip.route.lengthKm, towns: townsOf(i),
      bike: bikeSource.peek().bike, stillAboutL, badSpeed: !usableFlatKph(i.trip.flatKph),
      approximateHelp: p !== null && p.source === 'gps' && !(p.accuracyM <= APPROXIMATE_HELP_M),
      shareOld, mapLink: readMapLink(), canShare: deps.share !== null, position, weatherSay, weatherBusy, notice,
    };
    view.value = next;
    noteRoute(true);
  };

  const emergencyAlone = (at: Date) => emergencyCard({
    position: here, now: at, country: null, settlements: [], shelters: [], rescuePoints: [], thunderNear: false, dataDate: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const unreadable = (at: Date): void => {
    view.value = { kind: 'unreadable', canShare: deps.share !== null, emergency: emergencyAlone(at), position };
    noteRoute(null);
  };

  const noRoute = (at: Date): void => {
    view.value = {
      kind: 'no-route', canShare: deps.share !== null,
      emergency: emergencyAlone(at), position,
    };
    noteTripFacts(false, false);
  };

  /** The screen again for the time now, from the inputs already read: no store, no network. */
  const freshen = (): void => {
    const v = view.peek();
    if (!hooked && here && v.kind !== 'trip' && v.kind !== 'loading') view.value = { ...v, emergency: emergencyAlone(deps.now()) };
    if (hooked || !inputs || v.kind !== 'trip') return;
    present({ ...inputs, now: deps.now() });
  };

  /** The facts that change without a new screen: the position routine, Update weather, the bike, the map-link choice. */
  const touch = (): void => {
    const v = view.peek();
    if (v.kind === 'no-route' || v.kind === 'unreadable') view.value = { ...v, position, emergency: emergencyAlone(deps.now()) };
    if (v.kind !== 'trip') return;
    view.value = { ...v, position, weatherSay, weatherBusy, notice, bike: bikeSource.peek().bike, mapLink: readMapLink() };
  };

  const load = async (): Promise<void> => {
    if (hooked) return;
    const mine = (reading += 1);
    const at = deps.now();
    let read: ScreenInputs | null;
    let failed = false;
    try {
      // A read never makes the database: with none (a fresh phone, or just deleted) there is no trip.
      read = await readInputs(at);
    } catch {
      read = null;
      failed = true;
    }
    // Only the newest read is shown: an older one that finishes late would bring back what was just changed.
    if (hooked || mine !== reading) return;
    inputs = read;
    // A trip that could not be read is not "no route": the rider is told, and can try again.
    if (failed) {
      unreadable(at);
      return;
    }
    if (!read) {
      noRoute(at);
      return;
    }
    present(read);
    const shown = view.peek();
    if (shown.kind === 'trip') {
      const routeId = read.trip.route.id;
      void inTurn(() => keepAfterScreen(shown.screen, at, routeId)).catch(() => undefined);
    }
  };

  const say = (state: PositionState): void => {
    position = state;
    touch();
  };

  /** Keeps a position, measured on `route`. Refused (the route changed meanwhile, or it lies off the route): the rider is told. */
  const keep = async (p: Position, route: Route): Promise<boolean> => {
    let kept = false;
    try {
      kept = (await inTurn(() => addPosition(p, deps.now(), route.id))).kept;
    } catch {
      kept = false;
    }
    position = kept ? { kind: 'idle' } : { kind: 'said', text: W.appAheadNotKept };
    await load();
    touch();
    return kept;
  };

  const routeNow = async (): Promise<ScreenInputs | null> => {
    try {
      return await readInputs(deps.now());
    } catch {
      return null;
    }
  };

  const actions: AheadActions = {
    async updatePosition() {
      if (position.kind === 'watching') return false;
      pendingFix = null;
      pendingKm = null;
      const alone = view.peek().kind !== 'trip';
      const words = alone ? import('../core/wording/en-here.ts').then((m) => m.H, () => null) : null;
      // The which-pass question's words load meanwhile, from the phone itself: the first screen does not carry them. Also with no
      // route on screen, since one may be added in another window while the phone is looking.
      const ask = import('../core/wording/en-ask.ts').then((m) => m.A, () => null);
      say({ kind: 'watching' });
      const fix = await watchBest(ROUTINE, deps.geolocation());
      if (isFailure(fix)) {
        const h = await words;
        say({ kind: 'said', text: h ? hereFailure(h, fix.kind) : FAILURE_TEXT[fix.kind] });
        return false;
      }
      if (alone && !usableFix(fix)) {
        say({ kind: 'said', text: (await words)?.hereUnusable ?? W.appAheadNoPosition });
        return false;
      }
      // Read again: the route may have been replaced while the phone was looking.
      const now = await routeNow();
      if (!now) {
        // No route: Emergency shows the fix as it came, with no route kilometre (owner's iPhone check, 6 Nov 2026).
        if (alone) here = asCame(fix);
        say(alone ? { kind: 'idle' } : { kind: 'said', text: W.appAheadNotKept });
        return alone;
      }
      const found = locateFix(fix, now.trip.route, now.positions);
      if (found.kind === 'no-position') {
        say({ kind: 'said', text: W.appAheadNoPosition });
        return false;
      }
      if (found.kind === 'ask') {
        // Its distance off is measured at the first pass offered: both lie within 200 m of the route's nearest point (locate.ts's
        // band), and never nearer, so Emergency's notes can only err on the careful side. No pass to measure at reads as unknown.
        pendingKm = found.options[0] ?? null;
        const mine = asCame(fix, onPass(fix, now.trip.route, found.options[0])?.offRouteM);
        pendingFix = mine;
        // Emergency first, and the tap free again: neither waits on the question's words, which may fail or hang on a page no
        // service worker controls (review of PR 65, I1).
        position = { kind: 'idle' };
        present({ ...now, now: deps.now() });
        const words = await ask;
        // A newer tap, a pass chosen or a position set by hand meanwhile: this question is no longer the one to ask.
        if (pendingFix !== mine) return false;
        if (!words) {
          say({ kind: 'said', text: W.appLazyFailed });
          return false;
        }
        askWords = words;
        const [a, b] = found.options.map((km) => showKm(km)) as [string, string];
        position = { kind: 'ask', question: words.askPass(a, b), options: found.options.map((km) => ({ km, text: words.askPassKm(showKm(km)) })) };
        present({ ...now, now: deps.now() });
        return false;
      }
      return keep(found.position, now.trip.route);
    },

    async choosePass(km: Km) {
      const fix = pendingFix;
      pendingFix = null;
      pendingKm = null;
      const now = await routeNow();
      const p = fix && now ? onPass(fix, now.trip.route, km) : null;
      if (!p || !now) {
        say({ kind: 'said', text: W.appAheadNotKept });
        return false;
      }
      return keep(p, now.trip.route);
    },

    async setManual(at) {
      pendingFix = null;
      pendingKm = null;
      const now = await routeNow();
      if (!now) {
        say({ kind: 'said', text: W.appAheadNotKept });
        return false;
      }
      const km = typeof at === 'number' ? at : at.km;
      const p = manualAt(now.trip.route, km, deps.now());
      if (!p || km < 0 || km > now.trip.route.lengthKm) {
        say({ kind: 'said', text: W.appAheadManualBadKm(showKm(now.trip.route.lengthKm)) });
        return false;
      }
      return keep(p, now.trip.route);
    },

    async confirmWater(litres) {
      let reason: string | null;
      try {
        reason = (await inTurn(() => confirmWater(litres, deps.now()))).reason;
      } catch {
        reason = W.appStoreNotKept;
      }
      await load();
      return reason;
    },

    async updateWeather() {
      if (weatherBusy) return;
      weatherBusy = true;
      weatherSay = null;
      touch();
      try {
        // Any answer from the app's own address means a signal; the hint alone is not trusted to say so (section 9.4).
        const signalNow = deps.online() ? (await checkConnectivity(deps.fetch)).online : false;
        const v = view.peek();
        const result = await refreshWeather({
          mode: WEATHER_MODE, fetch: deps.fetch, now: deps.now, signal: signalNow, keepFresh: inputs?.settings.keepFresh ?? false,
          store: {
            read: weatherStore.read,
            reserve: (routeId, now, gapMs) => inTurn(() => weatherStore.reserve(routeId, now, gapMs)),
            save: (routeId, forecast, now) => inTurn(() => weatherStore.save(routeId, forecast, now)),
          },
          ...(v.kind === 'trip' && Number.isFinite(v.screen.ride.startKm) ? { atKm: v.screen.ride.startKm } : {}),
        }, 'tap');
        weatherSay = result.say ?? (result.fetched ? W.appAheadWeatherUpdated : null);
        // Trip's summary of the forecast reads again too (this window's own screens hear no storage event).
        if (result.fetched) announceHere('weather');
      } catch {
        weatherSay = W.appStoreNotKept;
      } finally {
        weatherBusy = false;
      }
      await load();
      touch();
    },

    // The choice lives in this browser's storage; one it refused is said, not passed over.
    async planTomorrow(date) {
      notice = setPlanTomorrow(date) ? null : W.appAheadChoiceNotKept;
      await load();
      touch();
    },
    async backToToday() {
      notice = backToToday(deps.now()) ? null : W.appAheadChoiceNotKept;
      await load();
      touch();
    },
    retry: () => load(),

    setMapLink(on) {
      writeMapLink(on);
      touch();
    },
    async share(text) {
      if (!deps.share) return false;
      try {
        await deps.share({ text });
        return true;
      } catch {
        return false;
      }
    },
    async copy(text) {
      if (!deps.writeClipboard) return false;
      try {
        await deps.writeClipboard(text);
        return true;
      } catch {
        return false;
      }
    },
    // No recipient: the rider picks one in the SMS app. "?&body=" is the form both iPhone and Android open.
    smsHref: (text) => `sms:?&body=${encodeURIComponent(text)}`,
    freshen,
  };

  return {
    view, actions,
    start() {
      void load();
      const stop = onChanged(() => void load());
      // A screen left in front (a phone on the bars, a long stop) is built again each minute from what was read, for the time now:
      // no store read or write, no request. Only while the page is visible.
      const stopTick = whileVisible(freshen, TICK_MS);
      const visible = (): void => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load(); };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
      // A bike saved in the bag planner redraws the marker at once.
      const stopBike = effect(() => {
        void bikeSource.value;
        untracked(touch);
      });
      return () => {
        stop();
        stopTick();
        stopBike();
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
      };
    },
    show(i) {
      hooked = true;
      inputs = i;
      present(i);
    },
  };
}

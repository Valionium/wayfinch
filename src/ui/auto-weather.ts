// Automatic weather refresh (spec section 6.6, the owner's ruling A of 3 November): when the app opens and when it comes back to the
// foreground, with a prepared trip, signal and "Keep trip data fresh when online" on. It runs only while the app is open: there is
// no timer and nothing in the background. The rules (model-run check first, 3 hours between automatic fetches, stored across
// reloads, the stored forecast kept when a request is refused) are refresh.ts's; this file only starts it.
import { openExisting } from '../store/db.ts';
import { checkConnectivity } from '../data/connectivity.ts';
import { refreshWeather } from '../data/refresh.ts';
import type { RefreshResult, WeatherStore } from '../data/refresh.ts';
import { WEATHER_MODE } from '../data/weather-mode.ts';
import type { WeatherMode } from '../data/weather-mode.ts';
import { announceHere } from '../store/changed.ts';
import { readLocalSettings } from '../store/settings-local.ts';
import { weatherStore } from '../store/weather.ts';

const AUTO_SPACING_MS = 3 * 3_600_000;

export type AutoDeps = {
  mode: WeatherMode;
  now: () => Date;
  online: () => boolean;
  fetch: typeof fetch;
  keepFresh: () => boolean;
  store: WeatherStore;
};

export function browserAutoDeps(): AutoDeps {
  return {
    mode: WEATHER_MODE,
    now: () => new Date(),
    online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    fetch: (input, init) => fetch(input, init),
    keepFresh: () => readLocalSettings().settings.keepFresh,
    store: weatherStore,
  };
}

let running = false;

/** One automatic trigger. Null: nothing was asked (tap build, setting off, no prepared trip, or asked less than 3 hours ago). */
export async function autoRefresh(trigger: 'open' | 'foreground', deps: AutoDeps = browserAutoDeps()): Promise<RefreshResult | null> {
  if (deps.mode !== 'auto' || !deps.keepFresh() || running) return null;
  running = true;
  try {
    // After Delete co-pilot data there is nothing to refresh. The open makes no database (store/db.ts): none, nothing is read.
    if (!(await openExisting())) return null;
    const state = await deps.store.read();
    if (!state?.prepared) return null;
    // Nothing is contacted, not even the app's own address, while the last ask is under 3 hours old.
    const last = Math.max(state.forecast?.fetchedAt.getTime() ?? 0, state.lastAttemptAt?.getTime() ?? 0);
    const since = deps.now().getTime() - last;
    if (last > 0 && since >= 0 && since < AUTO_SPACING_MS) return null;
    const signal = deps.online() ? (await checkConnectivity(deps.fetch)).online : false;
    const result = await refreshWeather({ mode: deps.mode, fetch: deps.fetch, now: deps.now, signal, keepFresh: true, store: deps.store }, trigger);
    // The new forecast is stored; the screens of this window read it again (the storage event reaches only the other windows).
    if (result.fetched) announceHere('weather');
    return result;
  } catch {
    return null;
  } finally {
    running = false;
  }
}

/** At start, and each time the page becomes visible again. Returns how to stop. */
export function startAutoWeather(deps: AutoDeps = browserAutoDeps(), doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document): () => void {
  void autoRefresh('open', deps);
  const onVisible = (): void => { if (doc.visibilityState === 'visible') void autoRefresh('foreground', deps); };
  doc.addEventListener('visibilitychange', onVisible);
  return () => doc.removeEventListener('visibilitychange', onVisible);
}

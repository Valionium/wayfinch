// The browser entry. Renders first, then registers the worker once (APP-REGISTER).
import { render } from 'preact';
import './theme.css';
import { App } from './app.tsx';
import { watchDegraded } from './degraded.ts';
import { startAutoWeather } from './auto-weather.ts';
import { loadRiderKg, reloadRiderKg } from './rider-kg.ts';
import { onChanged } from '../store/changed.ts';
import { readLocalSettings } from '../store/settings-local.ts';
import { applyTheme, firstTheme } from './theme-apply.ts';
import { listenForInstall } from './install.ts';
import { makeUpdater, startOfflineWorker } from './register.ts';
import { openOnFirstScreen } from './trip/first.ts';
import { browserTripServices } from './trip/services.ts';
import { cleanupStoredHandoff } from './trip/handoff.ts';

applyTheme(firstTheme(readLocalSettings().settings.theme));
void loadRiderKg();
onChanged(() => { void reloadRiderKg(); });
listenForInstall();
const updater = makeUpdater();
render(<App updater={updater} />, document.getElementById('app')!);
void startOfflineWorker({
  serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  isSecureContext: window.isSecureContext,
  updater,
});
updater?.start();
void watchDegraded({
  indexedDB: typeof indexedDB === 'undefined' ? undefined : indexedDB,
  online: () => navigator.onLine,
  addOnlineListener: (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); },
});
startAutoWeather();
void cleanupStoredHandoff();
// A theme chosen in the bag planner, and bikes it saved while this page was away: after the first screen.
void import('./page-return.ts');
void openOnFirstScreen(browserTripServices(), location.hash.replace(/^#\/?/, '') !== '');
// Only a --test-hooks build has this; in any other the condition is false and the hook is not built in.
if (__WF_TEST_HOOKS__) void import('./test-hooks.ts');

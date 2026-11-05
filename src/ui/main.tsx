// The browser entry. Renders first, then registers the worker once (APP-REGISTER).
import { render } from 'preact';
import './theme.css';
import { App } from './app.tsx';
import { watchDegraded } from './degraded.ts';
import { startAutoWeather } from './auto-weather.ts';
import { loadRiderKg, reloadRiderKg } from './rider-kg.ts';
import { onChanged } from '../store/changed.ts';
import { applyTheme, followTheme, themeNow } from './theme-apply.ts';
import { listenForInstall } from './install.ts';
import { makeUpdater, startOfflineWorker } from './register.ts';
import { openOnFirstScreen } from './trip/first.ts';
import { browserTripServices } from './trip/services.ts';
import { cleanupStoredHandoff } from './trip/handoff.ts';

applyTheme(themeNow());
followTheme();
void loadRiderKg();
onChanged(() => { void reloadRiderKg(); applyTheme(themeNow()); });
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
void openOnFirstScreen(browserTripServices(), location.hash.replace(/^#\/?/, '') !== '');
// Only a --test-hooks build has this; in any other the condition is false and the hook is not built in.
if (__WF_TEST_HOOKS__) void import('./test-hooks.ts');

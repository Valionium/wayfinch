// The browser entry. Renders first, then registers the worker once (APP-REGISTER).
import { render } from 'preact';
import './theme.css';
import { App } from './app.tsx';
import { watchDegraded } from './degraded.ts';
import { makeUpdater, startOfflineWorker } from './register.ts';

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

// The app's shell: the update bar, the current screen and the four tabs (spec section 3.1).
// The screens are placeholders until their groups arrive; the shell already opens on Trip when no trip runs.
import { useEffect } from 'preact/hooks';
import { W } from '../core/wording/en.ts';
import { AheadScreen } from './ahead/ahead.tsx';
import { browserAhead } from './shell-actions.ts';
import { TyreScreen, browserServices } from '../tools/tyre/ui.tsx';
import { Degraded } from './card.tsx';
import { degradedSignal } from './degraded.ts';
import { screenSignal, tabOf } from './nav.ts';
import type { ScreenName, TabName } from './nav.ts';
import type { Updater } from './update.ts';
import { ToolsScreen } from './tools/tools.tsx';
import { browserTripServices } from './trip/services.ts';
import { TripScreen } from './trip/trip.tsx';

// The tyre tool reads Load Check's records and its own storage; rider weight from You joins when the store does.
const tyreServices = browserServices();
const tripServices = browserTripServices();
export const aheadShell = browserAhead();

const TABS: { name: TabName; label: string }[] = [
  { name: 'ahead', label: W.appTabAhead },
  { name: 'trip', label: W.appTabTrip },
  { name: 'tools', label: W.appTabTools },
  { name: 'you', label: W.appTabYou },
];

const TITLES: Record<TabName, string> = {
  ahead: W.appTabAhead,
  trip: W.appTabTrip,
  tools: W.appTabTools,
  you: W.appTabYou,
};

/** Ahead reads the store only while it is shown; another window's change re-reads it. */
function AheadHost() {
  useEffect(() => aheadShell.start(), []);
  return <AheadScreen view={aheadShell.view.value} actions={aheadShell.actions} />;
}

function Screen({ name }: { name: ScreenName }) {
  const tab = tabOf(name);
  return (
    <main class="screen" id="main" data-screen={name}>
      <h1>{TITLES[tab]}</h1>
      {degradedSignal.value.map((kind) => <Degraded key={kind} kind={kind} />)}
      {name === 'ahead' ? <AheadHost /> : null}
      {name === 'trip' ? <TripScreen services={tripServices} /> : null}
      {name === 'tools' ? <ToolsScreen services={tyreServices} /> : null}
      {name === 'tools/tyre' ? <TyreScreen services={tyreServices} /> : null}
    </main>
  );
}

function UpdateBar({ updater }: { updater: Updater }) {
  if (!updater.ready.value) return null;
  return (
    <div class="update-bar">
      <button type="button" class="btn btn-primary" onClick={() => void updater.apply()}>{W.appUpdateReady}</button>
      {updater.note.value ? <p role="status">{updater.note.value}</p> : null}
    </div>
  );
}

export function App({ updater = null }: { updater?: Updater | null }) {
  const current = screenSignal.value;
  const active = tabOf(current);
  return (
    <div class="shell">
      {updater ? <UpdateBar updater={updater} /> : null}
      <Screen name={current} />
      <nav class="tabs" aria-label={W.appNavLabel}>
        {TABS.map((tab) => (
          <a key={tab.name} class="tab" href={`#/${tab.name}`} aria-current={tab.name === active ? 'page' : undefined}>{tab.label}</a>
        ))}
      </nav>
    </div>
  );
}

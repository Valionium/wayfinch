// The app's shell: the update bar, the current screen and the four tabs (spec section 3.1).
// The screens are placeholders until their groups arrive; the shell already opens on Trip when no trip runs.
import { useEffect, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { W } from '../core/wording/en.ts';
import { AheadScreen } from './ahead/ahead.tsx';
import { browserAhead } from './shell-actions.ts';
import { browserServices } from '../tools/tyre/services.ts';
import { lazy } from './lazy.tsx';
import { movedCardDue } from './moved-due.ts';
import { riderKg } from './rider-kg.ts';
import { Degraded } from './card.tsx';
import { degradedSignal, kindsOnScreen } from './degraded.ts';
import { bikeSource } from './bike/live.ts';
import { screenSignal, tabOf, toolLinkBike } from './nav.ts';
import type { ScreenName, TabName } from './nav.ts';
import type { Updater } from './update.ts';
import { browserTripServices } from './trip/services.ts';
import { TripScreen } from './trip/trip.tsx';
import { installDrop } from './wide/drop.ts';
import { installFocusClear } from './wide/wide.ts';
import './wide/wide.css';

// The tyre tool reads Load Check's records, its own storage and the rider's weight from You.
const tyreServices = browserServices(riderKg);
// The tyre tool's screen is its own chunk: it is not a first screen.
const TyreScreen = lazy(() => import('../tools/tyre/ui.tsx').then((m) => m.TyreScreen));
// Tools is its own chunk too (sub-project 11): its bike line and cards are not a first screen; it is precached like the rest.
const ToolsScreen = lazy(() => import('./tools/tools.tsx').then((m) => m.ToolsScreen));
// You is its own chunk too (spec section 3.5): the first screen does not carry its form, export or import.
const YouHost = lazy(() => import('./you/host.tsx').then((m) => m.YouHost));
const tripServices = browserTripServices();

// A tool address with ?bike=<id> (toolHref) chooses that saved bike once, then leaves the plain address. An id no saved bike has chooses
// nothing. The choice code is a chunk of its own, loaded only for such an address.
function takeBikeLink(): void {
  if (!/\?bike=/.test(location.hash)) return;
  const id = toolLinkBike(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}${location.hash.replace(/\?.*$/, '')}`);
  if (id && bikeSource.value.bikes.some((b) => b.id === id)) import('./tools/bike-choice.ts').then((m) => m.noteBikeChoice(id), () => undefined);
}
export const aheadShell = browserAhead();

// A file dropped on the window never opens or downloads; on Trip and You it goes to the screen's own file input (spec 3.8).
// Between 600 and 839 px the bottom bar never covers the focused element. Both live as long as the page, so no effect owns them.
if (typeof window !== 'undefined') {
  installDrop(window, document, () => screenSignal.value);
  installFocusClear(window, document);
  takeBikeLink();
  window.addEventListener('hashchange', takeBikeLink);
}

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

/** The moved card, loaded only for a rider it is due to: a chunk of its own, so the first screen stays within its budget. */
function MovedCardSlot() {
  const [Card, setCard] = useState<FunctionComponent | null>(null);
  useEffect(() => {
    if (!movedCardDue()) return;
    import('./moved-card.tsx').then((m) => setCard(() => m.MovedCard), () => undefined);
  }, []);
  return Card ? <Card /> : null;
}

/** Ahead reads the store only while it is shown; another window's change re-reads it. */
function AheadHost() {
  useEffect(() => aheadShell.start(), []);
  return <AheadScreen view={aheadShell.view.value} actions={aheadShell.actions} />;
}

// #/you/legal (an address some riders may have kept) is You, scrolled to its legal links: no screen name ever shows only a heading.
function Screen({ name }: { name: ScreenName }) {
  const tab = tabOf(name);
  return (
    <main class="screen" id="main" data-screen={name}>
      <h1>{TITLES[tab]}</h1>
      {kindsOnScreen(degradedSignal.value, tab).map((kind) => <Degraded key={kind} kind={kind} />)}
      <MovedCardSlot />
      {name === 'ahead' ? <AheadHost /> : null}
      {name === 'trip' ? <TripScreen services={tripServices} /> : null}
      {name === 'tools' ? <ToolsScreen services={tyreServices} /> : null}
      {tab === 'you' ? <YouHost /> : null}
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

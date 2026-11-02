// The app's shell: the update bar, the current screen and the four tabs (spec section 3.1).
// The screens are placeholders until their groups arrive; the shell already opens on Trip when no trip runs.
import { W } from '../core/wording/en.ts';
import { Degraded } from './card.tsx';
import { degradedSignal } from './degraded.ts';
import { screenSignal, tabOf } from './nav.ts';
import type { ScreenName, TabName } from './nav.ts';
import type { Updater } from './update.ts';

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

function Screen({ name }: { name: ScreenName }) {
  const tab = tabOf(name);
  return (
    <main class="screen" id="main" data-screen={name}>
      <h1>{TITLES[tab]}</h1>
      {degradedSignal.value.map((kind) => <Degraded key={kind} kind={kind} />)}
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

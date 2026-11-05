// The You tab (spec section 3.5): the rider, the water they can carry, water learning, their bikes, settings, their data and the
// legal pages. It renders what the store gives and works out no answer of its own. Loaded when You is first opened (it is its own
// chunk), so the first screen does not carry it.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { Y } from '../../core/wording/en-you.ts';
import { W } from '../../core/wording/en.ts';
import { keepFreshOffered } from '../../data/refresh.ts';
import { onChanged } from '../../store/changed.ts';
import { Card } from '../card.tsx';
import { useFollowing } from '../follow.ts';
import { LegalLinks } from '../legal/links.tsx';
import { screenSignal } from '../nav.ts';
import { applyTheme, themeChoice } from '../theme-apply.ts';
import type { ThemeChoice } from '../theme-apply.ts';
import { noteThemeChoice, themeNow } from '../theme-choice.ts';
import { Choice } from '../trip/settings.tsx';
import { AT_BIKES, BikesCards } from './bikes.tsx';
import { DataCard } from './data.tsx';
import { LearnCard } from './learn.tsx';
import { RiderCards } from './rider.tsx';
import type { YouServices, YouSnapshot } from './services.ts';
import './you.css';

function SettingsCard({ services, snap, reload }: { services: YouServices; snap: YouSnapshot; reload: () => Promise<void> }) {
  const { settings } = snap;
  const [fresh, setFresh] = useFollowing(settings.keepFresh);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (field: 'theme' | 'keepFresh', value: unknown): Promise<boolean> => {
    const result = await services.writeSettings({ [field]: value });
    setProblem(result.ok ? null : (result.reasons[field] ?? result.note ?? W.appStoreNotKept));
    // One theme for both apps: the bag planner reads this choice and shows it too (owner's try-out, 5 Nov 2026)
    if (result.ok && field === 'theme') { noteThemeChoice(value as ThemeChoice); applyTheme(themeNow()); }
    await reload();
    return result.ok;
  };
  return (
    <Card title={Y.youSettingsTitle}>
      <div data-you-settings>
        <Choice
          name="theme" legend={Y.youThemeLegend} value={themeChoice.value} onPick={(v) => save('theme', v)}
          options={[['auto', Y.youThemeAuto], ['light', Y.youThemeLight], ['dark', Y.youThemeDark]]}
        />
        {keepFreshOffered(services.weatherMode) ? (
          <div class="field">
            <label class="choice-option">
              <input type="checkbox" name="keep-fresh" checked={fresh} onChange={async (e) => { const on = e.currentTarget.checked; setFresh(on); if (!(await save('keepFresh', on))) setFresh(settings.keepFresh); }} />
              <span>{W.weatherKeepFresh}</span>
            </label>
            <p class="muted">{W.appTripKeepFreshWhy}</p>
          </div>
        ) : null}
        {problem ? <p class="field-problem" role="alert">{problem}</p> : null}
      </div>
    </Card>
  );
}

export function YouScreen({ services }: { services: YouServices }) {
  const [snap, setSnap] = useState<YouSnapshot | null>(null);
  const reload = useCallback(async (): Promise<void> => { setSnap(await services.load()); }, [services]);
  useEffect(() => {
    void reload();
    // Another window's change to the profile, settings or rides is read again.
    return onChanged(() => void reload());
  }, [reload]);
  // #/you/legal opens You at its legal links.
  const atLegal = screenSignal.value === 'you/legal';
  const loaded = snap !== null;
  useEffect(() => {
    if (atLegal && loaded) document.querySelector('[data-legal-links]')?.closest('section')?.scrollIntoView?.({ block: 'start' });
  }, [atLegal, loaded]);
  // Back from the bag planner's Bike details, opened from the bikes: You opens at the bikes, once.
  useEffect(() => {
    const state = (typeof history === 'undefined' ? null : history.state) as { wfAt?: unknown } | null;
    if (!loaded || state?.wfAt !== AT_BIKES) return;
    document.querySelector('[data-bikes]')?.closest('section')?.scrollIntoView?.({ block: 'start' });
    try { history.replaceState({ ...state, wfAt: null }, ''); } catch { /* the mark stays: the next return lands there too */ }
  }, [loaded]);

  if (snap === null) return <p class="muted" aria-busy="true">{Y.youLoading}</p>;
  return (
    <div data-you-loaded>
      {snap.available ? null : <p class="notice" role="status">{Y.youUnavailable}</p>}
      <RiderCards services={services} snap={snap} reload={reload} />
      <LearnCard services={services} snap={snap} reload={reload} />
      <BikesCards key={themeChoice.value} />
      <SettingsCard services={services} snap={snap} reload={reload} />
      <DataCard services={services} reload={reload} />
      <LegalLinks />
    </div>
  );
}

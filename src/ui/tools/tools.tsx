// The Tools tab (spec section 3.4): the bag planner, with the rider's bike and its bags (section 3.7), and the tyre calculator, each
// with its last result; then the Gear advisor (sub-project 13), which runs inside the bag planner page. It reads Load Check's summary and bikes and the tyre tool's own storage, and writes nothing.
import { useEffect, useState } from 'preact/hooks';
import { CL } from '../../core/wording/en-care-link.ts';
import { GA } from '../../core/wording/en-advisor.ts';
import { W } from '../../core/wording/en.ts';
import { savedBikeIds, toolBike } from '../../tools/tyre/choice.ts';
import { TL } from '../../core/wording/en-tools.ts';
import { readStore } from '../../tools/tyre/storage.ts';
import type { LastResult } from '../../tools/tyre/storage.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { bikeSource, refreshBikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { BagCard, DRAWN_KEY } from './bag-card.tsx';
import { BikeLine } from './bike-line.tsx';
import { choiceVersion } from './bike-choice.ts';

// The advisor in the bag planner; closing it comes back here (GA-BACK).
const ADVISOR_HREF = '/tools/bags/#gear-advisor&back=tools';
const trimBar = (n: number): string => String(Number(n.toFixed(2)));

export function ToolsScreen({ services }: { services: TyreServices }) {
  // The bag planner's bikes and plan may change in another tab, or while the phone was elsewhere: read them again when told and when the
  // page shows again (as the tyre tool does), so a removed bike is never offered and the cards follow the plan.
  const [tick, redraw] = useState(0);
  const source = bikeSource.value;
  // Reading the version here draws the bag card again when the bike line (or another window) changes the choice.
  void choiceVersion.value;
  useEffect(() => {
    const again = (): void => { refreshBikeSource(); redraw((n) => n + 1); };
    const onStorage = (e: Event): void => { const k = (e as StorageEvent).key; if (k === null || k.startsWith('loadcheck:')) again(); };
    // A page that was not restored from the cache has read everything fresh already (BK-RETURN).
    const onShow = (e: Event): void => { if ((e as PageTransitionEvent).persisted) again(); };
    const onVisible = (): void => { if (document.visibilityState !== 'hidden') again(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pageshow', onShow); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  const host = services.host();
  const read = readStore(services.storage);
  const entries = read.ok ? Object.entries(read.store.entries).flatMap(([key, e]) => (e.last ? [{ key, last: e.last }] : [])) : [];
  // The plan's bike first (the tool opens on it); otherwise the newest. The bike's name is on the card, so it never passes for another's.
  const pick = (host.planBikeId ? entries.find((e) => e.key === host.planBikeId) : undefined) ?? entries.sort((a, b) => b.last.at.localeCompare(a.last.at))[0];
  const last: LastResult | null = pick?.last ?? null;
  // The bag card draws the chosen bike at once: a saved bike the rider picked, the plan moving to it at the bag planner's next open
  // (owner, 7 Nov 2026). "Without a bike" moves the plan to the standard bike there (TB-PAGE-NO-BIKE): the card draws it grey, and says
  // so. A plan-only bike changes nothing there (TB-PAGE-FOLLOWS), so the card keeps the plan's bike.
  const saved = savedBikeIds(services.storage);
  const choice = toolBike(services.storage, host, saved);
  const planOnly = source.bike !== null && !saved.includes(source.bike.id);
  const chosen = choice.picked && !planOnly ? (choice.id === null ? null : source.bikes.find((b) => b.id === choice.id)) : undefined;
  // Kept for this tab, so the first screen draws it too when the rider comes back (re-check of PR 65, R3).
  useEffect(() => {
    try {
      if (chosen === undefined) sessionStorage.removeItem(DRAWN_KEY);
      else sessionStorage.setItem(DRAWN_KEY, JSON.stringify([chosen?.id ?? null, source.bike?.id ?? null]));
    } catch { /* the plan's bike is drawn first then, as before */ }
  });
  return (
    <>
      <BikeLine services={services} tick={tick} />
      <BagCard services={services} chosen={chosen} note={chosen === null ? TL.toolsNoBike : undefined} />
      <Card title={W.tyreCardTitle}>
        <p class="tool-line">{last ? W.tyreCardLast(trimBar(last.frontBar), trimBar(last.rearBar)) : W.tyreCardNone}</p>
        {last?.bike ? <p class="muted">{W.tyreCardBike(last.bike)}</p> : null}
        <a class="btn btn-primary" href="#/tools/tyre">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreCardTitle}</span></a>
      </Card>
      <Card title={CL.careCardTitle}>
        <p class="muted">{CL.careCardBody}</p>
        <a class="btn btn-primary" href="#/tools/care">{CL.careCardOpen}<span class="visually-hidden"> {CL.careCardTitle}</span></a>
      </Card>
      <Card title={GA.advisorCardTitle}>
        <p class="tool-line">{GA.advisorCardLine}</p>
        <a class="btn btn-primary" href={ADVISOR_HREF}>{W.tyreCardOpen}<span class="visually-hidden"> {GA.advisorCardTitle}</span></a>
      </Card>
    </>
  );
}

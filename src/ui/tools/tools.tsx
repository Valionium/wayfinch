// The Tools tab (spec section 3.4): the bag planner, with the rider's bike and its bags (section 3.7), and the tyre calculator, each
// with its last result; then the Gear advisor (sub-project 13), which runs inside the bag planner page. It reads Load Check's summary and bikes and the tyre tool's own storage, and writes nothing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { CL } from '../../core/wording/en-care-link.ts';
import { GA } from '../../core/wording/en-advisor.ts';
import { HN } from '../../core/wording/en-hint.ts';
import { W } from '../../core/wording/en.ts';
import { TK } from '../../core/wording/en-tyre-card.ts';
import { savedBikeIds, toolBike } from '../../tools/tyre/choice.ts';
import { TL } from '../../core/wording/en-tools.ts';
import { LL } from '../../core/wording/en-learn-link.ts';
import { FL } from '../../core/wording/en-finder-link.ts';
import { readStore } from '../../tools/tyre/storage.ts';
import type { LastResult } from '../../tools/tyre/storage.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { noteSeen } from '../bike/hint-seen.ts';
import { bikeDetailsHref } from '../bike/link.ts';
import { bikeSource, refreshBikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { BagCard, DRAWN_KEY } from './bag-card.tsx';
import { BikeLine } from './bike-line.tsx';
import { choiceVersion } from './bike-choice.ts';
import { lazy } from '../lazy.tsx';

// How a bike is built (design of 14 Nov 2026): Tools' own page at #/tools?learn, a chunk of its own loaded from here. An address under
// Tools rather than a screen of the shell's, so the first screen carries nothing of it (its budget never rises).
const LearnScreen = lazy(() => import('../../tools/learn/ui.tsx').then((m) => m.LearnScreen));
export const LEARN_HREF = '#/tools?learn';
// The Bike finder (design of 14 Nov 2026): Tools' own page at #/tools?finder, a chunk of its own loaded from here, as How a bike is built.
const FinderScreen = lazy(() => import('../../tools/finder/ui.tsx').then((m) => m.FinderScreen));
export const FINDER_HREF = '#/tools?finder';

type Page = { page: 'cards' | 'learn' | 'finder'; kind?: string | undefined };
/** The page the address names; #/tools?learn=<type> (the Bike finder's links) opens How a bike is built on that type. */
function pageShown(): Page {
  const m = typeof location === 'undefined' ? null : /^#\/tools\?(learn|finder)(?:=([a-z]+))?$/.exec(location.hash);
  return m ? { page: m[1] as Page['page'], kind: m[2] } : { page: 'cards' };
}

/** Tools: its cards, or How a bike is built or the Bike finder while the address says so. */
export function ToolsScreen({ services }: { services: TyreServices }) {
  const [shown, setShown] = useState(pageShown);
  useEffect(() => {
    // The window as the effect saw it: a cleanup that comes late (a test's page already gone) still finds it.
    const w = window;
    const on = (): void => setShown(pageShown());
    w.addEventListener('hashchange', on);
    return () => w.removeEventListener('hashchange', on);
  }, []);
  // Back from a page to the cards: the focus goes to that card's Open link rather than the page's start (review of PR 127, M3), and
  // Tools shows from its top, not scrolled down to that card (follow-up of 14 Nov). Back from How a bike is built to the finder, the
  // finder puts the focus on the link the rider followed.
  const page = shown.page;
  const was = useRef(page);
  useEffect(() => {
    if (was.current !== 'cards' && page === 'cards') {
      document.querySelector<HTMLAnchorElement>(`a[href="${was.current === 'learn' ? LEARN_HREF : FINDER_HREF}"]`)?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    was.current = page;
  }, [page]);
  if (page === 'learn') return <LearnScreen key={shown.kind} services={services} kind={shown.kind} />;
  // Straight from How a bike is built to the finder is the phone's back (the page has no link there): the finder then focuses the link followed.
  return page === 'finder' ? <FinderScreen back={was.current === 'learn'} /> : <ToolsCards services={services} />;
}

// The advisor in the bag planner; closing it comes back here (GA-BACK).
const ADVISOR_HREF = '/tools/bags/#gear-advisor&back=tools';
const trimBar = (n: number): string => String(Number(n.toFixed(2)));

function ToolsCards({ services }: { services: TyreServices }) {
  // The bag planner's bikes and plan may change in another tab, or while the phone was elsewhere: read them again when told and when the
  // page shows again (as the tyre tool does), so a removed bike is never offered and the cards follow the plan.
  const [tick, redraw] = useState(0);
  const source = bikeSource.value;
  // Reading the version here draws the bag card again when the bike line (or another window) changes the choice.
  void choiceVersion.value;
  // A place seen, for the first-run bike hint (wish 17).
  useEffect(() => noteSeen('t'), []);
  useEffect(() => {
    const again = (): void => { refreshBikeSource(); redraw((n) => n + 1); };
    const onStorage = (e: Event): void => { const k = (e as StorageEvent).key; if (k === null || k.startsWith('loadcheck:')) again(); };
    // A page that was not restored from the cache has read everything fresh already (BK-RETURN).
    const onShow = (e: Event): void => { if ((e as PageTransitionEvent).persisted) again(); };
    const onVisible = (): void => { if (document.visibilityState !== 'hidden') again(); };
    const [w, d] = [window, document];
    w.addEventListener('storage', onStorage);
    w.addEventListener('pageshow', onShow);
    d.addEventListener('visibilitychange', onVisible);
    return () => { w.removeEventListener('storage', onStorage); w.removeEventListener('pageshow', onShow); d.removeEventListener('visibilitychange', onVisible); };
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
      {/* With no bike at all, the typical bike's line in its place (wish 17); a plan-only bike keeps no line, as before. */}
      <BikeLine services={services} tick={tick} none={source.bike ? null : (
        <p class="bike-line" data-hint-line><span>{W.tyreBikeLabel}: {HN.hintToolsTypical} · <a href={bikeDetailsHref('new', 'tools')}>{HN.hintToolsAdd}</a></span></p>
      )} />
      <BagCard services={services} chosen={chosen} note={chosen === null ? TL.toolsNoBike : undefined} />
      <Card title={TK.tyreCardTitle}>
        <p class="tool-line">{last ? TK.tyreCardLast(trimBar(last.frontBar), trimBar(last.rearBar)) : W.tyreCardNone}</p>
        {last?.bike ? <p class="muted">{TK.tyreCardBike(last.bike)}</p> : null}
        <a class="btn btn-primary" href="#/tools/tyre">{W.tyreCardOpen}<span class="visually-hidden"> {TK.tyreCardTitle}</span></a>
      </Card>
      <Card title={CL.careCardTitle}>
        <p class="muted">{CL.careCardBody}</p>
        <a class="btn btn-primary" href="#/tools/care">{CL.careCardOpen}<span class="visually-hidden"> {CL.careCardTitle}</span></a>
      </Card>
      <Card title={GA.advisorCardTitle}>
        <p class="tool-line">{GA.advisorCardLine}</p>
        <a class="btn btn-primary" href={ADVISOR_HREF} onClick={() => noteSeen('g')}>{W.tyreCardOpen}<span class="visually-hidden"> {GA.advisorCardTitle}</span></a>
      </Card>
      <Card title={FL.finderCardTitle}>
        <p class="muted">{FL.finderCardBody}</p>
        <a class="btn btn-primary" href={FINDER_HREF}>{W.tyreCardOpen}<span class="visually-hidden"> {FL.finderCardTitle}</span></a>
      </Card>
      <Card title={LL.learnCardTitle}>
        <p class="muted">{LL.learnCardBody}</p>
        <a class="btn btn-primary" href={LEARN_HREF}>{W.tyreCardOpen}<span class="visually-hidden"> {LL.learnCardTitle}</span></a>
      </Card>
    </>
  );
}

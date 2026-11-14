// Bike care (sub-project 12; design 3.1): a fixed, offline reference of what to do to the bike, how often and when, fitted to the chosen
// bike. Its own chunk at #/tools/care. It reads the bag planner's bikes and the one chosen bike (sub-project 11) and writes nothing; only
// the bike line, when the rider switches bikes, writes Wayfinch's own choice record.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { normaliseBike } from '../../core/bike/normalise.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import type { BikeType } from '../../core/bike/spec.ts';
import { careDetails, careFluid, fitOf, fitted, softTag } from '../../core/care/fit.ts';
import { pictureDetails } from '../../core/care/pictures.ts';
import { byType, riderType } from '../../core/care/type-order.ts';
import { searchCare } from '../../core/care/search.ts';
import type { CareDetails, CareKey, CareTask, Conditions, Fitted, Part, RoadCard } from '../../core/care/types.ts';
import { C, CARE_TASKS, CARRY, fitWords, PART_LABEL, PARTS, ROAD_CARDS, SECTION_LABEL, SECTIONS, TAG_LABEL, taskName, tellUsLine } from '../../core/wording/en-care.ts';
import { bikeDetailsHref } from '../../ui/bike/link.ts';
import { choiceVersion } from '../../ui/tools/bike-choice.ts';
import { BikeLine } from '../../ui/tools/bike-line.tsx';
import { HN } from '../../core/wording/en-hint.ts';
import { WB } from '../../core/wording/en-bike.ts';
import { FitLine } from '../../ui/bike/fit-line.tsx';
import { noteSeen } from '../../ui/bike/hint-seen.ts';
import { savedBikeIds, toolBike } from '../tyre/choice.ts';
import type { ReadOnlyStore } from '../tyre/host.ts';
import type { TyreServices } from '../tyre/services.ts';
import { loadBikeView, StepView } from './steps.tsx';
import type { StepSource } from './steps.tsx';
import './care.css';

type Tab = 'care' | 'road';
const TABS: { id: Tab; label: string }[] = [{ id: 'care', label: C.careTabCare }, { id: 'road', label: C.careTabRoad }];

/** The chosen bike's full record (sub-project 11's choice, else the bike in use), or null for No bike or no saved bike. */
function chosenBike(services: TyreServices): BikeRecord | null {
  const kv: ReadOnlyStore = services.storage;
  const saved = savedBikeIds(kv);
  const { id } = toolBike(kv, services.host(), saved);
  if (!id) return null;
  try {
    const list: unknown = JSON.parse(kv.getItem('loadcheck:bikeProfiles') ?? '[]');
    return Array.isArray(list) ? list.map(normaliseBike).find((b) => b?.id === id) ?? null : null;
  } catch {
    return null;
  }
}

const searchText = (t: CareTask): string[] => [t.name, PART_LABEL[t.part], ...t.words];

const cardText = (c: RoadCard): string[] => [c.problem, PART_LABEL[c.part], ...c.words];

/** The tags of a Not sure detail (and a task's soft tag): "if you have disc brakes". Tasks, cards and carry items alike. */
function Tags({ item, details }: { item: { tags: CareKey[]; applies: Conditions; soft?: CareTask['soft'] }; details: CareDetails }) {
  const soft = softTag(item, details);
  // a soft tag that says a detail's own tag stands in for it (sweep of 14 November 2026, item 45): the condition said once
  const own = soft ? item.tags.filter((k) => !item.soft?.replaces?.includes(k)) : item.tags;
  const all = [...own.map((k: CareKey) => TAG_LABEL(k, item.applies[k] as never)), ...(soft ? [soft] : [])];
  return all.length === 0 ? null : <span class="muted care-tags">{all.join(' · ')}</span>;
}

/**
 * A card or task in the list is one button: a tap opens its full-screen step view at once (the owner's wish of 7 November, care pictures
 * design 2.1; review of PR 72, I4). Its words live in the step view, whose All steps shows them on one page for screen readers.
 */
type OnSteps = (source: StepSource, opener: HTMLButtonElement) => void;
/** Not usual on the rider's type of bike (the owner's answer 5 (a)): after the others, slightly greyed, still tappable; said in words too. */
type Other = BikeType | null;
const TYPE_WORDS: Record<BikeType, string> = {
  road: WB.bikeTypeRoad, gravel: WB.bikeTypeGravel, touring: WB.bikeTypeTouring, trekking: WB.bikeTypeTrekking, mtb: WB.bikeTypeMtb, fat: WB.bikeTypeFat,
};

function Unusual({ type }: { type: Other }) {
  return type ? <span class="visually-hidden"> ({C.careLessUsual(TYPE_WORDS[type])})</span> : null;
}

/**
 * What the list fits (the owner's wish of 14 November 2026): a line at the top names the bike's told details, and one button lifts the
 * fit (Show all: every card and task, as with no bike) and brings it back (Fit to my bike). The text is a polite live region, so the change
 * is read out; the button stays the same element, so the focus stays on it. Show all is kept for this visit only (see the pull request).
 */
function CareFit({ words, all, onToggle }: { words: string[]; all: boolean; onToggle: () => void }) {
  return (
    <div class="care-fit">
      <p class="care-fit-text" aria-live="polite">{all ? C.careFitAll : C.careFitShowing(words.join(', '))}</p>
      <button type="button" class="btn care-fit-toggle" onClick={onToggle}>{all ? C.careFitMine : C.careFitShowAll}</button>
    </div>
  );
}

function RoadItem({ card, details, onSteps, other = null }: { card: Fitted<RoadCard>; details: CareDetails; onSteps: OnSteps; other?: Other }) {
  return (
    <div class={`care-road${other ? ' care-other-type' : ''}`} data-id={card.id}>
      <button type="button" class="care-open" aria-haspopup="dialog" onClick={(e) => onSteps({ kind: 'road', item: card }, e.currentTarget)}>
        <span class="care-name">{card.problem}</span> <Tags item={card} details={details} /><Unusual type={other} />
      </button>
    </div>
  );
}

/** `name`: the task's name as its step view names it (review of PR 160, m-2: under Show all, for the bike when the task fits it). */
function TaskItem({ task, name, details, onSteps, other = null }: { task: Fitted<CareTask>; name: string; details: CareDetails; onSteps: OnSteps; other?: Other }) {
  return (
    <div class={`care-task${other ? ' care-other-type' : ''}`} data-id={task.id}>
      <button type="button" class="care-open" aria-haspopup="dialog" onClick={(e) => onSteps({ kind: 'task', item: task }, e.currentTarget)}>
        <span class="care-name">{name}</span> <Tags item={task} details={details} /><Unusual type={other} />
      </button>
    </div>
  );
}

/** The mark Trip's Before you leave sets for What to carry (ui/trip/prep.tsx); taken once. A `wf:*` key of this tab only. */
const CARRY_MARK = 'wf:careCarry';
function takeCarryMark(): boolean {
  try {
    const asked = sessionStorage.getItem(CARRY_MARK) === '1';
    sessionStorage.removeItem(CARRY_MARK);
    return asked;
  } catch {
    return false;
  }
}

export function CareScreen({ services }: { services: TyreServices }) {
  // The bag planner may change its bikes in another tab (a bike deleted: the chosen one falls back, sub-project 11) or while the phone was
  // elsewhere: read them again when told and when the page shows again, as Tools does.
  const [tick, redraw] = useState(0);
  void choiceVersion.value;
  // A place seen, for the first-run bike hint (wish 17).
  useEffect(() => noteSeen('c'), []);
  // The bike view's chunk, fetched while the screen is idle, so the first tap on a part opens it at once (design 7).
  useEffect(() => {
    const w = window as { requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (t: number) => void };
    const go = (): void => { void loadBikeView(); };
    const t = w.requestIdleCallback ? w.requestIdleCallback(go) : window.setTimeout(go, 1500);
    return () => { if (w.requestIdleCallback) w.cancelIdleCallback?.(t); else window.clearTimeout(t); };
  }, []);
  useEffect(() => {
    const again = (): void => redraw((n) => n + 1);
    const onStorage = (e: Event): void => { const k = (e as StorageEvent).key; if (k === null || k.startsWith('loadcheck:') || k.startsWith('copilot:bikeChoice')) again(); };
    const onShow = (e: Event): void => { if ((e as PageTransitionEvent).persisted) again(); };
    const onVisible = (): void => { if (document.visibilityState !== 'hidden') again(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pageshow', onShow); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Trip's Before you leave asks for What to carry (Trip prep's repair kit): a one-time mark in this tab, read once as the screen opens.
  const [carryAsked] = useState(takeCarryMark);
  const [tab, setTab] = useState<Tab>(carryAsked ? 'road' : 'care');
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<Part | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [steps, setSteps] = useState<StepSource | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const openSteps: OnSteps = (source, from) => { opener.current = from; setSteps(source); };
  // Closed: focus goes back to the button that opened it, in the same commit that removes the steps: a key pressed at once (Escape, then Tab) starts from the task, never from the page body.
  useLayoutEffect(() => { if (steps === null && opener.current) { opener.current.focus(); opener.current = null; } }, [steps]);
  const title = useRef<HTMLHeadingElement>(null);
  const carryTitle = useRef<HTMLHeadingElement>(null);
  // Opening the screen puts the focus on its title (no Back button above it any more); asked for What to carry, on that heading.
  useEffect(() => { (carryAsked ? carryTitle : title).current?.focus(); }, []);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ care: null, road: null });

  const bike = chosenBike(services);
  // Show all (the owner's wish of 14 November 2026): the list as with no bike; not stored, so the next visit fits the bike again
  const [showAll, setShowAll] = useState(false);
  const own = careDetails(bike);
  const told = bike ? fitWords(own, pictureDetails(bike).rimBrake, careFluid(bike)) : [];
  const all = showAll && told.length > 0;
  const details = all ? careDetails(null) : own;
  // under Show all, a card or task that does not fit the bike opens as for no bike (every line, the content's own words); one that fits, as for the bike
  const stepBike = (source: StepSource): BikeRecord | null => (all && !fitOf(source.item.applies, own).show ? null : bike);
  const type = riderType(bike ? resolveBikeSpec(bike, null) : null);
  // "Add your bike" in the bike view: only while no bike is saved (with bikes saved and none chosen, the rider chose that).
  const addHref = savedBikeIds(services.storage).length === 0 ? bikeDetailsHref('new', 'care') : null;
  const tell = bike ? tellUsLine(own) : null;
  const fit = fitted(CARE_TASKS, details);
  const shown = searchCare(query, part ? fit.filter((t) => t.part === part) : fit, searchText);
  // The Care search also finds Roadside cards (decision 2): only while something is typed, as the bike and the part filter allow.
  const allCards = fitted(ROAD_CARDS, details);
  const cardHits = query.trim() === '' ? [] : searchCare(query, part ? allCards.filter((c) => c.part === part) : allCards, cardText);
  const carryList = fitted(CARRY, details);

  // A tap on a card in the Care results: the Roadside tab, and that card's step view; closed, focus is on the card there.
  useEffect(() => {
    if (tab !== 'road' || openCard === null) return;
    const button = document.querySelector<HTMLButtonElement>(`.care-road[data-id="${openCard}"] .care-open`);
    const card = allCards.find((c) => c.id === openCard);
    if (button && card) {
      button.scrollIntoView?.({ block: 'nearest' });
      openSteps({ kind: 'road', item: card }, button);
    }
    setOpenCard(null);
  }, [tab, openCard]);

  const choose = (next: Tab): void => { setTab(next); tabRefs.current[next]?.focus(); };
  const onTabKey = (e: KeyboardEvent, at: number): void => {
    const last = TABS.length - 1;
    const to = e.key === 'ArrowRight' ? (at === last ? 0 : at + 1) : e.key === 'ArrowLeft' ? (at === 0 ? last : at - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(TABS[to]!.id);
  };
  const clearBoth = (): void => { setQuery(''); setPart(null); searchBox.current?.focus(); };

  return (
    <div class="care" data-tick={tick}>
      {/* No Back button here (owner, 9 Nov 2026): the bottom bar's Tools goes back. The title takes the focus as the screen opens. */}
      <h2 class="care-title" tabIndex={-1} ref={title}>{C.careTitle}</h2>
      <p class="muted">{C.careIntro}</p>
      {/* With no saved bike, the "fits better" line in the bike line's place (wish 17). */}
      <BikeLine services={services} tick={tick} none={<FitLine before={HN.hintFitCare} after={HN.hintFitCareAfter} back="care" />} />
      {told.length > 0 ? <CareFit words={told} all={all} onToggle={() => setShowAll(!all)} /> : null}
      <div class="care-tabs" role="tablist" aria-label={C.careTabsLabel}>
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`care-tab-${t.id}`} class="care-tab" aria-selected={tab === t.id} aria-controls={`care-panel-${t.id}`}
            ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e as unknown as KeyboardEvent, i)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="care-panel-care" aria-labelledby="care-tab-care" hidden={tab !== 'care'}>
        <label class="care-search-label" for="care-search">{C.careSearchLabel}</label>
        <input ref={searchBox} id="care-search" class="care-search" type="search" autocomplete="off" placeholder={C.careSearchHint} value={query}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
        <div class="care-filters" role="group" aria-label={C.careFiltersLabel}>
          {PARTS.map((p) => (
            <button key={p} type="button" class="btn care-filter" aria-pressed={part === p} onClick={() => setPart(part === p ? null : p)}>{PART_LABEL[p]}</button>
          ))}
        </div>
        {tell && bike ? <p class="muted care-tell"><a href={bikeDetailsHref(bike.id, 'care', tell.look ? 'look' : undefined)}>{tell.text}</a></p> : null}
        <p class="visually-hidden" role="status">{cardHits.length > 0 ? C.careFoundBoth(shown.length, cardHits.length) : C.careFound(shown.length)}</p>
        {shown.length === 0 && cardHits.length === 0 ? (
          <p class="care-none">{C.careNothing} <button type="button" class="btn" onClick={clearBoth}>{C.careClear}</button></p>
        ) : null}
        {SECTIONS.map((s) => {
          const inSection = shown.filter((t) => t.section === s);
          return inSection.length === 0 ? null : (
            <section key={s} class="care-section">
              <h3>{SECTION_LABEL[s]}</h3>
              {byType(inSection, type, details).map(({ item: t, usual }) => (
                <TaskItem key={t.id} task={t} name={taskName(t, fitOf(t.applies, own).show ? own : details)} details={details} onSteps={openSteps} other={usual ? null : type} />
              ))}
            </section>
          );
        })}
        {cardHits.length > 0 ? (
          <section class="care-section care-road-results">
            <h3>{C.careTabRoad}</h3>
            <ul class="care-hits">
              {cardHits.map((c) => (
                <li key={c.id}>
                  <button type="button" class="btn care-road-hit" onClick={() => { setOpenCard(c.id); setTab('road'); }}>{c.problem}</button> <Tags item={c} details={details} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <div role="tabpanel" id="care-panel-road" aria-labelledby="care-tab-road" hidden={tab !== 'road'}>
        {tab === 'road' ? (
          <>
            <h3 class="visually-hidden">{C.careRoadHeading}</h3>
            {byType(allCards, type, details).map(({ item: c, usual }) => (
              <RoadItem key={c.id} card={c} details={details} onSteps={openSteps} other={usual ? null : type} />
            ))}
            <section class="care-section">
              <h3 tabIndex={-1} ref={carryTitle}>{C.careCarryTitle}</h3>
              <ul class="care-carry">
                {carryList.map((c) => (
                  <li key={c.id} data-id={c.id}>{c.name} <Tags item={c} details={details} /></li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
      {steps ? <StepView key={steps.item.id} source={steps} bike={stepBike(steps)} addHref={addHref} onClose={() => setSteps(null)} /> : null}
    </div>
  );
}

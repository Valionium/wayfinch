// Bike care (sub-project 12; design 3.1): a fixed, offline reference of what to do to the bike, how often and when, fitted to the chosen
// bike. Its own chunk at #/tools/care. It reads the bag planner's bikes and the one chosen bike (sub-project 11) and writes nothing; only
// the bike line, when the rider switches bikes, writes Wayfinch's own choice record.
import { useEffect, useRef, useState } from 'preact/hooks';
import { normaliseBike } from '../../core/bike/normalise.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { careDetails, fitted } from '../../core/care/fit.ts';
import { searchCare } from '../../core/care/search.ts';
import type { CareKey, CareTask, Fitted, Part } from '../../core/care/types.ts';
import { C, CARE_TASKS, PART_LABEL, PARTS, SECTION_LABEL, SECTIONS, TAG_LABEL, WHO_LABEL } from '../../core/wording/en-care.ts';
import { bikeDetailsHref } from '../../ui/bike/link.ts';
import { choiceVersion } from '../../ui/tools/bike-choice.ts';
import { BikeLine } from '../../ui/tools/bike-line.tsx';
import { savedBikeIds, toolBike } from '../tyre/choice.ts';
import type { ReadOnlyStore } from '../tyre/host.ts';
import type { TyreServices } from '../tyre/services.ts';
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

function Tags({ task }: { task: Fitted<CareTask> }) {
  if (task.tags.length === 0) return null;
  return <span class="muted care-tags">{task.tags.map((k: CareKey) => TAG_LABEL(k, task.applies[k] as never)).join(' · ')}</span>;
}

function TaskItem({ task }: { task: Fitted<CareTask> }) {
  return (
    <details class="care-task" data-id={task.id}>
      <summary><span class="care-name">{task.name}</span> <Tags task={task} /></summary>
      <div class="care-body">
        <p><strong>{C.careSigns}:</strong> {task.signs}</p>
        {task.alsoWet ? <p>{C.careAlsoWet}</p> : null}
        <p class="care-label"><strong>{C.careSteps}</strong></p>
        <ol>{task.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <p><strong>{C.careTools}:</strong> {task.tools}{task.minutes ? ` · ${C.careTime(task.minutes[0], task.minutes[1])}` : ''}</p>
        {task.note ? <p>{task.note}</p> : null}
        <p><strong>{C.careWho}:</strong> {task.why ?? WHO_LABEL[task.who]}</p>
        {task.critical ? <p class="care-unsure"><strong>{C.careUnsure}</strong></p> : null}
      </div>
    </details>
  );
}

export function CareScreen({ services }: { services: TyreServices }) {
  // The bag planner may change its bikes in another tab (a bike deleted: the chosen one falls back, sub-project 11) or while the phone was
  // elsewhere: read them again when told and when the page shows again, as Tools does.
  const [tick, redraw] = useState(0);
  void choiceVersion.value;
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

  const [tab, setTab] = useState<Tab>('care');
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<Part | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ care: null, road: null });

  const bike = chosenBike(services);
  const details = careDetails(bike);
  const unsure = bike !== null && Object.values(details).some((v) => v === null);
  const fit = fitted(CARE_TASKS, details);
  const shown = searchCare(query, part ? fit.filter((t) => t.part === part) : fit, searchText);

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
      <p><a class="btn" href="#/tools">{C.careBack}</a></p>
      <h2 class="care-title">{C.careTitle}</h2>
      <p class="muted">{C.careIntro}</p>
      <BikeLine services={services} tick={tick} />
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
        {unsure && bike ? <p class="muted care-tell"><a href={bikeDetailsHref(bike.id, 'care')}>{C.careTellUs}</a></p> : null}
        <p class="visually-hidden" role="status">{C.careFound(shown.length)}</p>
        {shown.length === 0 ? (
          <p class="care-none">{C.careNothing} <button type="button" class="btn" onClick={clearBoth}>{C.careClear}</button></p>
        ) : SECTIONS.map((s) => {
          const inSection = shown.filter((t) => t.section === s);
          return inSection.length === 0 ? null : (
            <section key={s} class="care-section">
              <h3>{SECTION_LABEL[s]}</h3>
              {inSection.map((t) => <TaskItem key={t.id} task={t} />)}
            </section>
          );
        })}
      </div>
      <div role="tabpanel" id="care-panel-road" aria-labelledby="care-tab-road" hidden={tab !== 'road'}>
        <p class="muted">{C.careRoadLater}</p>
      </div>
    </div>
  );
}

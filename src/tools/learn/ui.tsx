// How a bike is built (design of 14 November 2026): a Tools page to learn the parts of a bike. The rider's chosen bike in its own look
// (else a typical gravel bike), a switch to a typical bike of another kind, the drawing to tap (drawing.tsx), the picked part's words and
// what it connects to, and every part as a button by group: the keyboard and screen-reader way in. Its own chunk, loaded from the Tools
// chunk; it reads the bag planner's bikes and the tools' bike choice, and writes nothing.
import { useEffect, useRef, useState } from 'preact/hooks';
import { bikeArt } from '../../core/bike/art.ts';
import { normaliseBike } from '../../core/bike/normalise.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import { GROUPS, groupOf, KINDS, kindBike, linksOf, ownBike, partsOf, stepOf, tagOf } from '../../core/parts/learn.ts';
import type { LearnBike, LearnId, LearnKind } from '../../core/parts/learn.ts';
import { GROUP_NAMES, KIND_NAMES, LN, LN_DOES, nameOf, tagWords } from '../../core/wording/en-learn.ts';
import { themeChoice } from '../../ui/theme-apply.ts';
import { bikeDetailsHref } from '../../ui/bike/link.ts';
import { choiceVersion } from '../../ui/tools/bike-choice.ts';
import { savedBikeIds, toolBike } from '../tyre/choice.ts';
import type { ReadOnlyStore } from '../tyre/host.ts';
import type { TyreServices } from '../tyre/services.ts';
import { LearnDrawing } from './drawing.tsx';
import './learn.css';

/** The chosen bike's full record (the tools' one choice, else the bike in use), or null for No bike or no saved bike: as Bike care reads it. */
function chosenBike(services: TyreServices): BikeRecord | null {
  const kv: ReadOnlyStore = services.storage;
  const { id } = toolBike(kv, services.host(), savedBikeIds(kv));
  if (!id) return null;
  try {
    const list: unknown = JSON.parse(kv.getItem('loadcheck:bikeProfiles') ?? '[]');
    return Array.isArray(list) ? list.map(normaliseBike).find((b) => b?.id === id) ?? null : null;
  } catch {
    return null;
  }
}

// The look extras (patterns, fork, rims) are their own chunk, as on Trip: loaded only for a bike that has them.
let extras: typeof import('../../core/bike/paint.ts') | undefined;

/**
 * The theme the drawing is drawn for (its casing's tone follows it), as the bike drawing's useTheme reads it: the rider's choice, made in
 * either app, redraws at once. Read here rather than imported, so the first screen exports nothing more for this page.
 */
function themeNow(): 'dark' | 'light' {
  void themeChoice.value;
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** With nothing picked, the drawing names the parts a beginner meets first (design 3). */
const MAIN: readonly LearnId[] = ['frame', 'fork', 'handlebar', 'saddle', 'chainring', 'chain', 'belt', 'cassette', 'hub-gears', 'tyre', 'caliper', 'rim-brake', 'pedal'];

type Shown = 'own' | LearnKind;

export function LearnScreen({ services }: { services: TyreServices }) {
  const [tick, redraw] = useState(0);
  void choiceVersion.value;
  useEffect(() => {
    const again = (): void => redraw((n) => n + 1);
    const onStorage = (e: Event): void => { const k = (e as StorageEvent).key; if (k === null || k.startsWith('loadcheck:') || k.startsWith('copilot:bikeChoice')) again(); };
    const onShow = (e: Event): void => { if ((e as PageTransitionEvent).persisted) again(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pageshow', onShow); };
  }, []);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, []);

  const record = chosenBike(services);
  const [shown, setShown] = useState<Shown>(record ? 'own' : 'gravel');
  const kind: Shown = shown === 'own' && !record ? 'gravel' : shown;
  const bike: LearnBike = kind === 'own' ? ownBike(resolveBikeSpec(record, null), record) : kindBike(kind);
  const look = kind === 'own' ? record?.look?.paint ?? null : null;
  const [, setReady] = useState(0);
  useEffect(() => {
    if (look && !extras) import('../../core/bike/paint.ts').then((m) => { extras = m; setReady(1); }, () => {});
  }, [look]);
  const theme = themeNow();
  const o = { theme, idPrefix: 'bl' };
  const art = look && extras ? extras.paintedArt(bike.spec, null, o, look) : bikeArt(bike.spec, null, o);

  const parts = partsOf(bike);
  const [picked, setPicked] = useState<LearnId | null>(null);
  const now = picked && parts.includes(picked) ? picked : null;
  const [said, setSaid] = useState('');
  const figure = useRef<HTMLDivElement>(null);
  // A pick from "Connects to" replaces the buttons, the pressed one too: the focus goes to the part's name (review of PR 127, I5).
  const nameEl = useRef<HTMLHeadingElement>(null);
  const toName = useRef(false);
  useEffect(() => { if (toName.current) { toName.current = false; nameEl.current?.focus(); } });
  const pick = (id: LearnId, fromList = false): void => {
    setPicked(id);
    setSaid(LN.said(nameOf(id), LN_DOES[id].split(/(?<=\.)\s/)[0]!));
    if (fromList) figure.current?.scrollIntoView?.({ block: 'nearest' });
  };
  // The picked part is named with what it connects to (fewer labels than its whole group: a phone's drawing stays readable).
  const labelled = now ? linksOf(bike, now) : MAIN.filter((p) => parts.includes(p));
  const name = kind === 'own' ? art.label : LN.typical(KIND_NAMES[kind]);
  const addHref = savedBikeIds(services.storage).length === 0 ? bikeDetailsHref('new', 'tools') : null;
  const tag = now ? tagOf(now) : undefined;

  return (
    <div class="bl" data-tick={tick}>
      <h2 class="bl-title" tabIndex={-1} ref={title}>{LN.title}</h2>
      <p class="muted">{LN.intro}</p>
      <label class="bl-kind">
        <span>{LN.kinds}</span>
        <select value={kind} onChange={(e) => setShown((e.currentTarget as HTMLSelectElement).value as Shown)}>
          {record ? <option value="own">{LN.yourBike}{record.name ? `: ${record.name}` : ''}</option> : null}
          {KINDS.map((k) => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}
        </select>
      </label>
      {addHref ? <p class="muted bl-add"><a href={addHref}>{LN.add}</a> {LN.addAfter}</p> : null}
      {kind === 'own' && record && bike.shows ? (
        <p class="muted bl-shows">
          {bike.shows.brakes ? `${LN.showsBrakes(bike.shows.brakes)} ` : ''}{bike.shows.drive ? `${LN.showsDrive} ` : ''}
          <a href={bikeDetailsHref(record.id, 'tools')}>{LN.setThem}</a>
        </p>
      ) : null}
      <div class="bl-main">
        <div class="bl-left" ref={figure}>
          <LearnDrawing key={kind} bike={bike} art={art} picked={now} marked={now ? [now] : []} labelled={labelled} name={name} onPick={(id) => pick(id)} />
          <section class="bl-entry" aria-live="off">
            {now ? (
              <>
                <h3 class="bl-name" tabIndex={-1} ref={nameEl}>{nameOf(now)}</h3>
                {tag ? <p class="muted bl-tag">{LN.onlyOn(tagWords(tag))}</p> : null}
                <p class="bl-does">{LN_DOES[now]}</p>
                <h4 class="bl-connects">{LN.connects}</h4>
                <ul class="bl-links">
                  {linksOf(bike, now).map((l) => (
                    <li key={l}><button type="button" class="btn bl-link" onClick={() => { toName.current = true; pick(l); }}>{nameOf(l)}</button></li>
                  ))}
                </ul>
              </>
            ) : <p class="bl-hint">{LN.tapHint}</p>}
          </section>
        </div>
        <section class="bl-list" aria-labelledby="bl-list-title">
          <h3 id="bl-list-title">{LN.list}</h3>
          {GROUPS.map((g) => {
            const inGroup = parts.filter((p) => groupOf(stepOf(p)) === g);
            return inGroup.length === 0 ? null : (
              <section key={g} class="bl-group" aria-labelledby={`bl-group-${g}`}>
                <h4 id={`bl-group-${g}`}>{GROUP_NAMES[g]}</h4>
                <ul class="bl-parts">
                  {inGroup.map((p) => (
                    <li key={p}><button type="button" class="btn bl-part" data-part={p} aria-pressed={p === now} onClick={() => pick(p, true)}>{nameOf(p)}</button></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </section>
      </div>
      <p class="visually-hidden" aria-live="polite">{said}</p>
    </div>
  );
}

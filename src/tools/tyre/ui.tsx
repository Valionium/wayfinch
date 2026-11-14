// The tyre screen (spec section 7.2): inputs on top of a figure that is recomputed on every change. It renders what `resolve` and
// `tyreEstimate` give and computes no pressure itself. It reads Load Check's records and never writes them.
import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { T, TM } from '../../core/wording/en-tyre.ts';
import { W } from '../../core/wording/en.ts';
import { TF } from '../../core/wording/en-tyre-labels.ts';
import { TN } from '../../core/wording/en-tyre-notes.ts';
import { HN } from '../../core/wording/en-hint.ts';
import { TZ } from '../../core/wording/en-tyre-figures.ts';
import { BackBar } from '../../ui/back-bar/back-bar.tsx';
import { FitLine } from '../../ui/bike/fit-line.tsx';
import { noteSeen } from '../../ui/bike/hint-seen.ts';
import { Card, Notice } from '../../ui/card.tsx';
import { savedDay } from '../../ui/saved-day.ts';
import { choiceMadeIn, choiceVersion, noteBikeChoice } from '../../ui/tools/bike-choice.ts';
import { checkLimit, tyreEstimate } from './core.ts';
import type { Bars, Casing, Limit, RimType, Setup, Surface, Unit, Wheel } from './core.ts';
import { resolve } from './model.ts';
import type { Context, Details, FieldName, Source } from './model.ts';
import { savedBikeIds, toolBike } from './choice.ts';
import type { HostData } from './host.ts';
import { DEFAULT_KEY, entryOf, readStore, saveEntry } from './storage.ts';
import type { LastResult } from './storage.ts';
import { SRAM_URL, sramList } from './sram.ts';
import { WHEELS } from './tables.ts';

// The services live in their own module, so the Tools card can read them without loading this screen (a lazy chunk).
export { browserServices } from './services.ts';
export type { TyreServices } from './services.ts';
import type { TyreServices } from './services.ts';
import { TC } from '../../core/wording/en-tyre-calc.ts';

const ASSUMED_WORDS: Record<FieldName, string> = {
  riderKg: TF.tyreAssumedRider, bikeKg: TF.tyreAssumedBike, bars: TF.tyreAssumedBars, wheelBsdMm: W.tyreAssumedWheel, frontMm: TF.tyreAssumedFront,
  rearMm: TF.tyreAssumedRear, casing: TF.tyreAssumedCasing, setup: W.tyreAssumedSetup, rimType: TN.tyreAssumedRimType, rimInnerMm: TF.tyreAssumedRim,
  surface: W.tyreAssumedSurface, carriedKg: W.tyreAssumedNoLuggage,
};

const parseNumber = (text: string, signed = false): number | null => {
  const t = text.trim().replace(',', '.');
  if (t === '' || !(signed ? /^-?(\d*\.?\d+|\d+\.)$/ : /^(\d*\.?\d+|\d+\.)$/).test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const bar2 = (n: number): string => n.toFixed(2);

// ---- small pieces --------------------------------------------------------------------------------------------------------------

/** The mark on each of the three things a figure needs. */
const NeededTag = () => <> <span class="tyre-needed-tag">{T.tyreNeededTag}</span></>;

function SourceLine({ source, plan }: { source: Source; plan?: string }) {
  if (source === 'bike') return <>{W.tyreFromBike}</>;
  if (source === 'plan') return <>{plan ?? ''}</>;
  if (source === 'you') return <>{W.tyreFromYou}</>;
  return null;
}

/** A field that starts from somewhere else shows its value, where it came from, and Change; once changed it is an ordinary field. */
function Field({ label, source, plan, valueText, editor, onReset, id, resetLabel, needed }: {
  label: string; source: Source; plan?: string; valueText: string; editor: ComponentChildren; onReset?: () => void; id: string; resetLabel: string; needed?: string;
}) {
  const [editing, setEditing] = useState(false);
  const fromElsewhere = source === 'bike' || source === 'plan' || source === 'you';
  return (
    <div class="tyre-field" data-source={source} data-needed={needed}>
      {fromElsewhere && !editing ? (
        <div class="tyre-from">
          <span class="tyre-label" id={`${id}-label`}>{label}{needed ? <NeededTag /> : null}</span>
          <span class="tyre-value">{valueText}</span>
          <span class="muted"><SourceLine source={source} plan={plan} /> · </span>
          <button type="button" class="btn" onClick={() => setEditing(true)} aria-describedby={`${id}-label`}>{W.tyreChange}</button>
        </div>
      ) : (
        <>
          {editor}
          {source === 'entered' && onReset ? <button type="button" class="btn" onClick={() => { onReset(); setEditing(false); }}>{resetLabel}</button> : null}
        </>
      )}
    </div>
  );
}

function NumberInput({ id, label, value, onCommit, unit, assumed, signed = false, needed = false }: { id: string; label: string; value: number | undefined; onCommit: (n: number | undefined) => void; unit?: string; assumed?: number; signed?: boolean; needed?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // The value changed from outside (another bike chosen, or reset): follow it, unless it is what was just typed.
    setText((t) => (parseNumber(t, signed) === (value ?? null) ? t : value === undefined ? '' : String(value)));
    setBad(false);
  }, [value]);
  return (
    <label class="tyre-input" for={id}>
      <span class="tyre-label">{label}{needed ? <NeededTag /> : null}</span>
      <input
        id={id} type="text" inputMode="decimal" autoComplete="off" value={text}
        aria-invalid={bad ? 'true' : undefined}
        aria-describedby={bad ? `${id}-err` : undefined}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value;
          setText(t);
          const n = parseNumber(t, signed);
          setBad(t.trim() !== '' && n === null);
          if (t.trim() === '') onCommit(undefined);
          else if (n !== null) onCommit(n);
        }}
      />
      {unit ? <span class="muted">{unit}</span> : null}
      {value === undefined && text.trim() === '' && assumed !== undefined ? <span class="muted">{TC.tyreAssumedTag(`${assumed}${unit ? ' ' + unit : ''}`)}</span> : null}
      {bad ? <span class="tyre-error" id={`${id}-err`} role="alert">{TF.tyreNotANumber}</span> : null}
    </label>
  );
}

function Choice<V extends string>({ id, label, value, options, onChange, source, needed }: {
  id: string; label: string; value: V | undefined; options: readonly { value: V; label: string }[]; onChange: (v: V) => void; source?: Source; needed?: string;
}) {
  return (
    <fieldset class="tyre-choice" data-needed={needed}>
      <legend class="tyre-label">{label}{needed ? <NeededTag /> : null}{source === 'bike' ? <span class="muted"> · {W.tyreFromBike}</span> : null}</legend>
      <div class="tyre-options">
        {options.map((o) => (
          <label key={o.value} class="tyre-option">
            <input type="radio" name={id} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A pressure limit: the number, its unit, and the "Did you mean 65 psi?" question. Anything not accepted clears the limit, so no figure shows. */
function LimitInput({ id, label, required, value, min, onCommit, onPending, needed }: {
  id: string; label: string; required: boolean; value: Limit | null | undefined; min?: Limit | null; onCommit: (l: Limit | null) => void; onPending: (id: string, label: string | null) => void; needed?: string;
}) {
  const [text, setText] = useState(value ? String(value.value) : '');
  const [unit, setUnit] = useState<Unit>(value?.unit ?? 'bar');
  const [note, setNote] = useState<{ kind: 'reject' | 'ask'; text: string; alt?: Limit } | null>(null);
  // While a question stands or a value is refused, the screen shows no figure for it.
  useEffect(() => {
    onPending(id, note ? label : null);
    // A question opened here may have been scrolled out of sight by a figure appearing; bring it back.
    if (note) document.getElementById(`${id}-note`)?.scrollIntoView?.({ block: 'nearest' });
    return () => onPending(id, null);
  }, [note]);
  const evaluate = (t: string, u: Unit, keepAsBar: boolean, keepAsPsi = false): void => {
    const n = parseNumber(t);
    if (t.trim() === '') { setNote(null); onCommit(null); return; }
    if (n === null) { setNote({ kind: 'reject', text: TC.tyreLimitNotNumber }); onCommit(null); return; }
    const c = checkLimit(n, u, { keepAsBar, keepAsPsi, min });
    if (c.status === 'ok') { setNote(null); onCommit(c.limit); }
    else if (c.status === 'ask') { setNote({ kind: 'ask', text: c.question, alt: c.alt }); onCommit(null); }
    else { setNote({ kind: 'reject', text: c.reason }); onCommit(null); }
  };
  return (
    <div class="tyre-limit" data-needed={needed}>
      <label class="tyre-input" for={id}>
        <span class="tyre-label">{label}{required ? ' *' : ''}{needed ? <NeededTag /> : null}</span>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={text} aria-describedby={note ? `${id}-note` : undefined}
          onInput={(e) => { const t = (e.currentTarget as HTMLInputElement).value; setText(t); evaluate(t, unit, false); }} />
      </label>
      <div class="tyre-options" role="group" aria-label={W.tyreUnitFor(label)}>
        {(['bar', 'psi'] as const).map((u) => (
          <label key={u} class="tyre-option">
            <input type="radio" name={`${id}-unit`} checked={unit === u} onChange={() => { setUnit(u); evaluate(text, u, false); }} />
            <span>{u === 'bar' ? W.tyreUnitBar : W.tyreUnitPsi}</span>
          </label>
        ))}
      </div>
      {note ? (
        <div class="tyre-note" id={`${id}-note`} role="alert">
          <span>{note.text}</span>
          {note.kind === 'ask' && note.alt ? (
            <span class="tyre-ask">
              {note.alt.unit === 'psi' ? (
                <>
                  <button type="button" class="btn btn-primary" onClick={() => { setUnit('psi'); evaluate(text, 'psi', false, true); }}>{W.tyreAskYesPsi(String(note.alt.value))}</button>
                  <button type="button" class="btn" onClick={() => evaluate(text, 'bar', true)}>{W.tyreAskNoBar}</button>
                </>
              ) : (
                <>
                  <button type="button" class="btn btn-primary" onClick={() => { setUnit('bar'); evaluate(text, 'bar', true); }}>{TC.tyreAskYesBar(String(note.alt.value))}</button>
                  <button type="button" class="btn" onClick={() => evaluate(text, 'psi', false, true)}>{TC.tyreAskNoPsi}</button>
                </>
              )}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Both weighed wheel loads, or neither: one alone cannot give a split. */
function MeasuredFields({ value, onCommit }: { value: Details['measured']; onCommit: (m: { frontKg: number; rearKg: number } | undefined) => void }) {
  const [front, setFront] = useState<number | undefined>(value?.frontKg);
  const [rear, setRear] = useState<number | undefined>(value?.rearKg);
  const commit = (f: number | undefined, r: number | undefined): void => {
    setFront(f);
    setRear(r);
    onCommit(f !== undefined && r !== undefined ? { frontKg: f, rearKg: r } : undefined);
  };
  return (
    <>
      <p class="muted">{T.tyreMeasuredHelp}</p>
      <NumberInput id="tyre-mfront" label={W.tyreMeasuredFrontLabel} value={front} onCommit={(n) => commit(n, rear)} unit="kg" />
      <NumberInput id="tyre-mrear" label={W.tyreMeasuredRearLabel} value={rear} onCommit={(n) => commit(front, n)} unit="kg" />
    </>
  );
}

const fmtPct = (share: number): [string, string] => [String(Math.round(share * 100)), String(100 - Math.round(share * 100))];

function WheelFigure({ label, w }: { label: string; w: Wheel }) {
  const hiN = w.heat?.advise ? Math.min(w.windowBar[1], w.heat.pumpToBar) : w.windowBar[1];
  const lo = bar2(Math.min(w.windowBar[0], hiN));
  const hi = bar2(hiN);
  return (
    <div class="tyre-wheel">
      <h3>{label}</h3>
      <p class="tyre-big">{TZ.tyreFrontBackBar(bar2(w.bar))}</p>
      <p class="tyre-psi">{TZ.tyrePsiValue(String(w.psi))}</p>
      {w.heat?.advise ? <p class="tyre-heat"><strong>{TC.tyreHeatPumpLine(bar2(w.heat.pumpToBar), String(w.heat.pumpToPsi))}</strong></p> : null}
      {w.heat?.advise ? null : <p class="muted">{lo === hi ? TM.tyreWindowOne(hi) : TM.tyreWindow(lo, hi)}</p>}
    </div>
  );
}

// ---- the screen ----------------------------------------------------------------------------------------------------------------

export function TyreScreen({ services }: { services: TyreServices }) {
  // The bikes the bag planner has saved, read with the rest: a removed bike is never offered or chosen (see choice.ts).
  const read = (): { host: HostData; saved: string[] } => ({ host: services.host(), saved: savedBikeIds(services.storage) });
  const [snap, setSnap] = useState(read);
  const { host, saved } = snap;
  // The one chosen bike (sub-project 11): what the rider picked here or in Tools, else the bike in use (choice.ts).
  const start = toolBike(services.storage, host, saved);
  // Set when the rider picks a bike or types in the tool: "Without a bike" that only meant "no bike was saved" is not a pick.
  const touched = useRef(start.picked);
  // Set when the rider picks a bike or types here (not by a choice that was already there): a choice made elsewhere then only offers a switch.
  const acted = useRef(false);
  const [offer, setOffer] = useState<string | null>(null);
  const [offerFrom, setOfferFrom] = useState<'copilot' | 'load-check' | null>(null);   // where the offered bike was chosen, for its words
  const [gone, setGone] = useState<'next' | 'none' | null>(null);
  // A place seen, for the first-run bike hint (wish 17).
  useEffect(() => noteSeen('p'), []);
  const load = (k: string): { key: string; details: Details } => {
    const r = readStore(services.storage);
    return { key: k, details: r.ok ? entryOf(r.store, k).details : {} };
  };
  // The tool opens on the bike in use. After that only the rider's own choice changes the bike, with one exception: a bike removed in
  // the bag planner moves the box to the bike now in use (or to none), and a line says so.
  const [session, setSession] = useState(() => load(start.id ?? DEFAULT_KEY));
  const { key, details } = session;
  const [kept, setKept] = useState(true);
  const [pending, setPending] = useState<Record<string, string>>({});
  const onPending = (id: string, label: string | null): void => {
    if (label !== null) { touched.current = true; acted.current = true; }
    setPending((p) => {
      if ((p[id] ?? null) === label) return p;
      const next = { ...p };
      if (label === null) delete next[id]; else next[id] = label;
      return next;
    });
  };
  const blockedBy = Object.values(pending)[0] ?? null;

  // The bag planner may change its bikes while this is open (another tab) or while the phone was elsewhere: read them again when told,
  // and when the page shows again.
  const latest = useRef(key);
  latest.current = key;
  useEffect(() => {
    const reread = (): void => {
      const next = read();
      setSnap((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      const now = latest.current;
      if (now === DEFAULT_KEY && !touched.current && next.saved.length > 0) {
        // Opened with no saved bike and nothing done yet: the first bike saved is the choice.
        setGone(null);
        setSession(load(toolBike(services.storage, next.host, next.saved).id ?? DEFAULT_KEY));
      } else if (now !== DEFAULT_KEY && !next.saved.includes(now)) {
        const use = toolBike(services.storage, next.host, next.saved).id;
        setGone(use ? 'next' : 'none');
        setPending({});
        setSession(load(use ?? DEFAULT_KEY));
      }
    };
    const onStorage = (e: Event): void => { const k = (e as StorageEvent).key; if (k === null || k.startsWith('loadcheck:')) reread(); };
    const onVisible = (): void => { if (document.visibilityState !== 'hidden') reread(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', reread);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('pageshow', reread); document.removeEventListener('visibilitychange', onVisible); };
  }, [services]);

  // A choice made while this is open (a ?bike= address, Tools, the bag planner): it is the rider's pick, so it moves the box.
  useEffect(() => {
    let first = true;
    return effect(() => {
      void choiceVersion.value;
      if (first) { first = false; return; }
      const next = read();
      const chosen = toolBike(services.storage, next.host, next.saved);
      if (!chosen.picked) return;
      const target = chosen.id ?? DEFAULT_KEY;
      if (target === latest.current) { setOffer(null); return; }
      // The rider has picked or typed here: their answers stay, and one line offers the other bike.
      if (acted.current) { setSnap((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next)); setOffer(target); setOfferFrom(choiceMadeIn((k) => services.storage.getItem(k))); return; }
      touched.current = true;
      setSnap((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      setGone(null);
      setPending({});
      setSession(load(chosen.id ?? DEFAULT_KEY));
    });
  }, [services]);

  const bike = host.bikes.find((b) => b.id === key) ?? null;
  // The plan's load belongs to the plan's bike: another bike has its own weights.
  const usePlan = host.summary !== null && (key === host.planBikeId || (host.summary.bikeId === null && key === DEFAULT_KEY));
  const ctx: Context = { riderKg: host.riderKg, summary: usePlan ? host.summary : null, bike };
  const resolved = resolve(details, ctx);
  const fallback = resolve({}, ctx).sources;
  const result = resolved.input ? tyreEstimate(resolved.input) : null;

  const change = (patch: Partial<Details>): void => {
    touched.current = true;
    acted.current = true;
    const next = { ...details, ...patch };
    for (const k of Object.keys(next) as (keyof Details)[]) if (next[k] === undefined) delete next[k];
    setSession({ key, details: next });
    // The last figures are whatever storage holds now, never a copy read earlier.
    const now = readStore(services.storage);
    setKept(saveEntry(services.storage, key, { details: next, last: now.ok ? entryOf(now.store, key).last : null }, services.now()));
  };

  // The last figures, for the Tools tab: kept while a figure is shown, gone when it is not.
  const front = result?.front ?? null;
  const rear = result?.rear ?? null;
  const showFigures = Boolean(front && rear && !result?.incompatible && blockedBy === null && result?.refused.length === 0);
  const pumped = (w: Wheel): number => (w.heat?.advise ? Math.min(w.bar, w.heat.pumpToBar) : w.bar);
  const shown = showFigures && front && rear ? { f: pumped(front), r: pumped(rear) } : null;
  useEffect(() => {
    const read = readStore(services.storage);
    if (!read.ok) return;
    const entry = entryOf(read.store, key);
    if (shown) {
      if (entry.last && entry.last.frontBar === shown.f && entry.last.rearBar === shown.r && entry.last.bike === bike?.name) return;
      const last: LastResult = { frontBar: shown.f, rearBar: shown.r, at: services.now().toISOString(), ...(bike ? { bike: bike.name } : {}) };
      saveEntry(services.storage, key, { details: entry.details, last }, services.now());
    } else if (entry.last) {
      saveEntry(services.storage, key, { details: entry.details, last: null }, services.now());
    }
  }, [shown?.f, shown?.r, key]);

  // When an answer first appears (a figure, or the reason for none), bring it to the top: the field just typed in is below or above it.
  const resultRef = useRef<HTMLElement>(null);
  const had = useRef('');
  const state = !resolved.input ? 'none' : showFigures ? 'figure' : 'no-figure';
  useEffect(() => {
    if (state !== 'none' && had.current !== state && !(had.current === 'figure' && state === 'no-figure')) resultRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    had.current = state;
  }, [state]);

  const src = resolved.sources;
  const v = resolved.values;
  const own = (field: FieldName, value: number): number | undefined => (src[field] === 'assumed' ? undefined : value);
  const planDate = host.summary ? (savedDay(host.summary.at) ?? '') : '';
  const planNote = W.tyreFromPlan(planDate);
  const bikeKey = (name: string) => `tyre-${name}`;
  const changeHeat = (patch: NonNullable<Details['heat']>): void => {
    const heat = { ...details.heat, ...patch };
    for (const k of Object.keys(heat) as (keyof typeof heat)[]) if (heat[k] === undefined) delete heat[k];
    change({ heat: Object.keys(heat).length ? heat : undefined });
  };
  const resetter = (...fields: (keyof Details)[]) => () => change(Object.fromEntries(fields.map((f) => [f, undefined])) as Partial<Details>);

  const resetFor = (field: FieldName): string => {
    const f = fallback[field];
    return f === 'bike' ? W.tyreBackToBike : f === 'plan' ? TF.tyreBackToPlan : f === 'you' ? TF.tyreBackToYou : TC.tyreClear;
  };
  const choiceValue = <T extends string>(field: FieldName, value: T | 'unset'): T | undefined => (src[field] === 'assumed' || value === 'unset' ? undefined : value);
  const notes = result?.warningItems ?? [];
  const nearFigure = notes.filter((n) => n.code === 'rimUnset' || n.code === 'widthUnset');
  const listed = notes.filter((n) => !['rimUnset', 'widthUnset', 'heatPump'].includes(n.code));

  return (
    <div class="tyre">
      <BackBar href="#/tools" />
      <h2 class="tyre-title">{W.tyreTitle}</h2>
      <p class="muted">{T.tyreIntro}</p>

      <label class="tyre-input" for="tyre-bike">
        <span class="tyre-label">{W.tyreBikeLabel}</span>
        <select id="tyre-bike" value={key} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; touched.current = true; acted.current = true; setOffer(null); setGone(null); setPending({}); setSession(load(v)); noteBikeChoice(v === DEFAULT_KEY ? null : v, services.now(), services.storage); }}>
          {host.bikes.filter((b) => saved.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === host.planBikeId ? W.tyreBikeInPlan : ''}</option>)}
          <option value={DEFAULT_KEY}>{saved.length ? T.tyreBikeWithout : W.tyreBikeNone}</option>
        </select>
      </label>
      {/* With no saved bike, the "fits better" line under the bike box (wish 17, sketch 17c). */}
      {saved.length === 0 ? <FitLine before={HN.hintFitTyre} after={HN.hintFitTyreAfter} back="tyre" /> : null}
      {offer && (offer === DEFAULT_KEY || host.bikes.some((b) => b.id === offer)) && offer !== key ? (
        <Notice>{offer === DEFAULT_KEY ? T.tyreBikeWithout : host.bikes.find((b) => b.id === offer)?.name} {offerFrom === 'load-check' ? T.tyreChosenInPlanner : T.tyreChosenElsewhere}{' '}
          <button type="button" class="btn" onClick={() => { touched.current = true; setOffer(null); setGone(null); setPending({}); setSession(load(offer)); }}>{T.tyreChosenSwitch}</button>
        </Notice>
      ) : null}
      {gone ? <Notice>{gone === 'next' ? T.tyreBikeGoneNext : T.tyreBikeGoneNone}</Notice> : null}
      {!kept ? <Notice>{TN.tyreNotSaved}</Notice> : null}
      <p class="muted">{TN.tyreSavedHere}</p>

      {/* The three things a figure needs, first and together, and marked (the owner's device check, 5 November 2026). Every optional
          field follows the result. */}
      <section class="card tyre-needed" aria-labelledby="tyre-needed-title">
        <h2 id="tyre-needed-title">{T.tyreNeededTitle}</h2>
        <p>{T.tyreNeededIntro}</p>
        <p class="muted">{TN.tyreLimitHint}</p>
        <LimitInput key={`max-${key}`} id="tyre-max" label={W.tyreLimitMaxLabel} required needed="max" value={details.tyreMax} min={details.tyreMin} onPending={onPending}
          onCommit={(l) => change({ tyreMax: l ?? undefined })} />
        <p class="muted">{TC.tyreLimitBothWheels}</p>
        {bike?.unreadFront && src.frontMm === 'assumed' ? <p class="muted">{TC.tyreCouldntRead(bike.unreadFront)}</p> : null}
        {bike?.unreadRear && src.rearMm === 'assumed' ? <p class="muted">{TC.tyreCouldntRead(bike.unreadRear)}</p> : null}
        <Field id={bikeKey('front')} label={W.tyreFrontWidthLabel} source={src.frontMm} needed="front" valueText={`${v.front.printedMm} mm`} resetLabel={resetFor('frontMm')} onReset={resetter('frontMm')}
          editor={<NumberInput key={`front-${key}`} id="tyre-front" label={W.tyreFrontWidthLabel} needed value={own('frontMm', v.front.printedMm)} assumed={v.front.printedMm} onCommit={(n) => change({ frontMm: n })} unit="mm" />} />
        <Field id={bikeKey('rear')} label={W.tyreRearWidthLabel} source={src.rearMm} needed="rear" valueText={`${v.rear.printedMm} mm`} resetLabel={resetFor('rearMm')} onReset={resetter('rearMm')}
          editor={<NumberInput key={`rear-${key}`} id="tyre-rear" label={W.tyreRearWidthLabel} needed value={own('rearMm', v.rear.printedMm)} assumed={v.rear.printedMm} onCommit={(n) => change({ rearMm: n })} unit="mm" />} />
        {resolved.rearFollowsFront && (v.rimType === 'hookless' || v.rimType === 'unset') ? <p class="muted">{TF.tyreRearLabelShort}: {TC.tyreSameAsFront}</p> : null}
        <Choice<RimType> id="tyre-rimtype" label={W.tyreRimTypeLabel} source={src.rimType} needed="rim" value={choiceValue('rimType', v.rimType)} onChange={(x) => change({ rimType: x })}
          options={[{ value: 'hooked', label: W.tyreRimHooked }, { value: 'hookless', label: W.tyreRimHookless }, { value: 'tubular', label: W.tyreRimTubular }]} />
      </section>

      <section class="card tyre-result" aria-live="polite" aria-labelledby="tyre-result-title" ref={resultRef}>
        <h2 id="tyre-result-title">{TF.tyreResultTitle}</h2>
        {!resolved.input ? <p>{W.tyreNeedMax}</p> : null}
        {blockedBy !== null ? <p class="notice">{TC.tyrePendingLimit(blockedBy)}</p> : null}
        {blockedBy === null && result?.needsWidth ? <p class="notice">{resolved.sources.rimType === 'assumed' ? TC.tyreNeedTwo : TC.tyreNeedWidthOnly}</p> : null}
        {blockedBy === null && result && result.refused.length ? (
          <>
            <h3>{TF.tyreRefusedTitle}</h3>
            <ul>{result.refused.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}
        {blockedBy === null && result && result.incompatible ? <h3>{result.warningCodes.includes('rimUnset') ? TN.tyreNeedRimTitle : W.tyreIncompatibleTitle}</h3> : null}
        {showFigures && front && rear ? (
          <>
            <div class="tyre-wheels">
              <WheelFigure label={W.tyreFront} w={front} />
              <WheelFigure label={W.tyreRear} w={rear} />
            </div>
            <p class="muted">{TN.tyreRoundedNote}</p>
          </>
        ) : null}
        {blockedBy === null && nearFigure.map((n) => (
          <p class="tyre-cap-note" key={n.code}>
            {n.text}
            {n.code === 'rimUnset' ? <> <button type="button" class="btn" onClick={() => change({ rimType: 'hooked' })}>{TC.tyreMyRimHooked}</button> <span class="muted">{TC.tyreRimUnsure}</span></> : null}
          </p>
        ))}
        {blockedBy === null && result?.split ? (
          <p>
            {TM.tyreSplit(...fmtPct(result.split.share))} {result.split.why}
            <br /><span class="muted">{TN.tyreSplitSensitivity}</span>
          </p>
        ) : null}
        {resolved.input && resolved.assumed.length ? <p class="tyre-assumed">{TZ.tyreAssumedList(resolved.assumed.map((f) => ASSUMED_WORDS[f]).join(', '))}</p> : null}
        {blockedBy === null && listed.length ? (
          <>
            <h3>{W.tyreHeadingWarnings}</h3>
            <ul class="tyre-warnings">{listed.map((n) => <li key={n.code + n.text}>{n.text}</li>)}</ul>
          </>
        ) : null}
        {blockedBy === null && result && result.decided.length ? (
          <>
            <h3>{W.tyreHeadingWhy}</h3>
            <ul>{result.decided.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}
        {resolved.input ? <p class="muted">{TN.tyreEstimateNote}</p> : null}
      </section>

      <Card title={TC.tyreLimitsMoreTitle}>
        <LimitInput key={`min-${key}`} id="tyre-min" label={W.tyreLimitMinLabel} required={false} value={details.tyreMin} onPending={onPending}
          onCommit={(l) => change({ tyreMin: l })} />
        <LimitInput key={`rim-${key}`} id="tyre-rimmax" label={W.tyreLimitRimLabel} required={false} value={details.rimMax} min={details.tyreMin} onPending={onPending}
          onCommit={(l) => change({ rimMax: l })} />
      </Card>

      <Card title={W.tyreSectionRider}>
        <Field id={bikeKey('rider')} label={W.tyreRiderLabel} source={src.riderKg} valueText={`${v.riderKg} kg`} resetLabel={resetFor('riderKg')}
          onReset={resetter('riderKg')}
          editor={<NumberInput key={`rider-${key}`} id="tyre-rider" label={W.tyreRiderLabel} value={own('riderKg', v.riderKg)} assumed={v.riderKg} onCommit={(n) => change({ riderKg: n })} unit="kg" />} />
        <Field id={bikeKey('bikekg')} label={W.tyreBikeKgLabel} source={src.bikeKg} plan={planNote} valueText={`${v.bikeKg} kg`} resetLabel={resetFor('bikeKg')}
          onReset={resetter('bikeKg')}
          editor={<NumberInput key={`bikekg-${key}`} id="tyre-bikekg" label={W.tyreBikeKgLabel} value={own('bikeKg', v.bikeKg)} assumed={v.bikeKg} onCommit={(n) => change({ bikeKg: n })} unit="kg" />} />
        <Field id={bikeKey('load')} label={W.tyreLoadLabel} source={src.carriedKg} plan={planNote} valueText={`${ctx.summary?.carriedKg ?? 0} kg`} resetLabel={resetFor('carriedKg')}
          onReset={resetter('carriedKg')}
          editor={<>
            <NumberInput key={`load-${key}`} id="tyre-load" label={W.tyreLoadLabel} value={details.carriedKg} onCommit={(n) => change({ carriedKg: n })} unit="kg" />
            <p class="muted">{src.carriedKg === 'entered' ? TN.tyreLoadEnteredNote : TN.tyreLoadNone}</p>
          </>} />
      </Card>

      <Card title={W.tyreSectionBars}>
        <Field id={bikeKey('bars')} label={W.tyreBarsLabel} source={src.bars} valueText={({ drop: W.tyreBarsDrop, flat: W.tyreBarsFlat, other: W.tyreBarsOther })[v.bars]} resetLabel={resetFor('bars')}
          onReset={resetter('bars')}
          editor={<Choice<Bars> id="tyre-bars" label={W.tyreBarsLabel} value={choiceValue('bars', v.bars)} onChange={(x) => change({ bars: x })}
            options={[{ value: 'drop', label: W.tyreBarsDrop }, { value: 'flat', label: W.tyreBarsFlat }, { value: 'other', label: W.tyreBarsOther }]} />} />
      </Card>

      <Card title={W.tyreSectionTyres}>
        <Choice<Casing> id="tyre-casing" label={W.tyreCasingLabel} source={src.casing} value={choiceValue('casing', v.casing)} onChange={(x) => change({ casing: x })}
          options={[{ value: 'supple', label: W.tyreCasingSupple }, { value: 'standard', label: W.tyreCasingStandard }, { value: 'reinforced', label: W.tyreCasingReinforced }]} />
        <Choice<Setup> id="tyre-setup" label={W.tyreSetupLabel} source={src.setup} value={choiceValue('setup', v.setup)} onChange={(x) => change({ setup: x })}
          options={[{ value: 'butyl', label: W.tyreSetupButyl }, { value: 'latex', label: W.tyreSetupLatex }, { value: 'tpu', label: W.tyreSetupTpu }, { value: 'tubeless', label: W.tyreSetupTubeless }]} />
      </Card>

      <Card title={W.tyreSectionRim}>
        <Field id={bikeKey('wheel')} label={W.tyreWheelLabel} source={src.wheelBsdMm} valueText={WHEELS.find((w) => w.bsdMm === (v.wheelBsdMm))?.label ?? ''} resetLabel={resetFor('wheelBsdMm')} onReset={resetter('wheelBsdMm')}
          editor={
            <label class="tyre-input" for="tyre-wheel">
              <span class="tyre-label">{W.tyreWheelLabel}</span>
              <select id="tyre-wheel" value={String(v.wheelBsdMm)} onChange={(e) => change({ wheelBsdMm: Number((e.currentTarget as HTMLSelectElement).value) })}>
                {WHEELS.map((w) => <option key={w.bsdMm} value={String(w.bsdMm)}>{w.label}</option>)}
              </select>
            </label>} />
        <Field id={bikeKey('rim')} label={TF.tyreRimInnerLabel} source={src.rimInnerMm} valueText={`${v.rimInnerMm} mm`} resetLabel={resetFor('rimInnerMm')} onReset={resetter('rimInnerMm')}
          editor={<NumberInput key={`rim-${key}`} id="tyre-rim" label={TF.tyreRimInnerLabel} value={own('rimInnerMm', v.rimInnerMm)} assumed={v.rimInnerMm} onCommit={(n) => change({ rimInnerMm: n })} unit="mm" />} />
      </Card>

      <Card title={W.tyreSectionSurface}>
        <Choice<Surface> id="tyre-surface" label={W.tyreSurfaceLabel} source={src.surface} value={choiceValue('surface', v.surface)} onChange={(x) => change({ surface: x })}
          options={[{ value: 'paved', label: W.tyreSurfacePaved }, { value: 'rough', label: TF.tyreSurfaceRough }, { value: 'unpaved', label: W.tyreSurfaceUnpaved }]} />
        <label class="tyre-check">
          <input type="checkbox" checked={details.wet ?? false} onChange={(e) => change({ wet: (e.currentTarget as HTMLInputElement).checked })} />
          <span>{TF.tyreWetLabel}</span>
        </label>
      </Card>

      <Card title={W.tyreSectionHeat}>
        <p class="muted">{T.tyreHeatIntro}</p>
        <NumberInput key={`hp-${key}`} id="tyre-heat-pump" label={W.tyreHeatPumpLabel} signed value={details.heat?.pumpC} onCommit={(n) => changeHeat({ pumpC: n })} unit="°C" />
        <NumberInput key={`hm-${key}`} id="tyre-heat-max" label={W.tyreHeatMaxLabel} signed value={details.heat?.maxC} onCommit={(n) => changeHeat({ maxC: n })} unit="°C" />
        <NumberInput key={`hh-${key}`} id="tyre-heat-pumph" label={TN.tyrePumpHeightLabel} signed value={details.heat?.pumpHeightM} onCommit={(n) => changeHeat({ pumpHeightM: n })} unit="m" />
        <NumberInput key={`hv-${key}`} id="tyre-heat-high" label={W.tyreHighestLabel} signed value={details.heat?.highestM} onCommit={(n) => changeHeat({ highestM: n })} unit="m" />
        {!v.heat ? <p class="notice">{W.tyreHeatSkipped}</p> : null}
        {v.heat && showFigures && front && rear && !front.heat?.advise && !rear.heat?.advise ? <p class="muted">{TN.tyreHeatFits}</p> : null}
      </Card>

      <Card title={W.tyreSectionMeasured}>
        <MeasuredFields key={`m-${key}`} value={details.measured} onCommit={(m) => change({ measured: m })} />
        <p class="muted">{T.tyreCaliperHelp}</p>
        <NumberInput key={`cf-${key}`} id="tyre-cfront" label={W.tyreCaliperFrontLabel} value={details.caliperFrontMm ?? undefined} onCommit={(n) => change({ caliperFrontMm: n ?? null })} unit="mm" />
        <NumberInput key={`cr-${key}`} id="tyre-crear" label={TF.tyreCaliperRearLabel} value={details.caliperRearMm ?? undefined} onCommit={(n) => change({ caliperRearMm: n ?? null })} unit="mm" />
      </Card>

      {resolved.input ? (
        <Card title={TF.tyreSramTitle}>
          <p>{TN.tyreSramIntro}</p>
          <ul class="tyre-sram">
            {sramList(v).map((row) => <li key={row.label}><strong>{row.label}:</strong> {row.value}</li>)}
          </ul>
          <p><a class="btn btn-primary" href={SRAM_URL} target="_blank" rel="noopener noreferrer">{TN.tyreSramLink}</a></p>
          <p class="muted">{W.tyreSramNothingSent} {TN.tyreSramDiffer}</p>
        </Card>
      ) : null}
    </div>
  );
}

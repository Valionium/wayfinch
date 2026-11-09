// Bike care's step view (care pictures design of 7 November 2026, section 2; the owner's answers of 8 November): a roadside card or a Care
// task full screen, one step at a time, each with its picture where one is drawn. Back and Next only, no swiping (answer 4). Opening it adds
// one history entry, so the phone's back gesture closes it in one go. While a roadside card is open the screen is kept awake (answer 5).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { careDetails } from '../../core/care/fit.ts';
import { stepsShown } from '../../core/care/lines.ts';
import { pictureDetails, picturesFor, type Shown } from '../../core/care/pictures.ts';
import { linkSegments, STEP_PARTS } from '../../core/parts/links.ts';
import type { PartId } from '../../core/parts/guide.ts';
import type { CareTask, RoadCard } from '../../core/care/types.ts';
import { C, CARRY, WHO_LABEL } from '../../core/wording/en-care.ts';
import { KIND_WORDS, SWITCH_WORDS } from '../../core/wording/en-care-pictures.ts';
import { loadPictures, Picture, pictureReady, stepTitle } from './picture.tsx';

/** The All steps choice, remembered on the phone: '1' or '0'. A copilot:* key, so Delete co-pilot data removes it. */
export const ALL_STEPS_KEY = 'copilot:careAllSteps:v1';

export type StepSource = { kind: 'road'; item: RoadCard } | { kind: 'task'; item: CareTask };

const readAll = (): boolean => { try { return localStorage.getItem(ALL_STEPS_KEY) === '1'; } catch { return false; } };
const writeAll = (on: boolean): void => { try { localStorage.setItem(ALL_STEPS_KEY, on ? '1' : '0'); } catch { /* storage blocked: this visit only */ } };

type Sentinel = { released: boolean; release: () => Promise<void> };
type WakeLockish = { request: (kind: 'screen') => Promise<Sentinel> };

/** Keeps the screen awake while `on`: asked again when the page shows again (the phone lets go when it is hidden), let go at the end. */
function useAwake(on: boolean): void {
  useEffect(() => {
    if (!on) return undefined;
    const wake = (navigator as { wakeLock?: WakeLockish }).wakeLock;
    if (!wake) return undefined;
    let alive = true;
    let held: Sentinel | null = null;
    // An ask still open counts as held: the page showing again in that moment asks no second time (review of PR 72: a second lock
    // would overwrite the first, which then was never let go).
    let asking = false;
    const ask = async (): Promise<void> => {
      if (asking || document.visibilityState === 'hidden' || (held && !held.released)) return;
      asking = true;
      try {
        const s = await wake.request('screen');
        if (alive) held = s;
        else void s.release().catch(() => {});
      } catch { /* refused (battery saver, no permission): the steps work all the same */ } finally { asking = false; }
    };
    const onVisible = (): void => { void ask(); };
    void ask();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      if (held && !held.released) void held.release().catch(() => {});
    };
  }, [on]);
}

function Before({ source }: { source: StepSource }) {
  if (source.kind === 'road') {
    const c = source.item;
    return (
      <>
        <p><strong>{C.careRoadCheckFirst}:</strong> {c.checkFirst}</p>
        <p><strong>{C.careRoadCarry}:</strong> {c.carry.map((id) => CARRY.find((x) => x.id === id)?.name).filter(Boolean).join('; ')}</p>
      </>
    );
  }
  const t = source.item;
  return (
    <>
      <p><strong>{C.careSigns}:</strong> {t.signs}</p>
      {t.alsoWet ? <p>{C.careAlsoWet}</p> : null}
      <p><strong>{C.careTools}:</strong> {t.tools}{t.minutes ? ` · ${C.careTime(t.minutes[0], t.minutes[1])}` : ''}</p>
      <p><strong>{C.careWho}:</strong> {t.why ?? WHO_LABEL[t.who]}</p>
    </>
  );
}

/**
 * A step's picture: one at a time (care pictures redo, answer 4). Where its kind depends on the bike, the bike's own kind shows (or, not
 * told, the most common modern one), and a row "Other kinds" offers each other kind with one tap; none until loaded.
 */
function Pictures({ shown, view }: { shown: Shown[]; view: string }) {
  const ready = shown.filter((p) => pictureReady(p.id));
  const [pick, setPick] = useState<string | null>(null);
  if (ready.length === 0) return null;
  const now = ready.find((p) => p.id === pick) ?? ready[0]!;
  const others = ready.filter((p) => p !== now && p.kind);
  return (
    <div class="care-pics">
      <Picture key={now.id} id={now.id} view={view} />
      {others.length > 0 ? (
        <div class="care-kinds" role="group" aria-label={SWITCH_WORDS.other}>
          <span class="care-kinds-label" aria-hidden="true">{SWITCH_WORDS.other}:</span>
          {others.map((p) => (
            <button key={p.id} type="button" class="btn care-kind" aria-label={SWITCH_WORDS.show(KIND_WORDS[p.kind!] ?? p.kind!)}
              onClick={() => setPick(p.id)}>{KIND_WORDS[p.kind!] ?? p.kind}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type Sheet = typeof import('./parts-sheet.tsx').PartSheet;
type OnPart = (part: PartId, from: HTMLButtonElement) => void;

/**
 * A step's text with its part names as buttons that open the parts guide (design 4.2): the first mention of each, from the wording data
 * (STEP_PARTS), the text reading exactly as before.
 */
function StepText({ id, at, text, onPart }: { id: string; at: number; text: string; onPart: OnPart }) {
  const links = STEP_PARTS[id]?.[at] ?? [];
  return (
    <p class="care-step-t">
      {linkSegments(text, links).map((seg, i) => (typeof seg === 'string' ? seg : (
        <button key={i} type="button" class="care-part" aria-haspopup="dialog" onClick={(e) => onPart(seg.part, e.currentTarget)}>{seg.text}</button>
      )))}
    </p>
  );
}

/** The end page's heading and words, or null where a task has nothing to add (its last step's Next then reads Done). */
function endOf(source: StepSource): { title: string; body: preact.ComponentChildren } | null {
  const unsure = source.item.critical ? <p class="care-unsure"><strong>{C.careUnsure}</strong></p> : null;
  if (source.kind === 'road') return { title: C.careRideOn, body: <><p>{source.item.rideOn}</p>{unsure}</> };
  const t = source.item;
  return t.note || t.critical ? { title: C.careStepsEnd, body: <>{t.note ? <p>{t.note}</p> : null}{unsure}</> } : null;
}

/**
 * `bike`: the chosen bike (null for none): its details pick each picture's kind (care pictures redo, section 2) and which brake lines show
 * (T9), and the parts guide draws it with the part marked (the app's default bike when null).
 */
export function StepView({ source, bike = null, onClose }: { source: StepSource; bike?: BikeRecord | null; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const [at, setAt] = useState(0);
  const [all, setAll] = useState(readAll);
  const [, setReady] = useState(0);
  // The parts guide's sheet: its own chunk, loaded with the first tap on a part name; the name tapped gets focus back when it closes.
  const [part, setPart] = useState<PartId | null>(null);
  const [PartSheet, setSheet] = useState<Sheet | null>(null);
  const partFrom = useRef<HTMLButtonElement | null>(null);
  const openPart: OnPart = (id, from) => {
    partFrom.current = from;
    if (PartSheet) { setPart(id); return; }
    void import('./parts-sheet.tsx').then(async (m) => {
      if (await m.loadWords()) { setSheet(() => m.PartSheet); setPart(id); }
    }, () => { /* not loaded (offline before it was cached): the text stays */ });
  };
  const closePart = (): void => { setPart(null); partFrom.current?.focus(); };
  // the steps that show for this bike, as indexes into the card's steps: pictures and part names keep their own step's index
  const shownSteps = stepsShown(source.item.id, source.item.steps.length, careDetails(bike), pictureDetails(bike).rimBrake);
  const steps = shownSteps.map((i) => source.item.steps[i]!);
  const end = endOf(source);
  const last = end ? steps.length + 1 : steps.length;
  const name = source.kind === 'road' ? source.item.problem : source.item.name;
  const titleId = `care-steps-title-${source.item.id}`;
  const details = pictureDetails(bike);
  const pictures = shownSteps.map((i) => picturesFor(source.item.id, i, details));

  const close = (fromBack: boolean): void => {
    if (!fromBack) history.back();
    // Closed before it leaves the page: a modal dialog removed while open can take focus with it after the card has been given it back.
    const d = box.current;
    if (d?.open && typeof d.close === 'function') d.close();
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const d = box.current!;
    if (typeof d.showModal === 'function') d.showModal();
    else d.open = true;
    history.pushState({ careSteps: source.item.id }, '');
    // Only a pop that leaves this view's own entry closes it (a late popstate of the hash change before it opened does not).
    const onPop = (): void => { if ((history.state as { careSteps?: string } | null)?.careSteps !== source.item.id) closeRef.current(true); };
    window.addEventListener('popstate', onPop);
    let alive = true;
    void loadPictures(pictures.flat().map((p) => p.id)).then(() => { if (alive) setReady((n) => n + 1); });
    return () => { alive = false; window.removeEventListener('popstate', onPop); };
  }, []);
  useEffect(() => { head.current?.focus(); }, [at, all]);
  useAwake(source.kind === 'road');

  const go = (to: number): void => { if (to >= 0 && to <= last) setAt(to); };
  const onKey = (e: KeyboardEvent): void => {
    if (part !== null) return; // the sheet has the keys
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    // Alt or Ctrl with an arrow is the browser's own Back or Forward, and Shift or the Command key selects: let them pass.
    if (all || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  };
  // On the document, not the dialog: as a step changes, its heading is replaced, and a key pressed in that moment would land outside.
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const listen = (e: KeyboardEvent): void => { keyRef.current(e); };
    document.addEventListener('keydown', listen);
    return () => { document.removeEventListener('keydown', listen); };
  }, []);
  const toggleAll = (): void => { writeAll(!all); setAll(!all); setAt(0); };

  const onStep = at >= 1 && at <= steps.length;
  const label = onStep ? C.careStepsCount(at, steps.length) : at === 0 ? C.careStepsBefore : end!.title;
  const pics = onStep ? pictures[at - 1]! : [];
  const hasPic = pics.some((p) => pictureReady(p.id));

  return (
    <dialog ref={box} class="care-steps" aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); close(false); }}>
      <div class="care-steps-top">
        <button type="button" class="care-steps-icon" aria-label={C.careStepsClose} onClick={() => close(false)}>✕</button>
        <div class="care-steps-where">
          <span id={titleId} class="care-steps-name">{name}</span>
          {all ? null : <span class="care-steps-count">{label}</span>}
        </div>
        <button type="button" class="btn care-steps-all" aria-pressed={all} onClick={toggleAll}>{C.careStepsAll}</button>
      </div>
      {all ? null : (
        <div class="care-steps-progress" aria-hidden="true">
          {steps.map((_, i) => <span key={i} class={i < at ? 'on' : ''} />)}
        </div>
      )}
      <p class="visually-hidden" aria-live="polite">{all ? '' : label}</p>
      <div class="care-steps-body">
        {all ? (
          <div class="care-step care-step-list">
            <h2 ref={head} tabIndex={-1} class="care-step-h">{C.careStepsAll}</h2>
            <section class="care-step-before"><h3>{C.careStepsBefore}</h3><Before source={source} /></section>
            {steps.map((s, i) => (
              <section key={i} class="care-step-all">
                <Pictures shown={pictures[i]!} view={`a${i}`} />
                <h3>{stepTitle(source.item.id, shownSteps[i]!) ?? C.careStepN(i + 1)}</h3>
                <StepText id={source.item.id} at={shownSteps[i]!} text={s} onPart={openPart} />
              </section>
            ))}
            {end ? <section class="care-step-end"><h3>{end.title}</h3>{end.body}</section> : null}
          </div>
        ) : (
          <div key={at} class={`care-step${hasPic ? ' care-step-pic' : ''}`}>
            <Pictures shown={pics} view={`s${at}`} />
            <div class="care-step-words">
              <h2 ref={head} tabIndex={-1} class="care-step-h">{onStep ? stepTitle(source.item.id, shownSteps[at - 1]!) ?? C.careStepN(at) : label}</h2>
              {at === 0 ? <Before source={source} /> : onStep ? <StepText id={source.item.id} at={shownSteps[at - 1]!} text={steps[at - 1]!} onPart={openPart} /> : end!.body}
            </div>
          </div>
        )}
      </div>
      <div class="care-steps-nav">
        {all ? <button type="button" class="btn btn-primary" onClick={() => close(false)}>{C.careStepsDone}</button> : (
          <>
            {at > 0 ? <button type="button" class="btn care-steps-back" onClick={() => go(at - 1)}>{C.careStepsBack}</button> : null}
            {at < last
              ? <button type="button" class="btn btn-primary" onClick={() => go(at + 1)}>{C.careStepsNext}</button>
              : <button type="button" class="btn btn-primary" onClick={() => close(false)}>{C.careStepsDone}</button>}
          </>
        )}
      </div>
      {part !== null && PartSheet ? <PartSheet key={part} part={part} bike={bike} onClose={closePart} /> : null}
    </dialog>
  );
}

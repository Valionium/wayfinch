// Bike care's step view (care pictures design of 7 November 2026, section 2; the owner's answers of 8 November): a roadside card or a Care
// task full screen, one step at a time, each with its picture where one is drawn. Back and Next only, no swiping (answer 4). Opening it adds
// one history entry, so the phone's back gesture closes it in one go. While a roadside card is open the screen is kept awake (answer 5).
import { useEffect, useRef, useState } from 'preact/hooks';
import { pictureFor } from '../../core/care/pictures.ts';
import type { CareTask, RoadCard } from '../../core/care/types.ts';
import { C, CARRY, WHO_LABEL } from '../../core/wording/en-care.ts';
import { loadPictures, Picture, pictureReady } from './picture.tsx';

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
    const ask = async (): Promise<void> => {
      if (document.visibilityState === 'hidden' || (held && !held.released)) return;
      try {
        const s = await wake.request('screen');
        if (alive) held = s;
        else void s.release();
      } catch { /* refused (battery saver, no permission): the steps work all the same */ }
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

/** The end page's heading and words, or null where a task has nothing to add (its last step's Next then reads Done). */
function endOf(source: StepSource): { title: string; body: preact.ComponentChildren } | null {
  const unsure = source.item.critical ? <p class="care-unsure"><strong>{C.careUnsure}</strong></p> : null;
  if (source.kind === 'road') return { title: C.careRideOn, body: <><p>{source.item.rideOn}</p>{unsure}</> };
  const t = source.item;
  return t.note || t.critical ? { title: C.careStepsEnd, body: <>{t.note ? <p>{t.note}</p> : null}{unsure}</> } : null;
}

export function StepView({ source, onClose }: { source: StepSource; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const [at, setAt] = useState(0);
  const [all, setAll] = useState(readAll);
  const [, setReady] = useState(0);
  const steps = source.item.steps;
  const end = endOf(source);
  const last = end ? steps.length + 1 : steps.length;
  const name = source.kind === 'road' ? source.item.problem : source.item.name;
  const titleId = `care-steps-title-${source.item.id}`;
  const pictures = steps.map((_, i) => pictureFor(source.item.id, i));

  const close = (fromBack: boolean): void => {
    if (!fromBack) history.back();
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
    void loadPictures(pictures.filter((p): p is string => p !== null)).then(() => { if (alive) setReady((n) => n + 1); });
    return () => { alive = false; window.removeEventListener('popstate', onPop); };
  }, []);
  useEffect(() => { head.current?.focus(); }, [at, all]);
  useAwake(source.kind === 'road');

  const go = (to: number): void => { if (to >= 0 && to <= last) setAt(to); };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    if (all || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
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
  const pic = onStep ? pictures[at - 1]! : null;

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
                {pictureReady(pictures[i]!) ? <Picture id={pictures[i]!} view={`a${i}`} /> : null}
                <h3>{C.careStepN(i + 1)}</h3>
                <p class="care-step-t">{s}</p>
              </section>
            ))}
            {end ? <section class="care-step-end"><h3>{end.title}</h3>{end.body}</section> : null}
          </div>
        ) : (
          <div key={at} class={`care-step${pictureReady(pic) ? ' care-step-pic' : ''}`}>
            {pictureReady(pic) ? <Picture id={pic} view={`s${at}`} /> : null}
            <div class="care-step-words">
              <h2 ref={head} tabIndex={-1} class="care-step-h">{onStep ? C.careStepN(at) : label}</h2>
              {at === 0 ? <Before source={source} /> : onStep ? <p class="care-step-t">{steps[at - 1]}</p> : end!.body}
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
    </dialog>
  );
}

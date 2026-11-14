// One run of Get ready offline, shared by Trip's step and Ahead's card (guided Trip design §2.3): the same prepare, the same
// progress, the same words. There is one run per page at a time (review of PR 73, I1): its state lives here, not in a component,
// so a step folded and opened again, or Ahead after Trip, shows the run that is going, and a second tap joins it.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import type { StepName, StepReport } from '../../data/prepare.ts';
import { runningSignal } from './run-state.ts';

export const STEP_ORDER: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const LABEL: Record<StepName, string> = {
  heights: TR.appTripStepHeights, places: W.appTripStepPlaces, hours: TR.appTripStepHours,
  weather: TR.appTripStepWeather, baseline: TR.appTripStepBaseline, save: W.appTripStepSave,
};
export const labelOf = (step: string): string => (LABEL as Record<string, string>)[step] ?? step;

export type Prepare = (onProgress: (step: StepName, done: number, total: number) => void, onNotice: (text: string) => void) => Promise<StepReport[]>;
type Progress = { step: StepName; done: number; total: number };
type State = { progress: Progress | null; notice: string | null };
type Ended = { reports: StepReport[] | null; failure: string | null };
export type Run = {
  go: () => Promise<void>;
  progress: Progress | null; notice: string | null; reports: StepReport[] | null; failure: string | null;
};

const state = signal<State>({ progress: null, notice: null });
let inFlight: Promise<void> | null = null;
/**
 * The screens showing a run now: once it ends, each reads what was stored and then gets the reports (so they never sit beside
 * "nothing is saved"). A screen opened later shows what was stored instead.
 */
type Reader = { after: () => Promise<void>; ended: (e: Ended) => void };
const readers = new Set<{ current: Reader }>();

const set = (part: Partial<State>): void => { state.value = { ...state.value, ...part }; };

function start(prepare: Prepare): Promise<void> {
  // A second tap, here or on the other screen, joins the run that is going.
  if (inFlight) return inFlight;
  set({ notice: null, progress: { step: 'heights', done: 0, total: 1 } });
  for (const r of readers) r.current.ended({ reports: null, failure: null });
  runningSignal.value = true;
  const end = async (e: Ended): Promise<void> => {
    const now = [...readers];
    await Promise.all(now.map((r) => r.current.after().catch(() => undefined)));
    for (const r of now) r.current.ended(e);
  };
  inFlight = (async () => {
    try {
      const result = await prepare((step, done, total) => set({ progress: { step, done, total } }), (notice) => set({ notice }));
      await end({ reports: result, failure: null });
    } catch {
      await end({ reports: null, failure: W.appPrepSaveFailed });
    } finally {
      inFlight = null;
      runningSignal.value = false;
      set({ progress: null });
    }
  })();
  return inFlight;
}

/** `after` reads what was stored once the run ends. */
export function usePrepareRun(prepare: Prepare, after: () => Promise<void>): Run {
  const s = state.value;
  const [ended, setEnded] = useState<Ended>({ reports: null, failure: null });
  const reader = useRef<Reader>({ after, ended: setEnded });
  reader.current = { after, ended: setEnded };
  useEffect(() => {
    readers.add(reader);
    return () => { readers.delete(reader); };
  }, []);
  return { go: () => start(prepare), progress: s.progress, notice: s.notice, ...ended };
}

/** "Working…", "Step 2 of 6: Map data and places — 3 of 14", the bar and the notice; or why it could not be saved. */
export function RunProgress({ run }: { run: Run }) {
  const { progress, notice, failure } = run;
  return (
    <div role="status" aria-live="polite">
      {progress ? (
        <>
          <p>{W.appTripWorking}</p>
          <p>{W.appTripProgress(STEP_ORDER.indexOf(progress.step) + 1, STEP_ORDER.length, labelOf(progress.step))}{progress.total > 1 ? ` — ${W.appTripProgressPart(progress.done, progress.total)}` : ''}</p>
          <progress max={STEP_ORDER.length} value={STEP_ORDER.indexOf(progress.step) + (progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0)} />
          {notice ? <p class="notice">{notice}</p> : null}
        </>
      ) : null}
      {failure ? <p class="notice">{failure}</p> : null}
    </div>
  );
}

/**
 * The steps that were not saved, with their reasons (design §2.2: each step says what was done and what was not); without signal
 * it says so plainly. Trip's step and Ahead's card both show it.
 */
export function NotSaved({ failed, head = true }: { failed: { step: string; note: string | null }[]; head?: boolean }) {
  if (failed.length === 0) return null;
  const noSignal = failed.every((s) => s.note === W.appPrepNoConnection);
  return (
    <>
      {head ? <h3>{W.appTripMissingHeading}</h3> : null}
      <ul class="trip-steps">{failed.map((s) => <li key={s.step}><strong>{labelOf(s.step)}</strong> {s.note ?? ''}</li>)}</ul>
      <p>{noSignal ? W.appPrepNoSignal : TR.appTripPartial}</p>
    </>
  );
}

// One run of Get ready offline, shared by Trip's step and Ahead's card (guided Trip design §2.3): the same prepare, the same
// progress, the same words. It holds no store or network of its own: the caller hands in the prepare and what to read after it.
import { useRef, useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import type { StepName, StepReport } from '../../data/prepare.ts';

export const STEP_ORDER: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const LABEL: Record<StepName, string> = {
  heights: W.appTripStepHeights, places: W.appTripStepPlaces, hours: W.appTripStepHours,
  weather: W.appTripStepWeather, baseline: W.appTripStepBaseline, save: W.appTripStepSave,
};
export const labelOf = (step: string): string => (LABEL as Record<string, string>)[step] ?? step;

export type Prepare = (onProgress: (step: StepName, done: number, total: number) => void, onNotice: (text: string) => void) => Promise<StepReport[]>;
type Progress = { step: StepName; done: number; total: number };
export type Run = {
  go: () => Promise<void>;
  progress: Progress | null; notice: string | null; reports: StepReport[] | null; failure: string | null;
};

/** `after` reads what was stored, before the reports show, so the lines never show beside "nothing is saved". */
export function usePrepareRun(prepare: Prepare, after: () => Promise<void>): Run {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<StepReport[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);
  const go = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setFailure(null);
    setNotice(null);
    setReports(null);
    setProgress({ step: 'heights', done: 0, total: 1 });
    try {
      const result = await prepare((step, done, total) => setProgress({ step, done, total }), setNotice);
      await after();
      setReports(result);
    } catch {
      setFailure(W.appPrepSaveFailed);
      await after();
    } finally {
      running.current = false;
      setProgress(null);
    }
  };
  return { go, progress, notice, reports, failure };
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

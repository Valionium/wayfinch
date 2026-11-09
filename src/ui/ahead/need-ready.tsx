// Ahead before Get ready offline (guided Trip design §2.3): the top card's own Get ready offline button (its title and why are in
// ahead.tsx). The button is Trip's very prepare, through the actions object, with the same progress (run.tsx); once
// it ends Ahead reads again. A chunk of its own: only a rider who has not run Get ready offline loads it.
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { NotSaved, RunProgress, usePrepareRun } from '../trip/run.tsx';
import type { AheadActions } from './actions.ts';

/** `failed`: the steps the stored record says were not saved; right after a run here, its own reports say it. */
export function NeedReady({ actions, failed, before = true }: { actions: AheadActions; failed: { step: string; ok: boolean; note: string | null }[]; before?: boolean }) {
  const run = usePrepareRun(actions.getReady, () => actions.retry());
  const missing = run.reports ? run.reports.filter((s) => !s.ok) : failed;
  return (
    <>
      <p>
        {/* While a run is going (here or on Trip), a tap joins it: never a second run (review of PR 73, I1). */}
        <button type="button" class="btn btn-primary" onClick={() => void run.go()} aria-busy={run.progress ? 'true' : undefined}>
          {run.failure || missing.length > 0 ? W.appTripRetryButton : W.appTripGetReadyButton}
        </button>
      </p>
      <p class="muted" data-prepare-line>{TR.appTripPrepareLine}</p>
      <RunProgress run={run} />
      {/* Without the card's own title (no longer before Get ready), "Not saved" is its title, in ahead.tsx. */}
      {run.progress ? null : <NotSaved failed={missing} head={before} />}
      {before ? <p class="muted">{W.appAheadNeedUntil}</p> : null}
    </>
  );
}

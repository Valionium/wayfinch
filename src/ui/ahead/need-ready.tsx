// Ahead before Get ready offline (guided Trip design §2.3): the top card's own Get ready offline button (its title and why are in
// ahead.tsx). The button is Trip's very prepare, through the actions object, with the same progress (run.tsx); once
// it ends Ahead reads again. A chunk of its own: only a rider who has not run Get ready offline loads it.
import { W } from '../../core/wording/en.ts';
import { RunProgress, usePrepareRun } from '../trip/run.tsx';
import type { AheadActions } from './actions.ts';

export function NeedReady({ actions }: { actions: AheadActions }) {
  const run = usePrepareRun(actions.getReady, () => actions.retry());
  return (
    <>
      <p>
        <button type="button" class="btn btn-primary" onClick={() => void run.go()} aria-busy={run.progress ? 'true' : undefined}>
          {run.failure ? W.appTripRetryButton : W.appTripGetReadyButton}
        </button>
      </p>
      <RunProgress run={run} />
      <p class="muted">{W.appAheadNeedUntil}</p>
    </>
  );
}

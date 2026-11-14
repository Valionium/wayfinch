// Get ready offline on Trip (spec sections 3.3, 5 and 9.4). It reports what was done, step by step, and what was not: nothing
// here calls the trip ready, safe or complete (Decision 2). One fixed line asks the rider to test it in flight mode.
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { TF } from '../../core/wording/en-trip-fields.ts';
import { askForHomeScreen } from '../install.ts';
import { BeforeYouGo, PrepBeside } from './prep.tsx';
import { labelOf, NotSaved, RunProgress, usePrepareRun } from './run.tsx';
import { savedLine } from './saved-line.ts';
import type { TripServices, TripSnapshot } from './services.ts';

/**
 * The Get ready offline step's body. `lead` is the message after a route was added (owner's item 2): it carries the step's one
 * Get ready offline button until the first run. `onRun` tells the steps a run started, so the step stays open with its result.
 */
type Props = { services: TripServices; snap: TripSnapshot; reload: () => Promise<void>; lead?: string | null; onRun?: () => void };

/**
 * The step's body; with the snapshot alone, what goes beside the folded step's Update instead: Before you leave (prep.tsx; the sweep
 * of 15 Nov 2026, finding 1). Through this component, so Trip's code in the first screen names no lazy component more.
 */
export function GetReady(props: Props | { snap: TripSnapshot }) {
  return 'services' in props ? <Body {...props} /> : <PrepBeside snap={props.snap} />;
}

function Body({ services, snap, reload, lead = null, onRun }: Props) {
  const run = usePrepareRun(services.prepare, reload);
  const { progress, reports } = run;
  // While a run is going (started here, on Ahead, or before the step was folded), a tap joins it: never a second run.
  const go = (): void => { onRun?.(); void run.go(); };

  const steps = reports ?? snap.prepared?.steps ?? null;
  const failed = steps?.filter((s) => !s.ok) ?? [];
  // "Saving" is how the run ends, not data it saved; the stored record never holds it, so it isn't listed right after a run either.
  const saved = steps?.filter((s) => s.ok && s.step !== 'save') ?? [];
  const line = savedLine(snap);
  const ask = askForHomeScreen({ userAgent: services.env.userAgent, maxTouchPoints: services.env.maxTouchPoints, platform: services.env.platform, standalone: services.env.standalone })
    && snap.prepared === null && snap.places === 0;
  const verb = snap.prepared === null && reports === null ? W.appTripGetReadyButton : failed.length > 0 ? W.appTripRetryButton : W.appTripUpdateButton;
  const button = <button type="button" class="btn btn-primary" onClick={go} aria-busy={progress ? 'true' : undefined}>{verb}</button>;
  const leading = lead !== null && !progress && reports === null && run.failure === null;

  return (
    <div data-getready>
      {leading ? <p class="trip-added" role="status" data-added>{lead} {button}</p> : null}
      {leading ? <p class="muted" data-prepare-line>{TR.appTripPrepareLine}</p> : null}
      {ask ? <p class="notice">{TR.appTripIphoneAsk}</p> : null}
      {line ? <p class="tool-line">{line}</p> : <p class="muted">{TF.appTripNothingSaved}</p>}
      {snap.storageMb !== null ? <p class="muted">{TF.appTripStorage(String(snap.storageMb))}</p> : null}
      {leading ? null : <>{button}<p class="muted" data-prepare-line>{TR.appTripPrepareLine}</p></>}
      <RunProgress run={run} />
      {progress ? null : <NotSaved failed={failed} />}
      {!progress && saved.length > 0 ? <p class="muted">{W.appTripStepsOk}: {saved.map((s) => labelOf(s.step)).join(', ')}.</p> : null}
      <p class="tool-line">{W.appTripFlightMode}</p>
      <BeforeYouGo snap={snap} />
    </div>
  );
}

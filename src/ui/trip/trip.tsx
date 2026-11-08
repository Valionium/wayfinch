// The Trip tab (spec section 3.3, guided Trip design of 8 Nov 2026): the bike and the trip line first, then the four steps (Route,
// Get ready offline, Bags, Go) and the route's summary. It renders what the engines and the store give and works out no answer of
// its own; which step is done is read from the trip, what Get ready offline saved and the running trip.
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { localIsoDate } from '../../core/answers/time.ts';
import { GPX_MAX_BYTES, GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { onChanged } from '../../store/changed.ts';
import { sameLine } from '../../store/trip.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { degradedSignal, noteTripFacts } from '../degraded.ts';
import { installOffer, promptInstall } from '../install.ts';
import { savedLine } from './saved-line.ts';
import { lineKey, routeDoneLine, routeFromGpx, tripLineOf } from './model.ts';
import { lazy } from '../lazy.tsx';
import { reasonOf } from './services.ts';
import type { TripServices, TripSnapshot } from './services.ts';
import './trip.css';

type Found = { route: Route; hadHeights: boolean };

// Plan from A to B is its own chunk: Trip's first look is the bike, the route and Get ready.
const PlanAB = lazy(() => import('./plan.tsx').then((m) => m.PlanAB));
// The departure date, the nights and the trip details are a chunk too: they show only in the open Route step or Trip details, so
// the guided Trip adds nothing to the first screen (TRIP-GUIDED-FIRST).
const TripSettings = lazy(() => import('./settings.tsx').then((m) => m.TripSettings));
// Get ready offline's step body is one more: it opens with its step (its run is shared with Ahead's card, run.tsx).
const GetReady = lazy(() => import('./getready.tsx').then((m) => m.GetReady));
// The route's summary, with its profile and the stops on it, is its own chunk as well.
const RouteSummary = lazy(() => import('./summary.tsx').then((m) => m.RouteSummary));

/** `onAdded`: a route was added or replaced, with the message that goes on to the next step (owner's item 2). */
function AddRoute({ services, snap, reload, onAdded }: { services: TripServices; snap: TripSnapshot | null; reload: () => Promise<void>; onAdded: (said: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, setPending] = useState<Found | null>(null);
  const [round, setRound] = useState(0);
  const asking = useRef<HTMLHeadingElement>(null);
  const old = snap?.trip ?? null;
  useEffect(() => { if (pending) asking.current?.focus(); }, [pending]);

  const refused = (message: string): void => setError(old ? `${message} ${W.appTripUnchanged}` : message);

  const commit = async (found: Found): Promise<void> => {
    setBusy(true);
    setPending(null);
    try {
      const out = await services.addRoute(found, old?.route ?? null);
      setRound((n) => n + 1);
      if (out.kind === 'same') setSaid(W.appTripSameRoute);
      else onAdded(`${out.kind === 'added' ? W.appTripAdded(out.name) : out.dateNotSaved ? W.appTripReplacedNoDate(out.name) : W.appTripReplaced(out.name)} ${W.appTripNextGetReady}`);
      await reload();
    } catch (e) {
      refused(reasonOf(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    setError(null);
    setSaid(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > GPX_MAX_BYTES) throw new GpxError('too-large', W.routeGpxTooLarge);
      const found = await routeFromGpx(await file.text(), file.name, services.parseXml);
      // A file that cannot be used leaves an open question as it was; one that can replaces it.
      setPending(null);
      if (old && sameLine(old.route, found.route)) setSaid(W.appTripSameRoute);
      else if (old) setPending(found);
      else {
        setBusy(false);
        await commit(found);
      }
    } catch (e) {
      refused(e instanceof GpxError ? e.message : W.appTripFileFailed);
    } finally {
      setBusy(false);
      try { input.value = ''; } catch { /* a file input that won't be cleared */ }
    }
  };

  return (
    <section aria-label={old ? W.appTripReplaceHeading : W.appTripAddTitle}>
      <div data-add-route>
        <label class="btn btn-primary file-pick">
          {W.appTripPickGpx}
          {/* No accept list (owner's iPhone check, 6 Nov 2026): iOS turns it into its own file types, has none for .gpx and greys
              every GPX file out. Any file can be chosen; routeFromGpx refuses what is not a GPX, in words. */}
          <input type="file" onChange={(e) => void onFile(e.currentTarget)} />
        </label>
        <p class="muted">{W.appTripGpxHint}</p>
        {busy ? <p role="status">{W.appTripReading}</p> : null}
        {error ? <p class="notice" role="alert">{error}</p> : null}
        {said ? <p role="status">{said}</p> : null}
        {pending && old ? (
          <div class="notice" role="alertdialog" aria-labelledby="trip-replace-title" data-replace>
            <h3 id="trip-replace-title" tabIndex={-1} ref={asking}>{W.appTripReplaceTitle}</h3>
            <p>{W.appTripReplaceBody(old.route.name, pending.route.name, showKm(pending.route.lengthKm))}</p>
            <div class="row">
              <button type="button" class="btn btn-primary" onClick={() => void commit(pending)}>{W.appTripReplaceYes}</button>
              <button type="button" class="btn" onClick={() => setPending(null)}>{W.appTripReplaceCancel}</button>
            </div>
          </div>
        ) : null}
        <PlanAB key={round} services={services} onRoute={async (found) => { if (old) setPending(found); else await commit(found); }} />
      </div>
    </section>
  );
}

/** Contract 2: hands the route and the trip's settings to the bag planner, which asks before it changes anything. */
function PlanBags({ handOff }: { handOff: NonNullable<TripServices['handOff']> }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  return (
    <div class="trip-handoff" data-handoff>
      <button type="button" class="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setReason(null);
        const out = await handOff();
        setBusy(false);
        if (!out.ok) setReason(out.reason);
      }}>{W.appHandoffButton}</button>
      <p class="hint">{W.appHandoffNote}</p>
      {reason ? <p class="notice" role="status">{reason}</p> : null}
    </div>
  );
}

type StepName = 'route' | 'getready' | 'bags' | 'go';
type StepState = 'done' | 'next' | 'later';

/**
 * One of the four steps (guided Trip design §2.2). Open, it shows its body; folded, one line: done, its summary and Change (or
 * Update); otherwise what it will do, its title a button when it can be opened.
 */
function Step({ name, n, title, state, open, line, change, canOpen, onOpen, children, below }: {
  name: StepName; n: number; title: string; state: StepState; open: boolean; line: string | null; change?: string; canOpen: boolean;
  onOpen: () => void; children?: ComponentChildren; below?: ComponentChildren;
}) {
  const no = <span class="visually-hidden">{W.appTripStepNo(n)}</span>;
  const word = change ?? W.appTripStepChange;
  return (
    <li class={`trip-step trip-step-${state}`} data-step={name} data-state={state} data-open={open ? 'true' : undefined}>
      <span class="trip-dot" aria-hidden="true">{state === 'done' ? '✓' : n}</span>
      <div class="trip-step-body">
        <div class="trip-step-head">
          {open || state === 'done' || !canOpen
            ? <h2>{no}{title}</h2>
            : <h2>{no}<button type="button" class="trip-step-open" onClick={onOpen}>{title}</button></h2>}
          {!open && state === 'done' ? <button type="button" class="trip-step-change" aria-label={`${word}: ${title}`} onClick={onOpen}>{word}</button> : null}
        </div>
        {open ? children : line ? <p class={state === 'done' ? 'trip-step-line' : 'trip-step-line muted'}>{line}</p> : null}
        {below}
      </div>
    </li>
  );
}

const PACE_WORD = { steady: W.appTripPaceSteady, sporting: W.appTripPaceSporting, hard: W.appTripPaceHard } as const;
const STAY_WORD = { camping: W.appTripStayCamping, mixed: W.appTripStayMixed, accommodation: W.appTripStayAccommodation } as const;

/** The trip details, folded to one line under the Route step until Trip details opens them (design §2.2, owner's answer 6). */
function TripDetails({ services, snap, reload }: { services: TripServices; snap: TripSnapshot; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const s = snap.settings;
  return (
    <div class="trip-details" data-trip-details>
      <p class="trip-details-line">
        <span class="muted">{W.appTripDetailsLine(PACE_WORD[s.pace], String(s.flatKph), STAY_WORD[s.stay], s.startTime)}</span>
        <button type="button" class="trip-step-change" aria-expanded={open} onClick={() => setOpen(!open)}>{W.appTripDetails}</button>
      </p>
      {open ? <TripSettings services={services} snap={snap} reload={reload} part="details" /> : null}
    </div>
  );
}

export function TripScreen({ services }: { services: TripServices }) {
  const [snap, setSnap] = useState<TripSnapshot | null>(null);
  // The step the rider opened; null: the one the trip suggests.
  const [chosen, setChosen] = useState<StepName | null>(null);
  // The message after a route was added, which goes on to Get ready offline.
  const [added, setAdded] = useState<string | null>(null);
  const alive = useRef(true);
  const latest = useRef(0);
  const reload = useCallback(async (): Promise<void> => {
    // Only the newest read is shown: an older one that finishes late would put a value back that has just been changed.
    const mine = (latest.current += 1);
    const next = await services.load();
    if (!alive.current || mine !== latest.current) return;
    setSnap(next);
    if (next.available) noteTripFacts(next.trip !== null, next.prepared !== null);
    else noteTripFacts(null, null);
  }, [services]);
  useEffect(() => {
    alive.current = true;
    void reload();
    const stop = onChanged(() => void reload());
    return () => { alive.current = false; stop(); };
  }, [reload]);

  const bike = bikeSource.value;
  const offer = installOffer.value;
  const trip = snap?.trip ?? null;
  // Get ready offline is done once a run ended with every step through; one with a step missing stays the step to do.
  const readyDone = snap?.prepared ? snap.prepared.steps.every((x) => x.ok) : false;
  const suggested: StepName = snap?.running && trip ? 'go' : !trip ? 'route' : !readyDone ? 'getready' : 'bags';
  // Only Get ready offline and Bags need a route (design §2.2).
  const openStep: StepName = chosen !== null && (trip !== null || chosen === 'route' || chosen === 'go') ? chosen : suggested;
  const stateOf = (name: StepName, done: boolean): StepState => (done ? 'done' : name === suggested ? 'next' : 'later');
  const choose = (name: StepName) => () => setChosen(name);
  const line = snap ? tripLineOf(trip, localIsoDate(snap.now, snap.zone)) : null;
  return (
    <div class="trip" data-trip-loaded={snap ? 'true' : undefined}>
      {/* Two panes on a wide screen: the bike, the trip line and the steps; then the route's summary (design §2.2). */}
      <div class="trip-main">
        <div class="trip-bike">
          <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="trip" />
        </div>
        {line ? <p class="trip-line" data-trip-line><strong>{line.name}</strong>{line.when ? <span>{line.when}</span> : null}</p> : null}
        {/* The shell says it already when the browser refuses storage outright; once is enough. */}
        {snap && !snap.available && !degradedSignal.value.includes('storageBlocked') ? <p class="notice" role="status">{W.appStorageBlocked}</p> : null}
        <ol class="trip-steps-list" aria-label={W.appTripStepsLabel}>
          <Step
            name="route" n={1} title={W.appTripStepRoute} state={stateOf('route', trip !== null)} open={openStep === 'route'} canOpen onOpen={choose('route')}
            line={trip ? routeDoneLine(trip) : null} below={snap ? <TripDetails services={services} snap={snap} reload={reload} /> : null}
          >
            <AddRoute services={services} snap={snap} reload={reload} onAdded={(said) => { setAdded(said); setChosen(null); }} />
            {snap?.trip ? <TripSettings services={services} snap={snap} reload={reload} part="when" /> : null}
          </Step>
          <Step
            name="getready" n={2} title={W.appTripGetReadyTitle} state={stateOf('getready', readyDone)} open={openStep === 'getready'} canOpen={trip !== null}
            onOpen={choose('getready')} change={W.appTripUpdateButton} line={readyDone && snap ? savedLine(snap) : W.appTripGetReadyLater}
          >
            {snap?.trip ? (
              <GetReady
                key={lineKey(snap.trip.route)} services={services} snap={snap} reload={reload} lead={added}
                onRun={() => { setAdded(null); setChosen('getready'); }}
              />
            ) : null}
          </Step>
          <Step name="bags" n={3} title={W.appTripStepBags} state={stateOf('bags', false)} open={openStep === 'bags'} canOpen={trip !== null} onOpen={choose('bags')} line={W.appTripBagsLater}>
            <p>{W.appTripBagsLater}</p>
            {services.handOff ? <PlanBags handOff={services.handOff} /> : null}
            <p><a class="btn" href="/tools/bags/">{W.appTripOpenBagPlanner}</a></p>
          </Step>
          <Step name="go" n={4} title={W.appTripStepGo} state={stateOf('go', false)} open={openStep === 'go'} canOpen onOpen={choose('go')} line={W.appTripGoLater}>
            <p>{W.appTripFlightMode}</p>
            <p><a class="btn btn-primary" href="#/ahead">{W.appTripOpenAhead}</a></p>
          </Step>
        </ol>
        {offer ? <button type="button" class="btn" onClick={() => void promptInstall()}>{W.appTripInstall}</button> : null}
      </div>
      <div class="trip-side">
        {snap ? <RouteSummary snap={snap} stops={services.stops} /> : null}
      </div>
    </div>
  );
}

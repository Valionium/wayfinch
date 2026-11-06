// The Trip tab (spec section 3.3): the bike first, then adding a route, its summary, the trip's settings and Get ready offline.
// It renders what the engines and the store give and works out no answer of its own.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { GPX_MAX_BYTES, GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { onChanged } from '../../store/changed.ts';
import { sameLine } from '../../store/trip.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { degradedSignal, noteTripFacts } from '../degraded.ts';
import { installOffer, promptInstall } from '../install.ts';
import { GetReady } from './getready.tsx';
import { lineKey, routeFromGpx } from './model.ts';
import { lazy } from '../lazy.tsx';
import { reasonOf } from './services.ts';
import type { TripServices, TripSnapshot } from './services.ts';
import { TripSettings } from './settings.tsx';
import { RouteSummary } from './summary.tsx';
import './trip.css';

type Found = { route: Route; hadHeights: boolean };

// Plan from A to B is its own chunk: Trip's first look is the bike, the route and Get ready.
const PlanAB = lazy(() => import('./plan.tsx').then((m) => m.PlanAB));

function AddRoute({ services, snap, reload }: { services: TripServices; snap: TripSnapshot | null; reload: () => Promise<void> }) {
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
      setSaid(out.kind === 'same' ? W.appTripSameRoute : out.kind === 'added' ? W.appTripAdded(out.name) : out.dateNotSaved ? W.appTripReplacedNoDate(out.name) : W.appTripReplaced(out.name));
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
    <Card title={old ? W.appTripReplaceHeading : W.appTripAddTitle}>
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
    </Card>
  );
}

/** Contract 2: hands the route and the trip's settings to the bag planner, which asks before it changes anything. */
function PlanBags({ handOff }: { handOff: NonNullable<TripServices['handOff']> }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  return (
    <div class="trip-handoff" data-handoff>
      <button type="button" class="btn" disabled={busy} onClick={async () => {
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

export function TripScreen({ services }: { services: TripServices }) {
  const [snap, setSnap] = useState<TripSnapshot | null>(null);
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
  return (
    <div class="trip" data-trip-loaded={snap ? 'true' : undefined}>
      {/* Two panes on a wide screen: the bike, the route and its days; then the settings and Get ready (spec 3.8). */}
      <div class="trip-main">
        <div class="trip-bike">
          <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="trip" />
        </div>
        {/* The shell says it already when the browser refuses storage outright; once is enough. */}
        {snap && !snap.available && !degradedSignal.value.includes('storageBlocked') ? <p class="notice" role="status">{W.appStorageBlocked}</p> : null}
        <AddRoute services={services} snap={snap} reload={reload} />
        {snap ? <RouteSummary snap={snap} /> : null}
      </div>
      <div class="trip-side">
        {snap ? <TripSettings services={services} snap={snap} reload={reload} /> : null}
        {snap?.trip ? <GetReady key={lineKey(snap.trip.route)} services={services} snap={snap} reload={reload} /> : null}
        {snap?.trip && services.handOff ? <PlanBags handOff={services.handOff} /> : null}
        {offer ? <button type="button" class="btn" onClick={() => void promptInstall()}>{W.appTripInstall}</button> : null}
      </div>
    </div>
  );
}

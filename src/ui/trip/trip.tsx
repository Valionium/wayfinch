// The Trip tab (spec section 3.3): the bike first, then adding a route, its summary, the trip's settings and Get ready offline.
// It renders what the engines and the store give and works out no answer of its own.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { GPX_MAX_BYTES, GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { onChanged } from '../../store/changed.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { noteTripFacts } from '../degraded.ts';
import { installOffer, promptInstall } from '../install.ts';
import { GetReady } from './getready.tsx';
import { routeFromGpx } from './model.ts';
import { PlanAB } from './plan.tsx';
import { reasonOf } from './services.ts';
import type { TripServices, TripSnapshot } from './services.ts';
import { TripSettings } from './settings.tsx';
import { RouteSummary } from './summary.tsx';
import './trip.css';

type Found = { route: Route; hadHeights: boolean };

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
      const out = await services.addRoute(found);
      setRound((n) => n + 1);
      setSaid(out.kind === 'same' ? W.appTripSameRoute : out.kind === 'added' ? W.appTripAdded(out.name) : W.appTripReplaced(out.name));
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
    setPending(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > GPX_MAX_BYTES) throw new GpxError('too-large', W.routeGpxTooLarge);
      const found = await routeFromGpx(await file.text(), file.name, services.parseXml);
      if (old && old.route.hash === found.route.hash) setSaid(W.appTripSameRoute);
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
          <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(e) => void onFile(e.currentTarget)} />
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

export function TripScreen({ services }: { services: TripServices }) {
  const [snap, setSnap] = useState<TripSnapshot | null>(null);
  const alive = useRef(true);
  const reload = useCallback(async (): Promise<void> => {
    const next = await services.load();
    if (!alive.current) return;
    setSnap(next);
    noteTripFacts(next.trip !== null, next.prepared !== null);
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
      <div class="trip-bike">
        <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="trip" />
      </div>
      {snap && !snap.available ? <p class="notice" role="status">{W.appStorageBlocked}</p> : null}
      <AddRoute services={services} snap={snap} reload={reload} />
      {snap ? <RouteSummary snap={snap} /> : null}
      {snap ? <TripSettings services={services} snap={snap} reload={reload} /> : null}
      {snap?.trip ? <GetReady services={services} snap={snap} reload={reload} /> : null}
      {offer ? <button type="button" class="btn" onClick={() => void promptInstall()}>{W.appTripInstall}</button> : null}
    </div>
  );
}

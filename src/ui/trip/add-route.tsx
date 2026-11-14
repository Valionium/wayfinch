// Add a route on Trip (spec section 3.3): a GPX file (chosen, or dropped anywhere on Trip), or Plan from A to B; a second route asks
// before it replaces the first. A chunk of its own, shown in the open Route step.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GPX_MAX_BYTES, GpxError } from '../../core/route/gpx.ts';
import type { Route } from '../../core/types.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { TF } from '../../core/wording/en-trip-fields.ts';
import { sameLine } from '../../store/trip.ts';
import { lazy } from '../lazy.tsx';
import { routeFromGpx } from './read-gpx.ts';
import { reasonOf } from './services.ts';
import type { TripServices, TripSnapshot } from './services.ts';

type Found = { route: Route; hadHeights: boolean };

// Plan from A to B is its own chunk too: it loads with its form.
const PlanAB = lazy(() => import('./plan.tsx').then((m) => m.PlanAB));

/** `onAdded`: a route was added or replaced, with the message that goes on to the next step (owner's item 2). */
export function AddRoute({ services, snap, reload, onAdded, dropped, onDropTaken }: {
  services: TripServices; snap: TripSnapshot | null; reload: () => Promise<void>; onAdded: (said: string) => void;
  /** A file dropped anywhere on Trip (spec 3.8), read as if it had been chosen here, once: `onDropTaken` lets it go. */
  dropped: File | null; onDropTaken: () => void;
}) {
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
      if (out.kind === 'same') setSaid(TF.appTripSameRoute);
      else onAdded(`${out.kind === 'added' ? TF.appTripAdded(out.name) : out.dateNotSaved ? TF.appTripReplacedNoDate(out.name) : TF.appTripReplaced(out.name)} ${W.appTripNextGetReady}`);
      await reload();
    } catch (e) {
      refused(reasonOf(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (input: HTMLInputElement): Promise<void> => {
    await read(input.files?.[0]);
    try { input.value = ''; } catch { /* a file input that won't be cleared */ }
  };
  // Taken once: a replace cancelled now does not come back with the next Change.
  useEffect(() => { if (dropped) { onDropTaken(); void read(dropped); } }, [dropped]);

  const read = async (file: File | undefined): Promise<void> => {
    setError(null);
    setSaid(null);
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > GPX_MAX_BYTES) throw new GpxError('too-large', W.routeGpxTooLarge);
      const found = await routeFromGpx(await file.text(), file.name, services.parseXml);
      // A file that cannot be used leaves an open question as it was; one that can replaces it.
      setPending(null);
      if (old && sameLine(old.route, found.route)) setSaid(TF.appTripSameRoute);
      else if (old) setPending(found);
      else {
        setBusy(false);
        await commit(found);
      }
    } catch (e) {
      refused(e instanceof GpxError ? e.message : W.appTripFileFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={old ? TF.appTripReplaceHeading : TF.appTripAddTitle}>
      <p class="muted" data-choose-hint>{TR.appTripChooseHint}</p>
      <div data-add-route>
        <label class="btn btn-primary file-pick">
          {TF.appTripPickGpx}
          {/* No accept list (owner's iPhone check, 6 Nov 2026): iOS turns it into its own file types, has none for .gpx and greys
              every GPX file out. Any file can be chosen; routeFromGpx refuses what is not a GPX, in words. */}
          <input type="file" onChange={(e) => void onFile(e.currentTarget)} />
        </label>
        <p class="muted">{TR.appTripGpxHint}</p>
        {busy ? <p role="status">{TF.appTripReading}</p> : null}
        {error ? <p class="notice" role="alert">{error}</p> : null}
        {said ? <p role="status">{said}</p> : null}
        {pending && old ? (
          <div class="notice" role="alertdialog" aria-labelledby="trip-replace-title" data-replace>
            <h3 id="trip-replace-title" tabIndex={-1} ref={asking}>{W.appTripReplaceTitle}</h3>
            <p>{TF.appTripReplaceBody(old.route.name, pending.route.name, showKm(pending.route.lengthKm))}</p>
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

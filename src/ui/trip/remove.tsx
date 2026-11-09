// Remove this trip (owner's wish, 9 November 2026; next to Change in the Route step's done row, his correction the same day): with a trip only. A confirm step names what goes and
// what stays; Remove trip takes the route, the trip and all En route keeps for it off the phone (store/remove-trip.ts), and Trip and
// En route start over as on the very first open. A chunk of its own, with its words: the first screen carries none of it.
import { useEffect, useRef, useState } from 'preact/hooks';
import { RT } from '../../core/wording/en-remove.ts';
import { announceHere, RefusedError } from '../../store/changed.ts';
import { NotPutBackError, removeTrip } from '../../store/remove-trip.ts';
import { runningSignal } from './run-state.ts';
import type { TripSnapshot } from './services.ts';

/** Get ready offline under way on this page ends at its next step once the trip is gone (the store refuses its writes): at most `ms`. */
function runEnded(ms: number): Promise<void> {
  return new Promise((done) => {
    let stop: (() => void) | null = null;
    let ended = false;
    const end = (): void => {
      ended = true;
      clearTimeout(timer);
      stop?.();
      done();
    };
    const timer = setTimeout(end, ms);
    stop = runningSignal.subscribe((on) => { if (!on && stop) end(); });
    if (!ended && !runningSignal.peek()) end();
  });
}

const RUN_WAIT_MS = 10_000;
const SAID_MS = 10_000;

/**
 * Says it to a screen reader (review of PR 86, M6): from outside Trip's own markup, which is then that of a fresh start; gone
 * after a while.
 */
function say(text: string): void {
  const line = document.createElement('p');
  line.className = 'visually-hidden';
  line.setAttribute('role', 'status');
  document.body.append(line);
  // Put in after the live region is there, so it is read out.
  setTimeout(() => { line.textContent = text; }, 50);
  setTimeout(() => line.remove(), SAID_MS);
}

export function RemoveTrip({ snap, reload }: { snap: TripSnapshot; reload: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // The focus goes to the question when it opens, and back to the button when it is closed without removing.
  const back = useRef(false);
  useEffect(() => {
    if (asking) title.current?.focus();
    else if (back.current) {
      back.current = false;
      opener.current?.focus();
    }
  }, [asking]);
  const trip = snap.trip;
  if (!trip) return null;

  const keep = (): void => {
    if (busy) return;
    back.current = true;
    setAsking(false);
  };
  const confirm = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await removeTrip(trip.route);
    } catch (e) {
      setBusy(false);
      setFailed(e instanceof RefusedError ? e.message : e instanceof NotPutBackError ? RT.appTripRemoveNotPutBack : RT.appTripRemoveFailed);
      await reload();
      return;
    }
    // This window's other screens hear of it too: En route's position routine stops at once (review of PR 86, M3).
    announceHere('all');
    await runEnded(RUN_WAIT_MS);
    await reload();
    // This block goes with the trip: Trip's first step, open again as on the first day, takes the focus once Trip shows the fresh start.
    document.querySelector<HTMLElement>('[data-step="route"] h2')?.focus();
    say(RT.appTripRemoved);
  };

  return (
    <div class="trip-remove" data-remove-trip>
      {asking ? (
        <div
          class="notice" role="alertdialog" aria-labelledby="trip-remove-title" aria-describedby="trip-remove-goes trip-remove-stays" data-remove-ask
          onKeyDown={(e) => { if (e.key === 'Escape') keep(); }}
        >
          <h3 id="trip-remove-title" tabIndex={-1} ref={title}>{RT.appTripRemoveAsk}</h3>
          <p id="trip-remove-goes">{RT.appTripRemoveGoes(trip.route.name)}</p>
          <p id="trip-remove-stays">{RT.appTripRemoveStays}</p>
          <p>{RT.appTripRemoveAfter}</p>
          <div class="row">
            <button type="button" class="btn btn-primary" disabled={busy} aria-busy={busy ? 'true' : undefined} onClick={() => void confirm()}>{busy ? RT.appTripRemoving : RT.appTripRemoveYes}</button>
            <button type="button" class="btn" disabled={busy} onClick={keep}>{RT.appTripRemoveNo}</button>
          </div>
        </div>
      ) : <button type="button" class="btn" ref={opener} onClick={() => { setFailed(null); setAsking(true); }}>{RT.appTripRemove}</button>}
      {failed ? <p class="field-problem" role="alert">{failed}</p> : null}
    </div>
  );
}

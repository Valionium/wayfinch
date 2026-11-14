// Trip prep: "Before you leave" at the end of Trip's Prepare this route step (design of 15 November 2026), in that step's chunk, so the
// first screen carries none of it. The rider's own list: each item links where the app does it, and a tick stays on this phone for this
// route (store/prep-ticks.ts). Nothing here calls the trip ready, safe or complete, and nothing counts the ticks (Decision 2).
import { useState } from 'preact/hooks';
import { localIsoDate } from '../../core/answers/time.ts';
import { prepFacts, prepItems } from '../../core/prep/items.ts';
import type { PrepItem } from '../../core/prep/items.ts';
import type { Trip } from '../../core/types.ts';
import { PR } from '../../core/wording/en-prep.ts';
import { readTicks, setTick } from '../../store/prep-ticks.ts';
import { bikeSource } from '../bike/live.ts';
import type { TripSnapshot } from './services.ts';
import './prep.css';

type Ticks = { route: string; ticked: string[]; notKept: boolean };

/** What the list reads of Trip's snapshot: the trip, and the moment and zone that give today (as Trip's line reads it). */
type Snap = Pick<TripSnapshot, 'trip'> & Partial<Pick<TripSnapshot, 'now' | 'zone'>>;

/** The list for Trip's snapshot and Trip's bike (the bag planner's current one, as Trip draws it); nothing without a trip. */
export function BeforeYouGo({ snap }: { snap: Snap }) {
  const trip: Trip | null = snap.trip;
  const bike = bikeSource.value.bike;
  const route = trip?.route.id ?? '';
  const [state, setState] = useState<Ticks>(() => ({ route, ticked: readTicks(route), notKept: false }));
  // Another route: its own ticks, read afresh.
  const ticks = state.route === route ? state : { route, ticked: readTicks(route), notKept: false };
  if (!trip) return null;
  const items = prepItems(prepFacts(trip, bike, snap.now && snap.zone ? localIsoDate(snap.now, snap.zone) : undefined));
  // Bike care with Trip's bike chosen: tools/bike-link.ts's toolHref, written out so the chunk needs none of that module (a test holds it equal).
  const careHref = bike ? `#/tools/care?bike=${encodeURIComponent(bike.id)}` : '#/tools/care';

  const flip = (id: string, on: boolean): void => {
    const kept = setTick(route, id, on);
    // Refused: the tick shows for now, and the line says it is not kept.
    const shown = kept ?? (on ? [...ticks.ticked.filter((x) => x !== id), id] : ticks.ticked.filter((x) => x !== id));
    setState({ route, notKept: kept === null, ticked: shown });
  };

  // The repair kit opens Bike care at Roadside repairs, What to carry: a one-time mark Bike care reads as it opens (tools/care/ui.tsx).
  const toCarry = (): void => { try { sessionStorage.setItem('wf:careCarry', '1'); } catch { /* Bike care opens at its top */ } };
  const linkOf = (it: PrepItem) => (it.link === 'care'
    ? <a class="prep-link" href={careHref} aria-label={PR.prepInCareLabel(it.text)} onClick={it.id === 'kit' ? toCarry : undefined}>{PR.prepInCare}</a>
    : null);

  return (
    <section class="prep" aria-labelledby="prep-title" data-prep>
      <h3 id="prep-title">{PR.prepTitle}</h3>
      <p class="muted">{PR.prepIntro}</p>
      <ul class="prep-list">
        {items.map((it) => (
          <li key={it.id} data-prep-item={it.id}>
            <label class="choice-option prep-tick">
              <input type="checkbox" checked={ticks.ticked.includes(it.id)} onChange={(e) => flip(it.id, e.currentTarget.checked)} />
              <span>{it.text}</span>
            </label>
            {linkOf(it)}
          </li>
        ))}
      </ul>
      {ticks.notKept ? <p class="notice" role="status">{PR.prepNotKept}</p> : null}
    </section>
  );
}

/** Whether the list beside the folded step was shown last: kept while the page lives, so Back from Bike care finds it as it was. */
let besideShown = false;

/**
 * Once Prepare this route has run, its step folds to one row with Update (which only opens the step). Beside it, "Before you leave"
 * shows the list below the row and hides it again (the sweep of 15 November 2026, finding 1); the step stays folded.
 */
export function PrepBeside({ snap }: { snap: Snap }) {
  const [shown, setShown] = useState(besideShown);
  if (!snap.trip) return null;
  const flip = (): void => { besideShown = !shown; setShown(besideShown); };
  return (
    <div class="prep-beside">
      <button type="button" class="trip-step-change" aria-expanded={shown} aria-controls="prep-beside-list" onClick={flip}>{PR.prepTitle}</button>
      {shown ? <div id="prep-beside-list" class="prep-beside-list"><BeforeYouGo snap={snap} /></div> : null}
    </div>
  );
}

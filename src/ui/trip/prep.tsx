// Trip prep: "Before you leave" in Trip's Go step (design of 15 November 2026). A chunk of its own, opened with the step. The rider's own
// list: each item links where the app does it, and a tick stays on this phone for this route (store/prep-ticks.ts). Nothing here calls
// the trip ready, safe or complete, and nothing counts the ticks (Decision 2).
import { useState } from 'preact/hooks';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { prepFacts, prepItems } from '../../core/prep/items.ts';
import type { PrepItem } from '../../core/prep/items.ts';
import type { Trip } from '../../core/types.ts';
import { PR } from '../../core/wording/en-prep.ts';
import { readTicks, setTick } from '../../store/prep-ticks.ts';
import { toolHref } from '../tools/bike-link.ts';
import './prep.css';

type Ticks = { route: string; ticked: string[]; notKept: boolean };

/** `prepared`: Prepare this route has ended once for this route; `openPrepare` opens that step. */
export function BeforeYouGo({ trip, bike, prepared, openPrepare }: { trip: Trip; bike: BikeRecord | null; prepared: boolean; openPrepare: () => void }) {
  const route = trip.route.id;
  const [state, setState] = useState<Ticks>(() => ({ route, ticked: readTicks(route), notKept: false }));
  // Another route: its own ticks, read afresh.
  const ticks = state.route === route ? state : { route, ticked: readTicks(route), notKept: false };
  const items = prepItems(prepFacts(trip, bike, prepared));
  const careHref = bike ? toolHref('tools/care', bike.id) : '#/tools/care';

  const flip = (id: string, on: boolean): void => {
    const kept = setTick(route, id, on);
    // Refused: the tick shows for now, and the line says it is not kept.
    const shown = kept ?? (on ? [...ticks.ticked.filter((x) => x !== id), id] : ticks.ticked.filter((x) => x !== id));
    setState({ route, ticked: shown, notKept: kept === null });
  };

  const linkOf = (it: PrepItem) => {
    if (it.link === 'care') return <a class="prep-link" href={careHref} aria-label={PR.prepInCareLabel(it.text)}>{PR.prepInCare}</a>;
    if (it.link === 'prepare') return <button type="button" class="btn prep-link" onClick={openPrepare}>{PR.prepOpenPrepare}</button>;
    if (it.link === 'ahead') return <a class="prep-link" href="#/ahead">{PR.prepOpenShare}</a>;
    return null;
  };

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

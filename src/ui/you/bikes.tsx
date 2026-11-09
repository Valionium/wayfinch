// Your bikes (spec sections 3.5 and 3.7): the bag planner owns the library, so this lists and links and writes nothing. The bike of
// the current plan comes first, marked; each has a small drawing without bags.
import { useEffect } from 'preact/hooks';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { CL } from '../../core/wording/en-care-link.ts';
import { Y } from '../../core/wording/en-you.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { noteSeen } from '../bike/hint-seen.ts';
import { bikeDetailsHref } from '../bike/link.ts';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { toolHref } from '../tools/bike-link.ts';

export type BikeRow = { bike: BikeRecord; mark: string | null };

/** The plan's bike first (marked), then the library in its own order. A plan bike that is not in the library is "not saved". */
export function bikeRows(plan: BikeRecord | null, library: BikeRecord[]): BikeRow[] {
  const rows: BikeRow[] = [];
  if (plan) {
    const saved = library.some((b) => b.id === plan.id);
    rows.push({ bike: plan, mark: saved ? Y.youBikeInPlan : Y.youBikeInPlanNotSaved });
  }
  for (const bike of library) if (bike.id !== plan?.id) rows.push({ bike, mark: null });
  return rows;
}

/** The mark a link into the bag planner leaves on this place in the history: the way back lands at the bikes (owner's try-out, 5 Nov 2026). */
export const AT_BIKES = 'bikes';
function markBikes(event: MouseEvent): void {
  if (!(event.target as Element | null)?.closest?.('a[href^="/tools/bags/"]')) return;
  try {
    history.replaceState({ ...(history.state as object | null), wfAt: AT_BIKES }, '');
  } catch {
    // No history to mark: the way back opens You at the top.
  }
}

export function BikesCards() {
  const source = bikeSource.value;
  const rows = bikeRows(source.bike, source.bikes);
  // A place seen, for the first-run bike hint (wish 17).
  useEffect(() => noteSeen('y'), []);
  return (
    <>
      <Card title={Y.youBikesTitle}>
        <div data-bikes onClick={markBikes}>
          {/* No bike yet: the small grey typical bike beside what adding one changes (wish 17). */}
          {rows.length === 0 ? (
            <div class="you-bike you-bike-none">
              <BikeDrawing bike={null} summary={null} size="small" back="you" caption={false} />
              <p class="muted">{Y.youBikesNone}</p>
            </div>
          ) : (
            <ul class="you-bikes">
              {rows.map(({ bike, mark }) => (
                <li key={bike.id} class="you-bike">
                  <BikeDrawing bike={bike} summary={null} size="small" back="you" caption={false} known={source.known} />
                  <div class="you-bike-text">
                    <strong>{bike.name || Y.youBikeUnnamed}</strong>
                    {mark ? <span class="you-bike-mark">{mark}</span> : null}
                    <a class="btn" href={bikeDetailsHref(bike.id, 'you')}>{Y.youBikeEdit}<span class="visually-hidden"> {bike.name || Y.youBikeUnnamed}</span></a>
                    <a class="btn" href={toolHref('tools/care', bike.id)}>{CL.careForBike}<span class="visually-hidden"> {bike.name || Y.youBikeUnnamed}</span></a>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <a class="btn btn-primary" href={bikeDetailsHref('new', 'you')}>{Y.youBikeAdd}</a>
        </div>
      </Card>
      <Card title={Y.youTyreTitle}>
        <p>{Y.youTyreBody}</p>
        <a class="btn" href="#/tools/tyre">{Y.youTyreOpen}</a>
      </Card>
    </>
  );
}

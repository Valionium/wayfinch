// Your bikes (spec sections 3.5 and 3.7): the bag planner owns the library, so this lists and links and writes nothing. The bike of
// the current plan comes first, marked; each has a small drawing without bags.
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { Y } from '../../core/wording/en-you.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeDetailsHref } from '../bike/link.ts';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';

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

export function BikesCards() {
  const source = bikeSource.value;
  const rows = bikeRows(source.bike, source.bikes);
  return (
    <>
      <Card title={Y.youBikesTitle}>
        <div data-bikes>
          {rows.length === 0 ? <p class="muted">{Y.youBikesNone}</p> : (
            <ul class="you-bikes">
              {rows.map(({ bike, mark }) => (
                <li key={bike.id} class="you-bike">
                  <BikeDrawing bike={bike} summary={null} size="small" back="you" caption={false} known={source.known} />
                  <div class="you-bike-text">
                    <strong>{bike.name || Y.youBikeUnnamed}</strong>
                    {mark ? <span class="you-bike-mark">{mark}</span> : null}
                    <a class="btn" href={bikeDetailsHref(bike.id, 'you')}>{Y.youBikeEdit}<span class="visually-hidden"> {bike.name || Y.youBikeUnnamed}</span></a>
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

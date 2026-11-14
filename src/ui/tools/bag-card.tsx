// The Bag planner card of Tools: the bike drawing and the plan line. It is in the first screen, shown while the rest of Tools loads, so the
// bike is drawn when the browser reveals the page and glides back from the bag planner (LC-GLIDE); the full Tools screen (a chunk of
// its own, tools.tsx) shows the same card. Reads only; the bag planner's own storage is never written.
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { W } from '../../core/wording/en.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { savedDay } from '../saved-day.ts';

/**
 * `chosen` is the bike the rider chose in Tools' bike line, which the full Tools screen works out (its chunk carries the choice): the
 * card draws it at once, though the plan moves to it only when the bag planner next opens, with its Undo line (owner, 7 Nov 2026).
 * Its bags are the plan's, on the plan's bike: a summary naming another bike draws none. Without it, the plan's bike; null is "Without a
 * bike", the grey standard bike, with `note` saying so (owner, 7 Nov 2026).
 */
export function BagCard({ services, chosen, note }: { services: TyreServices; chosen?: BikeRecord | null | undefined; note?: string | undefined }) {
  const sum = services.host().summary;
  const saved = sum ? savedDay(sum.at) : null;
  const bike = bikeSource.value;
  return (
    <Card title={W.tyreBagCardTitle}>
      <BikeDrawing bike={chosen === undefined ? bike.bike : chosen} summary={bike.summary} known={bike.known} back="tools" caption={false} />
      {note ? <p class="muted tools-no-bike">{note}</p> : null}
      <p class="tool-line">{sum ? W.tyreBagCardLine(sum.bagCount, String(Number(sum.carriedKg.toFixed(1)))) : W.tyreBagCardNone}</p>
      {saved ? <p class="muted">{W.tyreBagCardAge(saved)}</p> : null}
      <a class="btn btn-primary" href="/tools/bags/">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreBagCardTitle}</span></a>
    </Card>
  );
}

/** [the bike the full Tools screen drew, the plan's bike beside it], in this tab: written by tools.tsx, read while its chunk loads. */
export const DRAWN_KEY = 'wf:toolsBike';
/**
 * The bike the full screen drew last in this tab, while the plan is still the one it was drawn beside: the bike glides back from the bag
 * planner onto it, with no plan's bike first (re-check of PR 65, R3). Anything else (none, broken, a bike gone, the plan moved): undefined.
 */
function drawnLast(): BikeRecord | null | undefined {
  try {
    const [id, plan] = JSON.parse(sessionStorage.getItem(DRAWN_KEY) ?? '0') as [string | null, string | null];
    const b = bikeSource.value;
    if (plan === (b.bike?.id ?? null)) return id === null ? null : b.bikes.find((x) => x.id === id);
  } catch { /* the plan's bike */ }
  return undefined;
}

/** Tools while its chunk loads: the bag card, and room for the bike line (a saved bike's, or with no bike at all the typical bike's, wish 17), so nothing moves when it arrives. */
export function ToolsFirst({ services }: { services: TyreServices }) {
  return (
    <>
      {bikeSource.value.bikes.length > 0 || !bikeSource.value.bike ? <p class="bike-line" aria-hidden="true" /> : null}
      <BagCard services={services} chosen={drawnLast()} />
    </>
  );
}

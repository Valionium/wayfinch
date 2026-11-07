// The Bag planner card of Tools: the bike drawing and the plan line. It is in the first screen, shown while the rest of Tools loads, so the
// bike is drawn when the browser reveals the page and glides back from the bag planner (LC-GLIDE); the full Tools screen (a chunk of
// its own, tools.tsx) shows the same card. Reads only; the bag planner's own storage is never written.
import { W, shortMapDate } from '../../core/wording/en.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';

export function BagCard({ services }: { services: TyreServices }) {
  const sum = services.host().summary;
  const saved = sum ? shortMapDate(sum.at) : null;
  const bike = bikeSource.value;
  return (
    <Card title={W.tyreBagCardTitle}>
      <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="tools" caption={false} />
      <p class="tool-line">{sum ? W.tyreBagCardLine(sum.bagCount, String(Number(sum.carriedKg.toFixed(1)))) : W.tyreBagCardNone}</p>
      {saved ? <p class="muted">{W.tyreBagCardAge(saved)}</p> : null}
      <a class="btn btn-primary" href="/tools/bags/">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreBagCardTitle}</span></a>
    </Card>
  );
}

/** Tools while its chunk loads: the bag card, and room for the bike line when the rider has a saved bike, so nothing moves when it arrives. */
export function ToolsFirst({ services }: { services: TyreServices }) {
  return (
    <>
      {bikeSource.value.bikes.length > 0 ? <p class="bike-line" aria-hidden="true" /> : null}
      <BagCard services={services} />
    </>
  );
}

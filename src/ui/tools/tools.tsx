// The Tools tab (spec section 3.4): the bag planner, with the rider's bike and its bags (section 3.7), and the tyre calculator, each
// with its last result. It reads Load Check's summary and bikes and the tyre tool's own storage, and writes nothing.
import { W, shortMapDate } from '../../core/wording/en.ts';
import { DEFAULT_KEY, readStore } from '../../tools/tyre/storage.ts';
import type { LastResult } from '../../tools/tyre/storage.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { bikeSource } from '../bike/live.ts';
import { Card } from '../card.tsx';
import { toolBike, savedBikeIds } from '../../tools/tyre/choice.ts';
import { BikeLine } from './bike-line.tsx';
import { choiceVersion } from './bike-choice.ts';

const trimBar = (n: number): string => String(Number(n.toFixed(2)));

export function ToolsScreen({ services }: { services: TyreServices }) {
  const host = services.host();
  const read = readStore(services.storage);
  const entries = read.ok ? Object.entries(read.store.entries).flatMap(([key, e]) => (e.last ? [{ key, last: e.last }] : [])) : [];
  // The plan's bike first (the tool opens on it); otherwise the newest. The bike's name is on the card, so it never passes for another's.
  // The bike the rider chose, once they have: its result alone (or none), never another bike's. Before a choice, as it was.
  void choiceVersion.value;
  const chosen = toolBike(services.storage, host, savedBikeIds(services.storage));
  const before = (host.planBikeId ? entries.find((e) => e.key === host.planBikeId) : undefined) ?? entries.sort((x, y) => y.last.at.localeCompare(x.last.at))[0];
  const pick = chosen.picked ? entries.find((e) => e.key === (chosen.id ?? DEFAULT_KEY)) : before;
  const last: LastResult | null = pick?.last ?? null;
  const sum = host.summary;
  const saved = sum ? shortMapDate(sum.at) : null;
  const bike = bikeSource.value;
  return (
    <>
      <BikeLine services={services} />
      <Card title={W.tyreBagCardTitle}>
        <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="tools" caption={false} />
        <p class="tool-line">{sum ? W.tyreBagCardLine(sum.bagCount, String(Number(sum.carriedKg.toFixed(1)))) : W.tyreBagCardNone}</p>
        {saved ? <p class="muted">{W.tyreBagCardAge(saved)}</p> : null}
        <a class="btn btn-primary" href="/tools/bags/">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreBagCardTitle}</span></a>
      </Card>
      <Card title={W.tyreCardTitle}>
        <p class="tool-line">{last ? W.tyreCardLast(trimBar(last.frontBar), trimBar(last.rearBar)) : W.tyreCardNone}</p>
        {last?.bike ? <p class="muted">{W.tyreCardBike(last.bike)}</p> : null}
        <a class="btn btn-primary" href="#/tools/tyre">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreCardTitle}</span></a>
      </Card>
    </>
  );
}

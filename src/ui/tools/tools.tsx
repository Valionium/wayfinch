// The Tools tab (spec section 3.4): the bag planner and the tyre calculator, each with its last result. It reads Load Check's summary
// and the tyre tool's own storage, and writes nothing.
import { W, shortMapDate } from '../../core/wording/en.ts';
import { readStore } from '../../tools/tyre/storage.ts';
import type { TyreServices } from '../../tools/tyre/ui.tsx';
import { Card } from '../card.tsx';

const trimBar = (n: number): string => String(Number(n.toFixed(2)));

export function ToolsScreen({ services }: { services: TyreServices }) {
  const host = services.host();
  const read = readStore(services.storage);
  const lasts = read.ok ? Object.values(read.store.entries).flatMap((e) => (e.last ? [e.last] : [])) : [];
  const last = lasts.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const sum = host.summary;
  const saved = sum ? shortMapDate(sum.at) : null;
  return (
    <>
      <Card title={W.tyreBagCardTitle}>
        <p class="tool-line">{sum ? W.tyreBagCardLine(sum.bagCount, String(Number(sum.carriedKg.toFixed(1)))) : W.tyreBagCardNone}</p>
        {saved ? <p class="muted">{W.tyreBagCardAge(saved)}</p> : null}
        <a class="btn btn-primary" href="/tools/bags/">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreBagCardTitle}</span></a>
      </Card>
      <Card title={W.tyreCardTitle}>
        <p class="tool-line">{last ? W.tyreCardLast(trimBar(last.frontBar), trimBar(last.rearBar)) : W.tyreCardNone}</p>
        <a class="btn btn-primary" href="#/tools/tyre">{W.tyreCardOpen}<span class="visually-hidden"> {W.tyreCardTitle}</span></a>
      </Card>
    </>
  );
}

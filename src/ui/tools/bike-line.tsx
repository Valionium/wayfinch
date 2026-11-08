// "Bike: <name>" at the top of Tools (sub-project 11): the one bike every tool starts with. Only saved bikes are offered, as in the
// tyre tool (a removed bike is never chosen). With at least one saved bike, always a labelled select with each saved bike (the
// plan's marked) and No bike, so a lone bike can still be set aside. A change is Wayfinch's own record (bike-choice.ts), which the tyre tool and Bike care read too.
import { T } from '../../core/wording/en-tyre.ts';
import { W } from '../../core/wording/en.ts';
import { savedBikeIds, toolBike } from '../../tools/tyre/choice.ts';
import type { TyreServices } from '../../tools/tyre/services.ts';
import { choiceVersion, noteBikeChoice } from './bike-choice.ts';

const NONE = 'default';

// `tick` changes when the bikes or the plan were read again, so the line (which reads a signal, and so skips a redraw for equal props) follows.
export function BikeLine({ services }: { services: TyreServices; tick?: number }) {
  // Reading the version here redraws the line when the choice changes in another window or the tyre tool.
  void choiceVersion.value;
  const host = services.host();
  const saved = savedBikeIds(services.storage);
  const bikes = host.bikes.filter((b) => saved.includes(b.id));
  if (bikes.length === 0) return null;
  const { id } = toolBike(services.storage, host, saved);
  const current = bikes.find((b) => b.id === id);
  return (
    <p class="bike-line">
      <label for="tools-bike">
        <span class="tyre-label">{W.tyreBikeLabel}</span>{' '}
        <select id="tools-bike" value={current ? current.id : NONE} onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; noteBikeChoice(v === NONE ? null : v, services.now(), services.storage); }}>
          {bikes.map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === host.planBikeId ? W.tyreBikeInPlan : ''}</option>)}
          <option value={NONE}>{T.tyreBikeWithout}</option>
        </select>
      </label>
    </p>
  );
}

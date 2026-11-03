// "How much water do you have?" (spec section 3.2): quick choices and a custom amount, and the one-tap confirm of "Still about
// 0.6 L?". A confirmed value is the Water card's input; until then the card reads unknown, as the engine says.
import { useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import type { AheadActions } from './actions.ts';

export const QUICK_LITRES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;

export function WaterQuestion({ stillAboutL, actions }: { stillAboutL: number | null; actions: AheadActions }) {
  const [custom, setCustom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async (litres: number): Promise<void> => setProblem(await actions.confirmWater(litres));
  const fromCustom = (): void => {
    const litres = Number(custom.replace(',', '.'));
    if (custom.trim() === '' || !Number.isFinite(litres)) setProblem(W.appStoreWaterRange);
    else void confirm(litres);
  };
  return (
    <div class="ah-water" data-water-question>
      {stillAboutL !== null ? (
        <p>
          <button type="button" class="btn btn-primary" onClick={() => void confirm(stillAboutL)}>{W.appAheadWaterYes(String(stillAboutL))}</button>
        </p>
      ) : null}
      <fieldset class="field">
        <legend>{W.appAheadWaterQuestion}</legend>
        <div class="row">
          {QUICK_LITRES.map((l) => (
            <button key={l} type="button" class="btn" onClick={() => void confirm(l)}>{W.appAheadWaterLitres(String(l))}</button>
          ))}
        </div>
        <div class="row ah-water-custom">
          <label>
            <span>{W.appAheadWaterCustom}</span>
            <input type="number" inputMode="decimal" min={0} max={20} step={0.05} value={custom} onInput={(e) => setCustom(e.currentTarget.value)} />
          </label>
          <button type="button" class="btn" onClick={fromCustom}>{W.appAheadWaterSet}</button>
        </div>
      </fieldset>
      {problem ? <p class="field-problem" role="alert">{problem}</p> : null}
    </div>
  );
}

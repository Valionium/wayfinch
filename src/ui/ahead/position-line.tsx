// The position line (spec section 3.2): "km 80 of 165 · near Rheinstetten · ±12 m · 14:20", with Share progress at its end once
// there is a position; Update position, prominent; and the manual picker by strip, kilometre or town, always there (section 9.2).
// A position is asked for only on a tap.
import { useEffect, useRef, useState } from 'preact/hooks';
import { showKm, W } from '../../core/wording/en.ts';
import type { AheadActions, AheadTrip, Town } from './actions.ts';

export function PositionLine({ v, onShare }: { v: AheadTrip; onShare: () => void }) {
  const line = v.screen.positionLine;
  if (line === null) return null;
  return (
    <p class="ah-position" data-position-line>
      <span>{line}</span>
      {v.screen.shareText !== null ? <> <button type="button" class="btn" onClick={onShare}>{W.appAheadShare}</button></> : null}
    </p>
  );
}

/** Whether the rider has started on the open picker: then nothing but the rider changes or closes it. */
export type PickerUse = { current: boolean };

export function PositionControls({ v, actions, pickerOpen, onPicker, pickerUse, onPickerUsed, rail = false }: {
  v: AheadTrip; actions: AheadActions; pickerOpen: boolean; onPicker: (open: boolean) => void; pickerUse: PickerUse; onPickerUsed: () => void; rail?: boolean;
}) {
  const state = v.position;
  const watching = state.kind === 'watching';
  return (
    <div class="ah-position-controls">
      <div class="row">
        <button type="button" class="btn btn-primary" data-update-position onClick={() => void actions.updatePosition()} aria-busy={watching ? 'true' : undefined}>
          {W.appAheadUpdatePosition}
        </button>
        <button type="button" class="btn" aria-expanded={pickerOpen} aria-controls="ah-picker" onClick={() => onPicker(!pickerOpen)}>{W.appAheadManualToggle}</button>
      </div>
      {rail ? <p class="muted ah-computer" data-computer-position>{W.appWideComputerApprox}</p> : null}
      <div role="status" aria-live="polite">
        {watching ? <p>{W.appAheadFinding}</p> : null}
        {state.kind === 'said' ? <p class="notice">{state.text}</p> : null}
      </div>
      {state.kind === 'ask' ? (
        <div class="notice" role="group" aria-label={state.question}>
          <p>{state.question}</p>
          <div class="row">
            {state.options.map((o) => <button key={o.km} type="button" class="btn" onClick={() => void actions.choosePass(o.km)}>{o.text}</button>)}
          </div>
        </div>
      ) : null}
      {v.approximateHelp ? <p class="notice">{W.appAheadApproxHelp}</p> : null}
      {pickerOpen ? <ManualPicker lengthKm={v.lengthKm} towns={v.towns} actions={actions} start={v.screen.ride.startKm} use={pickerUse} onUsed={onPickerUsed} /> : null}
    </div>
  );
}

const oneDecimal = (km: number): number => Math.round(km * 10) / 10;

const startText = (start: number): string => String(oneDecimal(Number.isFinite(start) ? start : 0));

function ManualPicker({ lengthKm, towns, actions, start, use, onUsed }: { lengthKm: number; towns: Town[]; actions: AheadActions; start: number; use: PickerUse; onUsed: () => void }) {
  const [km, setKm] = useState(startText(start));
  const [town, setTown] = useState('');
  // A picker left open (on a computer it always is) starts again from a new position, not the old one, but only while the rider
  // has not started on it: a fix or a re-read never replaces what they typed or picked. Not on the first paint either.
  const seen = useRef(start);
  useEffect(() => {
    if (Object.is(seen.current, start)) return;
    seen.current = start;
    if (use.current) return;
    setKm(startText(start));
    setTown('');
  }, [start]);
  const using = (): void => { use.current = true; };
  const length = showKm(lengthKm);
  const value = Number(km.replace(',', '.'));
  const usable = km.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= lengthKm;
  return (
    <fieldset class="field ah-picker" id="ah-picker">
      <legend>{W.appAheadManualTitle}</legend>
      <div class="ah-picker-fields">
        <label class="ah-field">
          <span>{W.appAheadManualStrip}</span>
          <input
            type="range" min={0} max={lengthKm} step={0.1} value={usable ? value : 0} aria-valuetext={W.appAheadManualStripValue(showKm(usable ? value : 0), length)}
            onFocus={using} onInput={(e) => { using(); setKm(e.currentTarget.value); setTown(''); }}
          />
        </label>
        <label class="ah-field">
          <span>{W.appAheadManualKm}</span>
          <input type="number" inputMode="decimal" min={0} max={lengthKm} step={0.1} value={km} onFocus={using} onInput={(e) => { using(); setKm(e.currentTarget.value); setTown(''); }} />
        </label>
        {!usable ? <p class="field-problem">{W.appAheadManualBadKm(length)}</p> : null}
        <label class="ah-field">
          <span>{W.appAheadManualTown}</span>
          {towns.length > 0 ? (
            <select value={town} onFocus={using} onChange={(e) => { using(); const i = e.currentTarget.value; setTown(i); const t = towns[Number(i)]; if (t) setKm(String(oneDecimal(t.km))); }}>
              <option value="">{W.appAheadManualTownPick}</option>
              {towns.map((t, i) => <option key={i} value={String(i)}>{W.appAheadManualTownOption(t.name, showKm(t.km))}</option>)}
            </select>
          ) : <span class="muted">{W.appAheadManualNoTowns}</span>}
        </label>
      </div>
      <button
        type="button" class="btn btn-primary" disabled={!usable}
        onClick={async () => {
          const t = towns[Number(town)];
          // Used: the picker may follow the position it sets. Refused: the rider's typing stays theirs, beside the reason.
          use.current = false;
          if (await actions.setManual(town !== '' && t ? t : value)) onUsed();
          else use.current = true;
        }}
      >{W.appAheadManualSet}</button>
    </fieldset>
  );
}

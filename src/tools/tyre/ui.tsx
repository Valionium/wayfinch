// The tyre screen (spec section 7.2): inputs on top of a figure that is recomputed on every change. It renders what `resolve` and
// `tyreEstimate` give and computes no pressure itself. It reads Load Check's records and never writes them.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { W, shortMapDate } from '../../core/wording/en.ts';
import { Card, Notice } from '../../ui/card.tsx';
import { checkLimit, tyreEstimate } from './core.ts';
import type { Bars, Casing, Limit, RimType, Setup, Surface, Unit, Wheel } from './core.ts';
import { readHost } from './host.ts';
import type { HostData } from './host.ts';
import { resolve } from './model.ts';
import type { Context, Details, FieldName, Source } from './model.ts';
import { DEFAULT_KEY, entryOf, readStore, saveEntry } from './storage.ts';
import type { KeyValueStore, LastResult } from './storage.ts';
import { SRAM_URL, sramList } from './sram.ts';
import { WHEELS } from './tables.ts';

export interface TyreServices {
  /** Load Check's records and You, read-only. */
  host: () => HostData;
  /** The tyre tool's own storage. */
  storage: KeyValueStore;
  now: () => Date;
}

export function browserServices(riderKg: () => number | null = () => null): TyreServices {
  const kv: KeyValueStore = {
    getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    setItem: (k, v) => localStorage.setItem(k, v),
  };
  return { host: () => readHost(kv, riderKg), storage: kv, now: () => new Date() };
}

const ASSUMED_WORDS: Record<FieldName, string> = {
  riderKg: W.tyreAssumedRider, bikeKg: W.tyreAssumedBike, bars: W.tyreAssumedBars, wheelBsdMm: W.tyreAssumedWheel, frontMm: W.tyreAssumedFront,
  rearMm: W.tyreAssumedRear, casing: W.tyreAssumedCasing, setup: W.tyreAssumedSetup, rimType: W.tyreAssumedRimType, rimInnerMm: W.tyreAssumedRim,
  surface: W.tyreAssumedSurface, carriedKg: '',
};

const parseNumber = (text: string, signed = false): number | null => {
  const t = text.trim().replace(',', '.');
  if (t === '' || !(signed ? /^-?(\d*\.?\d+|\d+\.)$/ : /^(\d*\.?\d+|\d+\.)$/).test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const bar2 = (n: number): string => n.toFixed(2);

// ---- small pieces --------------------------------------------------------------------------------------------------------------

function SourceLine({ source, plan }: { source: Source; plan?: string }) {
  if (source === 'bike') return <>{W.tyreFromBike}</>;
  if (source === 'plan') return <>{plan ?? ''}</>;
  if (source === 'you') return <>{W.tyreFromYou}</>;
  return null;
}

/** A field that starts from somewhere else shows its value, where it came from, and Change; once changed it is an ordinary field. */
function Field({ label, source, plan, valueText, editor, onReset, id }: {
  label: string; source: Source; plan?: string; valueText: string; editor: ComponentChildren; onReset?: () => void; id: string;
}) {
  const [editing, setEditing] = useState(false);
  const fromElsewhere = source === 'bike' || source === 'plan' || source === 'you';
  return (
    <div class="tyre-field" data-source={source}>
      {fromElsewhere && !editing ? (
        <div class="tyre-from">
          <span class="tyre-label" id={`${id}-label`}>{label}</span>
          <span class="tyre-value">{valueText}</span>
          <span class="muted"><SourceLine source={source} plan={plan} /> · </span>
          <button type="button" class="btn" onClick={() => setEditing(true)} aria-describedby={`${id}-label`}>{W.tyreChange}</button>
        </div>
      ) : (
        <>
          {editor}
          {source === 'entered' && onReset ? <button type="button" class="btn" onClick={() => { onReset(); setEditing(false); }}>{W.tyreBackToBike}</button> : null}
        </>
      )}
    </div>
  );
}

function NumberInput({ id, label, value, onCommit, unit, placeholder, signed = false }: { id: string; label: string; value: number | undefined; onCommit: (n: number | undefined) => void; unit?: string; placeholder?: number; signed?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // The value changed from outside (another bike chosen, or reset): follow it, unless it is what was just typed.
    setText((t) => (parseNumber(t, signed) === (value ?? null) ? t : value === undefined ? '' : String(value)));
    setBad(false);
  }, [value]);
  return (
    <label class="tyre-input" for={id}>
      <span class="tyre-label">{label}</span>
      <input
        id={id} type="text" inputMode="decimal" autoComplete="off" value={text} placeholder={placeholder === undefined ? undefined : String(placeholder)}
        aria-invalid={bad ? 'true' : undefined}
        aria-describedby={bad ? `${id}-err` : undefined}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value;
          setText(t);
          const n = parseNumber(t, signed);
          setBad(t.trim() !== '' && n === null);
          if (t.trim() === '') onCommit(undefined);
          else if (n !== null) onCommit(n);
        }}
      />
      {unit ? <span class="muted">{unit}</span> : null}
      {bad ? <span class="tyre-error" id={`${id}-err`} role="alert">{W.tyreNotANumber}</span> : null}
    </label>
  );
}

function Choice<T extends string>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset class="tyre-choice">
      <legend class="tyre-label">{label}</legend>
      <div class="tyre-options">
        {options.map((o) => (
          <label key={o.value} class="tyre-option">
            <input type="radio" name={id} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A pressure limit: the number, its unit, and the "Did you mean 65 psi?" question. Anything not accepted clears the limit, so no figure shows. */
function LimitInput({ id, label, required, value, min, onCommit, resetKey }: {
  id: string; label: string; required: boolean; value: Limit | null | undefined; min?: Limit | null; onCommit: (l: Limit | null) => void; resetKey: string;
}) {
  const [text, setText] = useState(value ? String(value.value) : '');
  const [unit, setUnit] = useState<Unit>(value?.unit ?? 'bar');
  const [note, setNote] = useState<{ kind: 'reject' | 'ask'; text: string; psi?: Limit } | null>(null);
  const evaluate = (t: string, u: Unit, keepAsBar: boolean): void => {
    const n = parseNumber(t);
    if (t.trim() === '') { setNote(null); onCommit(null); return; }
    if (n === null) { setNote({ kind: 'reject', text: W.tyreLimitNotNumber }); onCommit(null); return; }
    const c = checkLimit(n, u, { keepAsBar, min });
    if (c.status === 'ok') { setNote(null); onCommit(c.limit); }
    else if (c.status === 'ask') { setNote({ kind: 'ask', text: c.question, psi: c.asPsi }); onCommit(null); }
    else { setNote({ kind: 'reject', text: c.reason }); onCommit(null); }
  };
  useEffect(() => {
    setText(value ? String(value.value) : '');
    if (value) setUnit(value.unit);
    setNote(null);
  }, [id, resetKey]);
  return (
    <div class="tyre-limit">
      <label class="tyre-input" for={id}>
        <span class="tyre-label">{label}{required ? ' *' : ''}</span>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={text} aria-describedby={note ? `${id}-note` : undefined}
          onInput={(e) => { const t = (e.currentTarget as HTMLInputElement).value; setText(t); evaluate(t, unit, false); }} />
      </label>
      <div class="tyre-options" role="group" aria-label={W.tyreUnitFor(label)}>
        {(['bar', 'psi'] as const).map((u) => (
          <label key={u} class="tyre-option">
            <input type="radio" name={`${id}-unit`} checked={unit === u} onChange={() => { setUnit(u); evaluate(text, u, false); }} />
            <span>{u === 'bar' ? W.tyreUnitBar : W.tyreUnitPsi}</span>
          </label>
        ))}
      </div>
      {note ? (
        <div class="tyre-note" id={`${id}-note`} role="alert">
          <span>{note.text}</span>
          {note.kind === 'ask' && note.psi ? (
            <span class="tyre-ask">
              <button type="button" class="btn btn-primary" onClick={() => { setUnit('psi'); evaluate(text, 'psi', false); }}>{W.tyreAskYesPsi(String(note.psi.value))}</button>
              <button type="button" class="btn" onClick={() => evaluate(text, 'bar', true)}>{W.tyreAskNoBar}</button>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Both weighed wheel loads, or neither: one alone cannot give a split. */
function MeasuredFields({ value, onCommit }: { value: Details['measured']; onCommit: (m: { frontKg: number; rearKg: number } | undefined) => void }) {
  const [front, setFront] = useState<number | undefined>(value?.frontKg);
  const [rear, setRear] = useState<number | undefined>(value?.rearKg);
  const commit = (f: number | undefined, r: number | undefined): void => {
    setFront(f);
    setRear(r);
    onCommit(f !== undefined && r !== undefined ? { frontKg: f, rearKg: r } : undefined);
  };
  return (
    <>
      <p class="muted">{W.tyreMeasuredHelp}</p>
      <NumberInput id="tyre-mfront" label={W.tyreMeasuredFrontLabel} value={front} onCommit={(n) => commit(n, rear)} unit="kg" />
      <NumberInput id="tyre-mrear" label={W.tyreMeasuredRearLabel} value={rear} onCommit={(n) => commit(front, n)} unit="kg" />
    </>
  );
}

const fmtPct = (share: number): [string, string] => [String(Math.round(share * 100)), String(100 - Math.round(share * 100))];

function WheelFigure({ label, w }: { label: string; w: Wheel }) {
  return (
    <div class="tyre-wheel">
      <h3>{label}</h3>
      <p class="tyre-big">{W.tyreFrontBackBar(bar2(w.bar))}</p>
      <p class="tyre-psi">{W.tyrePsiValue(String(w.psi))}</p>
      <p class="muted">{W.tyreWindow(bar2(w.windowBar[0]), bar2(w.windowBar[1]))}</p>
    </div>
  );
}

// ---- the screen ----------------------------------------------------------------------------------------------------------------

export function TyreScreen({ services }: { services: TyreServices }) {
  const host = useMemo(() => services.host(), [services]);
  const [key, setKey] = useState<string>(host.planBikeId ?? DEFAULT_KEY);
  const loaded = useMemo(() => {
    const r = readStore(services.storage);
    return r.ok ? entryOf(r.store, key) : { details: {} as Details, last: null as LastResult | null };
  }, [services, key]);
  const [details, setDetails] = useState<Details>(loaded.details);
  const [kept, setKept] = useState(true);
  useEffect(() => { setDetails(loaded.details); }, [loaded]);

  const bike = host.bikes.find((b) => b.id === key) ?? null;
  // The plan's load belongs to the plan's bike: another bike has its own weights.
  const usePlan = host.summary !== null && (key === host.planBikeId || (host.summary.bikeId === null && key === DEFAULT_KEY));
  const ctx: Context = { riderKg: host.riderKg, summary: usePlan ? host.summary : null, bike };
  const resolved = resolve(details, ctx);
  const result = resolved.input ? tyreEstimate(resolved.input) : null;

  const change = (patch: Partial<Details>): void => {
    const next = { ...details, ...patch };
    for (const k of Object.keys(next) as (keyof Details)[]) if (next[k] === undefined) delete next[k];
    setDetails(next);
    setKept(saveEntry(services.storage, key, { details: next, last: loaded.last }, services.now()));
  };

  // The last figures, for the Tools tab. Only a figure that is shown is kept.
  const front = result?.front ?? null;
  const rear = result?.rear ?? null;
  const shown = front && rear && !result?.incompatible ? { f: front.bar, r: rear.bar } : null;
  useEffect(() => {
    if (!shown) return;
    const read = readStore(services.storage);
    const prev = read.ok ? entryOf(read.store, key).last : null;
    if (prev && prev.frontBar === shown.f && prev.rearBar === shown.r) return;
    const last: LastResult = { frontBar: shown.f, rearBar: shown.r, at: services.now().toISOString() };
    saveEntry(services.storage, key, { details, last }, services.now());
  }, [shown?.f, shown?.r, key]);

  const src = resolved.sources;
  const v = resolved.values;
  const own = (field: FieldName, value: number): number | undefined => (src[field] === 'assumed' ? undefined : value);
  const planDate = host.summary ? (shortMapDate(host.summary.at) ?? '') : '';
  const planNote = W.tyreFromPlan(planDate);
  const bikeKey = (name: string) => `tyre-${name}`;
  const changeHeat = (patch: NonNullable<Details['heat']>): void => {
    const heat = { ...details.heat, ...patch };
    for (const k of Object.keys(heat) as (keyof typeof heat)[]) if (heat[k] === undefined) delete heat[k];
    change({ heat: Object.keys(heat).length ? heat : undefined });
  };
  const resetter = (...fields: (keyof Details)[]) => () => change(Object.fromEntries(fields.map((f) => [f, undefined])) as Partial<Details>);

  return (
    <div class="tyre">
      <p><a class="btn" href="#/tools">{W.tyreBack}</a></p>
      <h2 class="tyre-title">{W.tyreTitle}</h2>
      <p class="muted">{W.tyreIntro}</p>

      <label class="tyre-input" for="tyre-bike">
        <span class="tyre-label">{W.tyreBikeLabel}</span>
        <select id="tyre-bike" value={key} onChange={(e) => setKey((e.currentTarget as HTMLSelectElement).value)}>
          <option value={DEFAULT_KEY}>{W.tyreBikeNone}</option>
          {host.bikes.map((b) => <option key={b.id} value={b.id}>{b.name}{b.id === host.planBikeId ? W.tyreBikeInPlan : ''}</option>)}
        </select>
      </label>
      {!kept ? <Notice>{W.tyreNotSaved}</Notice> : null}
      <p class="muted">{W.tyreSavedHere}</p>

      <section class="card tyre-result" aria-live="polite" aria-labelledby="tyre-result-title">
        <h2 id="tyre-result-title">{W.tyreResultTitle}</h2>
        {!resolved.input ? <p>{W.tyreNeedMax}</p> : null}
        {result && result.refused.length ? (
          <>
            <h3>{W.tyreRefusedTitle}</h3>
            <ul>{result.refused.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}
        {result && result.incompatible ? <h3>{W.tyreIncompatibleTitle}</h3> : null}
        {front && rear && !result?.incompatible ? (
          <>
            <div class="tyre-wheels">
              <WheelFigure label={W.tyreFront} w={front} />
              <WheelFigure label={W.tyreRear} w={rear} />
            </div>
            <p class="muted">{W.tyreRoundedNote}</p>
          </>
        ) : null}
        {result?.split ? (
          <p>
            {W.tyreSplit(...fmtPct(result.split.share))} {result.split.why}
            <br /><span class="muted">{W.tyreSplitSensitivity}</span>
          </p>
        ) : null}
        {resolved.input && resolved.assumed.length ? <p class="tyre-assumed">{W.tyreAssumedList(resolved.assumed.map((f) => ASSUMED_WORDS[f]).join(', '))}</p> : null}
        {result && result.warnings.length ? (
          <>
            <h3>{W.tyreHeadingWarnings}</h3>
            <ul class="tyre-warnings">{result.warnings.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}
        {result && result.decided.length ? (
          <>
            <h3>{W.tyreHeadingWhy}</h3>
            <ul>{result.decided.map((t) => <li key={t}>{t}</li>)}</ul>
          </>
        ) : null}
        {resolved.input ? <p class="muted">{W.tyreEstimateNote}</p> : null}
      </section>

      <Card title={W.tyreSectionLimits}>
        <p class="muted">{W.tyreLimitHint}</p>
        <LimitInput id="tyre-max" label={W.tyreLimitMaxLabel} required value={details.tyreMax} min={details.tyreMin} resetKey={key} onCommit={(l) => change({ tyreMax: l ?? undefined })} />
        <LimitInput id="tyre-min" label={W.tyreLimitMinLabel} required={false} value={details.tyreMin} resetKey={key}
          onCommit={(l) => change({ tyreMin: l })} />
        <LimitInput id="tyre-rimmax" label={W.tyreLimitRimLabel} required={false} value={details.rimMax} resetKey={key} onCommit={(l) => change({ rimMax: l })} />
      </Card>

      <Card title={W.tyreSectionRider}>
        <Field id={bikeKey('rider')} label={W.tyreRiderLabel} source={src.riderKg} valueText={`${v.riderKg} kg`}
          onReset={resetter('riderKg')}
          editor={<NumberInput id="tyre-rider" label={W.tyreRiderLabel} value={own('riderKg', v.riderKg)} placeholder={v.riderKg} onCommit={(n) => change({ riderKg: n })} unit="kg" />} />
        <Field id={bikeKey('bikekg')} label={W.tyreBikeKgLabel} source={src.bikeKg} plan={planNote} valueText={`${v.bikeKg} kg`}
          onReset={resetter('bikeKg')}
          editor={<NumberInput id="tyre-bikekg" label={W.tyreBikeKgLabel} value={own('bikeKg', v.bikeKg)} placeholder={v.bikeKg} onCommit={(n) => change({ bikeKg: n })} unit="kg" />} />
        <Field id={bikeKey('load')} label={W.tyreLoadLabel} source={src.carriedKg} plan={planNote} valueText={`${ctx.summary?.carriedKg ?? 0} kg`}
          onReset={resetter('carriedKg')}
          editor={<>
            <NumberInput id="tyre-load" label={W.tyreLoadLabel} value={details.carriedKg} onCommit={(n) => change({ carriedKg: n })} unit="kg" />
            <p class="muted">{src.carriedKg === 'entered' ? W.tyreLoadEnteredNote : W.tyreLoadNone}</p>
          </>} />
      </Card>

      <Card title={W.tyreSectionBars}>
        <Field id={bikeKey('bars')} label={W.tyreBarsLabel} source={src.bars} valueText={({ drop: W.tyreBarsDrop, flat: W.tyreBarsFlat, other: W.tyreBarsOther })[v.bars]}
          onReset={resetter('bars')}
          editor={<Choice<Bars> id="tyre-bars" label={W.tyreBarsLabel} value={v.bars} onChange={(v) => change({ bars: v })}
            options={[{ value: 'drop', label: W.tyreBarsDrop }, { value: 'flat', label: W.tyreBarsFlat }, { value: 'other', label: W.tyreBarsOther }]} />} />
      </Card>

      <Card title={W.tyreSectionTyres}>
        <Field id={bikeKey('front')} label={W.tyreFrontWidthLabel} source={src.frontMm} valueText={`${v.front.printedMm} mm`} onReset={resetter('frontMm')}
          editor={<NumberInput id="tyre-front" label={W.tyreFrontWidthLabel} value={own('frontMm', v.front.printedMm)} placeholder={v.front.printedMm} onCommit={(n) => change({ frontMm: n })} unit="mm" />} />
        <Field id={bikeKey('rear')} label={W.tyreRearWidthLabel} source={src.rearMm} valueText={`${v.rear.printedMm} mm`} onReset={resetter('rearMm')}
          editor={<NumberInput id="tyre-rear" label={W.tyreRearWidthLabel} value={own('rearMm', v.rear.printedMm)} placeholder={v.rear.printedMm} onCommit={(n) => change({ rearMm: n })} unit="mm" />} />
        <Choice<Casing> id="tyre-casing" label={W.tyreCasingLabel} value={v.casing} onChange={(v) => change({ casing: v })}
          options={[{ value: 'supple', label: W.tyreCasingSupple }, { value: 'standard', label: W.tyreCasingStandard }, { value: 'reinforced', label: W.tyreCasingReinforced }]} />
        <Choice<Setup> id="tyre-setup" label={W.tyreSetupLabel} value={v.setup} onChange={(v) => change({ setup: v })}
          options={[{ value: 'butyl', label: W.tyreSetupButyl }, { value: 'latex', label: W.tyreSetupLatex }, { value: 'tpu', label: W.tyreSetupTpu }, { value: 'tubeless', label: W.tyreSetupTubeless }]} />
      </Card>

      <Card title={W.tyreSectionRim}>
        <Field id={bikeKey('wheel')} label={W.tyreWheelLabel} source={src.wheelBsdMm} valueText={WHEELS.find((w) => w.bsdMm === (v.wheelBsdMm))?.label ?? ''} onReset={resetter('wheelBsdMm')}
          editor={
            <label class="tyre-input" for="tyre-wheel">
              <span class="tyre-label">{W.tyreWheelLabel}</span>
              <select id="tyre-wheel" value={String(v.wheelBsdMm)} onChange={(e) => change({ wheelBsdMm: Number((e.currentTarget as HTMLSelectElement).value) })}>
                {WHEELS.map((w) => <option key={w.bsdMm} value={String(w.bsdMm)}>{w.label}</option>)}
              </select>
            </label>} />
        <Choice<RimType> id="tyre-rimtype" label={W.tyreRimTypeLabel} value={v.rimType} onChange={(v) => change({ rimType: v })}
          options={[{ value: 'hooked', label: W.tyreRimHooked }, { value: 'hookless', label: W.tyreRimHookless }, { value: 'tubular', label: W.tyreRimTubular }]} />
        <Field id={bikeKey('rim')} label={W.tyreRimInnerLabel} source={src.rimInnerMm} valueText={`${v.rimInnerMm} mm`} onReset={resetter('rimInnerMm')}
          editor={<NumberInput id="tyre-rim" label={W.tyreRimInnerLabel} value={own('rimInnerMm', v.rimInnerMm)} placeholder={v.rimInnerMm} onCommit={(n) => change({ rimInnerMm: n })} unit="mm" />} />
      </Card>

      <Card title={W.tyreSectionSurface}>
        <Choice<Surface> id="tyre-surface" label={W.tyreSurfaceLabel} value={v.surface} onChange={(v) => change({ surface: v })}
          options={[{ value: 'paved', label: W.tyreSurfacePaved }, { value: 'rough', label: W.tyreSurfaceRough }, { value: 'unpaved', label: W.tyreSurfaceUnpaved }]} />
        <label class="tyre-check">
          <input type="checkbox" checked={details.wet ?? false} onChange={(e) => change({ wet: (e.currentTarget as HTMLInputElement).checked })} />
          <span>{W.tyreWetLabel}</span>
        </label>
      </Card>

      <Card title={W.tyreSectionHeat}>
        <p class="muted">{W.tyreHeatIntro}</p>
        <NumberInput id="tyre-heat-pump" label={W.tyreHeatPumpLabel} signed value={details.heat?.pumpC} onCommit={(n) => changeHeat({ pumpC: n })} unit="°C" />
        <NumberInput id="tyre-heat-max" label={W.tyreHeatMaxLabel} signed value={details.heat?.maxC} onCommit={(n) => changeHeat({ maxC: n })} unit="°C" />
        <NumberInput id="tyre-heat-pumph" label={W.tyrePumpHeightLabel} signed value={details.heat?.pumpHeightM} onCommit={(n) => changeHeat({ pumpHeightM: n })} unit="m" />
        <NumberInput id="tyre-heat-high" label={W.tyreHighestLabel} signed value={details.heat?.highestM} onCommit={(n) => changeHeat({ highestM: n })} unit="m" />
        {!v.heat ? <p class="notice">{W.tyreHeatSkipped}</p> : null}
        {v.heat && result && front && rear && !result.incompatible && !front.heat?.advise && !rear.heat?.advise ? <p class="muted">{W.tyreHeatFits}</p> : null}
      </Card>

      <Card title={W.tyreSectionMeasured}>
        <MeasuredFields key={`m-${key}`} value={details.measured} onCommit={(m) => change({ measured: m })} />
        <p class="muted">{W.tyreCaliperHelp}</p>
        <NumberInput id="tyre-cfront" label={W.tyreCaliperFrontLabel} value={details.caliperFrontMm ?? undefined} onCommit={(n) => change({ caliperFrontMm: n ?? null })} unit="mm" />
        <NumberInput id="tyre-crear" label={W.tyreCaliperRearLabel} value={details.caliperRearMm ?? undefined} onCommit={(n) => change({ caliperRearMm: n ?? null })} unit="mm" />
      </Card>

      {resolved.input ? (
        <Card title={W.tyreSramTitle}>
          <p>{W.tyreSramIntro}</p>
          <ul class="tyre-sram">
            {sramList(v).map((row) => <li key={row.label}><strong>{row.label}:</strong> {row.value}</li>)}
          </ul>
          <p><a class="btn btn-primary" href={SRAM_URL} target="_blank" rel="noopener noreferrer">{W.tyreSramLink}</a></p>
          <p class="muted">{W.tyreSramNothingSent} {W.tyreSramDiffer}</p>
        </Card>
      ) : null}
    </div>
  );
}


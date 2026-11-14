// Water learning (spec sections 3.5 and 6.3): the status of the personal factor, and the post-ride report. The report is worked
// out in `core` (reportRide); this only collects the answers and shows what comes back.
import { useEffect, useRef, useState } from 'preact/hooks';
import { REPORT_TEMPS } from '../../core/engines/ride-report.ts';
import type { ReportTemp, RideOutcome } from '../../core/engines/ride-report.ts';
import { uncertainty } from '../../core/engines/water-base.ts';
import { W } from '../../core/wording/en.ts';
import { Y } from '../../core/wording/en-you.ts';
import { Card } from '../card.tsx';
import type { YouServices, YouSnapshot } from './services.ts';

const TEMP_LABEL: Record<ReportTemp, string> = { cold: Y.youTempCold, cool: Y.youTempCool, mild: Y.youTempMild, warm: Y.youTempWarm, hot: Y.youTempHot };
const status = (sumW: number): string => {
  const u = uncertainty(sumW);
  return u === 1.2 ? W.waterCalibrated : u === 1.3 ? W.waterPartlyCalibrated : W.waterNotCalibrated;
};

const num = (text: string): number | null => {
  const t = text.trim().replace(',', '.');
  return t === '' || !Number.isFinite(Number(t)) ? null : Number(t);
};

type Added = Extract<RideOutcome, { ok: true }>;

export function LearnCard({ services, snap, reload }: { services: YouServices; snap: YouSnapshot; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [drank, setDrank] = useState('');
  const [temp, setTemp] = useState<ReportTemp>('mild');
  const [feel, setFeel] = useState<'A' | 'B' | 'C' | ''>('');
  const [loss, setLoss] = useState('');
  const [stops, setStops] = useState('');
  const [hilly, setHilly] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<Added | null>(null);
  // The form's first field takes the focus as it opens; closed, the button that opened it has it back (sweep 14 Nov, 49).
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) document.getElementById('ride-hours')?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const { profile } = snap;

  const submit = async (): Promise<void> => {
    setAdded(null);
    const h = num(hours);
    const d = num(drank);
    if (h === null || d === null) {
      setProblem(h === null ? W.appStoreRideShort : W.appStoreRideIntake);
      return;
    }
    const l = num(loss);
    const s = num(stops);
    const { outcome, refused } = await services.report({
      at: services.now(), hours: h, intakeL: d, feel: feel === '' ? null : feel, temp,
      ...(l === null ? {} : { massLossKg: l }), ...(s === null ? {} : { toiletStops: s }), hilly,
    }, profile, snap.settings.flatKph);
    if (!outcome.ok) {
      setProblem({ short: W.appStoreRideShort, long: W.appStoreRideLong, intake: W.appStoreRideIntake, weighing: W.appStoreRideWeighing }[outcome.reason]);
      return;
    }
    if (refused) {
      setProblem(refused);
      return;
    }
    setProblem(null);
    setAdded(outcome);
    setHours('');
    setDrank('');
    setLoss('');
    setStops('');
    setFeel('');
    setHilly(false);
    await reload();
  };

  return (
    <Card title={Y.youLearnTitle}>
      <div data-learn>
        <p data-calibration>{status(profile.sumW)}</p>
        <p class="muted">
          {snap.rides === 0 ? Y.youLearnNoRides : Y.youLearnRides(snap.rides)}
          {profile.weighedRides > 0 ? ` ${Y.youLearnWeighed(profile.weighedRides)}` : ''}
        </p>
        {snap.hillyRides > 0 ? <p class="muted" data-hilly-count>{Y.youLearnHilly(snap.hillyRides)}</p> : null}
        <p class="muted">{Y.youLearnIntro}</p>
        {!open ? <button type="button" class="btn" ref={opener} onClick={() => setOpen(true)}>{Y.youRideOpen}</button> : (
          <form data-ride-form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div class="field">
              <label for="ride-hours">{Y.youRideHours}</label>
              <input id="ride-hours" type="number" inputMode="decimal" step="0.25" min={1} max={16} value={hours} onInput={(e) => setHours(e.currentTarget.value)} />
            </div>
            <div class="field">
              <label for="ride-drank">{Y.youRideDrank}</label>
              <input id="ride-drank" type="number" inputMode="decimal" step="0.1" min={0} max={20} value={drank} onInput={(e) => setDrank(e.currentTarget.value)} />
            </div>
            <fieldset class="field choice">
              <legend>{Y.youTerrainLegend}</legend>
              <label class="choice-option"><input type="radio" name="ride-terrain" value="flat" checked={!hilly} onChange={() => setHilly(false)} /><span>{Y.youTerrainFlat}</span></label>
              <label class="choice-option"><input type="radio" name="ride-terrain" value="hilly" checked={hilly} onChange={() => setHilly(true)} /><span>{Y.youTerrainHilly}</span></label>
            </fieldset>
            <fieldset class="field choice">
              <legend>{Y.youRideTempLegend}</legend>
              {(Object.keys(REPORT_TEMPS) as ReportTemp[]).map((t) => (
                <label key={t} class="choice-option"><input type="radio" name="ride-temp" value={t} checked={temp === t} onChange={() => setTemp(t)} /><span>{TEMP_LABEL[t]}</span></label>
              ))}
            </fieldset>
            <fieldset class="field choice">
              <legend>{Y.youFeelLegend}</legend>
              {([['A', Y.youFeelA], ['B', Y.youFeelB], ['C', Y.youFeelC], ['', Y.youFeelSkip]] as const).map(([v, text]) => (
                <label key={v || 'skip'} class="choice-option"><input type="radio" name="ride-feel" value={v} checked={feel === v} onChange={() => setFeel(v)} /><span>{text}</span></label>
              ))}
            </fieldset>
            <details>
              <summary>{Y.youRideWeighTitle}</summary>
              <div class="field">
                <label for="ride-loss">{Y.youRideLoss}</label>
                <input id="ride-loss" type="number" inputMode="decimal" step="0.1" value={loss} onInput={(e) => setLoss(e.currentTarget.value)} />
                <p class="muted">{Y.youRideLossHint}</p>
              </div>
              <div class="field">
                <label for="ride-stops">{Y.youRideStops}</label>
                <input id="ride-stops" type="number" inputMode="numeric" step="1" min={0} max={30} value={stops} onInput={(e) => setStops(e.currentTarget.value)} />
              </div>
            </details>
            {problem ? <p class="field-problem" role="alert">{problem}</p> : null}
            <div class="row">
              <button type="submit" class="btn btn-primary">{Y.youRideAdd}</button>
              <button type="button" class="btn" onClick={() => { setOpen(false); setProblem(null); }}>{Y.youImportCancel}</button>
            </div>
          </form>
        )}
        {added ? (
          <div data-ride-result role="status">
            <p>{Y.youRideAdded} {Y.youRideEstimate((Math.round(added.predictedL * 10) / 10).toFixed(1))}</p>
            {added.ride.hilly === true ? <p data-hilly-kept>{Y.youRideHillyKept}</p> : null}
            <h3>{Y.youRideAdviceTitle}</h3>
            <ul>{added.advice.lines.map((line) => <li key={line}>{line}</li>)}</ul>
            {added.over ? <p class="notice" data-over-drinking>{W.waterOverDrinkCaution}</p> : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

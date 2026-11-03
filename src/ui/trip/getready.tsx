// Get ready offline on Trip (spec sections 3.3, 5 and 9.4). It reports what was done, step by step, and what was not: nothing
// here calls the trip ready, safe or complete (Decision 2). One fixed line asks the rider to test it in flight mode.
import { useRef, useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import type { StepName, StepReport } from '../../data/prepare.ts';
import { Card } from '../card.tsx';
import { askForHomeScreen } from '../install.ts';
import { agoText, packDate, thousands } from './model.ts';
import { forecastDay } from './services.ts';
import type { TripServices, TripSnapshot } from './services.ts';

const ORDER: StepName[] = ['heights', 'places', 'hours', 'weather', 'baseline', 'save'];
const LABEL: Record<StepName, string> = {
  heights: W.appTripStepHeights, places: W.appTripStepPlaces, hours: W.appTripStepHours,
  weather: W.appTripStepWeather, baseline: W.appTripStepBaseline, save: W.appTripStepSave,
};
const labelOf = (step: string): string => (LABEL as Record<string, string>)[step] ?? step;

type Progress = { step: StepName; done: number; total: number };

/** "1,214 places, weather to Friday, updated 2 h ago": only what is stored. */
function savedLine(snap: TripSnapshot): string | null {
  const { prepared, places, forecastTo, forecastFetchedAt, zone, now } = snap;
  if (!prepared && places === 0 && forecastTo === null) return null;
  const pack = packDate(prepared?.build);
  const placesText = places > 0 ? `${W.appTripPlaces(thousands(places))}${pack ? ` (${W.appTripMapDate(pack.date, pack.fromSource)})` : ''}` : W.appTripNoPlaces;
  // The forecast is read against now: one that has ended says so, and its time is its own fetch time.
  let weather = W.appTripNoWeather;
  if (forecastTo) {
    const day = forecastDay(forecastTo, now, zone);
    weather = forecastTo.getTime() > now.getTime() ? W.appTripWeatherTo(day) : W.appTripWeatherEnded(day);
    if (forecastFetchedAt) weather += ` (${W.appTripFetched(agoText(forecastFetchedAt, now))})`;
  }
  return [placesText, weather].join(', ');
}

export function GetReady({ services, snap, reload }: { services: TripServices; snap: TripSnapshot; reload: () => Promise<void> }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<StepReport[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false);

  const go = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setFailure(null);
    setNotice(null);
    setReports(null);
    setProgress({ step: 'heights', done: 0, total: 1 });
    try {
      const result = await services.prepare((step, done, total) => setProgress({ step, done, total }), setNotice);
      // What was stored is read first, so the lines below never show beside "nothing is saved".
      await reload();
      setReports(result);
    } catch {
      setFailure(W.appPrepSaveFailed);
      await reload();
    } finally {
      running.current = false;
      setProgress(null);
    }
  };

  const steps = reports ?? snap.prepared?.steps ?? null;
  const failed = steps?.filter((s) => !s.ok) ?? [];
  // "Saving" is how the run ends, not data it saved; the stored record never holds it, so it isn't listed right after a run either.
  const saved = steps?.filter((s) => s.ok && s.step !== 'save') ?? [];
  const line = savedLine(snap);
  const ask = askForHomeScreen({ userAgent: services.env.userAgent, maxTouchPoints: services.env.maxTouchPoints, platform: services.env.platform, standalone: services.env.standalone })
    && snap.prepared === null && snap.places === 0;
  const verb = snap.prepared === null && reports === null ? W.appTripGetReadyButton : failed.length > 0 ? W.appTripRetryButton : W.appTripUpdateButton;

  return (
    <Card title={W.appTripGetReadyTitle}>
      <div data-getready>
        <p>{W.appTripGetReadyIntro}</p>
        {ask ? <p class="notice">{W.appTripIphoneAsk}</p> : null}
        {line ? <p class="tool-line">{line}</p> : <p class="muted">{W.appTripNothingSaved}</p>}
        {snap.storageMb !== null ? <p class="muted">{W.appTripStorage(String(snap.storageMb))}</p> : null}
        <button type="button" class="btn btn-primary" onClick={() => void go()} aria-busy={progress ? 'true' : undefined}>{verb}</button>
        <div role="status" aria-live="polite">
          {progress ? (
            <>
              <p>{W.appTripWorking}</p>
              <p>{W.appTripProgress(ORDER.indexOf(progress.step) + 1, ORDER.length, labelOf(progress.step))}{progress.total > 1 ? ` — ${W.appTripProgressPart(progress.done, progress.total)}` : ''}</p>
              <progress max={ORDER.length} value={ORDER.indexOf(progress.step) + (progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0)} />
              {notice ? <p class="notice">{notice}</p> : null}
            </>
          ) : null}
          {failure ? <p class="notice">{failure}</p> : null}
        </div>
        {!progress && failed.length > 0 ? (
          <>
            <h3>{W.appTripMissingHeading}</h3>
            <ul class="trip-steps">{failed.map((s) => <li key={s.step}><strong>{labelOf(s.step)}</strong> {s.note ?? ''}</li>)}</ul>
            <p>{W.appTripPartial}</p>
          </>
        ) : null}
        {!progress && saved.length > 0 ? <p class="muted">{W.appTripStepsOk}: {saved.map((s) => labelOf(s.step)).join(', ')}.</p> : null}
        <p class="tool-line">{W.appTripFlightMode}</p>
      </div>
    </Card>
  );
}

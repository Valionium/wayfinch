// Trip settings (spec section 3.3). Every field saves when it is changed; a value outside its range is refused with the range
// named, and the field goes back to the last good value. Nothing here works out the days: the services re-plan them.
import { useEffect, useState } from 'preact/hooks';
import { localIsoDate } from '../../core/answers/time.ts';
import { W } from '../../core/wording/en.ts';
import { keepFreshOffered } from '../../data/refresh.ts';
import type { Settings } from '../../store/rules.ts';
import { Card } from '../card.tsx';
import { suggestedNights } from './model.ts';
import type { TripServices, TripSnapshot } from './services.ts';

type Save = (field: keyof Settings, value: unknown) => Promise<boolean>;

function NumberField({ id, label, value, step, min, max, placeholder, onCommit, problem }: {
  id: string; label: string; value: number | null; step: string; min: number; max: number; placeholder?: string;
  onCommit: (value: number | null) => Promise<boolean>; problem: string | null;
}) {
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input
        id={id} type="number" inputMode="decimal" step={step} min={min} max={max} value={draft} placeholder={placeholder} aria-describedby={problem ? `${id}-problem` : undefined} aria-invalid={problem ? 'true' : undefined}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onChange={async (e) => {
          const text = e.currentTarget.value.trim();
          const ok = await onCommit(text === '' ? null : Number(text));
          if (!ok) setDraft(shown);
        }}
      />
      {problem ? <p class="field-problem" id={`${id}-problem`} role="alert">{problem}</p> : null}
    </div>
  );
}

function Choice({ name, legend, value, options, onPick }: { name: string; legend: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <fieldset class="field choice">
      <legend>{legend}</legend>
      {options.map(([v, text]) => (
        <label key={v} class="choice-option">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onPick(v)} />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function TripSettings({ services, snap, reload }: { services: TripServices; snap: TripSnapshot; reload: () => Promise<void> }) {
  const { settings, trip } = snap;
  const [problems, setProblems] = useState<Partial<Record<string, string>>>({});
  const [startDraft, setStartDraft] = useState(settings.startTime);
  useEffect(() => setStartDraft(settings.startTime), [settings.startTime]);

  const save: Save = async (field, value) => {
    const result = await services.writeSettings({ [field]: value });
    setProblems((p) => ({ ...p, [field]: result.reasons[field] ?? result.note ?? '' }));
    await reload();
    return result.ok;
  };
  const setDate = async (date: string | null): Promise<void> => {
    const reason = await services.setDeparture(date);
    setProblems((p) => ({ ...p, date: reason ?? '' }));
    await reload();
  };
  const problem = (f: string): string | null => problems[f] || null;

  return (
    <Card title={W.appTripSettingsTitle}>
      <div data-settings>
        {trip ? (
          <div class="field">
            <label for="trip-date">{W.appTripDeparture}</label>
            <input id="trip-date" type="date" value={trip.departureDate ?? ''} onChange={(e) => void setDate(e.currentTarget.value === '' ? null : e.currentTarget.value)} />
            <div class="row">
              <button type="button" class="btn" onClick={() => void setDate(localIsoDate(services.now(), snap.zone))}>{W.appTripDepartureToday}</button>
              {trip.departureDate !== null ? <button type="button" class="btn" onClick={() => void setDate(null)}>{W.appTripDepartureClear}</button> : null}
            </div>
            {trip.departureDate === null ? <p class="muted">{W.appTripDepartureNone}</p> : null}
            {problem('date') ? <p class="field-problem" role="alert">{problem('date')}</p> : null}
          </div>
        ) : null}

        <div class="field">
          <label for="trip-start">{W.appTripStartTime}</label>
          <input
            id="trip-start" type="time" min="04:00" max="14:00" value={startDraft} onInput={(e) => setStartDraft(e.currentTarget.value)}
            onChange={async (e) => { if (!(await save('startTime', e.currentTarget.value))) setStartDraft(settings.startTime); }}
          />
          {problem('startTime') ? <p class="field-problem" role="alert">{problem('startTime')}</p> : null}
        </div>

        <NumberField
          id="trip-nights" label={W.appTripNights} value={settings.nights} step="1" min={0} max={30}
          placeholder={trip ? String(suggestedNights(trip)) : undefined} onCommit={(v) => save('nights', v)} problem={problem('nights')}
        />
        {trip ? <p class="muted">{W.appTripNightsSuggested(suggestedNights(trip))}</p> : null}
        {settings.nights !== null ? <button type="button" class="btn" onClick={() => void save('nights', null)}>{W.appTripNightsUseSuggested}</button> : null}

        <Choice
          name="pace" legend={W.appTripPace} value={settings.pace} onPick={(v) => void save('pace', v)}
          options={[['steady', W.appTripPaceSteady], ['sporting', W.appTripPaceSporting], ['hard', W.appTripPaceHard]]}
        />
        {problem('pace') ? <p class="field-problem" role="alert">{problem('pace')}</p> : null}

        <NumberField id="trip-kph" label={W.appTripFlatKph} value={settings.flatKph} step="0.5" min={15} max={40} onCommit={(v) => save('flatKph', v ?? Number.NaN)} problem={problem('flatKph')} />

        <Choice
          name="stay" legend={W.appTripStay} value={settings.stay} onPick={(v) => void save('stay', v)}
          options={[['camping', W.appTripStayCamping], ['mixed', W.appTripStayMixed], ['accommodation', W.appTripStayAccommodation]]}
        />
        {problem('stay') ? <p class="field-problem" role="alert">{problem('stay')}</p> : null}

        <NumberField id="trip-camp" label={W.appTripCampWater} value={settings.campWaterL} step="0.1" min={0} max={5} onCommit={(v) => save('campWaterL', v ?? Number.NaN)} problem={problem('campWaterL')} />

        {keepFreshOffered(services.env.weatherMode) ? (
          <div class="field">
            <label class="choice-option">
              <input type="checkbox" checked={settings.keepFresh} onChange={(e) => void save('keepFresh', e.currentTarget.checked)} />
              <span>{W.weatherKeepFresh}</span>
            </label>
            <p class="muted">{W.appTripKeepFreshWhy}</p>
          </div>
        ) : null}
        {trip ? <p class="muted">{W.appTripSettingsStageNote}</p> : null}
      </div>
    </Card>
  );
}

// Trip settings (spec section 3.3). Every field saves when it is changed; a value outside its range is refused with the range
// named, and the field goes back to the last good value. Nothing here works out the days: the services re-plan them.
import { useEffect, useRef, useState } from 'preact/hooks';
import { W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { TF } from '../../core/wording/en-trip-fields.ts';
import { keepFreshOffered } from '../../data/refresh.ts';
import type { Settings } from '../../store/rules.ts';
import { useFollowing } from '../follow.ts';
import { RemoveTrip } from './remove.tsx';
import { suggestedNights } from './model.ts';
import type { TripServices, TripSnapshot } from './services.ts';

type Save = (field: keyof Settings, value: unknown) => Promise<boolean>;

// Remove this trip stands next to Change in the Route step's done row (owner, 9 Nov 2026): `part="remove"` of this chunk, with its
// confirm step and its words, so the first screen carries no import of its own for it.

export function NumberField({ id, label, value, step, min, max, placeholder, onCommit, problem }: {
  id: string; label: string; value: number | null; step: string; min: number; max: number; placeholder?: string;
  onCommit: (value: number | null) => Promise<boolean>; problem: string | null;
}) {
  const shown = value === null ? '' : String(value);
  const [draft, setDraft] = useFollowing(shown);
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

/** The choice shows at once; if the store refuses it, the last good one comes back. */
export function Choice({ name, legend, value, options, onPick }: { name: string; legend: string; value: string; options: [string, string][]; onPick: (v: string) => Promise<boolean> }) {
  const [shown, setShown] = useFollowing(value);
  return (
    <fieldset class="field choice">
      <legend>{legend}</legend>
      {options.map(([v, text]) => (
        <label key={v} class="choice-option">
          <input type="radio" name={name} value={v} checked={shown === v} onChange={async () => { setShown(v); if (!(await onPick(v))) setShown(value); }} />
          <span>{text}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * `when`: the departure date and the nights, which stay in the Route step; `details`: the trip details folded under it (guided Trip
 * design §2.2): start time, pace, flat speed, stay type, camp water and keep fresh.
 */
export function TripSettings({ services, snap, reload, part, focusDate = 0 }: {
  services: TripServices; snap: TripSnapshot; reload: () => Promise<void>; part: 'when' | 'details' | 'remove';
  /** Counts the trip line's Change date taps: each one puts the focus on the date (sweep of 14 Nov 2026, #3). */
  focusDate?: number;
}) {
  const { settings, trip } = snap;
  const [problems, setProblems] = useState<Partial<Record<string, string>>>({});
  const [startDraft, setStartDraft] = useFollowing(settings.startTime);
  const [dateDraft, setDateDraft] = useFollowing(trip?.departureDate ?? '');
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fresh, setFresh] = useFollowing(settings.keepFresh);
  const dateField = useRef<HTMLInputElement>(null);
  const [stopsSaid, setStopsSaid] = useState('');
  useEffect(() => { if (focusDate > 0) dateField.current?.focus(); }, [focusDate]);

  const save: Save = async (field, value) => {
    const result = await services.writeSettings({ [field]: value });
    // A refusal stays beside its field only until the next change that is accepted.
    // An accepted change clears the old refusals, but a note about it (its days could not be updated) is always shown.
    setProblems((p) => (result.ok ? (result.note ? { [field]: result.note } : {}) : { ...p, [field]: result.reasons[field] ?? result.note ?? '' }));
    // The caller puts a refused value back at once, as the refusal shows: not only once the trip has been read again (on a busy
    // phone that took long enough for the refused value to linger beside its message).
    void reload();
    return result.ok;
  };
  const setDate = async (date: string | null): Promise<void> => {
    const reason = await services.setDeparture(date);
    setProblems((p) => ({ ...p, date: reason ?? '' }));
    await reload();
  };
  const problem = (f: string): string | null => problems[f] || null;
  // Other nights choose every night's stop afresh, the rider's own picks included (TRIP-DAY-STOPS): said once, here, when the trip
  // had stops (review of PR 101, M4). A day ride has none to say.
  const saveNights = async (v: number | null): Promise<boolean> => {
    const was = trip ? settings.nights ?? suggestedNights(trip) : null;
    const ok = await save('nights', v);
    const now = trip ? v ?? suggestedNights(trip) : null;
    const held = trip?.stops?.routeId === trip?.route.id ? trip?.stops : undefined;
    setStopsSaid(ok && held && held.days.length > 0 && now !== null && now > 0 && now !== was ? TF.appTripStopsNewNights(now, held.days.some((d) => d.by === 'rider')) : '');
    return ok;
  };

  if (part === 'remove') return <RemoveTrip snap={snap} reload={reload} />;
  if (part === 'when') {
    return (
      <div data-settings="when">
        {trip ? (
          <div class="field">
            <label for="trip-date">{TF.appTripDeparture}</label>
            <input
              id="trip-date" type="date" value={dateDraft} ref={dateField}
              onChange={(e) => {
                // A date typed digit by digit passes through other dates: it is saved once it has settled, or when the field is left.
                const v = e.currentTarget.value;
                setDateDraft(v);
                if (dateTimer.current) clearTimeout(dateTimer.current);
                dateTimer.current = setTimeout(() => { dateTimer.current = null; void setDate(v === '' ? null : v); }, 700);
              }}
              onBlur={(e) => {
                if (!dateTimer.current) return;
                clearTimeout(dateTimer.current);
                dateTimer.current = null;
                void setDate(e.currentTarget.value === '' ? null : e.currentTarget.value);
              }}
            />
            {trip.departureDate !== null ? (
              <p>
                <button
                  type="button" class="btn"
                  onClick={() => {
                    // A date still settling from the field goes too: the tap is the last word.
                    if (dateTimer.current) clearTimeout(dateTimer.current);
                    dateTimer.current = null;
                    setDateDraft('');
                    void setDate(null);
                  }}
                >{TF.appTripDateClear}</button>
              </p>
            ) : <p class="muted">{TF.appTripDepartureNone}</p>}
            {problem('date') ? <p class="field-problem" role="alert">{problem('date')}</p> : null}
          </div>
        ) : null}
        <NumberField
          id="trip-nights" label={TF.appTripNights} value={settings.nights} step="1" min={0} max={30}
          placeholder={trip ? String(suggestedNights(trip)) : undefined} onCommit={saveNights} problem={problem('nights')}
        />
        {trip ? <p class="muted">{TF.appTripNightsSuggested(suggestedNights(trip))}</p> : null}
        <p class="muted" role="status" data-nights-stops>{stopsSaid}</p>
        {settings.nights !== null ? <button type="button" class="btn" onClick={() => void saveNights(null)}>{TF.appTripNightsUseSuggested}</button> : null}

        {trip ? <p class="muted">{TR.appTripSettingsStageNote}</p> : null}
      </div>
    );
  }

  return (
    <div data-settings="details">
      <div class="field">
        <label for="trip-start">{TF.appTripStartTime}</label>
        <input
          id="trip-start" type="time" min="04:00" max="14:00" value={startDraft} onInput={(e) => setStartDraft(e.currentTarget.value)}
          onChange={async (e) => { if (!(await save('startTime', e.currentTarget.value))) setStartDraft(settings.startTime); }}
        />
        {problem('startTime') ? <p class="field-problem" role="alert">{problem('startTime')}</p> : null}
      </div>

      <Choice
        name="pace" legend={TF.appTripPace} value={settings.pace} onPick={(v) => save('pace', v)}
        options={[['steady', W.appTripPaceSteady], ['sporting', W.appTripPaceSporting], ['hard', W.appTripPaceHard]]}
      />
      {problem('pace') ? <p class="field-problem" role="alert">{problem('pace')}</p> : null}

      <NumberField id="trip-kph" label={TF.appTripFlatKph} value={settings.flatKph} step="0.5" min={15} max={40} onCommit={(v) => save('flatKph', v ?? Number.NaN)} problem={problem('flatKph')} />

      <Choice
        name="stay" legend={TF.appTripStay} value={settings.stay} onPick={(v) => save('stay', v)}
        options={[['camping', W.appTripStayCamping], ['mixed', W.appTripStayMixed], ['accommodation', W.appTripStayAccommodation]]}
      />
      {problem('stay') ? <p class="field-problem" role="alert">{problem('stay')}</p> : null}

      <NumberField id="trip-camp" label={TF.appTripCampWater} value={settings.campWaterL} step="0.1" min={0} max={5} onCommit={(v) => save('campWaterL', v ?? Number.NaN)} problem={problem('campWaterL')} />

      {keepFreshOffered(services.env.weatherMode) ? (
        <div class="field">
          <label class="choice-option">
            <input type="checkbox" checked={fresh} onChange={async (e) => { const on = e.currentTarget.checked; setFresh(on); if (!(await save('keepFresh', on))) setFresh(settings.keepFresh); }} />
            <span>{W.weatherKeepFresh}</span>
          </label>
          <p class="muted">{TR.appTripKeepFreshWhy}</p>
        </div>
      ) : null}
    </div>
  );
}

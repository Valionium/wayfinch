// The route summary (spec section 3.3): distance, climbing, the elevation profile and the stage model's days. What it says about
// heights and places is only what was done: looked-up heights are credited, a route without them says so.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RouteStop } from '../../core/screen/route-stops.ts';
import { windowKm } from '../../core/engines/day-beds.ts';
import type { BedChoice, DayBed } from '../../core/engines/day-beds.ts';
import { dayStopOf } from '../../core/route/day-stops.ts';
import type { Route, Trip, TripStops } from '../../core/types.ts';
import type { StopChange } from '../../data/day-stops.ts';
import { showKm, W } from '../../core/wording/en.ts';
import { TR } from '../../core/wording/en-trip.ts';
import { BD } from '../../core/wording/en-beds.ts';
import { TF } from '../../core/wording/en-trip-fields.ts';
import { Glyph, ICON_WORD, slotsOf } from '../ahead/strip.tsx';
import { Card } from '../card.tsx';
import { OsmCredit } from './credit.tsx';
import { PROFILE_BOX, packDate, profileY, summaryOf } from './model.ts';
import type { TripServices, TripSnapshot } from './services.ts';

/**
 * Room above the line for the icons: the profile grows from 72 to 118 px (design §6). Each icon stands on the line, its bottom at
 * the line's point, so it and its "+N" (2 px below it) stay inside the profile's own box at any height: nothing hangs over the text
 * below (owner's finding L, 8 Nov 2026). 44 px of icon above the highest point (2 px from the top of the line's 72) fits in 46.
 */
const ROOM_PX = 46;
const ICON_PX = 44;
const stopWords = (s: RouteStop): string => (s.label ? `${ICON_WORD[s.kind](showKm(s.km))} · ${s.label}` : ICON_WORD[s.kind](showKm(s.km)));

/**
 * The stops on the profile (TRIP-STOPS): Ahead's strip icons for each day, on the line at their km and the height there, grouped as
 * the strip groups them. A tap lists a group's stops under the profile; it opens no Ahead card.
 */
function ProfileStops({ route, stops }: { route: Route; stops: RouteStop[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(230);
  const [picked, setPicked] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = (): void => { const w = box.current?.clientWidth ?? 0; if (w > 0) setPx(w); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const slots = slotsOf(stops, { startKm: 0, endKm: route.lengthKm }, px);
  const shown = picked === null ? null : slots[picked];
  return (
    <>
      <div class="trip-profile-stops" ref={box} data-profile-stops>
        {slots.map(({ x, icons: [one, ...rest] }, n) => {
          const y = profileY(route, x * route.lengthKm) ?? PROFILE_BOX.h / 2;
          const more = rest.length ? W.appAheadIconMore(rest.length) : '';
          return (
            <button
              key={n} type="button" class={`ah-icon ah-icon-${one!.kind}${more && ' ah-icon-more'}`} style={{ left: `${(x * 100).toFixed(2)}%`, top: `${(ROOM_PX + y - ICON_PX).toFixed(1)}px` }}
              aria-label={more ? `${stopWords(one!)}, ${more}: ${rest.map(stopWords).join(', ')}` : stopWords(one!)} aria-expanded={picked === n} aria-controls={picked === n ? 'trip-stop-list' : undefined}
              onClick={() => setPicked(picked === n ? null : n)}
            >
              <Glyph kind={one!.kind} />
              {more ? <span class="ah-icon-n">{more}</span> : null}
            </button>
          );
        })}
      </div>
      {shown ? <ul class="trip-stop-list" id="trip-stop-list" data-stop-list>{shown.icons.map((s, i) => <li key={i}>{stopWords(s)}</li>)}</ul> : null}
      <ul class="visually-hidden" aria-label={TF.appTripStopsLabel} data-stops-all>{stops.map((s, i) => <li key={i}>{stopWords(s)}</li>)}</ul>
    </>
  );
}

/** The line under a day: where to sleep near its end, or that none is mapped there (TRIP-DAY-BEDS). */
function bedLine(b: DayBed | undefined, dayKm: number): string | null {
  if (!b || b.last) return null;
  const w = showKm(windowKm(dayKm));
  if (b.bed) return BD.appTripBedNear(b.bed.name, showKm(b.bed.km), b.bed.town);
  return b.town ? BD.appTripBedTown(b.town.name, showKm(b.town.km), w) : BD.appTripBedNone(w);
}

/**
 * The words of a day that ends at a stop (TRIP-DAY-STOPS): its first line, and the line under it. Null: no stop holds for it.
 * `town`: the nearest town near a planned end with no place to sleep (review of PR 101, M1).
 */
export function dayEndWords(trip: Trip, i: number, text: string, town: { name: string; km: number } | null = null): { text: string; below: string | null } | null {
  const stop = dayStopOf(trip, i);
  const s = trip.route.stages[i];
  if (!stop || !s || !trip.stops) return null;
  const km = showKm(s.endKm - s.startKm);
  if (stop.placeId !== null && stop.name) {
    // Day 1's leave-by time, when there is one, stays after the stop's name.
    const rest = text.slice(W.appTripDayRow(s.day, km).length);
    const below = stop.closed ? BD.appTripStopClosed : stop.was ? BD.appTripStopGone(stop.was) : stop.town ? BD.appTripStopBy(stop.town) : null;
    return { text: `${BD.appTripDayTo(s.day, km, stop.name)}${rest}`, below };
  }
  if (stop.by === 'rider') return { text, below: BD.appTripStopSplit };
  // The window the places were searched in: the planned day's (M2).
  const basis = trip.stops.basis;
  const w = showKm(windowKm(basis[i]! - (basis[i - 1] ?? 0)));
  return { text, below: town ? BD.appTripBedTown(town.name, showKm(town.km), w) : BD.appTripStopNone(w) };
}

/** Change a day's stop: the places near its planned end and "No stop", each a button (TRIP-DAY-STOPS). */
function StopChoices({ day, choices, current, pick }: { day: number; choices: BedChoice[] | null; current: string | null; pick: (to: BedChoice | null) => void }) {
  return (
    <div data-stop-choices={day} id={`trip-stop-choices-${day}`}>
      {choices === null ? <p class="muted">{TR.appAbSearching}</p> : (
        <>
          {choices.length === 0 ? <p class="muted">{BD.appTripStopNoChoice}</p> : null}
          <ul class="trip-stop-choices">
            {choices.map((c) => (
              <li key={c.placeId}>
                <button type="button" class="btn hit" aria-current={c.placeId === current ? 'true' : undefined} onClick={() => pick(c)}>
                  {BD.appTripStopPick(c.name, showKm(c.km))}{c.placeId === current ? ` (${BD.appTripStopCurrent})` : ''}
                </button>
              </li>
            ))}
            <li><button type="button" class="btn hit" aria-current={current === null ? 'true' : undefined} onClick={() => pick(null)}>{BD.appTripStopNo}</button></li>
          </ul>
        </>
      )}
    </div>
  );
}

/** After a change, the focus goes back to that day's Change stop button: the one it came from (review of PR 101, M7). */
const focusChange = (day: number): void => {
  setTimeout(() => (document.querySelector(`[data-stop-change="${day}"]`) as HTMLButtonElement | null)?.focus(), 0);
};

/**
 * Settling the stops and the places to pick, from their own chunk (TRIP-DAY-STOPS). The route summary is itself a chunk, so the
 * first screen carries none of it.
 */
const settleStops = (change?: StopChange): Promise<TripStops | null> => import('../../data/day-stops.ts').then((m) => m.settleStops(new Date(), change));
const stopChoices = (day: number): Promise<BedChoice[]> => import('../../data/day-stops.ts').then((m) => m.stopChoices(new Date(), day));

export function RouteSummary({ snap, stops, beds, settle = settleStops, choices = stopChoices }: {
  snap: TripSnapshot; stops: TripServices['stops']; beds?: TripServices['dayBeds'];
  settle?: (change?: StopChange) => Promise<TripStops | null>; choices?: (day: number) => Promise<BedChoice[]>;
}) {
  const { trip } = snap;
  // The stops come once Get ready offline has saved places: read again when the route, its days, its date, what was saved or the
  // forecast (Update weather moves the cover icons: review of PR 73, M2) change.
  const ready = trip !== null && (snap.prepared !== null || snap.places > 0);
  const key = ready ? [trip.route.id, trip.route.stages.map((s) => s.endKm).join(','), trip.departureDate, trip.startTime, trip.stay, snap.places, snap.prepared?.at?.getTime?.(), snap.forecastFetchedAt?.getTime()].join('|') : '';
  // The days end where you can sleep once places are saved: settled again whenever the route, its plan or what was saved change.
  useEffect(() => {
    if (key && settle) settle().catch(() => undefined);
  }, [key, settle]);
  const [open, setOpen] = useState<{ day: number; list: BedChoice[] | null } | null>(null);
  const [undo, setUndo] = useState<{ day: number; before: TripStops | null; after: TripStops | null } | null>(null);
  const [said, setSaid] = useState('');
  // Undo is only for the change this window just made: a trip removed, another route, or a change from elsewhere ends it, and the
  // open list with it (review of PR 101, M3).
  const nowStops = JSON.stringify(trip?.stops ?? null);
  useEffect(() => {
    if (undo && (!key || JSON.stringify(undo.after) !== nowStops)) { setUndo(null); setOpen(null); setSaid(''); }
  }, [key, nowStops]);
  const openChoices = (day: number): void => {
    if (open?.day === day) { setOpen(null); return; }
    setOpen({ day, list: null });
    (choices ? choices(day) : Promise.resolve([])).then((list) => setOpen((o) => (o?.day === day ? { day, list } : o)), () => setOpen((o) => (o?.day === day ? { day, list: [] } : o)));
  };
  const pick = (day: number, to: BedChoice | null): void => {
    if (!settle || !trip) return;
    const before = trip.stops ?? null;
    setOpen(null);
    settle({ day, to }).then((after) => { setUndo({ day, before, after }); setSaid(BD.appTripStopChanged(day)); focusChange(day); }, () => undefined);
  };
  const undoPick = (): void => {
    if (!settle || !undo) return;
    const { before, day } = undo;
    setUndo(null);
    setSaid('');
    settle({ restore: before }).then(() => focusChange(day), () => undefined);
  };
  const [found, setFound] = useState<RouteStop[] | null>(null);
  useEffect(() => {
    setFound(null);
    if (!key) return undefined;
    let alive = true;
    stops().then((s) => { if (alive) setFound(s); }, () => { if (alive) setFound([]); });
    return () => { alive = false; };
  }, [key, stops]);
  const [bedsFound, setBeds] = useState<DayBed[] | null>(null);
  useEffect(() => {
    setBeds(null);
    if (!key || !beds) return undefined;
    let alive = true;
    beds().then((b) => { if (alive) setBeds(b); }, () => { if (alive) setBeds(null); });
    return () => { alive = false; };
  }, [key, beds]);
  if (!trip) return null;
  const s = summaryOf(trip, { day1LeaveBy: snap.day1LeaveBy });
  const missingHeights = trip.route.ascentM === null;
  return (
    <Card title={TF.appTripSummaryTitle}>
      <div data-summary>
        <p class="tool-line"><strong>{s.name}</strong></p>
        <p class="tool-line">{s.distance} · {s.climbing}</p>
        {s.profile ? (
          <div class={ready ? 'trip-profile-box trip-profile-room' : 'trip-profile-box'}>
            <svg class="trip-profile" viewBox={`0 0 ${PROFILE_BOX.w} ${PROFILE_BOX.h}`} role="img" aria-label={TF.appTripProfileLabel(s.profile.minM, s.profile.maxM)} preserveAspectRatio="none">
              <path d={s.profile.path} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
            </svg>
            {found && found.length > 0 ? <ProfileStops route={trip.route} stops={found} /> : null}
          </div>
        ) : <p class="muted">{TR.appTripProfileNone}</p>}
        {ready ? null : <p class="muted">{W.appAheadStopsAfter} {BD.appTripBedsAfter}</p>}
        {s.note ? <p class="notice">{s.note}</p> : null}
        <ol class="trip-days">
          {s.stages.map((stage, i) => {
            const day = trip.route.stages[i];
            const near = day && bedsFound ? bedsFound.find((b) => b.day === day.day && b.endKm === day.endKm) : undefined;
            const stop = dayEndWords(trip, i, stage.text, near?.town ?? null);
            const held = dayStopOf(trip, i);
            const bed = !stop && day && bedsFound ? bedLine(bedsFound.find((b) => b.day === day.day && b.endKm === day.endKm), day.endKm - day.startKm) : null;
            const n = i + 1;
            return (
              <li key={i}>
                <span>{stop ? stop.text : stage.text}</span>
                <span class="muted trip-day-detail">{stage.detail}</span>
                {stop?.below ? <span class="muted trip-day-detail" data-day-stop>{stop.below}</span> : null}
                {bed ? <span class="muted trip-day-detail" data-day-bed>{bed}</span> : null}
                {stop ? (
                  <span class="trip-stop-actions">
                    <button type="button" class="btn linky" data-stop-change={n} aria-expanded={open?.day === n ? 'true' : 'false'} aria-controls={open?.day === n ? `trip-stop-choices-${n}` : undefined}
                      aria-label={BD.appTripStopChangeLabel(n, held?.placeId ? held.name : null)} onClick={() => openChoices(n)}>{BD.appTripStopChange}</button>
                    {undo?.day === n ? <><span class="muted">{BD.appTripStopChanged(n)}</span> <button type="button" class="btn linky" onClick={undoPick}>{BD.appTripStopUndo}</button></> : null}
                  </span>
                ) : null}
                {open?.day === n ? <StopChoices day={n} choices={open.list} current={held?.placeId ?? null} pick={(to) => pick(n, to)} /> : null}
              </li>
            );
          })}
        </ol>
        <p class="visually-hidden" role="status" aria-live="polite" data-stop-said>{said}</p>
        {missingHeights ? <p class="muted">{TR.appTripHeightsPending}</p> : snap.heightsLookedUp ? <p class="muted">{TF.appTripHeightsCredit}</p> : null}
        {trip.route.source === 'planned' || snap.prepared?.build ? <OsmCredit lead={TF.appTripOsmLead} date={packDate(snap.prepared?.build)} /> : null}
        <p class="muted"><a href="/legal/licences/">{W.appTripLicences}</a></p>
      </div>
    </Card>
  );
}

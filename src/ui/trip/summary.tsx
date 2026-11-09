// The route summary (spec section 3.3): distance, climbing, the elevation profile and the stage model's days. What it says about
// heights and places is only what was done: looked-up heights are credited, a route without them says so.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RouteStop } from '../../core/screen/route-stops.ts';
import { windowKm } from '../../core/engines/day-beds.ts';
import type { DayBed } from '../../core/engines/day-beds.ts';
import type { Route } from '../../core/types.ts';
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

export function RouteSummary({ snap, stops, beds }: { snap: TripSnapshot; stops: TripServices['stops']; beds?: TripServices['dayBeds'] }) {
  const { trip } = snap;
  // The stops come once Get ready offline has saved places: read again when the route, its days, its date, what was saved or the
  // forecast (Update weather moves the cover icons: review of PR 73, M2) change.
  const ready = trip !== null && (snap.prepared !== null || snap.places > 0);
  const key = ready ? [trip.route.id, trip.route.stages.length, trip.departureDate, trip.startTime, snap.places, snap.prepared?.at?.getTime?.(), snap.forecastFetchedAt?.getTime()].join('|') : '';
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
            const bed = day && bedsFound ? bedLine(bedsFound.find((b) => b.day === day.day && b.endKm === day.endKm), day.endKm - day.startKm) : null;
            return (
              <li key={i}>
                <span>{stage.text}</span>
                <span class="muted trip-day-detail">{stage.detail}</span>
                {bed ? <span class="muted trip-day-detail" data-day-bed>{bed}</span> : null}
              </li>
            );
          })}
        </ol>
        {missingHeights ? <p class="muted">{TR.appTripHeightsPending}</p> : snap.heightsLookedUp ? <p class="muted">{W.appTripHeightsCredit}</p> : null}
        {trip.route.source === 'planned' || snap.prepared?.build ? <OsmCredit lead={TF.appTripOsmLead} date={packDate(snap.prepared?.build)} /> : null}
        <p class="muted"><a href="/legal/licences/">{W.appTripLicences}</a></p>
      </div>
    </Card>
  );
}

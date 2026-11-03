// The route summary (spec section 3.3): distance, climbing, the elevation profile and the stage model's days. What it says about
// heights and places is only what was done: looked-up heights are credited, a route without them says so.
import { shortMapDate, W } from '../../core/wording/en.ts';
import { Card } from '../card.tsx';
import { PROFILE_BOX, summaryOf } from './model.ts';
import type { TripSnapshot } from './services.ts';

export function RouteSummary({ snap }: { snap: TripSnapshot }) {
  const { trip, settings } = snap;
  if (!trip) return null;
  const s = summaryOf(trip, { nights: settings.nights, day1LeaveBy: snap.day1LeaveBy });
  const packDate = shortMapDate(snap.prepared?.build?.builtAt ?? null);
  const missingHeights = trip.route.ascentM === null;
  return (
    <Card title={W.appTripSummaryTitle}>
      <div data-summary>
        <p class="tool-line"><strong>{s.name}</strong></p>
        <p class="tool-line">{s.distance} · {s.climbing}</p>
        {s.profile ? (
          <svg class="trip-profile" viewBox={`0 0 ${PROFILE_BOX.w} ${PROFILE_BOX.h}`} role="img" aria-label={W.appTripProfileLabel(s.profile.minM, s.profile.maxM)} preserveAspectRatio="none">
            <path d={s.profile.path} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
          </svg>
        ) : <p class="muted">{W.appTripProfileNone}</p>}
        {s.note ? <p class="notice">{s.note}</p> : null}
        <ol class="trip-days">
          {s.stages.map((stage, i) => (
            <li key={i}>
              <span>{stage.text}</span>
              <span class="muted trip-day-detail">{stage.detail}</span>
            </li>
          ))}
        </ol>
        {missingHeights ? <p class="muted">{W.appTripHeightsPending}</p> : snap.heightsLookedUp ? <p class="muted">{W.appTripHeightsCredit}</p> : null}
        {snap.prepared?.build ? <p class="muted">{W.appTripOsm(packDate)}</p> : null}
        <p class="muted"><a href="#/you/legal">{W.appTripLicences}</a></p>
      </div>
    </Card>
  );
}

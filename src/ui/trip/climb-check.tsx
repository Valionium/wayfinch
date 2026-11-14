// Climb check's list (CC-LIST, CC-TRIP): a chunk of its own, loaded when the rider opens Climb check under Trip's days, so neither
// the first screen nor the route summary carries the maths. It renders what climbCheck gives and works out nothing of its own.
import { climbCheck, shownClimbMin } from '../../core/climb/check.ts';
import type { ClimbLevel } from '../../core/climb/check.ts';
import type { Route } from '../../core/types.ts';
import { CC } from '../../core/wording/en-climb.ts';
import { showKm } from '../../core/wording/en.ts';

const LEVEL: Record<ClimbLevel, string> = { steady: CC.appClimbSteady, steep: CC.appClimbSteep, walk: CC.appClimbWalk };

export function ClimbList({ route, flatKph, ebike }: { route: Route; flatKph: number; ebike: boolean }) {
  const check = climbCheck(route, { flatKph, ebike });
  if (check.kind === 'no-heights') return <p class="notice">{CC.appClimbNoHeights}</p>;
  if (check.kind === 'none') return <p>{CC.appClimbNone}</p>;
  return (
    <>
      <p class="muted">{CC.appClimbLead(String(flatKph))}</p>
      {ebike ? <p class="muted" data-climb-ebike>{CC.appClimbEbike}</p> : null}
      <ol class="trip-days" data-climb-list aria-label={CC.appClimbListLabel}>
        {check.climbs.map((c) => (
          <li key={`${c.startKm}-${c.topKm}`} data-climb-level={c.level}>
            <strong>{CC.appClimbWhere(c.firstDay, c.lastDay, showKm(c.startKm), showKm(c.topKm))}</strong>
            <span>{CC.appClimbFigures(showKm(c.lengthKm), c.gainM, c.avgGradePct.toFixed(1), c.steepestPct.toFixed(1))}</span>
            <span>{c.ridingMin === null ? CC.appClimbNoTime : CC.appClimbTime(shownClimbMin(c.ridingMin))}</span>
            {c.dayEnds.map((d) => <span key={d.day} data-climb-day-end>{CC.appClimbDayEnd(d.day, showKm(d.km))}</span>)}
            {c.level === 'walk' ? <strong>{LEVEL[c.level]}</strong> : <span class="muted">{LEVEL[c.level]}</span>}
          </li>
        ))}
      </ol>
      {check.more > 0 ? <p class="muted">{CC.appClimbMore(check.more)}</p> : null}
    </>
  );
}

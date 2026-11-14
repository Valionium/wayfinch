// Climb check's list (CC-LIST, CC-TRIP): a chunk of its own, loaded when the rider opens Climb check under Trip's days, so neither
// the first screen nor the route summary carries the maths. It renders what climbCheck gives and works out nothing of its own.
import { useMemo } from 'preact/hooks';
import { climbCheck, shownClimbMin } from '../../core/climb/check.ts';
import type { ClimbLevel } from '../../core/climb/check.ts';
import { shownAscentM } from '../../core/route/stages.ts';
import type { Route } from '../../core/types.ts';
import { CC } from '../../core/wording/en-climb.ts';
import { showKm } from '../../core/wording/en.ts';
import { thousands } from './model.ts';
import './climb.css';

const LEVEL: Record<ClimbLevel, string> = { steady: CC.appClimbSteady, steep: CC.appClimbSteep, walk: CC.appClimbWalk };

export function ClimbList({ route, flatKph, ebike }: { route: Route; flatKph: number; ebike: boolean }) {
  const check = useMemo(() => climbCheck(route, { flatKph, ebike }), [route, flatKph, ebike]);
  if (check.kind === 'no-heights') return <p class="notice">{CC.appClimbNoHeights}</p>;
  if (check.kind === 'none') return <p>{CC.appClimbNone}</p>;
  return (
    <>
      <p class="muted">{CC.appClimbLead(String(flatKph))}</p>
      {ebike ? <p class="muted" data-climb-ebike>{CC.appClimbEbike}</p> : null}
      <ol class="climb-list" aria-label={CC.appClimbListLabel}>
        {check.climbs.map((c) => (
          <li key={`${c.startKm}-${c.topKm}`} data-climb-level={c.level}>
            <strong>{CC.appClimbWhere(c.day, showKm(c.startKm), showKm(c.topKm))}</strong>
            <span>{CC.appClimbFigures(showKm(c.lengthKm), thousands(shownAscentM(c.gainM)), c.avgGradePct.toFixed(1), c.steepestPct.toFixed(1))}</span>
            <span>{c.ridingMin === null ? CC.appClimbNoTime : CC.appClimbTime(shownClimbMin(c.ridingMin))}</span>
            <span class={c.level === 'walk' ? 'climb-walk' : 'muted'}>{LEVEL[c.level]}</span>
          </li>
        ))}
      </ol>
      {check.more > 0 ? <p class="muted">{CC.appClimbMore(check.more)}</p> : null}
    </>
  );
}

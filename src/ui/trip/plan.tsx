// Plan from A to B (spec section 7.1): filled in by Task 14.
import type { Route, Trip } from '../../core/types.ts';
import type { TripServices } from './services.ts';

export function PlanAB(props: { services: TripServices; old: Trip | null; onRoute: (found: { route: Route; hadHeights: boolean }) => Promise<void> }) {
  return props.services ? null : null;
}

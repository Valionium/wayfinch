// What En route is for, before there is a route (owner's finding M, 8 Nov 2026): two lines, a chunk of its own so the first screen
// does not carry them. The "Add a route in Trip" button under them is in the first screen.
import { E } from '../../core/wording/en-enroute.ts';

export function EmptyLines() {
  return (
    <>
      <p>{E.emptyWhat}</p>
      <p class="muted">{E.emptyOffline}</p>
    </>
  );
}

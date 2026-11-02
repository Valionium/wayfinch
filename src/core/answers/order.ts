// The one final comparator (spec section 6, INV-29). Every ranking and every nearest list ends with it, so the order of
// places in the packs never changes an answer.
import type { Place, RescuePoint, Roof } from '../types.ts';

type Orderable = Place | Roof | RescuePoint;

// Places come before roofs. Rescue points are never listed together with them; they come last so the order is total.
const rank = (x: Orderable): 0 | 1 | 2 => ('id' in x ? 0 : 'ref' in x ? 2 : 1);
const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Places by id compared as text; roofs and rescue points by latitude, then longitude. */
export function compareFinal(a: Orderable, b: Orderable): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if ('id' in a && 'id' in b) return text(a.id, b.id);
  return a.lat - b.lat || a.lon - b.lon;
}

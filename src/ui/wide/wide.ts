// Whether the window is wide enough for the rail layout (spec section 3.8: from 840 px). The layout itself is CSS; this is only
// for the few things that exist on a computer and not on a phone: the keys along the strip, the open picker and the hint.
import { signal } from '@preact/signals';

export const RAIL_MIN_PX = 840;

const query = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${RAIL_MIN_PX}px)`) : null;

/** True while the window is 840 px wide or more. A test without a window has the phone. */
export const railSignal = signal<boolean>(query?.matches ?? false);

query?.addEventListener?.('change', (e) => { railSignal.value = e.matches; });

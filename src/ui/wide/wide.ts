// Whether the window is wide enough for the rail layout (spec section 3.8: from 840 px). The layout itself is CSS; this is only
// for the few things that exist on a computer and not on a phone: the keys along the strip, the open picker and the hint.
import { signal } from '@preact/signals';

export const RAIL_MIN_PX = 840;

const query = typeof matchMedia === 'function' ? matchMedia(`(min-width: ${RAIL_MIN_PX}px)`) : null;

/** True while the window is 840 px wide or more. A test without a window has the phone. */
export const railSignal = signal<boolean>(query?.matches ?? false);

query?.addEventListener?.('change', (e) => { railSignal.value = e.matches; });

/**
 * Keeps the focused element out from under the bottom bar (WCAG 2.4.11), in windows of 600 px or more. Chromium honours the page's
 * scroll padding when it scrolls to a focused element; Firefox leaves an element that is already inside the window where it is, under
 * the bar. So when the bar covers it, scroll by what covers it. The rail covers nothing: it has a column of its own.
 */
export function installFocusClear(target: Window, doc: Document): () => void {
  const onFocus = (e: FocusEvent): void => {
    if (target.innerWidth < 600 || target.innerWidth >= RAIL_MIN_PX) return;
    const el = e.target as HTMLElement | null;
    const bar = doc.querySelector('nav.tabs');
    if (!el || !bar || bar.contains(el) || typeof el.getBoundingClientRect !== 'function') return;
    const covered = el.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
    if (covered > 0) target.scrollBy(0, covered + 8);
  };
  doc.addEventListener('focusin', onFocus);
  return () => doc.removeEventListener('focusin', onFocus);
}

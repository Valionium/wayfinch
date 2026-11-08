// The one top bar "← Back to Wayfinch" of every tool and of the legal pages (owner's list of 7 Nov 2026, items 8 and 9): a sticky bar that
// slides away while the rider scrolls down and comes back at once on any scroll up, as a browser's address bar does. It is never hidden
// from the keyboard or a screen reader: it stays in the page, comes back while it holds the focus, at the top of the page and at its end.
// Wayfinch's screens use it through back-bar.tsx; the bag planner and the legal pages through /back-bar.js (page.ts), built from this file.

export const BAR_AWAY = 'wf-bar-away';

/** The part of a window the bar reads: a real window, or a test's stand-in. */
export type BarWindow = Pick<Window, 'scrollY' | 'innerHeight' | 'addEventListener' | 'removeEventListener'> & {
  document: { documentElement: HTMLElement; activeElement: Element | null };
};

/**
 * Watches the page's scrolling for one bar. Away only while the page moves down, past the top and short of its end, and the focus is
 * not in the bar; the stylesheet keeps an away bar at its place while it is not stuck (`top` moves a sticky bar only once it sticks).
 * Sets `--wf-bar-h` on the root, the bar's height, which the stylesheet uses for how far it slides and for scroll padding. Returns how to stop.
 */
export function watchBar(bar: HTMLElement, win: BarWindow = window): () => void {
  const root = win.document.documentElement;
  let last = win.scrollY;
  let height = -1;
  const measure = (): void => {
    if (bar.offsetHeight !== height) { height = bar.offsetHeight; root.style.setProperty('--wf-bar-h', `${height}px`); }
  };
  const onScroll = (): void => {
    measure();
    const y = win.scrollY;
    const end = y + win.innerHeight >= root.scrollHeight - 2;
    const away = y > last && y > height && !end && !bar.contains(win.document.activeElement);
    // Only a real move changes it: a scroll event with no change in position (a resize, the browser's own adjusting) leaves it as it is.
    if (y !== last || end || y <= height) bar.classList.toggle(BAR_AWAY, away);
    last = y;
  };
  const onFocus = (): void => { bar.classList.remove(BAR_AWAY); };
  measure();
  win.addEventListener('scroll', onScroll, { passive: true });
  // Its height can change without a scroll (the phone turned, larger text, a font arriving): measured again then too (review of PR 70, M4).
  win.addEventListener('resize', measure);
  win.addEventListener('orientationchange', measure);
  let watch: ResizeObserver | null = null;
  try { if (typeof ResizeObserver === 'function') { watch = new ResizeObserver(measure); watch.observe(bar); } } catch { watch = null; }
  try { void (win.document as Document).fonts?.ready.then(measure, () => undefined); } catch { /* no font loading to wait for */ }
  bar.addEventListener('focusin', onFocus);
  return () => {
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('resize', measure);
    win.removeEventListener('orientationchange', measure);
    watch?.disconnect();
    bar.removeEventListener('focusin', onFocus);
    bar.classList.remove(BAR_AWAY);
  };
}

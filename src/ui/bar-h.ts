// The update bar's real height, in `--wf-update-h` on the root: the back bar sticks just below the bar and a focused field scrolls to below it
// (back-bar.css, theme.css). The note makes the bar two or three lines taller and a notch adds to it, so it is measured, as back-bar.ts does for
// its bar: now, on every change of the bar's size, and when a font arrives. The stylesheet reads it only while a bar is there.

let stop: (() => void) | undefined;

/** Starts measuring `bar` (and stops measuring an earlier one): the variable is dropped when the next bar is gone from the page. */
export function trackHeight(bar: HTMLElement): void {
  stop?.();
  const root = document.documentElement;
  const measure = (): void => { root.style.setProperty('--wf-update-h', `${bar.offsetHeight}px`); };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);
  let watch: ResizeObserver | null = null;
  try { if (typeof ResizeObserver === 'function') { watch = new ResizeObserver(measure); watch.observe(bar); } } catch { watch = null; }
  try { void document.fonts?.ready.then(measure, () => undefined); } catch { /* no font loading to wait for */ }
  stop = () => {
    window.removeEventListener('resize', measure);
    window.removeEventListener('orientationchange', measure);
    watch?.disconnect();
    root.style.removeProperty('--wf-update-h');
  };
}

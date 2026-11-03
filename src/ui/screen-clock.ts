// Ahead's clock (review of 3 November 2026): while the page is in front, a callback once a minute, so a screen left on follows the
// time. It only calls back: no request, no store. Weather never comes through here; it keeps its own rules.

/** Calls `tick` every `ms` while the page is visible; stops while it is hidden. Returns how to stop. */
export function whileVisible(tick: () => void, ms: number, doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const shown = (): boolean => !doc || doc.visibilityState !== 'hidden';
  const start = (): void => { if (timer === null) timer = setInterval(() => { if (shown()) tick(); }, ms); };
  const stop = (): void => { if (timer !== null) clearInterval(timer); timer = null; };
  const change = (): void => { if (shown()) start(); else stop(); };
  if (shown()) start();
  doc?.addEventListener('visibilitychange', change);
  return () => { stop(); doc?.removeEventListener('visibilitychange', change); };
}

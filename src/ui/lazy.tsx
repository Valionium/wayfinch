// A screen loaded on first use, as its own chunk, so the JavaScript before the first screen stays small (spec section 4.5). The
// worker precaches every chunk, so a lazy screen opens offline as any other.
import type { FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { W } from '../core/wording/en.ts';

/** `Fallback`: what shows while it loads, and if it can't, instead of the loading line (a first part of the screen that is complete alone). */
export function lazy<P extends object>(load: () => Promise<FunctionComponent<P>>, Fallback?: FunctionComponent<P>): FunctionComponent<P> {
  let loaded: FunctionComponent<P> | null = null;
  let loading: Promise<FunctionComponent<P>> | null = null;
  return function Lazy(props: P) {
    const [Component, setComponent] = useState<FunctionComponent<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Component) return;
      let alive = true;
      loading ??= load().then((c) => (loaded = c));
      loading.then((c) => { if (alive) setComponent(() => c); }, () => { loading = null; if (alive) setFailed(true); });
      return () => { alive = false; };
    }, [Component, attempt]);
    if (Component) return <Component {...props} />;
    if (Fallback) {
      return (
        <>
          <Fallback {...props} />
          {failed ? <p class="notice" role="status">{W.appLazyFailed} <button type="button" class="btn" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>{W.appLazyRetry}</button></p> : null}
        </>
      );
    }
    return failed ? <p class="notice" role="status">{W.appLazyFailed}</p> : <p class="muted" aria-busy="true">{W.appLazyLoading}</p>;
  };
}

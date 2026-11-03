// The connectivity check of section 9.4: one HEAD for the app's own address, with nothing about the rider. Any HTTP answer
// means online; navigator.onLine is only a hint. The worker never answers it.
const WAIT_MS = 5000;

export async function checkConnectivity(fetcher: typeof fetch, now: () => number = Date.now, waitMs: number = WAIT_MS): Promise<{ online: boolean; clockOffsetMs: number | null }> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), waitMs);
  try {
    const answer = await fetcher('/', { method: 'HEAD', cache: 'no-store', signal: stop.signal });
    const date = Date.parse(answer.headers.get('Date') ?? '');
    const age = Number(answer.headers.get('Age') ?? 0);
    const clockOffsetMs = Number.isFinite(date) ? date + (Number.isFinite(age) ? age * 1000 : 0) - now() : null;
    return { online: true, clockOffsetMs };
  } catch {
    return { online: false, clockOffsetMs: null };
  } finally {
    clearTimeout(timer);
  }
}

// One write at a time in this window (review of PR 101, I5 and M5). The store refuses a write over a version another window wrote
// since this one read it, but not one this window wrote itself: so every Trip write of the window takes its turn here, each
// reading the trip only once the one before has written. Trip's services (each of their objects) and the day stops' settles alike.
let queue: Promise<unknown> = Promise.resolve();

export function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

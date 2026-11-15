// One write at a time in this window (review of PR 101, I5 and M5). The store refuses a write over a version another window wrote
// since this one read it, but not one this window wrote itself: so the window's Trip writes take their turn here, each reading the
// trip only once the one before has written: Trip's services (each of their objects), the day stops' settles and Remove this trip.
// Import and Delete co-pilot data write outside it (AGENTS.md, src/store).
let queue: Promise<unknown> = Promise.resolve();

export function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/** For tests only (review of PR 175, m-5): each test starts with an empty queue, so a turn one test left hanging never holds the next. */
export function resetTurn(): void {
  queue = Promise.resolve();
}

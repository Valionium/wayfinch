// While Ahead asks which pass, the screen's words that would say "No position yet" are swapped for the question's (after the launch,
// 7 Nov 2026; review of PR 65, M1). A chunk of its own, loaded with Update position's tap together with the question's words: the first
// screen carries neither (re-check of PR 65, R2).
import type { Screen } from '../core/screen/screen.ts';
import { A } from '../core/wording/en-ask.ts';
import { W } from '../core/wording/en.ts';

export { A };

const escaped = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The notes, and the help chips' "measured from km …": a position was found and waits for the rider's answer. */
export function whileAsking(s: Screen): void {
  s.notes = s.notes.map((n) => (n === W.routeNoPositionFromStart ? A.askPassFromStart : n));
  const [before, after] = W.helpFromNoPosition('\u0000').split('\u0000') as [string, string];
  const said = new RegExp(`${escaped(before)}(.+?)${escaped(after)}(?= |$)`);
  for (const chip of Object.values(s.chips)) chip.detail = chip.detail.replace(said, (_, km: string) => A.askPassMeasuredFrom(km));
}

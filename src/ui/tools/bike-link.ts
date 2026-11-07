// A tool address that also chooses the bike (sub-project 11): #/tools/tyre?bike=<id>. The app takes the choice once and leaves the plain
// address. Its own module, loaded only for such an address (app.tsx), so the first screen does not carry it.
import { bikeSource } from '../bike/live.ts';
import { noteBikeChoice } from './bike-choice.ts';

/** The address of a tool that chooses the bike on the way in. */
export const toolHref = (screen: 'tools/tyre' | 'tools/care', bikeId: string): string => `#/${screen}?bike=${encodeURIComponent(bikeId)}`;

/** The bike id a tool address names, when it is a well-formed one. */
export const toolLinkBike = (hash: string): string | null => /^#\/tools\/[a-z]+\?bike=([a-zA-Z0-9_-]{1,100})$/.exec(hash)?.[1] ?? null;

/** Chooses the named bike if this phone has it saved (an id nobody has chooses nothing), and cleans the address either way. */
export function takeBikeLink(): void {
  const id = toolLinkBike(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}${location.hash.replace(/\?.*$/, '')}`);
  if (id && bikeSource.value.bikes.some((b) => b.id === id)) noteBikeChoice(id);
}

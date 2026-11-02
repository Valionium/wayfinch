// The shell's one piece of navigation state: which screen shows, mirrored to location.hash (spec section 3.1).
import { signal } from '@preact/signals';

export const SCREEN_NAMES = ['ahead', 'trip', 'tools', 'tools/tyre', 'you', 'you/legal'] as const;
export type ScreenName = (typeof SCREEN_NAMES)[number];

/** The four tabs; a screen below a tab lights that tab. */
export type TabName = 'ahead' | 'trip' | 'tools' | 'you';
export const tabOf = (name: ScreenName): TabName => name.split('/')[0] as TabName;

/** `#/tools/tyre` gives 'tools/tyre'. Anything that is not a screen gives `fallback`. */
export function screenFromHash(hash: string, fallback: ScreenName): ScreenName {
  const name = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return (SCREEN_NAMES as readonly string[]).includes(name) ? (name as ScreenName) : fallback;
}

/** No address of its own: Ahead while a trip runs, otherwise Trip (3.1). With no store yet, no trip runs. */
export const defaultScreen = (tripRunning: boolean): ScreenName => (tripRunning ? 'ahead' : 'trip');

const hasWindow = typeof location !== 'undefined';
export const screenSignal = signal<ScreenName>(screenFromHash(hasWindow ? location.hash : '', defaultScreen(false)));

export function go(name: ScreenName): void {
  screenSignal.value = name;
  if (hasWindow && location.hash !== `#/${name}`) location.hash = `#/${name}`;
}

if (typeof window !== 'undefined') {
  // Back and forward, and links with an address of their own.
  window.addEventListener('hashchange', () => {
    screenSignal.value = screenFromHash(location.hash, defaultScreen(false));
  });
}

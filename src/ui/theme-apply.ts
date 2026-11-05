// The rider's theme choice (spec section 3.5) put on the page: "auto" follows the phone, light and dark override it.
// One choice for both apps (owner's try-out, 5 November 2026): the rule is in theme-choice.ts, loaded after the first screen. Before
// it, the first paint takes the newer of the two apps' records as they are, else this app's own setting; theme-choice.ts then checks.
import { signal } from '@preact/signals';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** The choice shown now, so You's buttons and the drawings follow a change made in either app. */
export const themeChoice = signal<ThemeChoice>('auto');

export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  themeChoice.value = theme;
}

/** The theme for the first paint: the newer record of the two apps (ISO times order as text), else Wayfinch's own setting. */
export function firstTheme(own: ThemeChoice): ThemeChoice {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- read as is: theme-choice.ts checks it right after
  const read = (key: string): any => { try { return JSON.parse(localStorage.getItem(key)!); } catch { return null; } };
  const mine = read('copilot:theme:v1');
  const theirs = read('loadcheck:theme:v1');
  return (theirs?.at > (mine?.at ?? '') ? theirs : mine)?.theme ?? own;
}

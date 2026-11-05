// The rider's theme choice (spec section 3.5) put on the page: "auto" follows the phone, light and dark override it.
// One choice for both apps (owner's try-out, 5 November 2026): the rule is in theme-choice.ts, loaded after the first screen. The first
// paint takes the newer of the two apps' records, as both write them, else this app's own setting.
import { signal } from '@preact/signals';

export type ThemeChoice = 'auto' | 'light' | 'dark';

/** The choice shown now, so You's buttons and the drawings follow a change made in either app. */
export const themeChoice = signal<ThemeChoice>('auto');

export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  themeChoice.value = theme;
}

/**
 * The theme for the first paint: the newer of the two apps' records, else Wayfinch's own setting. A record counts only as both apps
 * write it, {app, kind: 'theme', v: 1, theme, at} with an ISO time, which orders as text; anything else waits for the rule
 * (theme-choice.ts, right after the first screen; review M5). Load Check's older choice alone is written as Wayfinch's record by the
 * rule, so from the next start on the first paint has it too (review I3).
 */
export function firstTheme(own: ThemeChoice): ThemeChoice {
  try {
    const record = (key: string, app: string): [string, ThemeChoice] | null => {
      const m = /^\{"app":"([a-z-]+)","kind":"theme","v":1,"theme":"(auto|light|dark)","at":"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)"\}$/.exec(localStorage.getItem(key) ?? '');
      return m?.[1] === app ? [m[3]!, m[2] as ThemeChoice] : null;
    };
    const mine = record('copilot:theme:v1', 'copilot');
    const theirs = record('loadcheck:theme:v1', 'load-check');
    return (theirs && !(mine && mine[0] >= theirs[0]) ? theirs : mine)?.[1] ?? own;
  } catch {
    return own;
  }
}

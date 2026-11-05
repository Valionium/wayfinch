// The rider's theme choice (spec section 3.5) put on the page: "auto" follows the phone, light and dark override it.
// One choice for both apps (owner's try-out, 5 November 2026). Each app writes only its own storage (section 7.1): Wayfinch
// copilot:theme:v1 with each choice in You, the bag planner loadcheck:theme:v1 with each tap on its theme button, both
// {app, kind: 'theme', v: 1, theme, at}. Both apps show the most recent; at the same moment Wayfinch's. With neither, a rider's
// older choices: Wayfinch's own light or dark, else the bag planner's, else automatic. The bag planner's page decides the same way.
import { signal } from '@preact/signals';

export type ThemeChoice = 'auto' | 'light' | 'dark';
const CHOICES: readonly string[] = ['auto', 'light', 'dark'];

/** The choice shown now, so You's buttons and the drawings follow a change made in either app. */
export const themeChoice = signal<ThemeChoice>('auto');

export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  themeChoice.value = theme;
}

/** The one theme, from what both apps stored; `get` reads one stored text. */
export function themeFrom(get: (key: string) => string | null): ThemeChoice {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored by either app, checked field by field below
  const read = (key: string): any => { try { return JSON.parse(get(key) ?? 'null'); } catch { return null; } };
  /** A choice record of that app: [when, what], or null when it is not one. */
  const choice = (key: string, app: string): [number, ThemeChoice] | null => {
    const v = read(key);
    const at = v?.app === app && v.kind === 'theme' && v.v === 1 && CHOICES.includes(v.theme) && typeof v.at === 'string' ? Date.parse(v.at) : NaN;
    return Number.isNaN(at) ? null : [at, v.theme];
  };
  const mine = choice('copilot:theme:v1', 'copilot');
  const theirs = choice('loadcheck:theme:v1', 'load-check');
  if (mine || theirs) return (theirs && (!mine || theirs[0] > mine[0]) ? theirs : mine)![1];
  const own = read('copilot:settings')?.theme;
  const old = read('loadcheck:theme');
  return own === 'light' || own === 'dark' ? own : old === 'light' || old === 'dark' ? old : 'auto';
}

export const themeNow = (): ThemeChoice => themeFrom((key) => { try { return localStorage.getItem(key); } catch { return null; } });

/** Once per page: a choice made in the bag planner (or another Wayfinch window) shows at once, or when this tab shows again. */
export function followTheme(): void {
  const follow = (): void => applyTheme(themeNow());
  window.addEventListener('storage', (e) => { if (e.key === null || /^(copilot|loadcheck):theme/.test(e.key)) follow(); });
  window.addEventListener('pageshow', follow);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) follow(); });
}

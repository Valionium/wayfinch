// One theme for both apps (owner's try-out, 5 November 2026). Each app writes only its own storage (spec section 7.1): Wayfinch
// copilot:theme:v1 with each choice in You and an import that brings settings, the bag planner loadcheck:theme:v1 with each tap on its
// theme button, both {app, kind: 'theme', v: 1, theme, at}. Both apps show the most recent; at the same moment Wayfinch's. With
// neither, a rider's older choices: Wayfinch's own light or dark, else the bag planner's, else automatic. The bag planner's page
// decides the same way (THEME-ONE). Loaded after the first screen (page-return.ts, You), so the first screen does not carry it.
import type { ThemeChoice } from './theme-apply.ts';

const CHOICES: readonly string[] = ['auto', 'light', 'dark'];


export const THEME_CHOICE_KEY = 'copilot:theme:v1';

export function noteThemeChoice(theme: ThemeChoice, at: Date = new Date()): void {
  try {
    localStorage.setItem(THEME_CHOICE_KEY, JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at: at.toISOString() }));
  } catch {
    // Storage refused: the settings still hold the choice on this device, and the bag planner keeps its own.
  }
}

/** The one theme, from what both apps stored; `get` reads one stored text. */
export function themeFrom(get: (key: string) => string | null): ThemeChoice {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored by either app, checked field by field
  const read = (key: string): any => { try { return JSON.parse(get(key)!); } catch { return null; } };
  let theme: ThemeChoice | null = null;
  let at = -Infinity;
  // the bag planner's first, so Wayfinch's wins a tie
  for (const [key, app] of [['loadcheck:theme:v1', 'load-check'], ['copilot:theme:v1', 'copilot']]) {
    const v = read(key!);
    const t = typeof v?.at === 'string' ? Date.parse(v.at) : NaN;
    if (v?.app === app && v.kind === 'theme' && v.v === 1 && CHOICES.includes(v.theme) && t >= at) { theme = v.theme; at = t; }
  }
  const own = read('copilot:settings')?.theme;
  const old = read('loadcheck:theme');
  return theme ?? (own === 'light' || own === 'dark' ? own : old === 'light' || old === 'dark' ? old : 'auto');
}

export const themeNow = (): ThemeChoice => themeFrom((key) => { try { return localStorage.getItem(key); } catch { return null; } });

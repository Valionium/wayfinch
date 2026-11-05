// One theme for both apps (owner's try-out, 5 November 2026). Each app writes only its own storage (spec section 7.1): Wayfinch
// copilot:theme:v1 with each choice in You and an import that brings settings, the bag planner loadcheck:theme:v1 with each tap on its
// theme button, both {app, kind: 'theme', v: 1, theme, at}. Both apps show the most recent; at the same moment Wayfinch's. With
// neither, a rider's older choices: Wayfinch's own light or dark, else the bag planner's, else automatic. The bag planner's page
// decides the same way (THEME-ONE). Loaded after the first screen (page-return.ts, You), so the first screen does not carry it.
import type { ThemeChoice } from './theme-apply.ts';


const CHOICES: readonly string[] = ['auto', 'light', 'dark'];

/** A theme record of that app, checked: [when, what], or null when it is not one. */
export function themeRecord(get: (key: string) => string | null, key: string, app: string): [number, ThemeChoice] | null {
  try {
    const v = JSON.parse(get(key)!);
    const at = typeof v.at === 'string' ? Date.parse(v.at) : NaN;
    return v.app === app && v.kind === 'theme' && v.v === 1 && CHOICES.includes(v.theme) && !Number.isNaN(at) ? [at, v.theme] : null;
  } catch {
    return null;
  }
}

/** The newer of the two apps' records, Wayfinch's at the same moment; null with neither. */
export function newerRecord(get: (key: string) => string | null): ThemeChoice | null {
  const mine = themeRecord(get, 'copilot:theme:v1', 'copilot');
  const theirs = themeRecord(get, 'loadcheck:theme:v1', 'load-check');
  return (theirs && !(mine && mine[0] >= theirs[0]) ? theirs : mine)?.[1] ?? null;
}

export const THEME_CHOICE_KEY = 'copilot:theme:v1';
const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };

/** Wayfinch's record of a choice, stamped just after the bag planner's when that one is dated later (a clock set wrong: review I2). */
export function noteThemeChoice(theme: ThemeChoice, at: Date = new Date()): void {
  const theirs = themeRecord(read, 'loadcheck:theme:v1', 'load-check');
  try {
    localStorage.setItem(THEME_CHOICE_KEY, JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at: new Date(Math.max(at.getTime(), theirs ? theirs[0] + 1 : -Infinity)).toISOString() }));
  } catch {
    // Storage refused: the settings still hold the choice on this device, and the bag planner keeps its own.
  }
}

/** The one theme, from what both apps stored; `get` reads one stored text. */
export function themeFrom(get: (key: string) => string | null): ThemeChoice {
  const newer = newerRecord(get);
  if (newer) return newer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- older records of either app, read as they are
  const old = (key: string): any => { try { return JSON.parse(get(key)!); } catch { return null; } };
  const own = old('copilot:settings')?.theme;
  const lc = old('loadcheck:theme');
  return own === 'light' || own === 'dark' ? own : lc === 'light' || lc === 'dark' ? lc : 'auto';
}

export const themeNow = (): ThemeChoice => themeFrom(read);

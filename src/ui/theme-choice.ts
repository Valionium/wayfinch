// Wayfinch's own record of a theme the rider chose, in You or by an import (owner's try-out, 5 November 2026): the bag planner reads it,
// and theme-apply.ts weighs it against the bag planner's. Only You and its services load this, so the first screen does not carry it.
import type { ThemeChoice } from './theme-apply.ts';

export const THEME_CHOICE_KEY = 'copilot:theme:v1';

export function noteThemeChoice(theme: ThemeChoice, at: Date = new Date()): void {
  try {
    localStorage.setItem(THEME_CHOICE_KEY, JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at: at.toISOString() }));
  } catch {
    // Storage refused: the settings still hold the choice on this device, and the bag planner keeps its own.
  }
}

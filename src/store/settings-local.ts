// The small settings in localStorage (spec section 4.4). Readable at once, so the theme is known before the first paint.
import { nextStamp } from './changed.ts';
import { goodSettings } from './rules.ts';
import type { Settings } from './rules.ts';

export const SETTINGS_KEY = 'copilot:settings';

export function readLocalSettings(): { settings: Settings; stamp: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as { updatedAt?: unknown } | null;
    return { settings: goodSettings(raw), stamp: raw && typeof raw.updatedAt === 'string' ? raw.updatedAt : null };
  } catch {
    return { settings: goodSettings(null), stamp: null };
  }
}

/** Writes the given fields over what's stored. Returns the new stamp, or null when the browser refused it. */
export function writeLocalSettings(fields: Partial<Settings>): string | null {
  const { settings, stamp } = readLocalSettings();
  const updatedAt = nextStamp(stamp);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ updatedAt, ...settings, ...fields }));
    return updatedAt;
  } catch {
    return null;
  }
}

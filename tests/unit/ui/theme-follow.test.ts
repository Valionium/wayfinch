// @vitest-environment jsdom
// One theme for both apps (owner's try-out, 5 November 2026): Wayfinch shows a choice made in the bag planner at once, and in a tab that
// was hidden or cached when it shows again. The rule itself, and the page deciding alike: tests/unit/contracts/theme.test.ts.
import { afterEach, describe, expect, test } from 'vitest';
import { applyTheme, followTheme, themeChoice, themeNow } from '../../../src/ui/theme-apply.ts';

const mine = (theme: unknown, at: unknown) => JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at });
const theirs = (theme: unknown, at: unknown) => JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme, at });
afterEach(() => { localStorage.clear(); applyTheme('auto'); });

describe('Wayfinch follows the bag planner\'s choice', () => {
  test('[THEME-SYNC] a change in the bag planner shows at once (storage event), and in a tab that was hidden or cached when it shows again', () => {
    followTheme();
    expect(themeNow()).toBe('auto');
    localStorage.setItem('loadcheck:theme:v1', theirs('light', new Date().toISOString()));
    window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:theme:v1' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(themeChoice.value).toBe('light');
    // missed while hidden: read when the tab shows again
    localStorage.setItem('loadcheck:theme:v1', theirs('dark', new Date(Date.now() + 1000).toISOString()));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // and out of the back-forward cache
    localStorage.setItem('copilot:theme:v1', mine('auto', new Date(Date.now() + 2000).toISOString()));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(themeChoice.value).toBe('auto');
  });
});


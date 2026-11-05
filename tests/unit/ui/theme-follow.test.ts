// @vitest-environment jsdom
// One theme for both apps (owner's try-out, 5 November 2026): Wayfinch shows a choice made in the bag planner at once, and in a tab that
// was hidden or cached when it shows again. The rule itself, and the page deciding alike: tests/unit/contracts/theme.test.ts.
import { afterEach, describe, expect, test } from 'vitest';
import '../../../src/ui/page-return.ts';   // as main.tsx loads it once the first screen is drawn
import { applyTheme, firstTheme, themeChoice } from '../../../src/ui/theme-apply.ts';
import { themeNow } from '../../../src/ui/theme-choice.ts';

const mine = (theme: unknown, at: unknown) => JSON.stringify({ app: 'copilot', kind: 'theme', v: 1, theme, at });
const theirs = (theme: unknown, at: unknown) => JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme, at });
afterEach(() => { localStorage.clear(); applyTheme('auto'); });

describe('Wayfinch follows the bag planner\'s choice', () => {
  test('[THEME-SYNC] a change in the bag planner shows at once (storage event), and in a tab that was hidden or cached when it shows again', () => {
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

describe('the first paint', () => {
  test('[THEME-SYNC] before the rule is loaded, the first paint already shows the one theme for any records the two apps write', () => {
    const times = ['2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.001Z', '2026-11-06T09:00:00.000Z'];
    for (const own of ['auto', 'light', 'dark'] as const) {
      for (const a of [null, ...times]) for (const b of [null, ...times]) for (const ta of ['auto', 'light', 'dark']) for (const tb of ['light', 'dark']) {
        localStorage.clear();
        localStorage.setItem('copilot:settings', JSON.stringify({ theme: own }));
        if (a) localStorage.setItem('copilot:theme:v1', mine(ta, a));
        if (b) localStorage.setItem('loadcheck:theme:v1', theirs(tb, b));
        // Wayfinch's own older setting is the fallback either way; only a bag planner's older choice alone waits for the rule
        expect(firstTheme(own), `${own} ${a} ${ta} ${b} ${tb}`).toBe(themeNow());
      }
    }
  });
});

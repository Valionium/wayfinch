// @vitest-environment jsdom
// One theme for both apps (owner's try-out, 5 November 2026): Wayfinch shows a choice made in the bag planner at once, and in a tab that
// was hidden or cached when it shows again. The rule itself, and the page deciding alike: tests/unit/contracts/theme.test.ts.
import { afterEach, describe, expect, test } from 'vitest';
import { noteOlderChoice } from '../../../src/ui/page-return.ts';   // as main.tsx loads it once the first screen is drawn
import { applyTheme, firstTheme, themeChoice } from '../../../src/ui/theme-apply.ts';
import { noteThemeChoice, themeNow } from '../../../src/ui/theme-choice.ts';

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

describe('a clock set wrong (review of PR 49, I2)', () => {
  test("[THEME-SYNC] a record dated in the future never outlives the rider's next choice: it is stamped just after it", () => {
    const ahead = new Date(Date.now() + 86_400_000).toISOString();
    localStorage.setItem('loadcheck:theme:v1', theirs('dark', ahead));
    noteThemeChoice('light');
    expect(themeNow()).toBe('light');
    expect(JSON.parse(localStorage.getItem('copilot:theme:v1')!).at).toBe(new Date(Date.parse(ahead) + 1).toISOString());
    // a record of the bag planner in the past changes nothing: now is stamped
    localStorage.setItem('loadcheck:theme:v1', theirs('dark', '2020-01-01T00:00:00.000Z'));
    const before = Date.now();
    noteThemeChoice('dark');
    expect(Date.parse(JSON.parse(localStorage.getItem('copilot:theme:v1')!).at)).toBeGreaterThanOrEqual(before);
  });
});

describe("records that are not what they claim (review of PR 49, M5), and a rider with only Load Check's older choice (I3)", () => {
  test('[THEME-SYNC] the first paint ignores what the rule ignores: foreign, broken or malformed records', () => {
    const bad = ['{', '"x"', '7', JSON.stringify({ app: 'load-check', kind: 'theme', v: 1, theme: 'dark', at: '2026-11-07T00:00:00.000Z' }),
      JSON.stringify({ app: 'copilot', kind: 'theme', v: 2, theme: 'dark', at: '2026-11-07T00:00:00.000Z' }), JSON.stringify({ app: 'copilot', kind: 'size', v: 1, theme: 'dark', at: '2026-11-07T00:00:00.000Z' })];
    const mineAll = [null, mine('light', '2026-11-05T10:00:00.000Z'), mine('blue', '2026-11-08T10:00:00.000Z'), mine('dark', 'never'), ...bad];
    const theirsAll = [null, theirs('dark', '2026-11-06T10:00:00.000Z'), theirs('auto', 7), theirs('purple', '2026-11-09T00:00:00.000Z'), ...bad.map((b) => b.replace('"app":"load-check"', '"app":"copilot"').replace('"app":"copilot","kind":"theme","v":2', '"app":"load-check","kind":"theme","v":2'))];
    for (const own of ['auto', 'light', 'dark'] as const) for (const a of mineAll) for (const b of theirsAll) {
      localStorage.clear();
      localStorage.setItem('copilot:settings', JSON.stringify({ theme: own }));
      if (a) localStorage.setItem('copilot:theme:v1', a);
      if (b) localStorage.setItem('loadcheck:theme:v1', b);
      expect(firstTheme(own), `${own} ${a} ${b}`).toBe(themeNow());
    }
  });

  test("[THEME-SYNC] Load Check's older choice alone: the rule writes it as Wayfinch's own record, dated at the start of time, so the next start paints it at once and any real choice wins", () => {
    localStorage.setItem('loadcheck:theme', JSON.stringify('light'));
    expect(firstTheme('auto')).toBe('auto');   // this one start, before the rule has run
    noteOlderChoice();   // page-return.ts, as it loads at a start
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));   // and follows
    expect(themeChoice.value).toBe('light');
    expect(JSON.parse(localStorage.getItem('copilot:theme:v1')!)).toEqual({ app: 'copilot', kind: 'theme', v: 1, theme: 'light', at: '1970-01-01T00:00:00.000Z' });
    expect(firstTheme('auto')).toBe('light');   // every start after
    localStorage.setItem('loadcheck:theme:v1', theirs('dark', '2000-01-01T00:00:00.000Z'));
    expect(themeNow()).toBe('dark');
  });
});

describe('Delete co-pilot data (review of PR 49, re-check)', () => {
  test("[THEME-SYNC] after a delete, nothing in the open page writes Wayfinch's theme record back, whatever event follows", () => {
    localStorage.setItem('loadcheck:theme', JSON.stringify('dark'));
    noteOlderChoice();
    expect(localStorage.getItem('copilot:theme:v1')).not.toBeNull();
    // Delete co-pilot data's own removal of every copilot: key (src/store/export.ts), without the database jsdom lacks
    for (const k of Object.keys(localStorage)) if (k.startsWith('copilot:')) localStorage.removeItem(k);
    window.dispatchEvent(new StorageEvent('storage', { key: 'copilot:changed' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'loadcheck:theme' }));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(Object.keys(localStorage).filter((k) => k.startsWith('copilot:'))).toEqual([]);
    expect(themeChoice.value).toBe('dark');   // still shown: the bag planner's choice is the one theme
  });
});

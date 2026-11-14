// @vitest-environment jsdom
// Wish 1 (owner, 9 November 2026): the colour mode button on Ahead, Trip and Tools too. It sets the one theme You sets (the record
// copilot:theme:v1 and the setting), through the same rule, so there is no second source of truth.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { App } from '../../../src/ui/app.tsx';
import { go } from '../../../src/ui/nav.ts';
import { applyTheme, themeChoice } from '../../../src/ui/theme-apply.ts';
import { themeNow } from '../../../src/ui/theme-choice.ts';

const host = document.createElement('div');
document.body.append(host);
let phoneDark = true;
beforeEach(() => {
  phoneDark = true;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: /dark/.test(q) ? phoneDark : !phoneDark, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});
afterEach(() => { render(null, host); localStorage.clear(); applyTheme('auto'); });

const button = () => host.querySelector<HTMLButtonElement>('button.theme-btn');
const settle = async () => { for (let i = 0; i < 40; i += 1) await act(() => new Promise((r) => setTimeout(r, 5))); };

describe('the colour mode button', { timeout: 30_000 }, () => {
  test('[YOU-WORDS] its title says where it stands and that Automatic is in You, Settings', async () => {
    go('trip');
    render(<App />, host);
    await settle();
    expect(button()!.getAttribute('title')).toBe('Theme: dark (automatic). Automatic is in You, Settings.');
  });

  test('[THEME-BUTTON] it is on Ahead, Trip and Tools, not on You, and says which mode it switches to', async () => {
    for (const screen of ['ahead', 'trip', 'tools'] as const) {
      go(screen);
      render(<App />, host);
      await settle();
      expect(button(), screen).not.toBeNull();
      expect(button()!.getAttribute('aria-label'), screen).toBe('Switch to light mode');   // the phone is dark
      expect(host.querySelectorAll('button.theme-btn').length, screen).toBe(1);
      render(null, host);
    }
    go('you');
    render(<App />, host);
    await settle();
    expect(button()).toBeNull();
  });

  test('[THEME-BUTTON] a tap sets the one theme: the record, the page and the label; a second tap goes back; a light phone starts with dark', async () => {
    go('trip');
    render(<App />, host);
    await settle();
    await act(() => { button()!.click(); });
    await settle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(themeChoice.value).toBe('light');
    expect(JSON.parse(localStorage.getItem('copilot:theme:v1')!)).toMatchObject({ app: 'copilot', kind: 'theme', v: 1, theme: 'light' });
    expect(JSON.parse(localStorage.getItem('copilot:settings')!).theme).toBe('light');
    expect(themeNow()).toBe('light');
    expect(button()!.getAttribute('aria-label')).toBe('Switch to dark mode');
    await act(() => { button()!.click(); });
    await settle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button()!.getAttribute('aria-label')).toBe('Switch to light mode');
    render(null, host);
    phoneDark = false;
    applyTheme('auto');
    render(<App />, host);
    await settle();
    expect(button()!.getAttribute('aria-label')).toBe('Switch to dark mode');
  });

  test('[THEME-BUTTON] a change made elsewhere (You, the bag planner, another window) changes the label at once', async () => {
    go('tools');
    render(<App />, host);
    await settle();
    await act(() => { applyTheme('light'); });
    expect(button()!.getAttribute('aria-label')).toBe('Switch to dark mode');
    await act(() => { applyTheme('dark'); });
    expect(button()!.getAttribute('aria-label')).toBe('Switch to light mode');
  });

  test('[THEME-BUTTON] the sub-screens of Tools (the tyre tool, Bike care) have their own back bar and no button', async () => {
    go('tools/tyre');
    render(<App />, host);
    await settle();
    expect(button()).toBeNull();
  });
});

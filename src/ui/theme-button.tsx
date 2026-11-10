// The colour mode button on Ahead, Trip and Tools (owner's wish 1, 9 November 2026): one icon button in the same top corner of each
// of the three screens. It shows what a tap does (it switches to the mode the page is not in) and changes the one theme You changes,
// through the same rule. A chunk of its own, loaded after the first screen (app.tsx): the button is placed over the corner, so
// nothing moves when it arrives.
import { TH } from '../core/wording/en-theme.ts';
import { readSettings, writeSettings } from '../store/settings.ts';
import { useTheme } from './bike/drawing.tsx';
import { applyTheme } from './theme-apply.ts';
import { noteThemeChoice, themeNow } from './theme-choice.ts';

/**
 * The same as a choice in You: the setting written like You writes it (read before write, so a window that is behind is refused,
 * never overwritten), then the record both apps read, then the page. The record is the one theme, so it is stamped even when the
 * setting is refused (another window's newer one).
 */
export async function setTheme(theme: 'light' | 'dark'): Promise<void> {
  try {
    await readSettings();
    await writeSettings({ theme });
  } catch { /* the record below still holds the choice */ }
  noteThemeChoice(theme);
  applyTheme(themeNow());
}

export function ThemeButton() {
  const dark = useTheme() === 'dark';   // the theme shown: the rider's choice from either app, else the phone's, redrawn when either changes
  return (
    <button
      type="button" class="theme-btn" aria-label={dark ? TH.toLight : TH.toDark}
      onClick={() => { void setTheme(dark ? 'light' : 'dark'); }}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        {dark ? <path d="M12 8a4 4 0 100 8 4 4 0 000-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12l1 1m0-14l-1 1M6 18l-1 1" /> : <path d="M20 14A8 8 0 019 3a8 8 0 1011 11z" />}
      </svg>
    </button>
  );
}

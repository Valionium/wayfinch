// The rider's theme choice (spec section 3.5) put on the page: "auto" follows the phone, light and dark override it.
export type ThemeChoice = 'auto' | 'light' | 'dark';

export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

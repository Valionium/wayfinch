// The colour mode button's labels (theme-button.tsx): what a tap on it does. Its own file, loaded with the button after the first screen.
export const TH = {
  toLight: 'Switch to light mode',
  toDark: 'Switch to dark mode',
  /** The button's hover and long-press hint: where it stands, and where Automatic is. */
  hint: (dark: boolean, auto: boolean): string => `Theme: ${dark ? 'dark' : 'light'}${auto ? ' (automatic)' : ''}. Automatic is in You, Settings.`,
} as const;

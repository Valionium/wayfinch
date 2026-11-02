import { defineConfig } from '@playwright/test';

// Chromium for the handover tests (sub-project 4), and the app's own projects below (sub-project 5).
// No retries: a flaky handover is a finding, not noise. List reporter only, and no page dumps (the page isn't printed).
const APP_SPECS = /app-.*\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  retries: 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    serviceWorkers: 'allow',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium-phone', testIgnore: APP_SPECS, use: { viewport: { width: 360, height: 640 } } },
    { name: 'chromium-laptop', testIgnore: APP_SPECS, use: { viewport: { width: 1280, height: 720 } } },
    // The app: the phone stand-in (360 x 640, the processor slowed to a quarter, §4.5), a laptop, each in both themes.
    { name: 'app-phone', testMatch: APP_SPECS, metadata: { cpuThrottle: 4 }, use: { viewport: { width: 360, height: 640 }, colorScheme: 'dark' } },
    { name: 'app-phone-light', testMatch: APP_SPECS, metadata: { cpuThrottle: 4 }, use: { viewport: { width: 360, height: 640 }, colorScheme: 'light' } },
    { name: 'app-laptop', testMatch: APP_SPECS, use: { viewport: { width: 1280, height: 720 }, colorScheme: 'dark' } },
    { name: 'app-laptop-light', testMatch: APP_SPECS, use: { viewport: { width: 1280, height: 720 }, colorScheme: 'light' } },
    // WebKit's smoke test is for when its browser is installed (the browser job installs Chromium only); it never blocks.
    ...(process.env.WAYFINCH_WEBKIT
      ? [{ name: 'app-webkit-smoke', testMatch: APP_SPECS, use: { browserName: 'webkit' as const, viewport: { width: 390, height: 844 } } }]
      : []),
  ],
});

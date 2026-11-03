import { defineConfig } from '@playwright/test';

// Chromium for the handover tests (sub-project 4), and the app's own projects below (sub-project 5).
// No retries: a flaky handover is a finding, not noise. List reporter only, and no page dumps (the page isn't printed).
const APP_SPECS = /app-.*\.spec\.ts/;
// The wide-screen tests (Task 22) set their own window sizes; they run in the two projects below, in Chromium and in Firefox.
const WIDE = /app-wide\.spec\.ts/;
// Budgets (§4.5) are timed on the phone stand-in alone, after every other project: three other browsers on the same machine are not a phone.
const BUDGETS = /\[PERF-/;
const FUNCTIONAL = ['chromium-phone', 'chromium-laptop', 'app-phone', 'app-phone-light', 'app-laptop', 'app-laptop-light', 'app-wide', 'app-wide-firefox'];

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
    { name: 'app-phone', testMatch: APP_SPECS, testIgnore: WIDE, grepInvert: BUDGETS, metadata: { cpuThrottle: 4 }, use: { viewport: { width: 360, height: 640 }, colorScheme: 'dark' } },
    { name: 'app-phone-light', testMatch: APP_SPECS, testIgnore: WIDE, grepInvert: BUDGETS, metadata: { cpuThrottle: 4 }, use: { viewport: { width: 360, height: 640 }, colorScheme: 'light' } },
    { name: 'app-laptop', testMatch: APP_SPECS, testIgnore: WIDE, grepInvert: BUDGETS, use: { viewport: { width: 1280, height: 720 }, colorScheme: 'dark' } },
    { name: 'app-laptop-light', testMatch: APP_SPECS, testIgnore: WIDE, grepInvert: BUDGETS, use: { viewport: { width: 1280, height: 720 }, colorScheme: 'light' } },
    // Desktop at 1280 x 720 (the short window of spec section 3.8), in Chromium and in Firefox. Both block a pull request.
    { name: 'app-wide', testMatch: WIDE, use: { viewport: { width: 1280, height: 720 }, colorScheme: 'dark' } },
    { name: 'app-wide-firefox', testMatch: WIDE, use: { browserName: 'firefox' as const, viewport: { width: 1280, height: 720 }, colorScheme: 'dark' } },
    // In CI the budgets have a job of their own (WAYFINCH_SHARDED): a dependency on every other project would also put every test
    // into one shard.
    { name: 'app-budgets', testMatch: APP_SPECS, testIgnore: WIDE, grep: BUDGETS, dependencies: process.env.WAYFINCH_SHARDED ? [] : FUNCTIONAL, metadata: { cpuThrottle: 4 }, use: { viewport: { width: 360, height: 640 }, colorScheme: 'dark' } },
    // WebKit runs the smoke set only, when its browser is installed: CI's webkit-smoke job, which never blocks a merge.
    ...(process.env.WAYFINCH_WEBKIT
      ? [{ name: 'app-webkit-smoke', testMatch: /app-smoke\.spec\.ts/, use: { browserName: 'webkit' as const, viewport: { width: 390, height: 844 } } }]
      : []),
  ],
});

import { defineConfig } from '@playwright/test';

// Chromium only, for now; sub-project 5 adds throttling, standalone and Firefox.
// No retries: a flaky handover is a finding, not noise. List reporter only, and no page dumps (the page isn't printed).
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
    { name: 'chromium-phone', use: { viewport: { width: 360, height: 640 } } },
    { name: 'chromium-laptop', use: { viewport: { width: 1280, height: 720 } } },
  ],
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app's components are Preact; a test file that needs a DOM says so with `// @vitest-environment jsdom`.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/sim/**/*.test.ts'],
    setupFiles: ['tests/setup-fast-check.ts'],
  },
});

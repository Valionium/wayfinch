import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app's components are Preact; a test file that needs a DOM says so with `// @vitest-environment jsdom`.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // As in a production build: no test hook (tools/build.mjs, --test-hooks).
  define: { __WF_TEST_HOOKS__: 'false' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/sim/**/*.test.ts'],
    setupFiles: ['tests/setup-fast-check.ts'],
  },
});

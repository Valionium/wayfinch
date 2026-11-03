// The app's build (sub-project 5). tools/build.mjs runs it only with the launch switch on, into a folder of its own.
// `publicDir` is off on purpose: tools/build.mjs copies public/ itself, so nothing in it reaches a build by accident.
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  publicDir: false,
  // development: false always: a NODE_ENV of "test" would otherwise build the dev JSX, with file paths in it.
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact', development: false } },
  // tools/build.mjs sets it true for --test-hooks builds only; false drops the hook's code from the build.
  define: { __WF_TEST_HOOKS__: 'false' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // fonts stay files, so the worker precaches them
    cssCodeSplit: false,
    sourcemap: false,
    reportCompressedSize: false,
    // Everything the first screen needs stays in one file, also when a lazy screen (You) shares modules with it: otherwise
    // the bundler splits shared wording and the JSX runtime into files of their own, which compress worse and cost requests.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'shell', tags: ['$initial'] }] } } },
  },
});

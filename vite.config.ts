// The app's build (sub-project 5). tools/build.mjs runs it only with the launch switch on, into a folder of its own.
// `publicDir` is off on purpose: tools/build.mjs copies public/ itself, so nothing in it reaches a build by accident.
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  publicDir: false,
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0, // fonts stay files, so the worker precaches them
    cssCodeSplit: false,
    sourcemap: false,
    reportCompressedSize: false,
  },
});

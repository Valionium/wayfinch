// The app's build (sub-project 5). tools/build.mjs runs it only with the launch switch on, into a folder of its own.
// `publicDir` is off on purpose: tools/build.mjs copies public/ itself, so nothing in it reaches a build by accident.
import { defineConfig } from 'vite';

export default defineConfig({
  // The entry script holds the first frame until it has run (blocking="render"), so the bike is drawn, and named, when a page that
  // glides in from the bag planner is revealed (spec section 9.8; the owner's device check of 5 November). Before it runs the page is
  // an empty #app, so the hold keeps back nothing a rider could see; a script that fails ends it (LC-GLIDE-OFF). Vite drops the
  // attribute from index.html's own tag, so it is put back on the built one here.
  plugins: [{
    name: 'wf-render-blocking-entry',
    transformIndexHtml: { order: 'post', handler: (html: string) => html.replace(/<script type="module"( crossorigin)? src="\/assets\//, (m) => m.replace('<script type="module"', '<script type="module" blocking="render"')) },
  }],
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

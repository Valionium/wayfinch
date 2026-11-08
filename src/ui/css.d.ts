declare module '*.css';

/** Vite's import.meta.glob, as Bike care's pictures use it: each file's built address (src/tools/care/picture.tsx). */
interface ImportMeta {
  glob(pattern: string, options: { query: '?url'; import: 'default'; eager: true }): Record<string, string>;
}

/** Set by tools/build.mjs: true only in a --test-hooks build for the browser tests (plan Decision 8). */
declare const __WF_TEST_HOOKS__: boolean;

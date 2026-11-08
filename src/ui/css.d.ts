declare module '*.css';
declare module '*.css?inline' {
  const css: string;
  export default css;
}

/** Set by tools/build.mjs: true only in a --test-hooks build for the browser tests (plan Decision 8). */
declare const __WF_TEST_HOOKS__: boolean;

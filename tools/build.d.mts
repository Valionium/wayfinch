// Types for tools/build.mjs, for the tests that import it.
export const MAX_PRECACHED_BYTES: number;
export function canonicalPath(distPath: string): string;
export interface BuildOptions {
  out?: string;
  launch?: boolean;
  emergency?: boolean;
  extraFiles?: Record<string, Uint8Array | string>;
  pagePath?: string;
  vite?: (outDir: string, options?: { testHooks?: boolean }) => Promise<void>;
  /** `window.__wf` for the browser tests; needs the launch switch on. */
  testHooks?: boolean;
}
export function buildDist(options?: BuildOptions): Promise<{ out: string; build: string; precache: Record<string, string> }>;

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
/** Vite's build of the app's shell into `outDir`. `plugins` are added to vite.config.ts's own; only tests pass any. */
export function runVite(outDir: string, options?: { testHooks?: boolean; plugins?: import('vite').PluginOption[] }): Promise<void>;
/** Writes the app's own Source Sans 3 rules into `<target>/tools/bags/font.css`; throws when a real shell has no stylesheet or no such rules. */
export function writePageFont(target: string): void;

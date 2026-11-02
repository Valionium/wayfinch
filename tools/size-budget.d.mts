// Types for tools/size-budget.mjs, for the tests that import it.
export function gzipBytes(bytes: Uint8Array): number;
export function measure(distDir: string): { firstJsGzip: number; lazyJsGzip: number; firstFiles: string[] };

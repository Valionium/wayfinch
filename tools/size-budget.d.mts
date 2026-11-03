// Types for tools/size-budget.mjs, for the tests that import it.
export function gzipBytes(bytes: Uint8Array): number;
export const BOUNDARY_BUDGET: number;
export function boundaryGzip(path: string): number;
export function measure(distDir: string): { firstJsGzip: number; lazyJsGzip: number; firstFiles: string[] };

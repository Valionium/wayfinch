// Types for tools/build-legal.mjs, for the tests that import it.
export const PAGE: string;
export function sha256(text: string): string;
export function textOf(markup: string): string;
export function imprintBlock(pagePath?: string): { html: string; text: string; hash: string };
export function writeImprint(outDir: string, pagePath?: string): string;

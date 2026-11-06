// The imprint of the app's legal pages (spec section 10, "Operator consistency"; rule PRIV-IMPRINT-SAME).
//
// The operator's details are not retyped, read or printed here. They are taken, at build time, from the block that Load Check's page
// builds for its own Impressum, so the two can never differ. The page is read as a document, never printed: its script for the legal
// text is run in an empty window (jsdom, scripts of the page not started), and the block is cut out of the HTML it returns.
//
//   import { imprintBlock, writeImprint } from './build-legal.mjs'
//
// Nothing here logs the block. A failure says what step failed, never what the block holds.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = join(ROOT, 'public', 'tools', 'bags', 'index.html');

const MARKER = '/* ==== 98-legal.js ==== */';
const NEXT_MARKER = /\/\* ==== [\w.-]+ ==== \*\//g;

/** The page's script for its legal text, cut from the page without looking inside it. */
function legalScript(pageHtml) {
  const dom = new JSDOM(pageHtml); // scripts are not run
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
    const text = script.textContent ?? '';
    const start = text.indexOf(MARKER);
    if (start < 0) continue;
    NEXT_MARKER.lastIndex = start + MARKER.length;
    const next = NEXT_MARKER.exec(text);
    return text.slice(start, next ? next.index : text.length);
  }
  throw new Error('imprint: the page has no legal section');
}

/** Runs the legal section in an empty window and returns the HTML `legalHTML()` builds. */
function legalHtml(section) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  // The section may reach for the page's helpers while it loads; an empty element answers every one of them.
  window.$ = (id) => window.document.getElementById(id) ?? window.document.createElement('div');
  const html = window.eval(`${section}\n;typeof legalHTML === 'function' ? legalHTML() : null`);
  if (typeof html !== 'string' || html.length === 0) throw new Error('imprint: the page builds no legal text');
  return html;
}

/**
 * The imprint block of the page: its first heading up to, not including, the privacy heading. `html` is the block as markup, `text`
 * as plain text with single spaces, `hash` the SHA-256 of that text (the only thing a test or a log may show).
 */
export function imprintBlock(pagePath = PAGE) {
  const markup = legalHtml(legalScript(readFileSync(pagePath, 'utf8')));
  const box = new JSDOM(`<!doctype html><body><div id="b">${markup}</div></body>`).window.document.getElementById('b');
  const nodes = [...box.childNodes];
  const first = nodes.findIndex((n) => n.nodeName === 'H2');
  if (first < 0) throw new Error('imprint: no heading in the legal text');
  const rest = nodes.slice(first + 1).findIndex((n) => n.nodeName === 'H2');
  const block = nodes.slice(first, rest < 0 ? nodes.length : first + 1 + rest);
  const html = block.map((n) => n.outerHTML ?? n.textContent ?? '').join('');
  const text = textOf(html);
  if (block.length < 3 || text.length < 40) throw new Error('imprint: the block could not be separated');
  return { html, text, hash: sha256(text) };
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The visible text of some markup, single-spaced. */
export function textOf(markup) {
  const body = new JSDOM(`<!doctype html><body><div id="t">${markup}</div></body>`).window.document.getElementById('t');
  return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const page = (block) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Impressum · Imprint — Wayfinch</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/legal/legal.css">
<script src="/legal/theme.js"></script>
<!-- Opted in to the cross-document view transition as Wayfinch is: a page that is not drops the transition coming in from Wayfinch with an error. -->
<style>@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }</style>
</head>
<body>
<header class="lg-top"><a class="lg-back" href="/#/you">&larr; Wayfinch</a></header>
<main class="lg-main">
<p class="lg-draft">Drafted by an AI from the project's spec. Not legal advice.</p>
<h1>Impressum · Imprint</h1>
<p lang="en">Imprint. German law asks for this text in German. It is the same text as in the bag planner, taken from it when this site is built.</p>
<nav class="lg-nav" aria-label="Legal pages"><a href="/legal/privacy/">Privacy notice</a> <a href="/legal/licences/">Licences and data</a></nav>
<section data-imprint>${block}</section>
</main>
</body>
</html>
`;

/**
 * Writes `legal/imprint/index.html` into a built site. When the block can't be taken, nothing is written and the committed placeholder
 * (public/legal/imprint.html, which says the owner adds the details) stays; the caller is told.
 */
export function writeImprint(outDir, pagePath = PAGE) {
  const block = imprintBlock(pagePath);
  // A folder with an index.html: the host serves /legal/imprint/ and the worker lists it under that address.
  mkdirSync(join(outDir, 'legal', 'imprint'), { recursive: true });
  writeFileSync(join(outDir, 'legal', 'imprint', 'index.html'), page(block.html));
  return block.hash;
}

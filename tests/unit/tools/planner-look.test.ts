// The Bag planner looks like Wayfinch (the owner's ruling of 14 Nov 2026, "yes, make the Bag planner look like Wayfinch"; sweep of
// 14 Nov, finding 27): its header names it "Wayfinch · Bag planner" with a plain English line, step one is "Ride" (Wayfinch has its own
// Trip), Check's last button says "Back to step one", the footer is English, and the header and step labels use Wayfinch's own
// Source Sans 3, the very files the app loads, precached. The browser side (both themes, 320/360 px and wide, offline) is in
// tests/e2e/app-planner-look.spec.ts. The page is never printed here: failures show short texts and counts only.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildDist } from '../../../tools/build.mjs';
import { bannedHits } from '../../fixtures/banned.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = readFileSync(join(ROOT, 'public/tools/bags/index.html'), 'utf8');
/** jsdom ships no types here (tests/jsdom.d.ts), so the window it returns is typed as a browser window. */
const docOf = (html: string): Document => (new JSDOM(html) as unknown as { window: { document: Document } }).window.document;
const doc = docOf(PAGE);
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

const SUBTITLE = 'What to take, where it goes, what to leave at home.';

describe('the name and the steps', () => {
  test('[LC-WF-NAME] the header names the Bag planner as part of Wayfinch, with a short plain English line and one theme button', () => {
    const mast = doc.querySelector('header.mast');
    expect(text(mast?.querySelector('h1'))).toBe('Wayfinch · Bag planner');
    expect(text(mast?.querySelector('p'))).toBe(SUBTITLE);
    expect(bannedHits(`${text(mast?.querySelector('h1'))} ${SUBTITLE}`)).toEqual([]);
    // the old brand is gone from the header and the footer
    expect(/load\s*·?\s*check/i.test(text(mast))).toBe(false);
    expect(/load\s*·?\s*check/i.test(text(doc.querySelector('footer.sitefoot')))).toBe(false);
    // one theme button on the page: the header's own; the one top bar holds the way back and the walkthrough, no theme button
    expect(doc.querySelectorAll('#themeBtn, .themebtn, .theme-btn').length).toBe(1);
    expect(doc.querySelector('.wf-bar #themeBtn, .wf-bar .themebtn, .wf-bar .theme-btn')).toBeNull();
  });

  test('[LC-WF-STEPS] step one is Ride: the step labels, the walkthrough, the lines that send the rider back to it, and "Back to step one"', () => {
    expect([...doc.querySelectorAll('#crumbs button')].map((b) => [b.getAttribute('data-to'), text(b)])).toEqual([['1', 'Ride'], ['2', 'Bags'], ['3', 'Kit'], ['4', 'Check']]);
    expect(text(doc.querySelector('#walkthroughInvite p'))).toBe('A short guide to Ride, Bags, Kit and Check.');
    expect(PAGE).toContain("{label:'Ride',title:'Tell us about the ride',");
    expect(PAGE).not.toContain("{label:'Trip',");
    // Check's last button goes to step one and says so (it never meant Wayfinch's Trip)
    const back = doc.querySelector('#s4 .nav button[data-to="1"]');
    expect(text(back)).toBe('Back to step one');
    expect(PAGE).not.toMatch(/>Back to trip</i);
    // the lines that point the rider to step one name it as the step labels do
    for (const line of [
      'Suggested nights: — · add a route in Ride',
      'Add a date in Ride for a near-term forecast.',
      'Choose both ends in Ride, or load a GPX track.',
      'Retry in Ride or use a GPX track.',
      'Weather unchecked. Choose a place in Ride.',
      'Return to Ride and retry the weather check.',
      'Return to Ride to retry or upload a GPX track.',
    ]) expect(PAGE, line).toContain(line);
    for (const old of [/add a route in Trip/, /Add a date in Trip/, /ends in Trip/, /Retry in Trip/, /Choose a place in Trip/, /Return to Trip/]) expect(PAGE, String(old)).not.toMatch(old);
  });

  test('[LC-WF-FOOT] the footer is English: "Imprint and privacy" opens the same dialog, and no Load Check tagline', () => {
    const button = doc.querySelector('footer.sitefoot #legalBtn');
    expect(text(button)).toBe('Imprint and privacy');
    expect(button?.hasAttribute('lang')).toBe(false);
    expect(PAGE).toContain("$('legalBtn').onclick = openLegal;");
    expect(text(doc.querySelector('footer.sitefoot>span'))).toBe('Bag planner · a free tool, and its figures are estimates');
  });
});

// The page is a file of public/, copied as it is; the app's fonts are Vite's, under hashed names. The launch build writes the app's own
// Source Sans 3 rules, taken from the app's built stylesheet, into /tools/bags/font.css: the same addresses, so the same three files,
// precached like every file. With the switch off nothing of it exists (the off build stays what it was).
describe('the font', () => {
  let on = '';
  let off = '';
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wf-planner-look-'));
    on = join(dir, 'on');
    off = join(dir, 'off');
    await buildDist({ out: on, launch: true });
    await buildDist({ out: off, launch: false });
  }, 240_000);
  afterAll(() => { if (on) rmSync(join(on, '..'), { recursive: true, force: true, maxRetries: 3 }); });

  test('[LC-WF-FONT] /tools/bags/font.css holds exactly the app\'s own Source Sans 3 rules, the same precached files; the page links it in its head; the off build has none', () => {
    const shell = readFileSync(join(on, 'index.html'), 'utf8');
    const appCss = shell.match(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"/)?.[1];
    expect(appCss).toBeDefined();
    const appRules = readFileSync(join(on, appCss!), 'utf8').match(/@font-face\{[^}]*\}/g)!.filter((r) => /font-family:\s*"?Source Sans 3"?/.test(r));
    expect(appRules.map((r) => r.match(/font-weight:(\d+)/)?.[1])).toEqual(['400', '600', '700']);
    const css = readFileSync(join(on, 'tools', 'bags', 'font.css'), 'utf8');
    expect(css.match(/@font-face\{[^}]*\}/g)).toEqual(appRules);
    const build = JSON.parse(readFileSync(join(on, 'build.json'), 'utf8')) as { files: Record<string, string> };
    expect(Object.keys(build.files)).toContain('/tools/bags/font.css');
    const urls = appRules.map((r) => r.match(/url\((\/assets\/[^)]+\.woff2)\)/)?.[1]);
    expect(urls.every((u) => u !== undefined && u in build.files), urls.join(' ')).toBe(true);
    expect(readFileSync(join(on, '_headers'), 'utf8')).toContain('/tools/bags/font.css\n  Cache-Control: no-cache\n');
    // the page links it in its head, once
    const page = docOf(readFileSync(join(on, 'tools', 'bags', 'index.html'), 'utf8'));
    expect(page.querySelectorAll('link[rel="stylesheet"][href="/tools/bags/font.css"]').length).toBe(1);
    expect(page.head.querySelector('link[rel="stylesheet"][href="/tools/bags/font.css"]')).not.toBeNull();
    // the off build: no font file of the page, nothing else changed by it
    const offBuild = JSON.parse(readFileSync(join(off, 'build.json'), 'utf8')) as { files: Record<string, string> };
    expect(Object.keys(offBuild.files).some((f) => f.startsWith('/tools/'))).toBe(false);
  });
});

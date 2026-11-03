// The legal pages (spec section 10): what they must hold and where they must not reach. The imprint's text is never printed: a
// failing check shows hashes and counts only.
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildDist } from '../../tools/build.mjs';
import { imprintBlock, sha256, textOf } from '../../tools/build-legal.mjs';
import { LEGAL_PAGES } from '../../src/ui/legal/links.tsx';

/** jsdom ships no types here (tests/jsdom.d.ts), so the window it returns is typed as a browser window. */
const docOf = (html: string): Document => (new JSDOM(html) as unknown as { window: { document: Document } }).window.document;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const textOfFile = (path: string): string => docOf(read(path)).body.textContent ?? '';
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
const deps = (): Record<string, string> => (JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies;

let site = '';
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wf-legal-'));
  site = join(dir, 'site');
  await buildDist({ out: site, launch: true });
}, 120_000);
afterAll(() => { if (site) rmSync(join(site, '..'), { recursive: true, force: true, maxRetries: 3 }); });

describe('imprint', () => {
  test('[PRIV-IMPRINT-SAME] the built imprint holds exactly the text of the bag planner block: equal hashes, nothing printed', () => {
    const page = imprintBlock();
    const built = docOf(readFileSync(join(site, 'legal', 'imprint', 'index.html'), 'utf8')).querySelector('[data-imprint]');
    expect(built).not.toBeNull();
    const builtHash = sha256(textOf(built!.innerHTML));
    expect(builtHash === page.hash ? 'same' : `different: ${builtHash} / ${page.hash}`).toBe('same');
    expect(page.text.length).toBeGreaterThan(200);
  });

  test('[PRIV-IMPRINT-SAME] nothing of the block is committed in the legal files: the placeholder says the owner adds the details', () => {
    const { text } = imprintBlock();
    const at = (i: number): number => Math.floor((text.length - 40) * (i / 3));
    const pieces = [0, 1, 2, 3].map((i) => text.slice(at(i), at(i) + 40));
    for (const file of ['public/legal/imprint/index.html', 'public/legal/privacy/index.html', 'public/legal/licences/index.html', 'THIRD_PARTY', 'README.md']) {
      const body = read(file).replace(/\s+/g, ' ');
      pieces.forEach((piece, i) => expect(body.includes(piece), `${file} holds piece ${i} of the block`).toBe(false));
    }
    expect(textOfFile('public/legal/imprint/index.html')).toContain('added by the owner');
  });

  test('[PRIV-IMPRINT-SAME] when the block cannot be taken the step fails with a plain reason, and the build keeps the placeholder', () => {
    expect(() => imprintBlock(join(ROOT, 'public', 'manifest.webmanifest'))).toThrow(/imprint:/);
  });
});

describe('the pages are on the site and reachable', () => {
  test('[PRIV-LEGAL-REACH] imprint, privacy and licences are built under /legal/name/, link to each other and back to the app, and You links to all three', () => {
    expect(LEGAL_PAGES.map((p) => p.href)).toEqual(['/legal/imprint/', '/legal/privacy/', '/legal/licences/']);
    for (const page of LEGAL_PAGES) {
      const doc = docOf(readFileSync(join(site, page.href.slice(1), 'index.html'), 'utf8'));
      const links = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(links, page.href).toContain('/#/you');
      for (const other of LEGAL_PAGES.filter((p) => p.href !== page.href)) expect(links, `${page.href} to ${other.href}`).toContain(other.href);
      expect(doc.title.length).toBeGreaterThan(5);
    }
  });

  test('[PRIV-LEGAL-OFFLINE] every legal page and its stylesheet is in the worker list, under the address the host serves', () => {
    const build = JSON.parse(readFileSync(join(site, 'build.json'), 'utf8')) as { files: Record<string, string> };
    const listed = Object.keys(build.files);
    for (const path of ['/legal/imprint/', '/legal/privacy/', '/legal/licences/', '/legal/legal.css']) expect(listed, path).toContain(path);
    // The host redirects *.html to the folder address, so a *.html entry would never be asked for.
    expect(listed.some((p) => p.startsWith('/legal/') && p.endsWith('.html'))).toBe(false);
  });

  test('every legal text begins with the line that says an AI drafted it', () => {
    for (const page of LEGAL_PAGES) {
      const body = docOf(readFileSync(join(site, page.href.slice(1), 'index.html'), 'utf8')).querySelector('main')!.textContent!.trim();
      expect(body.startsWith("Drafted by an AI from the project's spec. Not legal advice."), page.href).toBe(true);
    }
  });
});

describe('privacy notice', () => {
  const notice = (): string => textOfFile('public/legal/privacy/index.html');
  const hostsIn = (source: string): string[] => [...source.matchAll(/https?:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]!);

  test('[PRIV-RECIPIENTS] every outside host that src/data can reach, and the data project, is named in the notice, in English and in German', () => {
    const config = JSON.parse(read('build.config.json')) as { dataOrigin: string };
    const hosts = new Set<string>(hostsIn(config.dataOrigin));
    for (const file of walk(join(ROOT, 'src', 'data'))) {
      // A terms address is a link for the owner, not a request.
      const code = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.includes('terms:')).join(' ');
      for (const h of hostsIn(code)) if (h !== 'www.w3.org') hosts.add(h);
    }
    expect(hosts.size).toBeGreaterThanOrEqual(9);
    const doc = docOf(read('public/legal/privacy/index.html'));
    const en = doc.querySelector('#en')!.textContent!;
    const de = doc.querySelector('#de')!.textContent!;
    for (const h of hosts) {
      expect(en.includes(h), `${h} is missing in English`).toBe(true);
      expect(de.includes(h), `${h} is missing in German`).toBe(true);
    }
  });

  test('[PRIV-RECIPIENTS] the notice says what the spec makes it say, in both languages, and nothing of what is not in the first version', () => {
    const doc = docOf(read('public/legal/privacy/index.html'));
    const en = doc.querySelector('#en')!.textContent!.replace(/\s+/g, ' ');
    const de = doc.querySelector('#de')!.textContent!.replace(/\s+/g, ' ');
    expect(en).toContain('The app never sends your position on its own.');
    expect(en).toContain('deleted after 90 days');
    expect(en).toContain('while the app is open');
    expect(en).toContain('never in the background');
    expect(en).toContain("Choosing your bike's colour from a photo: the photo is analysed only on your device. It is not uploaded, not sent to us or anyone else, and not saved.");
    expect(de).toContain('Das Foto wird nur auf deinem Gerät ausgewertet. Es wird nicht hochgeladen, nicht an uns oder andere gesendet und nicht gespeichert.');
    expect(de).toContain('nach 90 Tagen gelöscht');
    expect(de).toContain('nie im Hintergrund');
    for (const word of [/demo trip/i, /readiness/i, /another device/i, /ask box/i, /Demo-Fahrt/i, /Bereitschaftstest/i]) expect(notice()).not.toMatch(word);
  });
});

describe('licences', () => {
  const page = (): string => textOfFile('public/legal/licences/index.html');

  test('[PRIV-LICENCES-ALL] every dependency is on the Licences page and in THIRD_PARTY, with its version', () => {
    const third = read('THIRD_PARTY');
    expect(Object.keys(deps()).length).toBeGreaterThanOrEqual(9);
    for (const [name, version] of Object.entries(deps())) {
      expect(page().includes(name), `${name} on the page`).toBe(true);
      expect(page().includes(version), `${name} ${version} on the page`).toBe(true);
      expect(third.includes(name), `${name} in THIRD_PARTY`).toBe(true);
      expect(third.includes(version), `${name} ${version} in THIRD_PARTY`).toBe(true);
    }
  });

  test('[PRIV-LICENCES-ALL] what npm ls --omit=dev holds below the dependencies (bundled with them) is listed too', () => {
    const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version: string; dev?: boolean; optional?: boolean; peer?: boolean }> };
    const direct = new Set(Object.keys(deps()));
    const shipped = Object.entries(lock.packages).filter(([path, p]) => path.startsWith('node_modules/') && !path.slice(13).includes('node_modules/') && !p.dev && !p.optional && !p.peer);
    const third = read('THIRD_PARTY');
    for (const [path, p] of shipped) {
      const name = path.slice('node_modules/'.length);
      if (name === 'typescript') continue; // a peer of i18next that the build never reads
      expect(page().includes(name) && page().includes(p.version), `${name} ${p.version} on the page`).toBe(true);
      expect(third.includes(name) && third.includes(p.version), `${name} ${p.version} in THIRD_PARTY`).toBe(true);
      expect(direct.has(name) || ['@preact/signals-core', 'i18next'].includes(name), `${name} is neither a dependency nor a known one below`).toBe(true);
    }
    expect(shipped.length).toBeGreaterThanOrEqual(11);
  });

  test('[PRIV-LICENCES-ALL] the fonts, opening_hours, the MIT note, Open-Meteo, Copernicus and OpenStreetMap are credited as the spec says', () => {
    const text = page().replace(/\s+/g, ' ');
    const html = read('public/legal/licences/index.html');
    for (const part of ['SIL OPEN FONT LICENSE Version 1.1', 'Copyright 2017 The Barlow Project Authors', 'IBM Corp.', 'LGPL-3.0-only', 'Open Database Licence',
      'MIT licence', "covers only the project's own code", 'CC BY 4.0', 'Copernicus', '© OpenStreetMap contributors', 'BSD 2-Clause']) {
      expect(text, part).toContain(part);
    }
    for (const part of ['https://github.com/opening-hours/opening_hours.js/tree/v3.15.0', 'opening_hours-3.15.0.tgz', 'https://www.openstreetmap.org/copyright', 'wayfinch-data.pages.dev', 'pipeline/']) {
      expect(html, part).toContain(part);
    }
    expect(read('THIRD_PARTY')).toContain("covers only the project's own code");
    // The version in the source links is the version that is pinned.
    expect(deps().opening_hours).toBe('3.15.0');
  });
});

describe('nothing from outside', () => {
  test('[PRIV-NO-OUTSIDE] the built shell and legal pages (HTML, CSS, JS) load no outside code or font', () => {
    const own = join('tools', 'bags');
    const files = walk(site).filter((f) => /\.(html|css|js)$/.test(f) && !f.includes(own));
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      const name = file.slice(site.length);
      if (file.endsWith('.html')) {
        const doc = docOf(body);
        for (const el of doc.querySelectorAll('script[src], link[href], img[src], iframe[src], source[src]')) {
          const url = el.getAttribute('src') ?? el.getAttribute('href') ?? '';
          if (el.tagName === 'LINK' && !['stylesheet', 'modulepreload', 'preload', 'icon', 'apple-touch-icon', 'manifest'].includes(el.getAttribute('rel') ?? '')) continue;
          expect(/^(https?:)?\/\//.test(url), `${name} loads ${url}`).toBe(false);
        }
      }
      if (file.endsWith('.css')) {
        expect(/@import\s+(url\()?['"]?https?:/.test(body), `${name} imports from outside`).toBe(false);
        for (const m of body.matchAll(/url\(\s*['"]?(https?:\/\/[^'")]+)/g)) throw new Error(`${name} loads ${m[1]}`);
      }
      if (file.endsWith('.js') && !file.endsWith('offline-worker.js')) {
        expect(/import\(\s*['"`]https?:/.test(body), `${name} imports code from outside`).toBe(false);
        expect(/from\s*['"]https?:/.test(body), `${name} imports code from outside`).toBe(false);
        expect(/importScripts\(\s*['"`]https?:/.test(body), `${name} imports scripts from outside`).toBe(false);
      }
    }
    expect(statSync(join(site, 'legal', 'legal.css')).size).toBeGreaterThan(100);
  });
});

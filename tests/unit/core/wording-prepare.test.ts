// "Prepare this route" (owner's choice, 9 Nov 2026): the old name "Get ready offline" sounded as if the app goes offline. No
// rider-visible text uses it or its short form any more; internal ids, function names and keys keep their names.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { TR } from '../../../src/core/wording/en-trip.ts';
import { SUB } from '../../../src/core/wording/en-subtitles.ts';
import { TW } from '../../../src/core/wording/en-tyre-warn.ts';
import { bannedHits } from '../../fixtures/banned.ts';

const dir = '../../../src/core/wording';
const modules: Record<string, Record<string, unknown>> = {};
for (const name of readdirSync('src/core/wording')) modules[name] = (await import(`${dir}/${name}`)) as Record<string, unknown>;

/** Every string any wording module can show, functions called with plain arguments. */
function allStrings(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (path: string, v: unknown, depth: number): void => {
    if (depth > 4 || v === null) return;
    if (typeof v === 'string') out.push([path, v]);
    else if (typeof v === 'function') {
      for (const args of [['Fixture'], [1, 2], [2, 3, 4], []]) {
        try { const r = (v as (...a: unknown[]) => unknown)(...args); if (typeof r === 'string') { out.push([path, r]); break; } else if (r && typeof r === 'object') { walk(path, r, depth + 1); break; } } catch { /* try the next arguments */ }
      }
    } else if (typeof v === 'object') for (const [k, x] of Object.entries(v as object)) walk(`${path}.${k}`, x, depth + 1);
  };
  for (const [file, mod] of Object.entries(modules)) for (const [name, v] of Object.entries(mod)) walk(`${file.split('/').pop()}:${name}`, v, 0);
  return out;
}

test('[PREP-NAME] "Get ready offline" and "Get ready" appear in no rider-visible text; "Prepare this route" is the step, its button and every mention', () => {
  const strings = allStrings();
  expect(strings.length).toBeGreaterThan(500);
  for (const [key, text] of strings) expect(/get ready/i.test(text), `${key}: ${text}`).toBe(false);
  expect(W.appTripGetReadyTitle).toBe('Prepare this route');
  expect(W.appTripGetReadyButton).toBe('Prepare this route');
  expect(W.appAheadNeedTitle).toBe('En route needs Prepare this route');
  expect(W.appAheadAfterReady).toBe('After Prepare this route');
  // The privacy page's table names it too.
  const privacy = readFileSync('public/legal/privacy/index.html', 'utf8').replace(/<[^>]+>/g, ' ');
  expect(/get ready/i.test(privacy)).toBe(false);
  expect(privacy).toContain('Prepare this route');
});

test('[PREP-LINE] the three tyre warnings moved to their own module still say the same, with no banned word', () => {
  for (const text of [TW.tyreWarnBelowEtrto('Tyre width', '29'), TW.tyreWarnHeatPump('Front', '4.60', '66'), TW.tyreWarnHeatBelowFloor('Front')]) expect(bannedHits(text, false), text).toEqual([]);
});

test('[PREP-LINE] the line under the button says what it fetches and why; the tabs say what they are for; none uses a banned word', () => {
  expect(TR.appTripPrepareLine).toBe('Fetches places, opening hours, heights and weather for this route and keeps them on your phone, so En route works without signal.');
  expect(TR.appTripChooseHint).toBe('For exact planning, upload your GPX. For a rough bag plan, a town-to-town route is enough.');
  expect(bannedHits(TR.appTripChooseHint, true)).toEqual([]);
  expect(SUB.trip).toBe('Plan before you ride');
  expect(SUB.ahead).toBe('While you ride: the next water, food, sleep and weather');
  for (const s of [TR.appTripPrepareLine, SUB.trip, SUB.ahead]) expect(bannedHits(s, true), s).toEqual([]);
});

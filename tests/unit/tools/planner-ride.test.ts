// The trip is entered once (the owner's ruling of 14 Nov 2026; sweep of 14 Nov, finding 28): with a trip from Wayfinch, step one (Ride)
// folds to a one-line summary of the trip with Change, which opens today's fields; Comfortable or Lightweight is chosen at the start of
// Kit, not on Check. The browser side is tests/e2e/app-ride-summary.spec.ts. The page is never printed here: failures show short texts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = readFileSync(join(ROOT, 'public/tools/bags/index.html'), 'utf8');
const doc = (new JSDOM(PAGE) as unknown as { window: { document: Document } }).window.document;

test('[LC-RIDE-FOLD] step one holds a trip summary with Change, hidden until a trip from Wayfinch is the plan, and every field of today in one block it opens', () => {
  const s1 = doc.getElementById('s1')!;
  const summary = s1.querySelector('#rideSummary');
  expect(summary?.hasAttribute('hidden')).toBe(true);
  expect(summary?.querySelector('#rideSummaryText')).not.toBeNull();
  const change = summary?.querySelector('button#rideChange');
  expect(change?.getAttribute('aria-controls')).toBe('rideFields');
  expect(change?.getAttribute('aria-expanded')).toBe('false');
  expect(change?.textContent).toBe('Change');
  const fields = s1.querySelector('#rideFields')!;
  for (const id of ['tellInput', 'geoInput', 'geoInput2', 'gpxPick', 'month', 'nights', 'departureDate', 'sleepChips']) expect(fields.querySelector(`#${id}`), id).not.toBeNull();
  // the step's way on stays outside the fold
  expect(fields.querySelector('.nav')).toBeNull();
  expect(s1.querySelector('.nav button[data-to="2"]')).not.toBeNull();
});

test('[LC-MODE-KIT] Comfortable or Lightweight is chosen at the start of Kit, before the kit list; Check no longer has it', () => {
  const bar = doc.getElementById('modeBar')!;
  expect(bar.closest('section')?.id).toBe('s3');
  const s3 = doc.getElementById('s3')!.innerHTML;
  expect(s3.indexOf('id="modeBar"')).toBeLessThan(s3.indexOf('id="kitList"'));
  expect(s3.indexOf('id="modeBar"')).toBeLessThan(s3.indexOf('id="kitFind"'));
  expect([...bar.querySelectorAll('button')].map((b) => [b.dataset.mode, b.querySelector('b')?.textContent])).toEqual([['comfort', 'Comfortable'], ['light', 'Lightweight']]);
  expect(doc.getElementById('s4')!.querySelector('#modeBar')).toBeNull();
});

import { test as fcTest, fc } from '@fast-check/vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { instantAt } from '../../../../src/core/answers/time';
import { isPublicHoliday, openAtArrival, openOnArrival, openOver, openWaterWindow, stateAt } from '../../../../src/core/hours/check';
import type { RuleClass } from '../../../../src/core/hours/spans';
import type { HoursSpan, PlaceHours } from '../../../../src/core/types';
import { hoursValue } from '../../../gen';
import { BERLIN, hoursOf, other, placeIn, shop } from './helpers';

const SATURDAY = '2026-10-17';
const sat = (hm: string) => instantAt(SATURDAY, hm, BERLIN);
const min = (t: Date, m: number) => new Date(t.getTime() + m * 60_000);

describe('[H-ARRIVAL-1950] a Saturday arrival at 19:50 at a shop closing at 20:00', () => {
  const h = hoursOf('Mo-Sa 08:00-20:00', placeIn('DE-BW'), shop, SATURDAY);

  test('open at arrival, not open on arrival, not open for the water window', () => {
    expect(openAtArrival(h, sat('19:50'))).toBe(true);
    expect(openOnArrival(h, sat('19:50'))).toBe(false);
    expect(openWaterWindow(h, sat('19:50'))).toBe(false);
  });

  test('open on arrival holds up to 30 minutes before the close, and a meal needs 45', () => {
    expect(openOnArrival(h, sat('19:30'))).toBe(true);
    expect(openOnArrival(h, min(sat('19:30'), 0.001))).toBe(false);
    expect(openOnArrival(h, sat('19:30'), true)).toBe(false);
    expect(openOnArrival(h, sat('19:15'), true)).toBe(true);
  });

  test('the water window asks 30 minutes either side', () => {
    expect(openWaterWindow(h, sat('12:00'))).toBe(true);
    expect(openWaterWindow(h, sat('08:30'))).toBe(true);
    expect(openWaterWindow(h, sat('08:29'))).toBe(false);
    expect(openWaterWindow(h, sat('19:30'))).toBe(true);
    expect(openWaterWindow(h, sat('19:31'))).toBe(false);
  });

  test('closed exactly at the close, open exactly at the opening', () => {
    expect(openAtArrival(h, sat('20:00'))).toBe(false);
    expect(openAtArrival(h, sat('08:00'))).toBe(true);
    expect(openAtArrival(h, min(sat('08:00'), -0.001))).toBe(false);
  });

  test('stateAt says when it closes', () => {
    expect(stateAt(h, sat('19:50'))).toEqual({ state: 'open', until: sat('20:00') });
  });

  test('no hours at all: never open, "hours unknown"', () => {
    expect(stateAt(undefined, sat('12:00'))).toEqual({ state: 'unknown', reason: 'hours unknown', until: null });
    expect(openAtArrival(undefined, sat('12:00'))).toBe(false);
    expect(openOnArrival(undefined, sat('12:00'))).toBe(false);
    expect(openWaterWindow(undefined, sat('12:00'))).toBe(false);
    expect(openOver(undefined, sat('12:00'), sat('12:30'))).toBe(false);
  });
});

describe('openOver reads a hand-made list of spans', () => {
  const d = (hm: string) => sat(hm);
  const of = (spans: HoursSpan[]): PlaceHours => ({ placeId: 'n1', windowStart: d('00:00'), windowEnd: d('23:00'), spans });
  const span = (a: string, b: string, state: HoursSpan['state']): HoursSpan => ({ from: d(a), to: d(b), state });

  test('it crosses touching open spans, stops at any other state or any hole, and an empty span asks about its instant', () => {
    const h = of([span('08:00', '10:00', 'open'), span('10:00', '12:00', 'open'), span('13:00', '14:00', 'open'), span('14:00', '15:00', 'unknown')]);
    expect(openOver(h, d('09:00'), d('11:00'))).toBe(true);
    expect(openOver(h, d('09:00'), d('12:00'))).toBe(true);
    expect(openOver(h, d('09:00'), d('12:01'))).toBe(false);
    expect(openOver(h, d('13:30'), d('14:30'))).toBe(false);
    expect(openOver(h, d('09:00'), d('09:00'))).toBe(true);
    expect(openOver(h, d('12:30'), d('12:30'))).toBe(false);
    expect(openOver(h, d('11:00'), d('09:00'))).toBe(false);
  });

  test('a span reaching past the window end is not open past the window', () => {
    const h = of([span('08:00', '23:30', 'open')]);
    expect(openOver(h, d('22:00'), d('23:00'))).toBe(true);
    expect(openOver(h, d('22:00'), min(d('23:00'), 1))).toBe(false);
    expect(stateAt(h, d('23:00')).state).toBe('unknown');
  });
});

describe('isPublicHoliday', () => {
  test('reads the zone it is given, and a null or missing zone has none', () => {
    const holidays = { 'DE-BW': ['2026-05-25'] };
    expect(isPublicHoliday('2026-05-25', 'DE-BW', holidays)).toBe(true);
    expect(isPublicHoliday('2026-05-26', 'DE-BW', holidays)).toBe(false);
    expect(isPublicHoliday('2026-05-25', 'DE-BY', holidays)).toBe(false);
    expect(isPublicHoliday('2026-05-25', null, holidays)).toBe(false);
  });
});

const notOpen = new Set<HoursSpan['state']>(['unknown', 'closed', 'possibly-closed']);
const kinds: RuleClass[] = (['food-shop', 'kiosk', 'bakery', 'fuel-shop', 'other-shop', 'other'] as const).flatMap((kind) => [{ kind, nearStation: false }, { kind, nearStation: true }]);
const places = [placeIn('DE-BW'), placeIn('DE-BY-Augsburg'), placeIn('CH-ZH', 'Europe/Zurich'), placeIn('FR', 'Europe/Paris'), placeIn('PT', 'Europe/Lisbon'), placeIn('AT-9', 'Europe/Vienna')];

describe('[H-NEVER-OPEN] the check against generated hours', () => {
  fcTest.prop([fc.option(hoursValue()), fc.constantFrom(...kinds), fc.constantFrom(...places),
    fc.constantFrom('2026-05-25', '2026-10-18', '2026-08-08', '2026-06-04', '2026-03-29', '2026-10-25'),
    fc.integer({ min: 0, max: 1439 }), fc.integer({ min: 0, max: 600 })])(
    'openOver is true exactly when the whole span is open', (tag, rule, place, date, startMin, lengthMin) => {
      const h = hoursOf(tag, place, rule, date);
      const from = new Date(h.windowStart.getTime() + startMin * 60_000);
      const to = new Date(from.getTime() + lengthMin * 60_000);

      // An independent walk, minute by minute.
      let allOpen = true;
      for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
        if (stateAt(h, new Date(t)).state !== 'open') { allOpen = false; break; }
      }
      if (from.getTime() === to.getTime()) allOpen = stateAt(h, from).state === 'open';
      expect(openOver(h, from, to)).toBe(allOpen);

      // And directly: no span that is not open may overlap a span that passes.
      if (openOver(h, from, to)) {
        for (const s of h.spans) {
          if (notOpen.has(s.state) && s.from.getTime() < to.getTime() && s.to.getTime() > from.getTime()) expect.unreachable(`${s.state} inside an open span`);
        }
      }
      for (const s of h.spans) expect(s.to.getTime()).toBeGreaterThan(s.from.getTime());
    });

  test('it can pass at all: generated hours do reach an open span', () => {
    const h = hoursOf('Mo-Su 06:00-22:00', placeIn('DE-BW'), other, '2026-10-19');
    expect(openOver(h, instantAt('2026-10-19', '07:00', BERLIN), instantAt('2026-10-19', '21:00', BERLIN))).toBe(true);
  });
});

/** Every module `start` reaches through relative imports, and every bare package it names. */
function reach(start: string): { files: string[]; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const walk = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
      if (m[2]) continue;
      const to = m[3] ?? m[4]!;
      if (!to.startsWith('.')) { packages.add(to); continue; }
      const path = resolve(dirname(file), to);
      walk(path.endsWith('.ts') ? path : `${path}.ts`);
    }
  };
  walk(start);
  return { files: [...files], packages };
}

describe('[H-NO-LIBRARY] only the wrapper reaches the library', () => {
  const core = resolve('src/core');
  test('the walker finds the library from the wrapper, so it can tell', () => {
    expect(reach(join(core, 'hours/spans.ts')).packages).toContain('opening_hours');
    expect(reach(join(core, 'hours/holidays.ts')).packages).toContain('opening_hours');
  });

  test('check.ts and rules.ts do not reach it', () => {
    expect(reach(join(core, 'hours/check.ts')).packages).not.toContain('opening_hours');
    expect(reach(join(core, 'hours/rules.ts')).packages).not.toContain('opening_hours');
  });

  test('no engine reaches it', () => {
    const engines = readdirSync(join(core, 'engines')).filter((f) => f.endsWith('.ts'));
    expect(engines.length).toBeGreaterThan(0);
    for (const f of engines) expect(reach(join(core, 'engines', f)).packages, f).not.toContain('opening_hours');
  });
});

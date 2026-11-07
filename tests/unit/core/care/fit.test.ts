// Bike care's fitting (sub-project 12, Tasks 1 and 2): which details of a bike a task depends on, and which tasks show for a bike.
import { expect, test } from 'vitest';
import { normaliseBike } from '../../../../src/core/bike/normalise.ts';
import type { BikeRecord } from '../../../../src/core/bike/normalise.ts';
import { careDetails, fitOf, fitted } from '../../../../src/core/care/fit.ts';
import type { CareDetails, CareKey, CareValue, Conditions } from '../../../../src/core/care/types.ts';
import { FIT_CASES } from './fit-cases.ts';

const bike = (extra: Record<string, unknown>): BikeRecord => normaliseBike({ id: 'bike_1', name: 'Test', ...extra })!;

test('[BC-DETAILS] each stored value maps as sub-project 11 decision 1\'s table', () => {
  const brakes = { rim: 'rim', 'cable-disc': 'cable-disc', 'hydraulic-disc': 'hydraulic-disc', other: 'other', unknown: null };
  for (const [stored, want] of Object.entries(brakes)) expect(careDetails(bike({ brakes: stored })).brakes, stored).toBe(want);
  const tyres = { tubes: 'tubes', tubeless: 'tubeless', other: 'other', unknown: null };
  for (const [stored, want] of Object.entries(tyres)) expect(careDetails(bike({ tyres: stored })).tyres, stored).toBe(want);
  const drive = { derailleur: ['chain', 'derailleur'], 'chain-hub': ['chain', 'hub'], belt: ['belt', 'hub'], unknown: [null, null] };
  for (const [stored, [d, g]] of Object.entries(drive)) {
    const details = careDetails(bike({ drive: stored }));
    expect(details.drive, stored).toBe(d);
    expect(details.gears, stored).toBe(g);
  }
  const shifting = { cable: 'cable', electronic: 'electronic', none: 'other', unknown: null };
  for (const [stored, want] of Object.entries(shifting)) expect(careDetails(bike({ shifting: stored })).shifting, stored).toBe(want);
  for (const s of ['none', 'front', 'full'] as const) expect(careDetails(bike({ suspension: s })).suspension).toBe(s);
  // Not stored: a full-suspension frame says it; any other frame, or none, is Not sure.
  expect(careDetails(bike({ fit: { style: 'full-suspension' } })).suspension).toBe('full');
  expect(careDetails(bike({ fit: { style: 'diamond-level' } })).suspension).toBe(null);
  expect(careDetails(bike({})).suspension).toBe(null);
  // A stored answer stands over the frame's shape.
  expect(careDetails(bike({ suspension: 'front', fit: { style: 'full-suspension' } })).suspension).toBe('front');
  const ebike = (v: boolean | null) => careDetails(bike({ look: { colour: '#ff0000', bars: null, ebike: v } })).ebike;
  expect(ebike(true)).toBe('yes');
  expect(ebike(false)).toBe('no');
  expect(ebike(null)).toBe(null);
  expect(careDetails(bike({})).ebike).toBe(null);
});

test('[BC-DETAILS] no bike: every detail is Not sure', () => {
  expect(careDetails(null)).toEqual({ brakes: null, tyres: null, drive: null, gears: null, shifting: null, suspension: null, ebike: null });
});

// ---- Task 2: fitting ----
// The oracle, written apart from fit.ts: each stored value, key by key, as sub-project 11 decision 1's table says (null = Not sure).
const STORED = {
  brakes: ['unknown', 'rim', 'cable-disc', 'hydraulic-disc', 'other'],
  tyres: ['unknown', 'tubes', 'tubeless', 'other'],
  drive: ['unknown', 'derailleur', 'chain-hub', 'belt'],
  shifting: ['unknown', 'cable', 'electronic', 'none'],
  suspension: ['unknown', 'none', 'front', 'full'],
  ebike: [null, true, false],
} as const;
type Stored = { brakes: string; tyres: string; drive: string; shifting: string; suspension: string; ebike: boolean | null };
const map = (m: Record<string, string | null>, v: string): string | null => m[v] as string | null;
const TABLE: Record<CareKey, (s: Stored) => string | null> = {
  brakes: (s) => map({ unknown: null, rim: 'rim', 'cable-disc': 'cable-disc', 'hydraulic-disc': 'hydraulic-disc', other: 'other' }, s.brakes),
  tyres: (s) => map({ unknown: null, tubes: 'tubes', tubeless: 'tubeless', other: 'other' }, s.tyres),
  drive: (s) => map({ unknown: null, derailleur: 'chain', 'chain-hub': 'chain', belt: 'belt' }, s.drive),
  gears: (s) => map({ unknown: null, derailleur: 'derailleur', 'chain-hub': 'hub', belt: 'hub' }, s.drive),
  shifting: (s) => map({ unknown: null, cable: 'cable', electronic: 'electronic', none: 'other' }, s.shifting),
  suspension: (s) => map({ unknown: null, none: 'none', front: 'front', full: 'full' }, s.suspension),
  ebike: (s) => (s.ebike === true ? 'yes' : s.ebike === false ? 'no' : null),
};
const KEYS = Object.keys(TABLE) as CareKey[];
function oracle(applies: Conditions, s: Stored): { show: boolean; tags: CareKey[] } {
  const tags: CareKey[] = [];
  let show = true;
  for (const key of KEYS) {
    const allowed = applies[key] as string[] | undefined;
    if (!allowed) continue;
    const value = TABLE[key](s);
    if (value === null) tags.push(key);
    else if (!allowed.includes(value)) show = false;
  }
  return { show, tags };
}
function* everyStored(): Generator<Stored> {
  for (const brakes of STORED.brakes) for (const tyres of STORED.tyres) for (const drive of STORED.drive)
    for (const shifting of STORED.shifting) for (const suspension of STORED.suspension) for (const ebike of STORED.ebike)
      yield { brakes, tyres, drive, shifting, suspension, ebike };
}
const storedBike = (s: Stored): BikeRecord => bike({
  brakes: s.brakes, tyres: s.tyres, drive: s.drive, shifting: s.shifting, ...(s.suspension === 'unknown' ? {} : { suspension: s.suspension }),
  ...(s.ebike === null ? {} : { look: { colour: '#336699', bars: null, ebike: s.ebike } }),
});
const sameSet = (a: readonly string[], b: readonly string[], what = '') => expect([...a].sort(), what).toEqual([...b].sort());
const LISTS: { name: string; list: { id: string; applies: Conditions }[] }[] = [
  { name: 'test cases', list: FIT_CASES },
];

test('[BC-FIT-EVERY] over every combination of the stored details, each task shows exactly when the oracle says, tagged with exactly its Not sure keys', () => {
  let combos = 0;
  for (const s of everyStored()) {
    combos += 1;
    const details = careDetails(storedBike(s));
    for (const { name, list } of LISTS) {
      const want = list.map((t) => ({ t, o: oracle(t.applies, s) })).filter((x) => x.o.show);
      const got = fitted(list, details);
      expect(got.map((t) => t.id), `${name} ${JSON.stringify(s)}`).toEqual(want.map((x) => x.t.id));
      got.forEach((t, i) => sameSet(t.tags, want[i]!.o.tags, `${t.id} ${JSON.stringify(s)}`));
      for (const t of list) {
        const one = fitOf(t.applies, details);
        const o = oracle(t.applies, s);
        expect(one.show, `${t.id} ${JSON.stringify(s)}`).toBe(o.show);
        if (one.show) sameSet(one.tags, o.tags, `${t.id} ${JSON.stringify(s)}`);
      }
    }
  }
  expect(combos).toBe(3840);
});

test('[BC-FIT-EVERY] a task with no condition shows with no tags, whatever the bike; "other" hides a conditioned task', () => {
  const other = careDetails(bike({ brakes: 'other', tyres: 'other', shifting: 'none' }));
  expect(fitOf({}, other)).toEqual({ show: true, tags: [] });
  expect(fitOf({}, careDetails(null))).toEqual({ show: true, tags: [] });
  expect(fitOf({ brakes: ['rim', 'cable-disc', 'hydraulic-disc'] }, other).show).toBe(false);
  expect(fitOf({ tyres: ['tubes', 'tubeless'] }, other).show).toBe(false);
  expect(fitOf({ shifting: ['cable', 'electronic'] }, other).show).toBe(false);
});

test('[BC-FIT-ALL-UNSURE] with every detail Not sure, or no bike, every task shows, and each conditioned one carries its tags', () => {
  for (const details of [careDetails(null), careDetails(bike({}))]) {
    for (const { list } of LISTS) {
      const got = fitted(list, details);
      expect(got.map((t) => t.id)).toEqual(list.map((t) => t.id));
      got.forEach((t, i) => sameSet(t.tags, Object.keys(list[i]!.applies)));
    }
  }
});

test('[BC-FIT-ONLY-REMOVES] answering one Not sure detail gives a subset of the tasks, in the same order, and changes no other task\'s tags but that key\'s', () => {
  const answers: { [K in CareKey]: (CareValue[K] | 'other')[] } = {
    brakes: ['rim', 'cable-disc', 'hydraulic-disc', 'other'], tyres: ['tubes', 'tubeless', 'other'], drive: ['chain', 'belt'],
    gears: ['derailleur', 'hub'], shifting: ['cable', 'electronic', 'other'], suspension: ['none', 'front', 'full'], ebike: ['yes', 'no'],
  };
  // From all Not sure, and from every 7th stored combination (each with its own Not sure details).
  const starts: CareDetails[] = [careDetails(null)];
  let n = 0;
  for (const s of everyStored()) if (n++ % 7 === 0) starts.push(careDetails(storedBike(s)));
  let checked = 0;
  for (const start of starts) {
    for (const key of KEYS) {
      if (start[key] !== null) continue;
      for (const value of answers[key]) {
        const after = { ...start, [key]: value } as CareDetails;
        for (const { list } of LISTS) {
          const before = fitted(list, start);
          const now = fitted(list, after);
          expect(before.map((t) => t.id).filter((id) => now.some((t) => t.id === id))).toEqual(now.map((t) => t.id));
          for (const t of now) sameSet(t.tags, before.find((b) => b.id === t.id)!.tags.filter((k) => k !== key));
          checked += 1;
        }
      }
    }
  }
  expect(checked).toBeGreaterThan(500);
});

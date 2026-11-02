import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fc, test as fcTest } from '@fast-check/vitest';
import { describe, expect, test } from 'vitest';
import { emergencyCard, shareLocationText, type EmergencyCard, type EmergencyFacts } from '../../../../src/core/engines/emergency.ts';
import { COUNTRY_CODES, emergencyTable } from '../../../../src/core/places/countries.ts';
import type { Place, Position, RescuePoint } from '../../../../src/core/types.ts';
import { bannedHits } from '../../../fixtures/banned.ts';
import { at, settlement, shelter } from '../../../fixtures/build.ts';
import { destination } from '../../../fixtures/geo.ts';

const FALLBACK = '112 — works across Europe and on many mobile networks; check the local number';
const LIGHTNING = 'Roofs, shelters and huts give no protection from lightning.';
const NOW = at('2026-10-17 15:00');
const FROM = { lat: 49, lon: 8.4 };

const gps = (over: Partial<Position> = {}): Position => ({
  ...FROM, accuracyM: 12, at: at('2026-10-17 14:55'), km: 78, offRouteM: 0, source: 'gps', approximate: false, ...over,
});
const facts = (over: Partial<EmergencyFacts> = {}): EmergencyFacts => ({
  position: gps(), now: NOW, country: 'DE', settlements: [], shelters: [], rescuePoints: [], thunderNear: false, dataDate: '2026-10-28', ...over,
});
const card = (over: Partial<EmergencyFacts> = {}): EmergencyCard => emergencyCard(facts(over));
const text = (c: EmergencyCard): string => [c.title, c.detail, ...c.notes, ...c.items.flatMap((i) => [i.label, i.detail ?? ''])].join('\n');
const sign = (ref: string, m: number, bearing: number, kms: number[] = []): RescuePoint => ({ ...destination(FROM, m, bearing), ref, kms });
const placeNear = (p: Place, m: number, bearing: number): Place => ({ ...p, ...destination(FROM, m, bearing) });
const hut = (m: number, bearing: number, name: string | null = null): Place =>
  placeNear(shelter({ name }).atKm(1, { id: `n${m}${bearing}` }), m, bearing);

/** What must hold in every state of the card. */
function hasTheBasics(c: EmergencyCard): void {
  expect(c.numbers[0]).toBe('112');
  expect(c.detail).toContain(FALLBACK);
  expect(c.largeText).toBe(true);
  expect(c.items[0]!.label).toBe('112');
  expect(c.title).toBe('Call 112');
}

describe('the table', () => {
  // Written out on purpose, a second time, so that a slip in the table fails here. Sources and dates are in the table's comment.
  const EXPECTED: Record<string, string[]> = {
    DE: ['112'], FR: ['112'], DK: ['112'], NL: ['112'], LU: ['112'], BE: ['112'],
    AT: ['112', '140'], CH: ['112', '1414'], CZ: ['112', '+420 1210'], PL: ['112', '985', '+48 601 100 300'],
  };
  test.each(Object.entries(EXPECTED))('[EM-NUMBERS] %s shows exactly its numbers', (country, numbers) => {
    expect(card({ country }).numbers).toEqual(numbers);
    hasTheBasics(card({ country }));
  });
  test('[EM-NUMBERS] all ten countries are in the table, each with a source address and a date', () => {
    expect([...COUNTRY_CODES].sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const code of COUNTRY_CODES) {
      const t = emergencyTable(code)!;
      expect(t.general).toBe('112');
      expect(t.source).toMatch(/^https:\/\/[^ ]+$/);
      expect(t.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (t.mountain) {
        expect(t.mountain.source).toMatch(/^https:\/\/[^ ]+$/);
        expect(t.mountain.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(t.mountain.name.length).toBeGreaterThan(0);
      }
    }
  });
  test('[EM-NUMBERS] no number comes from a source that is no official address: the ones read', () => {
    expect(emergencyTable('AT')!.mountain!.source).toContain('oesterreich.gv.at');
    expect(emergencyTable('CH')!.mountain!.source).toContain('rega.ch');
    expect(emergencyTable('CZ')!.mountain!.source).toContain('horskasluzba.cz');
    expect(emergencyTable('PL')!.mountain!.source).toContain('gopr.pl');
  });
  test('[EM-NUMBERS] the table\'s country follows the position', () => {
    expect(card({ country: 'AT' }).numbers).toContain('140');
    expect(card({ country: 'CH' }).numbers).toContain('1414');
    expect(card({ country: 'AT' }).numbers).not.toContain('1414');
  });
  test('[EM-NUMBERS] each number says what it is for, with its regional note', () => {
    const at_ = card({ country: 'AT' });
    expect(at_.items[1]!.label).toBe('140');
    expect(at_.items[1]!.detail).toContain('mountain rescue');
    expect(at_.items[1]!.detail).toContain('In Vorarlberg, 144 also reaches mountain rescue.');
    expect(card({ country: 'CH' }).items[1]!.detail).toContain('In Valais, call 144.');
    expect(card({ country: 'DE' }).items[0]!.detail).toBe('All emergencies');
    const pl = card({ country: 'PL' });
    expect(pl.items.map((i) => i.label).slice(0, 3)).toEqual(['112', '985', '+48 601 100 300']);
  });
  test('[EM-NUMBERS] the basis names where the numbers come from and when they were checked', () => {
    expect(card({ country: 'AT' }).basis.join(' ')).toContain('oesterreich.gv.at');
    expect(card({ country: 'AT' }).basis.join(' ')).toContain('2 Nov');
    expect(card({ country: 'AT' }).freshness.dataDates['emergencyNumbers']).toBe('2026-11-02');
  });
  test('[EM-NUMBERS] it never reads as a calm card', () => {
    expect(card().status).not.toBe('fine');
    expect(card({ position: null, country: null }).status).not.toBe('fine');
  });
});

describe('fallback', () => {
  test.each<[string, string | null]>([['absent', null], ['outside the table', 'IT'], ['empty', ''], ['Great Britain', 'GB']])('[EM-FALLBACK] country %s: 112 and the line', (_n, country) => {
    const c = card({ country });
    expect(c.numbers).toEqual(['112']);
    expect(c.detail).toBe(FALLBACK);
    hasTheBasics(c);
  });
  test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'])('[EM-FALLBACK] a key like %s is no country', (country) => {
    const c = card({ country });
    expect(c.numbers).toEqual(['112']);
    hasTheBasics(c);
  });
  test.each(['constructor', '__proto__', 'toString'])('[EM-FALLBACK] a key like %s leaves the rest of the card whole', (country) => {
    expect(emergencyTable(country)).toBeNull();
    const c = card({ country, position: gps({ at: new Date('2026-10-17T12:50:00Z') }) });
    expect(c.coords).toBe('49.00000, 8.40000');
    expect(text(c)).toContain('at 12:50 UTC');
    expect(c.share).toContain('Position at 12:50 UTC');
  });
  test('[EM-FALLBACK] a lower-case or spaced code reads as its country; other types do not throw', () => {
    expect(card({ country: 'at' }).numbers).toContain('140');
    expect(card({ country: ' AT ' }).numbers).toContain('140');
    for (const country of [42, {}, [], undefined, NaN, Symbol('x')]) hasTheBasics(card({ country: country as never }));
  });
  test('[EM-FALLBACK] the line also shows in a covered country', () => {
    expect(card({ country: 'AT' }).detail).toContain(FALLBACK);
  });
});

describe('no position', () => {
  const allAbsent = (c: EmergencyCard): void => {
    expect(c.coords).toBeNull();
    expect(c.share).toBeNull();
    expect(c.rescue).toBeNull();
    expect(c.routeKm).toBeNull();
    expect(shareLocationText(c)).toBeNull();
    expect(c.items.map((i) => i.label)).toEqual(['112']);
    expect(text(c)).not.toMatch(/km \d|undefined|NaN|null|\b0\.0000/);
  };
  test('[EM-NO-POSITION] numbers and fallback show; coordinates, kilometre, rescue line and Share are absent', () => {
    const c = card({ position: null, country: null, rescuePoints: [sign('KA-145', 100, 0)], settlements: [placeNear(settlement('Near').atKm(1), 100, 0)], shelters: [hut(100, 0)] });
    hasTheBasics(c);
    allAbsent(c);
  });
  test('[EM-NO-POSITION] with no forecast, hours or packs: empty data throughout', () => {
    const c = card({ position: null, country: null, rescuePoints: [], settlements: [], shelters: [], dataDate: '' });
    hasTheBasics(c);
    allAbsent(c);
    expect(c.missing).toContain('places');
  });
  test('[EM-NO-POSITION] with no position a stated country does not bring its mountain number: the country follows the position', () => {
    const c = card({ position: null, country: 'AT' });
    expect(c.numbers).toEqual(['112']);
    allAbsent(c);
  });
  test.each<[string, Partial<Position>]>([
    ['NaN latitude', { lat: NaN }], ['NaN longitude', { lon: NaN }], ['infinite', { lat: Infinity }], ['latitude over 90', { lat: 91 }],
    ['longitude over 180', { lon: 181 }], ['the empty 0, 0', { lat: 0, lon: 0 }],
    ['a text latitude', { lat: '49' as unknown as number }], ['missing coordinates', { lat: undefined as unknown as number, lon: undefined as unknown as number }],
  ])('[EM-NO-POSITION] %s is no position: nothing invented', (_n, bad) => {
    const c = card({ position: gps(bad), country: null });
    hasTheBasics(c);
    allAbsent(c);
  });
  test('[EM-NO-POSITION] a real point on the equator or the meridian is a position', () => {
    expect(card({ position: gps({ lat: 0, lon: 8.4 }) }).coords).toBe('0.00000, 8.40000');
    expect(card({ position: gps({ lat: 49, lon: 0 }) }).coords).toBe('49.00000, 0.00000');
  });
});

describe('location', () => {
  test('[EM-LOCATION] position with its age, decimal coordinates and route kilometre', () => {
    const c = card({ position: gps({ lat: 49.123456, lon: 8.123456 }) });
    expect(c.coords).toBe('49.12346, 8.12346');
    expect(c.routeKm).toBe(78);
    const t = text(c);
    expect(t).toContain('Last position at 14:55 (5 min ago)');
    expect(t).toContain('49.12346, 8.12346');
    expect(t).toContain('Route km 78');
  });
  test('[EM-LOCATION] nearest settlement, with distance and direction', () => {
    const c = card({ settlements: [placeNear(settlement('Far').atKm(1, { id: 'n1' }), 3000, 0), placeNear(settlement('Ettlingen').atKm(1, { id: 'n2' }), 1200, 225)] });
    expect(text(c)).toContain('Nearest settlement: Ettlingen, 1.2 km south-west');
    expect(text(c)).not.toContain('Far');
  });
  test('[EM-LOCATION] a broken first settlement does not decide; a nameless one is no settlement', () => {
    const c = card({ settlements: [
      { ...settlement('Broken').atKm(1, { id: 'n1' }), lat: NaN },
      { ...placeNear(settlement('x').atKm(1, { id: 'n2' }), 10, 0), name: null },
      placeNear(settlement('Good').atKm(1, { id: 'n3' }), 1000, 0),
    ] });
    expect(text(c)).toContain('Nearest settlement: Good, 1.0 km north');
  });
  test('[EM-LOCATION] far off the route the settlement says a nearer one may exist', () => {
    const s = [placeNear(settlement('Stored').atKm(1), 9000, 0)];
    expect(text(card({ settlements: s, position: gps({ offRouteM: 6000 }) }))).toContain('Settlements far from your route are not stored; a nearer one may exist.');
    expect(text(card({ settlements: s, position: gps({ offRouteM: 100 }) }))).not.toContain('not stored');
  });
  test('[EM-LOCATION] weather shelters within 3 km, nearest first, and 3 km counts', () => {
    const c = card({ shelters: [hut(2500, 0, 'Second'), hut(3000, 90, 'Edge'), hut(3100, 90, 'Out'), hut(400, 180, 'First')] });
    const labels = c.items.map((i) => i.label).filter((l) => /First|Second|Edge|Out/.test(l));
    expect(labels).toEqual([expect.stringContaining('First'), expect.stringContaining('Second'), expect.stringContaining('Edge')]);
    expect(labels[0]).toContain('400 m south');
  });
  test('[EM-LOCATION] an unnamed shelter says what is mapped and that it is not checked', () => {
    expect(text(card({ shelters: [hut(400, 180)] }))).toContain('Mapped as a weather shelter, not checked.');
  });
  test('[EM-LOCATION] private shelters and broken coordinates are not offered', () => {
    const closed = { ...hut(100, 0, 'Locked'), tags: { amenity: 'shelter', shelter_type: 'weather_shelter', access: 'private' } };
    const c = card({ shelters: [{ ...hut(100, 0, 'Broken'), lat: NaN }, closed, hut(200, 0, 'Open')] });
    expect(text(c)).toContain('Open');
    expect(text(c)).not.toContain('Broken');
    expect(text(c)).not.toContain('Locked');
  });
  test('[EM-LOCATION] the rescue line is on the card', () => {
    const c = card({ rescuePoints: [sign('KA-145', 600, 45)] });
    expect(c.rescue!.ref).toBe('KA-145');
    const item = c.items.find((i) => i.label.startsWith('Rescue point'))!;
    expect(item.label).toBe('Rescue point KA-145 · 600 m north-east');
    expect(item.detail).toContain('Give this number and your coordinates when you call.');
  });
  test('[EM-LOCATION] a position in the phone\'s future counts with age 0', () => {
    const c = card({ position: gps({ at: at('2026-10-17 15:30') }) });
    expect(text(c)).toContain('Last position at 15:30 (just now)');
    expect(c.updatePosition).toBe(false);
  });
  test('[EM-LOCATION] no usable map data says so, and names places as missing', () => {
    const c = card({ dataDate: '' });
    expect(c.missing).toContain('places');
    expect(text(c)).toContain('No map data saved here: no settlement, rescue point or shelter can be shown.');
    expect(card({ dataDate: '2026-10-28' }).missing).toEqual([]);
  });
  test('[EM-LOCATION] places shown carry the attribution', () => {
    expect(card({ rescuePoints: [sign('A', 600, 45)] }).basis).toContain('© OpenStreetMap contributors');
  });
  test('[EM-LOCATION] time is on the place\'s clock: the country\'s zone', () => {
    const lisbonPhoneIrrelevant = gps({ at: new Date('2026-10-17T12:20:00Z') });
    expect(text(card({ position: lisbonPhoneIrrelevant, country: 'PL' }))).toContain('at 14:20');
  });
  test('[EM-LOCATION] outside the table a passed zone is used; without one the time says UTC', () => {
    const p = gps({ at: new Date('2026-10-17T12:50:00Z') });
    expect(text(card({ position: p, country: 'IT', timeZone: 'Europe/Rome' }))).toContain('at 14:50');
    expect(text(card({ position: p, country: 'IT' }))).toContain('at 12:50 UTC');
    expect(text(card({ position: p, country: 'IT', timeZone: 'constructor' }))).toContain('at 12:50 UTC');
  });
});

describe('thunderstorm', () => {
  test('[EM-LIGHTNING] each shelter carries the line when a storm is near', () => {
    const c = card({ thunderNear: true, shelters: [hut(100, 0, 'A'), hut(200, 0, 'B')] });
    const shelters = c.items.filter((i) => /^(A|B)\b/.test(i.label));
    expect(shelters).toHaveLength(2);
    for (const s of shelters) expect(s.detail).toContain(LIGHTNING);
  });
  test('[EM-LIGHTNING] not otherwise', () => {
    expect(text(card({ thunderNear: false, shelters: [hut(100, 0, 'A')] }))).not.toContain('lightning');
  });
});

describe('measures from the position itself', () => {
  const approx = gps({ km: 76, accuracyM: 800, approximate: true });
  test('[EM-FROM-POSITION] ±800 m at km 76: from km 76 itself, not 75.2 or 76.8, and says it is approximate', () => {
    const c = card({ position: approx, rescuePoints: [sign('A', 600, 45, [76.5])] });
    expect(c.routeKm).toBe(76);
    expect(text(c)).toContain('Route km 76');
    expect(text(c)).toContain('on your route at km 76.5, 500 m ahead');
    expect(text(c)).not.toContain('75.2');
    expect(text(c)).not.toContain('76.8');
    expect(text(c)).toContain('approximate');
  });
  test('[EM-FROM-POSITION] with no sign nearby it still says approximate, without talk of a sign', () => {
    const t = text(card({ position: approx }));
    expect(t).toContain('Your position is approximate (±800 m).');
    expect(t).not.toContain('sign');
  });
});

describe('notes', () => {
  test('[EM-NOTES] 40 minutes old: the note and Update position', () => {
    const c = card({ position: gps({ at: at('2026-10-17 14:20') }) });
    expect(c.notes).toContain('From your position at 14:20 (40 min ago)');
    expect(c.updatePosition).toBe(true);
    expect(text(c)).not.toContain('Last position at');
  });
  test('[EM-NOTES] exactly 15 minutes is not older than 15; a moment later is', () => {
    expect(card({ position: gps({ at: at('2026-10-17 14:45') }) }).updatePosition).toBe(false);
    expect(card({ position: gps({ at: new Date(at('2026-10-17 14:45').getTime() - 1000) }) }).updatePosition).toBe(true);
  });
  test('[EM-NOTES] ±800 m with a sign', () => {
    const c = card({ position: gps({ accuracyM: 800, approximate: true }), rescuePoints: [sign('A', 600, 45)] });
    expect(c.notes).toContain('Your position is approximate (±800 m); look for the sign nearby.');
  });
  test('[EM-NOTES] worse than 500 m is approximate even if the flag was lost', () => {
    const c = card({ position: gps({ accuracyM: 501, approximate: false }) });
    expect(c.notes).toContain('Your position is approximate (±501 m).');
    expect(card({ position: gps({ accuracyM: 500, approximate: false }) }).notes.join()).not.toContain('approximate');
  });
  test('[EM-NOTES] manual', () => {
    const c = card({ position: gps({ source: 'manual', accuracyM: 0 }) });
    expect(c.notes).toContain('From km 78 (set by hand).');
    expect(c.notes.join()).not.toContain('approximate');
  });
  test('[EM-NOTES] ages over an hour and over two days', () => {
    expect(card({ position: gps({ at: at('2026-10-17 12:55') }) }).notes[0]).toContain('(2 h 5 min ago)');
    expect(card({ position: gps({ at: at('2026-10-14 15:00') }) }).notes[0]).toContain('(3 days ago)');
  });
  test('[EM-NOTES] an unreadable fix time: not known, treated as old, no invented age', () => {
    const c = card({ position: gps({ at: new Date(NaN) }) });
    expect(c.coords).toBe('49.00000, 8.40000');
    expect(text(c)).toContain('Last position: time not known');
    expect(c.updatePosition).toBe(true);
    expect(text(c)).not.toMatch(/NaN|Invalid/);
    hasTheBasics(c);
  });
  test('[EM-NOTES] an unreadable clock: the fix time with no age', () => {
    const c = card({ now: new Date(NaN) });
    expect(text(c)).toContain('From your position at 14:55');
    expect(text(c)).not.toMatch(/ago|NaN|Invalid/);
    expect(c.updatePosition).toBe(true);
    hasTheBasics(c);
  });
  test('[EM-NOTES] bad accuracy reads not known; a bad kilometre leaves out that line and keeps the coordinates', () => {
    expect(card({ position: gps({ accuracyM: NaN }) }).notes).toContain('The accuracy of this position is not known.');
    expect(card({ position: gps({ accuracyM: -5 }) }).notes).toContain('The accuracy of this position is not known.');
    const c = card({ position: gps({ km: NaN }) });
    expect(c.routeKm).toBeNull();
    expect(c.coords).toBe('49.00000, 8.40000');
    expect(text(c)).not.toMatch(/Route km|NaN/);
  });
  test('[EM-NOTES] a manual position with a bad kilometre invents none', () => {
    expect(card({ position: gps({ source: 'manual', km: NaN }) }).notes).toContain('Set by hand.');
  });
});

describe('the sign\'s number', () => {
  test('[EM-NO-SIGN-PHONE] never on the card or in Share, and the engines do not read it', () => {
    const signed = { ...sign('KA-145', 600, 45), emergency_telephone_code: '+49 800 999', tags: { emergency_telephone_code: '999' } } as RescuePoint;
    const c = card({ rescuePoints: [signed] });
    expect(JSON.stringify(c)).not.toContain('999');
    for (const file of ['emergency.ts', 'rescue.ts']) {
      expect(readFileSync(resolve('src/core/engines', file), 'utf8')).not.toContain('emergency_telephone_code');
    }
  });
});

describe('Share my location', () => {
  const lines = (c: EmergencyCard): string[] => shareLocationText(c)!.split('\n');
  test('[EM-SHARE] time, accuracy, coordinates and a geo: link', () => {
    const c = card({ position: gps({ at: at('2026-10-17 14:50') }) });
    expect(lines(c)).toEqual(['Position at 14:50, accurate to 12 m', '49.00000, 8.40000', 'geo:49.00000,8.40000']);
    expect(c.share).toBe(shareLocationText(c));
  });
  test('[EM-SHARE] the rescue point only when the card shows it', () => {
    const shown = card({ rescuePoints: [sign('KA-145', 600, 45)] });
    expect(lines(shown)).toContain('Nearest rescue point: KA-145, 600 m north-east of that position');
    const notShown = card({ rescuePoints: [sign('KA-145', 2100, 45)] });
    expect(notShown.rescue).toBeNull();
    expect(shareLocationText(notShown)).not.toContain('rescue');
  });
  test('[EM-SHARE] 40 minutes old: the sender\'s words, with no relative time', () => {
    const s = shareLocationText(card({ position: gps({ at: at('2026-10-17 14:20') }) }))!;
    expect(s).toContain('Position at 14:20, accurate to 12 m');
    expect(s).toContain('This was my last position fix; I may have moved since.');
    expect(s).not.toMatch(/ago|\bmin\b/);
  });
  test('[EM-SHARE] not old: no last-fix line', () => {
    expect(shareLocationText(card())).not.toContain('last position fix');
  });
  test('[EM-SHARE] approximate', () => {
    const s = shareLocationText(card({ position: gps({ accuracyM: 800, approximate: true }) }))!;
    expect(s).toContain('This position is approximate.');
    expect(s).toContain('accurate to 800 m');
  });
  test('[EM-SHARE] manual: no accuracy claimed', () => {
    const s = shareLocationText(card({ position: gps({ source: 'manual', accuracyM: 0 }) }))!;
    expect(s).toContain('This position was set by hand on my route, not from GPS.');
    expect(s).toContain('Position at 14:55');
    expect(s).not.toContain('accurate to');
  });
  test('[EM-SHARE] manual: no accuracy claimed, whatever figure it carries', () => {
    expect(shareLocationText(card({ position: gps({ source: 'manual', accuracyM: 12 }) }))).not.toContain('accurate to');
  });
  test('[EM-SHARE] unknown accuracy and time state nothing false', () => {
    const noAccuracy = shareLocationText(card({ position: gps({ accuracyM: NaN }) }))!;
    expect(noAccuracy).not.toContain('accurate to');
    expect(noAccuracy).toContain('This position is approximate.');
    const noTime = shareLocationText(card({ position: gps({ at: new Date(NaN) }) }))!;
    expect(noTime).toContain('Position, time not known, accurate to 12 m');
    expect(noTime).toContain('This was my last position fix; I may have moved since.');
    expect(noTime).not.toMatch(/NaN|Invalid/);
  });
  test('[EM-SHARE] outside the table the time says UTC, for whoever reads it', () => {
    expect(shareLocationText(card({ country: 'IT', position: gps({ at: new Date('2026-10-17T12:50:00Z') }) }))).toContain('Position at 12:50 UTC');
  });
  test('[EM-SHARE] holds no numbers to call and no card wording', () => {
    const s = shareLocationText(card({ country: 'AT' }))!;
    expect(s).not.toContain('112');
    expect(s).not.toContain('140');
  });
  test('[EM-SHARE] a card with nothing to share gives null, also a hand-made one', () => {
    expect(shareLocationText(card({ position: null }))).toBeNull();
    expect(shareLocationText({} as EmergencyCard)).toBeNull();
  });
});

describe('nothing else failing may stop it', () => {
  const thrower = <T,>(): T => new Proxy([], { get() { throw new Error('boom'); } }) as T;
  const bomb = (key: keyof EmergencyFacts): EmergencyFacts => {
    const f = facts({ rescuePoints: [sign('A', 600, 45)], shelters: [hut(100, 0, 'S')], settlements: [placeNear(settlement('Town').atKm(1), 500, 0)], country: 'AT' });
    Object.defineProperty(f, key, { get() { throw new Error('boom'); } });
    return f;
  };
  test.each<keyof EmergencyFacts>(['country', 'position', 'now', 'settlements', 'shelters', 'rescuePoints', 'thunderNear', 'dataDate', 'timeZone'])('[EM-NO-POSITION] reading %s throws: the numbers and the line still show', (key) => {
    hasTheBasics(emergencyCard(bomb(key)));
  });
  test('[EM-NO-POSITION] one broken part leaves the others: broken rescue points keep the coordinates and the mountain number', () => {
    const c = emergencyCard(bomb('rescuePoints'));
    expect(c.numbers).toContain('140');
    expect(c.coords).toBe('49.00000, 8.40000');
    expect(text(c)).toContain('Town');
    expect(c.share).toContain('geo:');
  });
  test('[EM-NO-POSITION] broken shelters keep the rescue line', () => {
    expect(emergencyCard(bomb('shelters')).rescue!.ref).toBe('A');
  });
  test('[EM-NO-POSITION] broken lists instead of arrays do not throw', () => {
    hasTheBasics(emergencyCard(facts({ settlements: null as never, shelters: undefined as never, rescuePoints: 7 as never })));
    hasTheBasics(emergencyCard(facts({ settlements: thrower(), shelters: thrower(), rescuePoints: thrower() })));
  });
  test('[EM-NO-POSITION] no facts at all', () => {
    hasTheBasics(emergencyCard(undefined as never));
    hasTheBasics(emergencyCard(null as never));
    hasTheBasics(emergencyCard({} as never));
  });
  test('[EM-NO-POSITION] a position whose date throws keeps the coordinates or drops them, and the numbers stay', () => {
    const p = gps();
    Object.defineProperty(p, 'at', { get() { throw new Error('boom'); } });
    hasTheBasics(card({ position: p }));
  });

  const CODES = ['DE', 'AT', 'CH', 'FR', 'BE', 'NL', 'DK', 'PL', 'CZ', 'LU', 'IT', 'constructor', '__proto__', '', 'toString'];
  fcTest.prop([
    fc.option(fc.record({
      lat: fc.oneof(fc.double(), fc.constant(0), fc.double({ min: -90, max: 90, noNaN: true })),
      lon: fc.oneof(fc.double(), fc.constant(0), fc.double({ min: -180, max: 180, noNaN: true })),
      accuracyM: fc.oneof(fc.double(), fc.constant(12), fc.constant(800)),
      at: fc.date(),
      km: fc.oneof(fc.double(), fc.double({ min: 0, max: 1000, noNaN: true })),
      offRouteM: fc.double(),
      source: fc.constantFrom<'gps' | 'manual'>('gps', 'manual'),
      approximate: fc.boolean(),
    })),
    fc.oneof(fc.constant(null), fc.constantFrom(...CODES), fc.string()),
    fc.date(),
    fc.boolean(),
    fc.array(fc.record({ lat: fc.double(), lon: fc.double(), ref: fc.string(), kms: fc.array(fc.double()) }), { maxLength: 4 }),
  ])('[EM-NO-POSITION] in any state: numbers and the line, and coordinates only when real', (position, country, now, thunderNear, rescuePoints) => {
    const c = emergencyCard({ position, country, now, thunderNear, rescuePoints, settlements: [], shelters: [], dataDate: '2026-10-28' });
    hasTheBasics(c);
    const real = position !== null && Math.abs(position.lat) <= 90 && Math.abs(position.lon) <= 180 && !(position.lat === 0 && position.lon === 0);
    expect(c.coords !== null).toBe(real);
    expect(c.share !== null).toBe(real);
    const t = text(c) + (c.share ?? '');
    expect(t).not.toMatch(/\bNaN\b|Infinity|undefined|Invalid Date/);
    expect(bannedHits(t)).toEqual([]);
  });
});

describe('it cannot wait on anything lazy', () => {
  test('[EM-NO-POSITION] emergency.ts reaches neither hours/spans nor the opening_hours library, directly or through its imports', () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)) {
        const spec = m[1]!;
        if (!spec.startsWith('.')) { expect(spec).not.toBe('opening_hours'); continue; }
        const next = resolve(dirname(file), spec);
        expect(next.replaceAll('\\', '/')).not.toMatch(/hours\/spans/);
        if (/import type|export type/.test(m[0]!.split('from')[0]!)) continue;
        walk(next);
      }
    };
    walk(resolve('src/core/engines/emergency.ts'));
    expect(seen.size).toBeGreaterThan(2);
    const files = [...seen].map((f) => f.replaceAll('\\', '/'));
    expect(files.some((f) => f.endsWith('places/countries.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('engines/rescue.ts'))).toBe(true);
  });
});

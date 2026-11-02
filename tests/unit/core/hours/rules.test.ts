import { describe, expect, test } from 'vitest';
import { instantAt } from '../../../../src/core/answers/time';
import { isPublicHoliday, openOver, stateAt } from '../../../../src/core/hours/check';
import { holidaysFor } from '../../../../src/core/hours/holidays';
import { easterSunday } from '../../../../src/core/hours/rules';
import type { RuleClass } from '../../../../src/core/hours/spans';
import type { PlaceHours } from '../../../../src/core/types';
import { DEVICE_ZONES, withDeviceZone } from '../../../fixtures/zones';
import { BERLIN, hoursOf, other, placeIn, shop } from './helpers';

const PLAIN = 'Mo-Sa 08:00-20:00';
const bakery: RuleClass = { kind: 'bakery', nearStation: false };
const fuel: RuleClass = { kind: 'fuel-shop', nearStation: false };
const kiosk: RuleClass = { kind: 'kiosk', nearStation: false };
const otherShop: RuleClass = { kind: 'other-shop', nearStation: false };

const read = (h: PlaceHours, date: string, hm: string, tz = BERLIN) => stateAt(h, instantAt(date, hm, tz));
const holidayIn = (zone: string, date: string) => isPublicHoliday(date, zone, holidaysFor([zone], date, date));
const RULES = { sunday: 'probably closed (Sunday rules)', holiday: 'probably closed (holiday rules)', local: 'possibly closed — local holiday', may: 'may be open' };

const SUNDAY = '2026-10-18';
const WHIT_MONDAY = '2026-05-25';
const CORPUS_CHRISTI = '2026-06-04';

describe('[H-DE-SUNDAY] a Sunday in Germany', () => {
  const bw = placeIn('DE-BW');
  const noonOf = (h: PlaceHours) => read(h, SUNDAY, '12:00');

  test('a shop tagged Mo-Sa 08:00-20:00 is closed', () => {
    expect(noonOf(hoursOf(PLAIN, bw, shop, SUNDAY)).state).toBe('closed');
  });

  test('a shop tagged open on Sundays follows its tag', () => {
    expect(noonOf(hoursOf('Mo-Su 08:00-20:00', bw, shop, SUNDAY)).state).toBe('open');
  });

  test('an untagged shop: "hours unknown" plus "probably closed (Sunday rules)", labelled as an assumption', () => {
    const s = noonOf(hoursOf(null, bw, shop, SUNDAY));
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain('hours unknown');
    expect(s.reason).toContain(RULES.sunday);
    expect(s.reason).toContain('assumption');
  });

  test.each([['other shop', otherShop], ['kiosk', kiosk]] as const)('an untagged %s reads the same', (_n, rule) => {
    expect(noonOf(hoursOf(null, bw, rule, SUNDAY)).reason).toContain(RULES.sunday);
  });

  test.each([['bakery', bakery], ['fuel-station shop', fuel]] as const)('an untagged %s "may be open", state unknown, which never passes openOver', (_n, rule) => {
    const h = hoursOf(null, bw, rule, SUNDAY);
    const s = noonOf(h);
    expect(s.state).toBe('unknown');
    expect(s.reason).toContain(RULES.may);
    expect(s.reason).toContain('assumption');
    expect(openOver(h, instantAt(SUNDAY, '11:00', BERLIN), instantAt(SUNDAY, '12:00', BERLIN))).toBe(false);
  });

  test('a place that is no shop stays plain "hours unknown"', () => {
    expect(noonOf(hoursOf(null, bw, other, SUNDAY))).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });

  test('the same untagged shop on a weekday is plain "hours unknown"', () => {
    expect(read(hoursOf(null, bw, shop, '2026-10-19'), '2026-10-19', '12:00')).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });

  test('Austria reads the same on a Sunday', () => {
    const at = placeIn('AT-9', 'Europe/Vienna');
    expect(read(hoursOf(null, at, shop, SUNDAY), SUNDAY, '12:00', 'Europe/Vienna').reason).toContain(RULES.sunday);
    expect(read(hoursOf(null, at, bakery, SUNDAY), SUNDAY, '12:00', 'Europe/Vienna').reason).toContain(RULES.may);
  });

  test('a rejected tag is treated as no hours: the same assumption', () => {
    expect(noonOf(hoursOf('Mo-Fr 25:00-26:00', bw, shop, SUNDAY)).reason).toContain(RULES.sunday);
  });
});

describe('[H-DE-HOLIDAY] Whit Monday in Baden-Württemberg', () => {
  const bw = placeIn('DE-BW');
  test('Mo-Sa 08:00-20:00: possibly closed in its hours, "probably closed (holiday rules)", an assumption', () => {
    const h = hoursOf(PLAIN, bw, shop, WHIT_MONDAY);
    const s = read(h, WHIT_MONDAY, '10:00');
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain(RULES.holiday);
    expect(s.reason).toContain('assumption');
    expect(read(h, WHIT_MONDAY, '22:00').state).toBe('closed');
  });

  test('with an explicit PH rule it follows the rule', () => {
    const open = hoursOf(`${PLAIN}; PH 10:00-12:00`, bw, shop, WHIT_MONDAY);
    expect(read(open, WHIT_MONDAY, '11:00').state).toBe('open');
    expect(read(open, WHIT_MONDAY, '14:00').state).toBe('closed');
    expect(read(hoursOf(`${PLAIN}; PH off`, bw, shop, WHIT_MONDAY), WHIT_MONDAY, '11:00').state).toBe('closed');
  });

  test('"PH" inside a comment is no PH rule', () => {
    const h = hoursOf('Mo-Sa 08:00-20:00 open "not on PH"', bw, shop, WHIT_MONDAY);
    expect(read(h, WHIT_MONDAY, '11:00').state).toBe('possibly-closed');
  });

  test.each([['bakery', bakery], ['fuel-station shop', fuel]] as const)('a tagged %s "may be open", state unknown', (_n, rule) => {
    const s = read(hoursOf(PLAIN, bw, rule, WHIT_MONDAY), WHIT_MONDAY, '10:00');
    expect(s.state).toBe('unknown');
    expect(s.reason).toContain(RULES.may);
  });

  test('a restaurant is no shop: its tag stands', () => {
    expect(read(hoursOf(PLAIN, bw, other, WHIT_MONDAY), WHIT_MONDAY, '10:00').state).toBe('open');
  });

  test('an untagged shop reads the Sunday rule on a holiday', () => {
    expect(read(hoursOf(null, bw, shop, WHIT_MONDAY), WHIT_MONDAY, '10:00').reason).toContain(RULES.sunday);
  });

  test('the day before and after are untouched', () => {
    const h = hoursOf(PLAIN, bw, shop, '2026-05-23', '2026-05-26');
    expect(read(h, '2026-05-23', '10:00').state).toBe('open');
    expect(read(h, '2026-05-26', '10:00').state).toBe('open');
    expect(openOver(h, instantAt(WHIT_MONDAY, '09:00', BERLIN), instantAt(WHIT_MONDAY, '10:00', BERLIN))).toBe(false);
  });

  test('in Austria too, but not in the Netherlands, where the rule does not apply', () => {
    const vienna = 'Europe/Vienna';
    expect(read(hoursOf(PLAIN, placeIn('AT-9', vienna), shop, WHIT_MONDAY), WHIT_MONDAY, '10:00', vienna).state).toBe('possibly-closed');
    const ams = 'Europe/Amsterdam';
    expect(read(hoursOf(PLAIN, placeIn('NL', ams), shop, WHIT_MONDAY), WHIT_MONDAY, '10:00', ams).state).toBe('open');
  });
});

describe('[H-AUGSBURG] 8 August', () => {
  const date = '2026-08-08'; // a Saturday
  const augsburg = placeIn('DE-BY-Augsburg');
  const nuernberg = placeIn('DE-BY');

  test('is a holiday in Augsburg, not in Nürnberg', () => {
    expect(holidayIn('DE-BY-Augsburg', date)).toBe(true);
    expect(holidayIn('DE-BY', date)).toBe(false);
  });

  test('a plain-hours shop: probably closed in Augsburg, open in Nürnberg', () => {
    expect(read(hoursOf(PLAIN, augsburg, shop, date), date, '10:00')).toMatchObject({ state: 'possibly-closed' });
    expect(read(hoursOf(PLAIN, nuernberg, shop, date), date, '10:00').state).toBe('open');
  });

  test('a shop with PH off: closed in Augsburg, open in Nürnberg, where the library would wrongly call it a holiday', () => {
    const tag = `${PLAIN}; PH off`;
    expect(read(hoursOf(tag, augsburg, shop, date), date, '10:00').state).toBe('closed');
    expect(read(hoursOf(tag, nuernberg, shop, date), date, '10:00').state).toBe('open');
  });

  test('the correction reads that day alone: other holidays of Bavaria hold', () => {
    expect(read(hoursOf(`${PLAIN}; PH off`, nuernberg, shop, '2026-08-07', '2026-08-15'), '2026-08-15', '10:00').state).toBe('closed');
  });

  test('an untagged shop in Nürnberg on 8 August is plain "hours unknown"', () => {
    expect(read(hoursOf(null, nuernberg, shop, date), date, '10:00')).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });
});

describe('[H-AUG15-CC] local holidays', () => {
  const munich = placeIn('DE-BY');
  const dresden = placeIn('DE-SN');
  const erfurt = placeIn('DE-TH');

  test('Easter is reckoned correctly, so Corpus Christi 2026 is 4 June', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
  });

  test.each([
    ['15 August in Munich', munich, '2026-08-15'],
    ['Corpus Christi in Saxony', dresden, CORPUS_CHRISTI],
    ['Corpus Christi in Thuringia', erfurt, CORPUS_CHRISTI],
  ] as const)('%s: "possibly closed — local holiday"', (_n, place, date) => {
    const s = read(hoursOf(PLAIN, place, shop, date), date, '10:00');
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain(RULES.local);
    expect(read(hoursOf(null, place, shop, date), date, '10:00')).toMatchObject({ state: 'possibly-closed' });
    expect(read(hoursOf(null, place, shop, date), date, '10:00').reason).toContain(RULES.local);
  });

  test.each([['DE-BY', '2026-08-15'], ['DE-BY-Augsburg', '2026-08-15'], ['DE-SN', CORPUS_CHRISTI], ['DE-TH', CORPUS_CHRISTI]])(
    '%s on %s counts as a public holiday for T1 and closure', (zone, date) => {
      expect(holidayIn(zone, date)).toBe(true);
    });

  test.each([['DE-NI', '2026-08-15'], ['DE-BB', CORPUS_CHRISTI]])('%s on %s does not', (zone, date) => {
    expect(holidayIn(zone, date)).toBe(false);
  });

  test('a bakery on such a day may be open', () => {
    expect(read(hoursOf(PLAIN, munich, bakery, '2026-08-15'), '2026-08-15', '10:00')).toMatchObject({ state: 'unknown' });
  });

  test('a PH rule in Saxony can\'t be read for a day the library does not know, so it stays possibly closed, never open', () => {
    const s = read(hoursOf(`${PLAIN}; PH off`, dresden, shop, CORPUS_CHRISTI), CORPUS_CHRISTI, '10:00');
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain(RULES.local);
  });

  test('a PH rule in Bavaria on 15 August follows the rule, which the library knows', () => {
    expect(read(hoursOf(`${PLAIN}; PH off`, munich, shop, '2026-08-15'), '2026-08-15', '10:00').state).toBe('closed');
  });

  test('extra holidays passed in count at that zone alone', () => {
    const date = '2026-07-20';
    const extra = { 'DE-BW': [date] };
    expect(read(hoursOf(PLAIN, placeIn('DE-BW'), shop, date, date, extra), date, '10:00').state).toBe('possibly-closed');
    expect(read(hoursOf(PLAIN, munich, shop, date, date, extra), date, '10:00').state).toBe('open');
  });
});

// Each state's own holiday, by the state's law, with a state that does not have it on that date.
const STATES: [string, string, string, string][] = [
  ['DE-BW', '2026-01-06', 'DE-NI', 'Epiphany'],
  ['DE-BY', '2026-01-06', 'DE-HE', 'Epiphany'],
  ['DE-BE', '2026-03-08', 'DE-BB', "Women's Day"],
  ['DE-BB', '2026-04-05', 'DE-BE', 'Easter Sunday'],
  ['DE-HB', '2026-10-31', 'DE-NW', 'Reformation Day'],
  ['DE-HH', '2026-10-31', 'DE-BY', 'Reformation Day'],
  ['DE-HE', '2026-06-04', 'DE-NI', 'Corpus Christi'],
  ['DE-MV', '2026-03-08', 'DE-SH', "Women's Day"],
  ['DE-NI', '2026-10-31', 'DE-HE', 'Reformation Day'],
  ['DE-NW', '2026-11-01', 'DE-HB', "All Saints' Day"],
  ['DE-RP', '2026-11-01', 'DE-HE', "All Saints' Day"],
  ['DE-SL', '2026-08-15', 'DE-RP', 'Assumption'],
  ['DE-SN', '2026-11-18', 'DE-TH', 'Repentance Day'],
  ['DE-ST', '2026-01-06', 'DE-SN', 'Epiphany'],
  ['DE-SH', '2026-10-31', 'DE-NW', 'Reformation Day'],
  ['DE-TH', '2026-09-20', 'DE-SN', "Children's Day"],
];

describe('[H-STATES] one place per German state on its own holiday', () => {
  test('the table holds all 16 states', () => expect(new Set(STATES.map((s) => s[0])).size).toBe(16));

  test.each(STATES)('%s on %s, not %s (%s)', (zone, date, not) => {
    expect(holidayIn(zone, date)).toBe(true);
    expect(holidayIn(not, date)).toBe(false);
    expect(read(hoursOf('PH 10:00-12:00', placeIn(zone), other, date), date, '11:00').state).toBe('open');
    expect(read(hoursOf('PH 10:00-12:00', placeIn(not), other, date), date, '11:00').state).toBe('closed');
    expect(read(hoursOf('Mo-Su 08:00-20:00', placeIn(zone), shop, date), date, '11:00').state).toBe('possibly-closed');
    expect(read(hoursOf('Mo-Su 08:00-20:00', placeIn(not), shop, date), date, '11:00').state).toBe('open');
  });
});

describe('[H-STRASBOURG] Alsace-Moselle', () => {
  test.each(['FR-57', 'FR-67', 'FR-68'])('%s has Good Friday and 26 December', (zone) => {
    expect(holidayIn(zone, '2026-04-03')).toBe(true);
    expect(holidayIn(zone, '2026-12-26')).toBe(true);
  });

  test('Paris has neither', () => {
    expect(holidayIn('FR', '2026-04-03')).toBe(false);
    expect(holidayIn('FR', '2026-12-26')).toBe(false);
  });

  test('a PH rule in Strasbourg and in Paris on Good Friday', () => {
    const tag = 'Mo-Sa 08:00-20:00; PH off';
    const paris = 'Europe/Paris';
    expect(read(hoursOf(tag, placeIn('FR-67', paris), shop, '2026-04-03'), '2026-04-03', '10:00', paris).state).toBe('closed');
    expect(read(hoursOf(tag, placeIn('FR', paris), shop, '2026-04-03'), '2026-04-03', '10:00', paris).state).toBe('open');
  });
});

describe('[H-BORDER-1111] a route from Germany into France on 11 November', () => {
  const date = '2026-11-11';
  const tag = 'Mo-Sa 08:00-20:00; PH off';
  test('a holiday at the French place, not at the German one', () => {
    const holidays = holidaysFor(['DE-BW', 'FR-67'], date, date);
    expect(isPublicHoliday(date, 'FR-67', holidays)).toBe(true);
    expect(isPublicHoliday(date, 'DE-BW', holidays)).toBe(false);
    expect(read(hoursOf(tag, placeIn('FR-67', 'Europe/Paris'), shop, date), date, '10:00', 'Europe/Paris').state).toBe('closed');
    expect(read(hoursOf(tag, placeIn('DE-BW'), shop, date), date, '10:00').state).toBe('open');
  });
});

describe('[H-ZONE-BORDER] a place in Lisbon on a ride whose start zone is Madrid', () => {
  const date = '2026-10-19';
  const lisbon = 'Europe/Lisbon';
  const h = () => hoursOf('Mo-Fr 09:00-13:00', { timeZone: lisbon, hoursRegionKey: null, holidayZone: 'PT', country: 'PT' }, shop, date);

  test('a 09:00 opening is 09:00 in Lisbon, which is 10:00 in Madrid', () => {
    expect(instantAt(date, '09:00', lisbon).getTime()).toBe(instantAt(date, '10:00', 'Europe/Madrid').getTime());
    expect(stateAt(h(), instantAt(date, '09:00', lisbon)).state).toBe('open');
    expect(stateAt(h(), instantAt(date, '10:00', 'Europe/Madrid')).state).toBe('open');
  });

  test('09:00 on Madrid\'s clock is an hour too early', () => {
    expect(stateAt(h(), instantAt(date, '09:00', 'Europe/Madrid')).state).toBe('closed');
    expect(stateAt(h(), instantAt(date, '09:59', 'Europe/Madrid')).state).toBe('closed');
  });
});

describe('[H-CH-SUNDAY] Switzerland on a Sunday', () => {
  const zurich = 'Europe/Zurich';
  const ch = placeIn('CH-ZH', zurich);
  const at12 = (rule: RuleClass) => read(hoursOf(null, ch, rule, SUNDAY), SUNDAY, '12:00', zurich);

  test('an untagged village shop: "probably closed (Sunday rules)"', () => {
    const s = at12(shop);
    expect(s.state).toBe('possibly-closed');
    expect(s.reason).toContain(RULES.sunday);
    expect(s.reason).toContain('assumption');
  });

  test.each([
    ['a station kiosk', { kind: 'kiosk', nearStation: true }],
    ['a kiosk away from a station', { kind: 'kiosk', nearStation: false }],
    ['a food shop within 100 m of a station', { kind: 'food-shop', nearStation: true }],
    ['a bakery', bakery],
    ['a fuel-station shop', fuel],
  ] as [string, RuleClass][])('%s: "may be open", state unknown', (_n, rule) => {
    const s = at12(rule);
    expect(s.state).toBe('unknown');
    expect(s.reason).toContain(RULES.may);
    expect(s.reason).toContain('assumption');
  });

  test('a German kiosk at a station gets no such exception', () => {
    expect(read(hoursOf(null, placeIn('DE-BW'), { kind: 'kiosk', nearStation: true }, SUNDAY), SUNDAY, '12:00').reason).toContain(RULES.sunday);
  });

  test('a weekday is plain "hours unknown", and a Swiss holiday adds nothing', () => {
    expect(read(hoursOf(null, ch, shop, '2026-10-19'), '2026-10-19', '12:00', zurich)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
    expect(read(hoursOf(null, ch, shop, '2026-08-01'), '2026-08-01', '12:00', zurich)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });
});

describe('[H-FR-SUNDAY] an untagged French supermarket on a Sunday', () => {
  const paris = 'Europe/Paris';
  const fr = placeIn('FR', paris);
  const h = () => hoursOf(null, fr, shop, SUNDAY);

  test('"hours unknown" at 10:00', () => {
    expect(read(h(), SUNDAY, '10:00', paris)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
    expect(read(h(), SUNDAY, '12:59', paris)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });

  test('"probably closed (Sunday rules)" at 14:00, from 13:00 on', () => {
    for (const hm of ['13:00', '14:00', '23:59']) {
      const s = read(h(), SUNDAY, hm, paris);
      expect(s.state, hm).toBe('possibly-closed');
      expect(s.reason, hm).toContain(RULES.sunday);
      expect(s.reason, hm).toContain('assumption');
    }
  });

  test('a French bakery is a food shop too; a clothes shop and a tagged supermarket are not touched', () => {
    expect(read(hoursOf(null, fr, bakery, SUNDAY), SUNDAY, '14:00', paris).state).toBe('possibly-closed');
    expect(read(hoursOf(null, fr, otherShop, SUNDAY), SUNDAY, '14:00', paris)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
    expect(read(hoursOf('Mo-Su 08:00-20:00', fr, shop, SUNDAY), SUNDAY, '14:00', paris).state).toBe('open');
  });

  test('a Monday is plain "hours unknown" all day', () => {
    expect(read(hoursOf(null, fr, shop, '2026-10-19'), '2026-10-19', '14:00', paris)).toMatchObject({ state: 'unknown', reason: 'hours unknown' });
  });
});

describe('holidays and assumptions on any phone', () => {
  test.each(DEVICE_ZONES.map((z) => z.zone))('[H-DEVICE-ZONE] on a phone set to %s', (zone) => {
    const zones = ['DE-BY', 'DE-BY-Augsburg', 'DE-SN', 'FR-67', 'FR', 'CH-ZH', 'PT', 'DE-BW'];
    const reference = withDeviceZone('UTC', () => holidaysFor(zones, '2026-01-01', '2026-12-31'));
    expect(withDeviceZone(zone, () => holidaysFor(zones, '2026-01-01', '2026-12-31'))).toEqual(reference);
    expect(reference['DE-BW']).toContain(WHIT_MONDAY);
    const h = withDeviceZone(zone, () => hoursOf(PLAIN, placeIn('DE-BY'), shop, '2026-08-07', '2026-08-09'));
    expect(read(h, '2026-08-08', '10:00').state).toBe('open');
    const f = withDeviceZone(zone, () => hoursOf(null, placeIn('FR', 'Europe/Paris'), shop, SUNDAY));
    expect(read(f, SUNDAY, '12:30', 'Europe/Paris').state).toBe('unknown');
    expect(read(f, SUNDAY, '13:30', 'Europe/Paris').state).toBe('possibly-closed');
  });

  test('holidaysFor keeps the range, ends included, across a new year, and never throws for a country the library lacks', () => {
    const r = holidaysFor(['DE-BW', 'LI'], '2026-12-26', '2027-01-06');
    expect(r['DE-BW']).toEqual(['2026-12-26', '2027-01-01', '2027-01-06']);
    expect(r['LI']).toEqual([]);
  });
});

import { describe, expect, test } from 'vitest';
import { W } from '../../../src/core/wording/en.ts';
import { bannedHits } from '../../fixtures/banned.ts';

// Every key starts with the area it belongs to. Weather and stop strings get the stricter list of banned words.
const AREAS = [
  'water', 'weather', 'rain', 'shelter', 'stop', 'wait', 'food', 'daylight', 'climb', 'sleep', 'help', 'emergency',
  'share', 'call', 'leaveby', 'time', 'route', 'bike', 'ask', 'ready', 'demo', 'about', 'honesty',
];
const STRICT_AREAS = ['weather', 'rain', 'shelter', 'stop', 'wait'];
const areaOf = (key: string): string | undefined =>
  AREAS.find((a) => key === a || (key.startsWith(a) && /[A-Z0-9]/.test(key.charAt(a.length))));

// Test values for each template function. A new template without an entry here fails the test below.
const TEMPLATE_ARGS: Record<string, unknown[][]> = {
  routePastStop: [['today', 93.4], ['tomorrow', 150]],
  routeFromTonightNoPosition: [[150]],
  routeFromStageStart: [[20.4]],
  routeTonightIsEnd: [[108.5]],
  daylightLightsOnFrom: [['18:42']],
  daylightDarkFrom: [['19:17']],
  daylightLeft: [['3 h 30 min']],
  daylightFromSunrise: [['10 h 47 min', '07:55']],
  daylightSunSet: [['18:42', '07:20'], ['18:42', null]],
  shelterMappedAs: [['a weather shelter'], ['a bus stop'], ['bike parking']],
  callAsMapped: [['28 Oct'], ['3 Jan']],
  weatherScenariosShowRain: [[7, '14:30'], [3, '09:00']],
  waterGentleSchedule: [[0.8], [1.42]],
  waterNotEnough: [['Kehl', '1.2'], ['the route end', '0.5']],
  waterFillUp: [['Kehl', '40', '1.5']],
  waterBottlesHold: [['2.75', '1.5', 'Kehl']],
  waterRefill: [['Kehl', '+3 km · about 14:05', '2.5'], ['Kehl', '0.3 km back', '2.5']],
  waterAhead: [['3.2']],
  waterBack: [['0.3']],
  waterRefreshOrCarry: [['120', '35']],
  waterEnoughToReach: [['Kehl', 'Bühl']],
  waterNoSource: [['42']],
  waterStillAbout: [['0.6']],
  waterExpectedPlanned: [['Kehl', '1.8', '2.5']],
  waterAtKm: [['76.3']],
  waterUnverifiedSince: [['2021']],
  waterSeasonal: [['Apr–Oct']],
};

function everyString(): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  for (const [key, value] of Object.entries(W)) {
    if (typeof value === 'string') out.push({ key, text: value });
    else if (typeof value === 'function') {
      const sets = TEMPLATE_ARGS[key];
      if (!sets) throw new Error(`template ${key} has no test values in wording.test.ts`);
      for (const args of sets) out.push({ key, text: (value as (...a: unknown[]) => string)(...args) });
    } else throw new Error(`${key} is neither a string nor a template function`);
  }
  return out;
}

describe('wording', () => {
  test('[HON-FIXED] the safety-relevant sentences are fixed, byte for byte', () => {
    expect(W.waterOverDrinkCaution).toBe(
      "You reported drinking more than you were likely losing. Drink to thirst and don't finish heavier than you started.");
    expect(W.weatherNoLightningProtection).toBe('Roofs, shelters and huts give no protection from lightning.');
    expect(W.weatherCantForecastExact).toBe("Exact places and times can't be forecast.");
    expect(W.shelterMappedAs('a weather shelter')).toBe('Mapped as a weather shelter, not checked.');
    expect(W.weatherNoOfficialWarnings).toBe('Official weather warnings are not included.');
    expect(W.sleepFreePitchesUnknown).toBe('Free pitches and rooms are not known to the app.');
    expect(W.helpGiveNumberAndCoordinates).toBe('Give this number and your coordinates when you call.');
    expect(W.leavebyExclusions).toBe('Wind, weather and extra stops are not included.');
  });

  test('[HON-FIXED] the other fixed templates of section 8', () => {
    expect(W.shelterMappedAs('a bus stop')).toBe('Mapped as a bus stop, not checked.');
    expect(W.callAsMapped('28 Oct')).toBe('As mapped in OpenStreetMap (28 Oct), not checked.');
    expect(W.weatherScenariosShowRain(7, '14:30')).toBe('7 in 10 forecast scenarios show rain here around 14:30.');
    expect(W.demoBasis).toBe('Demo, recorded data');
  });

  test('every key names its area, and every template has test values', () => {
    for (const key of Object.keys(W)) expect(areaOf(key), `key ${key}`).toBeDefined();
    expect(everyString().length).toBeGreaterThanOrEqual(Object.keys(W).length);
  });

  test('[HON-BANNED] the matcher catches what it should, so the test below can fail', () => {
    for (const bad of ['safe', 'This is Safe to drink', 'Dehydration risk', 'hyponatremia', 'heat stroke', 'heat illness',
      'prevents', 'guaranteed', 'no rain today', 'it will be dry', 'all clear', 'you need to eat', 'calories', '300 kcal']) {
      expect(bannedHits(bad), bad).not.toEqual([]);
    }
    expect(bannedHits('Rain likely until about 15:00')).toEqual([]);
    expect(bannedHits('live radar', true)).toEqual(['live']);
    expect(bannedHits('live radar', false)).toEqual([]);
    expect(bannedHits('a dry spell', true)).toEqual(['dry']);
    expect(bannedHits('likely dry again from about 16:00', true)).toEqual([]);
    expect(bannedHits('mostly dry', true)).toEqual([]);
    expect(bannedHits('a dry day, then likely dry', true)).toEqual(['dry']);
  });

  test('[HON-BANNED] no string of the wording module uses a banned word', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(8);
    for (const { key, text } of strings) {
      const strict = STRICT_AREAS.some((a) => key.startsWith(a));
      expect(bannedHits(text, strict), `${key}: ${text}`).toEqual([]);
    }
  });
});

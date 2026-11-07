import { describe, expect, test } from 'vitest';
import { BIKE_CHOICE_KEY, choiceRecord, noteBikeChoice, newerChoice } from '../../../src/ui/tools/bike-choice.ts';

const THEIRS = 'loadcheck:bikeChoice:v1';
const rec = (app: string, bikeId: string | null, at: string, extra: Record<string, unknown> = {}) => JSON.stringify({ app, kind: 'bike-choice', v: 1, bikeId, at, ...extra });
const mine = (bikeId: string | null, at: string) => rec('copilot', bikeId, at);
const theirs = (bikeId: string | null, at: string) => rec('load-check', bikeId, at);
const store = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};

describe('one chosen bike: the records', () => {
  test('[TB-CHOICE-RECORD] the newer record wins; at the same moment Wayfinch\'s; a wrong app, kind, v: 2, a bad id or a bad date is no record; neither is null', () => {
    const get = (init: Record<string, string>) => store(init).getItem;
    expect(newerChoice(get({}))).toBeNull();
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: mine('a', '2026-11-07T10:00:00Z') }))).toEqual({ bikeId: 'a' });
    expect(newerChoice(get({ [THEIRS]: theirs('b', '2026-11-07T10:00:00Z') }))).toEqual({ bikeId: 'b' });
    // The newer of the two, whichever app wrote it.
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: mine('a', '2026-11-07T10:00:00Z'), [THEIRS]: theirs('b', '2026-11-07T10:00:01Z') }))).toEqual({ bikeId: 'b' });
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: mine('a', '2026-11-07T10:00:02Z'), [THEIRS]: theirs('b', '2026-11-07T10:00:01Z') }))).toEqual({ bikeId: 'a' });
    // At the same moment Wayfinch's.
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: mine('a', '2026-11-07T10:00:00Z'), [THEIRS]: theirs('b', '2026-11-07T10:00:00Z') }))).toEqual({ bikeId: 'a' });
    // "No bike" is a record: it carries a null id.
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: mine(null, '2026-11-07T10:00:00Z') }))).toEqual({ bikeId: null });
    // What is no record: a wrong app, kind or version, a bad id, a bad date, text that is not JSON.
    const bad = [
      rec('load-check', 'a', '2026-11-07T10:00:00Z'),
      rec('copilot', 'a', '2026-11-07T10:00:00Z', { kind: 'theme' }),
      rec('copilot', 'a', '2026-11-07T10:00:00Z', { v: 2 }),
      rec('copilot', 'a b', '2026-11-07T10:00:00Z'),
      rec('copilot', 'x'.repeat(101), '2026-11-07T10:00:00Z'),
      rec('copilot', '', '2026-11-07T10:00:00Z'),
      rec('copilot', 'a', 'yesterday'),
      JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId: 'a' }),
      JSON.stringify({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId: 7, at: '2026-11-07T10:00:00Z' }),
      'null', '7', '{not json',
    ];
    for (const text of bad) {
      expect(choiceRecord(get({ [BIKE_CHOICE_KEY]: text }), BIKE_CHOICE_KEY, 'copilot'), text).toBeNull();
      expect(newerChoice(get({ [BIKE_CHOICE_KEY]: text })), text).toBeNull();
    }
    // A bad record of one app leaves the other's standing.
    expect(newerChoice(get({ [BIKE_CHOICE_KEY]: bad[0]!, [THEIRS]: theirs('b', '2026-11-07T10:00:00Z') }))).toEqual({ bikeId: 'b' });
    expect(choiceRecord(get({ [THEIRS]: theirs('b', '2026-11-07T10:00:00Z') }), THEIRS, 'load-check')).toEqual([Date.parse('2026-11-07T10:00:00Z'), 'b']);
  });

  test('[TB-CHOICE-CLOCK] with the bag planner\'s record dated an hour ahead, a choice made now is stamped one millisecond after it', () => {
    const now = new Date('2026-11-07T10:00:00.000Z');
    const ahead = '2026-11-07T11:00:00.000Z';
    const kv = store({ [THEIRS]: theirs('b', ahead) });
    noteBikeChoice('a', now, kv);
    expect(JSON.parse(kv.data.get(BIKE_CHOICE_KEY)!)).toEqual({ app: 'copilot', kind: 'bike-choice', v: 1, bikeId: 'a', at: '2026-11-07T11:00:00.001Z' });
    expect(newerChoice(kv.getItem)).toEqual({ bikeId: 'a' });
    // With a record dated earlier, the time of the tap itself; with none, too; No bike is written as null.
    const earlier = store({ [THEIRS]: theirs('b', '2026-11-07T09:00:00.000Z') });
    noteBikeChoice(null, now, earlier);
    expect(JSON.parse(earlier.data.get(BIKE_CHOICE_KEY)!)).toMatchObject({ bikeId: null, at: '2026-11-07T10:00:00.000Z' });
    const none = store();
    noteBikeChoice('a', now, none);
    expect(JSON.parse(none.data.get(BIKE_CHOICE_KEY)!).at).toBe('2026-11-07T10:00:00.000Z');
    // A bad id is never written; a refusing storage is silent.
    const bad = store();
    noteBikeChoice('a b', now, bad);
    expect(bad.data.size).toBe(0);
    expect(() => noteBikeChoice('a', now, { getItem: () => null, setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});

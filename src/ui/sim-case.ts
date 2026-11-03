// Reads a simulator case as tests/sim/harness.ts saves it (encodeCase), in the page: JSON has no NaN, Infinity or broken date,
// and a sun source is a function, so each was written with a mark. Only the --test-hooks build loads this (plan Task 17); a
// unit test proves it reads every case as the harness's own decodeCase does.
import { instantAt } from '../core/answers/time.ts';
import { sunFromSuncalc } from '../core/engines/daylight.ts';
import type { ScreenInputs, SunSource, SunTimes } from '../core/types.ts';

type SunSpec = { kind: 'real' } | { kind: 'stub'; sunset: string; dusk: string; tz: string } | { kind: 'light-all-night' } | { kind: 'no-sun' } | { kind: 'broken' };

const NOT_A_TIME = new Date(Number.NaN);

/** The same sun as tests/gen/clocks.ts's sunOf for the same mark. */
function sunOf(spec: SunSpec): SunSource {
  return (lat: number, lon: number, date: string): SunTimes => {
    switch (spec.kind) {
      case 'real': return sunFromSuncalc(lat, lon, date);
      case 'stub': {
        const when = (hm: string): Date => instantAt(date, hm, spec.tz);
        return { dawn: when('07:20'), sunrise: when('07:55'), sunset: when(spec.sunset), dusk: when(spec.dusk), lightAllNight: false };
      }
      case 'light-all-night': return { dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: true };
      case 'no-sun': return { dawn: null, sunrise: null, sunset: null, dusk: null, lightAllNight: false };
      default: return { dawn: NOT_A_TIME, sunrise: NOT_A_TIME, sunset: NOT_A_TIME, dusk: NOT_A_TIME, lightAllNight: false };
    }
  };
}

function setOwn(out: object, key: string, value: unknown): void {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true }); // so that __proto__ stays a plain key
}

function unpack(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(unpack);
  if (typeof x !== 'object' || x === null) return x;
  const o = x as Record<string, unknown>;
  if (typeof o['$number'] === 'string') return Number(o['$number']);
  if ('$date' in o) return new Date(o['$date'] === null ? Number.NaN : (o['$date'] as string));
  if ('$sun' in o) return sunOf((o['$sun'] ?? { kind: 'broken' }) as SunSpec);
  const out = {};
  for (const [k, v] of Object.entries(o)) setOwn(out, k, unpack(v));
  return out;
}

/** The inputs of a saved case. */
export const caseInputs = (json: string): ScreenInputs => (unpack(JSON.parse(json)) as { inputs: ScreenInputs }).inputs;

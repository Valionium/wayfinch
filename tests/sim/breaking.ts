// How a breaking case is stated: a real moment on which the check applies and passes, then the same moment with the screen,
// or the part an engine gave it, doctored. Each check must then fail, or nobody has seen it able to.
import { expect } from 'vitest';
import { buildScreen, type Screen, type ScreenParts } from '../../src/core/screen/screen.ts';
import type { ScreenInputs } from '../../src/core/types.ts';
import { CHECKS } from './checks.ts';
import type { Check } from './harness.ts';
import { doctorWorld, world } from './world.ts';

export const checkOf = (id: string): Check => {
  const c = CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`no check named ${id}`);
  return c;
};

const realAgain = (i: ScreenInputs): Screen => buildScreen(i).screen;

/** The check applies to this real moment and holds. */
export function holds(id: string, i: ScreenInputs): Screen {
  const c = checkOf(id);
  const s = buildScreen(i).screen;
  expect(c.appliesTo(i, s), `${id} should apply to this moment`).toBe(true);
  c.check(i, s, realAgain);
  return s;
}

/** The screen itself is wrong: the check says so. */
export function failsOnScreen(id: string, i: ScreenInputs, doctor: (s: Screen) => void, message: RegExp, again: (x: ScreenInputs) => Screen = realAgain): void {
  const c = checkOf(id);
  const s = structuredClone(buildScreen(i).screen);
  doctor(s);
  expect(() => c.check(i, s, again)).toThrow(message);
}

/** An engine's part is wrong, so what the screen rests on is: the check says so. */
export function failsOnPart(id: string, i: ScreenInputs, doctor: (w: ScreenParts) => ScreenParts, message: RegExp): void {
  const c = checkOf(id);
  const copy = { ...i };
  doctorWorld(copy, () => doctor(world(i)));
  expect(() => c.check(copy, buildScreen(i).screen, realAgain)).toThrow(message);
}

/** The inputs say what the parts contradict: the check reads the inputs. */
export function failsOnInputs(id: string, i: ScreenInputs, change: (x: ScreenInputs) => ScreenInputs, message: RegExp): void {
  const c = checkOf(id);
  const copy = change({ ...i });
  doctorWorld(copy, () => world(i));
  expect(() => c.check(copy, buildScreen(i).screen, realAgain)).toThrow(message);
}

// What the invariants read beside the screen: the values it was assembled from, and small ways to walk its text.
import { formatHm, isKnownZone } from '../../src/core/answers/time.ts';
import { usableFlatKph } from '../../src/core/engines/pace.ts';
import { buildScreen, type Screen, type ScreenParts } from '../../src/core/screen/screen.ts';
import type { Answer, AnswerItem, ScreenInputs } from '../../src/core/types.ts';

const worlds = new WeakMap<ScreenInputs, ScreenParts>();

/** The parts of this moment's screen, worked out once per moment. */
export function world(i: ScreenInputs): ScreenParts {
  let w = worlds.get(i);
  if (!w) {
    w = buildScreen(i).parts;
    worlds.set(i, w);
  }
  return w;
}

/** For the breaking cases: the check then reads a doctored part, as if an engine had got it wrong. */
export function doctorWorld(i: ScreenInputs, change: (w: ScreenParts) => ScreenParts): void {
  worlds.set(i, change(world(i)));
}

export const must = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

export const SECOND = 1000;
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const validDate = (d: Date | null | undefined): d is Date => d instanceof Date && Number.isFinite(d.getTime());
export const within1s = (a: Date, b: Date): boolean => Math.abs(a.getTime() - b.getTime()) <= SECOND;
export const hm = (d: Date, tz: string): string => (validDate(d) ? formatHm(d, tz) : 'no time');

/** There is a clock, a speed and a schedule: the moment can be judged at all. */
export const usable = (i: ScreenInputs, s: Screen): boolean =>
  i.routeZones.every((z) => isKnownZone(z.timeZone)) && world(i).schedule !== null && usableFlatKph(i.trip.flatKph) && validDate(i.now) && validDate(s.ride.departure);
/** A dated ride ahead: what most cards plan. Not at the route end. */
export const riding = (i: ScreenInputs, s: Screen): boolean =>
  usable(i, s) && i.trip.departureDate !== null && !s.ride.noRide && s.ride.phase !== 'route-end';

export const cardsOf = (s: Screen): Answer[] => Object.values(s.cards);
export const chipsOf = (s: Screen): Answer[] => Object.values(s.chips);
export const answersOf = (s: Screen): Answer[] => [...cardsOf(s), ...chipsOf(s)];

const itemTexts = (x: AnswerItem): string[] => [x.label, x.detail ?? ''];
export const textsOf = (a: Answer): string[] => [a.title, a.detail, ...a.items.flatMap(itemTexts), ...a.basis];
export const textOf = (a: Answer): string => textsOf(a).join('\n');

/** Every text the rider can read, each with where it stands. */
export function allTexts(s: Screen): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | null | undefined): void => {
    if (text) out.push({ where, text });
  };
  add('position line', s.positionLine);
  add('strip label', s.strip.label);
  add('strip end', s.strip.endText);
  for (const n of s.notes) add('notes', n);
  add('share', s.shareText);
  add('share with map', s.shareMapText);
  for (const [name, a] of [...Object.entries(s.cards), ...Object.entries(s.chips)]) for (const t of textsOf(a)) add(name, t);
  const e = s.chips.emergency;
  for (const n of e.notes) add('emergency notes', n);
  add('emergency share', e.share);
  return out;
}

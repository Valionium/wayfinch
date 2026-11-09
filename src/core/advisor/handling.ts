// Better handling (decision 2; design §3.3): the weight of each placed kilo by its position. Lower is better. Kit strapped outside a
// bag counts at the position it is strapped to; `deck` is the rack deck. One table, read by the Gear advisor's score and by the
// bag planner's weight map (weight map design, 1.2), so the two never disagree.
import type { Pos } from './types.ts';

export const HANDLING_WEIGHTS: Readonly<Record<Pos, number>> = Object.freeze({
  frame: 1.0, bottle: 1.0, bottleU: 1.0, // 1 frame, low and central
  top: 1.2,                              // 2 top tube
  fork: 1.5,                             // 3 fork cages
  rack: 1.8, deck: 1.8,                  // 4 panniers on a rack, and kit on the rack deck
  bar: 2.2,                              // 5 bar roll
  seat: 2.6,                             // 6 seat pack
  pack: 3.5,                             // 7 the back
});

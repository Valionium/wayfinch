// The key sentences and figures of each content-draft row (2026-11-06-bike-care-content-draft.md, after both book rounds and the
// coordinator's ruling on the Fox interval), which riders must see, each pinned to the field it belongs to (review of PR 58, I1 to I3 and
// re-check R2): a figure met only by another field does not count. Typed by hand from the draft, which is not in this repository; the
// owner's O4 read of the printed list stays the real check against the draft. Case is ignored.

export type Field = 'name' | 'signs' | 'step' | 'tools' | 'time' | 'note' | 'who';
/** `index` is the step's place (0 = the first step), for `field: 'step'` only. */
export type Figure = { field: Field; index?: number; text: string };

const step = (index: number, text: string): Figure => ({ field: 'step', index, text });
const f = (field: Exclude<Field, 'step'>, text: string): Figure => ({ field, text });

export const DRAFT_FIGURES: Record<string, Figure[]> = {
  'brakes-pads-disc': [
    f('signs', 'about 1.5 mm of pad left'), step(1, 'about 1.5 mm'), step(1, "pad maker's mark if given"), step(2, 'grinding noise'),
    step(3, 'oil on them'), f('note', 'winter, wet and mud'), f('note', 'brakes are critical'), f('time', 'about 20 min'),
  ],
  'brakes-pads-rim': [
    step(0, 'grooves'), step(1, 'metal backing'), step(3, 'scoring'), step(4, 'toe-in'), step(5, 'marked left and right'),
    f('note', 'worn rim can split'), f('time', 'about 15 min'),
  ],
  'wheels-spokes-check': [
    step(0, 'squeeze pairs of spokes'), step(3, 'cracks or bulges around the spoke holes'), step(3, 'do not ride'), step(4, 'truing'),
    f('note', 'wheels are critical'), f('time', 'about 3 min'),
  ],
  'frame-bolts-check': [
    step(0, 'quick releases'), step(1, 'carbon parts: do not twist them'), step(3, 'bar end plugs'), step(4, 'bottom bracket'),
    step(5, 'torque wrench'), f('note', 'before each ride'), f('note', 'too loose or too tight'), f('time', 'about 10 min'),
  ],
  'chain-lube': [
    step(0, 'after every wash'), step(4, 'jockey wheels'), step(5, 'grinding paste'), f('note', 'at least monthly'),
    f('note', 'after every rain ride'), f('note', 'wax'), f('note', 'penetrating oil'), f('time', 'about 5 min'),
  ],
  'ebike-battery-care': [step(0, '30-60%'), step(1, 'room temperature'), step(2, 'every 6 months'), f('note', 'fully charged or fully empty')],
  'tyres-sealant-topup': [
    step(3, 'soapy water'), step(3, '10-20 seconds'), f('note', '3-6 months'), f('note', '1-2 months in hot weather'), f('note', 'once a year'),
    f('time', 'about 15 min'),
  ],
  'gears-hub-oil': [
    step(0, 'every 6 months'), step(1, 'about 5000 km'), step(1, 'about 2000 km'), step(2, "maker's oil"), f('who', 'wrong oil or overfill'),
    f('time', 'about 30 min'),
  ],
  'susp-fork-service': [
    f('signs', '100-200 riding hours, or 6 months'), step(0, 'every 6 months'), step(1, 'about 50 h'), step(1, 'about 100-200 h'),
    step(2, 'fox: about 100 h.'), f('note', 'several hours'), f('who', 'needs tools, oil and seal kits'),
  ],
};

/** Ranges the draft settled on their careful end: the app may never show the range itself, in any field. */
export const SETTLED_RANGES: Record<string, string[]> = {
  'susp-fork-service': ['100-125'],
};

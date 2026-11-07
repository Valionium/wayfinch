// The key sentences and figures of each content-draft row (2026-11-06-bike-care-content-draft.md, after both book rounds and the
// coordinator's ruling on the Fox interval), which riders must see in the task's text. Kept by hand next to the draft, so a line moved to
// sources.ts (a "Disagree:" line, a provenance mark) can never take a rider's fact with it (review of PR 58, I1 to I3).
// Case is ignored; each entry must appear in the task's name, signs, steps, tools, time, note or who.

export const DRAFT_FIGURES: Record<string, string[]> = {
  'brakes-pads-disc': ['about 1.5 mm', "pad maker's mark if given", 'grinding noise', 'winter, wet and mud', 'oil on them', 'about 20 min', 'brakes are critical'],
  'brakes-pads-rim': ['grooves', 'metal backing', 'toe-in', 'scoring', 'marked left and right', 'worn rim can split', 'about 15 min'],
  'wheels-spokes-check': ['squeeze pairs of spokes', 'cracks or bulges around the spoke holes', 'do not ride', 'truing', 'about 3 min', 'wheels are critical'],
  'frame-bolts-check': ['torque wrench', 'carbon parts: do not twist them', 'quick releases', 'bar end plugs', 'bottom bracket', 'before each ride', 'about 10 min', 'too loose or too tight'],
  'chain-lube': ['after every wash', 'at least monthly', 'after every rain ride', 'grinding paste', 'wax', 'penetrating oil', 'jockey wheels', 'about 5 min'],
  'ebike-battery-care': ['30-60%', 'room temperature', 'every 6 months', 'fully charged or fully empty'],
  'tyres-sealant-topup': ['3-6 months', '1-2 months in hot weather', 'once a year', 'soapy water', '10-20 seconds', 'about 15 min'],
  'gears-hub-oil': ['every 6 months', 'about 5000 km', 'about 2000 km', "maker's oil", 'wrong oil or overfill', 'about 30 min'],
  'susp-fork-service': ['every 6 months', 'about 50 h', 'about 100-200 h', 'fox: about 100 h.', 'several hours', 'needs tools, oil and seal kits'],
};

/** Ranges the draft settled on their careful end: the app may never show the range itself. */
export const SETTLED_RANGES: Record<string, string[]> = {
  'susp-fork-service': ['100-125'],
};

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
    f('signs', "about 1.5 mm of pad left"), f('note', "winter, wet and mud"), f('note', "brakes are critical"), f('time', "about 20 min"), step(1, "about 1.5 mm"), step(1, "pad maker's mark if given"), step(2, "grinding noise"), step(3, "oil on them"), step(0, "look into the caliper"), step(2, "a grinding noise when"), step(3, "squeal, a hard lever"), step(4, "after fitting, refit the"), f('note', "never touch the disc or pads with your fingers"), step(4, "refit the pad pin or bolt to its printed torque"),
  ],
  'brakes-pads-rim': [
    f('note', "worn rim can split"), f('time', "about 15 min"), step(0, "grooves"), step(1, "metal backing"), step(3, "scoring"), step(4, "toe-in"), step(5, "marked left and right"), step(0, "look at the grooves"), step(1, "a scraping noise can"), step(2, "check the pad hits"), step(3, "look for the small"), step(4, "pad front edge should"), step(5, "new pads are marked"), step(5, "tighten the pad bolt to the torque printed on the brake"),
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

  // Group 2 (Task 5): the other Care rows. Each figure is read from the draft row and pinned to the field it shows in; each step also
  // pins its first words, so a step that is dropped, reordered or rewritten fails; the settled ranges are below.
  'brakes-lever-test': [
    step(1, "do not ride"), f('who', "shop if it feels wrong (brakes are critical"), f('who', "a mistake can cause a crash)"), step(0, "roll the bike and"), step(1, "if a lever feels"), step(2, "do this before you"), step(3, "rim brakes: also look"), f('time', 'about 1 min'),
  ],
  'susp-wipe-stanchions': [
    step(0, "wipe the shiny fork"), step(1, "on a full-suspension bike"), step(2, "look for oil leaking"), f('time', 'about 2 min'),
  ],
  'ebike-charge-indoors': [
    step(2, "40 c"), step(0, "let the battery come"), step(1, "charge it indoors, dry"), step(2, "charging only works between"), step(3, "unplug when full if"),
  ],
  'frame-wash': [
    step(0, "rinse with a low-pressure"), step(1, "brush off grit; keep"), step(2, "dry it with a"), step(3, "wheel it to dry"), f('time', 'about 15 min'),
  ],
  'chain-dry-lube': [
    step(0, "wipe the chain dry"), step(1, "hold the chain oil"), step(2, "wipe the oil off"), step(3, "lift the rear wheel"), step(4, "put a drop on"), step(5, "wipe off extra oil"), f('time', 'about 5 min'),
  ],
  'belt-rinse': [
    step(1, "do not use soap, oil or lube"), step(0, "rinse with plain water"), step(1, "do not use soap"), step(2, "let it dry"), f('time', 'about 5 min'),
  ],
  'brakes-rotor-wipe': [
    f('note', "never touch the braking surface with bare or oily hands"), step(0, "spray disc-brake cleaner on"), step(1, "wipe both sides of"), step(2, "test the brakes before"), f('time', 'about 5 min'),
  ],
  'brakes-rim-wipe': [
    step(0, "wipe rim braking surfaces"), step(1, "check the pads for"), step(2, "if it still squeals"), step(3, "test the brakes before"), f('time', 'about 5 min'),
  ],
  'ebike-dry-contacts': [
    f('time', "about 5 min"), step(0, "do not use a"), step(1, "wipe the battery and"), step(2, "store the bike indoors"), f('note', "every 6 months also clean battery and bike contacts"),
  ],
  'tyres-pressure': [
    f('note', "1 bar"), step(0, "before each ride, squeeze"), step(1, "weekly, find the pressure"), step(2, "use a gauge on"), step(3, "pump to a number"), step(4, "spin the wheel and"), step(5, "check the tyre sits"), f('time', 'about 3 min'),
  ],
  'gears-shift-test': [
    step(0, "lift the rear wheel"), step(1, "shift up and down"), step(2, "note any gear that"), f('time', 'about 2 min'),
  ],
  'chain-wear-check': [
    step(2, "0.5%"), step(2, "0.75%"), step(0, "shift to the smallest"), step(1, "hook a chain wear"), step(2, "replace when the gauge"), step(3, "a chain that slips"), f('time', 'about 3 min'),
  ],
  'gears-electronic-battery': [
    step(2, "do not wait until it dies"), step(0, "press the button or"), step(1, "charge with the maker's"), step(2, "do not wait until"), f('time', 'about 5 min'),
  ],
  'frame-headset-check': [
    step(0, "90 degrees"), f('note', "steerer and stem bolts are critical"), f('note', "if too loose or too tight a crash can result"), f('who', "shop to adjust (steerer and stem bolts are critical"), f('who', "a mistake can cause a crash)"), step(0, "hold the front brake"), step(1, "any clunk at the"), step(2, "turn the bars; they"), step(3, "if loose or stiff"), f('time', 'about 3 min'),
  ],
  'gears-cables-look': [
    step(0, "look along cable and"), step(1, "check the ends are"), step(2, "if it drags or"), f('time', 'about 5 min'),
  ],
  'tyres-sealant-check': [
    f('time', "about 5 min"), step(0, "shake the wheel next"), step(1, "or let the air"), step(2, "refit the core and"), step(3, "if dry or lumpy"), step(1, "let the air out"), step(2, "refit the core and pump up"),
  ],
  'belt-inspect': [
    f('note', "never oil or lube"), step(0, "look along the belt"), step(1, "check sprockets for bends"), step(2, "noise with no damage"), f('time', 'about 5 min'),
  ],
  'susp-air-pressure': [
    step(3, "25%"), step(0, "never use a compressor"), step(4, "do not squeeze the suspension with the pump on"), step(0, "use a suspension pump"), step(1, "start from the maker's"), step(2, "squeeze the fork down"), step(3, "sit on the bike"), step(4, "do not squeeze the"), f('time', 'about 10 min'),
  ],
  'gears-cassette-wear': [
    step(0, "skipping in favourite gears"), step(1, "check the chain first"), step(2, "look at the teeth"), step(3, "back-pedal slowly: the chainrings"), step(4, "if a new chain"), f('time', 'about 10 min'),
  ],
  'wheels-hubs-check': [
    f('note', "wheels are critical"), f('time', "about 5 min"), step(0, "with the wheel in"), step(1, "take the wheel out"), step(2, "spin the axle and"), step(3, "look for oil spots"), step(4, "refit the wheel fully"), step(4, "close the wheel's quick release"),
  ],
  'brakes-rotor-thickness': [
    f('note', "brakes are critical"), f('time', "about 10 min"), step(2, "1.5 mm"), step(0, "spin the wheel and"), step(1, "measure with a rotor"), step(2, "replace at the minimum"), step(3, "two-layer discs: replace the"), step(3, "replace the disc at once if aluminium shows"), f('note', "never touch the disc or pads with your fingers"),
  ],
  'susp-lowers-service': [
    step(0, "wipe the legs; check"), step(1, "lower-leg service: new oil"), step(2, "rockshox: about every 50"),
  ],
  'gears-cables-replace': [
    step(2, "5 nm"), step(3, "3 cm"), step(0, "shift to the smallest"), step(1, "remove the old cable"), step(2, "fit the new cable"), step(3, "cut the end to"), f('time', 'about 40 min'),
  ],
  'susp-shock-service': [
    f('signs', "20 riding hours"), f('signs', "6 months"), step(0, "every 20 riding hours"), step(2, "about 50 h"), step(3, "fox: about 100 h."), step(2, "50 h"), step(2, "200 h"), step(1, "have the suspension checked"), step(2, "rockshox: air can about"), step(3, "fox: about 100 h"), step(4, "check the maker's chart"),
  ],
  'ebike-service': [
    step(0, "4 weeks"), step(0, "300 km"), step(1, "6 months"), f('who', "do not open the motor or battery)"), step(0, "first dealer check about"), step(1, "get the maker's software"), step(2, "other dealer checks: the"), step(3, "the dealer runs diagnostics"), step(4, "keep the charger and"),
  ],
  'brakes-cable-disc-service': [
    f('note', "brakes are critical"), f('note', "a mistake can cause a crash"), step(0, "check cable and casing"), step(1, "as pads wear, turn"), step(2, "loosen the caliper bolts"), step(3, "spin the wheel; tweak"), f('time', 'about 30 min'),
  ],
  'belt-tension': [
    f('time', "about 15 min"), step(0, "use the maker's tension"), step(1, "adjust to the green"), step(2, "retighten the axle and"), step(2, "to the torque printed on the frame or hub"),
  ],
  'frame-torque-check': [
    step(2, "4-6 nm"), f('signs', "after a crash or a year"), f('note', "stem, handlebar and steerer bolts are critical"), step(0, "look up the number"), step(1, "torque stem, handlebar, seatpost"), step(2, "carbon parts: never without"), step(3, "disc bolts: first turn"), step(2, "about 4-6 nm"), f('time', 'about 20 min'),
  ],
  'wheels-true-tension': [
    step(4, "0.5 mm"), step(4, "1 mm"), f('note', "wheels are critical"), f('note', "a bad job can cause a crash"), f('who', "wheels are critical)"), step(0, "check the wheel sits"), step(1, "spin the wheel past"), step(2, "loose spokes near the"), step(3, "adjust spokes in quarter"), step(4, "aim for side-to-side wobble"), step(5, "a bent rim or"), f('time', 'about 30 min'),
  ],
  'chain-deep-clean': [
    f('time', "about 30 min"), step(0, "remove the chain with"), step(1, "scrub chain, gears and"), step(2, "rinse and dry fully"), step(3, "if you took the"), step(4, "then lube the chain"), step(1, "keep degreaser off brake discs, pads and rims"), step(3, "rejoin it and flex the link"),
  ],
  'brakes-hydraulic-bleed': [
    step(1, "never mix"), f('who', "brakes are critical, a mistake can cause a crash)"), step(0, "use the fluid named"), step(1, "shimano uses mineral oil"), step(2, "fit the bleed block"), f('time', 'about 45 min'),
  ],
  'brakes-squeal': [
    f('note', "brakes are critical"), f('time', "about 15 min"), step(1, "oily pads: replace them"), step(2, "disc: check the caliper"), step(3, "rim: wipe rim and"), step(4, "test before riding"), step(0, "disc: spray disc-brake cleaner"), f('note', "never touch the disc or pads with your fingers"), step(0, "not on the pads"), step(3, "tighten the pad bolt to the torque printed on the brake"),
  ],
  'brakes-spongy': [
    f('note', "do not ride until fixed"), f('who', "brakes are critical, a mistake can cause a crash)"), step(0, "check pads are not"), step(1, "check for fluid leaks"), step(2, "bleed the brake, or"),
  ],
  // not draft rows: the owner's ruling of 14 November 2026 (a hydraulic rim brake's spongy lever; electronic gears' adjusting), pinned the same way
  'brakes-hydro-rim-spongy': [
    f('note', "do not ride until fixed"), f('who', "brakes are critical, a mistake can cause a crash)"), step(0, "check pads are not"), step(1, "check for fluid leaks"), step(1, "oil on the rim or pads: clean the rim and replace the pads"), step(2, "magura rim brakes use mineral oil"), step(2, "never mix"), step(3, "bleed the brake, or take it to a shop"),
  ],
  'chain-replace': [
    step(0, "note the chain length"), step(1, "remove the old chain"), step(2, "join it with a"), step(3, "flex the joined link"), step(4, "replace with the same"), f('time', 'about 20 min'),
  ],
  'gears-indexing': [
    step(0, "shift to the smallest"), step(1, "check the hanger is"), step(2, "check for dirt or"), step(3, "check the cassette lockring"), step(4, "on the biggest rear"), step(5, "worn derailleur pivots or"), f('time', 'about 15 min'),
  ],
  'gears-electronic-adjust': [
    // review of PR 161: the wireless shifter's own coin battery (replaced, not charged) before pairing again (I1); the hanger before
    // fine-tuning through every gear (I2); the shifter buttons only in the maker's adjust mode (m1)
    step(0, "check the shifting battery first"), step(1, "coin battery you replace, not charge"), step(1, "pair it again"), step(2, "check the hanger is straight"), step(3, "the shifter buttons in its adjust mode"), step(3, "a small step at a time"), step(4, "take it to a shop"),
  ],
  'wheels-wobble': [
    step(3, "do not ride if the rim rubs hard"), step(4, "do not remove the wobble, the rim is probably bent"), f('note', "wheels are critical"), f('note', "a failure can cause a crash"), f('who', "shop (wheels are critical"), step(0, "check the wheel is"), step(1, "check the tyre bead"), step(2, "look for a loose"), step(3, "do not ride if"), step(4, "if spoke tweaks do"),
  ],
  'tyres-replace': [
    f('time', "about 20 min"), step(0, "buy the same tyre"), step(1, "fit one side of"), step(2, "put a little air"), step(3, "push the second side"), step(4, "let the air out"), step(5, "pump to the pressure"), step(5, "close the wheel's quick release"),
  ],
  'frame-creak': [
    f('note', "stem and bar bolts are critical"), step(0, "check the pedals, the"), step(1, "clean and grease threads"), step(2, "re-torque with a wrench"), f('time', 'about 30 min'),
  ],
  'ebike-range-drop': [
    step(0, "check tyre pressure and"), step(1, "check battery contacts and"), step(2, "try a full charge"), step(3, "still low: book a"),
  ],
};

/** Ranges the draft settled on their careful end: the app may never show the range itself, in any field. */
export const SETTLED_RANGES: Record<string, string[]> = {
  'susp-fork-service': ['100-125'],
  'susp-shock-service': ['100-125'],
};

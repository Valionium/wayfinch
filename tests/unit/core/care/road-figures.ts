// The key sentences and figures of each Roadside card and carry item of the content draft (2026-11-06-bike-care-content-draft.md, after
// both book rounds), which riders must see, each pinned to the field it belongs to (as draft-figures.ts, PR 58 re-check R2): a figure
// met only by another field does not count. Typed by hand from the draft, which is not in this repository; the owner's O5 read of the
// printed cards stays the real check against the draft. Case is ignored.

export type RoadField = 'problem' | 'checkFirst' | 'step' | 'rideOn';
/** `index` is the step's place (0 = the first step), for `field: 'step'` only. */
export type RoadFigure = { field: RoadField; index?: number; text: string };

const step = (index: number, text: string): RoadFigure => ({ field: 'step', index, text });
const f = (field: Exclude<RoadField, 'step'>, text: string): RoadFigure => ({ field, text });

export const ROAD_FIGURES: Record<string, RoadFigure[]> = {
  'puncture-tube': [
    f('problem', 'Puncture (inner tube)'), f('checkFirst', 'Is the tyre flat or only soft?'), f('checkFirst', 'Find the hole in the tyre'),
    step(0, 'let out remaining air'), step(1, 'hook the first lever on a spoke'), step(1, 'Do not catch the tube'),
    step(2, 'pump it up and listen'), step(2, 'hold the tube near your lips'), step(3, 'Two side-by-side slits'),
    step(4, 'roughen an area a bit bigger than the patch'), step(4, 'about 30-60 seconds'), step(4, 'tacky, not wet'), step(4, "chalk"),
    step(5, 'grit or small stones'), step(6, 'with a little air in it'), step(6, 'no tube is caught under the bead'),
    f('rideOn', 'Fine if it holds air'), f('rideOn', 'Stop if the tyre has a cut or bulge'),
  ],
  'puncture-tubeless': [
    f('problem', 'Puncture (tubeless)'), f('checkFirst', 'Spin the hole to the bottom so sealant plugs it'), f('checkFirst', 'Is it still hissing?'),
    step(0, 'spin it to the bottom'), step(1, 'Pull out the thorn or glass'), step(2, 'Ream the hole'), step(3, 'Trim the plug'),
    step(4, 'a few minutes'), step(5, 'fit a spare tube'), step(5, 'remove the valve core'), step(6, 'work loose'),
    f('rideOn', 'Fine once it holds air'), f('rideOn', 'Stop if the sidewall is cut or the tyre bulges'),
  ],
  'chain-broken': [
    f('problem', 'Broken chain'), f('checkFirst', 'Where did it break?'), f('checkFirst', 'twisted or missing'),
    step(0, 'chain tool'), step(1, 'quick link of the same speed count'), step(2, 'until it clicks'), step(3, 'Flex the joined link sideways'),
    step(3, 'jump on the rear gears'), step(4, 'gentle pedal turn'), step(5, 'Shift gently'),
    f('rideOn', 'Fine on easy gears with gentle power'), f('rideOn', 'Walk if it keeps skipping'), f('rideOn', 'Get it replaced soon'),
  ],
  'spoke-snapped': [
    f('problem', 'Snapped spoke'), f('checkFirst', 'Is only one spoke gone, and does the rim still turn?'),
    step(0, 'Wrap the broken spoke around a good neighbour or tape it'), step(1, 'Open the brake quick release if the rim rubs'),
    step(2, 'Ride slowly to a shop'),
    f('rideOn', 'Fine for a slow ride home if only one spoke has gone and the rim turns'),
    f('rideOn', 'Walk if the wheel is badly bent, or more than a few spokes are gone'), f('rideOn', 'Wheels are critical'),
  ],
  'brake-rub-rim': [
    f('problem', 'Brake rubbing'), f('checkFirst', 'Is the wheel straight in the frame?'), f('checkFirst', 'Is the pad touching one side?'),
    f('checkFirst', 'Is the rim bent?'), f('checkFirst', 'Is the tyre bead seated?'),
    step(0, 'tighten the quick release'), step(1, 'let the air out, seat it, pump up'), step(2, 'Squeeze the lever to centre the brake'),
    step(2, 'tighten the arm bolt'), step(2, 'pads should sit parallel to the rim'), step(3, 'not touching the tyre or spokes'),
    step(4, 'Open the quick release only if you must and ride slowly'),
    f('rideOn', 'Fine if light rub'), f('rideOn', 'Walk if the wheel is bent or the brake will not stop you'),
  ],
  'brake-rub-disc': [
    f('problem', 'Disc brake rubbing'), f('checkFirst', 'Is the wheel seated all the way?'), f('checkFirst', 'Is the disc bent or loose?'),
    f('checkFirst', 'Any play in the hub?'),
    step(0, 'push the wheel down into the dropouts'), step(1, 'look at the pad gaps'), step(2, 'Loosen both caliper bolts'),
    step(2, 'squeeze the lever, hold it, snug the bolts'), step(3, 'nudge the caliper away from the rub'), step(4, 'a quarter turn'),
    f('rideOn', 'Fine for light rub'), f('rideOn', 'Stop if the disc is bent hard or the brake feels odd'), f('rideOn', 'Brakes are critical'),
  ],
  'brake-weak-rim': [
    f('problem', 'Brakes not biting'), f('checkFirst', 'Wet or dirty rim?'), f('checkFirst', 'Brake quick release open?'),
    f('checkFirst', 'Pads worn or hitting the tyre?'),
    step(0, 'Wipe the rim and pads'), step(1, 'brake quick release is closed'), step(2, 'barrel adjuster'), step(3, 'cable clamp is tight'),
    step(3, 'pads are tight on the arms'), step(3, 'sit square on the rim'), step(4, 'gone grooves or a scraping noise'),
    f('rideOn', 'Walk if the brakes will not stop you'), f('rideOn', 'Brakes are critical'),
  ],
  'brake-weak-disc': [
    f('problem', 'Disc brakes not biting'), f('checkFirst', 'Oil on the pads?'), f('checkFirst', 'Worn pads (a grinding noise)?'),
    f('checkFirst', 'Lever pulling to the bar?'),
    step(0, 'squeal, hard lever, dark smeary pads'), step(0, 'pads soaked in oil cannot be saved'), step(0, 'A grinding noise means worn pads'),
    step(1, 'replace oily or worn pads'), step(2, 'pad adjuster knobs'), step(3, 'pump the lever'), step(3, 'it needs a bleed'),
    step(4, 'Walk the hills'),
    f('rideOn', 'Walk if the lever hits the bar or the brakes will not stop you'), f('rideOn', 'Brakes are critical'),
    f('rideOn', 'a mistake can cause a crash'),
  ],
  'gears-skipping': [
    f('problem', 'Gears skipping'), f('checkFirst', 'Chain worn or stiff link?'), f('checkFirst', 'Bent hanger?'), f('checkFirst', 'Cable loose?'),
    step(0, 'stiff link and wiggle it free'), step(1, 'a click at a time'), step(2, 'a gear where it holds'), step(3, 'go home'),
    f('rideOn', 'Fine in a gear that holds'), f('rideOn', 'Walk if it slips under load'),
  ],
  'bolt-loose': [
    f('problem', 'Loose bolt or rattle'), f('checkFirst', 'Which part moves when you shake it?'),
    step(1, 'until firm, not forced'), step(2, 'do not twist them to test'), step(2, 'torque printed on the part'),
    step(2, 'set with a torque wrench'), step(2, 'if unsure, a shop'), step(3, 'Re-check after a short ride'),
    f('rideOn', 'Fine for most bolts once tight'), f('rideOn', 'Stop if a stem, bar or steerer bolt will not tighten'), f('rideOn', 'Critical'),
  ],
  'tyre-torn': [
    f('problem', 'Torn tyre (needs a boot)'), f('checkFirst', 'How big is the cut?'), f('checkFirst', 'Is the tube bulging?'),
    step(0, 'Remove the wheel and tube'), step(1, 'boot (or a strong patch)'), step(2, 'pump to low pressure first'),
    step(3, 'Check for bulging'), step(3, 'lower pressure than normal'),
    f('rideOn', 'Fine to ride slowly if the boot holds'), f('rideOn', 'Walk if the tyre bulges'),
  ],
  'ebike-no-power': [
    f('problem', "E-bike won't power on"), f('checkFirst', 'Battery charged?'), f('checkFirst', 'Battery seated and clicked in?'),
    step(0, 'refit it until it clicks'), step(1, 'contacts with a dry cloth'), step(2, 'power button on the battery'),
    step(3, 'display, remote and motor plugs are tight'), step(4, 'note any error code'),
    f('rideOn', 'Ride unpowered if the bike pedals fine'), f('rideOn', 'Stop if the motor smells hot or the battery is damaged'),
  ],
};

/** The draft's full step counts per card (so a step cannot be merged or cut unseen). */
export const ROAD_STEP_COUNTS: Record<string, number> = {
  'puncture-tube': 7, 'puncture-tubeless': 7, 'chain-broken': 6, 'spoke-snapped': 3, 'brake-rub-rim': 5, 'brake-rub-disc': 5,
  'brake-weak-rim': 5, 'brake-weak-disc': 5, 'gears-skipping': 4, 'bolt-loose': 4, 'tyre-torn': 4, 'ebike-no-power': 5,
};

/** Each card's "What to carry" in the draft, as the carry ids that exist (the dry cloth is cut: no source, decision 6). */
export const ROAD_CARRY: Record<string, string[]> = {
  'puncture-tube': ['carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-patch-kit'],
  'puncture-tubeless': ['carry-plug-kit', 'carry-spare-tube', 'carry-pump', 'carry-tyre-levers', 'carry-multi-tool', 'carry-knife'],
  'chain-broken': ['carry-quick-link', 'carry-chain-tool'],
  'spoke-snapped': ['carry-zip-ties', 'carry-spoke-key', 'carry-multi-tool'],
  'brake-rub-rim': ['carry-multi-tool'],
  'brake-rub-disc': ['carry-multi-tool'],
  'brake-weak-rim': ['carry-multi-tool'],
  'brake-weak-disc': ['carry-multi-tool'],
  'gears-skipping': ['carry-multi-tool', 'carry-quick-link'],
  'bolt-loose': ['carry-multi-tool'],
  'tyre-torn': ['carry-tyre-boot', 'carry-spare-tube', 'carry-tyre-levers', 'carry-pump'],
  'ebike-no-power': ['carry-charger'],
};

/** The draft's 14 carry items, in its order, with its words (the dry cloth is cut: "no source found", decision 6, so 13 ship). */
export const CARRY_NAMES: [string, string][] = [
  ['carry-spare-tube', 'Spare tube (right size and valve)'],
  ['carry-tyre-levers', 'Tyre levers'],
  ['carry-pump', 'Pump or gas inflator (one that fits your valves)'],
  ['carry-patch-kit', 'Patch kit (patches, glue, sandpaper, chalk)'],
  ['carry-plug-kit', 'Tubeless plug kit'],
  ['carry-knife', 'Small knife or scissors'],
  ['carry-tyre-boot', 'Tyre boot (or a piece of old tyre)'],
  ['carry-quick-link', 'Quick link (right speed)'],
  ['carry-chain-tool', 'Chain tool (or multi-tool with one)'],
  ['carry-multi-tool', 'Multi-tool (hex keys, screwdriver) that fits the bolts on your bike'],
  ['carry-zip-ties', 'Zip ties or tape'],
  ['carry-spoke-key', 'Spoke key'],
  ['carry-charger', 'Charger (for long trips)'],
];

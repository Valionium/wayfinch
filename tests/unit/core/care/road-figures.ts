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
    step(0, 'let out remaining air'), step(0, 'Hydraulic disc brakes: do not squeeze the brake lever while the wheel is out'),
    step(1, "Squeeze the tyre's edges into the dip in the middle of the rim all round"), step(1, 'hook the first lever on a spoke'), step(1, 'Do not catch the tube'),
    step(2, 'pump it up and listen'), step(2, 'hold the tube near your lips'), step(3, 'Two side-by-side slits'),
    step(4, 'roughen an area a bit bigger than the patch'), step(4, 'about 30-60 seconds'), step(4, 'tacky, not wet'), step(4, "chalk"),
    step(4, 'Light plastic (TPU) tubes need the patches made for them'),
    step(5, 'grit or small stones'), step(6, 'with a little air in it'), step(6, 'no tube is caught under the bead'),
    step(6, 'guide the disc between the pads'),
    f('rideOn', 'Fine if it holds air'), f('rideOn', 'Stop if the tyre has a cut or bulge'),
  ],
  'puncture-tubeless': [
    f('problem', 'Puncture (tubeless)'), f('checkFirst', 'Spin the hole to the bottom so sealant plugs it'), f('checkFirst', 'Is it still hissing?'),
    step(0, 'spin it to the bottom'), step(1, 'Pull out the thorn or glass'), step(2, 'Ream the hole'), step(3, 'Trim the plug'),
    step(4, 'a few minutes'), step(5, 'fit a spare tube'), step(5, 'take out the tubeless valve'), step(5, 'any plug with a metal tip, which can hole the tube'), step(6, 'work loose'),
    f('rideOn', 'Fine once it holds air'), f('rideOn', 'Stop if the sidewall is cut or the tyre bulges'),
  ],
  'chain-broken': [
    f('problem', 'Broken chain'), f('checkFirst', 'Where did it break?'), f('checkFirst', 'twisted or missing'),
    step(0, 'chain tool'), step(1, 'a quick link made for your chain: the same speed count and, for a SRAM Flattop or T-Type chain, its own kind of link'), step(2, 'until it clicks'), step(3, 'Flex the joined link sideways'),
    step(3, 'jump on the rear gears'), step(4, 'gentle pedal turn'), step(5, 'Shift gently'),
    f('rideOn', 'Fine on easy gears with gentle power'), f('rideOn', 'Walk if it keeps skipping'), f('rideOn', 'Get it replaced soon'),
  ],
  'spoke-snapped': [
    f('problem', 'Snapped spoke'), f('checkFirst', 'Is only one spoke gone, and does the rim still turn?'),
    step(0, 'Bend the broken spoke gently around the next one, or tape it to it, so it can\'t catch.'), step(0, 'Spokes are thin steel and bend by hand.'), step(0, 'If it broke at the hub, pull it out.'), step(1, "Rim brakes: if the rim rubs, open the brake's quick release"),
    step(1, "the brake's quick release (on rim brakes), not the wheel's"),
    step(1, 'Until you close it again, this brake works much less: ride slowly and use the other brake.'),
    step(2, 'Disc brakes: the brake needs no opening.'), step(2, 'if the rim touches the frame or the fork, ride slowly'),
    step(3, 'Ride slowly to a shop'), step(4, "Rim brakes: close the brake's quick release once the wheel is fixed."),
    f('rideOn', 'Fine for a slow ride home if only one spoke has gone and the rim turns'),
    f('rideOn', 'Walk if the wheel is badly bent, or more than one spoke has gone'),
    f('rideOn', "With a brake's quick release open, that brake works much less"), f('rideOn', 'Wheels are critical'),
  ],
  'brake-rub-rim': [
    f('problem', 'Brake rubbing'), f('checkFirst', 'Is the wheel straight in the frame?'), f('checkFirst', 'Is the pad touching one side?'),
    f('checkFirst', 'Is the rim bent?'), f('checkFirst', 'Is the tyre bead seated?'),
    step(0, "tighten the wheel's quick release"), step(1, 'let the air out, seat it, pump up'),
    step(2, 'not touching the tyre or spokes'),
    step(3, 'centre the brake'), step(3, 'turn its small centring screw a little'), step(3, 'the spring screw on the side of one arm'),
    step(3, 'ride on gently and have it seen to at a shop'),
    step(4, 'Rim bent and still rubbing'), step(4, "open the brake's quick release only if you must and ride slowly"),
    step(4, 'Until you close it again, this brake works much less: ride slowly and use the other brake.'),
    step(5, "Close the brake's quick release once the wheel is fixed."),
    f('rideOn', 'Fine if light rub'), f('rideOn', 'Walk if the wheel is bent or the brake will not stop you'),
  ],
  'brake-rub-disc': [
    f('problem', 'Disc brake rubbing'), f('checkFirst', 'Is the wheel seated all the way?'), f('checkFirst', 'Is the disc bent or loose?'),
    f('checkFirst', 'Any play in the hub?'), f('checkFirst', 'Was the lever squeezed while the wheel was out?'),
    step(0, 'Undo the thru-axle'), step(0, 'push the wheel fully into the dropouts'), step(0, 'tighten it again firmly'), step(1, 'look at the pad gaps'), step(2, 'Loosen both caliper bolts'),
    step(2, 'squeeze the lever and hold it'),
    step(2, 'tighten the bolts to the torque printed on the caliper'), step(2, 'Without a torque wrench, tighten them evenly until the caliper no longer moves'),
    step(2, 'Test the brake before riding'), step(3, 'nudge the caliper away from the rub'), step(4, 'a quarter turn out, to move that pad away from the disc'),
    f('rideOn', 'Fine for light rub'), f('rideOn', 'Stop if the disc is bent hard or the brake feels odd'), f('rideOn', 'Brakes are critical'),
  ],
  'brake-weak-rim': [
    f('problem', 'Brakes not biting'), f('checkFirst', 'Wet or dirty rim?'), f('checkFirst', "Brake's quick release open?"),
    f('checkFirst', 'Pads worn or hitting the tyre?'),
    step(0, 'Wipe the rim and pads'), step(1, "brake's quick release is closed"), step(2, 'unscrew the barrel adjuster a turn or two'), step(3, 'cable clamp is tight'),
    step(3, 'pads are tight on the arms'), step(3, 'sit square on the rim'), step(4, 'gone grooves or a scraping noise'),
    f('rideOn', 'Walk if the brakes will not stop you'), f('rideOn', 'Brakes are critical'),
  ],
  'brake-weak-disc': [
    f('problem', 'Disc brakes not biting'), f('checkFirst', 'Oil on the pads?'), f('checkFirst', 'Worn pads (a grinding noise)?'),
    f('checkFirst', 'Lever pulling to the bar?'),
    step(0, 'squeal, hard lever, dark smeary pads'), step(0, 'pads soaked in oil cannot be saved'), step(0, 'A grinding noise means worn pads'),
    step(1, 'replace oily or worn pads'), step(1, 'Never touch the disc or pads with your fingers'), step(2, 'turn the pad adjuster in a little'), step(2, 'a knob or a hex bolt'), step(2, 'not the barrel adjuster'), step(3, 'pump the lever'), step(3, 'it needs a bleed'),
    step(4, 'Walk the hills'),
    f('rideOn', 'Walk if the lever hits the bar or the brakes will not stop you'), f('rideOn', 'Brakes are critical'),
    f('rideOn', 'a mistake can cause a crash'),
  ],
  'gears-skipping': [
    f('problem', 'Gears skipping'), f('checkFirst', 'Chain worn or stiff link?'), f('checkFirst', 'Bent hanger?'), f('checkFirst', 'Cable loose?'),
    step(0, 'stiff link and wiggle it free'), step(1, 'Cable gears: turn the barrel adjuster a click at a time. Electronic gears have no cable: check the shifting battery instead.'), step(2, 'a gear where it holds'), step(3, 'go home'),
    f('rideOn', 'Fine in a gear that holds'), f('rideOn', 'Walk if it slips under load'),
  ],
  'bolt-loose': [
    f('problem', 'Loose bolt or rattle'), f('checkFirst', 'Which part moves when you shake it?'),
    step(0, 'do not twist them to test'), step(0, 'torque printed on the part'), step(0, 'set with a torque wrench'),
    step(0, 'if unsure, a shop'), step(1, 'Find the bolt by feel'),
    step(2, 'Tighten to the torque printed on the part, with a torque wrench.'),
    step(2, 'Without one, tighten the bolts evenly, a little at a time, until the part no longer moves in the twist test.'),
    step(2, 'Carbon parts: never without a torque wrench.'),
    step(3, 'Re-check after a short ride'),
    f('rideOn', 'Only once the part no longer moves in the twist test.'), f('rideOn', 'Have the torque checked at the next shop.'),
    f('rideOn', 'A carbon part you could not torque: ride gently to a shop, or walk if it still moves.'),
    f('rideOn', 'Stop if a stem, bar or steerer bolt will not tighten'), f('rideOn', 'Critical'),
  ],
  'tyre-torn': [
    f('problem', 'Torn tyre (needs a boot)'), f('checkFirst', 'How big is the cut?'), f('checkFirst', 'Is the tube bulging?'),
    step(0, 'Remove the wheel and the tube'), step(0, 'Tubeless: take out the tubeless valve and any plug with a metal tip'), step(0, 'wipe the sealant off round the cut'),
    step(1, 'boot (or a strong patch)'), step(2, 'pump to low pressure first'),
    step(3, 'Check for bulging'), step(3, 'lower pressure than normal'),
    f('rideOn', 'Fine to ride slowly if the boot holds'), f('rideOn', 'Walk if the tyre bulges'),
  ],
  'ebike-no-power': [
    f('problem', "E-bike won't power on"), f('checkFirst', 'Battery charged?'), f('checkFirst', 'Battery seated and clicked in?'),
    step(0, 'Switch the system off, then remove the battery and refit it until it clicks; lock it with the key if it has one.'),
    step(0, 'A battery that only comes out with tools stays in.'), step(1, 'contacts with a dry cloth'),
    step(2, "Switch on with the battery's own button if it has one; on some newer bikes the main button is on the handlebar remote or the top tube."),
    step(3, 'display, remote and motor plugs are tight'), step(4, 'note any error code'),
    f('rideOn', 'Ride unpowered if the bike pedals fine'), f('rideOn', 'Stop if the motor smells hot or the battery is damaged'),
  ],
};

/** The draft's full step counts per card (so a step cannot be merged or cut unseen). */
export const ROAD_STEP_COUNTS: Record<string, number> = {
  'puncture-tube': 7, 'puncture-tubeless': 7, 'chain-broken': 6, 'spoke-snapped': 5, 'brake-rub-rim': 6, 'brake-rub-disc': 5,
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
  'brake-weak-rim': ['carry-multi-tool', 'carry-cloth'],
  'brake-weak-disc': ['carry-multi-tool', 'carry-cloth'],
  'gears-skipping': ['carry-multi-tool', 'carry-quick-link'],
  'bolt-loose': ['carry-multi-tool'],
  'tyre-torn': ['carry-tyre-boot', 'carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-cloth'],
  'ebike-no-power': ['carry-charger', 'carry-cloth'],
};

/** The draft's 14 carry items, in its order, with its words; the cloth is back as "Clean cloth or rag" (the coordinator's ruling I3 on PR 59). */
export const CARRY_NAMES: [string, string][] = [
  ['carry-spare-tube', 'Spare tube (right size and valve)'],
  ['carry-tyre-levers', 'Tyre levers'],
  ['carry-pump', 'Pump or gas inflator (one that fits your valves)'],
  ['carry-patch-kit', 'Patch kit (patches, glue, sandpaper, chalk)'],
  ['carry-plug-kit', 'Tubeless plug kit'],
  ['carry-knife', 'Small knife or scissors'],
  ['carry-tyre-boot', 'Tyre boot (or a piece of old tyre)'],
  ['carry-quick-link', 'Quick link for your chain (right speed and make; most 12-speed links are for one use only)'],
  ['carry-chain-tool', 'Chain tool (or multi-tool with one)'],
  ['carry-multi-tool', 'Multi-tool (hex keys, screwdriver) that fits the bolts on your bike'],
  ['carry-zip-ties', 'Zip ties or tape'],
  ['carry-spoke-key', 'Spoke key'],
  ['carry-cloth', 'Clean cloth or rag'],
  ['carry-charger', 'Charger (for long trips)'],
];

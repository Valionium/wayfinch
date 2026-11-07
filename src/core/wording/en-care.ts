// Bike care's words (sub-project 12): the screen's strings (C) and the content, every task with its texts. Its own module, loaded only
// with the Bike care screen, so neither the first screen nor Tools carries it. Under the banned-words test
// (tests/unit/core/wording-care.test.ts), with the general list only (bannedHits(text, false)), so "dry" is allowed here.
//
// Group 1 ships a short SAMPLE of the content draft's Care rows (2026-11-06-bike-care-content-draft.md, after the owner's two book
// rounds), word for word apart from: the draft's provenance marks ("(book, more careful)", "(book)") and its "Disagree:" lines, which
// are in src/core/care/sources.ts; "If unsure, a shop.", which the screen adds from `critical` (decision 5); the time, which is in
// `minutes`. Group 2 replaces the sample with the full list after the owner's read (O4). Nothing here is final until then.
import type { CareKey, CareTask, CareValue, CarryItem, Part, RoadCard, Section } from '../care/types.ts';

export const C = {
  careTitle: 'Bike care',
  careIntro: 'What to do to your bike, how often, and the signs that it is due. It works offline and keeps no record.',
  careBack: 'Tools',
  careTabsLabel: 'Bike care',
  careTabCare: 'Care',
  careTabRoad: 'Roadside repairs',
  careRoadHeading: 'Fixes on the road',
  careRoadCheckFirst: 'Check first',
  careRideOn: 'Ride on?',
  careRoadCarry: 'What to carry for this',
  careCarryTitle: 'What to carry',
  careSearchLabel: 'Search',
  careSearchHint: 'For example squeak, chain or bleed',
  careFiltersLabel: 'Parts',
  careTellUs: "Tell us your brakes, tyres… to hide what doesn't apply",
  careNothing: 'Nothing matches.',
  careClear: 'Clear search and filter',
  careSigns: "Signs it's due",
  careSteps: 'How to',
  careTools: 'Tools',
  careTime: (low: number, high: number): string => (low === high ? `About ${low} min` : `About ${low}–${high} min`),
  careWho: 'Yourself or shop',
  careAlsoWet: 'And always after rain or mud.',
  careUnsure: 'If unsure, a shop.',
  careTagIf: 'if you have',
  careFound: (n: number): string => (n === 1 ? '1 task' : `${n} tasks`),
  careFoundBoth: (tasks: number, cards: number): string => `${tasks === 1 ? '1 task' : `${tasks} tasks`}, ${cards === 1 ? '1 roadside repair' : `${cards} roadside repairs`}`,
};

export const PART_LABEL: Record<Part, string> = {
  chain: 'Chain', brakes: 'Brakes', tyres: 'Tyres', gears: 'Gears', wheels: 'Wheels', suspension: 'Suspension', ebike: 'E-bike', frame: 'Frame & bolts',
};
/** The part filters in design 3.1's order. */
export const PARTS: Part[] = ['chain', 'brakes', 'tyres', 'gears', 'wheels', 'suspension', 'ebike', 'frame'];

export const SECTION_LABEL: Record<Section, string> = {
  ride: 'After every ride', wet: 'After rain or mud', week: 'Every week', month: 'Every month', 'half-year': 'Every 6 months', year: 'Every year',
  notice: 'When you notice…',
};
/** The sections in design 3.1's order. */
export const SECTIONS: Section[] = ['ride', 'wet', 'week', 'month', 'half-year', 'year', 'notice'];

export const WHO_LABEL: Record<CareTask['who'], string> = { you: 'Yourself', shop: 'Shop', 'you-check': 'Yourself to check' };

/** What a Not sure detail's tag names, for each value a task can depend on: "if you have" + the words. */
const VALUE_WORDS: { [K in CareKey]: Record<CareValue[K], string> } = {
  brakes: { rim: 'rim brakes', 'cable-disc': 'cable disc brakes', 'hydraulic-disc': 'hydraulic disc brakes' },
  tyres: { tubes: 'inner tubes', tubeless: 'tubeless tyres' },
  drive: { chain: 'a chain', belt: 'a belt drive' },
  gears: { derailleur: 'derailleur gears', hub: 'hub gears or a single speed' },
  shifting: { cable: 'cable shifting', electronic: 'electronic shifting' },
  suspension: { none: 'no suspension', front: 'a suspension fork', full: 'full suspension' },
  ebike: { yes: 'an e-bike', no: 'a bike without a motor' },
};

/** "if you have disc brakes": the tag of one Not sure detail, from the values the task allows for it. */
export function TAG_LABEL<K extends CareKey>(key: K, values: readonly CareValue[K][]): string {
  const words = VALUE_WORDS[key] as Record<string, string>;
  const set = [...values].sort().join(' ');
  const joined = key === 'brakes' && set === 'cable-disc hydraulic-disc' ? 'disc brakes'
    : key === 'brakes' && set === 'cable-disc hydraulic-disc rim' ? 'rim or disc brakes'
      : key === 'suspension' && set === 'front full' ? 'suspension'
        : values.map((v) => words[v]).join(' or ');
  return `${C.careTagIf} ${joined}`;
}

// ---- The sample (group 1) ----
export const CARE_TASKS: CareTask[] = [
  {
    id: 'brakes-pads-disc', name: 'Check the disc brake pads and replace if worn', part: 'brakes', section: 'week', alsoWet: false,
    signs: 'squeal, grinding noise, weak braking, lever pulls far, about 1.5 mm of pad left',
    steps: [
      'Look into the caliper with a torch.',
      // The draft's settled limit (review of PR 58, I1): about 1.5 mm, and the pad maker's mark if given.
      "Pad material about 1.5 mm or thinner, or at the pad maker's mark if given: replace both pads.",
      'A grinding noise when braking means the pads are worn: replace them.',
      'Squeal, a hard lever or dark, smeary pads can mean oil on them: find the source and replace the pads.',
      'After fitting, hydraulic: pump the lever until pads touch; cable: re-align the caliper; squeeze the lever several times before riding.',
    ],
    tools: 'torch, hex keys, new pads', minutes: [20, 20], who: 'you', why: 'Yourself if you have done it before; otherwise shop',
    note: 'Pads wear fastest in winter, wet and mud. Brakes are critical; a mistake can cause a crash.',
    // "squeak" added, as design 3.1's example and Task 5 ask (the draft has "squeal").
    words: ['brake pads', 'squeal', 'squeak', 'worn pads', 'brake noise', 'grinding'], applies: { brakes: ['cable-disc', 'hydraulic-disc'] }, critical: true,
  },
  {
    id: 'brakes-pads-rim', name: 'Check the rim brake pads and rim wear', part: 'brakes', section: 'week', alsoWet: false,
    signs: 'grooves in pad gone, scraping noise, weak braking, squeal; rim wear mark gone',
    steps: [
      'Look at the grooves in each pad; replace when gone or uneven.',
      'A scraping noise can mean the metal backing touches the rim: replace the pad at once.',
      'Check the pad hits the rim, not the tyre or spokes.',
      // The draft's steps 4 and 6 (both say when the rim or wheel is worn out) as one, so the task has 6 steps (design 3.2: 3 to 6).
      "Look for the small pit or groove in the rim wall; if it is gone the rim is worn out (replace the rim). Deep scratches or scoring in the rim's braking surface: the wheel needs replacing.",
      'Pad front edge should touch slightly before the back (toe-in) to cut squeal.',
      'New pads are marked left and right and which way is up; after fitting, line them up with the rim so they do not touch the tyre.',
    ],
    tools: 'hex keys, new pads', minutes: [15, 15], who: 'you', why: 'Yourself for pads; shop for a new rim',
    note: 'Brakes and wheels are critical; a worn rim can split and cause a crash.',
    words: ['rim brake', 'pads worn', 'squeal', 'squeak', 'weak brakes', 'rim wear'], applies: { brakes: ['rim'] }, critical: true,
  },
  {
    id: 'wheels-spokes-check', name: 'Check the spokes', part: 'wheels', section: 'week', alsoWet: false,
    signs: 'loose or clicking spoke, wobble in the rim',
    steps: [
      'Squeeze pairs of spokes by hand; feel for loose ones.',
      'Spin the wheel and watch the rim gap at the brake or frame.',
      'Check the wheel sits firmly in the frame.',
      'Look at the rim for cracks or bulges around the spoke holes; if you find any, do not ride.',
      'A bent or loose wheel needs truing.',
    ],
    tools: 'none', minutes: [3, 3], who: 'you-check', why: 'Yourself to check; shop to true',
    note: 'Wheels are critical; a failure can cause a crash.',
    words: ['spoke', 'loose spoke', 'wobble', 'wheel', 'click', 'rim crack'], applies: {}, critical: true,
  },
  {
    id: 'frame-bolts-check', name: 'Check the main bolts', part: 'frame', section: 'week', alsoWet: false,
    signs: 'rattle, creak, or part that moves by hand',
    steps: [
      'Check bolts on stem, handlebar, seatpost clamp, wheels and pedals by hand; also crank, chainring and brake bolts and the wheel quick releases.',
      'Try to twist the handlebar, stem, saddle and seatpost. Carbon parts: do not twist them; check their bolts with a torque wrench instead.',
      'Look for cracks and dents on the handlebar and stem.',
      'Check the bar end plugs are in, the brake and gear levers are firm, and the bar is square to the front wheel.',
      'Push each crank sideways: movement means the bottom bracket is loose. Twist each pedal: it should not move on its thread or bearings.',
      'Use a torque wrench at the number printed on each part.',
    ],
    tools: 'hex keys, torque wrench', minutes: [10, 10], who: 'you', why: 'Yourself or shop',
    note: 'Before each ride, do the quick twist test of step 2 and check the wheel quick releases or axle nuts sit fully in the dropouts. Steerer, stem and handlebar bolts are critical; too loose or too tight can cause a crash.',
    words: ['loose bolt', 'rattle', 'creak', 'handlebar loose', 'torque', 'bar end', 'pedal', 'crank'], applies: {}, critical: true,
  },
  {
    id: 'chain-lube', name: 'Lube the chain, after every wash and always after rain or mud', part: 'chain', section: 'month', alsoWet: true,
    signs: 'squeaks, looks dry or rusty',
    steps: [
      'Clean or wipe the chain first; oil goes on after every wash.',
      'Hold the chain oil over the chain just in front of the rear derailleur and drip it on while you turn the pedals. Use little oil.',
      'Wipe the oil off the outer plates.',
      'Lift the rear wheel and shift through all the gears so the oil reaches the rear gears and chainrings.',
      'Put a drop on the derailleur pivots, springs and jockey wheels.',
      'Wipe off extra oil: left on, it mixes with dirt into a grinding paste. Keep oil off brake discs and rims.',
    ],
    tools: 'rag, chain oil', minutes: [5, 5], who: 'you', why: null,
    note: 'At least monthly, after every wash and after every rain ride. Wet-weather oil is hard to wash off, so it suits rain and mud, but it collects dust and grime; dry (wax) lube collects less dirt but needs renewing more often, and suits dry, dusty or sandy riding. Do not use general penetrating oil or household oil as chain oil.',
    words: ['squeak', 'noisy', 'dry chain', 'lube', 'oil', 'rust'], applies: { drive: ['chain'] }, critical: false,
  },
  {
    id: 'ebike-battery-care', name: 'Look after the battery', part: 'ebike', section: 'month', alsoWet: false,
    signs: 'range is falling; battery warm or swollen; long storage coming',
    steps: [
      'For storage over a few weeks, leave it about 30-60% charged.',
      'Store at room temperature, dry, out of sun.',
      'Check it every 6 months and top up if one light is left.',
    ],
    tools: 'none', minutes: null, who: 'you', why: null,
    note: 'Never leave it fully charged or fully empty for long.',
    words: ['ebike battery', 'storage', 'winter', 'range', 'charge level'], applies: { ebike: ['yes'] }, critical: false,
  },
  {
    id: 'tyres-sealant-topup', name: 'Top up the sealant', part: 'tyres', section: 'half-year', alsoWet: false,
    signs: 'sealant dried out; tyre needs air often',
    steps: [
      'Release the air and remove the valve core.',
      'Add the sealant amount stated by the sealant maker.',
      'Refit the core, pump up, then turn the wheel round several times to spread the sealant.',
      'To find a leak, hold the tyre in soapy water for 10-20 seconds; rising bubbles show where air escapes.',
    ],
    tools: 'sealant, valve core tool, pump, bucket of soapy water', minutes: [15, 15], who: 'you', why: null,
    // The draft's settled interval (draft section 5; review of PR 58, I2): 3-6 months, 1-2 months in hot weather.
    note: 'Every 3-6 months, 1-2 months in hot weather (sources say 2-12). Take the tyre off once a year to inspect and remove dried lumps.',
    words: ['sealant', 'tubeless', 'dry', 'top up', 'goo', 'loses air'], applies: { tyres: ['tubeless'] }, critical: false,
  },
  {
    id: 'gears-hub-oil', name: 'Service the hub gear oil', part: 'gears', section: 'half-year', alsoWet: false,
    signs: 'gears slip, stiff shifting, or the interval is up',
    steps: [
      // The draft's step 1 at its colon, and its Rohloff step cut (no source found; owner's rule: unsourced facts are cut).
      "Oil the hub gears every 6 months, or sooner if the maker's distance comes first.",
      'Shimano Alfine: about 5000 km; Nexus: about 2000 km.',
      "Use the maker's oil and kit.",
    ],
    tools: "maker's oil kit", minutes: [30, 30], who: 'you', why: "Yourself with the maker's kit, or a shop (wrong oil or overfill can damage the hub)",
    note: null,
    // On every chain-hub or belt bike; a single speed is stored the same way, so without a known shifter it is tagged (coordinator's
    // ruling R3 on PR 58: a hub-gear rider never loses it, a single-speed rider sees one tagged task).
    words: ['internal hub', 'alfine', 'nexus', 'oil change', 'hub gears', 'slipping'], applies: { gears: ['hub'] }, critical: false,
    soft: { applies: { shifting: ['cable', 'electronic'] }, tag: 'If your hub has gears' },
  },
  {
    id: 'susp-fork-service', name: 'Full fork service', part: 'suspension', section: 'half-year', alsoWet: false,
    signs: '100-200 riding hours, or 6 months',
    steps: [
      'Have the suspension checked at a shop every 6 months.',
      'RockShox: lower legs about 50 h; spring and damper about 100-200 h by model year.',
      // The shorter of Fox's 100 h and 125 h (decision 6; coordinator's ruling on review of PR 58, I3).
      'Fox: about 100 h.',
      "Check the maker's chart for your model; whichever comes first.",
    ],
    tools: 'shop tools', minutes: null, who: 'shop', why: 'Shop (needs tools, oil and seal kits)',
    note: 'Several hours.',
    words: ['fork service', 'rockshox', 'fox', 'suspension'], applies: { suspension: ['front', 'full'] }, critical: false,
  },
];

// ---- The Roadside repairs cards (group 3, Task 6) ----
// The content draft's 12 cards (2026-11-06-bike-care-content-draft.md, section 2, after the owner's two book rounds), word for word apart
// from the PR 59 review's rulings (each a correction to the draft, listed in the PR body: the brake's quick release named as such and closed
// again, the tubeless valve, the clean cloth back, the bolt card's carbon warning first, spoke Ride on, the brake centring step), and from: the draft's provenance marks ("(book, more careful)", "(book p. 120)"), which are in src/core/care/sources.ts; "If unsure, a
// shop.", which the screen adds from `critical` (decision 5); the step numbers (the screen numbers the list); and the brake-rub-rim
// centring-screw aside, which the draft marks "no source found" (decision 6: unsourced facts are cut), and the dry cloth row, now back as a clean cloth. "Ride on?" is the answer for each
// card (decision 1: "safe" is a banned word). Nothing here is final until the owner's read (O5).
export const ROAD_CARDS: RoadCard[] = [
  {
    id: 'puncture-tube', problem: 'Puncture (inner tube)', part: 'tyres', applies: { tyres: ['tubes'] },
    checkFirst: 'Is the tyre flat or only soft? Find the hole in the tyre.',
    steps: [
      'Take the wheel off; let out remaining air.',
      'Pry one tyre bead off with levers: hook the first lever on a spoke, then run a second lever round the rim. Do not catch the tube.',
      'Pull the tube out and find the hole: pump it up and listen; for a tiny hole, hold the tube near your lips to feel the air.',
      'Feel inside the tyre for the thorn or glass and remove it; look at the matching spot on the tube. Two side-by-side slits mean the tube was pinched against the rim.',
      "To patch: roughen an area a bit bigger than the patch with the sandpaper, spread glue and wait about 30-60 seconds until it is tacky, not wet; press the patch on from the middle outwards; dust it with the kit's chalk.",
      'Before refitting, run your fingers round the inside of the tyre and the rim again and remove any grit or small stones.',
      'Fit the new or patched tube with a little air in it, valve straight through the rim; seat the tyre, squeeze its sides to check no tube is caught under the bead, pump up.',
    ],
    rideOn: 'Fine if it holds air. Stop if the tyre has a cut or bulge.',
    carry: ['carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-patch-kit'],
    words: ['flat', 'puncture', 'tube', 'slow leak', 'thorn', 'patch', 'pinch flat'], critical: false,
  },
  {
    id: 'puncture-tubeless', problem: 'Puncture (tubeless)', part: 'tyres', applies: { tyres: ['tubeless'] },
    checkFirst: 'Spin the hole to the bottom so sealant plugs it. Is it still hissing?',
    steps: [
      'Find the hole; spin it to the bottom.',
      'Pull out the thorn or glass.',
      'Ream the hole and push a plug in with the tool.',
      'Trim the plug; pump up.',
      'Wait a few minutes for the sealant.',
      'Still leaking: fit a spare tube (remove the tubeless valve).',
      'A plug can work loose, so check it later.',
    ],
    rideOn: 'Fine once it holds air. Stop if the sidewall is cut or the tyre bulges.',
    carry: ['carry-plug-kit', 'carry-spare-tube', 'carry-pump', 'carry-tyre-levers', 'carry-multi-tool', 'carry-knife'],
    words: ['tubeless', 'plug', 'sealant', 'flat', 'hissing'], critical: false,
  },
  {
    id: 'chain-broken', problem: 'Broken chain', part: 'chain', applies: { drive: ['chain'] },
    checkFirst: 'Where did it break? Is a link twisted or missing?',
    steps: [
      'Remove the damaged links with a chain tool.',
      'Join the ends with a quick link of the same speed count.',
      'Stand on the pedal or squeeze the link until it clicks.',
      'Flex the joined link sideways; if it is stiff, work it until it moves freely, or it will jump on the rear gears.',
      'Test a gentle pedal turn.',
      'Shift gently.',
    ],
    rideOn: 'Fine on easy gears with gentle power. Walk if it keeps skipping. Get it replaced soon.',
    carry: ['carry-quick-link', 'carry-chain-tool'],
    words: ['chain', 'snapped', 'broke', 'quick link', 'master link'], critical: false,
  },
  {
    id: 'spoke-snapped', problem: 'Snapped spoke', part: 'wheels', applies: {},
    checkFirst: 'Is only one spoke gone, and does the rim still turn?',
    steps: [
      'Wrap the broken spoke around a good neighbour or tape it.',
      "Rim brakes: if the rim rubs, open the brake's quick release (the small lever on the brake, not the wheel's). Until you close it again, this brake works much less: ride slowly and use the other brake.",
      'Disc brakes: check the wheel turns without touching the brake; if it rubs, ride slowly.',
      'Ride slowly to a shop.',
      "Rim brakes: close the brake's quick release once the wheel is fixed.",
    ],
    rideOn: "Fine for a slow ride home if only one spoke has gone and the rim turns. Walk if the wheel is badly bent, or more than one spoke has gone. With a brake's quick release open, that brake works much less. Wheels are critical.",
    carry: ['carry-zip-ties', 'carry-spoke-key', 'carry-multi-tool'],
    words: ['spoke', 'broken', 'wobbly wheel', 'wheel bent'], critical: true,
  },
  {
    id: 'brake-rub-rim', problem: 'Brake rubbing', part: 'brakes', applies: { brakes: ['rim'] },
    checkFirst: 'Is the wheel straight in the frame? Is the pad touching one side? Is the rim bent? Is the tyre bead seated?',
    steps: [
      "Re-seat the wheel in the dropouts and tighten the wheel's quick release.",
      'Check the tyre bead sits evenly; if not, let the air out, seat it, pump up.',
      "If it still rubs, ride on gently and have the brake centred at a shop.",
      'Check the pad is not touching the tyre or spokes.',
      "Open the brake's quick release only if you must and ride slowly. Until you close it again, this brake works much less: ride slowly and use the other brake.",
      "Close the brake's quick release once the wheel is fixed.",
    ],
    rideOn: 'Fine if light rub. Walk if the wheel is bent or the brake will not stop you.',
    carry: ['carry-multi-tool'],
    words: ['brake rub', 'rubbing', 'scraping', 'rim brake'], critical: true,
  },
  {
    id: 'brake-rub-disc', problem: 'Disc brake rubbing', part: 'brakes', applies: { brakes: ['cable-disc', 'hydraulic-disc'] },
    checkFirst: 'Is the wheel seated all the way? Is the disc bent or loose? Any play in the hub?',
    steps: [
      'Loosen the axle, push the wheel down into the dropouts, retighten.',
      'Spin the wheel and look at the pad gaps.',
      'Loosen both caliper bolts, squeeze the lever, hold it, snug the bolts.',
      'Release, spin; if it still rubs, nudge the caliper away from the rub.',
      'Cable brakes: turn the pad adjuster on the rubbing side a quarter turn.',
    ],
    rideOn: 'Fine for light rub. Stop if the disc is bent hard or the brake feels odd. Brakes are critical.',
    carry: ['carry-multi-tool'],
    words: ['rubbing', 'scraping', 'disc', 'noisy brakes'], critical: true,
  },
  {
    id: 'brake-weak-rim', problem: 'Brakes not biting', part: 'brakes', applies: { brakes: ['rim'] },
    checkFirst: "Wet or dirty rim? Cable loose? Brake's quick release open? Pads worn or hitting the tyre?",
    steps: [
      'Wipe the rim and pads.',
      "Check the brake's quick release is closed.",
      'Turn the barrel adjuster to pull the cable tighter.',
      'If still weak, check the cable clamp is tight, the pads are tight on the arms and sit square on the rim.',
      'Replace pads with gone grooves or a scraping noise.',
    ],
    rideOn: 'Walk if the brakes will not stop you. Brakes are critical.',
    carry: ['carry-multi-tool', 'carry-cloth'],
    words: ['no brakes', 'weak', 'wet', 'brake cable'], critical: true,
  },
  {
    id: 'brake-weak-disc', problem: 'Disc brakes not biting', part: 'brakes', applies: { brakes: ['cable-disc', 'hydraulic-disc'] },
    checkFirst: 'Oil on the pads? Worn pads (a grinding noise)? Lever pulling to the bar?',
    steps: [
      'Signs of oil: squeal, hard lever, dark smeary pads; pads soaked in oil cannot be saved. A grinding noise means worn pads.',
      'Wipe the disc; replace oily or worn pads when you can. Never touch the disc or pads with your fingers.',
      'Cable: turn the pad adjuster knobs in a little.',
      'Hydraulic: pump the lever; if it stays soft it needs a bleed.',
      'Walk the hills.',
    ],
    rideOn: 'Walk if the lever hits the bar or the brakes will not stop you. Brakes are critical; a mistake can cause a crash.',
    carry: ['carry-multi-tool', 'carry-cloth'],
    words: ['brakes fade', 'spongy', 'no brakes', 'oily', 'soft lever', 'grinding'], critical: true,
  },
  {
    id: 'gears-skipping', problem: 'Gears skipping', part: 'gears', applies: { gears: ['derailleur'] },
    checkFirst: 'Chain worn or stiff link? Bent hanger? Cable loose?',
    steps: [
      'Look for a stiff link and wiggle it free.',
      'Turn the barrel adjuster a click at a time.',
      'Pick a gear where it holds.',
      'Stay in that gear and go home.',
    ],
    rideOn: 'Fine in a gear that holds. Walk if it slips under load.',
    carry: ['carry-multi-tool', 'carry-quick-link'],
    words: ['skipping', 'slipping', 'jump', 'chain jumps'], critical: false,
  },
  {
    id: 'bolt-loose', problem: 'Loose bolt or rattle', part: 'frame', applies: {},
    checkFirst: 'Which part moves when you shake it?',
    steps: [
      'Carbon parts: do not twist them to test; their bolts take the torque printed on the part, set with a torque wrench. Without one, if unsure, a shop.',
      'Find the bolt by feel.',
      'Tighten to the torque printed on the part. Without a torque wrench, only snug it, and have it checked.',
      'Re-check after a short ride.',
    ],
    rideOn: 'Fine for most bolts once tight. Stop if a stem, bar or steerer bolt will not tighten. Critical.',
    carry: ['carry-multi-tool'],
    words: ['loose', 'rattle', 'noise', 'bolt', 'carbon'], critical: true,
  },
  {
    id: 'tyre-torn', problem: 'Torn tyre (needs a boot)', part: 'tyres', applies: { tyres: ['tubes', 'tubeless'] },
    checkFirst: 'How big is the cut? Is the tube bulging?',
    steps: [
      'Remove the wheel and tube.',
      'Put a boot (or a strong patch) inside, covering the cut.',
      'Fit a tube and pump to low pressure first.',
      'Check for bulging, then pump to a lower pressure than normal.',
    ],
    rideOn: 'Fine to ride slowly if the boot holds. Walk if the tyre bulges.',
    carry: ['carry-tyre-boot', 'carry-spare-tube', 'carry-tyre-levers', 'carry-pump'],
    words: ['cut tyre', 'sidewall', 'hole', 'boot', 'bulge'], critical: false,
  },
  {
    id: 'ebike-no-power', problem: "E-bike won't power on", part: 'ebike', applies: { ebike: ['yes'] },
    checkFirst: 'Battery charged? Battery seated and clicked in?',
    steps: [
      'Remove the battery and refit it until it clicks.',
      'Wipe the contacts with a dry cloth.',
      'Press the power button on the battery.',
      'Check display, remote and motor plugs are tight.',
      'Try to power on again; note any error code.',
    ],
    rideOn: 'Ride unpowered if the bike pedals fine. Stop if the motor smells hot or the battery is damaged.',
    carry: ['carry-charger', 'carry-cloth'],
    words: ["won't turn on", 'dead', 'battery', 'no power', 'display'], critical: false,
  },
];

// ---- What to carry (group 3, Task 7) ----
// The draft's carry list in its order and words. The draft's standalone "Dry cloth" row had "no source found"; the cloth is back as "Clean cloth or rag"
// because three cards' steps wipe (the coordinator's ruling I3 on PR 59).
export const CARRY: CarryItem[] = [
  { id: 'carry-spare-tube', name: 'Spare tube (right size and valve)', applies: { tyres: ['tubes', 'tubeless'] } },
  { id: 'carry-tyre-levers', name: 'Tyre levers', applies: {} },
  { id: 'carry-pump', name: 'Pump or gas inflator (one that fits your valves)', applies: {} },
  { id: 'carry-patch-kit', name: 'Patch kit (patches, glue, sandpaper, chalk)', applies: { tyres: ['tubes'] } },
  { id: 'carry-plug-kit', name: 'Tubeless plug kit', applies: { tyres: ['tubeless'] } },
  { id: 'carry-knife', name: 'Small knife or scissors', applies: { tyres: ['tubeless'] } },
  { id: 'carry-tyre-boot', name: 'Tyre boot (or a piece of old tyre)', applies: {} },
  { id: 'carry-quick-link', name: 'Quick link (right speed)', applies: { drive: ['chain'] } },
  { id: 'carry-chain-tool', name: 'Chain tool (or multi-tool with one)', applies: { drive: ['chain'] } },
  { id: 'carry-multi-tool', name: 'Multi-tool (hex keys, screwdriver) that fits the bolts on your bike', applies: {} },
  { id: 'carry-zip-ties', name: 'Zip ties or tape', applies: {} },
  { id: 'carry-spoke-key', name: 'Spoke key', applies: {} },
  { id: 'carry-cloth', name: 'Clean cloth or rag', applies: {} },
  { id: 'carry-charger', name: 'Charger (for long trips)', applies: { ebike: ['yes'] } },
];

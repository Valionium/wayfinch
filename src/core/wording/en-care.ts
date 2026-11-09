// Bike care's words (sub-project 12): the screen's strings (C) and the content, every task with its texts. Its own module, loaded only
// with the Bike care screen, so neither the first screen nor Tools carries it. Under the banned-words test
// (tests/unit/core/wording-care.test.ts), with the general list only (bannedHits(text, false)), so "dry" is allowed here.
//
// Group 2 holds the content draft's Care rows (2026-11-06-bike-care-content-draft.md, after the owner's two book rounds), word for word
// apart from: the draft's provenance marks ("(book, more careful)", "(book)") and its "Disagree:" lines, which are in
// src/core/care/sources.ts; "If unsure, a shop.", which the screen adds from `critical` (decision 5); the time, which is in `minutes`
// (or, for a shop job of hours, in the note); and the owner's rules of 7 November: facts with no source are cut, never guessed (the
// chain wipe after every ride is cut; the bleed has no yearly interval and sits under When you notice; the brake test has no evenness
// check; the creak has no claim about common sources), the careful value ships, brake, steerer, stem and bar bolts use the torque rule
// or the twist test, carbon parts never go without a torque wrench, each quick release is the brake's or the wheel's. Nothing here is
// final until the owner's read (O4).
import type { CareKey, CareTask, CareValue, CarryItem, Part, RoadCard, Section } from '../care/types.ts';

export const C = {
  careTitle: 'Bike care',
  careIntro: 'What to do to your bike, how often, and the signs that it is due. It works offline and keeps no record.',
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
  // The step view (care pictures design of 7 November 2026, section 2)
  careStepsClose: 'Close',
  careStepsAll: 'All steps',
  careStepsBack: 'Back',
  careStepsNext: 'Next',
  careStepsDone: 'Done',
  careStepsBefore: 'Before you start',
  careStepsEnd: 'At the end',
  careStepN: (n: number): string => `Step ${n}`,
  careStepsCount: (n: number, of: number): string => `Step ${n} of ${of}`,
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

// ---- Care tasks (group 2: the draft's 49 rows less the one the owner's rules cut, 48) ----
export const CARE_TASKS: CareTask[] = [
  {
    id: 'brakes-lever-test', name: 'Test both brakes', part: 'brakes', section: 'ride', alsoWet: false,
    signs: 'lever feels soft, pulls to the bars, or noise',
    steps: [
      'Roll the bike and squeeze each lever.',
      'If a lever feels wrong, do not ride; see the brake tasks.',
      'Do this before you set off too.',
      'Rim brakes: also look that the pads are not worn and meet the rim squarely.',
    ],
    tools: 'none', minutes: [1, 1], who: 'you-check', why: 'Yourself to check; shop if it feels wrong (brakes are critical; a mistake can cause a crash)',
    note: null,
    words: ['brake', 'squeeze', 'spongy', 'weak', 'stop'], applies: {}, critical: true,
  },
  {
    id: 'ebike-charge-indoors', name: 'Charge the battery indoors', part: 'ebike', section: 'ride', alsoWet: false,
    signs: 'battery low; cold or hot from the ride',
    steps: [
      'Let the battery come to room temperature.',
      'Charge it indoors, dry, away from things that burn.',
      'Charging only works between 0 and 40 C.',
      'Unplug when full if you can.',
    ],
    tools: 'charger', minutes: null, who: 'you', why: null,
    note: null,
    words: ['battery', 'charge', 'ebike', 'cold', 'winter'], applies: { ebike: ['yes'] }, critical: false,
  },
  {
    id: 'frame-wash', name: 'Rinse the bike and dry it', part: 'frame', section: 'wet', alsoWet: false,
    signs: 'mud, grit or salt on the bike',
    steps: [
      'Rinse with a low-pressure hose or bucket.',
      'Brush off grit; keep jets away from bearings.',
      'Dry it with a rag.',
      'Wheel it to dry; lube the chain after.',
    ],
    tools: 'bucket, brush, rag', minutes: [15, 15], who: 'you', why: null,
    note: null,
    words: ['wash', 'mud', 'dirty', 'salt', 'rust', 'hose'], applies: {}, critical: false,
  },
  {
    id: 'chain-dry-lube', name: 'Dry and re-oil the chain', part: 'chain', section: 'wet', alsoWet: false,
    signs: 'rust spots, squeaks, grit paste',
    steps: [
      'Wipe the chain dry with a rag.',
      'Hold the chain oil over the chain just in front of the rear derailleur and drip it on sparingly while you turn the pedals.',
      'Wipe the oil off the outer plates.',
      'Lift the rear wheel and shift through all the gears so the oil reaches the rear gears and chainrings.',
      'Put a drop on the derailleur pivots, springs and jockey wheels.',
      'Wipe off extra oil; keep it off brake discs and rims.',
    ],
    tools: 'rag, chain oil', minutes: [5, 5], who: 'you', why: null,
    note: null,
    words: ['squeak', 'rust', 'wet chain', 'noisy', 'lube'], applies: { drive: ['chain'] }, critical: false,
  },
  {
    id: 'belt-rinse', name: 'Rinse the belt', part: 'chain', section: 'wet', alsoWet: false,
    signs: 'mud or grit stuck in the belt or sprockets',
    steps: [
      'Rinse with plain water and a soft brush.',
      'Do not use soap, oil or lube.',
      'Let it dry.',
    ],
    tools: 'bucket, soft brush', minutes: [5, 5], who: 'you', why: null,
    note: null,
    words: ['belt', 'mud', 'noisy belt', 'clean'], applies: { drive: ['belt'] }, critical: false,
  },
  {
    id: 'brakes-rotor-wipe', name: 'Wipe the brake discs', part: 'brakes', section: 'wet', alsoWet: false,
    signs: 'squeal or weak brakes after wet or muddy rides',
    steps: [
      'Spray disc-brake cleaner on a clean rag, not on the pads.',
      'Wipe both sides of each disc.',
      'Test the brakes before riding.',
    ],
    tools: 'brake cleaner, clean rag, clean gloves', minutes: [5, 5], who: 'you', why: null,
    note: 'Never touch the braking surface with bare or oily hands.',
    words: ['squeal', 'wet brakes', 'noisy brakes', 'disc', 'contamination'], applies: { brakes: ['cable-disc', 'hydraulic-disc'] }, critical: true,
  },
  {
    id: 'brakes-rim-wipe', name: 'Wipe the rims', part: 'brakes', section: 'wet', alsoWet: false,
    signs: 'gritty braking noise or grabby brakes after wet rides',
    steps: [
      'Wipe rim braking surfaces with a damp rag.',
      'Check the pads for stuck grit and pick it out.',
      'If it still squeals, clean the rims with degreaser to lift old pad residue, then rinse with water.',
      'Test the brakes before riding.',
    ],
    tools: 'rag, degreaser', minutes: [5, 5], who: 'you', why: null,
    note: null,
    words: ['rim brake', 'squeal', 'grit', 'wet brakes'], applies: { brakes: ['rim'] }, critical: true,
  },
  {
    id: 'ebike-dry-contacts', name: 'Dry the battery and plugs', part: 'ebike', section: 'wet', alsoWet: false,
    signs: 'water on battery contacts or display',
    steps: [
      'Do not use a pressure washer on the motor or battery.',
      'Wipe the battery and its contacts dry.',
      'Store the bike indoors.',
    ],
    tools: 'rag', minutes: [5, 5], who: 'you', why: null,
    note: 'Every 6 months also clean battery and bike contacts with a dry cloth.',
    words: ['ebike', 'wet', 'rain', 'battery', 'wash'], applies: { ebike: ['yes'] }, critical: false,
  },
  {
    id: 'tyres-pressure', name: 'Check the tyre pressure and look the tyres over', part: 'tyres', section: 'week', alsoWet: false,
    signs: 'tyre feels soft; pressure outside the range on the sidewall; glass, cuts or bulges; worn tread or cracked sidewalls',
    steps: [
      'Before each ride, squeeze each tyre for a quick check.',
      'Weekly, find the pressure range printed on the tyre sidewall.',
      'Use a gauge on the pump; squeezing does not give a number.',
      'Pump to a number inside that range; heavier load means more air.',
      'Spin the wheel and look for glass, cuts, bulges, worn tread and cracked sidewalls.',
      'Check the tyre sits evenly on the rim with no tube showing.',
    ],
    tools: 'pump with gauge', minutes: [3, 3], who: 'you', why: null,
    note: 'At least monthly; weekly is better (tubes lose about 1 bar a month; latex tubes lose faster, so check before each ride). Tubeless on hookless rims: use the lower maximum for those tyres. Worn tread or cracked sidewalls: see "Replace worn tyres".',
    words: ['pump', 'pressure', 'soft tyre', 'flat', 'psi', 'bar', 'cut', 'glass', 'thorn', 'worn tyre', 'crack'], applies: {}, critical: false,
  },
  {
    id: 'gears-shift-test', name: 'Test the gears', part: 'gears', section: 'week', alsoWet: false,
    signs: 'slow shifts, jumps or noise',
    steps: [
      'Lift the rear wheel (or ride gently).',
      'Shift up and down through all gears.',
      'Note any gear that skips or rubs.',
    ],
    tools: 'none', minutes: [2, 2], who: 'you', why: null,
    note: 'See "Fix gears that shift badly" if it fails.',
    words: ['skip', 'jump', 'noisy gears', 'shifting', 'ghost shift'], applies: { gears: ['derailleur'] }, critical: false,
  },
  {
    id: 'chain-wear-check', name: 'Check the chain for wear', part: 'chain', section: 'week', alsoWet: false,
    signs: 'gears skip or the chain slips under load; chain looks long',
    steps: [
      'Shift to the smallest chainring and the smallest rear gear so the chain is slack.',
      'Hook a chain wear gauge into the chain.',
      'Replace when the gauge drops fully into the chain, or at its limit: about 0.5% (11-12 speed) or 0.75% (5-10 speed).',
      'A chain that slips under load also needs replacing.',
    ],
    tools: 'chain wear gauge', minutes: [3, 3], who: 'you-check', why: 'Yourself to check; replace yourself or a shop',
    note: null,
    words: ['worn chain', 'stretched', 'skipping', 'slipping', 'gauge', 'chain checker'], applies: { drive: ['chain'] }, critical: false,
  },
  {
    id: 'brakes-pads-disc', name: 'Check the disc brake pads and replace if worn', part: 'brakes', section: 'week', alsoWet: false,
    signs: 'squeal, grinding noise, weak braking, lever pulls far, about 1.5 mm of pad left',
    steps: [
      'Look into the caliper with a torch.',
      // The draft's settled limit (review of PR 58, I1): about 1.5 mm, and the pad maker's mark if given.
      "Pad material about 1.5 mm or thinner, or at the pad maker's mark if given: replace both pads.",
      'A grinding noise when braking means the pads are worn: replace them.',
      'Squeal, a hard lever or dark, smeary pads can mean oil on them: find the source and replace the pads.',
      'After fitting, refit the pad pin or bolt to its printed torque; hydraulic: pump the lever until pads touch; cable: re-align the caliper; squeeze the lever several times before riding.',
    ],
    tools: 'torch, hex keys, new pads, clean gloves, torque wrench', minutes: [20, 20], who: 'you', why: 'Yourself if you have done it before; otherwise shop',
    note: 'Pads wear fastest in winter, wet and mud. Brakes are critical; a mistake can cause a crash. Never touch the disc or pads with your fingers.',
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
      'New pads are marked left and right and which way is up; after fitting, line them up with the rim so they do not touch the tyre, then tighten the pad bolt to the torque printed on the brake.',
    ],
    tools: 'hex keys, new pads, torque wrench', minutes: [15, 15], who: 'you', why: 'Yourself for pads; shop for a new rim',
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
    id: 'gears-electronic-battery', name: 'Check the shifting battery', part: 'gears', section: 'week', alsoWet: false,
    signs: 'lights flash red, slow shifting, or shifting stops',
    steps: [
      'Press the button or hold a shift button briefly to see the battery light.',
      "Charge with the maker's charger when low.",
      'Do not wait until it dies; a flat system stops shifting.',
    ],
    tools: 'charger', minutes: [5, 5], who: 'you', why: null,
    note: 'Charging takes extra time.',
    words: ['battery', 'di2', 'axs', 'wireless', 'electronic shifting', 'charge'], applies: { shifting: ['electronic'] }, critical: false,
  },
  {
    id: 'frame-headset-check', name: 'Check the headset and steering', part: 'frame', section: 'week', alsoWet: false,
    signs: 'knock or play in the steering; rough, notchy or stiff turn',
    steps: [
      'Hold the front brake, turn the bar 90 degrees, rest a hand on the headset and rock the bike back and forth.',
      'Any clunk at the headset means it is loose (rule out brake and fork-leg play first).',
      'Turn the bars; they should turn easily and smoothly, not notchy.',
      'If loose or stiff, take it to a shop.',
    ],
    tools: 'none to check', minutes: [3, 3], who: 'shop', why: 'Shop to adjust (steerer and stem bolts are critical; a mistake can cause a crash); you can check play yourself',
    note: 'Steerer and stem bolts are critical; if too loose or too tight a crash can result.',
    words: ['headset', 'knock', 'play', 'loose steering', 'rattle'], applies: {}, critical: true,
  },
  {
    id: 'gears-cables-look', name: 'Look at the gear cables', part: 'gears', section: 'week', alsoWet: false,
    signs: 'frayed, rusty or kinked cable; cracked casing; slow, stiff or missing shifts',
    steps: [
      'Look along cable and casing for rust, fraying, cracks, kinks and dirt; look hardest where the casing (and any brake hose) rubs on the frame.',
      'Check the ends are capped.',
      'If it drags or shifting is slow, replace cable and casing.',
    ],
    tools: 'none', minutes: [5, 5], who: 'you', why: null,
    note: null,
    words: ['cable', 'stiff shift', 'sticky', 'rust', 'frayed'], applies: { shifting: ['cable'] }, critical: false,
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
    id: 'tyres-sealant-check', name: 'Check the sealant', part: 'tyres', section: 'month', alsoWet: false,
    signs: 'tyre loses air overnight; no sloshing sound when shaken',
    steps: [
      'Shake the wheel next to your ear for a slosh.',
      'Or let the air out, remove the valve core and look in (tool needed).',
      'Refit the core and pump up.',
      'If dry or lumpy, top up (see "Top up the sealant").',
    ],
    tools: 'valve core tool', minutes: [5, 5], who: 'you', why: null,
    note: 'Check monthly; hot, dry weather dries it faster.',
    words: ['sealant', 'tubeless', 'loses air', 'slosh', 'goo'], applies: { tyres: ['tubeless'] }, critical: false,
  },
  {
    id: 'belt-inspect', name: 'Inspect the belt', part: 'chain', section: 'month', alsoWet: false,
    signs: 'missing or cracked teeth, frayed edge, jumping, noise',
    steps: [
      'Look along the belt for cracks, frayed cords and worn teeth.',
      'Check sprockets for bends and damage.',
      'Noise with no damage: clean with water; check alignment.',
    ],
    tools: 'none', minutes: [5, 5], who: 'you-check', why: 'Yourself to check; shop to replace',
    note: 'Never oil or lube. Fading belt colour alone is not wear.',
    words: ['belt', 'jumping', 'noisy belt', 'tooth', 'skip'], applies: { drive: ['belt'] }, critical: false,
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
    id: 'susp-wipe-stanchions', name: 'Wipe the fork legs and shock shaft', part: 'suspension', section: 'month', alsoWet: false,
    signs: 'dust or mud on the shiny tubes',
    steps: [
      'Wipe the shiny fork tubes with a clean rag.',
      'On a full-suspension bike, wipe the shock shaft too.',
      'Look for oil leaking at the seals.',
    ],
    tools: 'rag', minutes: [2, 2], who: 'you', why: null,
    note: null,
    words: ['fork', 'dirty fork', 'shock', 'seal', 'leak', 'dust'], applies: { suspension: ['front', 'full'] }, critical: false,
  },
  {
    id: 'susp-air-pressure', name: 'Check the suspension air pressure', part: 'suspension', section: 'month', alsoWet: false,
    signs: 'fork or shock sinks too much, bottoms out, or feels hard',
    steps: [
      'Use a suspension pump, not a normal one; never use a compressor.',
      "Start from the maker's chart (on the fork or in the maker's app) for your weight.",
      'Squeeze the fork down through at least half its travel a few times to even out the air.',
      "Sit on the bike in gear, check sag; add air for less sag, let air out for more. Rough guide: about 25% for a rear shock; follow the maker's range.",
      'Do not squeeze the suspension with the pump on.',
    ],
    tools: 'suspension pump', minutes: [10, 10], who: 'you', why: null,
    note: "Rear shocks: start from the frame maker's chart.",
    words: ['fork', 'shock', 'air', 'sag', 'bouncy', 'too soft'], applies: { suspension: ['front', 'full'] }, critical: false,
  },
  {
    id: 'gears-cassette-wear', name: 'Check the rear gears and chainrings for wear', part: 'gears', section: 'month', alsoWet: false,
    signs: 'chain skips under load in your usual gears, even with a new chain',
    steps: [
      'Skipping in favourite gears under load points to worn gears and/or a worn chain.',
      'Check the chain first with a gauge.',
      'Look at the teeth of the rear gears for wear, and at the chainrings too.',
      'Back-pedal slowly: the chainrings should run straight, their bolts be tight and every chain link move freely.',
      'If a new chain still skips, replace the rear gears; badly worn chain, rings and rear gears are replaced together.',
    ],
    tools: 'chain wear gauge; chain whip and lockring tool to change', minutes: [10, 10], who: 'you', why: 'Yourself or shop',
    note: null,
    words: ['cassette', 'sprocket', 'skip', 'worn', 'shark teeth'], applies: { gears: ['derailleur'] }, critical: false,
  },
  {
    id: 'wheels-hubs-check', name: 'Check the wheel hubs for play', part: 'wheels', section: 'month', alsoWet: false,
    signs: 'rough or grinding wheel, side play at the axle, oil spots at the hub',
    steps: [
      'With the wheel in the bike, pull the rim side to side and feel for a knock.',
      'Take the wheel out; rock the axle up and down. A little play out of the bike with none in the frame is normal on adjustable hubs.',
      'Spin the axle and feel for roughness.',
      'Look for oil spots at the hub.',
      "Refit the wheel fully in the dropouts and close the wheel's quick release, or tighten the axle nuts; check it as before each ride.",
    ],
    tools: 'none', minutes: [5, 5], who: 'you-check', why: 'Yourself to check; shop to adjust or service (cup-and-cone hubs are adjustable; sealed cartridge hubs are replaced)',
    note: 'Wheels are critical.',
    words: ['hub', 'bearing', 'grinding', 'play', 'rough', 'wheel wobble'], applies: {}, critical: true,
  },
  {
    id: 'brakes-rotor-thickness', name: 'Check the discs for wear and wobble', part: 'brakes', section: 'month', alsoWet: false,
    signs: 'grooves, blue marks, thin edge, wobble',
    steps: [
      'Spin the wheel and check the disc runs straight.',
      'Measure with a rotor gauge or a measuring caliper (not the brake caliper).',
      'Replace at the minimum printed on the disc (often 1.5 mm for Shimano).',
      'Two-layer discs: replace the disc at once if aluminium shows.',
    ],
    tools: 'gauge, hex keys, clean gloves', minutes: [10, 10], who: 'you-check', why: 'Yourself to check; shop to replace',
    note: 'Brakes are critical. Never touch the disc or pads with your fingers.',
    words: ['rotor', 'disc', 'thin', 'worn disc', 'wobble'], applies: { brakes: ['cable-disc', 'hydraulic-disc'] }, critical: true,
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
    id: 'susp-lowers-service', name: 'Service the fork lower legs', part: 'suspension', section: 'half-year', alsoWet: false,
    signs: 'fork feels gritty, leaks oil, or has 50+ hours',
    steps: [
      'Wipe the legs; check for oil leaks.',
      'Lower-leg service: new oil and seals, usually at a shop.',
      'RockShox: about every 50 riding hours. Fox: see the full fork service.',
    ],
    tools: 'shop tools', minutes: null, who: 'shop', why: 'Shop (needs fork tools, correct oil and seals)',
    note: 'About 1-2 hours.',
    words: ['fork', 'lowers', 'leaking', 'gritty', 'service'], applies: { suspension: ['front', 'full'] }, critical: false,
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
    words: ['internal hub', 'alfine', 'nexus', 'rohloff', 'oil change', 'hub gears', 'slipping'], applies: { gears: ['hub'] }, critical: false,
    soft: { applies: { shifting: ['cable', 'electronic'] }, tag: 'If your hub has gears' },
  },
  {
    id: 'gears-cables-replace', name: 'Replace the gear cables and casing', part: 'gears', section: 'half-year', alsoWet: false,
    signs: 'sticky shifting that cleaning does not fix; rust or fraying',
    steps: [
      'Shift to the smallest gears and free the old cable at the derailleur.',
      'Remove the old cable from the shifter (the access differs by brand).',
      'Fit the new cable and casing; tighten the clamp bolt firmly (about 5 Nm).',
      'Cut the end to about 3 cm, cap it, then set the limit screws and indexing.',
    ],
    tools: 'cable cutters, hex keys, new cable and casing', minutes: [40, 40], who: 'you', why: 'Yourself or shop',
    note: 'Replace the casing with the cable.',
    words: ['cable', 'replace', 'stiff', 'sticky shift'], applies: { shifting: ['cable'] }, critical: false,
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
  {
    id: 'susp-shock-service', name: 'Full shock service', part: 'suspension', section: 'half-year', alsoWet: false,
    signs: '20 riding hours, 50-200 riding hours by part, or 6 months',
    steps: [
      'Every 20 riding hours, clean the shock shaft and look for oil at its seal.',
      'Have the suspension checked at a shop every 6 months.',
      'RockShox: air can about 50 h; full damper service about 200 h by model.',
      'Fox: about 100 h.',
      "Check the maker's chart; whichever comes first.",
    ],
    tools: 'shop tools', minutes: null, who: 'you-check', why: 'Yourself to check every 20 h; shop to service',
    note: 'The shop service takes about 1-2 hours.',
    words: ['shock', 'rear shock', 'rockshox', 'fox', 'service'], applies: { suspension: ['full'] }, critical: false,
  },
  {
    id: 'ebike-service', name: 'Motor, software and battery service', part: 'ebike', section: 'half-year', alsoWet: false,
    signs: "error codes, range drop, or the dealer's date has come",
    steps: [
      'First dealer check about 4 weeks or 300 km after purchase.',
      "Get the maker's software updates every 6 months.",
      'Other dealer checks: the dealer sets the date by distance and/or time.',
      'The dealer runs diagnostics and updates software for all parts.',
      'Keep the charger and plugs dry.',
    ],
    tools: 'dealer software', minutes: null, who: 'shop', why: 'Shop (needs maker software; do not open the motor or battery)',
    note: 'About 1 hour.',
    words: ['ebike service', 'motor', 'update', 'diagnostic', 'battery test'], applies: { ebike: ['yes'] }, critical: false,
  },
  {
    id: 'brakes-cable-disc-service', name: 'Adjust and re-align the cable disc brakes', part: 'brakes', section: 'year', alsoWet: false,
    signs: 'lever pulls far, rubbing, weak braking',
    steps: [
      'Check cable and casing for rust, dirt and fraying; replace if worn.',
      'As pads wear, turn the pad adjuster knobs, not the barrel adjuster.',
      'Loosen the caliper bolts, squeeze the lever and hold it, then tighten the bolts to the torque printed on the caliper. Without a torque wrench, tighten them evenly until the caliper no longer moves. Test the brake before riding.',
      'Spin the wheel; tweak the adjusters a quarter turn until no rub.',
    ],
    tools: 'hex keys, cable cutters, torque wrench', minutes: [30, 30], who: 'you', why: 'Yourself or shop',
    note: 'Brakes are critical; a mistake can cause a crash.',
    words: ['cable brake', 'mechanical disc', 'rubbing', 'weak', 'adjust'], applies: { brakes: ['cable-disc'] }, critical: true,
  },
  {
    id: 'belt-tension', name: 'Check belt tension', part: 'chain', section: 'year', alsoWet: false,
    signs: 'belt skips or hums, wheel or tensioner was moved',
    steps: [
      "Use the maker's tension gauge or app.",
      'Adjust to the green zone.',
      'Retighten the axle and tensioner bolts to the torque printed on the frame or hub; check the wheel sits straight in the frame.',
    ],
    tools: 'tension gauge, hex keys, torque wrench', minutes: [15, 15], who: 'you', why: 'Yourself with gauge or shop',
    note: 'A belt does not stretch like a chain, so re-tension only after a change. Yearly or before long trips.',
    words: ['belt', 'tension', 'skipping', 'krikit', 'hum'], applies: { drive: ['belt'] }, critical: true,
  },
  {
    id: 'frame-torque-check', name: 'Re-torque the key bolts', part: 'frame', section: 'year', alsoWet: false,
    signs: 'after a crash or a year; creaks',
    steps: [
      'Look up the number printed on each part.',
      'Torque stem, handlebar, seatpost, brake and wheel bolts.',
      'Carbon parts: never without a torque wrench, at the number printed on the part (often about 4-6 Nm, but follow the part).',
      'Disc bolts: first turn them all in loosely, then tighten them to the torque in a star pattern, across the disc, so the disc is not damaged.',
    ],
    tools: 'torque wrench', minutes: [20, 20], who: 'you', why: 'Yourself with a torque wrench, or a shop',
    note: 'Stem, handlebar and steerer bolts are critical.',
    words: ['torque', 'bolts', 'creak', 'carbon', 'stem'], applies: {}, critical: true,
  },
  {
    id: 'wheels-true-tension', name: 'True the wheels and check spoke tension', part: 'wheels', section: 'year', alsoWet: false,
    signs: 'wobble, pulsing brakes, loose spokes',
    steps: [
      'Check the wheel sits centred in the fork or frame first.',
      'Spin the wheel past a fixed pointer held still at the brake (a rubber band or zip tie holds it) and chalk-mark where the rim touches.',
      'Loose spokes near the mark flex more than the others; spokes on the other side pull against them, so adjust both sides.',
      'Adjust spokes in quarter turns or less, two or three at a time so the tension stays even; tighten rather than loosen where you can. Spokes break easily, so turn the nipples with care.',
      'Aim for side-to-side wobble about 0.5 mm or less and up-and-down about 1 mm or less; check spoke tension with a tension meter.',
      'A bent rim or repeatedly breaking spokes: new rim or wheel.',
    ],
    tools: 'spoke key that fits the nipples, truing stand, chalk, tension meter', minutes: [30, 30], who: 'shop', why: 'Shop (needs a stand and tension meter; wheels are critical)',
    note: 'Wheels are critical; a bad job can cause a crash.',
    words: ['wheel true', 'wobble', 'wobbly', 'spoke', 'tension', 'bent rim'], applies: {}, critical: true,
  },
  {
    id: 'brakes-hydraulic-bleed', name: 'Bleed the hydraulic brakes', part: 'brakes', section: 'notice', alsoWet: false,
    signs: 'spongy lever, lever pulls to the bar',
    steps: [
      'Use the fluid named on the lever or caliper.',
      'Shimano uses mineral oil, SRAM uses DOT fluid; never mix.',
      'Fit the bleed block and bleed with the right kit.',
    ],
    tools: 'bleed kit, fluid, gloves', minutes: [45, 45], who: 'shop', why: 'Shop (needs a bleed kit; brakes are critical, a mistake can cause a crash)',
    note: 'The time is for one brake.',
    words: ['bleed', 'spongy', 'soft brake', 'brake fluid', 'air in brake'], applies: { brakes: ['hydraulic-disc'] }, critical: true,
  },
  {
    id: 'brakes-squeal', name: 'Fix squealing brakes', part: 'brakes', section: 'notice', alsoWet: false,
    signs: 'squeal or screech when braking',
    steps: [
      'Disc: spray disc-brake cleaner on a clean rag, not on the pads, and wipe the disc; check pads for oil.',
      'Oily pads: replace them.',
      'Disc: check the caliper and disc bolts are tight to the stated torque; loose bolts cause squeal and judder.',
      'Rim: wipe rim and pads, toe the pads in slightly, then tighten the pad bolt to the torque printed on the brake.',
      'Test before riding.',
    ],
    tools: 'brake cleaner, clean rag, clean gloves, hex keys, torque wrench', minutes: [15, 15], who: 'you', why: 'Yourself or shop',
    note: 'Brakes are critical. Never touch the disc or pads with your fingers.',
    words: ['squeal', 'screech', 'noisy brakes', 'squeak'], applies: { brakes: ['rim', 'cable-disc', 'hydraulic-disc'] }, critical: true,
  },
  {
    id: 'brakes-spongy', name: 'Fix a spongy brake', part: 'brakes', section: 'notice', alsoWet: false,
    signs: 'lever feels soft and goes to the bar',
    steps: [
      'Check pads are not worn out.',
      'Check for fluid leaks.',
      'Bleed the brake, or take it to a shop.',
    ],
    tools: 'bleed kit', minutes: null, who: 'shop', why: 'Shop (needs a bleed kit; brakes are critical, a mistake can cause a crash)',
    note: 'Do not ride until fixed.',
    words: ['spongy', 'soft lever', 'air', 'bleed'], applies: { brakes: ['hydraulic-disc'] }, critical: true,
  },
  {
    id: 'chain-replace', name: 'Replace a worn chain', part: 'chain', section: 'notice', alsoWet: false,
    signs: 'gauge says worn, or the chain slips',
    steps: [
      'Note the chain length and path; it must reach round the biggest chainring and biggest rear gear. A chain that is too long can jump off the chainring.',
      'Remove the old chain; thread the new one through the front derailleur, over a chainring, onto the smallest rear gear and through the rear derailleur, round the top jockey wheel one way and the bottom one the other.',
      "Join it with a quick link, or with the maker's joining pin and a chain tool; Shimano chains need their own hardened pin.",
      'Flex the joined link sideways: a stiff link makes the chain jump on the rear gears; lube and flex it until it moves freely.',
      'Replace with the same speed count.',
    ],
    tools: 'chain tool, quick link pliers', minutes: [20, 20], who: 'you', why: 'Yourself or shop',
    note: 'Change the chain on time to save the gears.',
    words: ['new chain', 'skip', 'worn', 'stretch'], applies: { drive: ['chain'] }, critical: false,
  },
  {
    id: 'chain-deep-clean', name: 'Deep-clean the drivetrain', part: 'chain', section: 'notice', alsoWet: false,
    signs: 'gritty chain, rear gears caked, sticky shifting',
    steps: [
      'Remove the chain with a quick link, or clean it in place.',
      'Scrub chain, gears and chainrings with degreaser and brush; keep degreaser off brake discs, pads and rims.',
      'Rinse and dry fully.',
      'If you took the chain off, rejoin it and flex the link as in "Replace a worn chain" steps 3-4.',
      'Then lube the chain.',
    ],
    tools: 'degreaser, brush, quick link pliers', minutes: [30, 30], who: 'you', why: null,
    note: null,
    words: ['clean chain', 'degrease', 'gritty', 'dirty drivetrain'], applies: { drive: ['chain'] }, critical: false,
  },
  {
    id: 'gears-indexing', name: 'Fix gears that shift badly', part: 'gears', section: 'notice', alsoWet: false,
    signs: 'slow shift, noise, skips between gears',
    steps: [
      'Shift to the smallest rear gear. Turn the barrel adjuster in small clicks while you test every gear: if the chain jumps past a gear, turn it clockwise; if it shifts too slowly, anticlockwise.',
      'Check the hanger is straight.',
      'Check for dirt or a stuck cable; casing must be gear casing, not brake casing, with all end caps. A worn cable is replaced before adjusting.',
      'Check the cassette lockring is tight and the limit screws are set: the H screw puts the top jockey wheel right under the smallest rear gear, the L screw right under the biggest, so the derailleur cannot go past it.',
      'On the biggest rear gear, the top jockey wheel sits close to the gears but does not touch them; the angle screw sets this.',
      'Worn derailleur pivots or a broken shifter: replace.',
    ],
    tools: 'hex keys, small screwdriver', minutes: [15, 15], who: 'you', why: 'Yourself or shop',
    note: 'A bent hanger needs a shop.',
    words: ['skip', 'ghost shift', 'noisy gears', 'adjust gears', 'hanger', 'limit screw'], applies: { gears: ['derailleur'], shifting: ['cable'] }, critical: false,
  },
  {
    id: 'wheels-wobble', name: 'Fix a wobbly wheel', part: 'wheels', section: 'notice', alsoWet: false,
    signs: 'rim hits the brake or frame; wheel is bent',
    steps: [
      'Check the wheel is fitted straight in the dropouts.',
      'Check the tyre bead sits evenly on the rim; if not, let the air out, seat it, pump up.',
      'Look for a loose or broken spoke.',
      'Do not ride if the rim rubs hard.',
      'If spoke tweaks do not remove the wobble, the rim is probably bent: new rim.',
    ],
    tools: 'spoke key', minutes: null, who: 'shop', why: 'Shop (wheels are critical; needs a stand and spoke feel)',
    note: 'Wheels are critical; a failure can cause a crash.',
    words: ['wobble', 'bent rim', 'loose spoke', 'true'], applies: {}, critical: true,
  },
  {
    id: 'tyres-replace', name: 'Replace worn tyres', part: 'tyres', section: 'notice', alsoWet: false,
    signs: 'tread worn down, cracks in the sidewalls',
    steps: [
      'Buy the same tyre size; check the tube is undamaged and the valve straight, and the rim tape covers every spoke hole (replace it if not).',
      "Fit one side of the tyre onto the rim, pushing the bead into the rim's centre well all round.",
      'Put a little air in the tube so it holds its shape; push the valve straight through the rim hole and tuck the tube in, working away from the valve both ways, with no twists or kinks.',
      'Push the second side on, starting at the valve and finishing opposite it, without pinching the tube; use levers only if needed.',
      'Let the air out, squeeze the sides of the tyre together all round and look that no tube is caught under the bead.',
      "Pump to the pressure on the sidewall, then refit the wheel fully in the dropouts and close the wheel's quick release, or tighten the axle nuts; check it as before each ride.",
    ],
    tools: 'tyre levers, pump, rim tape if needed', minutes: [20, 20], who: 'you', why: null,
    note: null,
    words: ['worn tyre', 'cracked', 'bald', 'tread', 'flats', 'rim tape'], applies: {}, critical: false,
  },
  {
    id: 'frame-creak', name: 'Find a creak', part: 'frame', section: 'notice', alsoWet: false,
    signs: 'creaks when pedalling or standing',
    steps: [
      'Check the pedals, the crank bolts and the seatpost.',
      'Clean and grease threads and the seatpost; on a carbon post or frame use carbon assembly paste instead of grease.',
      'Re-torque with a wrench at the number printed on each part. Carbon parts: never without a torque wrench.',
    ],
    tools: 'grease or carbon assembly paste, hex keys, torque wrench', minutes: [30, 30], who: 'you', why: 'Yourself or shop',
    note: 'Stem and bar bolts are critical.',
    words: ['creak', 'click', 'noise', 'crunch', 'pedalling'], applies: {}, critical: true,
  },
  {
    id: 'ebike-range-drop', name: 'Investigate lost range', part: 'ebike', section: 'notice', alsoWet: false,
    signs: 'range falls, power cuts, or battery warm',
    steps: [
      'Check tyre pressure and brake rub.',
      'Check battery contacts and charge fully.',
      'Try a full charge from room temperature.',
      'Still low: book a battery test.',
    ],
    tools: 'charger', minutes: null, who: 'shop', why: 'Shop (battery test needs maker tools)',
    note: null,
    words: ['range', 'battery', 'ebike', 'power', 'weak'], applies: { ebike: ['yes'] }, critical: false,
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
      'Take the wheel off; let out remaining air. Hydraulic disc brakes: do not squeeze the brake lever while the wheel is out.',
      "Squeeze the tyre's edges into the dip in the middle of the rim all round; then pry one tyre bead off with levers: hook the first lever on a spoke, then run a second lever round the rim. Do not catch the tube.",
      'Pull the tube out and find the hole: pump it up and listen; for a tiny hole, hold the tube near your lips to feel the air.',
      'Feel inside the tyre for the thorn or glass and remove it; look at the matching spot on the tube. Two side-by-side slits mean the tube was pinched against the rim.',
      "To patch: roughen an area a bit bigger than the patch with the sandpaper, spread glue and wait about 30-60 seconds until it is tacky, not wet; press the patch on from the middle outwards; dust it with the kit's chalk. Light plastic (TPU) tubes need the patches made for them; ordinary glue patches do not hold.",
      'Before refitting, run your fingers round the inside of the tyre and the rim again and remove any grit or small stones.',
      'Fit the new or patched tube with a little air in it, valve straight through the rim; seat the tyre, squeeze its sides to check no tube is caught under the bead, pump up. Disc brakes: guide the disc between the pads as the wheel goes back in.',
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
      'Still leaking: fit a spare tube. First take out the tubeless valve and any plug with a metal tip, which can hole the tube.',
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
      'Join the ends with a quick link made for your chain: the same speed count and, for a SRAM Flattop or T-Type chain, its own kind of link.',
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
      "Bend the broken spoke gently around the next one, or tape it to it, so it can't catch. Spokes are thin steel and bend by hand. If it broke at the hub, pull it out.",
      "Rim brakes: if the rim rubs, open the brake's quick release (on rim brakes), not the wheel's. Until you close it again, this brake works much less: ride slowly and use the other brake.",
      'Disc brakes: the brake needs no opening. Spin the wheel: if the rim touches the frame or the fork, ride slowly.',
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
      'Check the pad is not touching the tyre or spokes.',
      'If it still rubs on one side, centre the brake: on a road caliper, turn its small centring screw a little; on a V-brake, the spring screw on the side of one arm. If it still rubs, ride on gently and have it seen to at a shop.',
      "Rim bent and still rubbing: open the brake's quick release only if you must and ride slowly. Until you close it again, this brake works much less: ride slowly and use the other brake.",
      "Close the brake's quick release once the wheel is fixed.",
    ],
    rideOn: 'Fine if light rub. Walk if the wheel is bent or the brake will not stop you.',
    carry: ['carry-multi-tool'],
    words: ['brake rub', 'rubbing', 'scraping', 'rim brake'], critical: true,
  },
  {
    id: 'brake-rub-disc', problem: 'Disc brake rubbing', part: 'brakes', applies: { brakes: ['cable-disc', 'hydraulic-disc'] },
    checkFirst: 'Is the wheel seated all the way? Is the disc bent or loose? Any play in the hub? Was the lever squeezed while the wheel was out?',
    steps: [
      "Undo the thru-axle or the wheel's quick release, push the wheel fully into the dropouts, and tighten it again firmly.",
      'Spin the wheel and look at the pad gaps.',
      'Loosen both caliper bolts a little, squeeze the lever and hold it, then tighten the bolts to the torque printed on the caliper. Without a torque wrench, tighten them evenly until the caliper no longer moves. Test the brake before riding.',
      'Release, spin; if it still rubs, nudge the caliper away from the rub.',
      'Cable brakes: turn the pad adjuster on the rubbing side a quarter turn out, to move that pad away from the disc.',
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
      'Cable brakes: unscrew the barrel adjuster a turn or two to pull the cable tighter.',
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
      'Cable: turn the pad adjuster in a little (some brakes have one on each side, a knob or a hex bolt), not the barrel adjuster.',
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
      'Cable gears: turn the barrel adjuster a click at a time. Electronic gears have no cable: check the shifting battery instead.',
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
      'Tighten to the torque printed on the part, with a torque wrench. Without one, tighten the bolts evenly, a little at a time, until the part no longer moves in the twist test. Carbon parts: never without a torque wrench.',
      'Re-check after a short ride.',
    ],
    rideOn: 'Only once the part no longer moves in the twist test. Have the torque checked at the next shop. A carbon part you could not torque: ride gently to a shop, or walk if it still moves. Stop if a stem, bar or steerer bolt will not tighten. Critical.',
    carry: ['carry-multi-tool'],
    words: ['loose', 'rattle', 'noise', 'bolt', 'carbon'], critical: true,
  },
  {
    id: 'tyre-torn', problem: 'Torn tyre (needs a boot)', part: 'tyres', applies: { tyres: ['tubes', 'tubeless'] },
    checkFirst: 'How big is the cut? Is the tube bulging?',
    steps: [
      'Remove the wheel and the tube. Tubeless: take out the tubeless valve and any plug with a metal tip, and wipe the sealant off round the cut.',
      'Put a boot (or a strong patch) inside, covering the cut.',
      'Fit a tube and pump to low pressure first.',
      'Check for bulging, then pump to a lower pressure than normal.',
    ],
    rideOn: 'Fine to ride slowly if the boot holds. Walk if the tyre bulges.',
    carry: ['carry-tyre-boot', 'carry-spare-tube', 'carry-tyre-levers', 'carry-pump', 'carry-cloth'],
    words: ['cut tyre', 'sidewall', 'hole', 'boot', 'bulge'], critical: false,
  },
  {
    id: 'ebike-no-power', problem: "E-bike won't power on", part: 'ebike', applies: { ebike: ['yes'] },
    checkFirst: 'Battery charged? Battery seated and clicked in?',
    steps: [
      'Switch the system off, then remove the battery and refit it until it clicks; lock it with the key if it has one. A battery that only comes out with tools stays in.',
      'Wipe the contacts with a dry cloth.',
      "Switch on with the battery's own button if it has one; on some newer bikes the main button is on the handlebar remote or the top tube.",
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
  { id: 'carry-quick-link', name: 'Quick link for your chain (right speed and make; most 12-speed links are for one use only)', applies: { drive: ['chain'] } },
  { id: 'carry-chain-tool', name: 'Chain tool (or multi-tool with one)', applies: { drive: ['chain'] } },
  { id: 'carry-multi-tool', name: 'Multi-tool (hex keys, screwdriver) that fits the bolts on your bike', applies: {} },
  { id: 'carry-zip-ties', name: 'Zip ties or tape', applies: {} },
  { id: 'carry-spoke-key', name: 'Spoke key', applies: {} },
  { id: 'carry-cloth', name: 'Clean cloth or rag', applies: {} },
  { id: 'carry-charger', name: 'Charger (for long trips)', applies: { ebike: ['yes'] } },
];

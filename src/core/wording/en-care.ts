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
  careRoadLater: 'Roadside repairs come in the next version.',
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
    // Hub gears with a shifter: a single speed (stored as chain-hub or belt, shifting none) has no hub gear oil (review of PR 58, M2).
    words: ['internal hub', 'alfine', 'nexus', 'oil change', 'hub gears', 'slipping'], applies: { gears: ['hub'], shifting: ['cable', 'electronic'] }, critical: false,
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

/** The Roadside repairs cards: group 3 (Task 6). */
export const ROAD_CARDS: RoadCard[] = [];
/** What to carry: group 3 (Task 7). */
export const CARRY: CarryItem[] = [];

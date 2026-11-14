// The Bike finder's words (design of 14 November 2026), in its own chunk: neither the first screen nor the Tools chunk carries them (the
// card's two lines are in en-finder-link.ts). Types only, never brands, models or prices. Short on purpose: the chunk has a share of the lazy
// total. Under the banned-words test (tests/unit/core/finder/rank.test.ts).
import type { AnswerKey, FinderType, Question, QUESTIONS } from '../finder/rank.ts';

export const FN = {
  title: 'Find a bike type',
  intro: 'Five questions, then the bike types that fit and what to look for. Types only, never brands or models.',
  show: 'Show bike types',
  left: (n: number): string => (n === 1 ? '1 question left.' : `${n} questions left.`),
  updated: 'The bike types are updated for your answers.',
  again: 'Start again',
  results: 'Bike types for your answers',
  order: 'Best fit first.',
  why: 'Why it fits',
  mind: 'Keep in mind:',
  look: 'Look for',
  learn: 'See its parts in How a bike is built',
  frame: 'Frame size: check each maker\'s size chart.',
  add: 'Add your bike in Bike details',
  addAfter: 'once you have one.',
};

export const FN_QUESTIONS: Readonly<Record<Question, string>> = {
  rides: 'What will you mostly ride?',
  ground: 'On what ground?',
  carry: 'How much will you carry?',
  pace: 'Speed or comfort?',
  motor: 'Would you like a motor (an e-bike)?',
};

export const FN_ANSWERS: { readonly [Q in Question]: Readonly<Record<(typeof QUESTIONS)[Q][number], string>> } = {
  rides: { day: 'Day rides for fun or fitness', commute: 'Commuting and errands', touring: 'Touring with a rack and panniers', bikepacking: 'Bikepacking off-road' },
  ground: { paved: 'Paved roads', mixed: 'Paved and gravel', gravel: 'Gravel and easy trails', trails: 'Rough trails', soft: 'Sand or snow' },
  carry: { little: 'Little: a phone, a jacket', day: 'A day\'s kit', days: 'Kit for several days' },
  pace: { speed: 'Speed first', balance: 'A balance', comfort: 'Comfort first' },
  motor: { yes: 'Yes', no: 'No', unsure: 'Not sure' },
};

export const FN_TYPES: Readonly<Record<FinderType, string>> = {
  road: 'Road bike', gravel: 'Gravel bike', touring: 'Touring bike', city: 'City bike', mtb: 'Mountain bike, hardtail',
  full: 'Mountain bike, full suspension', fat: 'Fat bike', ebike: 'E-bike',
};

const NIMBLE = 'Little to carry keeps it light and nimble.';
const RACK_DAY = 'A rack takes a day\'s kit.';
const WIDE_MIXED = 'Wide tyres handle paved and gravel roads.';
const PAVED = 'Rolls well on paved roads.';
const GRAVEL = 'Handles gravel and easy trails.';
const DAYS = 'Room for kit for several days.';
const BALANCE = 'A good balance of speed and comfort.';

/** Why a type fits, for each answer that counts for it (every positive point in the table has its line). */
export const FN_WHY: Readonly<Record<AnswerKey, Partial<Record<FinderType, string>>>> = {
  'rides:day': {
    road: 'Light and quick for day rides.', gravel: 'Fun on day rides, on and off road.', city: 'Relaxed for an easy day out.',
    mtb: 'A fun day out off-road.', full: 'A fun day out off-road.', ebike: 'Longer day rides with less effort.',
  },
  'rides:commute': {
    road: 'Quick for commuting.', gravel: 'Quick for commuting.', touring: 'Sturdy for daily commuting.',
    city: 'Built for commuting: upright, often with mudguards, a rack and lights.', ebike: 'The motor takes the effort out of commuting.',
  },
  'rides:touring': {
    gravel: 'Can tour with a rack, where it has the mounts.', touring: 'Built for touring with a rack and panniers.',
    mtb: 'Strong enough to tour; some have rack mounts.', ebike: 'The motor helps with a loaded bike.',
  },
  'rides:bikepacking': {
    gravel: 'Room for a frame bag, a seat pack and a bar bag.', touring: 'Sturdy enough for bikepacking on easy tracks.',
    mtb: 'Made for bikepacking on rough tracks.', full: 'Copes with rough trails when bikepacking.', fat: 'Bikepacking on sand, snow and soft ground.',
  },
  'ground:paved': {
    road: 'Narrow tyres roll fast on paved roads.', gravel: PAVED, touring: PAVED, city: 'Made for paved streets and paths.', ebike: PAVED,
  },
  'ground:mixed': {
    gravel: 'Made for paved and gravel roads alike.', touring: WIDE_MIXED, city: 'Copes with smooth gravel paths.',
    mtb: GRAVEL, ebike: WIDE_MIXED,
  },
  'ground:gravel': {
    gravel: 'Made for gravel and easy trails.', touring: GRAVEL, mtb: GRAVEL, full: GRAVEL,
  },
  'ground:trails': {
    mtb: 'Made for trails: grippy tyres and a suspension fork.', full: 'Made for rough trails: suspension front and back.',
    fat: 'Very wide tyres grip on rough trails.',
  },
  'ground:soft': { mtb: 'Wide tyres help on firm sand and snow.', fat: 'Made for sand and snow: very wide tyres.' },
  'carry:little': { road: NIMBLE, city: 'A basket or rack takes what you carry.', mtb: NIMBLE, full: NIMBLE },
  'carry:day': { gravel: 'Bags on its mounts take a day\'s kit.', touring: RACK_DAY, city: RACK_DAY, ebike: RACK_DAY },
  'carry:days': {
    gravel: DAYS, touring: 'Carries kit for days on front and rear racks.', mtb: DAYS, fat: DAYS, ebike: 'The motor helps carry kit for days.',
  },
  'pace:speed': { road: 'The fastest type on paved roads.', gravel: 'Quick, with drop bars.' },
  'pace:balance': {
    road: BALANCE, gravel: BALANCE, touring: BALANCE, city: BALANCE, mtb: BALANCE, ebike: BALANCE,
  },
  'pace:comfort': {
    gravel: 'Wide tyres smooth rough roads.', touring: 'Comfortable over long days.', city: 'Upright and relaxed.',
    mtb: 'A suspension fork smooths the bumps.', full: 'Suspension front and back: the most comfortable off-road.',
    fat: 'Big soft tyres smooth the bumps.', ebike: 'Upright, and the motor takes the hills.',
  },
  'motor:yes': { ebike: 'You want a motor: it helps on hills, with loads and into the wind.' },
  'motor:unsure': { ebike: 'A test ride shows what a motor adds.' },
};

/** The one Keep in mind line: the answer that counts most against a listed type (every negative point in the table has its line). */
export const FN_MIND: Readonly<Record<AnswerKey, string>> = {
  'rides:commute': 'Heavier and slower for trips in town.',
  'rides:touring': 'Rack mounts are rare on this type.',
  'rides:bikepacking': 'Less suited to rough tracks with bags.',
  'ground:paved': 'Knobbly tyres roll slower on paved roads.',
  'ground:mixed': 'Very wide tyres roll slower on paved parts.',
  'ground:gravel': 'Less suited to loose gravel and trails.',
  'ground:trails': 'Rough trails want more grip and suspension.',
  'ground:soft': 'Sand and snow want wider tyres.',
  'carry:little': 'Heavier than you need for little kit.',
  'carry:days': 'Little room for racks or big bags.',
  'pace:speed': 'Heavier and slower than sportier types.',
  'pace:comfort': 'A low, stretched position.',
};

/** Each line's label, by its key in lookFor (rank.ts). */
export const FN_LOOK_LABEL = {
  tyres: 'Tyres', mounts: 'Mounts', mountsDays: 'Mounts', gears: 'Gears', brakes: 'Brakes', suspension: 'Suspension', motor: 'Motor', motorToo: 'Motor',
} as const;

export type LookWords = { tyres: string; mounts: string; mountsDays: string; gears: string; brakes: string; suspension?: string; motor?: string; motorToo?: string };

const DISC = 'Disc brakes.';
const HYDRAULIC = 'Hydraulic disc brakes.';
const ONE_BY = 'One chainring, a wide cassette.';

/** What to look for on each type. Tyre widths in mm (and inches where riders meet them so); no models or brands. */
export const FN_LOOK: Readonly<Record<FinderType, LookWords>> = {
  road: {
    tyres: '25–32 mm.', mounts: 'Two bottle mounts; mudguard mounts for wet days.', mountsDays: 'Rack mounts are rare: check for them.',
    gears: 'Two chainrings or a wide cassette for hills.', brakes: 'Disc or rim; discs stop better in the wet.',
  },
  gravel: {
    tyres: '38–50 mm, room for wider.', mounts: 'Bottle and mudguard mounts.', mountsDays: 'Rack and fork cage mounts, room for a frame bag.',
    gears: 'Low gears for climbs.', brakes: DISC,
  },
  touring: {
    tyres: '35–50 mm, sturdy for a load.', mounts: 'Rack, mudguard and bottle mounts.', mountsDays: 'Mounts for front and rear racks.',
    gears: 'A wide range with very low gears.', brakes: 'Strong brakes for a loaded bike.',
  },
  city: {
    tyres: '35–47 mm, often with puncture protection.', mounts: 'A rack, mudguards and lights, often fitted.', mountsDays: 'A sturdy rack for panniers.',
    gears: 'Hub gears: little care.', brakes: 'Rim, roller or disc brakes.',
  },
  mtb: {
    tyres: '2.2–2.6 inch (about 56–66 mm).', mounts: 'A bottle mount inside the frame.', mountsDays: 'Room for a frame bag; fork cage mounts.',
    gears: ONE_BY, brakes: HYDRAULIC, suspension: 'A fork with about 100–140 mm of travel.',
  },
  full: {
    tyres: '2.3–2.6 inch (about 58–66 mm).', mounts: 'A bottle mount inside the frame, where it has room.',
    mountsDays: 'Little room for a frame bag: check the frame.', gears: ONE_BY, brakes: HYDRAULIC, suspension: 'A fork and a rear shock.',
  },
  fat: {
    tyres: '3.8–5 inch (about 97–127 mm).', mounts: 'Bottle mounts; fork cargo mounts on many.', mountsDays: 'Fork cargo mounts, room for a frame bag.',
    gears: 'Low gears for soft ground.', brakes: DISC,
  },
  ebike: {
    tyres: '40–55 mm.', mounts: 'A rack and mudguards, often fitted.', mountsDays: 'A sturdy rack: check its load limit.',
    gears: 'Hub or derailleur gears.', brakes: 'Hydraulic disc brakes for the weight.', motor: 'At the cranks for hills; a battery for your longest day.',
  },
};

/** With a motor wanted, every other type says it is also made with one. */
export const FN_MOTOR_TOO = 'This type is also made with a motor.';

// The Bike finder's words (design of 14 November 2026), in its own chunk: neither the first screen nor the Tools chunk carries them (the
// card's two lines are in en-finder-link.ts). Types only, never brands, models or prices. Under the banned-words test
// (tests/unit/core/finder/rank.test.ts).
import type { AnswerKey, FinderType, Question, QUESTIONS } from '../finder/rank.ts';

export const FN = {
  title: 'Find a bike type',
  intro: 'Five quick questions, then the bike types that fit your riding and what to look for. Types only, never brands or models.',
  show: 'Show bike types',
  left: (n: number): string => `${n} ${n === 1 ? 'question' : 'questions'} left: answer ${n === 1 ? 'it' : 'them'} to see the bike types.`,
  updated: 'The bike types are updated for your answers.',
  again: 'Start again',
  results: 'Bike types for your answers',
  order: 'Best fit first.',
  why: 'Why it fits',
  mind: 'Keep in mind:',
  look: 'Look for',
  learn: 'See its parts in How a bike is built',
  frame: 'Frame size depends on each maker\'s size chart: check it for the bike you look at.',
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

/** Why a type fits, for each answer that counts for it (every positive point in the table has its line). */
export const FN_WHY: Readonly<Record<AnswerKey, Partial<Record<FinderType, string>>>> = {
  'rides:day': {
    road: 'Light and quick: made for day rides for fun or fitness.', gravel: 'Fun on day rides, on roads and off them.',
    city: 'Relaxed for an easy day out.', mtb: 'A fun day out, most of all off-road.', full: 'A fun day out on trails.',
    ebike: 'Longer day rides with less effort.',
  },
  'rides:commute': {
    road: 'Quick for commuting on roads.', gravel: 'Quick and sturdy for commuting, often with mudguard mounts.',
    touring: 'Sturdy for daily commuting, with mounts for a rack and mudguards.',
    city: 'Built for commuting: upright, usually with mudguards, a rack and lights fitted.',
    ebike: 'The motor takes much of the effort out of commuting.',
  },
  'rides:touring': {
    gravel: 'Can tour with a rack where it has the mounts.', touring: 'Built for touring with a rack and panniers.',
    mtb: 'Strong enough for touring; some have rack mounts.', ebike: 'Many come with a rack, and the motor helps with a loaded bike.',
  },
  'rides:bikepacking': {
    gravel: 'Made for bikepacking: room for a frame bag, a seat pack and a bar bag.', touring: 'Sturdy enough for bikepacking on easy tracks.',
    mtb: 'Made for bikepacking on rough tracks.', full: 'Copes with rough trails when bikepacking.',
    fat: 'Bikepacking on sand, snow and soft ground.',
  },
  'ground:paved': {
    road: 'Narrow tyres roll fast on paved roads.', gravel: 'Rolls well on paved roads too.',
    touring: 'Rolls smoothly on paved roads, also loaded.', city: 'Made for paved streets and paths.', ebike: 'Made for roads and paths.',
  },
  'ground:mixed': {
    gravel: 'Made for paved and gravel roads alike.', touring: 'Wide tyres handle paved and gravel roads.',
    city: 'Copes with smooth gravel paths.', mtb: 'Handles any gravel with ease.', ebike: 'Wide tyres handle paved and gravel paths.',
  },
  'ground:gravel': {
    gravel: 'Made for gravel and easy trails.', touring: 'Wide tyres handle gravel roads.', mtb: 'Grips well on gravel and trails.',
    full: 'Smooth on gravel and trails.',
  },
  'ground:trails': {
    mtb: 'Made for trails: wide, grippy tyres and a suspension fork.', full: 'Made for rough trails: suspension front and back.',
    fat: 'Very wide tyres grip on rough trails.',
  },
  'ground:soft': { mtb: 'Wide tyres help on firm sand and snow.', fat: 'Made for sand and snow: very wide tyres stay on top.' },
  'carry:little': {
    road: 'Little to carry suits a light, fast bike.', city: 'A basket or a bag on the rack takes what you carry.',
    mtb: 'Little to carry keeps it nimble.', full: 'Little to carry keeps it nimble.',
  },
  'carry:day': {
    gravel: 'Mounts for bottles and bags take a day\'s kit.', touring: 'A rack takes a day\'s kit easily.',
    city: 'A rack or basket takes a day\'s kit.', ebike: 'Usually has a rack for a day\'s kit.',
  },
  'carry:days': {
    gravel: 'Room for bags for several days, often with rack mounts.', touring: 'Carries kit for several days on front and rear racks.',
    mtb: 'Takes bikepacking bags for several days.', fat: 'Takes bags for several days; many forks have cargo mounts.',
    ebike: 'The motor helps carry kit for several days.',
  },
  'pace:speed': { road: 'The fastest type on paved roads.', gravel: 'Quick, with drop bars for a lower position.' },
  'pace:balance': {
    road: 'Some road bikes sit you more upright for long rides.', gravel: 'A good balance of speed and comfort.',
    touring: 'Steady and comfortable over long days.', city: 'Relaxed, at a steady pace.', mtb: 'A balance of speed and grip.',
    ebike: 'The motor keeps a steady pace with less effort.',
  },
  'pace:comfort': {
    gravel: 'Wide tyres smooth out rough roads.', touring: 'Comfortable over long days in the saddle.', city: 'Upright and relaxed: comfort first.',
    mtb: 'A suspension fork smooths the bumps.', full: 'Suspension front and back: the most comfortable off-road.',
    fat: 'Big soft tyres smooth out the bumps.', ebike: 'Upright, with the motor taking the strain on hills.',
  },
  'motor:yes': { ebike: 'You want a motor: it helps on hills, with loads and into the wind.' },
  'motor:unsure': { ebike: 'Not sure about a motor? A test ride shows what it adds.' },
};

/** The one Keep in mind line: the answer that counts most against a listed type (every negative point in the table has its line). */
export const FN_MIND: Readonly<Record<AnswerKey, string>> = {
  'rides:commute': 'Heavier and slower on short trips in town than an everyday bike.',
  'rides:touring': 'Rack mounts for panniers are rare on this type.',
  'rides:bikepacking': 'Less suited to rough tracks with bags.',
  'ground:paved': 'Wide, knobbly tyres roll slower on paved roads.',
  'ground:mixed': 'Very wide tyres roll slower on the paved parts.',
  'ground:gravel': 'Less suited to loose gravel and trails.',
  'ground:trails': 'Rough trails call for more grip and suspension than it has.',
  'ground:soft': 'Sand and snow call for wider tyres than it takes.',
  'carry:little': 'Heavier than you need for little kit.',
  'carry:days': 'Little room for racks or big bags for several days.',
  'pace:speed': 'Heavier and slower than the sportier types.',
  'pace:comfort': 'A low, stretched position: less relaxed than other types.',
};

export const FN_LOOK_LABEL = { tyres: 'Tyres', mounts: 'Mounts', gears: 'Gears', brakes: 'Brakes', suspension: 'Suspension', motor: 'Motor' } as const;

export type LookWords = { tyres: string; mounts: string; mountsDays: string; gears: string; brakes: string; suspension?: string; motor?: string };

/** What to look for on each type. Tyre widths in mm (and inches where riders meet them so); no models or brands. */
export const FN_LOOK: Readonly<Record<FinderType, LookWords>> = {
  road: {
    tyres: '25–32 mm, with room for wider on rough roads.', mounts: 'Two bottle mounts; mudguard mounts if you ride in the wet.',
    mountsDays: 'Rack and mudguard mounts are rare: check for them if you carry more.', gears: 'Two chainrings or a wide cassette for hills.',
    brakes: 'Disc brakes stop well in the wet; rim brakes are lighter.',
  },
  gravel: {
    tyres: '38–50 mm, with room for wider.', mounts: 'Two or three bottle mounts, and mudguard mounts.',
    mountsDays: 'Rack mounts, cage mounts on the fork and room for a frame bag.', gears: 'Low gears for climbs, often with one chainring.',
    brakes: 'Disc brakes.',
  },
  touring: {
    tyres: '35–50 mm, sturdy enough for a load.', mounts: 'Mounts for a rear rack, mudguards and three bottles.',
    mountsDays: 'Mounts for front and rear racks, mudguards and three bottles.', gears: 'A wide range with very low gears for a loaded bike.',
    brakes: 'Strong brakes for a loaded bike: disc or rim.',
  },
  city: {
    tyres: '35–47 mm, often with puncture protection.', mounts: 'A rack, mudguards and lights, often fitted.',
    mountsDays: 'A sturdy rack with room for panniers.', gears: 'Hub gears: little care, and they shift at a stop.',
    brakes: 'Rim, roller or disc brakes; discs stop best in the wet.',
  },
  mtb: {
    tyres: '2.2–2.6 inch (about 56–66 mm), knobbly.', mounts: 'A bottle mount inside the frame.',
    mountsDays: 'Room for a frame bag and cage mounts on the fork.', gears: 'One chainring with a wide cassette.',
    brakes: 'Hydraulic disc brakes.', suspension: 'A suspension fork with about 100–140 mm of travel.',
  },
  full: {
    tyres: '2.3–2.6 inch (about 58–66 mm), knobbly.', mounts: 'A bottle mount inside the frame: not every frame has one.',
    mountsDays: 'The rear shock leaves less room for a frame bag: check the space inside the frame.', gears: 'One chainring with a wide cassette.',
    brakes: 'Hydraulic disc brakes.', suspension: 'Front and back: a fork and a rear shock.',
  },
  fat: {
    tyres: '3.8–5 inch (about 97–127 mm).', mounts: 'Bottle mounts; cargo mounts on the fork on many.',
    mountsDays: 'Cargo mounts on the fork and room for a frame bag.', gears: 'Low gears for soft ground.', brakes: 'Disc brakes.',
  },
  ebike: {
    tyres: '40–55 mm.', mounts: 'A rack and mudguards, often fitted; check what the rack may carry.',
    mountsDays: 'A sturdy rack: check what it may carry.', gears: 'Hub or derailleur gears; the motor adds the rest.',
    brakes: 'Hydraulic disc brakes for the extra weight.',
    motor: 'At the cranks it uses the bike\'s gears on climbs; a battery big enough for your longest day.',
  },
};

/** With a motor wanted, every other type says it is also made with one. */
export const FN_MOTOR_TOO = 'This type is also made with a motor.';

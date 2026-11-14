// How a bike is built (design of 14 November 2026): the page's words, in its own chunk, never the first screen's. Each part's short name
// (the guide's parts keep theirs, the bike view's PART_SHORT, here as a copy a test keeps equal: importing it would add a chunk to the
// first screen's list), what it does in one or two plain sentences, the list's headings, the build's steps and
// how their parts attach. Under the banned-words test (tests/unit/core/parts/learn.test.ts).
import type { LearnGroup, LearnId, LearnKind, LearnStep, LearnTag, StepLine } from '../parts/learn.ts';
import { TAG_WORDS } from './en-parts.ts';

const NAMES: Readonly<Record<LearnId, string>> = {
  frame: 'Frame', fork: 'Fork', headset: 'Headset', stem: 'Stem', handlebar: 'Handlebar', seatpost: 'Seatpost',
  hub: 'Hub', 'wheel-qr': 'Wheel quick release', 'thru-axle': 'Thru-axle', spokes: 'Spokes', rim: 'Rim', dropouts: 'Dropouts',
  tyre: 'Tyre', bead: 'Tyre bead', tube: 'Inner tube', valve: 'Valve', 'tubeless-valve': 'Tubeless valve',
  'brake-lever': 'Brake lever', 'rim-brake': 'Rim brake', pads: 'Brake pads', 'brake-qr': 'Brake quick release', barrel: 'Barrel adjuster',
  caliper: 'Disc caliper', disc: 'Brake disc', 'pad-adjuster': 'Pad adjuster',
  chain: 'Chain', 'quick-link': 'Quick link', chainring: 'Chainring', cassette: 'Rear gears', derailleur: 'Rear derailleur',
  hanger: 'Derailleur hanger', 'gear-cable': 'Gear cable', 'hub-gears': 'Hub gears',
  battery: 'Battery', display: 'Display', stanchions: 'Fork legs',
  'head-tube': 'Head tube', 'top-tube': 'Top tube', 'down-tube': 'Down tube', 'seat-tube': 'Seat tube', chainstay: 'Chainstay',
  seatstay: 'Seatstay', shock: 'Rear shock', 'bottom-bracket': 'Bottom bracket', crank: 'Crank', pedal: 'Pedal',
  'front-derailleur': 'Front derailleur', belt: 'Belt', 'brake-cable': 'Brake cable or hose', shifter: 'Shifter', grips: 'Grips',
  'bar-tape': 'Bar tape', 'seat-clamp': 'Seat clamp', saddle: 'Saddle', motor: 'Motor',
};

/** A part's short name, for its label, its button and its heading. */
export const nameOf = (id: LearnId): string => NAMES[id];

/** What each part does, in one or two plain sentences. */
export const LN_DOES: Readonly<Record<LearnId, string>> = {
  frame: 'The main body of the bike. Every other part is fixed to it, directly or through another part.',
  'head-tube': 'The short tube at the front of the frame. The fork\'s steerer runs up through it, turning on the headset.',
  'top-tube': 'The tube from the head tube back to the seat tube. It makes the frame stiff and gives you something to lift the bike by.',
  'down-tube': 'The long tube from the head tube down to the bottom bracket. It takes the biggest loads, and on e-bikes it often holds the battery.',
  'seat-tube': 'The tube from the bottom bracket up to the saddle. The seatpost slides into its top.',
  chainstay: 'The pair of tubes from the bottom bracket back to the rear wheel. The chain runs just above the one on the right.',
  seatstay: 'The pair of tubes from the top of the seat tube down to the rear wheel. With the chainstays they hold the rear wheel in a triangle.',
  dropouts: 'The ends of the frame and the fork where the wheels\' axles sit. Each wheel has to sit all the way in, straight.',
  shock: 'The spring and damper between the frame\'s front and rear parts. It lets the rear wheel move up over bumps.',
  fork: 'The fork holds the front wheel and turns with the handlebar. Its top tube, the steerer, runs up through the head tube.',
  stanchions: 'The smooth upper legs of a suspension fork. They slide into the lower legs as the fork soaks up bumps.',
  headset: 'The two bearings at the top and bottom of the head tube. They let the fork and the handlebar turn smoothly.',
  hub: 'The middle of the wheel. It turns on bearings round the axle, and the spokes run from it to the rim.',
  'thru-axle': 'A thick axle that goes through the dropouts and the hub and screws into the far side. It holds the wheel firmly, which disc brakes need.',
  'wheel-qr': 'A thin rod through the hub with a lever. Closing the lever clamps the wheel in the dropouts, with no tools.',
  spokes: 'The thin wires between the hub and the rim. Pulled tight, they keep the wheel round and straight.',
  rim: 'The wheel\'s outer hoop. The tyre sits on it and the spokes pull on it.',
  tyre: 'The rubber cover on the rim that meets the road. Its air and tread give you grip and comfort.',
  bead: 'The tyre\'s edge on each side, with a strong wire or fibre inside. It hooks under the rim\'s edge and holds the tyre on.',
  tube: 'The rubber ring inside the tyre that holds the air. Tubeless tyres hold the air themselves and have none.',
  valve: 'Where the air goes in. It comes through a hole in the rim, from the tube.',
  'tubeless-valve': 'A valve fixed in the rim on its own, for a tyre with no tube. A rubber base seals it against the rim.',
  'bottom-bracket': 'The bearings inside the frame\'s lowest point. The cranks turn on them.',
  crank: 'The arm from the bottom bracket to the pedal, one on each side. It turns your push on the pedal into a turn of the chainring.',
  pedal: 'Where your feet push. It screws into the end of the crank and turns on its own bearings.',
  chainring: 'The toothed ring fixed to the right crank. It pulls the chain round as you pedal.',
  'front-derailleur': 'It pushes the chain from one chainring to the other as you shift. It clamps to the seat tube just above the chainrings.',
  chain: 'The chain carries your pedalling from the chainring to the rear wheel. It needs oil and, in time, a new chain.',
  'quick-link': 'A chain link that opens and closes by hand. It joins the chain\'s two ends.',
  belt: 'A toothed rubber belt in place of a chain. It needs no oil, but works only with one rear sprocket, so the gears are in the hub.',
  cassette: 'The stack of toothed rings on the rear wheel. A bigger ring makes pedalling easier, a smaller one faster.',
  derailleur: 'It moves the chain across the rear gears as you shift, and keeps the chain tight with its two small wheels.',
  hanger: 'The small metal plate between the frame and the rear derailleur. It bends in a fall instead of the frame.',
  'hub-gears': 'Gears sealed inside a large rear hub, with one sprocket outside. You can shift them even when standing still.',
  'brake-lever': 'The lever you pull to brake. It pulls the brake on through a cable or pushes fluid through a hose.',
  'brake-cable': 'The link from the lever to the brake: a steel cable in a casing, or a hose full of fluid on hydraulic brakes.',
  caliper: 'The disc brake\'s body beside the disc, with a pad on each side. Pulling the lever squeezes the pads onto the disc.',
  disc: 'The metal disc bolted to the hub. The pads grip it to slow the wheel.',
  'rim-brake': 'A brake that squeezes its pads onto the rim\'s sides. It is bolted to the fork and the frame, above the wheel.',
  pads: 'The blocks that grip when you brake: on the disc with disc brakes, on the rim with rim brakes. They wear and need changing.',
  'brake-qr': 'A small lever or catch that opens a rim brake wider, so the wheel can come out past the tyre.',
  'pad-adjuster': 'A knob on a cable disc brake\'s caliper. Turning it moves a pad closer to the disc as the pads wear.',
  stem: 'The stem joins the handlebar to the fork\'s steerer. It clamps both.',
  handlebar: 'You steer with the handlebar, and it holds the levers and shifters. Drop bars curve down at the front; flat bars run straight across.',
  grips: 'The rubber covers at the ends of a flat bar, where your hands hold on.',
  'bar-tape': 'The soft tape wound round a drop bar. It gives your hands grip and some comfort.',
  shifter: 'The lever or button that changes gear. On drop bars it is built into the brake lever.',
  'gear-cable': 'The thin wire from the shifter to the derailleur or the hub gears, in its casing. Electronic gears have no gear cable.',
  barrel: 'The ridged barrel where a cable\'s casing ends. Turning it makes the cable a little tighter or looser.',
  seatpost: 'The tube that holds the saddle. It slides into the seat tube to set the saddle\'s height.',
  'seat-clamp': 'The collar at the top of the seat tube. Tightening it holds the seatpost at its height.',
  saddle: 'Where you sit. It clamps onto the top of the seatpost, which sets its angle and how far forward it is.',
  motor: 'An e-bike\'s motor adds its push to yours as you pedal. It sits at the cranks or inside a wheel\'s hub.',
  battery: 'The e-bike\'s battery powers the motor. It clicks into its holder on or inside the down tube, or on the rack.',
  display: 'The display on the handlebar shows your speed, the battery and the level of help. A remote by the grip changes the level.',
};

const MORE_TAGS: Readonly<Record<Exclude<LearnTag, keyof typeof TAG_WORDS>, string>> = {
  'two-rings': 'two or three chainrings', 'full-suspension': 'full suspension', belt: 'a belt drive', 'drop-bars': 'drop bars', 'flat-bars': 'flat or upright bars',
};
export const tagWords = (tag: LearnTag): string => (MORE_TAGS as Record<string, string>)[tag] ?? TAG_WORDS[tag as keyof typeof TAG_WORDS];

export const GROUP_NAMES: Readonly<Record<LearnGroup, string>> = {
  frame: 'Frame and fork', wheels: 'Wheels', drive: 'Drivetrain', brakes: 'Brakes', cockpit: 'Cockpit', saddle: 'Saddle', ebike: 'E-bike',
};

export const STEP_NAMES: Readonly<Record<LearnStep, string>> = {
  frame: 'Frame', fork: 'Fork and headset', wheels: 'Wheels', drive: 'Drivetrain', brakes: 'Brakes', cockpit: 'Cockpit',
  saddle: 'Saddle and seatpost', ebike: 'Motor, battery and display',
};

/** How a step's parts attach, one short line. */
export const STEP_LINES: Readonly<Record<StepLine, string>> = {
  frame: 'The frame comes first: every other part is fixed to it.',
  fork: 'The fork\'s steerer slides up through the head tube, and the headset\'s bearings let it turn.',
  'fork-suspension': 'The suspension fork\'s steerer slides up through the head tube, and the headset\'s bearings let it turn.',
  'wheels-thru': 'Each wheel\'s hub sits in the dropouts, and a thru-axle goes through both and screws in.',
  'wheels-qr': 'Each wheel\'s hub sits in the dropouts, and a quick release through the hub clamps it there.',
  'drive-derailleur': 'The bottom bracket goes into the frame and the cranks onto it; the chain runs from the chainring to the rear gears and through the derailleur, bolted to the hanger.',
  'drive-two': 'The bottom bracket goes into the frame and the cranks onto it; the chain runs from the chainrings to the rear gears, and a derailleur at each end moves it.',
  'drive-hub': 'The bottom bracket goes into the frame and the cranks onto it; the chain runs from the chainring to the one sprocket of the hub gears.',
  'drive-belt': 'The bottom bracket goes into the frame and the cranks onto it; the belt runs from the front ring to the rear sprocket, through a gap in the frame.',
  'brakes-disc': 'Each caliper bolts to the frame or the fork beside its disc, which bolts to the hub; a hose or cable runs to the lever, which clamps to the bar that comes next.',
  'brakes-rim': 'Each rim brake bolts to the fork or the frame above the rim; a cable runs to the lever, which clamps to the bar that comes next.',
  'cockpit-drop': 'The stem clamps onto the steerer above the headset and holds the bar; the shifters sit in the brake levers, and tape wraps the bar.',
  'cockpit-flat': 'The stem clamps onto the steerer above the headset and holds the bar; the shifters and grips slide onto the bar.',
  saddle: 'The seatpost slides into the seat tube and the seat clamp holds it; the saddle clamps onto the top of the post.',
  'ebike-cranks': 'The motor bolts to the frame round the bottom bracket, the battery clicks into its holder on the down tube, and the display clamps to the bar.',
  'ebike-hub': 'The motor is inside a wheel\'s hub, the battery clicks into its holder on the down tube, and the display clamps to the bar.',
};

export const KIND_NAMES: Readonly<Record<LearnKind, string>> = {
  road: 'Road', gravel: 'Gravel', touring: 'Touring', city: 'City', mtb: 'Mountain hardtail', full: 'Mountain full suspension', fat: 'Fat',
  ebike: 'E-bike',
};

export const LN = {
  title: 'How a bike is built',
  intro: 'Tap any part to see what it is and what it connects to.',
  yourBike: 'Your bike',
  kinds: 'Bike to show',
  modes: 'Way to learn',
  explore: 'Explore',
  build: 'Build-up',
  step: (n: number, of: number, name: string) => `Step ${n} of ${of}: ${name}`,
  back: 'Back',
  next: 'Next',
  again: 'Start again',
  built: 'Every part is on: the bike is built.',
  stepParts: 'Parts in this step',
  add: 'Add your bike',
  addAfter: 'to see your own.',
  list: 'All parts',
  connects: 'Connects to',
  onlyOn: (tag: string) => `Only on bikes with ${tag}.`,
  tapHint: 'Tap a part on the bike, or pick one from the list below.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  whole: 'Whole bike',
  zoomGroup: 'Zoom the drawing',
  drawing: (bike: string, picked: string | null, zoomed: boolean) =>
    `${bike}.${picked ? ` Marked: ${picked}.` : ''}${zoomed ? ' Zoomed in.' : ''}`,
  typical: (kind: string) => `A typical ${kind.toLowerCase()} bike`,
  said: (name: string, first: string) => `${name}: ${first}`,
};

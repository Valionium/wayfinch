// Every drawing the kit makes, by id and folder (care pictures redo, proposal of 9 November 2026). Run `node tools/care-art/build.ts` to
// write them to src/tools/care/pictures/ (step pictures) and src/tools/care/parts/ (the parts guide's close-ups); the unit test
// CARE-ART-BUILT holds each file to its drawing, so a file is never edited by hand. `ref` is the drawing's written reference (method,
// section 8, step 1): what it must show, from the research note docs/research/2026-11-09-modern-bike-mechanisms.md (R §n), shown beside
// it on the owner's marking page. Batch 1: brakes and the snapped-spoke card. Batch 2: tyres, tubes, rims and valves. Batch 3: chain
// and gears. Batch 4: the cockpit and the e-bike.
import { chainGuide, quickLink, stiffLink } from './chain.ts';
import { dropGuide, flatGuide, headset, leverFlat, twistTest } from './cockpit.ts';
import { caliperSlot, discAdjust, discBolts, discSide, padSpacer } from './disc.ts';
import { driveGuide, gearsBarrel } from './drive.ts';
import { batteryContacts, batteryRefit } from './ebike.ts';
import type { Pic } from './kit.ts';
import { chainring, dropout, leverBarrel } from './parts.ts';
import { caliper, hydraulic, vbrake } from './rim-brakes.ts';
import { patchPress, pinchSlits, tubelessPlug, tubelessValve, tyreLevers, valves, wheelSection } from './tyres.ts';
import { spokeWrap, wheelSeated } from './wheel.ts';

export type Drawing = { id: string; dir: 'pictures' | 'parts'; make: () => Pic; ref: string };

const CALIPER = "Road dual-pivot caliper, rear, seen from behind with the wheel cut through (R §1.3, Park Tool dual-pivot service): hangs from its centre bolt in the stays' bridge; the arms reach down outside the tyre; at rest the pads stand about 1 mm off the rim's flat braking flanks, below the tyre, never on it; the housing stop with its barrel and the quick-release lever on one arm, the cable a short way down to its clamp on the other arm's tail, on the same side: the bike's left (owner, 8 Nov); lever down is closed, up is open.";
const VBRAKE = 'V-brake, rear, seen from behind with the wheel cut through (R §1.3, Park Tool linear-pull service): each arm pivots on a boss on the stay, below the rim; the pads on studs through the arms, on the rim\'s flanks below the tyre; the curved metal tube (noodle) in its holder on the left arm, the cable clamped on the right arm; release: squeeze the arms, lift the tube out.';
const HYDRO = 'Hydraulic rim brake (Magura HS type, common on trekking bikes), seen from behind with the wheel cut through (R §1.3, Magura HS33 manual): a cylinder on each boss, its pad on the piston against the rim\'s flank; a hose over the tyre between them; the quick-release lever on one side, down is OPEN (the cylinder comes off its mount), up is CLOSE.';
const SEAT = 'Front wheel in the fork, seen from behind (R §2): the hub\'s end caps touch the fork ends\' inner faces; ';
const SECTION = "The wheel cut through (R §3.1): a hooked, tubeless-ready rim of 23 mm inside with a 40 mm tyre; each bead on its bead seat against the flange, under the hook; a dip in the middle of the rim; the casing one circle outside and one inside round the same centre; the tube fills the casing and rests on the rim's well.";
const CHAIN = 'A chain from the side (R §5.1): inner and outer links alternate; every plate spans two pins, 12.7 mm apart; the outer plates, waisted, lie outside the inner ones and cover their round ends.';
const DRIVE = "The rear drive from the drive side, the bike's front to the right (R §5): a 12-sprocket cassette (10 to 45 teeth) inside the frame's rear end; the derailleur on a UDH-style hanger below and behind the axle; the chain off the top of its sprocket to the front, back along the bottom, round the back of the lower pulley, over the front of the upper pulley and up onto the sprocket; the housing out of the chainstay, looping back into the derailleur.";
const FRONT = "The front end from the bike's right side, front to the right (R §8): a tapered head tube (72°) with its bearings inside, drawn dashed (41.8 mm at the top, 52 mm at the bottom), a slim top cover, a 10 mm spacer; a 100 mm stem at -6°, its clamp round the steerer with two pinch bolts at the back, its four-bolt faceplate round the bar (a bolt above and one below the bar show; the other two are behind them); the top cap.";
const DROP = "A drop bar from the side, front to the right (R §8): from the stem's clamp the tops run forward into the bend, which curves down and back to the drops; reach about 76 mm, drop about 116 mm, the tube 23.8 mm across (31.8 mm at the clamp); the hood on the front of the bend, the lever blade hanging in front of the bend.";
const FLAT = 'A flat bar from above, forward up (R §8): the stem forward of the steerer to the bar; the bar 680 mm wide, swept 9° back from 100 mm out; grips at its ends, the brake levers just ahead of them.';
const TWIST = "Book p. 40, the twist test: 1, from above, someone standing in front of the bike holds the front wheel between the knees and the bar in both hands and tries to turn the bar; the stem (two pinch bolts, four-bolt faceplate) must not turn on the steerer. 2, from the side (R §8): ";
const BATTERY = "Bosch's pivot design (R §7): the battery's contacts at its lower end, by the motor; seated in the lower holder, it swings about that end until the catch at its upper end holds it (it clicks), then the key locks it; ";
const SLOT = "A disc caliper's slot seen end-on along the disc, close up (R §1.1, Park Tool hydraulic alignment): the rotor's edge (1.8 mm thick) in the slot between the caliper's two halves, under the bridge that joins them; a pad each side, each a thin gap from the rotor (drawn 0.9 mm so it shows); the wheel side marked.";

export const DRAWINGS: readonly Drawing[] = [
  // step pictures
  { id: 'brake-qr-open', dir: 'pictures', make: () => caliper('open'), ref: CALIPER },
  { id: 'brake-qr-close', dir: 'pictures', make: () => caliper('close'), ref: CALIPER },
  { id: 'vbrake-open', dir: 'pictures', make: () => vbrake('open'), ref: VBRAKE },
  { id: 'vbrake-close', dir: 'pictures', make: () => vbrake('close'), ref: VBRAKE },
  { id: 'hydro-rim-open', dir: 'pictures', make: () => hydraulic('open'), ref: HYDRO },
  { id: 'hydro-rim-close', dir: 'pictures', make: () => hydraulic('close'), ref: HYDRO },
  { id: 'rim-centre-caliper', dir: 'pictures', make: () => caliper('centre'), ref: `${CALIPER} The centring screw sits on top of one arm; clockwise moves both pads towards its side; some calipers have none (Park Tool).` },
  { id: 'rim-centre-vbrake', dir: 'pictures', make: () => vbrake('centre'), ref: `${VBRAKE} Each arm has a spring-tension screw on its side near the boss; tightening one moves the pads away from that side (Park Tool).` },
  { id: 'wheel-seat-thru', dir: 'pictures', make: () => wheelSeated('thru'), ref: `${SEAT}a 12 mm thru-axle runs through a closed hole in the left fork end and screws into the right one; its lever folds along the leg (some have a hex socket instead); the disc on the hub's left. The bike's weight presses the fork down onto the hub before tightening.` },
  { id: 'wheel-seat-qr', dir: 'pictures', make: () => wheelSeated('qr'), ref: `${SEAT}the hub's axle ends sit up in open slots; a 5 mm skewer runs through the hollow axle, nut on the right, cam lever on the left; closing swings the lever from sticking out to lying along the leg.` },
  { id: 'wheel-seat-nuts', dir: 'pictures', make: () => wheelSeated('nuts'), ref: `${SEAT}a solid axle's threaded ends come out through open slots, a nut outside each fork end (city and hub-gear bikes).` },
  { id: 'pad-gap', dir: 'pictures', make: () => caliperSlot('gap'), ref: `${SLOT} Look at the gaps against a light background as the wheel turns.` },
  { id: 'disc-bolts', dir: 'pictures', make: discBolts, ref: 'Two caliper mounts, seen from behind so no claim is made on where round the rotor the caliper sits (R §1.1; Park Tool: on some bikes the bolts are under the chainstay): flat mount, the caliper on the chainstay, two bolts up from under the stay; post mount, the caliper on two posts on the back of the fork leg, two bolts facing you.' },
  { id: 'disc-pad-adjust', dir: 'pictures', make: discAdjust, ref: `${SLOT.replace('A disc', 'A cable disc')} The actuation arm on the outer face pulled by the cable; the pad adjuster on the wheel side (on some brakes one each side), a knurled knob or a hex bolt; take up wear with it, never the barrel (R §1.2, Park Tool mechanical alignment).` },
  { id: 'spoke-wrap', dir: 'pictures', make: spokeWrap, ref: 'The upper half of a wheel from the side (R §4): 32 spokes, three-cross, so neighbours lean alternately; one snapped at its nipple, a stub left in the rim; its long piece, still in the hub, wound round the spoke it crosses at their crossing (Park Tool: tie it to a neighbour so it cannot flap).' },
  { id: 'pad-spacer', dir: 'pictures', make: padSpacer, ref: `${SLOT} With the wheel out there is no disc in the slot: a squeeze of a hydraulic lever pushes the pads together and the disc will not go back in (Shimano manuals); a pad spacer, or the lever left alone, keeps them apart (R §1.1).` },
  { id: 'tyre-levers', dir: 'pictures', make: tyreLevers, ref: `1: ${SECTION} The beads pushed off their seats into the dip in the middle of the rim all round, which gives the slack to lift the tyre (Park Tool). 2: the top of the wheel from the side, rim and tyre round one centre: the first lever under the bead, along the radius, hooked on a spoke; the second lever under the bead a hand width on, run round the rim; between them the bead lifted out over the rim's wall (Park Tool, tyre and tube removal).` },
  { id: 'pinch-slits', dir: 'pictures', make: pinchSlits, ref: "A length of inner tube laid flat (R §3.2): its valve on the rim side; a pinch flat is two short slits side by side across the tube, where the rim's two walls cut it." },
  { id: 'patch-press', dir: 'pictures', make: patchPress, ref: 'A length of inner tube (R §3.2): an area a bit bigger than the patch roughened (dashed), the patch on it, pressed from the middle outwards. TPU tubes take their own patches (T3).' },
  { id: 'tubeless-plug', dir: 'pictures', make: tubelessPlug, ref: "The tyre's casing cut through at a hole, tread on top (R §3.1, plug kinds): a sticky string folded through the eye of the tool's forked needle and pushed in, so the fold is inside the tyre and the two tails stay out of the tread." },
  { id: 'tyre-boot', dir: 'pictures', make: () => wheelSection('boot'), ref: `${SECTION} A cut through the sidewall; a boot laid inside the casing over the cut, following its inside curve, between the casing and the tube, which holds it on with its pressure (Park Tool: a boot needs a tube's pressure).` },
  { id: 'quick-link', dir: 'pictures', make: quickLink, ref: `${CHAIN} The quick link takes an outer link's place over two inner-link ends: two plates, each with one pin and one keyhole slot; the front plate's pin through the left end, its keyhole over the right end with the back plate's pin at the keyhole's big end, not yet clicked to the small end (Park Tool, Shimano, SRAM).` },
  { id: 'stiff-link', dir: 'pictures', make: stiffLink, ref: 'A chain from above (R §5.1): the inner plates either side of the rollers, the outer plates outside them, the pins\' ends just outside the outer plates; one joint marked, the chain beyond it flexed to the side and back (book p. 159: flex the joined link sideways).' },
  { id: 'barrel-caliper', dir: 'pictures', make: () => caliper('barrel'), ref: `${CALIPER} Close up at the housing stop: the barrel adjuster screwed into the stop, unscrewed a few threads so it stands proud of the stop (dashed where it sat), which pulls the cable tighter; a turn arrow round its axis (T15).` },
  { id: 'barrel-vbrake', dir: 'pictures', make: leverBarrel, ref: "A flat-bar brake lever from above (R §1.3: a V-brake's barrel adjuster is on the lever): its clamp round the bar, the blade pivoting at the body's front and running to the grip; the barrel in the body's front with its lock ring, the housing out of it; unscrewed a few threads (dashed where it sat) to pull the cable tighter (T15)." },
  { id: 'twist-test-drop', dir: 'pictures', make: () => twistTest('drop'), ref: `${TWIST}a hand presses down hard on a drop bar's hood, at the front of the bend; the bar must not roll in the stem's clamp.` },
  { id: 'twist-test-flat', dir: 'pictures', make: () => twistTest('flat'), ref: `${TWIST}a hand presses down hard on a flat bar's grip, which sits behind the clamp (the bar's backsweep); the bar must not roll in the stem's clamp.` },
  { id: 'battery-in-tube', dir: 'pictures', make: () => batteryRefit('in'), ref: `${BATTERY}in the down tube, it comes out of the tube's underside (most current e-bikes). Switch the system off first; some light e-bikes have a battery that only comes out with tools (T19).` },
  { id: 'battery-on-tube', dir: 'pictures', make: () => batteryRefit('on'), ref: `${BATTERY}on top of the down tube (older bikes), it tilts down onto the tube. Others sit on the rack.` },
  { id: 'battery-contacts', dir: 'pictures', make: batteryContacts, ref: "The battery off the bike, its end towards you (R §7, Tern's Bosch guide: clean, dry contacts): a box whose edges meet; the contact socket in its end with two flat blades and small pins; a dry cloth, an arrow from it to the contacts." },
  { id: 'gears-barrel', dir: 'pictures', make: gearsBarrel, ref: `${DRIVE} The barrel adjuster marked where the housing enters the back of the derailleur's knuckle (on Shimano GRX mechanical, for example), with a turn arrow round its axis (a click at a time, the step says); on some bikes it is on the shifter (T17).` },
  // the parts guide's close-ups
  { id: 'pg-headset', dir: 'parts', make: () => headset('headset'), ref: `${FRONT} The headset marked: both bearings and the top cover.` },
  { id: 'pg-stem', dir: 'parts', make: () => headset('stem'), ref: `${FRONT} The stem marked; the bar seen end-on in its clamp.` },
  { id: 'pg-bar-drop', dir: 'parts', make: () => dropGuide('bar'), ref: `${DROP} The bar marked.` },
  { id: 'pg-lever-drop', dir: 'parts', make: () => dropGuide('lever'), ref: `${DROP} The lever blade marked, hanging from the hood.` },
  { id: 'pg-bar-flat', dir: 'parts', make: () => flatGuide('bar'), ref: `${FLAT} The bar marked.` },
  { id: 'pg-lever-flat', dir: 'parts', make: leverFlat, ref: "The right end of a flat bar from above, forward up (R §8): the lever's clamp on the bar inside the grip, its body forward to the blade's pivot, the blade out over the front of the grip; the gear shifter beside the clamp, inboard; the brake's housing out of the lever's front." },
  { id: 'pg-display', dir: 'parts', make: () => flatGuide('display'), ref: `${FLAT} An e-bike's display over the stem, on its mount at the bar; the remote on the bar inside the left lever, by the grip.` },
  { id: 'pg-caliper-rim', dir: 'parts', make: () => caliper('guide'), ref: CALIPER },
  { id: 'pg-vbrake', dir: 'parts', make: () => vbrake('guide'), ref: VBRAKE },
  { id: 'pg-rim-hydraulic', dir: 'parts', make: () => hydraulic('guide'), ref: HYDRO },
  { id: 'pg-pads-rim', dir: 'parts', make: () => caliper('pads'), ref: `${CALIPER} The pads marked, on the rim's flanks just below the tyre.` },
  { id: 'pg-pads-disc', dir: 'parts', make: () => caliperSlot('pads'), ref: `${SLOT} The pads marked. Hydraulic: no adjuster knobs.` },
  { id: 'pg-disc', dir: 'parts', make: () => discSide('disc'), ref: "The front wheel from the bike\'s left side (R §1.1): a 6-bolt rotor on the hub; the fork leg comes down to the axle about 19° off upright; the caliper (post mount) behind the leg above the axle, astride the braking ring, its hose up the leg." },
  { id: 'pg-disc-caliper', dir: 'parts', make: () => discSide('caliper'), ref: "The front wheel from the bike\'s left side (R §1.1): the caliper behind the fork leg, above the axle, astride the rotor\'s braking ring, its hose up the leg." },
  { id: 'pg-tyre', dir: 'parts', make: () => wheelSection('tyre'), ref: SECTION },
  { id: 'pg-bead', dir: 'parts', make: () => wheelSection('bead'), ref: `${SECTION} The beads marked: each on its seat against the flange, under the hook.` },
  { id: 'pg-tube', dir: 'parts', make: () => wheelSection('tube'), ref: `${SECTION} The tube marked: it fills the casing and rests on the rim's well.` },
  { id: 'pg-rim', dir: 'parts', make: () => wheelSection('rim'), ref: `${SECTION} The rim marked: flanges with hooks, bead seats, the dip in the middle, the hollow box below.` },
  { id: 'pg-valves', dir: 'parts', make: valves, ref: 'Three valves through the rim, from the side (R §3.5): Presta, thin and threaded with a lock nut on the rim and a small nut on its tip; Schrader, wide, threaded near its top, a pin in its end; Dunlop, wide, a knurled ring nut near its top over the core.' },
  { id: 'pg-tubeless-valve', dir: 'parts', make: tubelessValve, ref: "The rim cut through at the valve (R §3.1): the tubeless valve's rubber cone base in the dip, over the rim tape, drawn as a band along the well; the threaded stem down through the rim with its core at the end; a nut under the rim holds it." },
  { id: 'pg-chain', dir: 'parts', make: chainGuide, ref: `${CHAIN} One outer plate marked; a pin and an inner plate labelled.` },
  { id: 'pg-cassette', dir: 'parts', make: () => driveGuide('cassette'), ref: `${DRIVE} The rear sprockets marked by their biggest ring.` },
  { id: 'pg-derailleur', dir: 'parts', make: () => driveGuide('derailleur'), ref: `${DRIVE} The derailleur marked: its knuckle on the hanger, the parallelogram, the cage with its two pulleys.` },
  { id: 'pg-hanger', dir: 'parts', make: () => driveGuide('hanger'), ref: `${DRIVE} The hanger marked: round the axle against the dropout, down to the derailleur's bolt (UDH, R §5).` },
  { id: 'pg-gear-cable', dir: 'parts', make: () => driveGuide('cable'), ref: `${DRIVE} The housing marked, and the inner cable from the barrel to its clamp bolt.` },
  { id: 'pg-dropout-thru', dir: 'parts', make: () => dropout('thru'), ref: "A fork end from the bike's left side (R §2): a closed hole round a 12 mm thru-axle; the fork leg comes down into it." },
  { id: 'pg-dropout-qr', dir: 'parts', make: () => dropout('qr'), ref: "A fork end from the bike's left side (R §2): an open slot from below, 9.5 mm wide; the 9 mm axle up against the slot's top, not above it." },
  { id: 'pg-chainring-1x', dir: 'parts', make: () => chainring('1x'), ref: 'The crank from the drive side (R §5): one direct-mount chainring of 40 teeth, no spider arms; a 170 mm crank; the pedal seen end-on, its body centred on its spindle.' },
  { id: 'pg-chainring-2x', dir: 'parts', make: () => chainring('2x'), ref: 'The crank from the drive side (R §5): two chainrings, 50 and 34 teeth, on a four-arm spider whose arms sit at uneven angles (one behind the crank); a 170 mm crank; the pedal centred on its spindle.' },
];

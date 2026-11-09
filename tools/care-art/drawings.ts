// Every drawing the kit makes, by id and folder (care pictures redo, proposal of 9 November 2026). Run `node tools/care-art/build.ts` to
// write them to src/tools/care/pictures/ (step pictures) and src/tools/care/parts/ (the parts guide's close-ups); the unit test
// CARE-ART-BUILT holds each file to its drawing, so a file is never edited by hand. `ref` is the drawing's written reference (method,
// section 8, step 1): what it must show, from the research note docs/research/2026-11-09-modern-bike-mechanisms.md (R §n), shown beside
// it on the owner's marking page. Batch 1: brakes and the snapped-spoke card.
import { caliperSlot, discAdjust, discBolts, discSide } from './disc.ts';
import type { Pic } from './kit.ts';
import { caliper, hydraulic, vbrake } from './rim-brakes.ts';
import { spokeWrap, wheelSeated } from './wheel.ts';

export type Drawing = { id: string; dir: 'pictures' | 'parts'; make: () => Pic; ref: string };

const CALIPER = "Road dual-pivot caliper, rear, seen from behind with the wheel cut through (R §1.3, Park Tool dual-pivot service): hangs from its centre bolt in the stays' bridge; the arms reach down outside the tyre; at rest the pads stand about 1 mm off the rim's flat braking flanks, below the tyre, never on it; the housing stop with its barrel and the quick-release lever on one arm, the cable a short way down to its clamp on the other arm's tail, on the same side: the bike's left (owner, 8 Nov); lever down is closed, up is open.";
const VBRAKE = 'V-brake, rear, seen from behind with the wheel cut through (R §1.3, Park Tool linear-pull service): each arm pivots on a boss on the stay, below the rim; the pads on studs through the arms, on the rim\'s flanks below the tyre; the curved metal tube (noodle) in its holder on the left arm, the cable clamped on the right arm; release: squeeze the arms, lift the tube out.';
const HYDRO = 'Hydraulic rim brake (Magura HS type, common on trekking bikes), seen from behind with the wheel cut through (R §1.3, Magura HS33 manual): a cylinder on each boss, its pad on the piston against the rim\'s flank; a hose over the tyre between them; the quick-release lever on one side, down is OPEN (the cylinder comes off its mount), up is CLOSE.';
const SEAT = 'Front wheel in the fork, seen from behind (R §2): the hub\'s end caps touch the fork ends\' inner faces; ';
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
  // the parts guide's close-ups
  { id: 'pg-caliper-rim', dir: 'parts', make: () => caliper('guide'), ref: CALIPER },
  { id: 'pg-vbrake', dir: 'parts', make: () => vbrake('guide'), ref: VBRAKE },
  { id: 'pg-rim-hydraulic', dir: 'parts', make: () => hydraulic('guide'), ref: HYDRO },
  { id: 'pg-pads-rim', dir: 'parts', make: () => caliper('pads'), ref: `${CALIPER} The pads marked, on the rim's flanks just below the tyre.` },
  { id: 'pg-pads-disc', dir: 'parts', make: () => caliperSlot('pads'), ref: `${SLOT} The pads marked. Hydraulic: no adjuster knobs.` },
  { id: 'pg-disc', dir: 'parts', make: () => discSide('disc'), ref: 'The front wheel from the bike\'s left side (R §1.1): a 6-bolt rotor on the hub; the fork leg comes down to the axle about 19° off upright; the caliper (post mount) behind the leg above the axle, astride the braking ring, its hose up the leg.' },
  { id: 'pg-disc-caliper', dir: 'parts', make: () => discSide('caliper'), ref: 'The front wheel from the bike\'s left side (R §1.1): the caliper behind the fork leg, above the axle, astride the rotor\'s braking ring, its hose up the leg.' },
];

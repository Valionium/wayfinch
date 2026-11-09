// Bike care's pictures in words (care pictures design of 7 November 2026, section 2.5): each drawing's short name (one sentence) and its
// description (what it shows, in plain words, two to four sentences), and a one-line caption where the picture shows a test or method the
// step only names, or a view that needs saying. Loaded only with Bike care, under the banned-words test (tests/unit/core/care/pictures.test.ts).
// Labels drawn inside a picture are repeated here. The redo of 9 November 2026 redraws them with tools/care-art, batch by batch.
export type PictureWords = { name: string; description: string; caption?: string };

// The rim brakes are drawn from behind the rear brake with the wheel cut through at the brake, so the pads show on the rim's flanks below
// the tyre. The steps name no wheel: the front brake works the same way (review of PR 72, I3; lever on the bike's left, owner, 8 Nov).
const BEHIND = 'Seen from behind, the wheel cut through at the brake. The front brake works the same way.';

/** Each kind's name on the step view's switch (redo, answer 4): "Other kinds: V-brake · Hydraulic rim brake". */
export const KIND_WORDS: Readonly<Record<string, string>> = {
  caliper: 'Road caliper', 'v-brake': 'V-brake', hydraulic: 'Hydraulic rim brake',
  thru: 'Thru-axle', qr: 'Quick release', nuts: 'Axle nuts', drop: 'Drop bars', flat: 'Flat bars', cable: 'Cable gears',
};
/** The switch's own words. */
export const SWITCH_WORDS = { other: 'Other kinds', show: (kind: string): string => `Show ${kind}` } as const;

export const PICTURE_WORDS: Readonly<Record<string, PictureWords>> = {
  'brake-qr-open': {
    name: "Opening a road caliper's quick release: the small lever flips up.",
    description: "A road rim brake, the caliper, seen from behind with the wheel cut through: its two arms reach down either side of the tyre to the pads, which stand just off the rim's flat sides below the tyre. On the bike's left the cable comes into a barrel and runs a short way down to its clamp; beside the barrel a small lever points down, labelled \"closed\", and a dashed outline shows it flipped up, labelled \"open\", with a curved arrow between. Open, the brake lets a bent rim turn past the pads.",
    caption: BEHIND,
  },
  'brake-qr-close': {
    name: "Closing a road caliper's quick release: the small lever flips down.",
    description: "A road rim brake, the caliper, seen from behind with the wheel cut through, its pads just off the rim's flat sides below the tyre. On the bike's left, beside the cable's barrel, the small lever points up, labelled \"open\"; a dashed outline shows it down, labelled \"closed\", with a curved arrow between. Closed, the brake works fully again.",
    caption: BEHIND,
  },
  'vbrake-open': {
    name: 'Opening a V-brake: squeeze the arms and lift the curved tube out.',
    description: "A V-brake seen from behind with the wheel cut through: two tall arms stand on bosses on the frame's stays, below the rim, with a pad on each arm against the rim's sides. At the top, on the bike's left arm, the cable runs through a short curved metal tube in a holder. An arrow labelled \"squeeze\" pushes the arm in, and a second arrow labelled \"lift out\" shows the curved tube coming up out of its holder; a dashed outline shows where it goes.",
    caption: BEHIND,
  },
  'vbrake-close': {
    name: 'Closing a V-brake: squeeze the arms and put the curved tube back.',
    description: "A V-brake seen from behind with the wheel cut through: two tall arms on bosses on the stays, a pad on each against the rim's sides. The short curved metal tube is out of its holder on the bike's left arm; a dashed outline shows it seated, where it goes. An arrow labelled \"squeeze\" pushes the arm in, and a second arrow labelled \"put back\" shows the tube going down into its holder.",
    caption: BEHIND,
  },
  'hydro-rim-open': {
    name: 'Opening a hydraulic rim brake: flip the lever on the left side down.',
    description: "A hydraulic rim brake, of the kind many trekking bikes have, seen from behind with the wheel cut through: a cylinder on each side sits on its boss on the stay, its pad against the rim's side, and a hose arches over the tyre between them. On the bike's left, a lever on the cylinder's mount, outside the cylinder, points up, labelled \"closed\"; a dashed outline shows it down, labelled \"open\", with a curved arrow between. Open, that cylinder comes off its mount, so the wheel can come out.",
    caption: BEHIND,
  },
  'hydro-rim-close': {
    name: 'Closing a hydraulic rim brake: flip the lever on the left side up.',
    description: "A hydraulic rim brake seen from behind with the wheel cut through: a cylinder on each side on its boss, the pads on the rim's sides, a hose over the tyre. On the bike's left, the lever on the cylinder's mount points down, labelled \"open\"; a dashed outline shows it up, labelled \"closed\", with a curved arrow between.",
    caption: BEHIND,
  },
  'rim-centre-caliper': {
    name: "A road caliper's centring screw, turned a little.",
    description: "A road rim brake, the caliper, seen from behind with the wheel cut through, its pads on the rim's sides. On the right arm's shoulder, below the top of the brake, a small screw is marked \"centring screw\", with a curved arrow showing it turned a little. Turning it moves both pads together, towards one side or the other.",
    caption: 'Seen from behind. Some calipers have no such screw: then a shop centres the brake.',
  },
  'rim-centre-vbrake': {
    name: "A V-brake's spring screw, turned a little.",
    description: "A V-brake seen from behind with the wheel cut through, a pad on each arm against the rim's sides. Low on the side of the bike's left arm, near its boss, a small screw is marked \"spring screw\", with a curved arrow showing it turned a little. Each arm has one; turning it changes how hard that arm springs back, which moves the pads to one side.",
    caption: 'Seen from behind.',
  },
  'wheel-seat-thru': {
    name: 'A thru-axle: push the wheel fully in, then tighten the axle firmly.',
    description: "The front wheel's hub seen from behind, between the fork's two ends, with the brake disc on its left. A thick axle, labelled \"thru-axle\", runs through a closed hole in the left fork end, through the hub, and screws into the right fork end; its lever, folded along the outside of the left fork leg, is marked; the disc stands on the hub's left end. An arrow on the right fork leg, labelled \"push down\", shows the bike's weight pressing the fork down onto the hub, and a curved arrow round the axle's head says \"tighten firmly\".",
    caption: 'Seen from behind the fork. Some thru-axles have no lever and take a hex key.',
  },
  'wheel-seat-qr': {
    name: 'A quick release: push the wheel fully in, then close the lever firmly.',
    description: "The front wheel's hub seen from behind, between the fork's two ends. The hub's axle ends sit up in the fork ends' slots; a thin rod runs through the hub, with a nut on the right and the lever on the left. A dashed outline shows the lever sticking out, open, and a curved arrow swings it up along the fork leg, closed, labelled \"close firmly\"; an arrow on the right fork leg, labelled \"push down\", shows the bike's weight pressing the fork down onto the hub.",
    caption: 'Seen from behind the fork.',
  },
  'wheel-seat-nuts': {
    name: 'Axle nuts: push the wheel fully in, then tighten both nuts.',
    description: "The front wheel's hub seen from behind, between the fork's two ends. The axle's threaded ends come out through the fork ends' slots, with a nut outside each; the left nut is marked, and a curved arrow round it says \"tighten both\". An arrow on the right fork leg, labelled \"push down\", shows the bike's weight pressing the fork down onto the hub.",
    caption: 'Seen from behind the fork.',
  },
  'pad-gap': {
    name: 'A thin gap between each pad and the disc.',
    description: "A disc brake's caliper seen end-on along the disc, close up: the disc's edge stands in the slot between the caliper's two halves, under the bridge that joins them, with a pad on each side; the wheel side is marked. Between each pad and the disc a thin strip of light is marked, labelled \"a thin gap each side\"; the wheel side is marked. When the wheel turns, the disc should touch neither pad.",
    caption: 'Seen end-on along the disc. Look at the gaps against a light background, as the wheel turns.',
  },
  'disc-bolts': {
    name: 'The two bolts that hold a disc brake caliper, on a flat mount and on a post mount.',
    description: "Two panels, both seen from behind the brake, with the disc upright through the caliper's slot between the pads. Left, \"Flat mount\": the caliper sits on a flat face on top of the chainstay, which is seen end-on, and its bolts come up from under the stay, marked \"bolts\"; the second one hides behind the first. Right, \"Post mount\": the caliper sits on two posts on the back of the fork leg, and its two bolts face you, marked \"bolts\".",
    caption: 'Your bike has one of the two. Flat-mount bolts are reached from under the stay.',
  },
  'disc-pad-adjust': {
    name: "Turning a cable disc brake's pad adjuster in a little.",
    description: "A cable disc brake's caliper seen end-on along the disc, close up: the disc's edge in the slot, a pad on each side, and, flat on the caliper's outer side, the arm the cable pulls. On the wheel side, a knurled knob sticks out, marked \"pad adjuster\", with a curved arrow round it labelled \"turn in a little\". Turning it in moves its pad closer to the disc.",
    caption: 'Seen end-on along the disc. Some cable brakes have an adjuster on each side, as a knob or a hex bolt.',
  },
  'spoke-wrap': {
    name: 'The broken spoke wound round the spoke it crosses.',
    description: "The upper half of a wheel seen from the side, its spokes crossing on their way from the hub to the rim. One spoke has snapped at its nipple, leaving a short stub in the rim; its long piece, still held in the hub, is marked \"broken spoke\". At the point where it crosses a neighbouring spoke, its loose end is wound round that spoke three times, labelled \"wound round its neighbour\", so it cannot flap.",
  },
};

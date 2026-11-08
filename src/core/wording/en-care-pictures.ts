// Bike care's pictures in words (care pictures design of 7 November 2026, section 2.5): each drawing's short name (one sentence) and its
// description (what it shows, in plain words, two to four sentences), and a one-line caption where the picture shows a test or method the
// step only names, or a view that needs saying. Loaded only with Bike care, under the banned-words test (tests/unit/core/care/pictures.test.ts).
// Labels drawn inside a picture are repeated here.
export type PictureWords = { name: string; description: string; caption?: string };

const QR_CAPTION = 'Seen from behind the brake, as you stand over the bike: the lever is on your left.';

export const PICTURE_WORDS: Readonly<Record<string, PictureWords>> = {
  'tyre-levers': {
    name: 'Prying the tyre off the rim with two tyre levers.',
    description: 'The top of a wheel taken out of the bike, seen from the side. A first tyre lever is tucked under the edge of the tyre, pulled down towards the centre of the wheel, and its hooked end is clipped onto a spoke so it stays put; that stretch of tyre edge now sits outside the rim. A second lever is tucked under the tyre edge a hand width further on, and an arrow shows it being run along the rim, away from the first lever. A small picture in the corner shows the whole wheel and where this view is.',
  },
  'pinch-slits': {
    name: 'A pinched tube: two slits side by side.',
    description: 'A length of inner tube laid flat, with its valve at one end. In the middle are two short slits next to each other, both running along the tube, marked "two slits side by side". This is the mark a tube gets when it is pinched against the rim.',
  },
  'patch-press': {
    name: 'Pressing a patch onto the tube from the middle outwards.',
    description: 'A length of inner tube with a patch stuck on it. A dotted outline a little bigger than the patch shows the roughened area. Two arrows start at the middle of the patch and point outwards, labelled "press from the middle outwards".',
  },
  'tubeless-plug': {
    name: 'Pushing a plug into the hole in a tubeless tyre.',
    description: 'The tread of a tyre seen from the side, with a plug tool held above it. The tool\'s tip pushes a plug strip, folded in two, down into the hole, so its two ends still stick out of the tread. An arrow points down, and the strip is labelled "plug".',
  },
  'quick-link': {
    name: 'Joining the two chain ends with a quick link.',
    description: 'A chain seen from the side, broken into two ends with a gap between them. In the gap sits a quick link, a single link with a pin at each end, labelled "quick link". Two arrows show the chain ends coming together onto the quick link.',
  },
  'stiff-link': {
    name: 'A stiff link in the chain, flexed sideways.',
    description: 'A straight piece of chain seen from above, so the plates on both sides of each link show. One joint in the middle is marked "stiff link". Two arrows push the chain sideways, one on each side of that joint, to bend it back and forth until it moves freely.',
  },
  'spoke-wrap': {
    name: 'The broken spoke wrapped round its neighbour.',
    description: 'A close-up of the wheel just below the rim, with several spokes running down from the rim. One spoke has snapped near the rim; its long piece is bent over and wound round the spoke next to it, labelled "broken spoke" and "wrapped round its neighbour". A small picture in the corner shows the whole wheel and where this view is.',
  },
  'brake-qr-open': {
    name: "Opening the brake's quick release: the small lever flips from down to up.",
    description: "A close-up of a rim brake at the top of the front wheel, with the brake's arms reaching down either side of the tyre to the pads. A small lever sits on the left side of the brake, beside where the cable comes in. It points down, labelled \"closed\"; a dashed outline shows it pointing up, labelled \"open\", and a curved arrow shows the flip from down to up. A small picture in the corner shows the whole wheel and where this view is.",
    caption: QR_CAPTION,
  },
  'brake-qr-close': {
    name: "Closing the brake's quick release: the small lever flips from up to down.",
    description: "A close-up of a rim brake at the top of the front wheel, with the brake's arms reaching down either side of the tyre to the pads. A small lever on the left side of the brake points up, labelled \"open\"; a dashed outline shows it pointing down, labelled \"closed\", and a curved arrow shows the flip from up to down. A small picture in the corner shows the whole wheel and where this view is.",
    caption: QR_CAPTION,
  },
  'disc-bolts': {
    name: 'The two bolts that hold the disc brake caliper.',
    description: 'The front wheel\'s brake disc seen from the left side of the bike, with the fork leg running up from the wheel\'s centre. The caliper, the brake\'s body, sits over the edge of the disc behind the fork leg, with the brake hose running up from it. The two bolts at either end of the caliper are marked "caliper bolts".',
  },
  'barrel-adjuster': {
    name: 'The barrel adjuster: unscrewing it a little pulls the cable tighter.',
    description: 'A close-up where the cable\'s outer casing meets the part it works. The casing ends in a ridged barrel, labelled "barrel adjuster", which is screwed into the part. A curved arrow shows the barrel being turned, and a dashed outline shows it a little further out, labelled "unscrew a little: cable tighter".',
  },
  'twist-test': {
    name: 'The twist test on the stem and the handlebar.',
    description: 'Two small pictures. Picture 1, looking down from above while standing in front of the bike: the front wheel is held between the knees and both hands hold the handlebar; a curved arrow shows trying to turn the bar, and the stem, which joins the bar to the fork, is marked "must not turn". Picture 2, from the side: a hand presses down hard on the brake lever hood at the front of a drop handlebar, shown by an arrow, and the clamp of the stem is marked "must not roll".',
    caption: 'The twist test. 1: hold the front wheel between your knees and try to turn the bar. 2: press down hard on the front of the bar. Neither may move. Not on carbon parts (step 1).',
  },
  'tyre-boot': {
    name: 'A boot inside the tyre, covering the cut.',
    description: 'The wheel cut through, showing the tyre, the inner tube inside it and the rim below. The tyre has a cut in its side, labelled "cut". On the inside of the tyre, between the tyre and the tube, a strip covers the cut, labelled "boot".',
  },
};

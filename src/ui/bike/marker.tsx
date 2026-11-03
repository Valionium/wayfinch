// <BikeMarker>: the rider's bike on Ahead's route strip (spec sections 3.7 and 7.4): wheels, frame and fork in the rider's colour, at
// most 24 px tall. Decorative and inert: the strip carries the position's label, and during a ride a tap on it opens nothing.
// Pure: it reads only the bike it is given, so the strip may use it.
import { markerArt } from '../../core/bike/art.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import './bike.css';

export function BikeMarker({ bike }: { bike: BikeRecord | null }) {
  return <span class="bike-marker" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerArt(resolveBikeSpec(bike, null)) }} />;
}

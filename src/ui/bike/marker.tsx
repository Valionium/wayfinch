// <BikeMarker>: the rider's bike on Ahead's route strip (spec sections 3.7 and 7.4): wheels, frame and fork in the rider's colour, at
// most 24 px tall. Decorative and inert: the strip carries the position's label, and during a ride a tap on it opens nothing.
// Pure: it reads only the bike it is given, so the strip may use it.
import { markerArt } from '../../core/bike/art.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import './bike.css';
import { useTheme } from './drawing.tsx';

/** `faded`: no position is kept yet, so the bike's place on the strip is not confirmed (AH-FROM-START). */
export function BikeMarker({ bike, faded = false }: { bike: BikeRecord | null; faded?: boolean }) {
  // The theme picks the casing's tone under the rider's colour (owner's ruling A).
  const theme = useTheme();
  return <span class={faded ? 'bike-marker bike-faded' : 'bike-marker'} data-unconfirmed={faded ? '' : undefined} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerArt(resolveBikeSpec(bike, null), theme) }} />;
}

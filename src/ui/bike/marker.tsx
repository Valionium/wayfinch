// <BikeMarker>: the rider's bike on Ahead's route strip (spec sections 3.7 and 7.4): wheels, frame and fork in the rider's colour, at
// most 24 px tall. Decorative and inert: the strip carries the position's label, and during a ride a tap on it opens nothing.
// Pure: it reads only the bike it is given, so the strip may use it.
import { markerArt } from '../../core/bike/art.ts';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import { resolveBikeSpec } from '../../core/bike/spec.ts';
import './bike.css';
import { useTheme } from './drawing.tsx';

/** `unconfirmed`: no position is kept yet, so the bike stands at the strip's start faded (owner's preview check, 8 Nov 2026, item K). */
export function BikeMarker({ bike, unconfirmed = false }: { bike: BikeRecord | null; unconfirmed?: boolean }) {
  // The theme picks the casing's tone under the rider's colour (owner's ruling A).
  const theme = useTheme();
  return <span class={unconfirmed ? 'bike-marker bike-marker-unconfirmed' : 'bike-marker'} aria-hidden="true" dangerouslySetInnerHTML={{ __html: markerArt(resolveBikeSpec(bike, null), theme) }} />;
}

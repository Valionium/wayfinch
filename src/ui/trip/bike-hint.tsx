// The bike at the top of Trip, with the first-run hint (wish 17, design of 9 Nov 2026): a new rider sees a card saying the bike can be
// made theirs, with Make it yours and Later; nothing pops up, nothing is required, focus never moves on its own. Later, a look into Bike
// details from the card, two places seen (hint-seen.ts) or data already on the phone make it today's one line for good; a saved bike
// makes it gone, and the first return after it says once that the bike is in every tool now (its words load only then).
import { useEffect, useRef, useState } from 'preact/hooks';
import { bikeHint, withLetters } from '../../core/bike/hint.ts';
import { WB } from '../../core/wording/en-bike.ts';
import { W } from '../../core/wording/en.ts';
import { BikeDrawing } from '../bike/drawing.tsx';
import { readHint, usedBefore, writeHint } from '../bike/hint-key.ts';
import { bikeDetailsHref } from '../bike/link.ts';
import type { BikeSource } from '../bike/live.ts';

const small = (): void => writeHint(withLetters(readHint(), 's'));

/**
 * `trip`: null until Trip's snapshot is read, then whether a trip is on the phone. Whether the rider already used the app is settled once
 * per visit to Trip, so the card never shrinks under the rider's fingers; the key is written only once the trip is known.
 */
export function TripBike({ bike, trip }: { bike: BikeSource; trip: boolean | null }) {
  const [said, setSaid] = useState('');
  const [, redo] = useState(0);
  const at = useRef<{ used?: boolean; line?: boolean }>({}).current;
  const box = useRef<HTMLDivElement>(null);
  const before = usedBefore() || bike.summary !== null;
  if (trip !== null) at.used ??= trip || before;
  const key = readHint();
  const h = bikeHint(bike.known.length > 0, at.used ?? before, key);
  at.line ||= h.line;
  useEffect(() => {
    if (trip !== null && h.key !== key) writeHint(h.key);
    if (at.line && !said) import('../../core/wording/en-hint.ts').then((m) => setSaid(m.HN.hintEveryTool), () => undefined);
  });
  return h.hint === 'new' ? (
    <section class="trip-bike bike-hint" aria-labelledby="bike-hint" onClick={(e) => { if ((e.target as Element).closest('a')) small(); }}>
      <BikeDrawing bike={null} summary={null} back="trip" caption={false} />
      <h2 id="bike-hint">{W.bikeHintTitle}</h2>
      <p>{W.bikeHintBody}</p>
      <p class="bike-hint-acts">
        <a href={bikeDetailsHref('new', 'trip', 'look')}>{WB.bikeMakeItYours}</a>
        {/* Focus goes on to the line's Add your bike, so keyboard and screen reader users are not lost. */}
        <button type="button" aria-label={W.bikeHintLaterName} onClick={() => { small(); redo(1); setTimeout(() => box.current?.querySelector<HTMLElement>('figcaption a')?.focus()); }}>{W.bikeHintLater}</button>
      </p>
    </section>
  ) : (
    <div class="trip-bike" ref={box}>
      <BikeDrawing bike={bike.bike} summary={bike.summary} known={bike.known} back="trip" />
      {at.line ? <p class="bike-hint-done" role="status">{said}</p> : null}
    </div>
  );
}

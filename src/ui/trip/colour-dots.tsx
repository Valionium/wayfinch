// Try a colour on the first-run card (wish 17, design of 9 Nov 2026, section 4.2; owner's answer 3): five of Look's own swatches under
// the card's sentence. A tap paints the frame at once, through the drawing's own colour path; a second tap gives the grey bike back.
// Nothing is saved: Make it yours carries the colour into Bike details, where it is picked but kept only when the rider saves. A chunk
// of its own, loaded while idle on the card only, into a row the card keeps for it.
import { SWATCHES } from '../../core/bike/colour.ts';
import type { Swatch } from '../../core/bike/colour.ts';
import { HN } from '../../core/wording/en-hint.ts';

const TRY: readonly Swatch[] = ['Teal', 'Red', 'Blue', 'Yellow', 'Black'].map((n) => SWATCHES.find((s) => s.name === n)!);

export function ColourDots({ tried, pick }: { tried: Swatch | null; pick: (s: Swatch | null) => void }) {
  return (
    <div class="bike-hint-try" role="group" aria-label={HN.hintTryColour}>
      {TRY.map((s) => (
        <button type="button" key={s.name} aria-label={s.name} aria-pressed={tried?.name === s.name ? 'true' : 'false'} onClick={() => pick(tried?.name === s.name ? null : s)}>
          <span style={{ background: s.hex }} />
        </button>
      ))}
    </div>
  );
}

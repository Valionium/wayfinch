// The cross-check with SRAM (spec section 7.2): a link, and the list of exactly what to type there. Nothing is prefilled or sent, and no
// SRAM formula is here: this only reads the screen's own values back to the rider.
import { TQ } from '../../core/wording/en-tyre-fields.ts';
import { TS } from '../../core/wording/en-tyre.ts';
import type { Values } from './model.ts';
import { WHEELS } from './tables.ts';

export const SRAM_URL = 'https://axs.sram.com/guides/tire/pressure';

const kg = (n: number): string => `${Number(n.toFixed(1))} kg`;
const mm = (n: number): string => String(Number(n.toFixed(1)));

export function sramList(v: Values): { label: string; value: string }[] {
  const placed = v.load.byPositionKg ?? {};
  const pack = placed.pack ?? 0; // a backpack counts as rider
  const gear = v.bikeKg + v.load.unplacedKg + (v.load.emptyLuggageKg ?? 0) + Object.entries(placed).reduce((a, [k, n]) => a + (k === 'pack' ? 0 : (n ?? 0)), 0);
  const rim = v.rimType === 'unset' ? TS.tyreSramRimUnset : { hooked: TQ.tyreRimHooked, hookless: TQ.tyreRimHookless, tubular: TQ.tyreRimTubular }[v.rimType];
  const casing = { supple: TS.tyreSramThin, standard: TQ.tyreCasingStandard, reinforced: TQ.tyreCasingReinforced }[v.casing];
  return [
    { label: TS.tyreSramRider, value: kg(v.riderKg + pack) },
    { label: TS.tyreSramGear, value: kg(gear) },
    {
      label: TS.tyreSramWidth,
      value: v.front.printedMm === v.rear.printedMm ? TQ.tyreSramWidthBoth(mm(v.front.printedMm)) : TQ.tyreSramWidthEach(mm(v.front.printedMm), mm(v.rear.printedMm)),
    },
    { label: TS.tyreSramCasing, value: casing },
    { label: TS.tyreSramWheel, value: WHEELS.find((w) => w.bsdMm === v.wheelBsdMm)?.label ?? '' },
    { label: TS.tyreSramRim, value: rim },
    { label: TS.tyreSramInner, value: `${mm(v.rimInnerMm)} mm` },
    { label: TS.tyreSramRide, value: v.surface === 'paved' ? TS.tyreSramRoad : TS.tyreSramGravel },
    { label: TS.tyreSramWet, value: v.wet ? TS.tyreSramWetWord : TS.tyreSramDryWord },
  ];
}

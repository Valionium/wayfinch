// The cross-check with SRAM (spec section 7.2): a link, and the list of exactly what to type there. Nothing is prefilled or sent, and no
// SRAM formula is here: this only reads the screen's own values back to the rider.
import { W } from '../../core/wording/en.ts';
import type { Values } from './model.ts';
import { WHEELS } from './tables.ts';

export const SRAM_URL = 'https://axs.sram.com/guides/tire/pressure';

const kg = (n: number): string => `${Number(n.toFixed(1))} kg`;
const mm = (n: number): string => String(Number(n.toFixed(1)));

export function sramList(v: Values): { label: string; value: string }[] {
  const placed = v.load.byPositionKg ?? {};
  const pack = placed.pack ?? 0; // a backpack counts as rider
  const gear = v.bikeKg + v.load.unplacedKg + (v.load.emptyLuggageKg ?? 0) + Object.entries(placed).reduce((a, [k, n]) => a + (k === 'pack' ? 0 : (n ?? 0)), 0);
  const rim = v.rimType === 'unset' ? W.tyreSramRimUnset : { hooked: W.tyreRimHooked, hookless: W.tyreRimHookless, tubular: W.tyreRimTubular }[v.rimType];
  const casing = { supple: W.tyreSramThin, standard: W.tyreCasingStandard, reinforced: W.tyreCasingReinforced }[v.casing];
  return [
    { label: W.tyreSramRider, value: kg(v.riderKg + pack) },
    { label: W.tyreSramGear, value: kg(gear) },
    {
      label: W.tyreSramWidth,
      value: v.front.printedMm === v.rear.printedMm ? W.tyreSramWidthBoth(mm(v.front.printedMm)) : W.tyreSramWidthEach(mm(v.front.printedMm), mm(v.rear.printedMm)),
    },
    { label: W.tyreSramCasing, value: casing },
    { label: W.tyreSramWheel, value: WHEELS.find((w) => w.bsdMm === v.wheelBsdMm)?.label ?? '' },
    { label: W.tyreSramRim, value: rim },
    { label: W.tyreSramInner, value: `${mm(v.rimInnerMm)} mm` },
    { label: W.tyreSramRide, value: v.surface === 'paved' ? W.tyreSramRoad : W.tyreSramGravel },
    { label: W.tyreSramWet, value: v.wet ? W.tyreSramWetWord : W.tyreSramDryWord },
  ];
}

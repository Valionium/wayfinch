// The twenty cases of docs/research/2026-10-29-tyre.json (the owner's project folder), each with every input stated.
// "split a/b" in the research means the wheel loads are total x a and total x b, so every case here gives measured wheel loads
// (the same arithmetic as a split); the bike's defaults therefore never change a case. Ranges are in bar.
import type { TyreInput } from '../../../../src/tools/tyre/core.ts';

export type Band = 'berto' | 'schwalbe' | 'enve' | 'limit' | 'info';
export type Range = [number, number];

/** A complete input; a case overrides what it needs. */
export function tyreInput(over: Partial<TyreInput> = {}): TyreInput {
  return {
    riderKg: 75,
    bikeKg: 15,
    load: { byPositionKg: null, unplacedKg: 0, emptyLuggageKg: null },
    measured: null,
    bars: 'drop',
    front: { printedMm: 28, caliperMm: null },
    rear: { printedMm: 28, caliperMm: null },
    casing: 'standard',
    setup: 'tubeless',
    rimType: 'hooked',
    rimInnerMm: 19,
    wheelBsdMm: 622,
    surface: 'paved',
    wet: false,
    tyreMax: { value: 9, unit: 'bar' },
    tyreMin: null,
    rimMax: null,
    ...over,
  };
}

/** Wheel loads from a total mass and the front share. */
export const wheelLoads = (totalKg: number, frontShare: number) => ({ frontKg: totalKg * frontShare, rearKg: totalKg * (1 - frontShare) });

export interface Case {
  id: string;
  band: Band;
  input: TyreInput;
  /** Ranges of the unrounded estimate after the limits. */
  front?: Range;
  rear?: Range;
  /** Shown values that must be exact to 0.01 bar. */
  exactFront?: number;
  exactRear?: number;
}

const w = (over: Partial<TyreInput>, totalKg: number, share: number): TyreInput =>
  tyreInput({ ...over, measured: wheelLoads(totalKg, share), riderKg: totalKg - 10, bikeKg: 10 });

export const CASES: Case[] = [
  { id: 'TC01', band: 'berto', input: w({ front: { printedMm: 28, caliperMm: 28 }, rear: { printedMm: 28, caliperMm: 28 }, setup: 'butyl' }, 90.7, 0.5), front: [4.72, 5.76], rear: [4.72, 5.76] },
  { id: 'TC02', band: 'berto', input: w({ front: { printedMm: 37, caliperMm: 37 }, rear: { printedMm: 37, caliperMm: 37 }, setup: 'butyl' }, 100, 0.45), front: [2.79, 3.41], rear: [3.29, 4.02] },
  { id: 'TC03', band: 'schwalbe', input: w({ front: { printedMm: 25, caliperMm: null }, rear: { printedMm: 25, caliperMm: null }, casing: 'supple' }, 82, 0.48), front: [5.1, 6.5], rear: [5.54, 7.06] },
  { id: 'TC04', band: 'schwalbe', input: w({ casing: 'supple' }, 77, 0.48), front: [4.05, 5.15], rear: [4.22, 5.38] },
  { id: 'TC05', band: 'schwalbe', input: w({ front: { printedMm: 30, caliperMm: null }, rear: { printedMm: 30, caliperMm: null }, casing: 'supple' }, 87, 0.48), front: [4.05, 5.15], rear: [4.22, 5.38] },
  { id: 'TC06', band: 'enve', input: w({ front: { printedMm: 40, caliperMm: null }, rear: { printedMm: 40, caliperMm: null }, rimInnerMm: 23, surface: 'unpaved' }, 83, 0.5), front: [1.89, 2.55], rear: [1.89, 2.55] },
  { id: 'TC07', band: 'enve', input: w({ rimInnerMm: 25, surface: 'unpaved' }, 92, 0.5), front: [2.53, 3.43], rear: [2.53, 3.43] },
  { id: 'TC08', band: 'enve', input: w({ front: { printedMm: 50, caliperMm: null }, rear: { printedMm: 50, caliperMm: null }, rimInnerMm: 25, surface: 'unpaved' }, 92, 0.5), front: [1.39, 1.87], rear: [1.39, 1.87] },
  { id: 'TC09', band: 'enve', input: w({ front: { printedMm: 45, caliperMm: null }, rear: { printedMm: 45, caliperMm: null }, rimInnerMm: 27, wheelBsdMm: 584, surface: 'unpaved' }, 78, 0.5), front: [1.55, 2.09], rear: [1.55, 2.09] },
  { id: 'TC10', band: 'enve', input: w({ front: { printedMm: 35, caliperMm: null }, rear: { printedMm: 35, caliperMm: null }, rimInnerMm: 21, surface: 'unpaved' }, 110, 0.5), front: [2.71, 3.67], rear: [2.71, 3.67] },
  { id: 'TC11', band: 'enve', input: w({ front: { printedMm: 40, caliperMm: null }, rear: { printedMm: 40, caliperMm: null }, rimInnerMm: 23, surface: 'unpaved' }, 80, 0.47), front: [1.87, 2.53], rear: [1.96, 2.66] },
  { id: 'TC12', band: 'enve', input: w({ front: { printedMm: 45, caliperMm: null }, rear: { printedMm: 45, caliperMm: null }, rimInnerMm: 23, surface: 'unpaved' }, 100, 0.47), front: [1.96, 2.65], rear: [2.06, 2.78] },
  { id: 'TC13', band: 'enve', input: w({ front: { printedMm: 33, caliperMm: 33 }, rear: { printedMm: 33, caliperMm: 33 }, surface: 'unpaved' }, 81.65, 0.47), front: [2.35, 3.17], rear: [2.43, 3.29] },
  { id: 'TC14', band: 'berto', input: w({ front: { printedMm: 50, caliperMm: null }, rear: { printedMm: 50, caliperMm: null }, rimInnerMm: 25, wheelBsdMm: 559, setup: 'butyl', surface: 'unpaved' }, 90, 0.5), front: [1.63, 2.17], rear: [1.63, 2.17] },
  { id: 'TC15', band: 'info', input: w({ front: { printedMm: 50, caliperMm: null }, rear: { printedMm: 50, caliperMm: null }, rimInnerMm: 25, surface: 'unpaved' }, 70, 0.47) },
  { id: 'TC16', band: 'limit', input: w({ rimType: 'hookless', rimInnerMm: 25, tyreMax: { value: 5, unit: 'bar' } }, 120, 0.45), exactFront: 5, exactRear: 5 },
  { id: 'TC17', band: 'limit', input: w({ front: { printedMm: 45, caliperMm: null }, rear: { printedMm: 45, caliperMm: null }, rimType: 'hookless', rimInnerMm: 25, tyreMax: { value: 4.5, unit: 'bar' } }, 140, 0.4), front: [2.65, 2.7], exactRear: 3 },
  { id: 'TC18', band: 'limit', input: w({ setup: 'butyl', tyreMax: { value: 6, unit: 'bar' } }, 130, 0.4), front: [5.7, 5.8], exactRear: 6 },
  { id: 'TC19', band: 'limit', input: w({ front: { printedMm: 40, caliperMm: null }, rear: { printedMm: 40, caliperMm: null }, casing: 'reinforced', setup: 'butyl', tyreMin: { value: 3.5, unit: 'bar' }, tyreMax: { value: 6, unit: 'bar' } }, 125, 0.38), rear: [4.95, 5.05], exactFront: 3.5 },
];

/** TC19's tubeless variant: not raised, a warning only. */
export const TC19_TUBELESS = (): TyreInput => ({ ...CASES.find((c) => c.id === 'TC19')!.input, setup: 'tubeless' });

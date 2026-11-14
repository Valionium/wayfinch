// Bike records as a page might hold them (spec section 7.1, "Bikes" and "New bike fields"): valid values, out-of-range ones, wrong
// types and unknown fields mixed, so both readers meet everything the table allows and much it does not.
import fc from 'fast-check';

const oneOfOr = <T>(valid: readonly T[]) => fc.oneof(fc.constantFrom(...valid), fc.constant('nonsense'), fc.constant(null), fc.integer({ min: -5, max: 500 }));
const numberish = (min: number, max: number) => fc.oneof(
  fc.double({ min, max, noNaN: true }), fc.integer({ min: Math.floor(min) - 50, max: Math.ceil(max) + 50 }),
  fc.double({ min, max, noNaN: true }).map((n) => n.toFixed(1)), fc.constant('wide'), fc.constant(null), fc.constant(Number.NaN),
);
const maybe = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: undefined });
const textish = (max: number) => fc.oneof(fc.string({ maxLength: max + 20 }), fc.constant(7), fc.constant(null), fc.constant('  spaced  '));
const yn = fc.constantFrom('yes', 'no', 'unknown', 'maybe', true, null);

const size = fc.oneof(
  fc.record({ kind: fc.constant('letter'), value: fc.constantFrom('XS', 'S', 'M', 'L', 'XL', 'XXL') }),
  fc.record({ kind: fc.constant('cm'), value: numberish(40, 70) }),
  fc.record({ kind: fc.constant('in'), value: numberish(12, 23) }),
  fc.constant(null), fc.constant('M'),
);

const fit = fc.record({
  style: oneOfOr(['unknown', 'diamond-level', 'diamond-sloping', 'compact', 'trapeze', 'mixte', 'step-through', 'full-suspension']),
  size,
  bolts: fc.oneof(fc.record({ st: yn, dt: yn, un: yn }), fc.constant(null)),
  topTubeBag: yn,
  triangleCm: fc.oneof(fc.record({ top: numberish(15, 90), seat: numberish(15, 90), down: numberish(15, 90) }), fc.constant(null)),
  seatGapCm: numberish(3, 60),
  barWidthCm: numberish(10, 80),
}, { requiredKeys: [] });

const look = fc.record({
  colour: fc.oneof(fc.constantFrom('#2563B8', '#1d1d1f', '#F4F4F2', 'red', '#12345', '#1234567', null)),
  bars: oneOfOr(['drop', 'flat', 'other']),
  ebike: fc.constantFrom(true, false, 'yes', null),
  motor: oneOfOr(['cranks', 'rear-hub', 'front-hub']),
}, { requiredKeys: [] });

const geometry = fc.record({
  at: fc.constantFrom('2026-10-29T10:00:00Z', '2026-10-29', '2026-02-30', 'yesterday', null),
  maker: textish(60), model: textish(100), year: numberish(1980, 2100), size: textish(20),
  wheel: oneOfOr(['700c', '650b', '650c', '29', '27.5', '26']),
  values: fc.dictionary(fc.constantFrom('stack_mm', 'reach_mm', 'head_angle_deg', 'chainstay_mm', 'wings_mm'),
    fc.oneof(fc.record({ v: numberish(20, 800), src: fc.constantFrom('table', 'measured', 'estimate', 'guess') }), fc.constant(5))),
}, { requiredKeys: [] });

const pressure = fc.record({
  bikeKg: numberish(3, 100), wheel: oneOfOr(['unknown', '700c', '650b', '650c', '29', '27.5', '26']),
  rim: oneOfOr(['unknown', 'tube-crochet', 'tubular', 'tubeless-crochet', 'hookless']),
  rimMm: numberish(5, 100), frontMm: numberish(10, 150), rearMm: numberish(10, 150),
  frontCasing: oneOfOr(['unknown', 'thin', 'standard', 'reinforced']), rearCasing: oneOfOr(['unknown', 'thin', 'standard', 'reinforced']),
  frontMinBar: numberish(0, 15), frontMaxBar: numberish(0, 15), rearMinBar: numberish(0, 15), rearMaxBar: numberish(0, 15),
}, { requiredKeys: [] });

/** One raw bike record, as JSON could hold it: any field may be missing, wrong or out of range. */
export const rawBike = (): fc.Arbitrary<Record<string, unknown>> => fc.record({
  id: fc.oneof(fc.stringMatching(/^bike_[a-z0-9]{1,12}$/), fc.constant('has space'), fc.constant('')),
  name: maybe(textish(100)), frontTyre: maybe(fc.oneof(fc.constantFrom('40-622', '700 x 28C', '29 x 2.2', 'fat'), textish(120))),
  rearTyre: maybe(textish(120)), padType: maybe(textish(120)), chainType: maybe(textish(120)), hangerType: maybe(textish(120)), notes: maybe(textish(1000)),
  tyres: maybe(oneOfOr(['unknown', 'tubes', 'tubeless', 'other'])), valve: maybe(oneOfOr(['unknown', 'presta', 'schrader', 'dunlop', 'other'])),
  brakes: maybe(oneOfOr(['unknown', 'hydraulic-disc', 'cable-disc', 'rim', 'other'])), drive: maybe(oneOfOr(['unknown', 'derailleur', 'chain-hub', 'belt'])),
  shifting: maybe(oneOfOr(['unknown', 'cable', 'electronic', 'none'])),
  suspension: maybe(fc.oneof(oneOfOr(['unknown', 'none', 'front', 'full']), fc.constantFrom('Full', true, 'rigid'))),
  rackMounts: maybe(fc.oneof(oneOfOr(['unknown', 'yes', 'no']), fc.constantFrom('Yes', true, false, 'maybe'))),
  axle: maybe(fc.oneof(oneOfOr(['unknown', 'thru', 'qr', 'nuts']), fc.constantFrom('QR', true, 12))),
  rimBrake: maybe(fc.oneof(oneOfOr(['unknown', 'caliper', 'v-brake', 'hydraulic']), fc.constantFrom('disc', true))),
  brakeFluid: maybe(fc.oneof(oneOfOr(['unknown', 'mineral', 'dot']), fc.constantFrom('DOT', true))),
  pressure: maybe(pressure), fit: maybe(fc.oneof(fit, fc.constant(null))), maxWeight: maybe(fc.record({
    v: numberish(0.1, 900), u: fc.constantFrom('kg', 'lb', 'st'), includes: fc.constantFrom('bike', 'no-bike', 'unsure', 'maybe'),
  })), maxWeightAsked: maybe(fc.constantFrom(true, false, 'yes')), look: maybe(fc.oneof(look, fc.constant(null))),
  geometry: maybe(fc.oneof(geometry, fc.constant(null))), wings: maybe(fc.integer()),
}, { requiredKeys: ['id'] }) as fc.Arbitrary<Record<string, unknown>>;

/** A bike library, `loadcheck:bikeProfiles`: up to 20 bikes. */
export const bikeLibrary = (): fc.Arbitrary<Record<string, unknown>[]> => fc.array(rawBike(), { maxLength: 20 });

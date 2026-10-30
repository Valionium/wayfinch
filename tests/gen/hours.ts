import fc from 'fast-check';

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const time = (): fc.Arbitrary<string> =>
  fc.tuple(fc.integer({ min: 0, max: 24 }), fc.constantFrom(0, 15, 30, 45)).map(([h, m]) => `${String(h).padStart(2, '0')}:${h === 24 ? '00' : String(m).padStart(2, '0')}`);
const span = (): fc.Arbitrary<string> => fc.tuple(time(), time()).map(([a, b]) => `${a}-${b}`);
const days = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constantFrom('Mo-Su', 'Mo-Fr', 'Sa,Su', 'Mo-Sa', 'PH', 'Su,PH'),
    fc.tuple(fc.constantFrom(...DAYS), fc.constantFrom(...DAYS)).map(([a, b]) => `${a}-${b}`),
  );
const rule = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.tuple(days(), span()).map(([d, s]) => `${d} ${s}`),
    // lunch break
    fc.tuple(days(), span(), span()).map(([d, a, b]) => `${d} ${a},${b}`),
    fc.tuple(days()).map(([d]) => `${d} off`),
    fc.constant('24/7'),
  );

/** Opening-hours values from the opening_hours syntax, with PH and lunch breaks, plus invalid ones (section 12.2). */
export const hoursValue = (): fc.Arbitrary<string> =>
  fc.oneof(
    { weight: 6, arbitrary: fc.array(rule(), { minLength: 1, maxLength: 3 }).map((r) => r.join('; ')) },
    { weight: 1, arbitrary: fc.constantFrom('', 'by appointment', 'Mo-Fr 25:00-26:00', 'sunrise-sunset', 'Mo 9-', 'open', 'Tu-Mo 10:00-12:00;;') },
  );

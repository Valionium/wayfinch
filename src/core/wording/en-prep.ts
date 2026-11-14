// Trip prep: "Before you leave" on Trip's Go step (design of 15 November 2026). Apart from en.ts, so only the Go step's chunk carries them.
// Under the banned-words test (tests/unit/core/wording-prep.test.ts).

export const PR = {
  prepTitle: 'Before you leave',
  prepIntro: 'Your own list for this route. Ticks stay on this phone.',
  prepKit: 'Pack a repair kit that fits your bike. Bike care lists one under Roadside repairs, What to carry.',
  prepCharge: "Charge what runs on a battery: lights, phone, power bank, and the bike's own if it has one. Switch the lights on once.",
  prepForecast: 'The day before you leave, prepare this route again for a fresh forecast.',
  prepTell: 'Tell someone your route, where you plan to stop and when you expect to be back.',
  prepNight: "Check where you sleep the first night: open that night, and booked if it takes bookings.",
  // the place Trip holds for night 1, named (sweep 2 of 15 Nov 2026, #6)
  prepNightAt: (name: string): string => `Check where you sleep the first night (${name}): open that night, and booked if it takes bookings.`,
  prepInCare: 'In Bike care',
  prepInCareLabel: (what: string): string => `In Bike care: ${what}`,
  prepNotKept: 'That tick could not be kept on this phone. It shows until you leave this screen.',
};

/**
 * The bike checks: Bike care's own task names (en-care.ts), word for word; a test holds them equal. Not imported from there, since
 * that would take Bike care's content out of its own chunk (BC-CHUNK) and load it with Trip.
 */
export const PREP_CHECKS: Readonly<Record<string, string>> = {
  'brakes-lever-test': 'Test both brakes',
  'tyres-pressure': 'Check the tyre pressure and look the tyres over',
  'chain-wear-check': 'Check the chain for wear',
  'brakes-pads-disc': 'Check the disc brake pads and replace if worn',
  'brakes-pads-rim': 'Check the rim brake pads and rim wear',
  'frame-bolts-check': 'Check the main bolts',
};

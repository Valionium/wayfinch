// Trip prep: "Before you leave" on Trip's Go step (design of 15 November 2026). Apart from en.ts, so only the Go step's chunk carries them.
// The bike checks' names are Bike care's own (en-care.ts), never copied here. Under the banned-words test (tests/unit/core/wording-prep.test.ts).

export const PR = {
  prepTitle: 'Before you leave',
  prepIntro: 'Your own list for this route. Ticks stay on this phone.',
  prepKit: 'Pack a repair kit that fits your bike. Bike care lists one under Roadside repairs, What to carry.',
  prepCharge: "Charge what runs on a battery: lights, phone, power bank, and the bike's own if it has one. Switch the lights on once.",
  prepForecast: 'The day before you leave, update Prepare this route for a fresh forecast.',
  prepTell: 'Tell someone your route, where you plan to stop and when you expect to be back.',
  prepNight: (name: string | null): string => (name === null
    ? "Check the first night's place: open that night, and booked if it takes bookings."
    : `Check that ${name} is open on your first night, and book it if it takes bookings.`),
  prepInCare: 'In Bike care',
  prepInCareLabel: (what: string): string => `In Bike care: ${what}`,
  prepOpenPrepare: 'Open Prepare this route',
  prepOpenShare: 'Share progress on En route',
  prepNotKept: 'That tick could not be kept on this phone. It shows until you leave this screen.',
};

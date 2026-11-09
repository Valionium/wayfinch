// Remove this trip's words (owner's wish, 9 November 2026): the button in Trip's Route step and its confirm step, in a module of their
// own that only the confirm step's chunk loads, so the first screen does not carry them. They follow the same rules as en.ts: the
// banned-words test reads this object too (tests/unit/core/wording-remove.test.ts).

export const RT = {
  appTripRemove: 'Remove this trip',
  appTripRemoveAsk: 'Remove this trip?',
  appTripRemoveGoes: (name: string): string =>
    `Goes: the route “${name}”, its date and days, what Get ready offline saved for it (places, opening hours, weather), and your position, water and day plan in En route.`,
  appTripRemoveStays: 'Stays: your bikes, setups and Bag planner plans, your details and rides in You, and your settings.',
  appTripRemoveAfter: 'Trip and En route then start over, as on the first day. This cannot be undone.',
  appTripRemoveYes: 'Remove trip',
  appTripRemoveNo: 'Keep it',
  appTripRemoving: 'Removing…',
  appTripRemoveFailed: 'The trip could not be removed, so nothing was changed. Try again.',
};

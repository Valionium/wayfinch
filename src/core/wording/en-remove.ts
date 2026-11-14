// Remove this trip's words (owner's wish, 9 November 2026): the button in Trip's Route step and its confirm step, in a module of their
// own that only the confirm step's chunk loads, so the first screen does not carry them. They follow the same rules as en.ts: the
// banned-words test reads this object too (tests/unit/core/wording-remove.test.ts).

export const RT = {
  appTripRemove: 'Remove this trip',
  appTripRemoveAsk: 'Remove this trip?',
  appTripRemoveGoes: (name: string): string =>
    `Goes: the route “${name}”, its date, nights and days, and all Prepare this route saved for it (places, opening hours, weather, map data). Also your position, water and day plan in En route, and your Before you leave ticks.`,
  appTripRemoveStays: 'Stays: your bikes, setups and Bag planner plans, your details and rides in You, and your other settings.',
  appTripRemoveAfter: 'Trip and En route then start over, as on the first day. This cannot be undone.',
  appTripRemoveYes: 'Remove trip',
  appTripRemoveNo: 'Keep it',
  appTripRemoving: 'Removing…',
  appTripRemoveFailed: 'The trip could not be removed, so nothing was changed. Try again.',
  appTripRemoveNotPutBack: 'The trip could not be removed. It is still here, but its day plan or nights may be gone. Check them, then try again.',
  appTripRemoved: 'Trip removed. Trip and En route start over.',
};

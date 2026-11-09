// What the rider is told when "Update ready, apply now" does not go through (spec section 9.1), in their own module so that the first screen
// does not carry them: they show only after a tap, and update.ts fetches them then. The same rules as en.ts (the banned-words test reads this too).

export const U = {
  notSaved: 'Your data could not be saved on this device, so the update was not applied. Export it, then try again.',
  notYet: 'The update has not applied yet. It will once every window of the app has closed.',
  failed: 'The update could not be applied. Try again.',
};

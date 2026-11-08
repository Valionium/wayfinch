// Trip's longer words that only its own lazy chunks show (the replace question, Plan from A to B, Get ready offline's step and its
// run), in a module of their own so that the first screen does not carry them (after the launch, part 4a: the first screen may not
// grow, APP-4A-FIRST). They follow the same rules as en.ts: the banned-words test reads this object too
// (tests/unit/core/wording-trip.test.ts), and the keys keep their names from en.ts.

export const TR = {
  appTripReplaceBody: (oldName: string, newName: string, km: string): string => `“${newName}” (${km} km) would replace “${oldName}”. The places, forecast, positions, departure date and nights saved for the old route are removed. The departure date goes back to today and the nights to the stage model's suggestion; pace, speed, start time, stay and camp water stay.`,
  appTripReplacedNoDate: (name: string): string => `Replaced with “${name}”, but its departure date was not saved. Set the date in the Route step.`,
  appTripGetReadyIntro: "Saves this route's map data, opening hours and a forecast on this phone, so the answers work without signal.",
  appTripPartial: 'Some steps did not finish. The answers use what was saved and name what is missing. Try again when you have signal.',
  appTripIphoneAsk: 'On an iPhone or iPad, first add Wayfinch to your home screen (Share, then Add to Home Screen), open it from there and do Get ready offline in that app. Safari can remove what a browser tab saved after seven days without a visit.',
  appAbNote: 'The words you search for go to a place-search service. Planning sends the start and end points to a bike router.',
  appAbNone: 'No bike router answered, so no route was planned. Plan it in another app and add it as a GPX file.',
};

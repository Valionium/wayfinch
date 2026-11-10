// The first-run bike hint's words that only lazy parts show (wish 17, design of 9 Nov 2026, sections 4 and 5): the one-time line after
// the first bike, the Tools bike line with no bike, and the "fits better" lines of the tools. The card's own words are on the first
// screen, in en.ts (bikeHint*). Each "fits better" line is the words before its link, the link, and the words after. They state a fact
// about the result in front of the rider, never a request. The banned-words test reads this object (tests/unit/core/wording-hint.test.ts).

export const HN = {
  hintEveryTool: 'Your bike is in every tool now: bags, tyre pressure and bike care fit it.',
  hintToolsTypical: 'a typical gravel bike',
  hintToolsAdd: 'Add yours',
  hintAdd: 'Add your bike',
  hintFitTyre: 'No saved bike, so nothing is filled in.',
  hintFitTyreAfter: 'and its tyre sizes fill in here.',
  hintFitCare: 'For any bike: everything shows.',
  hintFitCareAfter: 'and only what fits it shows.',
  // the card's colour dots (design section 4.2): the group's name; each dot is named by its swatch
  hintTryColour: 'Try a colour',
};

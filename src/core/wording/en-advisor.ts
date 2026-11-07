// The Gear advisor's words (sub-project 13), in their own module so neither app's first screen carries them: they reach the bag planner
// in /tools/bags/advisor.js. Same rules as en.ts: the banned-words test reads this object too (tests/unit/core/wording-advisor.test.ts),
// and every key starts with `advisor`. Types and sizes only, never brands or models.

export const GA = {
  // ---- tags shown with a suggestion ----
  advisorTagRackMounts: 'if your bike has rack mounts',
  advisorTagForkMounts: 'needs cage mounts on the fork',
  advisorTagTight: 'tight',
  advisorTagEstimate: 'estimate',
  advisorTagUnlikely: 'unlikely to fit',
  // The bag planner's own caution for a small frame with no measured seat gap (bagSpec's seat note), shortened to a tag.
  advisorTagSmallFrame: 'small frame: check the clearance under the saddle',
  // ---- an answer ----
  // Get the backpack off, when litres stay on the back and nothing takes 0.5 L more off it (review of PR 57, I4).
  advisorCannotReduce: 'No bag here takes more off your back.',
  // ---- a size range: "6–8 L", or "6 L" when only one size is valid ----
  advisorRange: (from: number, to: number): string => (from === to ? `${from} L` : `${from}–${to} L`),
} as const;

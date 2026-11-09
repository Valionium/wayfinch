// Three of the tyre tool's warnings that only its own chunk shows, in their own module so that the first screen does not carry them
// (moved from en.ts as they were, 9 Nov 2026, to pay for the tabs' subtitles). The same rules as en.ts: tests/unit/core/wording-prepare.test.ts
// reads this object too.

export const TW = {
  tyreWarnBelowEtrto: (label: string, mm: string): string => `${label} is below ETRTO minimum width (${mm} mm) for this rim, unless the rim maker approves the pairing.`,
  tyreWarnHeatPump: (label: string, bar: string, psi: string): string => `Pump to at most ${bar} bar (${psi} psi) for the ${label.toLowerCase()} tyre: the heat and height later on the trip raise it from there.`,
  tyreWarnHeatBelowFloor: (label: string): string => `${label}: the pressure the heat allows is below the minimum for this tyre. Pump lower, or start the day cooler, and check often.`,
};

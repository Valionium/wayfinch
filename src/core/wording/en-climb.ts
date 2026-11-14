// Climb check on Trip (the owner's idea of 14 November 2026), in a module of its own that only the route summary's chunk and the
// climb list's chunk load, so the first screen does not carry it. The same rules as en.ts hold: the banned-words test reads this
// object too (tests/unit/core/wording-climb.test.ts). Every figure is an estimate and says so; no gear and no health advice.

export const CC = {
  appClimbButton: 'Climb check',
  appClimbAbout: 'The climbs of this route, the hardest first, with time estimates.',
  appClimbLead: (kph: string): string =>
    `Estimates from the route's heights and your flat speed of ${kph} km/h with a loaded bike. Short ramps can be steeper than these figures.`,
  appClimbEbike: 'Your bike has a motor, so Climb check does not judge whether a climb is a walk: that depends on its assist.',
  appClimbNoHeights: "Climb check needs the route's heights. Prepare this route looks them up.",
  appClimbNone: 'No climb on this route gains 100 m at 3% or more.',
  appClimbListLabel: 'Climbs, the hardest first',
  appClimbWhere: (day: number | null, from: string, to: string): string => `${day === null ? '' : `Day ${day} · `}km ${from} to ${to}`,
  appClimbFigures: (km: string, up: string, avg: string, steepest: string): string => `${km} km · ${up} m up · average ${avg}% · steepest 500 m ${steepest}%`,
  appClimbTime: (min: number): string => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `About ${h > 0 ? `${h} h${m > 0 ? ` ${m} min` : ''}` : `${m} min`} of riding (estimate)`;
  },
  appClimbNoTime: 'No time estimate: the flat speed in Trip details is outside 15 to 40 km/h.',
  appClimbSteady: 'A steady climb. Start easy and keep a pace you could hold to the top.',
  appClimbSteep: 'Steep in places: a slow climb in low gears with a loaded bike.',
  appClimbWalk: 'Likely a walk in places with a loaded bike. Pushing is slow too: allow more time than the estimate.',
  appClimbMore: (n: number): string => `${n} smaller ${n === 1 ? 'climb is' : 'climbs are'} not listed.`,
};

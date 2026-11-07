// Bike care's content and fitting types (sub-project 12; design 3.2 and 3.3). Pure data: no DOM, no storage.

/** The sections of the Care list, in design 3.1's order. */
export type Section = 'ride' | 'wet' | 'week' | 'month' | 'half-year' | 'year' | 'notice';
/** The part filters, in design 3.1's order. */
export type Part = 'chain' | 'brakes' | 'tyres' | 'gears' | 'wheels' | 'suspension' | 'ebike' | 'frame';
/** The bike details a task can depend on. */
export type CareKey = 'brakes' | 'tyres' | 'drive' | 'gears' | 'shifting' | 'suspension' | 'ebike';
export type CareValue = {
  brakes: 'rim' | 'cable-disc' | 'hydraulic-disc'; tyres: 'tubes' | 'tubeless'; drive: 'chain' | 'belt';
  gears: 'derailleur' | 'hub'; shifting: 'cable' | 'electronic'; suspension: 'none' | 'front' | 'full'; ebike: 'yes' | 'no';
};
/** All keys must hold ("and"); values inside one key are "or". */
export type Conditions = { [K in CareKey]?: CareValue[K][] };
/** null = Not sure; 'other' = a real answer outside the list. */
export type CareDetails = { [K in CareKey]: CareValue[K] | 'other' | null };
/**
 * `minutes` is null only where the content gives no time in minutes (a storage habit, a shop job of "several hours"); the screen then
 * shows none. `why` is the content's own words for who does it and why, null when it is only the `who` label. `note` holds the content's
 * lines after the steps and time (what else to know), null when there are none.
 */
export type CareTask = {
  id: string; name: string; part: Part; section: Section; alsoWet: boolean; signs: string;
  steps: string[]; tools: string; minutes: [number, number] | null; who: 'you' | 'shop' | 'you-check'; why: string | null;
  note: string | null; words: string[]; applies: Conditions; critical: boolean;
  /**
   * Conditions that never hide the task: while the bike does not meet them (a detail Not sure, or another answer), the task shows with
   * `tag` (coordinator's ruling R3 on PR 58: a needed task missed is worse than one extra).
   */
  soft?: { applies: Conditions; tag: string };
};
export type RoadCard = { id: string; problem: string; applies: Conditions; checkFirst: string; steps: string[]; rideOn: string; carry: string[]; words: string[]; critical: boolean };
export type CarryItem = { id: string; name: string; applies: Conditions };
/** The keys a task depends on that are Not sure. */
export type Fitted<T> = T & { tags: CareKey[] };

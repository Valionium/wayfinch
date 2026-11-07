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
export type CareTask = {
  id: string; name: string; part: Part; section: Section; alsoWet: boolean; signs: string;
  steps: string[]; tools: string; minutes: [number, number]; who: 'you' | 'shop' | 'you-check'; why: string | null;
  words: string[]; applies: Conditions; critical: boolean;
};
export type RoadCard = { id: string; problem: string; applies: Conditions; checkFirst: string; steps: string[]; rideOn: string; carry: string[]; words: string[]; critical: boolean };
export type CarryItem = { id: string; name: string; applies: Conditions };
/** The keys a task depends on that are Not sure. */
export type Fitted<T> = T & { tags: CareKey[] };

// The Gear advisor's types (sub-project 13; design docs/superpowers/specs/2026-11-05-gear-advisor-design.md §3). The search is pure:
// the bag planner page hands it its own bagSpec (`usable`) and a thin wrapper over its own planWith (`trial`), so the frozen
// selection is only ever called, never copied (decision 1).

/** The planner's positions (`POSITIONS`), and `deck` for kit strapped on the rack deck. */
export type Pos = 'top' | 'frame' | 'fork' | 'bar' | 'seat' | 'rack' | 'pack' | 'bottle' | 'bottleU' | 'deck';

/** One entry of the planner's `bags[]`. `L` is litres per bag; a pair (`pair: true`) is two of them. */
export type BagIn = { uid: number; pos: Exclude<Pos, 'deck'>; L: number; pair?: boolean; slot?: string; shape?: number; userL?: boolean; hand?: boolean };

/** What the planner's packing gives for one set of bags; `items` is plan.items as the planner gives it. */
export type TrialResult = {
  overL: number; spillIds: string[]; backL: number; backKg: number; outOfReach: number;
  kgByPos: Partial<Record<Pos, number>>; items: Record<string, unknown[]>;
};

export type Decks = { rack: boolean; bar: boolean };

export type Usable = { ok: boolean; reason: string | null; band?: 'likely' | 'tight' | 'unlikely' };

export type AdvisorInput = {
  style: 'rack' | 'no-rack' | 'either'; goal: 'handling' | 'backpack';
  /** The questionnaire's mountain bike trails answer: no panniers even under Either (decision 5). */
  noPanniers: boolean;
  bags: BagIn[]; decks: Decks; camping: boolean; nextUid: number;
  /** The bike's own frame bag shapes (`bikeFit(bike).frameBag.shapes`), at their real litres; empty when it takes none. */
  frameShapes: { shape: number; L: number; source: string }[];
  /** Why the bike takes no frame bag, in the planner's own code (`NO_MOUNT`, `NO_ROOM`), or null. */
  frameReason: string | null;
  topSlotsFree: string[];
  rackMounts: 'yes' | 'no' | 'unknown';
  usable: (bag: BagIn) => Usable;                    // the page's bagSpec
  trial: (bags: BagIn[], decks: Decks) => TrialResult; // the page's planWith
};

export type Candidate = {
  kind: 'add' | 'swap' | 'add-two'; add: BagIn[]; remove: number | null; decks: Decks; newBags: number; litres: number;
  /** Words shown with the suggestion (src/core/wording/en-advisor.ts): rack or fork mounts, a tight seat pack, an estimated frame. */
  tags: string[];
};

export type Suggestion = Candidate & { result: TrialResult; score: number; rangeL: [number, number]; tags: string[] };

export type AdvisorAnswer =
  | { kind: 'suggestions'; items: Suggestion[]; tried: number; frameReason: string | null }   // 1 to 3, best first
  | { kind: 'already-good'; tried: number; frameReason: string | null }
  | { kind: 'nothing-helps'; closest: Suggestion | null; tried: number; frameReason: string | null };

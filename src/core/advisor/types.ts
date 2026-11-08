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

export type Setup = 'bags' | 'bags-first' | 'panniers';

export type Usable = { ok: boolean; reason: string | null; band?: 'likely' | 'tight' | 'unlikely' };

export type AdvisorInput = {
  /**
   * The setup the rider wants (the owner's ruling of 7 Nov): `bags` Bikepacking bags only (never panniers; a rack already fitted still
   * carries things on its deck), `bags-first` Bags first, panniers only if needed (the default), `panniers` Panniers are fine.
   */
  style: Setup;
  /** Better handling, Get the backpack off, or both together (the owner, 8 Nov): the back first, handling breaking its ties. */
  goal: 'handling' | 'backpack' | 'both';
  bags: BagIn[]; decks: Decks; camping: boolean; nextUid: number;
  /** Whether a rack is fitted, read from the plan before the setup applies (candidates.ts sets it; the page need not). */
  rackFitted?: boolean;
  /** The bike's own frame bag shapes (`bikeFit(bike).frameBag.shapes`), at their real litres; empty when it takes none. */
  frameShapes: { shape: number; L: number; source: string }[];
  /** Why the bike takes no frame bag, in the planner's own code (`NO_MOUNT`, `NO_ROOM`), or null. */
  frameReason: string | null;
  topSlotsFree: string[];
  /** Anything but 'yes' or 'no' (sub-project 11 stores Not sure as an absent field) reads as Not sure. */
  rackMounts: 'yes' | 'no' | 'unknown' | null | undefined;
  /** `bikeFit(bike).size` and `.seatGapCm` (null when not measured): bagSpec's small-frame seat pack caution reads them. */
  frameSize: string | null | undefined;
  seatGapCm: number | null | undefined;
  /**
   * The page's clock, kept out of the pure search (review of PR 61, I4): asked after each trial, true when the page wants its hand back
   * now (a slice of about 50 ms); the search also hands back after every 20 trials.
   */
  handBack?: () => boolean;
  usable: (bag: BagIn) => Usable;                    // the page's bagSpec
  trial: (bags: BagIn[], decks: Decks) => TrialResult; // the page's planWith
};

/**
 * `deck`: the rack deck alone, no bag: on the rack the plan has (no new bag), or on a rack to fit; the planner's own deck placement decides
 * what rides there. `ahead`: Looking ahead, Minimal's first suggestion as it stands plus one more thing (owner, 7 Nov).
 */
export type Candidate = {
  kind: 'add' | 'swap' | 'add-two' | 'deck' | 'ahead'; add: BagIn[]; remove: number | null; decks: Decks; newBags: number; litres: number;
  /** True when the candidate itself puts the rack deck on (not panniers bringing it, not a deck the rider has). */
  deck: boolean;
  /** Words shown with the suggestion (src/core/wording/en-advisor.ts): rack or fork mounts, a tight seat pack, an estimated frame. */
  tags: string[];
};

export type Suggestion = Candidate & { result: TrialResult; score: number; rangeL: [number, number]; tags: string[] };

/** `partial`: the search stopped at MAX_TRIALS, so the answer covers only what was tried. */
type AnswerCommon = { tried: number; frameReason: string | null; partial: boolean };
export type AdvisorAnswer =
  /**
   * `items`: Minimal, 1 to 3, best first; `ahead`: Looking ahead, a set that covers more, or null (owner, 7 Nov). Side by side (the
   * owner's rulings on PR 61): `minimalSame`, the indices of Minimal's suggestions that reach about the same result as the best of them
   * (two or more, else none); `aheadAlts`, up to two more sets of other bags reaching about the same as Looking ahead.
   */
  | ({ kind: 'suggestions'; items: Suggestion[]; ahead: Suggestion | null; minimalSame: number[]; aheadAlts: Suggestion[];
    /** Both goals, when nothing takes more off the back: the litres that stay there, and these suggestions are for handling (owner, 8 Nov). */
    backStays?: number } & AnswerCommon)
  | ({ kind: 'already-good' } & AnswerCommon)
  /** Get the backpack off only: litres stay on the back (backL) and nothing takes MIN_GAIN_BACK_L more off it. */
  | ({ kind: 'cannot-reduce'; backL: number } & AnswerCommon)
  | ({ kind: 'nothing-helps'; closest: Suggestion | null } & AnswerCommon);

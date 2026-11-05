// What Ahead's components are given (plan Task 15): the screen, as `screen()` built it, a few plain facts the shell read with it,
// and one actions object. The components import neither the store nor the network: `src/ui/shell-actions.ts` holds the only
// real actions, and a test can hand in its own.
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { EmergencyCard } from '../../core/engines/emergency.ts';
import type { Km } from '../../core/types.ts';
import type { Screen } from '../../core/screen/screen.ts';

/** What the last tap on Update position (or the manual picker) led to. Texts are the wording file's, set by the shell. */
export type PositionState =
  | { kind: 'idle' }
  | { kind: 'watching' }
  | { kind: 'said'; text: string }
  /** Two passes of the route are near: which one (section 6.1). */
  | { kind: 'ask'; question: string; options: { km: Km; text: string }[] };

export type Town = { name: string; km: Km };

export type AheadTrip = {
  kind: 'trip';
  screen: Screen;
  /** False only while no position exists and no day-1 plan applies (AH-FIRST-USE): then only the button and the picker. */
  answers: boolean;
  lengthKm: Km;
  towns: Town[];
  bike: BikeRecord | null;
  /** The amount "Still about 0.6 L?" offers, as shown; null when the card offers none. */
  stillAboutL: number | null;
  /** The trip's flat speed can't be used, so the cards say "can't be worked out": the shell shows the settings link. */
  badSpeed: boolean;
  /** The latest position is worse than about 1 km: the explanation of precise location shows. */
  approximateHelp: boolean;
  /** "Your position is from 14:20 (40 min ago)" for a position over 30 minutes old; null otherwise. */
  shareOld: string | null;
  /** Share progress's remembered map-link choice (copilot:share-progress). */
  mapLink: boolean;
  /** Whether this browser has a system share sheet. */
  canShare: boolean;
  position: PositionState;
  /** What the last Update weather said; null before a tap or after a fetch with nothing to say. */
  weatherSay: string | null;
  weatherBusy: boolean;
  /** A tap the store refused, said once at the top (Plan tomorrow, Back to today). */
  notice: string | null;
};

/** With no route there is no screen, but the Emergency card stands: 112 and the fallback line (section 6.9). */
export type AheadView =
  | { kind: 'loading' }
  | { kind: 'no-route'; emergency: EmergencyCard; canShare: boolean }
  /** The trip is there but could not be read: said so, with Try again, never "Add a route". */
  | { kind: 'unreadable'; emergency: EmergencyCard; canShare: boolean }
  | AheadTrip;

export type AheadActions = {
  updatePosition(): Promise<void>;
  /** A kilometre, or a town of `towns`: always on the route, and it overrides GPS (section 6.1). True once it is kept. */
  setManual(at: Km | Town): Promise<boolean>;
  /** One of the two kilometres a position near two passes was asked about. */
  choosePass(km: Km): Promise<void>;
  confirmWater(litres: number): Promise<string | null>;
  updateWeather(): Promise<void>;
  /** `date` is the riding date of the ride that ends: the screen's own `ride.date`. */
  planTomorrow(date: string): Promise<void>;
  backToToday(): Promise<void>;
  /** Reads the trip again, after a read that failed. */
  retry(): Promise<void>;
  setMapLink(on: boolean): void;
  /** The system share sheet with the text only. False when there is none or the rider closed it. */
  share(text: string): Promise<boolean>;
  copy(text: string): Promise<boolean>;
  /** The `sms:` address with the text as its body and no recipient. */
  smsHref(text: string): string;
  /** The screen again for the time now, from what was read: when Emergency or the share sheet opens. Nothing is read or sent. */
  freshen(): void;
};

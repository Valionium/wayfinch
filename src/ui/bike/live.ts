// The bike and the bag plan as the bag planner last saved them, kept current: a change in another window (the bag planner open in a
// second tab) arrives as a storage event and redraws every drawing at once (spec section 3.7, BK-TAP-INSTANT). Read-only.
import { signal } from '@preact/signals';
import type { BikeRecord } from '../../core/bike/normalise.ts';
import type { LoadSummary } from '../../core/types.ts';
import { readBike, readBikes, readLoadSummary } from '../../store/loadcheck-read.ts';

export type BikeSource = { bike: BikeRecord | null; bikes: BikeRecord[]; summary: LoadSummary | null; known: string[] };

const KEYS = ['loadcheck:bikeProfile', 'loadcheck:bikeProfiles', 'loadcheck:summary:v1'] as const;
const NONE: BikeSource = { bike: null, bikes: [], summary: null, known: [] };

/** The raw records last read, so a storage event that changed none of them changes nothing. */
let lastRaw = '';

function rawNow(): string {
  try {
    return KEYS.map((k) => localStorage.getItem(k) ?? '').join('\u0000');
  } catch {
    return '';
  }
}

function read(): BikeSource {
  try {
    const bike = readBike();
    const bikes = readBikes();
    const known = [...new Set([...(bike ? [bike.id] : []), ...bikes.map((b) => b.id)])];
    return { bike, bikes, summary: readLoadSummary(), known };
  } catch {
    // Storage the browser refuses to open: nothing is required, so the typical bike shows.
    return NONE;
  }
}

export const bikeSource = signal<BikeSource>(NONE);

/** Reads the bag planner's records again; the same records keep the same value, so nothing redraws for nothing. */
export function refreshBikeSource(): void {
  const raw = rawNow();
  if (raw === lastRaw && bikeSource.value !== NONE) return;
  lastRaw = raw;
  bikeSource.value = read();
}

let listening = false;
/** Once per page: another window's change to the bag planner's keys redraws the bike. */
export function listenForBikeChanges(target: Pick<Window, 'addEventListener'> = window): void {
  if (listening) return;
  listening = true;
  target.addEventListener('storage', (event) => {
    const key = (event as StorageEvent).key;
    if (key === null || key.startsWith('loadcheck:')) refreshBikeSource();
  });
}

if (typeof localStorage !== 'undefined') refreshBikeSource();
if (typeof window !== 'undefined') listenForBikeChanges();

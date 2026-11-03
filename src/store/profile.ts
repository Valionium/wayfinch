// The rider's profile (spec section 3.5), and the defaults `screen()` reads before You has been filled in.
import type { Profile } from '../core/types.ts';
import { inTx } from './db.ts';
import { noteCopy } from './changed.ts';

export const PROFILE_META = 'profile';

export const DEFAULT_PROFILE: Profile = { weightKg: null, thirst: 'average', ebike: false, capacityL: null, k: 1, sumW: 0, kDrink: 1, weighedRides: 0 };

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** A stored profile as it may be used: a field that's missing or damaged takes its default. */
export function usableProfile(raw: unknown): Profile {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<keyof Profile, unknown>>;
  const d = DEFAULT_PROFILE;
  return {
    weightKg: finite(p.weightKg) && p.weightKg > 0 ? p.weightKg : d.weightKg,
    thirst: p.thirst === 'less' || p.thirst === 'more' || p.thirst === 'average' ? p.thirst : d.thirst,
    ebike: typeof p.ebike === 'boolean' ? p.ebike : d.ebike,
    capacityL: finite(p.capacityL) && p.capacityL >= 0 ? p.capacityL : d.capacityL,
    k: finite(p.k) && p.k > 0 ? p.k : d.k,
    sumW: finite(p.sumW) && p.sumW >= 0 ? p.sumW : d.sumW,
    kDrink: finite(p.kDrink) && p.kDrink > 0 ? p.kDrink : d.kDrink,
    weighedRides: finite(p.weighedRides) && p.weighedRides >= 0 ? p.weighedRides : d.weighedRides,
  };
}

export async function readProfile(): Promise<Profile> {
  const { raw, stamp } = await inTx(['meta'], 'readonly', async (tx) => ({
    raw: (await tx.objectStore('meta').get(PROFILE_META)) as unknown,
    stamp: ((await tx.objectStore('meta').get(`updatedAt:${PROFILE_META}`)) as string | undefined) ?? null,
  }));
  noteCopy('profile', stamp);
  return usableProfile(raw);
}

// Which Care tasks fit a bike (sub-project 12; design 3.3). The bike's stored details become Bike care's details by sub-project 11
// decision 1's table.
import type { BikeRecord } from '../bike/normalise.ts';
import type { CareDetails, CareKey, Conditions, Fitted } from './types.ts';

/** Bike care's details of a bike; with no bike, every detail is Not sure (null). */
export function careDetails(bike: BikeRecord | null): CareDetails {
  if (!bike) return { brakes: null, tyres: null, drive: null, gears: null, shifting: null, suspension: null, ebike: null };
  const ebike = bike.look?.ebike;
  return {
    brakes: bike.brakes === 'unknown' ? null : bike.brakes,
    tyres: bike.tyres === 'unknown' ? null : bike.tyres,
    drive: bike.drive === 'unknown' ? null : bike.drive === 'belt' ? 'belt' : 'chain',
    gears: bike.drive === 'unknown' ? null : bike.drive === 'derailleur' ? 'derailleur' : 'hub',
    shifting: bike.shifting === 'unknown' ? null : bike.shifting === 'none' ? 'other' : bike.shifting,
    suspension: bike.suspension ?? (bike.fit?.style === 'full-suspension' ? 'full' : null),
    ebike: ebike === true ? 'yes' : ebike === false ? 'no' : null,
  };
}

/** A hydraulic brake's fluid (the owner's wish of 14 November 2026). */
export type Fluid = 'mineral' | 'dot';

/**
 * The bike's brake fluid, read only with hydraulic brakes (a hydraulic disc, or a hydraulic rim brake), as the kind of rim brake is read
 * only with rim brakes; null when it is not told, or the brakes are not hydraulic (an answer kept from before a change of brakes).
 */
export function careFluid(bike: BikeRecord | null): Fluid | null {
  if (!bike?.brakeFluid) return null;
  return bike.brakes === 'hydraulic-disc' || (bike.brakes === 'rim' && bike.rimBrake === 'hydraulic') ? bike.brakeFluid : null;
}

const KEYS: readonly CareKey[] = ['brakes', 'tyres', 'drive', 'gears', 'shifting', 'suspension', 'ebike'];

/**
 * Design 3.3 and decision 4: for each key a task depends on, a Not sure detail tags it, a value in the list passes, and any other value,
 * 'other' included, hides the task. No key: it shows with no tags.
 */
export function fitOf(applies: Conditions, d: CareDetails): { show: boolean; tags: CareKey[] } {
  const tags: CareKey[] = [];
  for (const key of KEYS) {
    const allowed = applies[key] as readonly string[] | undefined;
    if (!allowed) continue;
    const value = d[key];
    if (value === null) tags.push(key);
    else if (!allowed.includes(value)) return { show: false, tags: [] };
  }
  return { show: true, tags };
}

/** A task's soft tag (CareTask.soft): shown while the bike does not meet the soft conditions; null when it does, or with none. */
export function softTag(task: { soft?: { applies: Conditions; tag: string } }, d: CareDetails): string | null {
  if (!task.soft) return null;
  for (const key of KEYS) {
    const allowed = task.soft.applies[key] as readonly string[] | undefined;
    if (!allowed) continue;
    const value = d[key];
    if (value === null || !allowed.includes(value)) return task.soft.tag;
  }
  return null;
}

/** The items that fit, in the list's order, each with its tags. */
export function fitted<T extends { applies: Conditions }>(list: readonly T[], d: CareDetails): Fitted<T>[] {
  return list.flatMap((item) => {
    const f = fitOf(item.applies, d);
    return f.show ? [{ ...item, tags: f.tags }] : [];
  });
}

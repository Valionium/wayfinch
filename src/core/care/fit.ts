// Which Care tasks fit a bike (sub-project 12; design 3.3). The bike's stored details become Bike care's details by sub-project 11
// decision 1's table.
import type { BikeRecord } from '../bike/normalise.ts';
import type { CareDetails } from './types.ts';

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

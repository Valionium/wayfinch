// Personal factors and drinking advice (spec section 6.3). The code is split in two files so that the first screen carries only what
// the Water card reads (water-base.ts); the factors and the advice (water-factors.ts) load with You. This file keeps the one address.
export type { Ride } from './water-base.ts';
export { heatRule, uncertainty } from './water-base.ts';
export { drinkingAdvice, overDrinking, updateCarrying, updateDrinking } from './water-factors.ts';

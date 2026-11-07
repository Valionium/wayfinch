// A test list for Bike care's fitting: one task per shape of condition (none, each key alone, an "or" inside a key, two keys with "and").
import type { Conditions } from '../../../../src/core/care/types.ts';

export type Case = { id: string; applies: Conditions };

export const FIT_CASES: Case[] = [
  { id: 'none', applies: {} },
  { id: 'brakes-rim', applies: { brakes: ['rim'] } },
  { id: 'tyres-tubeless', applies: { tyres: ['tubeless'] } },
  { id: 'drive-belt', applies: { drive: ['belt'] } },
  { id: 'gears-hub', applies: { gears: ['hub'] } },
  { id: 'shifting-cable', applies: { shifting: ['cable'] } },
  { id: 'suspension-full', applies: { suspension: ['full'] } },
  { id: 'ebike-yes', applies: { ebike: ['yes'] } },
  { id: 'ebike-no', applies: { ebike: ['no'] } },
  { id: 'brakes-disc', applies: { brakes: ['cable-disc', 'hydraulic-disc'] } },
  { id: 'suspension-any', applies: { suspension: ['front', 'full'] } },
  { id: 'gears-derailleur-and-cable', applies: { gears: ['derailleur'], shifting: ['cable'] } },
  { id: 'tubes-and-chain', applies: { tyres: ['tubes'], drive: ['chain'] } },
];

// The 165 km rainy fixture of section 3.2's worked example, for Ahead's tests: Heidelberg to Strasbourg's length, Saturday 17
// October, the rider at km 125 at 14:20 in likely rain until about 15:00, a café at km 131. Places for every card and chip are
// added, so each part of the screen has something to show: a campsite and a bike shop with numbers, a shelter, a settlement.
import type { ScreenInputs, Trip } from '../../../src/core/types.ts';
import { bikeShop, busStop, cafe, campsite, flatRoute, pharmacy, pos, rescue, restaurant, settlement, shelter, station, tap, testTrip, toilet } from '../../fixtures/build.ts';
import { preparedHours } from '../core/engines/leaveby-helpers.ts';
import type { Spot } from '../core/engines/water-helpers.ts';
import { stamps } from '../core/engines/weather-helpers.ts';
import { inputsOf, type InputCase } from '../core/screen/screen-helpers.ts';

export const FRI = '2026-10-16';
export const SAT = '2026-10-17';

export const rainyTrip = (): Trip => testTrip({ route: flatRoute(165, { stageEnds: [70, 165] }), departureDate: FRI, stay: 'camping' });

export const RAINY_SPOTS: Spot[] = [
  { b: cafe('Mo-Su 08:00-18:00', { name: 'Café Lindenhof', tags: { indoor_seating: 'yes' } }), km: 131 },
  { b: restaurant('Mo-Su 11:00-23:00', { name: 'Winstub' }), km: 164.8 },
  { b: tap({ name: 'Brunnen am Markt' }), km: 140 },
  { b: campsite({ name: 'Camping Rheinaue', contact: { phones: ['+49 7221 123456', '+49 171 1234567'], website: 'https://camping-rheinaue.de' }, dataDate: '2026-10-28' }), km: 163 },
  { b: bikeShop('Mo-Sa 09:00-18:00', { name: 'Velo Kehl', contact: { phones: ['+49 7851 12345'], website: null }, dataDate: '2026-10-28' }), km: 150 },
  { b: bikeShop('Mo-Sa 09:00-18:00', { name: 'Rad Hecht', dataDate: '2026-10-28' }), km: 110 },
  { b: shelter({ name: 'Rheinhütte' }), km: 127 },
  { b: settlement('Rheinstetten'), km: 124 },
  { b: pharmacy('Mo-Sa 08:00-20:00', { name: 'Rhein-Apotheke' }), km: 135 },
  { b: station({ name: 'Kehl' }), km: 152 },
  { b: toilet('24/7', { name: 'WC Rheinufer' }), km: 128 },
];

/** The worked example, with places on every card and chip. `over` changes the moment. */
export function rainyStop(over: InputCase = {}): ScreenInputs {
  const i = inputsOf({
    trip: rainyTrip(), now: `${SAT} 14:20`, positions: [pos({ km: 60, at: `${FRI} 19:00` }), pos({ km: 125, at: `${SAT} 14:20`, acc: 12 })],
    spells: [{ range: [100, 137], stamps: stamps(SAT, 13, 15), pp: 80, mm: 1 }, { range: [150, 155], stamps: stamps(SAT, 16, 17), pp: 45, mm: 0.4 }],
    opts: { from: `${FRI} 01:00`, extraKms: [125, 131, 137, 150, 155] },
    spots: RAINY_SPOTS, roofs: [busStop().atKm(132)], rescuePoints: [{ ...rescue('KA-145').atKm(125, { off: 600 }), kms: [125] }],
    ...over,
  });
  return { ...i, hours: i.places.map((p) => preparedHours(p)) };
}

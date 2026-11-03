// One country's objects in, its places, roofs and rescue points out (section 5a steps 5 to 13).
import { classifyAll, keepPolygons } from '../src/core/places/classify-all.ts';
import type { ClassifyOptions, Zone } from '../src/core/places/classify.ts';
import type { CountryCode } from '../src/core/places/countries.ts';
import type { OsmObject, PackRescuePoint, Place, Roof } from '../src/core/places/types.ts';

export type CountryOutput = { cc: CountryCode; sourceDate: string; builtOn: string; places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] };
export type CountryOptions = ClassifyOptions & { builtOn: string };

export async function classifyCountry(
  objects: AsyncIterable<OsmObject>,
  zoneOf: (lat: number, lon: number) => Zone | null,
  cc: CountryCode,
  sourceDate: string,
  opts: CountryOptions,
): Promise<CountryOutput> {
  const collected: OsmObject[] = [];
  for await (const o of objects) collected.push(o);
  const { places, roofs, rescuePoints } = classifyAll(keepPolygons(collected), zoneOf, sourceDate, opts);
  return { cc, sourceDate, builtOn: opts.builtOn, places, roofs, rescuePoints };
}

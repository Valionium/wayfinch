import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ALL_KINDS } from '../../../src/core/places/types.ts';
import type { PackManifest, PackRescuePoint, Place, Roof } from '../../../src/core/places/types.ts';
import { readManifest, readTile } from '../../../src/data/packs/reader.ts';
import { FIXTURE_IDS, packFiles } from '../../../tools/build-fixtures.ts';
import type { FixtureRouteId } from '../../../tools/build-fixtures.ts';

export { FIXTURE_IDS };
export type { FixtureRouteId };
export type FixturePack = { manifest: PackManifest; places: Place[]; roofs: Roof[]; rescuePoints: PackRescuePoint[] };
export type FixtureRoute = { id: FixtureRouteId; name: string; points: { lat: number; lon: number; ele: number }[] };

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export async function loadFixtureRoute(id: FixtureRouteId): Promise<FixtureRoute> {
  return JSON.parse(await readFile(here(`../routes/${id}.json`), 'utf8')) as FixtureRoute;
}

/** Reads a fixture pack through the real reader, so every hash is checked. */
export async function loadFixturePack(id: FixtureRouteId): Promise<FixturePack> {
  const text = await readFile(here(`./${id}/manifest.json`), 'utf8');
  const manifest = readManifest(text, (JSON.parse(text) as { buildId: string }).buildId);
  const pack: FixturePack = { manifest, places: [], roofs: [], rescuePoints: [] };
  for (const t of manifest.tiles) {
    const bytes = new Uint8Array(await readFile(here(`./${id}/t/${t.z}/${t.x}/${t.y}.json`)));
    const c = await readTile(bytes, t, manifest);
    pack.places.push(...c.places);
    pack.roofs.push(...c.roofs);
    pack.rescuePoints.push(...c.rescuePoints);
  }
  return pack;
}

/** The pack a build with the drink-places setting off would give (section 5a step 11). */
export function withoutDrinkPlaces(pack: FixturePack): FixturePack {
  const places = pack.places.filter((p) => p.kind !== 'drink' && p.kind !== 'ice_cream');
  const kinds = ALL_KINDS.filter((k) => k !== 'drink' && k !== 'ice_cream' && pack.manifest.kinds.includes(k));
  const { manifest } = packFiles({ places, roofs: pack.roofs, rescuePoints: pack.rescuePoints },
    { buildId: pack.manifest.buildId, builtAt: pack.manifest.builtAt, kinds, countries: pack.manifest.countries });
  return { ...pack, places, manifest };
}

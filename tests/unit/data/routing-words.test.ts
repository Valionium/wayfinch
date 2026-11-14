// Street words in French, Italian and Spanish send a search down the address path (NEXT task 6), and only as whole words: a town
// whose name starts with one of them stays a town search. Every answer is recorded; no live call.
import { describe, expect, test } from 'vitest';
import { isAddressOrNamedPlace, searchPlace } from '../../../src/data/routing.ts';

const PHOTON = 'https://photon.komoot.io/api/';
const METEO = 'https://geocoding-api.open-meteo.com/v1/search';

function recorded(): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const f = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const body = url.startsWith(PHOTON) ? { features: [] } : { results: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { fetch: f, urls };
}

describe('Street words of France, Italy and Spain (NEXT task 6)', () => {
  test('[AB-ADDRESS-WORDS] place, chemin, impasse, route, piazza, viale, corso and plaza make an address search', () => {
    for (const q of ['Place de la Concorde', 'Chemin des Vignes', 'Impasse du Moulin', 'Route de Lyon', 'Piazza Navona', 'Viale Trastevere Roma', 'Corso Buenos Aires', 'Plaza Mayor Madrid']) {
      expect(isAddressOrNamedPlace(q), q).toBe(true);
    }
  });

  test('[AB-ADDRESS-WORDS] a name that only starts with one of the words stays a town search: Placerville, Cheminon, Routes, Piazzola sul Brenta, Vialetto, Corsock, Plazac, Impasseville', () => {
    for (const q of ['Placerville', 'Cheminon', 'Routes', 'Piazzola sul Brenta', 'Vialetto', 'Corsock', 'Plazac', 'Impasseville']) {
      expect(isAddressOrNamedPlace(q), q).toBe(false);
    }
  });

  test('[AB-ADDRESS-WORDS] the words already there still leave towns alone: Norwegen, Newcastle, Wegberg, Ringsted, Viareggio', () => {
    for (const q of ['Norwegen', 'Newcastle', 'Wegberg', 'Ringsted', 'Viareggio']) expect(isAddressOrNamedPlace(q), q).toBe(false);
  });

  test('[AB-ADDRESS-WORDS] searchPlace(\'Piazza Navona\') takes the street path: Photon first, without the place filters', async () => {
    const net = recorded();
    await searchPlace('Piazza Navona', net.fetch);
    expect(net.urls[0]!.startsWith(PHOTON)).toBe(true);
    expect(new URL(net.urls[0]!).searchParams.getAll('osm_tag')).toEqual([]);
    expect(new URL(net.urls[0]!).searchParams.get('q')).toBe('Piazza Navona');
    // A town still asks Open-Meteo first.
    const town = recorded();
    await searchPlace('Piazzola sul Brenta', town.fetch);
    expect(town.urls[0]!.startsWith(METEO)).toBe(true);
  });
});

// The one-off proof of plan Task 8, BND-AGREE: places sampled from a live pack, `zoneAt` against each place's own country. At
// least 99% must agree, and every disagreement must lie within 3 km of a border. Needs the live pack, so no pull request runs
// it; tools/boundaries-proof.json records the result and the file it's of, and a test holds the record to that very file.
//   node tools/prove-boundaries.mjs [count]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { haversineKm } from '../src/core/geo/haversine.ts';
import { zoneAt } from '../src/core/route/zones.ts';
import { decodeTile } from '../src/core/places/pack-format.ts';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const ORIGIN = JSON.parse(readFileSync(here('../build.config.json'), 'utf8')).dataOrigin;
const text = readFileSync(here('../public/data/boundaries.v1.json'), 'utf8');
const file = JSON.parse(text);
const COUNT = Number(process.argv[2] ?? 5000);
const PER_TILE = 40;
const LIMIT_KM = 3;

// A fixed sequence, so that a second run looks at the same places of the same build.
let seed = 20261103;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const json = async (path) => {
  const r = await fetch(`${ORIGIN}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
};

/** The shortest way from a point to the rings of any area of another country than `country`, or of `country` itself. */
function kmToBorder(p, country, other) {
  let best = Infinity;
  const kx = Math.cos((p.lat * Math.PI) / 180);
  for (const area of file.areas) {
    if (area.country !== country && area.country !== other) continue;
    for (const ring of area.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ax = (a[0] - p.lon) * kx;
        const ay = a[1] - p.lat;
        const bx = (b[0] - p.lon) * kx;
        const by = b[1] - p.lat;
        const dx = bx - ax;
        const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
        const km = Math.hypot(ax + t * dx, ay + t * dy) * 111.2;
        if (km < best) best = km;
      }
    }
  }
  return best;
}

const entry = JSON.parse(await json('/packs/current.json'));
const manifest = JSON.parse(await json(entry.manifest));
const pool = manifest.tiles.filter((t) => t.places >= 1);
const total = pool.reduce((n, t) => n + t.places, 0);
const pickTile = () => {
  let at = random() * total;
  for (const t of pool) {
    at -= t.places;
    if (at <= 0) return t;
  }
  return pool.at(-1);
};

const seen = new Map();
let sampled = 0;
let agree = 0;
let zoneAgree = 0;
const disagreements = [];
const perCountry = {};
const tilesRead = new Set();
while (sampled < COUNT) {
  const t = pickTile();
  const key = `${t.z}/${t.x}/${t.y}`;
  if (tilesRead.has(key)) continue;
  tilesRead.add(key);
  const body = await json(`/packs/${entry.buildId}/t/${key}.json`);
  if (createHash('sha256').update(body).digest('hex') !== t.sha256) throw new Error(`${key}: wrong hash`);
  const { places } = decodeTile(body, { manifest });
  for (let n = 0; n < PER_TILE && sampled < COUNT && places.length > 0; n++) {
    const p = places[Math.floor(random() * places.length)];
    if (seen.has(p.id)) continue;
    seen.set(p.id, true);
    sampled++;
    const z = zoneAt(p.lat, p.lon, file);
    const c = perCountry[p.country] ?? (perCountry[p.country] = { sampled: 0, agree: 0 });
    c.sampled++;
    if (z?.country === p.country) {
      agree++;
      c.agree++;
      if (z.holidayZone === p.holidayZone) zoneAgree++;
    } else {
      disagreements.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, country: p.country, found: z?.country ?? null, km: Math.round(kmToBorder(p, p.country, z?.country) * 100) / 100 });
    }
  }
}
void haversineKm;

const farDisagreements = disagreements.filter((d) => d.km > LIMIT_KM);
const proof = {
  note: 'BND-AGREE: places sampled from a live pack, zoneAt against the place\'s own country. Written by tools/prove-boundaries.mjs.',
  fileSha256: createHash('sha256').update(text).digest('hex'),
  buildId: entry.buildId, sampled, agree, holidayZoneAgree: zoneAgree, tilesRead: tilesRead.size, perCountry, disagreements, farDisagreements,
};
writeFileSync(here('boundaries-proof.json'), `${JSON.stringify(proof, null, 1)}\n`);
console.log(`${sampled} places of build ${entry.buildId}, ${tilesRead.size} tiles: ${agree} agree on the country (${((agree / sampled) * 100).toFixed(2)}%), ${zoneAgree} also on the holiday zone (${((zoneAgree / sampled) * 100).toFixed(2)}%).`);
console.log(`${disagreements.length} disagreements, the furthest ${Math.max(0, ...disagreements.map((d) => d.km))} km from a border; ${farDisagreements.length} over ${LIMIT_KM} km.`);
for (const d of farDisagreements) console.log(`  ${d.id} ${d.name ?? ''} ${d.lat},${d.lon}: ${d.country}, found ${d.found}, ${d.km} km`);

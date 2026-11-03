// Builds public/data/boundaries.v1.json: the bundled boundary file of spec section 5 (plan Task 8). Run once by hand, its
// output committed. A pull request never runs this: it needs data from outside.
//   node tools/build-boundaries.mjs --osm=<folder> --natural-earth=<ne_10m_admin_1_states_provinces.geojson>
// <folder> holds Overpass answers (`relation(ID);out geom;`), one r<ID>.json per boundary, and list.json naming them.
//
// The shapes come from OpenStreetMap, the pipeline's own source, so the file agrees with the packs. Natural Earth 1:10m, which
// the plan named for them, was tried first and left out: it puts the centres of Konstanz, Görlitz, Słubice and Vaals on the wrong
// side of their borders. It stays as a check: each region must lie in the Natural Earth region of its own code.
// Local zones come first in the file, as the first area holding a point is the one that counts. Prints sizes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { COUNTRIES } from '../src/core/places/countries.ts';
import { COUNTRY_JOBS } from '../pipeline/config.ts';

const OUT = fileURLToPath(new URL('../public/data/boundaries.v1.json', import.meta.url));

const SOURCE = 'Countries, regions and local zones: © OpenStreetMap contributors, ODbL 1.0, simplified. '
  + 'Region codes checked against Natural Earth 1:10m admin-1 (public domain). '
  + 'The last area, XX, is outside the first countries: a box less their outer edge.';

/** Douglas-Peucker tolerance in degrees, for borders between countries and for those inside one. Over budget: raise these. */
const BORDER_TOLERANCE = Number(process.env.BORDER_TOLERANCE ?? 0.003);
const INLAND_TOLERANCE = Number(process.env.INLAND_TOLERANCE ?? 0.012);
/** Rings smaller than this, in square degrees, are left out, unless they're all an area has. */
const MIN_RING_AREA = Number(process.env.MIN_RING_AREA ?? 0.000002);

const r3 = (x) => Math.round(x * 1000) / 1000;
/** The outside area's country and zone, as zones.ts reads them. */
const OUTSIDE = 'XX';
const LOCAL_ZONES = new Set(['FR-57', 'FR-67', 'FR-68', 'DE-BY-Augsburg']);
const keyOf = (p) => `${p[0]},${p[1]}`;

function clean(ring) {
  const out = [];
  for (const raw of ring) {
    const p = [r3(raw[0]), r3(raw[1])];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && keyOf(out[0]) === keyOf(out[out.length - 1])) out.pop();
  return out;
}

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
};

function distanceToLine(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function peucker(line, tolerance) {
  if (line.length < 3) return line;
  const keep = new Array(line.length).fill(false);
  keep[0] = keep[line.length - 1] = true;
  const stack = [[0, line.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop();
    let worst = -1;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const d = distanceToLine(line[i], line[from], line[to]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance) {
      keep[at] = true;
      stack.push([from, at], [at, to]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/**
 * Simplifies all areas together: a stretch two areas share is simplified once, so no gap or overlap opens between them. Rings
 * are cut at each vertex where the neighbouring stretch changes. A stretch between regions of one country takes the inland
 * tolerance; any other, the border's. A wrong region costs less than a wrong country.
 */
function simplifyTogether(areas) {
  const neighbours = new Map();
  const owners = new Map();
  const edgeKey = (a, b) => (keyOf(a) < keyOf(b) ? `${keyOf(a)}|${keyOf(b)}` : `${keyOf(b)}|${keyOf(a)}`);
  const note = (a, b) => {
    const k = keyOf(a);
    if (!neighbours.has(k)) neighbours.set(k, new Set());
    neighbours.get(k).add(keyOf(b));
  };
  for (const area of areas) {
    for (const ring of area.rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        note(a, b);
        note(b, a);
        const k = edgeKey(a, b);
        if (!owners.has(k)) owners.set(k, []);
        owners.get(k).push(area);
      }
    }
  }
  const isNode = (p) => neighbours.get(keyOf(p)).size !== 2;
  const toleranceOf = (a, b) => {
    const list = owners.get(edgeKey(a, b));
    return list.length >= 2 && new Set(list.map((o) => o.country)).size === 1 ? INLAND_TOLERANCE : BORDER_TOLERANCE;
  };
  const done = new Map();
  const simplifiedArc = (arc) => {
    const forward = arc.map(keyOf).join(';');
    const kept = done.get(forward);
    if (kept) return kept;
    const result = peucker(arc, toleranceOf(arc[0], arc[1]));
    done.set(forward, result);
    done.set([...arc].reverse().map(keyOf).join(';'), [...result].reverse());
    return result;
  };
  return areas.map((area) => ({
    ...area,
    rings: area.rings.map((ring) => {
      const first = ring.findIndex(isNode);
      if (first < 0) {
        // A ring that touches nothing: two far points are held, so the result is still a ring.
        const half = Math.floor(ring.length / 2);
        const tolerance = BORDER_TOLERANCE;
        return [...peucker(ring.slice(0, half + 1), tolerance).slice(0, -1), ...peucker([...ring.slice(half), ring[0]], tolerance).slice(0, -1)];
      }
      const rotated = [...ring.slice(first), ...ring.slice(0, first), ring[first]];
      const out = [];
      let arc = [rotated[0]];
      for (let i = 1; i < rotated.length; i++) {
        arc.push(rotated[i]);
        if (isNode(rotated[i])) {
          out.push(...simplifiedArc(arc).slice(0, -1));
          arc = [rotated[i]];
        }
      }
      return out;
    }),
  }));
}

/** A relation's outer and inner ways, joined end to end into rings. */
function stitch(relation) {
  const ways = relation.members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner' || m.role === '') && m.geometry)
    .map((m) => m.geometry.map((g) => [g.lon, g.lat]));
  const rings = [];
  const open = [...ways];
  while (open.length > 0) {
    let ring = open.pop();
    for (;;) {
      if (keyOf(ring[0]) === keyOf(ring[ring.length - 1])) break;
      const end = keyOf(ring[ring.length - 1]);
      const i = open.findIndex((w) => keyOf(w[0]) === end || keyOf(w[w.length - 1]) === end);
      if (i < 0) throw new Error(`${relation.tags.name}: a boundary way has an open end at ${end}`);
      const [way] = open.splice(i, 1);
      ring = [...ring, ...(keyOf(way[0]) === end ? way : [...way].reverse()).slice(1)];
    }
    rings.push(ring);
  }
  return rings;
}

/** Which area each relation of the list gives. The order is the file's: local zones first. */
function wanted(list) {
  const pick = (test) => list.filter(test);
  const out = [];
  const add = (found, country, zone) => {
    if (found.length !== 1) throw new Error(`${zone}: ${found.length} relations`);
    out.push({ id: found[0].id, country, zone });
  };
  for (const zone of ['FR-57', 'FR-67', 'FR-68']) add(pick((t) => t.iso2 === zone), 'FR', zone);
  add(pick((t) => t.name === 'Augsburg'), 'DE', 'DE-BY-Augsburg');
  for (const [country, job] of Object.entries(COUNTRY_JOBS)) {
    if (country === 'FR') add(pick((t) => t.name === 'France métropolitaine'), 'FR', 'FR');
    else if (country === 'NL') add(pick((t) => t.name === 'Nederland' && t.level === '3'), 'NL', 'NL');
    else if (job.regionalHolidays) {
      const regions = pick((t) => t.level === '4' && t.iso2?.startsWith(`${country}-`));
      if (regions.length === 0) throw new Error(`${country}: no regions`);
      for (const r of regions) out.push({ id: r.id, country, zone: r.iso2 });
    } else add(pick((t) => t.level === '2' && t.iso1 === country), country, country);
  }
  return out;
}

function holds(rings, lon, lat) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if ((ay > lat) !== (by > lat) && lon < ax + ((lat - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }
  }
  return inside;
}

/** A point well inside an area: the middle of the widest stretch across it along the latitude of its middle. */
function innerPoint(rings) {
  const biggest = [...rings].sort((a, b) => ringArea(b) - ringArea(a))[0];
  const lats = biggest.map((p) => p[1]).sort((a, b) => a - b);
  const lat = lats[Math.floor(lats.length / 2)] + 0.00037;
  const xs = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if ((ay > lat) !== (by > lat)) xs.push(ax + ((lat - ay) * (bx - ax)) / (by - ay));
    }
  }
  xs.sort((a, b) => a - b);
  let best = [xs[0], xs[1]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return [(best[0] + best[1]) / 2, lat];
}

/** Each region must lie in the Natural Earth region of its code, and each country's whole in that country. */
function checkAgainstNaturalEarth(path, areas) {
  const features = JSON.parse(readFileSync(path, 'utf8')).features;
  const ringsOf = (f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());
  let checked = 0;
  for (const area of areas) {
    const [lon, lat] = innerPoint(area.rings);
    const here = features.filter((f) => f.properties.iso_a2 === area.country && holds(ringsOf(f), lon, lat));
    const regional = /^(DE|AT|CH)-[0-9A-Z]+$/.test(area.zone);
    const good = regional ? here.some((f) => f.properties.iso_3166_2 === area.zone) : here.length > 0;
    // A very small area can lie across Natural Earth's coarser lines: Basel-Stadt, say. It's looked at, not refused.
    if (!good) {
      if (ringAreaSum(area.rings) > 0.05) throw new Error(`${area.zone}: its inner point ${lon},${lat} is not in Natural Earth's ${regional ? area.zone : area.country}`);
      console.log(`  note: small area ${area.zone} misses Natural Earth at ${lon.toFixed(3)},${lat.toFixed(3)}`);
    } else checked++;
  }
  console.log(`${checked} of ${areas.length} areas agree with Natural Earth.`);
}
const ringAreaSum = (rings) => rings.reduce((sum, r) => sum + ringArea(r), 0);

/** Rings of a union: an edge two rings share lies inside and goes; what's left is walked back into rings. */
function dissolve(rings) {
  const undirected = (a, b) => (keyOf(a) < keyOf(b) ? `${keyOf(a)}|${keyOf(b)}` : `${keyOf(b)}|${keyOf(a)}`);
  const count = new Map();
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const k = undirected(ring[i], ring[(i + 1) % ring.length]);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const next = new Map();
  const points = new Map();
  const link = (a, b) => {
    if (!next.has(keyOf(a))) next.set(keyOf(a), []);
    next.get(keyOf(a)).push(keyOf(b));
  };
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (count.get(undirected(a, b)) % 2 === 0) continue;
    points.set(keyOf(a), a);
    points.set(keyOf(b), b);
    link(a, b);
    link(b, a);
  }
  const drop = (a, b) => {
    const list = next.get(a);
    const i = list.indexOf(b);
    if (i >= 0) list.splice(i, 1);
  };
  const out = [];
  for (const start of next.keys()) {
    while (next.get(start).length > 0) {
      const ring = [start];
      let at = start;
      let to = next.get(at)[0];
      for (;;) {
        drop(at, to);
        drop(to, at);
        if (to === start) break;
        ring.push(to);
        at = to;
        if (next.get(at).length === 0) break;
        to = next.get(at)[0];
      }
      if (ring.length >= 3) out.push(ring.map((k) => points.get(k)));
    }
  }
  return out;
}

/** Where the outside area ends: well beyond the first countries on every side. */
const OUTSIDE_BOX = { west: -12, east: 40, south: 34, north: 72 };

function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const folder = arg('osm');
  const ne = arg('natural-earth');
  if (!folder || !ne) throw new Error('--osm=<folder> and --natural-earth=<file> are needed: see the top of this file.');
  const list = JSON.parse(readFileSync(join(folder, 'list.json'), 'utf8'));

  const raw = wanted(list).map(({ id, country, zone }) => {
    const relation = JSON.parse(readFileSync(join(folder, `r${id}.json`), 'utf8')).elements[0];
    return { country, zone, rings: stitch(relation).map(clean).filter((r) => r.length >= 3) };
  });
  checkAgainstNaturalEarth(ne, raw);

  const simplified = simplifyTogether(raw);
  const areas = simplified.map((a) => {
    const rings = a.rings.map(clean).filter((r) => r.length >= 3);
    const big = rings.filter((r) => ringArea(r) >= MIN_RING_AREA);
    return { country: a.country, holidayZone: a.zone, timeZone: COUNTRIES[a.country].timeZone, rings: big.length > 0 ? big : rings };
  });
  // Everything else in the box is outside the first countries: Italy, Liechtenstein, the sea beyond the coastal waters. Its rings
  // are the box and the first countries' own outer edge, the very vertices of their areas, so no gap opens at a border. It
  // comes last: a point it holds is in none of the others.
  const covered = dissolve(areas.filter((a) => !LOCAL_ZONES.has(a.holidayZone)).flatMap((a) => a.rings));
  const b = OUTSIDE_BOX;
  const box = [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north]];
  areas.push({ country: OUTSIDE, holidayZone: OUTSIDE, timeZone: 'UTC', rings: [box, ...covered] });
  const text = JSON.stringify({ v: 1, source: SOURCE, areas });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);

  const vertices = areas.reduce((n, a) => n + a.rings.reduce((m, r) => m + r.length, 0), 0);
  console.log(`${areas.length} areas, ${areas.reduce((n, a) => n + a.rings.length, 0)} rings, ${vertices} vertices.`);
  console.log(`${Buffer.byteLength(text)} bytes, ${gzipSync(text, { level: 9 }).length} bytes gzipped.`);
  for (const a of areas) console.log(`  ${a.holidayZone}: ${a.rings.length} ring(s), ${a.rings.reduce((m, r) => m + r.length, 0)} vertices`);
}

main();

// DF-01 (spec 11.4): Load Check's route functions against the co-pilot's ports, on the six fixture routes and 200 generated GPX files.
// The page's parseGPX, gpxProfileFrom, realAscent, planRoute, stageEffortIndex and nightStops run on its own code (qa/app-vm.cjs);
// the ports are parseGpx, buildRoute (realAscent per section) and planStages. Only values are compared; the page is never printed.
import { createRequire } from 'node:module';
import fc from 'fast-check';
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';
import { parseGpx } from '../../../src/core/route/gpx.ts';
import type { XmlDocLike } from '../../../src/core/route/gpx.ts';
import { buildRoute } from '../../../src/core/route/profile.ts';
import { planStages } from '../../../src/core/route/stages.ts';
import type { Pace } from '../../../src/core/route/stages.ts';
import { FIXTURE_IDS } from '../../fixtures/packs/index.ts';
import { fixtureGpx, gpxText } from '../../fixtures/gpx.ts';
import type { GpxPoint } from '../../fixtures/gpx.ts';

const require = createRequire(import.meta.url);
type VM = { run: (code: string) => unknown; context: Record<string, unknown> };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: (o?: { bike?: boolean }) => VM };
const { window } = new JSDOM('');
const page = appVM({ bike: false });
page.context.DOMParser = window.DOMParser;
const parseXml = (s: string): XmlDocLike => new window.DOMParser().parseFromString(s, 'application/xml') as unknown as XmlDocLike;

type Trip = { nights: number; pace: Pace; flatKph: number };
type Side = { km: number; ascent: number | null; points: number; stages: { endKm: number; hours: number; up: number | null }[]; basis: string; fallback: string | null; suggestedNights: number };

/** The page's side: parseGPX, then gpxProfileFrom, then planRoute and nightStops with the trip's settings. */
async function pageSide(text: string, trip: Trip): Promise<Side> {
  page.context.qaText = text;
  page.context.qaTrip = JSON.stringify(trip);
  const out = await page.run(`(async () => {
    const parsed = parseGPX(qaText); if (!parsed || parsed.error) return null;
    const profile = await gpxProfileFrom(parsed); if (!profile) return null;
    const t = JSON.parse(qaTrip);
    S.gpx = profile; S.place = null; S.place2 = null; S.nights = t.nights; S.pace = t.pace; S.flatKph = t.flatKph;
    const plan = planRoute(), stops = nightStops();
    return JSON.stringify({ km: plan.distanceKm, ascent: profile.ascent, points: parsed.pts.length,
      stages: stops.slice(1).map(s => ({ endKm: s.kmExact, hours: s.dayHoursExact, up: s.dayUpExact })),
      basis: plan.stageBasis, fallback: plan.stageFallback, suggestedNights: plan.suggestedNights });
  })()`) as string | null;
  if (out === null) throw new Error('the page could not read the file');
  return JSON.parse(out) as Side;
}

/** The co-pilot's side. */
async function portSide(text: string, trip: Trip): Promise<Side> {
  const parsed = parseGpx(text, parseXml);
  const route = await buildRoute(parsed.points, parsed.name, 'gpx');
  const plan = planStages(route, trip);
  return { km: route.lengthKm, ascent: route.ascentM, points: parsed.points.length,
    stages: plan.map((s) => ({ endKm: s.endKm, hours: s.ridingHours, up: s.ascentM })),
    basis: plan.basis, fallback: plan.fallback, suggestedNights: plan.suggestedNights };
}

function same(a: Side, b: Side, label: string): void {
  expect(a.points, `${label}: points`).toBe(b.points);
  expect(a.km, `${label}: distance`).toBe(b.km);
  expect(a.ascent, `${label}: ascent`).toBe(b.ascent);
  expect(a.basis, `${label}: basis`).toBe(b.basis);
  expect(a.fallback, `${label}: fallback`).toBe(b.fallback);
  expect(a.suggestedNights, `${label}: suggested nights`).toBe(b.suggestedNights);
  expect(a.stages.length, `${label}: stages`).toBe(b.stages.length);
  a.stages.forEach((s, i) => {
    expect(s.endKm, `${label}: stage ${i + 1} ends`).toBe(b.stages[i]!.endKm);
    expect(s.hours, `${label}: stage ${i + 1} hours`).toBe(b.stages[i]!.hours);
    expect(s.up, `${label}: stage ${i + 1} climbing`).toBe(b.stages[i]!.up);
  });
}

const TRIPS: Trip[] = [{ nights: 0, pace: 'steady', flatKph: 25 }, { nights: 2, pace: 'sporting', flatKph: 22 }, { nights: 6, pace: 'hard', flatKph: 30 }];

describe('[DF-01] the page\'s route functions against the ports', () => {
  test.each([...FIXTURE_IDS])('the fixture route %s: same points, distance, ascent and stage ends, hours and climbing, at three paces', async (id) => {
    const text = await fixtureGpx(id);
    for (const trip of TRIPS) same(await pageSide(text, trip), await portSide(text, trip), `${id} ${trip.nights} nights`);
  }, 120_000);

  test('200 generated GPX files, with heights, without, and in several sections: identical', async () => {
    const point = fc.record({ dLat: fc.integer({ min: -900, max: 900 }), dLon: fc.integer({ min: -900, max: 900 }), dEle: fc.integer({ min: -800, max: 800 }), cut: fc.boolean() });
    const file = fc.record({
      lat: fc.integer({ min: 440_000, max: 520_000 }), lon: fc.integer({ min: 40_000, max: 120_000 }), ele: fc.integer({ min: 0, max: 200_000 }),
      steps: fc.array(point, { minLength: 1, maxLength: 300 }), heights: fc.boolean(), sections: fc.constant(false),
      trip: fc.constantFrom(...TRIPS),
    });
    await fc.assert(fc.asyncProperty(file, async (f) => {
      // whole micro-degrees and centimetres: the ports' rounded form, so both sides read the same numbers
      let lat = f.lat * 100, lon = f.lon * 100, ele = f.ele;
      const segments: GpxPoint[][] = [[{ lat: lat / 1e6, lon: lon / 1e6, ele: f.heights ? ele / 100 : null }]];
      for (const s of f.steps) {
        lat += s.dLat * 10; lon += s.dLon * 10; ele = Math.max(-40_000, Math.min(800_000, ele + s.dEle));
        if (f.sections && s.cut && segments.at(-1)!.length > 1) segments.push([]);
        segments.at(-1)!.push({ lat: lat / 1e6, lon: lon / 1e6, ele: f.heights ? ele / 100 : null });
      }
      const text = segments.length === 1 ? gpxText(segments[0]!)
        : gpxText(segments[0]!).replace('</trkseg></trk>', `</trkseg>${segments.slice(1).map((seg) => `<trkseg>${seg.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === null || p.ele === undefined ? '' : `<ele>${p.ele}</ele>`}</trkpt>`).join('')}</trkseg>`).join('')}</trk>`);
      same(await pageSide(text, f.trip), await portSide(text, f.trip), 'generated');
    }), { numRuns: 200, seed: 6101 });
  }, 300_000);
});

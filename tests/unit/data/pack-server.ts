// A stub of the data project, serving the fixture packs through a stub `fetch`. It records every request, so a test can say
// exactly what left the phone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from '../../../build.config.json';
import { buildRoute } from '../../../src/core/route/profile.ts';
import type { PackManifest, TileContent } from '../../../src/core/places/types.ts';
import type { Route, Trip } from '../../../src/core/types.ts';
import { packFiles } from '../../../tools/build-fixtures.ts';
import type { FixtureRouteId } from '../../fixtures/packs/index.ts';
import { loadFixtureRoute } from '../../fixtures/packs/index.ts';

export const ORIGIN = config.dataOrigin;

export type Build = { manifest: PackManifest; files: Map<string, Uint8Array> };

/** A fixture pack as it lies in the repository. */
export function fixtureBuild(id: FixtureRouteId): Build {
  const read = (rel: string): Buffer => readFileSync(fileURLToPath(new URL(`../../fixtures/packs/${id}/${rel}`, import.meta.url)));
  const manifest = JSON.parse(read('manifest.json').toString('utf8')) as PackManifest;
  const files = new Map<string, Uint8Array>();
  for (const t of manifest.tiles) files.set(`t/${t.z}/${t.x}/${t.y}.json`, new Uint8Array(read(`t/${t.z}/${t.x}/${t.y}.json`)));
  return { manifest, files };
}

/** The same pack under another build id: a new weekly build. */
export function rebuilt(b: Build, buildId: string): Build {
  return { manifest: { ...b.manifest, buildId }, files: b.files };
}

/** A build from given content. */
export function buildOf(content: TileContent, buildId: string, kinds: PackManifest['kinds'] = ['water', 'shop', 'settlement']): Build {
  const { manifest, files } = packFiles(content, { buildId, builtAt: '2026-10-28T00:00:00Z', kinds });
  return { manifest, files: new Map([...files].map(([k, v]) => [k, new TextEncoder().encode(v)])) };
}

export type Answer = Response | Error | 'hang' | null;

export class PackServer {
  requests: string[] = [];
  builds = new Map<string, Build>();
  current: string;
  /** Called for each request first; an answer other than null is used instead. */
  intercept: (url: string, nth: number) => Answer = () => null;
  private active = 0;
  maxActive = 0;

  constructor(first: Build) {
    this.builds.set(first.manifest.buildId, first);
    this.current = first.manifest.buildId;
  }

  add(b: Build): void { this.builds.set(b.manifest.buildId, b); }

  tileRequests(): string[] { return this.requests.filter((u) => u.includes('/t/')); }

  private serve(url: string): Response {
    const path = url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
    if (path === '/packs/current.json') {
      const m = this.builds.get(this.current)!.manifest;
      return new Response(JSON.stringify({ v: 1, buildId: m.buildId, builtAt: m.builtAt, manifest: `/packs/${m.buildId}/manifest.json` }));
    }
    const hit = /^\/packs\/([^/]+)\/(.+)$/.exec(path);
    const build = hit ? this.builds.get(hit[1]!) : undefined;
    if (!hit || !build) return new Response('gone', { status: 404 });
    if (hit[2] === 'manifest.json') return new Response(JSON.stringify(build.manifest));
    const bytes = build.files.get(hit[2]!);
    return bytes ? new Response(bytes.slice()) : new Response('gone', { status: 404 });
  }

  fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const nth = this.requests.filter((u) => u === url).length;
    this.requests.push(url);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const answer = this.intercept(url, nth);
      if (answer === 'hang') {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')));
        });
      }
      if (answer instanceof Error) throw answer;
      return answer ?? this.serve(url);
    } finally {
      this.active--;
    }
  };
}

export async function fixtureTrip(id: FixtureRouteId): Promise<Trip> {
  const f = await loadFixtureRoute(id);
  const route: Route = await buildRoute(f.points, f.name, 'gpx');
  return { route, departureDate: '2026-10-17', startTime: '08:30', flatKph: 25, stay: 'camping', campWaterL: 2, pace: 'sporting' };
}

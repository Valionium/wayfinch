import { decodeTile, PackFormatError } from '../../core/places/pack-format.ts';
import { ALL_KINDS } from '../../core/places/types.ts';
import type { ManifestTile, PackEntry, PackManifest, TileContent } from '../../core/places/types.ts';

/** Every failure of the checked reader carries a code, so the app can say what went wrong. */
export class PackError extends Error {
  code: 'bad-json' | 'bad-shape' | 'bad-version' | 'bad-hash' | 'wrong-build';
  constructor(code: PackError['code'], message: string) {
    super(message);
    this.name = 'PackError';
    this.code = code;
  }
}

const BUILD_ID = /^\d{8}-\d+$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_LIKE = /^https?:\/\/\S+$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const bad = (what: string): never => { throw new PackError('bad-shape', what); };
const exactKeys = (o: Record<string, unknown>, keys: string[], what: string): void => {
  if (Object.keys(o).length !== keys.length || !keys.every((k) => k in o)) bad(`${what} has the wrong fields`);
};

function parse(text: string): Record<string, unknown> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PackError('bad-json', 'not JSON'); }
  if (!isObj(raw)) return bad('not an object');
  return raw;
}

export function readEntry(text: string): PackEntry {
  const o = parse(text);
  if ('v' in o && o.v !== 1) throw new PackError('bad-version', `entry version ${String(o.v)}`);
  exactKeys(o, ['v', 'buildId', 'builtAt', 'manifest'], 'entry');
  if (typeof o.buildId !== 'string' || !BUILD_ID.test(o.buildId)) return bad('buildId');
  if (typeof o.builtAt !== 'string' || !ISO_TIME.test(o.builtAt)) return bad('builtAt');
  // The entry may only point at its own build's manifest, never at another address.
  if (o.manifest !== `/packs/${o.buildId}/manifest.json`) return bad('manifest address');
  return { v: 1, buildId: o.buildId, builtAt: o.builtAt, manifest: o.manifest };
}

export function readManifest(text: string, expectedBuildId: string): PackManifest {
  const o = parse(text);
  if ('v' in o && o.v !== 1) throw new PackError('bad-version', `manifest version ${String(o.v)}`);
  exactKeys(o, ['v', 'buildId', 'builtAt', 'licence', 'countries', 'kinds', 'tiles'], 'manifest');
  if (typeof o.buildId !== 'string' || !BUILD_ID.test(o.buildId)) return bad('buildId');
  if (o.buildId !== expectedBuildId) throw new PackError('wrong-build', `manifest is of build ${o.buildId}`);
  if (typeof o.builtAt !== 'string' || !ISO_TIME.test(o.builtAt)) return bad('builtAt');

  const l = o.licence;
  if (!isObj(l)) return bad('licence');
  exactKeys(l, ['name', 'url', 'attribution', 'buildCode'], 'licence');
  if (l.name !== 'ODbL-1.0' || l.attribution !== '© OpenStreetMap contributors') return bad('licence text');
  if (typeof l.url !== 'string' || !URL_LIKE.test(l.url) || typeof l.buildCode !== 'string' || !URL_LIKE.test(l.buildCode)) return bad('licence address');

  if (!isObj(o.countries)) return bad('countries');
  for (const [code, c] of Object.entries(o.countries)) {
    if (!/^[A-Z]{2}$/.test(code) || !isObj(c)) return bad('country');
    exactKeys(c, ['status', 'builtOn', 'sourceDate', 'places'], 'country');
    if (c.status !== 'fresh' && c.status !== 'last-good' && c.status !== 'missing') return bad('country status');
    for (const k of ['builtOn', 'sourceDate'] as const) {
      if (c[k] !== null && !(typeof c[k] === 'string' && ISO_DATE.test(c[k]))) return bad(`country ${k}`);
    }
    if (!isCount(c.places)) return bad('country places');
  }

  if (!Array.isArray(o.kinds) || !o.kinds.every((k) => typeof k === 'string' && (ALL_KINDS as readonly string[]).includes(k))) return bad('kinds');
  if (!Array.isArray(o.tiles)) return bad('tiles');
  for (const t of o.tiles as unknown[]) {
    if (!isObj(t)) return bad('tile entry');
    exactKeys(t, ['z', 'x', 'y', 'sha256', 'bytes', 'gzipBytes', 'places', 'roofs', 'rescuePoints'], 'tile entry');
    if (!isCount(t.z) || t.z > 20 || !isCount(t.x) || !isCount(t.y)) return bad('tile id');
    if (typeof t.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(t.sha256)) return bad('tile hash');
    if (!isCount(t.bytes) || !isCount(t.gzipBytes) || !isCount(t.places) || !isCount(t.roofs) || !isCount(t.rescuePoints)) return bad('tile counts');
  }
  return o as unknown as PackManifest;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The hash is checked first; only bytes that match are parsed. */
export async function readTile(bytes: Uint8Array, expected: ManifestTile, manifest: PackManifest): Promise<TileContent> {
  if ((await sha256Hex(bytes)) !== expected.sha256) throw new PackError('bad-hash', 'tile does not match its hash');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new PackError('bad-json', 'tile is not text'); }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PackError('bad-json', 'tile is not JSON'); }
  if (isObj(raw) && (raw.z !== expected.z || raw.x !== expected.x || raw.y !== expected.y) && raw.v === 1) {
    throw new PackError('bad-shape', 'tile is not the one asked for');
  }
  try {
    return decodeTile(text, { manifest });
  } catch (e) {
    if (e instanceof PackFormatError) throw new PackError(e.code, e.message);
    throw e;
  }
}

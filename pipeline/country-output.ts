// The file one country job hands to the merge job: gzip, one JSON record per line, sorted, so equal input gives equal bytes.
import { createReadStream, createWriteStream } from 'node:fs';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { CountryOutput } from './classify-country.ts';
import type { Place, PackRescuePoint, Roof } from '../src/core/places/types.ts';

type Header = { t: 'h'; cc: CountryOutput['cc']; sourceDate: string; builtOn: string };

export async function writeCountryOutput(file: string, out: CountryOutput): Promise<void> {
  const header: Header = { t: 'h', cc: out.cc, sourceDate: out.sourceDate, builtOn: out.builtOn };
  function* records(): Generator<string> {
    yield JSON.stringify(header) + '\n';
    for (const p of out.places) yield JSON.stringify({ t: 'p', ...p }) + '\n';
    for (const r of out.roofs) yield JSON.stringify({ t: 'r', ...r }) + '\n';
    for (const r of out.rescuePoints) yield JSON.stringify({ t: 'x', ...r }) + '\n';
  }
  await pipeline(Readable.from(records()), createGzip({ level: 9 }), createWriteStream(file));
}

export async function readCountryOutput(file: string): Promise<CountryOutput> {
  const places: Place[] = []; const roofs: Roof[] = []; const rescuePoints: PackRescuePoint[] = [];
  let header: Header | null = null;
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line === '') continue;
    const { t, ...rest } = JSON.parse(line) as { t: string } & Record<string, unknown>;
    if (t === 'h') header = { t, ...rest } as Header;
    else if (t === 'p') places.push(rest as unknown as Place);
    else if (t === 'r') roofs.push(rest as unknown as Roof);
    else if (t === 'x') rescuePoints.push(rest as unknown as PackRescuePoint);
  }
  if (!header) throw new Error(`${file} has no header line`);
  return { cc: header.cc, sourceDate: header.sourceDate, builtOn: header.builtOn, places, roofs, rescuePoints };
}

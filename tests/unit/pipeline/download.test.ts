import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { CURL_LIMITS, curlArgs, downloadResumable } from '../../../pipeline/download.ts';

const hasCurl = spawnSync('curl', ['--version']).status === 0;

test('[PIPE-DL-01] every download has a connect limit, a stall limit, a time limit per attempt and a retry', () => {
  const args = curlArgs('agent');
  const value = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
  expect(Number(value('--connect-timeout'))).toBeGreaterThan(0);
  expect(Number(value('--speed-limit'))).toBeGreaterThan(0);
  expect(Number(value('--speed-time'))).toBeGreaterThan(0);
  expect(Number(value('--max-time'))).toBeGreaterThan(0);
  expect(Number(value('--retry'))).toBeGreaterThan(0);
  expect(args).toContain('--retry-all-errors');   // a timeout is only retried with this
  expect(args).toContain('--fail');
});

test('[PIPE-DL-01] the worst case of all attempts together stays well under the 120 minute job limit', () => {
  const worst = (CURL_LIMITS.retries + 1) * (CURL_LIMITS.attemptSeconds + CURL_LIMITS.retryDelaySeconds);
  expect(worst).toBeLessThanOrEqual(100 * 60);
});

test.skipIf(!hasCurl)('[PIPE-DL-01] a server that sends the headers and then goes silent ends the download with a timeout instead of hanging', async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-length': '1000000' }); res.write('x'); });  // never ends
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const started = Date.now();
  const args = curlArgs('agent', { ...CURL_LIMITS, stallSeconds: 2, retries: 0 });
  const result = await new Promise<number | null>((resolve) => {
    const child = spawn('curl', [...args, '-o', process.platform === 'win32' ? 'NUL' : '/dev/null', `http://127.0.0.1:${port}/x.osm.pbf`]);
    const guard = setTimeout(() => child.kill(), 30_000);   // the server lives in this process, so curl must not block it
    child.on('close', (code) => { clearTimeout(guard); resolve(code); });
  });
  server.closeAllConnections();
  server.close();
  expect(result).toBe(28);                                   // curl's "operation timed out"
  expect(Date.now() - started).toBeLessThan(20_000);
}, 40_000);

// A local server for the resume tests. `plan[i]` says what request number i does: 'ok' sends everything, 'cut' sends the first
// half and drops the connection, 'ignore-range' answers a range request with the whole file and status 200.
async function resumeServer(body: Buffer, plan: ('ok' | 'cut' | 'ignore-range')[]): Promise<{ url: string; ranges: (string | undefined)[]; close: () => void }> {
  const ranges: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    const i = ranges.length;
    const range = req.headers['range'];
    ranges.push(range);
    const mode = plan[Math.min(i, plan.length - 1)];
    if (range && mode !== 'ignore-range' && Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) >= body.length) { res.writeHead(416, { 'content-range': `bytes */${body.length}` }); res.end(); return; }
    const start = range && mode !== 'ignore-range' ? Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0) : 0;
    const part = body.subarray(start);
    if (start > 0) res.writeHead(206, { 'content-length': String(part.length), 'content-range': `bytes ${start}-${body.length - 1}/${body.length}` });
    else res.writeHead(200, { 'content-length': String(part.length), 'accept-ranges': 'bytes' });
    if (mode === 'cut') { res.write(part.subarray(0, Math.floor(part.length / 2)), () => res.socket?.destroy()); return; }
    res.end(part);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/x.osm.pbf`, ranges, close: () => { server.closeAllConnections(); server.close(); } };
}

const fast = { ...CURL_LIMITS, stallSeconds: 5, attemptSeconds: 20, retryDelaySeconds: 0 };
const sample = Buffer.from(Array.from({ length: 400_000 }, (_, i) => (i * 31) % 251));
const tmp = (): string => mkdtempSync(path.join(tmpdir(), 'dl-'));

test.skipIf(!hasCurl)('[PIPE-DL-02] a download cut off halfway continues from where it stopped instead of starting again', async () => {
  const s = await resumeServer(sample, ['cut', 'ok']);
  const dest = path.join(tmp(), 'in.pbf');
  await downloadResumable(s.url, dest, 'agent', fast);
  s.close();
  expect(readFileSync(dest).equals(sample)).toBe(true);
  expect(s.ranges[0]).toBeUndefined();
  expect(s.ranges[1]).toMatch(/^bytes=\d+-$/);
  expect(Number(/\d+/.exec(s.ranges[1] ?? '')?.[0])).toBeGreaterThan(0);
}, 40_000);

test.skipIf(!hasCurl)('[PIPE-DL-02] a server that ignores the range request makes the download start again from nothing, and still ends whole', async () => {
  const s = await resumeServer(sample, ['cut', 'ignore-range', 'ok']);
  const dest = path.join(tmp(), 'in.pbf');
  await downloadResumable(s.url, dest, 'agent', fast);
  s.close();
  expect(readFileSync(dest).equals(sample)).toBe(true);
}, 40_000);

test.skipIf(!hasCurl)('[PIPE-DL-02] a server that keeps failing ends in an error after the allowed attempts, never an endless loop', async () => {
  const s = await resumeServer(sample, ['cut']);
  const dest = path.join(tmp(), 'in.pbf');
  await expect(downloadResumable(s.url, dest, 'agent', { ...fast, retries: 2 })).rejects.toThrow(/after 3 attempts/);
  s.close();
  expect(s.ranges.length).toBe(3);
}, 40_000);

test('[PIPE-DL-02] the resume attempts together stay within the same worst case as before', () => {
  expect((CURL_LIMITS.retries + 1) * (CURL_LIMITS.attemptSeconds + CURL_LIMITS.retryDelaySeconds)).toBeLessThanOrEqual(100 * 60);
});

test.skipIf(!hasCurl)('[PIPE-DL-02] a partial file that is already complete is left as it is', async () => {
  const s = await resumeServer(sample, ['ok']);
  const dest = path.join(tmp(), 'in.pbf');
  writeFileSync(dest, sample);
  await downloadResumable(s.url, dest, 'agent', fast);
  s.close();
  expect(readFileSync(dest).equals(sample)).toBe(true);
}, 40_000);

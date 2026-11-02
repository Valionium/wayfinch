import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from 'vitest';
import { CURL_LIMITS, curlArgs } from '../../../pipeline/download.ts';

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

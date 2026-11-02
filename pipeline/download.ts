import { spawn } from 'node:child_process';
import { existsSync, rmSync, statSync } from 'node:fs';
// How the pipeline calls curl. A download that goes silent must end with an error and be retried, not wait for the job limit:
// on 31 Oct the France job sat in one curl for two hours until GitHub cancelled the job.
export type CurlLimits = {
  connectSeconds: number;         // time allowed to connect
  stallSeconds: number;           // a transfer slower than stallBytesPerSecond for this long counts as stalled
  stallBytesPerSecond: number;
  attemptSeconds: number;         // upper limit of one attempt, however slowly it goes on
  retries: number;                // further attempts after the first one
  retryDelaySeconds: number;
};

// Largest file (Germany, France) normally takes 10 to 15 minutes. Worst case 3 attempts of 30 minutes plus the delays is 91 minutes.
export const CURL_LIMITS: CurlLimits = { connectSeconds: 30, stallSeconds: 60, stallBytesPerSecond: 100_000, attemptSeconds: 1800, retries: 2, retryDelaySeconds: 30 };

/** --retry-all-errors is what makes curl try again after a timeout (exit code 28). */
export function curlArgs(userAgent: string, limits: CurlLimits = CURL_LIMITS): string[] {
  return [
    '--fail', '--location',
    '--retry', String(limits.retries), '--retry-delay', String(limits.retryDelaySeconds), '--retry-all-errors',
    '--connect-timeout', String(limits.connectSeconds),
    '--speed-limit', String(limits.stallBytesPerSecond), '--speed-time', String(limits.stallSeconds),
    '--max-time', String(limits.attemptSeconds),
    '--user-agent', userAgent, '--silent', '--show-error',
  ];
}

/** The small address lookup and the checksum file: same rules, but a short time limit. */
export const SMALL_LIMITS: CurlLimits = { ...CURL_LIMITS, attemptSeconds: 120 };

/**
 * The big download. Each attempt continues the partial file (`-C -`) instead of starting again: on 2 Nov the France file
 * (5.1 GB) reached 4.3 to 4.7 GB in each of three 30-minute attempts and every one of them was thrown away. A stalled or
 * slow attempt still ends with an error at its limit, and the attempts together keep the old worst case. Curl's own retry is
 * off here, because the loop below decides whether to continue or to start from nothing.
 * Exit 33 (the server does not do ranges) and 36 (bad resume offset) delete the partial file and start again.
 */
export async function downloadResumable(url: string, dest: string, userAgent: string, limits: CurlLimits = CURL_LIMITS): Promise<void> {
  const attempts = limits.retries + 1;
  const args = [...curlArgs(userAgent, { ...limits, retries: 0 }), '-C', '-', '-o', dest, url];
  let last = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { code, stderr } = await runCurl(args);
    if (code === 0) return;
    last = stderr.trim().split('\n').pop() ?? `curl exit ${code}`;
    if (code === 33 || code === 36) rmSync(dest, { force: true });
    console.error(`download attempt ${attempt} of ${attempts} failed (exit ${code}${existsSync(dest) ? `, ${statSync(dest).size} bytes kept` : ''}): ${last}`);
    if (attempt < attempts) await new Promise((r) => setTimeout(r, limits.retryDelaySeconds * 1000));
  }
  throw new Error(`download failed after ${attempts} attempts: ${last}`);
}

function runCurl(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (e) => resolve({ code: 127, stderr: e.message }));
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

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

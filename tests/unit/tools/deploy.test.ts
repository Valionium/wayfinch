// The after-deploy check and its rules, with a stubbed fetch and gh, so no test touches the network or GitHub.
// Plan Task 7. The command cases at the end run the real script against a real local server.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, describe, expect, test } from 'vitest';
import {
  afterDeployCheck,
  checkEmergencyWorker,
  checkLive,
  checkSelf,
  commitOfVersion,
  compareBuild,
  decide,
  emergencyFailureSummary,
  fetchLiveBuild,
  formatRows,
  hasRequiredReviewer,
  ISSUE_LABEL,
  isStale,
  liveVersionOf,
  pickRollback,
  readLiveList,
  reportIssue,
  rollbackSummary,
  ROLLBACK_MESSAGE,
  staleReason,
  switchGuard,
  switchSummary,
  SWITCH_TAG,
  uploadNeverArrived,
  type BuildJson,
  type DeploymentRow,
  type FetchLike,
} from '../../../tools/deploy-lib.mjs';

const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const ORIGIN = 'https://site.example';

function buildOf(files: Record<string, string>, configHash = 'cfg'): BuildJson {
  return { v: 1, configHash, files: Object.fromEntries(Object.entries(files).map(([p, body]) => [p, sha256(body)])) };
}

interface StubAnswer { status?: number; body?: string; redirected?: boolean; throws?: string }
interface Call { url: string; init: RequestInit | undefined }

/** A stub fetch that answers from a table and records every call. A missing path answers 404. */
function stubFetch(answer: (path: string) => StubAnswer | undefined): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    const a = answer(new URL(String(url)).pathname) ?? { status: 404, body: 'not found' };
    if (a.throws) throw new Error(a.throws);
    const status = a.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      redirected: a.redirected ?? false,
      arrayBuffer: async () => new TextEncoder().encode(a.body ?? '').buffer as ArrayBuffer,
    };
  };
  return { fetch, calls };
}

function liveSite(files: Record<string, string>, build: BuildJson = buildOf(files)) {
  return stubFetch((path) => {
    if (path === '/build.json') return { body: JSON.stringify(build) };
    const body = files[path];
    return body === undefined ? undefined : { body };
  });
}

/** A clock only `sleep` moves, so a five-minute wait takes no real time. */
function fakeClock() {
  let at = 0;
  return { now: () => at, sleep: async (ms: number) => { at += ms; } };
}

const FILES = { '/': '<html>page</html>', '/offline-worker.js': 'self.x=1' };

describe('compareBuild', () => {
  test('[DEP-MATCH] every listed file\'s sha256 matches: ok; no /build.json live yet (today\'s site) is not same', async () => {
    const build = buildOf(FILES);
    await expect(checkLive(build, ORIGIN, { ...liveSite(FILES), ...fakeClock() })).resolves.toEqual({ ok: true, problems: [] });
    expect(compareBuild(build, build)).toEqual({ same: true, changed: [] });
    const none = compareBuild(build, null);
    expect(none.same).toBe(false);
    expect(none.changed).toEqual(['/', '/offline-worker.js']);
  });

  test('a changed, added or removed file and a changed config are each named', () => {
    const local = buildOf({ '/': 'new', '/a.js': 'a' }, 'one');
    const live = buildOf({ '/': 'old', '/b.js': 'b' }, 'two');
    const result = compareBuild(local, live);
    expect(result.same).toBe(false);
    expect(result.changed).toEqual(['/', '/a.js', '/b.js', 'wrangler.jsonc']);
    expect(compareBuild(buildOf(FILES, 'one'), buildOf(FILES, 'two'))).toEqual({ same: false, changed: ['wrangler.jsonc'] });
  });
});

describe('checkLive', () => {
  test('[DEP-LATE] the last file matches only after 4 min: ok', async () => {
    const clock = fakeClock();
    const { fetch } = stubFetch((path) => {
      if (path === '/build.json') return { body: JSON.stringify(buildOf(FILES)) };
      if (path === '/offline-worker.js') return { body: clock.now() >= 240_000 ? FILES['/offline-worker.js'] : 'old' };
      return { body: FILES['/'] };
    });
    await expect(checkLive(buildOf(FILES), ORIGIN, { fetch, ...clock })).resolves.toEqual({ ok: true, problems: [] });
    expect(clock.now()).toBeGreaterThanOrEqual(240_000);
    expect(clock.now()).toBeLessThan(300_000);
  });

  test('[DEP-LATE] still different at 5 min: fail, with a last look at exactly 5 min', async () => {
    const clock = fakeClock();
    let lastLookAt = -1;
    const { fetch } = stubFetch((path) => {
      lastLookAt = clock.now();
      return path === '/build.json' ? { body: JSON.stringify(buildOf(FILES)) } : { body: 'old' };
    });
    const result = await checkLive(buildOf(FILES), ORIGIN, { fetch, ...clock });
    expect(result.ok).toBe(false);
    expect(lastLookAt).toBe(300_000);
    expect(clock.now()).toBe(300_000);
  });

  test('[DEP-MISMATCH] a changed file, a missing file and a / that doesn\'t load fail, each naming the path', async () => {
    const build = buildOf({ ...FILES, '/assets/a.js': 'a' });
    const { fetch } = stubFetch((path) => {
      if (path === '/') return { throws: 'connection reset' };
      if (path === '/offline-worker.js') return { body: 'other bytes' };
      if (path === '/build.json') return { body: JSON.stringify(build) };
      return { status: 404 };
    });
    const result = await checkLive(build, ORIGIN, { fetch, ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.problems.find((p) => p.startsWith('/ '))).toContain('connection reset');
    expect(result.problems.find((p) => p.startsWith('/offline-worker.js '))).toContain('different');
    expect(result.problems.find((p) => p.startsWith('/assets/a.js '))).toContain('404');
  });

  test('[DEP-MISMATCH] an empty list never passes', async () => {
    const result = await checkLive({ v: 1, configHash: 'c', files: {} }, ORIGIN, { ...liveSite({}), ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
  });

  test('[DEP-MISMATCH] files that match under a live build.json that doesn\'t fail: the next decide would be wrong', async () => {
    const result = await checkLive(buildOf(FILES), ORIGIN, { ...liveSite(FILES, buildOf({ '/': 'older' })), ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain('/build.json');
  });

  test('[DEP-REDIRECT] a redirected answer fails, even with the right bytes', async () => {
    const { fetch } = stubFetch((path) => {
      if (path === '/build.json') return { body: JSON.stringify(buildOf(FILES)) };
      return { body: FILES[path as keyof typeof FILES], redirected: path === '/' };
    });
    const result = await checkLive(buildOf(FILES), ORIGIN, { fetch, ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain('/ was redirected');
  });

  test('[DEP-NO-CACHE] every request has cache: no-store and a query-free canonical path, and asks as a browser does', async () => {
    const site = liveSite(FILES);
    await checkLive(buildOf(FILES), `${ORIGIN}/`, { ...site, ...fakeClock() });
    expect(site.calls.map((c) => c.url).sort()).toEqual([`${ORIGIN}/`, `${ORIGIN}/build.json`, `${ORIGIN}/offline-worker.js`]);
    for (const call of site.calls) {
      expect(call.init?.cache).toBe('no-store');
      expect(new Headers(call.init?.headers).get('accept-encoding')).toMatch(/gzip/);
    }
  });
});

describe('decide', () => {
  const noFetch: FetchLike = async () => { throw new Error('the live site was asked'); };
  const local = buildOf(FILES);
  const REVIEWED = { protection_rules: [{ type: 'required_reviewers', reviewers: [{ type: 'User', reviewer: { id: 186399519 } }] }] };
  const readApprovalEnv = async () => REVIEWED;
  const noRead = async () => { throw new Error('the environment was read'); };

  test('[DEP-LATCH] deployEnabled false: no click and no live check, whatever is live; the live site is never asked', async () => {
    await expect(decide(local, { deployEnabled: false }, ORIGIN, { fetch: noFetch, readApprovalEnv: noRead })).resolves.toMatchObject({ changed: false, check: false });
    await expect(decide(local, {}, ORIGIN, { fetch: noFetch })).resolves.toMatchObject({ changed: false, check: false });
  });

  test('[DEP-LATCH] only exactly true opens the latch', async () => {
    await expect(decide(local, { deployEnabled: 'true' }, ORIGIN, { fetch: noFetch })).resolves.toMatchObject({ changed: false, check: false });
  });

  test('[DEP-UNCHANGED] compareBuild same: nothing to upload, and the check still runs', async () => {
    await expect(decide(local, { deployEnabled: true }, ORIGIN, { ...liveSite(FILES), readApprovalEnv: noRead })).resolves.toMatchObject({ changed: false, check: true });
  });

  test('[DEP-MATCH] enabled with no live build.json: a click is asked for and no check runs', async () => {
    const { fetch } = stubFetch(() => ({ status: 404 }));
    await expect(decide(local, { deployEnabled: true }, ORIGIN, { fetch, readApprovalEnv })).resolves.toMatchObject({ changed: true, check: false });
  });

  test('a real difference asks for a click and the summary lists the changed paths in plain words', async () => {
    const result = await decide(buildOf({ ...FILES, '/': 'new page' }), { deployEnabled: true }, ORIGIN, { ...liveSite(FILES), readApprovalEnv });
    expect(result).toMatchObject({ changed: true, check: false });
    expect(result.summary).toContain('/ (the page)');
    expect(result.summary).not.toContain('/offline-worker.js');
  });

  test('a live site that answers 503 stops decide: it is no reason to ask for a click', async () => {
    const { fetch } = stubFetch(() => ({ status: 503 }));
    await expect(decide(local, { deployEnabled: true }, ORIGIN, { fetch })).rejects.toThrow('503');
  });

  test('[DEP-LATCH] no required reviewer: a real difference fails loudly and never says changed', async () => {
    const differs = () => ({ ...liveSite({ '/': 'other' }) });
    for (const env of [{ protection_rules: [] }, {}, null, { protection_rules: [{ type: 'wait_timer', wait_timer: 5 }] }, { protection_rules: [{ type: 'required_reviewers', reviewers: [] }] }]) {
      await expect(decide(local, { deployEnabled: true }, ORIGIN, { ...differs(), readApprovalEnv: async () => env })).rejects.toThrow('no required reviewer');
    }
  });

  test('[DEP-LATCH] the reviewer can\'t be read: the same refusal', async () => {
    await expect(decide(local, { deployEnabled: true }, ORIGIN, { ...liveSite({ '/': 'other' }), readApprovalEnv: noRead })).rejects.toThrow('could not be read');
    await expect(decide(local, { deployEnabled: true }, ORIGIN, liveSite({ '/': 'other' }))).rejects.toThrow('could not be read');
  });

  test('[DEP-LATCH] only deployWithoutReviewer exactly true goes on without one, and says so', async () => {
    const result = await decide(local, { deployEnabled: true, deployWithoutReviewer: true }, ORIGIN, { ...liveSite({ '/': 'other' }), readApprovalEnv: noRead });
    expect(result).toMatchObject({ changed: true, check: false });
    expect(result.summary).toContain('no click');
    for (const value of [false, 'true', 1, undefined]) {
      await expect(decide(local, { deployEnabled: true, deployWithoutReviewer: value }, ORIGIN, { ...liveSite({ '/': 'other' }), readApprovalEnv: async () => ({ protection_rules: [] }) })).rejects.toThrow('no required reviewer');
    }
  });

  test('[DEP-LATCH] hasRequiredReviewer reads the shape of GitHub\'s answer', () => {
    expect(hasRequiredReviewer(REVIEWED)).toBe(true);
    expect(hasRequiredReviewer({ protection_rules: [{ type: 'branch_policy' }] })).toBe(false);
  });

  test('fetchLiveBuild: a 200 that isn\'t a build list counts as no list', async () => {
    const { fetch } = stubFetch(() => ({ body: '<html>' }));
    await expect(fetchLiveBuild(ORIGIN, { fetch })).resolves.toBeNull();
  });
});

describe('reportIssue', () => {
  /** Acts like the real gh: `issue create --label` fails while the label doesn't exist. */
  function stubGh(open: number[] = [], labels: string[] = []) {
    const calls: string[][] = [];
    const known = new Set(labels);
    const gh = async (args: string[]): Promise<string> => {
      calls.push(args);
      const key = args.slice(0, 2).join(' ');
      if (key === 'label create') { known.add(String(args[2])); return ''; }
      if (key === 'issue list') return JSON.stringify(open.map((number) => ({ number })));
      if (key === 'issue create') {
        const label = args[args.indexOf('--label') + 1];
        if (!known.has(String(label))) throw new Error(`could not add label: '${label}' not found`);
        return 'https://github.com/o/r/issues/7';
      }
      return '';
    };
    return {
      gh,
      calls,
      verbs: () => calls.map((c) => c.slice(0, 2).join(' ')),
      body: () => { const c = calls.at(-1) ?? []; return String(c[c.indexOf('--body') + 1]); },
    };
  }
  const failure = { ok: false, problems: ['/offline-worker.js has different bytes'] };

  test('[DEP-ISSUE-ONE] a failure opens one issue, labelled after-deploy, naming what\'s live and suggesting the rollback, on a repository without the label', async () => {
    const stub = stubGh();
    await reportIssue(failure, { gh: stub.gh, liveVersion: 'version-abc', lastDeployActive: false });
    expect(stub.verbs()).toEqual(['issue list', 'label create', 'issue create']);
    const create = stub.calls.at(-1) ?? [];
    expect(create[create.indexOf('--label') + 1]).toBe(ISSUE_LABEL);
    expect(ISSUE_LABEL).toBe('after-deploy');
    expect(stub.calls[1]).toContain('--force');
    expect(stub.body()).toContain('version-abc');
    expect(stub.body()).toContain('/offline-worker.js has different bytes');
    expect(stub.body()).toMatch(/emergency.*rollback/);
    expect(stub.body()).toContain('Nothing rolls back by itself');
  });

  test('[DEP-ISSUE-ONE] a second failure comments, and nothing ever calls a rollback', async () => {
    const stub = stubGh([12]);
    await reportIssue(failure, { gh: stub.gh, liveVersion: 'version-abc', lastDeployActive: false });
    expect(stub.verbs()).toEqual(['issue list', 'issue comment']);
    expect(stub.calls[1]?.[2]).toBe('12');
    for (const call of stub.calls) {
      expect(['issue', 'label']).toContain(call[0]);
      expect(call[1]).not.toMatch(/workflow|run/);
    }
  });

  test('[DEP-ISSUE-CLOSE] a passing check closes the open one and names the version now live', async () => {
    const stub = stubGh([12]);
    await reportIssue({ ok: true, problems: [] }, { gh: stub.gh, liveVersion: 'version-new', lastDeployActive: false });
    expect(stub.verbs()).toEqual(['issue list', 'issue close']);
    expect(stub.calls[1]?.[2]).toBe('12');
    expect(stub.calls[1]?.join(' ')).toContain('version-new');
  });

  test('[DEP-ISSUE-CLOSE] a passing check with nothing open does nothing', async () => {
    const stub = stubGh();
    await reportIssue({ ok: true, problems: [] }, { gh: stub.gh, liveVersion: 'v', lastDeployActive: false });
    expect(stub.verbs()).toEqual(['issue list']);
  });

  test('[DEP-NOT-ARRIVED] upload failed and the previous deployment still active: the issue says so and warns against a rollback', async () => {
    const stub = stubGh();
    await reportIssue(failure, { gh: stub.gh, liveVersion: 'version-old', lastDeployActive: true });
    const body = stub.body();
    expect(body).toContain('The upload never arrived');
    expect(body).toContain('a rollback would go one version too far');
    expect(body).toContain('approve it again');
    expect(body).toContain('version-old');
    expect(body).not.toMatch(/Run workflow/);
  });

  test('[DEP-NOT-ARRIVED] uploadNeverArrived tells the cases apart', () => {
    expect(uploadNeverArrived({ outcome: 'success', before: 'a', after: 'a' })).toBe(false);
    expect(uploadNeverArrived({ outcome: 'skipped', before: '', after: '' })).toBe(true);
    expect(uploadNeverArrived({ outcome: 'failure', before: 'a', after: 'a' })).toBe(true);
    expect(uploadNeverArrived({ outcome: 'cancelled', before: 'a', after: 'a' })).toBe(true);
    expect(uploadNeverArrived({ outcome: 'failure', before: 'a', after: 'b' })).toBe(false);
    expect(uploadNeverArrived({ outcome: 'failure', before: 'a', after: '' })).toBe(false);
    expect(uploadNeverArrived({ outcome: 'failure', before: '', after: '' })).toBe(false);
  });
});

describe('pickRollback', () => {
  // Shaped like `wrangler deployments list --json` on 4.156.0, read from its source: the rows of Cloudflare's
  // deployments API, sorted OLDEST first (the plan assumed newest first), at most ten.
  const rows = (...list: Array<[string, string?, string?]>): DeploymentRow[] => list.map(([version, trigger, message], i) => ({
    id: `dep-${i}`,
    source: 'wrangler',
    strategy: 'percentage',
    author_email: 'someone@example.com',
    created_on: `2026-11-0${i + 1}T10:00:00.000000Z`,
    annotations: { 'workers/triggered_by': trigger ?? 'upload', ...(message ? { 'workers/message': message } : {}) },
    versions: [{ version_id: version, percentage: 100 }],
  }));
  const plain = { annotations: {} };
  const theSwitch = { annotations: { 'workers/tag': SWITCH_TAG } };

  test('[DEP-ROLL-ID] returns the deployment before the live one, in wrangler\'s order and in reverse', () => {
    const list = rows(['v1'], ['v2'], ['v3']);
    expect(pickRollback(list, {})).toEqual({ versionId: 'v2' });
    expect(pickRollback([...list].reverse(), {})).toEqual({ versionId: 'v2' });
    expect(liveVersionOf(list)).toBe('v3');
    expect(liveVersionOf([...list].reverse())).toBe('v3');
    expect(liveVersionOf([])).toBe('');
    expect(liveVersionOf(null)).toBe('');
  });

  test('[DEP-ROLL-ID] returns the named one, even past a rollback or a switch', () => {
    expect(pickRollback(rows(['v1'], ['v2'], ['v3']), { named: 'v1' })).toEqual({ versionId: 'v1' });
    expect(pickRollback(rows(['v1'], ['v2'], ['v3', 'rollback']), { named: 'v1' })).toEqual({ versionId: 'v1' });
    expect(pickRollback(rows(['v1'], ['v2'], ['v3']), { named: 'v2', versions: { v2: theSwitch } })).toEqual({ versionId: 'v2' });
  });

  test('[DEP-ROLL-ID] a preview upload is a version and no deployment: it is never picked', () => {
    const list = rows(['v1'], ['v2']);
    expect(pickRollback(list, {})).toEqual({ versionId: 'v1' });
    expect(pickRollback(list, { named: 'preview-version' })).toHaveProperty('refuse');
  });

  test('[DEP-ROLL-REFUSE] no list', () => {
    for (const none of [null, undefined, [], 'not a list', {}]) expect(pickRollback(none, {})).toHaveProperty('refuse');
  });

  test('[DEP-ROLL-REFUSE] none before', () => {
    expect(pickRollback(rows(['v1']), {})).toHaveProperty('refuse');
  });

  test('[DEP-ROLL-REFUSE] past what Cloudflare still lists (and so past its 100 versions): a named id the list doesn\'t hold', () => {
    const result = pickRollback(rows(['v1'], ['v2']), { named: 'gone-long-ago' });
    expect(result).toHaveProperty('refuse');
    expect(JSON.stringify(result)).toContain('last ten deployments');
  });

  test('[DEP-ROLL-REFUSE] unless named: a rollback live, known from Cloudflare\'s trigger or only from our own message', () => {
    expect(pickRollback(rows(['v1'], ['v2'], ['v1', 'rollback']), {})).toHaveProperty('refuse');
    expect(pickRollback(rows(['v1'], ['v2'], ['v1', 'upload', `${ROLLBACK_MESSAGE} from Run workflow`]), {})).toHaveProperty('refuse');
  });

  test('[DEP-ROLL-REFUSE] unless named: the switch before the live one, known from the row or from its version', () => {
    expect(pickRollback(rows(['v1'], ['v2', 'upload', `Marked ${SWITCH_TAG}`], ['v3']), {})).toHaveProperty('refuse');
    const list = rows(['v1'], ['v2'], ['v3']);
    expect(pickRollback(list, { versions: { v2: theSwitch, v3: plain } })).toHaveProperty('refuse');
    expect(pickRollback(list, { versions: { v2: plain, v3: plain } })).toEqual({ versionId: 'v2' });
  });

  test('[DEP-ROLL-REFUSE] unless named: the switch live, whose previous version is what it was used against', () => {
    const list = rows(['v1'], ['v2'], ['v3']);
    expect(pickRollback(list, { versions: { v2: plain, v3: theSwitch } })).toHaveProperty('refuse');
  });

  test('[DEP-ROLL-REFUSE] when version details were asked for and are missing, an unnamed rollback stops; a named one goes on', () => {
    const list = rows(['v1'], ['v2'], ['v3']);
    expect(pickRollback(list, { versions: {} })).toHaveProperty('refuse');
    expect(pickRollback(list, { versions: {}, named: 'v2' })).toEqual({ versionId: 'v2' });
  });

  test('[DEP-ROLL-REFUSE] requireDetails: missing details are the answer, before any other refusal and even with a name', () => {
    const list = rows(['v1'], ['v2'], ['v3']);
    const full = { v2: plain, v3: plain };
    expect(pickRollback(list, { versions: full, requireDetails: true })).toEqual({ versionId: 'v2' });
    expect(JSON.stringify(pickRollback(list, { versions: { v3: plain }, requireDetails: true, named: 'v1' }))).toContain('no details');
    expect(JSON.stringify(pickRollback(rows(['v1'], ['v2'], ['v3', 'rollback']), { versions: {}, requireDetails: true }))).toContain('no details');
    expect(JSON.stringify(pickRollback(null, { versions: {}, requireDetails: true }))).toContain('no list');
  });

  test('[DEP-ROLL-REFUSE] the version already live, a split deployment, or a previous row with the live version', () => {
    expect(pickRollback(rows(['v1'], ['v2']), { named: 'v2' })).toHaveProperty('refuse');
    expect(pickRollback(rows(['v1'], ['v1']), {})).toHaveProperty('refuse');
    const split = rows(['v1'], ['v2'], ['v3']);
    (split[1] as DeploymentRow).versions = [{ version_id: 'v2', percentage: 50 }, { version_id: 'v1', percentage: 50 }];
    expect(pickRollback(split, {})).toHaveProperty('refuse');
    expect(pickRollback(split, { named: 'v2' })).toHaveProperty('refuse');
    // A version that also served all traffic in another row may be named.
    expect(pickRollback([...rows(['v2']), ...split.slice(1)], { named: 'v2' })).toEqual({ versionId: 'v2' });
  });
});

describe('summaries and small helpers', () => {
  test('[DEP-ROLL-WARN] the job summary text says what stays on main', () => {
    const text = rollbackSummary('version-abc');
    expect(text).toContain('`main`');
    expect(text).toContain('the next approved deploy brings it back unless a revert merges first');
    expect(text).toContain('**Rolled back to:** version-abc');
    expect(text).not.toContain('now live');
    expect(text).toContain('If a deploy was waiting in the queue, cancel it.');
  });

  test('[SW-SWITCH] the summary tells the truth: riders keep plans, and no offline copy until they tap, even after a later good deploy', () => {
    for (const kind of ['live', 'main-same', 'main-released']) {
      const text = switchSummary({ kind, commit: 'abc123' });
      expect(text).toContain('keep their saved plans');
      expect(text).toContain('no offline copy until they tap **Make available offline** again');
      expect(text).toContain('even after a later good deploy');
      expect(text).toContain('`main`');
    }
  });

  test('[SW-SWITCH] the summary says which commit it built from, and whether main went out with it', () => {
    const live = switchSummary({ kind: 'live', commit: 'abc123' });
    expect(live).toContain('abc123');
    expect(live).toContain('the commit that was live');
    expect(live).not.toContain('released');
    const same = switchSummary({ kind: 'main-same', commit: 'abc123' });
    expect(same).toContain('the same files');
    expect(same).not.toContain('could be read');
    const released = switchSummary({ kind: 'main-released', commit: 'abc123' });
    expect(released).toContain('abc123');
    expect(released).toContain('also released');
    expect(released).not.toContain('could be read');
  });

  test('[DEP-STALE] an approval from an earlier try of the run counts as stale, and says what to do', () => {
    expect(staleReason({ sha: 'a', head: 'a', approvedAttempt: '2', thisAttempt: '2' })).toBe('');
    expect(staleReason({ sha: 'a', head: 'b', approvedAttempt: '1', thisAttempt: '1' })).toBe('A newer merge exists; nothing deployed.');
    const old = 'This approval belongs to an earlier try; re-run all jobs. Nothing deployed.';
    expect(staleReason({ sha: 'a', head: 'a', approvedAttempt: '1', thisAttempt: '2' })).toBe(old);
    expect(staleReason({ sha: 'a', head: 'a', approvedAttempt: '', thisAttempt: '2' })).toBe(old);
    expect(staleReason({ sha: 'a', head: 'a', approvedAttempt: '', thisAttempt: '' })).toBe(old);
  });

  test('[SW-SWITCH] commitOfVersion reads what deploy.yml and the switch write, and nothing looser', () => {
    const sha = 'a'.repeat(40);
    const of = (message?: string) => commitOfVersion({ annotations: message === undefined ? {} : { 'workers/message': message } });
    expect(of(`Commit ${sha}`)).toBe(sha);
    expect(of(`emergency-switch from Run workflow, commit ${sha}`)).toBe(sha);
    expect(of()).toBe('');
    expect(of('Commit abc')).toBe('');
    expect(of(`Commit ${sha}; rm -rf`)).toBe('');
    expect(commitOfVersion(null)).toBe('');
  });

  test('[SW-SWITCH] switchGuard: with no commit known, main\'s differences stop the switch, named in plain words', () => {
    const live = buildOf({ '/': 'old page', '/offline-worker.js': 'old worker' });
    const main = buildOf({ '/': 'new page', '/offline-worker.js': 'emergency', '/assets/a.js': 'a' });
    const stop = switchGuard(main, live, { alsoRelease: false });
    expect(stop.go).toBe(false);
    expect(stop.summary).toContain('/ (the page)');
    expect(stop.summary).toContain('/assets/a.js');
    expect(stop.summary).not.toContain('/offline-worker.js');
    expect(stop.summary).toContain('also_release_main');
    expect(stop.summary).not.toContain('No commit could be read');
    expect(switchGuard(main, live, { alsoRelease: true })).toMatchObject({ go: true, kind: 'main-released' });
  });

  test('[SW-SWITCH] switchGuard: only the worker differing is no difference; no live list can\'t be proved the same', () => {
    const live = buildOf({ '/': 'page', '/offline-worker.js': 'old worker' });
    const main = buildOf({ '/': 'page', '/offline-worker.js': 'emergency' });
    expect(switchGuard(main, live, { alsoRelease: false })).toMatchObject({ go: true, kind: 'main-same' });
    const noList = switchGuard(main, null, { alsoRelease: false });
    expect(noList.go).toBe(false);
    expect(noList.summary).toContain('could not be read');
    expect(noList.summary).toContain('or the site is down');
    expect(switchGuard(main, null, { alsoRelease: true })).toMatchObject({ go: true, kind: 'main-released' });
    expect(switchGuard(buildOf({ '/': 'page', '/offline-worker.js': 'emergency' }, 'other'), live, { alsoRelease: false }).go).toBe(false);
  });

  test('emergencyFailureSummary says what did and didn\'t happen', () => {
    const rollback = emergencyFailureSummary('rollback', false);
    expect(rollback).toContain('GitHub saw the rollback fail');
    expect(rollback).toContain('look at the site');
    expect(rollback).toContain('use switch');
    const theSwitch = emergencyFailureSummary('switch', false);
    expect(theSwitch).toContain('GitHub saw the switch fail');
    expect(theSwitch).toContain('If it failed building the live commit, run it again with also_release_main ticked: that also sends what `main` holds.');
    expect(theSwitch).toContain('If the list above names files');
    expect(emergencyFailureSummary('rollback', true)).toContain('was sent to Cloudflare');
    expect(emergencyFailureSummary('rollback', true)).not.toContain('saw the rollback fail');
    const check = emergencyFailureSummary('check', false);
    expect(check).toContain('nothing was changed');
    expect(check).toContain('refuse');
    // The one click meant to prove the buttons must never vouch for them.
    expect(check).not.toContain('buttons work');
    expect(check).toContain('no list or no details');
    expect(check).toContain('tell the agent');
  });

  test('formatRows lists date, version and message, newest first, so a refusal shows where a version id comes from', () => {
    const text = formatRows([
      { created_on: '2026-11-01T10:00:00Z', annotations: {}, versions: [{ version_id: 'old', percentage: 100 }] },
      { created_on: '2026-11-02T10:00:00Z', annotations: { 'workers/message': 'row message' }, versions: [{ version_id: 'new', percentage: 100 }] },
    ], { old: { annotations: { 'workers/message': 'version message' } } });
    const lines = text.split('\n');
    expect(lines.findIndex((l) => l.includes('new'))).toBeLessThan(lines.findIndex((l) => l.includes('old')));
    expect(text).toContain('2026-11-02');
    expect(text).toContain('row message');
    expect(text).toContain('version message');
    expect(formatRows(null)).toContain('no list');
  });

  test('[DEP-STALE] isStale: only the exact head of main is fresh, and no answer counts as stale', () => {
    expect(isStale('abc', 'abc')).toBe(false);
    expect(isStale('abc', 'def')).toBe(true);
    expect(isStale('', 'def')).toBe(true);
    expect(isStale('abc', '')).toBe(true);
    expect(isStale('', '')).toBe(true);
  });

  test('checkEmergencyWorker wants a classic script listed with its own hash', () => {
    const good = 'self.addEventListener("install",()=>{});';
    const build: BuildJson = { v: 1, configHash: 'c', files: { '/offline-worker.js': sha256(good) } };
    expect(checkEmergencyWorker(good, build)).toEqual([]);
    const moduleWorker = 'export const a = 1;';
    expect(checkEmergencyWorker(moduleWorker, { ...build, files: { '/offline-worker.js': sha256(moduleWorker) } }).join()).toContain('classic');
    expect(checkEmergencyWorker('other();', build).join()).toContain('build.json');
    expect(checkEmergencyWorker(null, build).join()).toContain('missing');
  });
});

describe('checkSelf', () => {
  test('[DEP-SELF-LIST] compares the live files with the live build.json', async () => {
    await expect(checkSelf(ORIGIN, { ...liveSite(FILES), ...fakeClock() })).resolves.toMatchObject({ ok: true, problems: [] });
    const wrong = liveSite({ ...FILES, '/': 'changed' }, buildOf(FILES));
    const result = await checkSelf(ORIGIN, { ...wrong, ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain('/ ');
  });

  test('[DEP-SELF-LIST] no build.json (a version from before this plan): only / and the worker must load, and it says so', async () => {
    const old = stubFetch((path) => (path === '/' || path === '/offline-worker.js' ? { body: 'any bytes' } : { status: 404 }));
    const result = await checkSelf(ORIGIN, { ...old, ...fakeClock() });
    expect(result.ok).toBe(true);
    expect(result.note).toMatch(/no build\.json/);
    expect(result.note).toMatch(/only/);
    expect(old.calls.map((c) => new URL(c.url).pathname).sort()).toEqual(['/', '/build.json', '/offline-worker.js']);
  });

  test('[DEP-SELF-LIST] no build.json and a worker that doesn\'t load: fail, naming it', async () => {
    const old = stubFetch((path) => (path === '/' ? { body: 'page' } : { status: 404 }));
    const result = await checkSelf(ORIGIN, { ...old, ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.problems.join()).toContain('/offline-worker.js');
  });

  test('[DEP-SELF-LIST] a site that answers 500 for build.json fails rather than passing as an old version', async () => {
    const down = stubFetch(() => ({ status: 500 }));
    const result = await checkSelf(ORIGIN, { ...down, ...fakeClock(), deadlineMs: 0 });
    expect(result.ok).toBe(false);
  });
});

// Each case starts Node, which can be slow on a cold, busy machine.
describe('afterDeployCheck: what the deploy job actually runs', () => {
  const stubGh = () => {
    const calls: string[][] = [];
    return { calls, gh: async (args: string[]) => { calls.push(args); return args[1] === 'list' ? '[]' : ''; } };
  };
  const bodyOf = (calls: string[][]) => { const c = calls.at(-1) ?? []; return String(c[c.indexOf('--body') + 1]); };

  test('[DEP-NOT-ARRIVED] a failed upload with the same version live: at once, and the issue says never arrived', async () => {
    const stub = stubGh();
    const clock = fakeClock();
    const result = await afterDeployCheck({ build: buildOf(FILES), origin: ORIGIN, uploadOutcome: 'failure', before: 'v1', live: 'v1', report: true, gh: stub.gh, ...liveSite({ '/': 'old' }), ...clock });
    expect(result.ok).toBe(false);
    expect(clock.now()).toBe(0);
    expect(bodyOf(stub.calls)).toContain('The upload never arrived');
  });

  test('[DEP-ISSUE-ONE] a good upload with wrong files: waits the five minutes, and the issue suggests the rollback', async () => {
    const stub = stubGh();
    const clock = fakeClock();
    await afterDeployCheck({ build: buildOf(FILES), origin: ORIGIN, uploadOutcome: 'success', before: 'v1', live: 'v2', report: true, gh: stub.gh, ...liveSite({ '/': 'old' }), ...clock });
    expect(clock.now()).toBe(300_000);
    expect(bodyOf(stub.calls)).toContain('found wrong files');
    expect(bodyOf(stub.calls)).toContain('v2');
  });

  test('[DEP-ISSUE-ONE] a gh that fails hides nothing: the result comes back, with the reason beside it', async () => {
    const gh = async () => { throw new Error('spawn gh ENOENT'); };
    const failed = await afterDeployCheck({ build: buildOf(FILES), origin: ORIGIN, report: true, gh, ...liveSite({ '/': 'old' }), ...fakeClock(), deadlineMs: 0 });
    expect(failed.ok).toBe(false);
    expect(failed.problems.join()).toContain('/ has different bytes');
    expect(failed.reportError).toContain('ENOENT');
    const passed = await afterDeployCheck({ build: buildOf(FILES), origin: ORIGIN, report: true, gh, ...liveSite(FILES), ...fakeClock() });
    expect(passed.ok).toBe(true);
    expect(passed.reportError).toContain('ENOENT');
  });

  test('[DEP-ISSUE-CLOSE] without report it touches no issue; with an unreadable build it still fails and reports', async () => {
    const stub = stubGh();
    await afterDeployCheck({ build: buildOf(FILES), origin: ORIGIN, report: false, gh: stub.gh, ...liveSite(FILES), ...fakeClock() });
    expect(stub.calls).toEqual([]);
    const missing = await afterDeployCheck({ build: null, origin: ORIGIN, report: true, gh: stub.gh, ...liveSite(FILES), ...fakeClock() });
    expect(missing.ok).toBe(false);
    expect(stub.calls.length).toBeGreaterThan(0);
  });
});

describe('checkSelf with the list from before a rollback', () => {
  const OLD = buildOf(FILES);
  const NEW = buildOf({ ...FILES, '/': 'older page' });

  test('[DEP-SELF-LIST] the old site matching its own list is no proof: it fails until the list changes', async () => {
    const before = JSON.stringify(OLD);
    const stuck = await checkSelf(ORIGIN, { ...liveSite(FILES, OLD), ...fakeClock(), changedFrom: before });
    expect(stuck.ok).toBe(false);
    expect(stuck.problems.join()).toContain('has not changed');

    const clock = fakeClock();
    const { fetch } = stubFetch((path) => {
      const arrived = clock.now() >= 60_000;
      if (path === '/build.json') return { body: JSON.stringify(arrived ? NEW : OLD) };
      return { body: arrived ? ({ '/': 'older page', '/offline-worker.js': FILES['/offline-worker.js'] })[path] : FILES[path as keyof typeof FILES] };
    });
    await expect(checkSelf(ORIGIN, { fetch, ...clock, changedFrom: before })).resolves.toMatchObject({ ok: true });
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
  });

  test('[DEP-SELF-LIST] a 404 counts as changed: the version rolled back to is from before this plan', async () => {
    const old = stubFetch((path) => (path === '/' || path === '/offline-worker.js' ? { body: 'x' } : { status: 404 }));
    await expect(checkSelf(ORIGIN, { ...old, ...fakeClock(), changedFrom: JSON.stringify(OLD) })).resolves.toMatchObject({ ok: true });
    await expect(checkSelf(ORIGIN, { ...old, ...fakeClock(), changedFrom: '' })).resolves.toMatchObject({ ok: true });
  });

  test('[DEP-SELF-LIST] readLiveList gives the bytes, empty for a 404, null when it can\'t tell', async () => {
    await expect(readLiveList(ORIGIN, liveSite(FILES, OLD))).resolves.toBe(JSON.stringify(OLD));
    await expect(readLiveList(ORIGIN, stubFetch(() => ({ status: 404 })))).resolves.toBe('');
    await expect(readLiveList(ORIGIN, stubFetch(() => ({ status: 500 })))).resolves.toBeNull();
    await expect(readLiveList(ORIGIN, stubFetch(() => ({ throws: 'down' })))).resolves.toBeNull();
  });
});

describe('the command, against a real local server', { timeout: 30_000 }, () => {
  const SCRIPT = fileURLToPath(new URL('../../../tools/deploy-check.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'wf-deploy-'));
  const servers: Server[] = [];
  afterAll(() => {
    for (const s of servers) s.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const run = promisify(execFile);

  async function serve(files: Record<string, string>, seen: Array<string | string[] | undefined> = []): Promise<string> {
    const server = createServer((req, res) => {
      seen.push(req.headers['accept-encoding']);
      const body = files[req.url ?? ''];
      if (body === undefined) { res.writeHead(404); res.end('nope'); return; }
      // As Cloudflare does: the bytes on the wire are compressed when the client allows it.
      const accepts = String(req.headers['accept-encoding'] ?? '');
      if (accepts.includes('br')) { res.writeHead(200, { 'content-encoding': 'br' }); res.end(brotliCompressSync(body)); return; }
      if (accepts.includes('gzip')) { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(gzipSync(body)); return; }
      res.writeHead(200);
      res.end(body);
    });
    servers.push(server);
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
  }
  const writeJson = (name: string, value: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  const cli = (args: string[], env: Record<string, string> = {}) => run(process.execPath, [SCRIPT, ...args], { env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env } });

  test('[DEP-NO-CACHE] a page served compressed is asked for with Accept-Encoding and hashed decoded', async () => {
    const build = buildOf(FILES);
    const seen: Array<string | string[] | undefined> = [];
    const origin = await serve({ ...FILES, '/build.json': JSON.stringify(build) }, seen);
    await cli(['--build', writeJson('build-ok.json', build), '--origin', origin, '--deadline-ms', '0']);
    expect(seen.length).toBe(3);
    for (const encoding of seen) expect(String(encoding)).toContain('gzip');
  });

  test('[DEP-MISMATCH] the command exits 1 and names the path', async () => {
    const build = buildOf(FILES);
    const origin = await serve({ '/': 'other', '/offline-worker.js': FILES['/offline-worker.js'], '/build.json': JSON.stringify(build) });
    await expect(cli(['--build', writeJson('build-bad.json', build), '--origin', origin, '--deadline-ms', '0'])).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('/ has different bytes') });
  });

  test('[DEP-MISMATCH] an unreadable build file is a failure, not a pass', async () => {
    const origin = await serve(FILES);
    await expect(cli(['--build', join(dir, 'missing.json'), '--origin', origin, '--deadline-ms', '0'])).rejects.toMatchObject({ code: 1 });
  });

  test('[DEP-NOT-ARRIVED] empty values from the workflow are read as empty: a skipped upload fails at once, without waiting', async () => {
    const build = buildOf(FILES);
    const origin = await serve({ '/': 'old page' });
    await expect(cli(['--build', writeJson('build-skip.json', build), '--origin', origin, '--upload-outcome', 'skipped', '--before', '', '--live', ''])).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('/ has different bytes') });
  });

  test('[DEP-SELF-LIST] --self reads the list from the origin and says when there is none', async () => {
    const origin = await serve(FILES);
    const { stdout } = await cli(['--self', '--origin', origin, '--deadline-ms', '0']);
    expect(stdout).toMatch(/no build\.json/);
  });

  test('[DEP-LATCH] --decide with the latch off writes changed=false check=false and asks the live site nothing', async () => {
    const seen: Array<string | string[] | undefined> = [];
    const origin = await serve(FILES, seen);
    const output = join(dir, 'output-off.txt');
    writeFileSync(output, '');
    await cli(['--decide', '--build', writeJson('b1.json', buildOf(FILES)), '--config', writeJson('c1.json', { deployEnabled: false }), '--origin', origin], { GITHUB_OUTPUT: output });
    expect(readFileSync(output, 'utf8')).toBe('changed=false\ncheck=false\n');
    expect(seen).toEqual([]);
  });

  test('[DEP-LATCH] --decide with the latch open and no live list writes changed=true, check=false', async () => {
    const origin = await serve(FILES);
    const output = join(dir, 'output-on.txt');
    writeFileSync(output, '');
    await cli(['--decide', '--build', writeJson('b2.json', buildOf(FILES)), '--config', writeJson('c2.json', { deployEnabled: true, deployWithoutReviewer: true }), '--origin', origin], { GITHUB_OUTPUT: output });
    expect(readFileSync(output, 'utf8')).toBe('changed=true\ncheck=false\n');
  });

  test('[DEP-LATCH] --decide when gh can\'t read the environment: exit 1, the summary says why, and no changed=true', async () => {
    const origin = await serve(FILES);
    const output = join(dir, 'output-refused.txt');
    const summary = join(dir, 'summary-refused.txt');
    writeFileSync(output, '');
    writeFileSync(summary, '');
    await expect(cli(['--decide', '--build', writeJson('b3.json', buildOf(FILES)), '--config', writeJson('c3.json', { deployEnabled: true }), '--origin', origin], { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, PATH: '' })).rejects.toMatchObject({ code: 1 });
    expect(readFileSync(output, 'utf8')).not.toContain('changed=true');
    expect(readFileSync(summary, 'utf8')).toContain('could not be read');
  });

  test('[DEP-ISSUE-ONE] with no gh, the command still names the wrong file, says the issue failed, and exits 1', async () => {
    const build = buildOf(FILES);
    const origin = await serve({ '/': 'other', '/offline-worker.js': FILES['/offline-worker.js'], '/build.json': JSON.stringify(build) });
    const summary = join(dir, 'summary-nogh.txt');
    writeFileSync(summary, '');
    await expect(cli(['--build', writeJson('build-nogh.json', build), '--origin', origin, '--deadline-ms', '0', '--report'], { PATH: '', GITHUB_STEP_SUMMARY: summary })).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('/ has different bytes') });
    const text = readFileSync(summary, 'utf8');
    expect(text).toContain('The after-deploy check failed');
    expect(text).toContain('/ has different bytes');
    expect(text).toContain('The issue could not be updated');
  });

  test('[DEP-ISSUE-CLOSE] with no gh, a passing check still says the site is fine, and exits 1 for the issue alone', async () => {
    const build = buildOf(FILES);
    const origin = await serve({ ...FILES, '/build.json': JSON.stringify(build) });
    const summary = join(dir, 'summary-nogh-ok.txt');
    writeFileSync(summary, '');
    await expect(cli(['--build', writeJson('build-nogh-ok.json', build), '--origin', origin, '--deadline-ms', '0', '--report'], { PATH: '', GITHUB_STEP_SUMMARY: summary })).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('The live site matches.') });
    expect(readFileSync(summary, 'utf8')).toContain('The issue could not be updated');
  });

  test('[DEP-SELF-LIST] a failing --self exits 1 and names the path, so a bad emergency goes red', async () => {
    const build = buildOf(FILES);
    const origin = await serve({ '/': 'other', '/offline-worker.js': FILES['/offline-worker.js'], '/build.json': JSON.stringify(build) });
    await expect(cli(['--self', '--origin', origin, '--deadline-ms', '0'])).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('/ has different bytes') });
  });

  test('[DEP-SELF-LIST] --self --changed-from fails while the list is the one saved before', async () => {
    const build = buildOf(FILES);
    const body = JSON.stringify(build);
    const origin = await serve({ ...FILES, '/build.json': body });
    const saved = join(dir, 'before-list.txt');
    await cli(['--save-live-list', saved, '--origin', origin]);
    expect(readFileSync(saved, 'utf8')).toBe(body);
    await expect(cli(['--self', '--origin', origin, '--changed-from', saved, '--deadline-ms', '0'])).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('has not changed') });
    await cli(['--self', '--origin', origin, '--changed-from', join(dir, 'never-saved.txt'), '--deadline-ms', '0']);
  });

  test('[SW-SWITCH] --switch-guard stops with the paths in the summary, or goes on with also_release_main', async () => {
    const origin = await serve({ '/build.json': JSON.stringify(buildOf({ '/': 'live page', '/offline-worker.js': 'w' })) });
    const main = writeJson('main-build.json', buildOf({ '/': 'main page', '/offline-worker.js': 'e' }));
    const summary = join(dir, 'summary-guard.txt');
    const output = join(dir, 'output-guard.txt');
    writeFileSync(summary, '');
    writeFileSync(output, '');
    await expect(cli(['--switch-guard', '--build', main, '--origin', origin, '--also-release-main', 'false'], { GITHUB_STEP_SUMMARY: summary })).rejects.toMatchObject({ code: 1 });
    expect(readFileSync(summary, 'utf8')).toContain('/ (the page)');
    await cli(['--switch-guard', '--build', main, '--origin', origin, '--also-release-main', 'true'], { GITHUB_OUTPUT: output });
    expect(readFileSync(output, 'utf8')).toBe('kind=main-released\n');
  });

  test('[SW-SWITCH] --commit-of prints the commit, or nothing, from a file that may be missing', async () => {
    const sha = 'b'.repeat(40);
    const { stdout } = await cli(['--commit-of', writeJson('v-commit.json', { annotations: { 'workers/message': `Commit ${sha}` } })]);
    expect(stdout.trim()).toBe(sha);
    expect((await cli(['--commit-of', join(dir, 'no-such.json')])).stdout.trim()).toBe('');
  });

  test('[DEP-STALE] --is-stale prints the answer and says why, with an empty or an older attempt', async () => {
    const summary = join(dir, 'summary-stale.txt');
    writeFileSync(summary, '');
    const yes = await cli(['--is-stale', 'a', 'a', '--approved-attempt', '1', '--this-attempt', '2'], { GITHUB_STEP_SUMMARY: summary });
    expect(yes.stdout.trim()).toBe('true');
    expect(readFileSync(summary, 'utf8')).toContain('earlier try');
    expect((await cli(['--is-stale', 'a', 'a', '--approved-attempt', '2', '--this-attempt', '2'])).stdout.trim()).toBe('false');
    expect((await cli(['--is-stale', 'a', 'b', '--approved-attempt', '2', '--this-attempt', '2'])).stdout.trim()).toBe('true');
  });

  test('[DEP-ROLL-REFUSE] a refusal prints the ten rows in the summary, so the owner can name a version', async () => {
    const list = [
      { created_on: '2026-11-01T10:00:00Z', annotations: {}, versions: [{ version_id: 'older-id', percentage: 100 }] },
      { created_on: '2026-11-02T10:00:00Z', annotations: { 'workers/triggered_by': 'rollback' }, versions: [{ version_id: 'live-id', percentage: 100 }] },
    ];
    const summary = join(dir, 'summary-refuse.txt');
    writeFileSync(summary, '');
    await expect(cli(['--pick-rollback', writeJson('rows-refuse.json', list)], { GITHUB_STEP_SUMMARY: summary })).rejects.toMatchObject({ code: 1 });
    expect(readFileSync(summary, 'utf8')).toContain('older-id');
    expect(readFileSync(summary, 'utf8')).toContain('Rollback refused');
  });

  test('[DEP-ROLL-REFUSE] --pick-rollback prints the id, or says why not and exits 1', async () => {
    const list = [
      { created_on: '2026-11-01T10:00:00Z', annotations: {}, versions: [{ version_id: 'old', percentage: 100 }] },
      { created_on: '2026-11-02T10:00:00Z', annotations: {}, versions: [{ version_id: 'new', percentage: 100 }] },
    ];
    const { stdout } = await cli(['--pick-rollback', writeJson('rows.json', list), '--named', '']);
    expect(stdout.trim()).toBe('old');
    await expect(cli(['--pick-rollback', writeJson('rows-bad.json', list), '--named', 'preview'])).rejects.toMatchObject({ code: 1 });
    writeFileSync(join(dir, 'rows-junk.json'), 'not json');
    await expect(cli(['--pick-rollback', join(dir, 'rows-junk.json')])).rejects.toMatchObject({ code: 1 });
  });

  test('[DEP-ROLL-REFUSE] --check-only true goes red and says no details, where a named rollback would go on', async () => {
    const list = [
      { created_on: '2026-11-01T10:00:00Z', annotations: {}, versions: [{ version_id: 'n11-old', percentage: 100 }] },
      { created_on: '2026-11-02T10:00:00Z', annotations: {}, versions: [{ version_id: 'n11-new', percentage: 100 }] },
    ];
    const rowsFile = writeJson('rows-n11.json', list);
    const summary = join(dir, 'summary-n11.txt');
    writeFileSync(summary, '');
    const named = ['--pick-rollback', rowsFile, '--named', 'n11-old', '--versions-dir', dir];
    await expect(cli([...named, '--check-only', 'true'], { GITHUB_STEP_SUMMARY: summary })).rejects.toMatchObject({ code: 1 });
    expect(readFileSync(summary, 'utf8')).toContain('no details');
    expect((await cli([...named, '--check-only', 'false'])).stdout.trim()).toBe('n11-old');
  });

  test('--pick-rollback reads version details from a folder and stops on the switch', async () => {
    const list = [
      { created_on: '2026-11-01T10:00:00Z', annotations: {}, versions: [{ version_id: 'old', percentage: 100 }] },
      { created_on: '2026-11-02T10:00:00Z', annotations: {}, versions: [{ version_id: 'mid', percentage: 100 }] },
      { created_on: '2026-11-03T10:00:00Z', annotations: {}, versions: [{ version_id: 'new', percentage: 100 }] },
    ];
    const rowsFile = writeJson('rows3.json', list);
    writeJson('mid.json', { id: 'mid', annotations: { 'workers/tag': SWITCH_TAG } });
    writeJson('new.json', { id: 'new', annotations: {} });
    await expect(cli(['--pick-rollback', rowsFile, '--versions-dir', dir])).rejects.toMatchObject({ code: 1 });
    writeJson('mid.json', { id: 'mid', annotations: {} });
    const { stdout } = await cli(['--pick-rollback', rowsFile, '--versions-dir', dir]);
    expect(stdout.trim()).toBe('mid');
    const ids = await cli(['--rollback-candidates', rowsFile]);
    expect(ids.stdout.trim().split(/\s+/)).toEqual(['new', 'mid']);
  });

  test('--assert-rehearsal takes only the rehearsal Worker', async () => {
    await cli(['--assert-rehearsal', 'load-check-rehearsal']);
    for (const name of ['load-check', 'load-check-rehearsal2']) await expect(cli(['--assert-rehearsal', name])).rejects.toMatchObject({ code: 1 });
  });
});

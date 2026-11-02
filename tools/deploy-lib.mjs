// The rules of a deploy, with fetch, sleep and gh passed in, so tests need no network. Spec section 9.7, plan Task 7.
// tools/deploy-check.mjs is the command around them. Nothing here ever deploys or rolls back.
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const ISSUE_LABEL = 'after-deploy';
export const SWITCH_TAG = 'emergency-switch';
export const ROLLBACK_MESSAGE = 'Emergency rollback';
export const REHEARSAL_WORKER = 'load-check-rehearsal';

export const ROLLBACK_SUMMARY = [
  '**What stays on `main`:** the commit you rolled back is still on `main`, so the next approved deploy brings it back unless a revert merges first.',
  'Saved plans, setups and bikes were not touched: they are in the browser\'s own storage.',
].join('\n\n');

export const SWITCH_SUMMARY = [
  '**The emergency switch is live.** The offline worker removes itself and its caches, and the site loads from the network.',
  'Riders keep their saved plans, setups and bikes. They have no offline copy until they tap **Make available offline** again, even after a later good deploy: opening the site with signal doesn\'t bring it back, and nothing tells them.',
  '**What stays on `main`:** every commit, including the one that caused this. The next approved deploy replaces the switch, so merge a fix or a revert first.',
].join('\n\n');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REQUEST_TIMEOUT_MS = 30_000;

/** Is this approval older than `main`? No answer counts as stale: a deploy needs a positive yes. */
export function isStale(sha, head) {
  return !sha || !head || sha !== head;
}

export function compareBuild(local, live) {
  const localFiles = local?.files ?? {};
  const liveFiles = live?.files ?? {};
  const changed = [...new Set([...Object.keys(localFiles), ...Object.keys(liveFiles)])]
    .filter((path) => localFiles[path] !== liveFiles[path])
    .sort();
  if (live && local?.configHash !== live.configHash) changed.push('wrangler.jsonc');
  return { same: Boolean(live) && changed.length === 0, changed };
}

// As a browser asks: Cloudflare may answer compressed, and fetch hands back the decoded body that is hashed.
function browserRequest() {
  return {
    cache: 'no-store',
    redirect: 'follow',
    headers: { 'Accept-Encoding': 'gzip, deflate, br', Accept: 'text/html,application/xhtml+xml,*/*' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

const addressOf = (origin, path) => new URL(path, new URL(origin).origin).href;

/** One file's answer: { bytes } or { problem }, naming the path. */
async function look(origin, path, fetchFn) {
  try {
    const response = await fetchFn(addressOf(origin, path), browserRequest());
    if (response.redirected) return { problem: `${path} was redirected` };
    if (!response.ok) return { status: response.status, problem: `${path} answered ${response.status}` };
    return { bytes: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    return { problem: `${path} did not load (${error.message})` };
  }
}

/** The live /build.json, or null when there's none (404, or a 200 that isn't a build list). Anything else throws. */
export async function fetchLiveBuild(origin, { fetch: fetchFn }) {
  const answer = await look(origin, '/build.json', fetchFn);
  if (answer.status === 404) return null;
  if (answer.problem) throw new Error(answer.problem);
  try {
    const build = JSON.parse(answer.bytes.toString('utf8'));
    return build && build.v === 1 && build.files && typeof build.files === 'object' ? build : null;
  } catch {
    return null;
  }
}

async function compareFiles(build, origin, fetchFn) {
  const paths = Object.keys(build.files ?? {});
  if (paths.length === 0) return ['the build lists no files'];
  const answers = await Promise.all(paths.map(async (path) => {
    const answer = await look(origin, path, fetchFn);
    if (answer.problem) return answer.problem;
    return sha256(answer.bytes) === build.files[path] ? null : `${path} has different bytes`;
  }));
  return answers.filter(Boolean);
}

/** Looks until a round finds nothing wrong, or the deadline's last look has. Files may arrive late (§9.7). */
async function untilGood(round, { sleep, now = Date.now, deadlineMs = 300_000, intervalMs = 15_000 }) {
  const start = now();
  for (;;) {
    const result = await round();
    if (result.problems.length === 0) return { ok: true, ...result };
    const left = deadlineMs - (now() - start);
    if (left <= 0) return { ok: false, ...result };
    await sleep(Math.min(intervalMs, left));
  }
}

/** Does the live site serve exactly this build, including its list? */
export async function checkLive(buildJson, origin, { fetch: fetchFn, ...timing }) {
  return untilGood(async () => {
    const problems = await compareFiles(buildJson, origin, fetchFn);
    if (problems.length > 0) return { problems };
    try {
      if (!compareBuild(buildJson, await fetchLiveBuild(origin, { fetch: fetchFn })).same) problems.push('/build.json is not this build\'s list');
    } catch (error) {
      problems.push(error.message);
    }
    return { problems };
  }, timing);
}

/**
 * Does the live site match its own list? For after a rollback or a switch, when what should be live isn't known here.
 * A version from before this plan has no list: then only / and the worker must load, and the note says so.
 * It can't tell a rollback that hasn't arrived yet from one that has: both sites match their own lists.
 */
export async function checkSelf(origin, { fetch: fetchFn, ...timing }) {
  return untilGood(async () => {
    let list;
    try {
      list = await fetchLiveBuild(origin, { fetch: fetchFn });
    } catch (error) {
      return { problems: [error.message] };
    }
    if (list) return { problems: await compareFiles(list, origin, fetchFn) };
    const answers = await Promise.all(['/', '/offline-worker.js'].map((path) => look(origin, path, fetchFn)));
    return {
      problems: answers.map((answer) => answer.problem).filter(Boolean),
      note: 'This version has no build.json, so only / and /offline-worker.js were checked to load; their bytes were not compared.',
    };
  }, timing);
}

const WHAT_THEY_ARE = { '/': 'the page', '/offline-worker.js': 'the offline worker', 'wrangler.jsonc': 'the site\'s settings' };

/**
 * Is a click needed, and does the check run? With the latch off, neither, and the live site isn't asked:
 * it has no build.json yet, so a check would only fail and open an issue.
 */
export async function decide(local, config, origin, { fetch: fetchFn }) {
  if (config?.deployEnabled !== true) {
    return { changed: false, check: false, summary: 'The deploy latch is off (`deployEnabled` is false in `build.config.json`), so nothing is compared and no click is needed.' };
  }
  const live = await fetchLiveBuild(origin, { fetch: fetchFn });
  const { same, changed } = compareBuild(local, live);
  if (same) return { changed: false, check: true, summary: 'The build is the same as what is live: no click is needed. The live files are checked anyway.' };
  const lines = changed.map((path) => `- ${path}${WHAT_THEY_ARE[path] ? ` (${WHAT_THEY_ARE[path]})` : ''}`);
  const intro = live ? 'This release would change these files for riders:' : 'The live site has no `build.json` yet, so everything counts as changed:';
  return { changed: true, check: false, summary: [intro, '', ...lines, '', 'Nothing reaches riders until you approve it.'].join('\n') };
}

/** Can the upload be said to have never arrived? Only when it didn't run, or the same version is still live after it failed. */
export function uploadNeverArrived({ outcome, before, after }) {
  if (outcome === 'success') return false;
  if (outcome === 'skipped') return true;
  return Boolean(before) && before === after;
}

/** Opens one issue, comments on a later failure, closes on a pass. It only ever talks; it never rolls back. */
export async function reportIssue(result, { gh, liveVersion, lastDeployActive, runUrl }) {
  const live = liveVersion || 'not known';
  const open = JSON.parse((await gh(['issue', 'list', '--label', ISSUE_LABEL, '--state', 'open', '--json', 'number', '--limit', '20'])) || '[]');
  if (result.ok) {
    for (const { number } of open) await gh(['issue', 'close', String(number), '--comment', `The after-deploy check passed. Version now live: ${live}.`]);
    return;
  }
  const problems = result.problems.map((problem) => `- ${problem}`).join('\n');
  const run = runUrl ? `\n\nThe run: ${runUrl}` : '';
  const body = lastDeployActive
    ? `The upload never arrived. Riders see no change: the previous deployment is still active (${live}).\n\nDon't roll back: a rollback would go one version too far. Open the run, re-run all its jobs, and approve it again.\n\n${problems}${run}`
    : `The after-deploy check found wrong files. Version live now: ${live}.\n\n${problems}\n\nThe site may be mixed. To go back: Actions → emergency → Run workflow → rollback. Nothing rolls back by itself.${run}`;
  if (open.length > 0) {
    await gh(['issue', 'comment', String(open[0].number), '--body', body]);
    return;
  }
  // `gh issue create --label` fails on a label that doesn't exist; --force makes this safe to repeat.
  await gh(['label', 'create', ISSUE_LABEL, '--force', '--color', 'B60205', '--description', 'The after-deploy check failed']);
  await gh(['issue', 'create', '--title', lastDeployActive ? 'The upload never arrived' : 'After-deploy check found wrong files', '--label', ISSUE_LABEL, '--body', body]);
}

// `wrangler deployments list --json` gives Cloudflare's rows oldest first, at most ten (read from its source on 4.156.0).
// The order is never trusted. A preview (`wrangler versions upload`) makes a version and no row.
const newestFirst = (rows) => [...rows].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)));
const wholeVersion = (row) => row?.versions?.find((version) => version.percentage === 100)?.version_id;

/** The version serving all traffic now, or '' if that can't be said. */
export function liveVersionOf(deployments) {
  return Array.isArray(deployments) && deployments.length > 0 ? wholeVersion(newestFirst(deployments)[0]) ?? '' : '';
}

/** The ids whose details pickRollback needs: the live one and the one before it. */
export function rollbackCandidates(deployments) {
  return Array.isArray(deployments) ? newestFirst(deployments).slice(0, 2).map(wholeVersion).filter(Boolean) : [];
}

const isRollbackRow = (row) => row.annotations?.['workers/triggered_by'] === 'rollback' || String(row.annotations?.['workers/message'] ?? '').startsWith(ROLLBACK_MESSAGE);

// `wrangler deploy --tag` marks the version; whether Cloudflare copies that to the deployment's row is unconfirmed, so both count.
const carriesSwitchMark = (annotations) => annotations?.['workers/tag'] === SWITCH_TAG || String(annotations?.['workers/message'] ?? '').includes(SWITCH_TAG);

/**
 * Which version may a rollback go to? Always a version that once served all traffic, so never a preview.
 * `versions` ({ id: `wrangler versions view --json` }), when given, must cover the live one and the one before it.
 */
export function pickRollback(deployments, { named, versions } = {}) {
  if (!Array.isArray(deployments) || deployments.length === 0) return { refuse: 'Cloudflare gave no list of deployments, so nothing is safe to pick.' };
  const rows = newestFirst(deployments);
  const live = rows[0];
  const liveId = wholeVersion(live);

  if (named) {
    if (named === liveId) return { refuse: `Version ${named} is already live.` };
    const row = rows.find((candidate) => candidate.versions?.some((version) => version.version_id === named));
    if (!row) return { refuse: `Version ${named} is not among the deployments Cloudflare still lists. It may be a preview, which never served riders, or past Cloudflare's 100 versions.` };
    if (wholeVersion(row) !== named) return { refuse: `Version ${named} only ever served part of the traffic.` };
    return { versionId: named };
  }

  const before = rows[1];
  if (!before) return { refuse: 'There is no deployment before the live one.' };
  const beforeId = wholeVersion(before);
  if (!liveId || !beforeId) return { refuse: 'The live deployment or the one before it splits its traffic. Name a version.' };
  if (isRollbackRow(live)) return { refuse: 'A rollback is live, so going back again would land on the release it replaced. Name a version.' };
  if (versions && !(versions[liveId] && versions[beforeId])) return { refuse: 'Cloudflare gave no details for the live version or the one before it, so a switch can\'t be ruled out. Name a version.' };
  if (carriesSwitchMark(live.annotations) || carriesSwitchMark(versions?.[liveId]?.annotations)) return { refuse: 'The emergency switch is live, and the deployment before it is what it was used against. Name a version.' };
  if (carriesSwitchMark(before.annotations) || carriesSwitchMark(versions?.[beforeId]?.annotations)) return { refuse: 'The deployment before the live one is the emergency switch. Name a version.' };
  if (beforeId === liveId) return { refuse: 'The deployment before the live one is the same version. Name a version.' };
  return { versionId: beforeId };
}

/** §9.5 step 1 for the emergency build: the worker exists, is a classic script, and is the one `build.json` lists. */
export function checkEmergencyWorker(source, buildJson) {
  if (source === null || source === undefined) return ['/offline-worker.js is missing'];
  const problems = [];
  try {
    new vm.Script(source);
  } catch (error) {
    problems.push(`/offline-worker.js is not a classic script (${error.message})`);
  }
  if (buildJson?.files?.['/offline-worker.js'] !== sha256(source)) problems.push('/offline-worker.js is not the file build.json lists');
  return problems;
}

// The rules of a deploy, with fetch, sleep and gh passed in, so tests need no network. Spec section 9.7, plan Task 7.
// tools/deploy-check.mjs is the command around them. Nothing here ever deploys or rolls back.
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const ISSUE_LABEL = 'after-deploy';
export const SWITCH_TAG = 'emergency-switch';
export const ROLLBACK_MESSAGE = 'Emergency rollback';
export const REHEARSAL_WORKER = 'load-check-rehearsal';

export function rollbackSummary(version) {
  return [
    `**Rolled back to:** ${version || 'not known'}.`,
    '**What stays on `main`:** the commit you rolled back is still on `main`, so the next approved deploy brings it back unless a revert merges first.',
    'If a deploy was waiting in the queue, cancel it.',
    'Saved plans, setups and bikes were not touched: they are in the browser\'s own storage.',
  ].join('\n\n');
}

const BUILT_FROM = {
  live: (commit) => `It was built from commit ${commit}, the commit that was live, so riders get no other change.`,
  'main-same': (commit) => `It was built from \`main\` at ${commit}, not from a live commit. \`main\` serves the same files as the live site, so riders get no other change.`,
  'main-released': (commit) => `It was built from \`main\` at ${commit}, not from a live commit, and you chose to go on: what \`main\` holds was also released to riders. The list is above.`,
};

export function switchSummary({ kind, commit }) {
  return [
    '**The emergency switch is live.** The offline worker removes itself and its caches, and the site loads from the network.',
    (BUILT_FROM[kind] ?? BUILT_FROM['main-released'])(commit || 'not known'),
    'Riders keep their saved plans, setups and bikes. They have no offline copy until they tap **Make available offline** again, even after a later good deploy: opening the site with signal doesn\'t bring it back, and nothing tells them.',
    '**What stays on `main`:** every commit, including the one that caused this. The next approved deploy replaces the switch, so merge a fix or a revert first.',
  ].join('\n\n');
}

/** What the owner reads when an emergency run fails. `acted`: the write itself went through. */
export function emergencyFailureSummary(action, acted) {
  if (action === 'check') return 'The check failed, and nothing was changed. If the lines above refuse because of what is live (a rollback or the switch live, only one deployment), that is the answer. If they say Cloudflare gave no list or no details, or anything else, tell the agent: the buttons may not work.';
  if (acted) return `The ${action} was sent to Cloudflare, but the live site could not be confirmed (see above). Look at the site on a phone before pressing again, and tell the agent.`;
  if (action === 'rollback') return 'GitHub saw the rollback fail. Riders most likely still have what they had: look at the site. Try again, or tell the agent. If offline is broken, use switch.';
  return 'GitHub saw the switch fail. Riders most likely still have what they had: look at the site. If the list above names files, read it before going on. If it failed building the live commit, run it again with also_release_main ticked: that also sends what `main` holds. Otherwise try again, or tell the agent.';
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REQUEST_TIMEOUT_MS = 30_000;

/** Is this approval older than `main`? No answer counts as stale: a deploy needs a positive yes. */
export function isStale(sha, head) {
  return !sha || !head || sha !== head;
}

/**
 * Why this run may not upload, or ''. Re-running only the deploy job keeps the old approval, so the approval's try
 * must be this try. Stated with the same words as the workflow's summary.
 */
export function staleReason({ sha, head, approvedAttempt, thisAttempt }) {
  if (isStale(sha, head)) return 'A newer merge exists; nothing deployed.';
  if (!approvedAttempt || String(approvedAttempt) !== String(thisAttempt)) return 'This approval belongs to an earlier try; re-run all jobs. Nothing deployed.';
  return '';
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

async function liveListAnswer(origin, fetchFn) {
  const answer = await look(origin, '/build.json', fetchFn);
  if (answer.status === 404) return { build: null, raw: '' };
  if (answer.problem) throw new Error(answer.problem);
  const raw = answer.bytes.toString('utf8');
  try {
    const build = JSON.parse(raw);
    return { build: build && build.v === 1 && build.files && typeof build.files === 'object' ? build : null, raw };
  } catch {
    return { build: null, raw };
  }
}

/** The live /build.json, or null when there's none (404, or a 200 that isn't a build list). Anything else throws. */
export async function fetchLiveBuild(origin, { fetch: fetchFn }) {
  return (await liveListAnswer(origin, fetchFn)).build;
}

/** The live list's bytes, to tell later that it changed: '' for a 404, null when it can't be told. Never throws: it must not stop a rollback. */
export async function readLiveList(origin, { fetch: fetchFn }) {
  try {
    return (await liveListAnswer(origin, fetchFn)).raw;
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
 * A site that hasn't changed yet also matches its own list, so `changedFrom`, the list's bytes from before the change,
 * must be gone first. A 404 counts as changed.
 */
export async function checkSelf(origin, { fetch: fetchFn, changedFrom, ...timing }) {
  return untilGood(async () => {
    let list;
    let raw;
    try {
      ({ build: list, raw } = await liveListAnswer(origin, fetchFn));
    } catch (error) {
      return { problems: [error.message] };
    }
    if (list && changedFrom && raw === changedFrom) return { problems: ['/build.json has not changed since before the rollback, so it has not arrived (or the version has identical files)'] };
    if (list) return { problems: await compareFiles(list, origin, fetchFn) };
    const answers = await Promise.all(['/', '/offline-worker.js'].map((path) => look(origin, path, fetchFn)));
    return {
      problems: answers.map((answer) => answer.problem).filter(Boolean),
      note: 'This version has no build.json, so only / and /offline-worker.js were checked to load; their bytes were not compared.',
    };
  }, timing);
}

const WHAT_THEY_ARE = { '/': 'the page', '/offline-worker.js': 'the offline worker', 'wrangler.jsonc': 'the site\'s settings' };

/** Does this environment answer (`GET …/environments/<name>`) have a required reviewer? */
export function hasRequiredReviewer(environment) {
  const rules = environment?.protection_rules;
  return Array.isArray(rules) && rules.some((rule) => Array.isArray(rule.reviewers) && rule.reviewers.length > 0);
}

/**
 * A job naming an environment that lacks a reviewer just runs, so a merge would reach riders with no click.
 * Throws unless the environment proves the click exists, or the config says automatic on purpose.
 */
async function requireTheClick(config, readApprovalEnv) {
  if (config.deployWithoutReviewer === true) return;
  let environment;
  try {
    environment = await readApprovalEnv();
  } catch (error) {
    throw new Error(`No click asked for, and this run stops: the production-approval environment could not be read (${error.message}), so the owner's click can't be proved.`);
  }
  if (!hasRequiredReviewer(environment)) throw new Error('No click asked for, and this run stops: production-approval has no required reviewer, so a merge would reach riders with no click. Add the reviewer, or set deployWithoutReviewer to true in build.config.json on purpose.');
}

/**
 * Is a click needed, and does the check run? With the latch off, neither, and the live site isn't asked:
 * it has no build.json yet, so a check would only fail and open an issue.
 */
export async function decide(local, config, origin, { fetch: fetchFn, readApprovalEnv }) {
  if (config?.deployEnabled !== true) {
    return { changed: false, check: false, summary: 'The deploy latch is off (`deployEnabled` is false in `build.config.json`), so nothing is compared and no click is needed.' };
  }
  const live = await fetchLiveBuild(origin, { fetch: fetchFn });
  const { same, changed } = compareBuild(local, live);
  if (same) return { changed: false, check: true, summary: 'The build is the same as what is live: no click is needed. The live files are checked anyway.' };
  await requireTheClick(config, readApprovalEnv);
  const lines = changed.map((path) => `- ${path}${WHAT_THEY_ARE[path] ? ` (${WHAT_THEY_ARE[path]})` : ''}`);
  const intro = live ? 'This release would change these files for riders:' : 'The live site has no `build.json` yet, so everything counts as changed:';
  const ending = config.deployWithoutReviewer === true ? 'deployWithoutReviewer is true: this goes out with no click.' : 'Nothing reaches riders until you approve it.';
  return { changed: true, check: false, summary: [intro, '', ...lines, '', ending].join('\n') };
}

/** The commit a version was built from, from the message deploy.yml and the switch write. '' if it has none. */
export function commitOfVersion(details) {
  const message = details?.annotations?.['workers/message'];
  return /^(?:Commit |emergency-switch from Run workflow, commit )([0-9a-f]{40})$/.exec(String(message ?? ''))?.[1] ?? '';
}

/**
 * With no live commit known, the switch can only build from main, which may hold what nobody approved.
 * Everything but the worker must then match the live list, or the owner must say so: `alsoRelease`.
 */
export function switchGuard(local, live, { alsoRelease }) {
  const paths = compareBuild(local, live).changed.filter((path) => path !== '/offline-worker.js');
  if (live && paths.length === 0) return { go: true, kind: 'main-same', summary: 'The switch is building from `main`, not from a live commit, and `main` serves the same files as the live site.' };
  const lines = paths.map((path) => `- ${path}${WHAT_THEY_ARE[path] ? ` (${WHAT_THEY_ARE[path]})` : ''}`);
  const intro = live
    ? 'The switch is building from `main`, not from a live commit, and `main` differs from the live site in these files:'
    : 'The switch is building from `main`, not from a live commit, and the live `build.json` could not be read (it has none, or the site is down). These files might change for riders:';
  const list = [intro, '', ...lines, ''];
  if (alsoRelease) return { go: true, kind: 'main-released', summary: [...list, 'You set also_release_main, so these go out with the switch.'].join('\n') };
  return { go: false, summary: [...list, 'The switch stopped, so nothing changed. To send these to riders along with the switch, run it again with also_release_main ticked.'].join('\n') };
}

/** Can the upload be said to have never arrived? Only when it didn't run, or the same version is still live after it failed. */
export function uploadNeverArrived({ outcome, before, after }) {
  if (outcome === 'success') return false;
  if (outcome === 'skipped') return true;
  return Boolean(before) && before === after;
}

/** What the deploy job runs: is the build live, and if asked, report it. An upload that never arrived has nothing to wait for. */
export async function afterDeployCheck({ build, origin, uploadOutcome = 'success', before = '', live = '', report = false, gh, runUrl, fetch: fetchFn, ...timing }) {
  const notArrived = uploadNeverArrived({ outcome: uploadOutcome, before, after: live });
  const result = build
    ? await checkLive(build, origin, { fetch: fetchFn, ...timing, ...(notArrived ? { deadlineMs: 0 } : {}) })
    : { ok: false, problems: ['the build list could not be read'] };
  if (!report) return result;
  // A failing gh must not hide the result: the command prints it first, then this.
  try {
    await reportIssue(result, { gh, liveVersion: live, lastDeployActive: notArrived, runUrl });
  } catch (error) {
    return { ...result, reportError: error.message };
  }
  return result;
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
export function pickRollback(deployments, { named, versions, requireDetails = false } = {}) {
  if (!Array.isArray(deployments) || deployments.length === 0) return { refuse: 'Cloudflare gave no list of deployments, so nothing is safe to pick.' };
  // The check action exists to find this fault, so it comes before any other answer, and a name doesn't excuse it.
  if (requireDetails && !rollbackCandidates(deployments).every((id) => versions?.[id])) return { refuse: 'Cloudflare gave no details for the live version or the one before it.' };
  const rows = newestFirst(deployments);
  const live = rows[0];
  const liveId = wholeVersion(live);

  if (named) {
    if (named === liveId) return { refuse: `Version ${named} is already live.` };
    const row = rows.find((candidate) => candidate.versions?.some((version) => version.version_id === named));
    if (!row) return { refuse: `Version ${named} is not among the last ten deployments. It may be a preview, which never served riders, or too old to pick here.` };
    if (!rows.some((candidate) => wholeVersion(candidate) === named)) return { refuse: `Version ${named} only ever served part of the traffic.` };
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

/** The deployments as a table, newest first, for a refusal that asks the owner to name a version. */
export function formatRows(deployments, versions = {}) {
  if (!Array.isArray(deployments) || deployments.length === 0) return 'Cloudflare gave no list of deployments.';
  const cell = (text) => String(text ?? '').replace(/[|\n]/g, ' ');
  const lines = newestFirst(deployments).map((row) => {
    const id = wholeVersion(row) ?? row.versions?.map((version) => `${version.version_id} (${version.percentage}%)`).join(', ') ?? '';
    const message = row.annotations?.['workers/message'] ?? versions[id]?.annotations?.['workers/message'] ?? row.annotations?.['workers/triggered_by'];
    return `| ${cell(row.created_on).slice(0, 16)} | ${cell(id)} | ${cell(message)} |`;
  });
  return ['The last deployments, newest first. The one on top is live:', '', '| Date | Version id | Message |', '| --- | --- | --- |', ...lines].join('\n');
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

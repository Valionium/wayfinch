// The after-deploy check and the small questions the deploy workflows ask. The rules are in tools/deploy-lib.mjs.
//   --build dist/build.json --origin <url> [--report]    does the live site serve this build? Exit 1 if not
//   --self --origin <url> [--changed-from <file>]        does the live site match its own build.json, a new one if given the old?
//   --save-live-list <file> --origin <url>               keeps the live build.json's bytes, for --changed-from
//   --decide --build <file> --config <file> --origin <url>   writes changed= and check= to GITHUB_OUTPUT
//   --pick-rollback <rows.json> [--named <id>] [--versions-dir <dir>]   prints the version id, or refuses with exit 1
//   --rollback-candidates <rows.json>  --live-version <rows.json>  --is-stale <sha> <head>
//   --commit-of <version.json>  --switch-guard --build <file> --origin <url> --also-release-main true|false
//   --check-emergency <dist>  --assert-rehearsal <name>  --summary rollback|switch  --failure-summary <action> --acted true|false
// It reads and reports. It never deploys, and it never rolls back.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import {
  afterDeployCheck,
  checkEmergencyWorker,
  checkSelf,
  commitOfVersion,
  decide,
  emergencyFailureSummary,
  fetchLiveBuild,
  formatRows,
  liveVersionOf,
  pickRollback,
  readLiveList,
  REHEARSAL_WORKER,
  rollbackCandidates,
  rollbackSummary,
  staleReason,
  switchGuard,
  switchSummary,
} from './deploy-lib.mjs';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    build: { type: 'string' },
    config: { type: 'string' },
    origin: { type: 'string' },
    self: { type: 'boolean', default: false },
    decide: { type: 'boolean', default: false },
    report: { type: 'boolean', default: false },
    live: { type: 'string', default: '' },
    before: { type: 'string', default: '' },
    'upload-outcome': { type: 'string', default: 'success' },
    'deadline-ms': { type: 'string' },
    'pick-rollback': { type: 'string' },
    named: { type: 'string', default: '' },
    'check-only': { type: 'string', default: 'false' },
    'versions-dir': { type: 'string' },
    'rollback-candidates': { type: 'string' },
    'live-version': { type: 'string' },
    'is-stale': { type: 'boolean', default: false },
    'approved-attempt': { type: 'string', default: '' },
    'this-attempt': { type: 'string', default: '' },
    'changed-from': { type: 'string' },
    'save-live-list': { type: 'string' },
    'commit-of': { type: 'string' },
    'switch-guard': { type: 'boolean', default: false },
    'also-release-main': { type: 'string', default: 'false' },
    version: { type: 'string', default: '' },
    'built-from': { type: 'string', default: '' },
    'built-kind': { type: 'string', default: 'main-released' },
    'failure-summary': { type: 'string' },
    acted: { type: 'string', default: 'false' },
    'check-emergency': { type: 'string' },
    'assert-rehearsal': { type: 'string' },
    summary: { type: 'string' },
  },
});

const toSummary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const fail = (message) => {
  console.error(message);
  toSummary(message);
  process.exitCode = 1;
};
const run = promisify(execFile);
const gh = async (ghArgs) => (await run('gh', ghArgs)).stdout;
const timing = (deadlineMs) => ({ fetch: globalThis.fetch, sleep: (ms) => wait(ms), ...(deadlineMs === undefined ? {} : { deadlineMs }) });

function printResult(result) {
  for (const problem of result.problems) console.log(`FAIL ${problem}`);
  if (result.note) console.log(result.note);
  if (result.ok) console.log('The live site matches.');
  toSummary(result.ok ? `The after-deploy check passed.${result.note ? ` ${result.note}` : ''}` : ['The after-deploy check failed:', ...result.problems.map((p) => `- ${p}`)].join('\n'));
}

async function main() {
  if (args['is-stale']) {
    const reason = staleReason({ sha: positionals[0] ?? '', head: positionals[1] ?? '', approvedAttempt: args['approved-attempt'], thisAttempt: args['this-attempt'] });
    if (reason) {
      console.error(reason);
      toSummary(reason);
    }
    console.log(reason ? 'true' : 'false');
    return;
  }
  if (args['assert-rehearsal'] !== undefined) {
    if (args['assert-rehearsal'] !== REHEARSAL_WORKER) fail(`This workflow only ever uploads to ${REHEARSAL_WORKER}, and was given "${args['assert-rehearsal']}". Nothing uploaded.`);
    return;
  }
  if (args.summary) {
    const text = {
      rollback: () => rollbackSummary(args.version),
      switch: () => switchSummary({ kind: args['built-kind'], commit: args['built-from'] }),
    }[args.summary]?.();
    if (!text) throw new Error('--summary takes rollback or switch.');
    console.log(text);
    toSummary(text);
    return;
  }
  if (args['failure-summary']) {
    const text = emergencyFailureSummary(args['failure-summary'], args.acted === 'true');
    console.log(text);
    toSummary(text);
    return;
  }
  if (args['commit-of']) {
    console.log(commitOfVersion(readJson(args['commit-of'])));
    return;
  }
  if (args['live-version']) {
    console.log(liveVersionOf(readJson(args['live-version'])));
    return;
  }
  if (args['rollback-candidates']) {
    console.log(rollbackCandidates(readJson(args['rollback-candidates'])).join('\n'));
    return;
  }
  if (args['pick-rollback']) {
    const rows = readJson(args['pick-rollback']);
    let versions;
    if (args['versions-dir']) {
      versions = {};
      for (const id of rollbackCandidates(rows)) {
        const file = join(args['versions-dir'], `${id}.json`);
        const details = existsSync(file) ? readJson(file) : null;
        if (details) versions[id] = details;
      }
    }
    const pick = pickRollback(rows, { named: args.named || undefined, versions, requireDetails: args['check-only'] === 'true' });
    if ('refuse' in pick) fail(`Rollback refused, nothing changed: ${pick.refuse}`);
    else console.log(pick.versionId);
    const table = formatRows(rows, versions);
    console.error(table);
    toSummary(table);
    return;
  }
  if (args['check-emergency']) {
    const worker = join(args['check-emergency'], 'offline-worker.js');
    const problems = checkEmergencyWorker(existsSync(worker) ? readFileSync(worker, 'utf8') : null, readJson(join(args['check-emergency'], 'build.json')));
    if (problems.length > 0) fail(`The emergency build failed its check, nothing uploaded: ${problems.join('; ')}`);
    return;
  }

  if (!args.origin) throw new Error('--origin is needed.');
  const deadlineMs = args['deadline-ms'] === undefined ? undefined : Number(args['deadline-ms']);

  if (args.decide) {
    const readApprovalEnv = async () => JSON.parse(await gh(['api', 'repos/{owner}/{repo}/environments/production-approval']));
    const result = await decide(readJson(args.build), readJson(args.config), args.origin, { fetch: globalThis.fetch, readApprovalEnv });
    const lines = `changed=${result.changed}\ncheck=${result.check}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
    console.log(result.summary);
    toSummary(result.summary);
    return;
  }

  if (args['save-live-list']) {
    const raw = await readLiveList(args.origin, { fetch: globalThis.fetch });
    if (raw !== null) writeFileSync(args['save-live-list'], raw);
    return;
  }

  if (args['switch-guard']) {
    const live = await fetchLiveBuild(args.origin, { fetch: globalThis.fetch }).catch(() => null);
    const guard = switchGuard(readJson(args.build), live, { alsoRelease: args['also-release-main'] === 'true' });
    if (!guard.go) {
      fail(guard.summary);
      return;
    }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `kind=${guard.kind}\n`);
    console.log(guard.summary);
    toSummary(guard.summary);
    return;
  }

  if (args.self) {
    const changedFrom = args['changed-from'] && existsSync(args['changed-from']) ? readFileSync(args['changed-from'], 'utf8') : undefined;
    const result = await checkSelf(args.origin, { ...timing(deadlineMs), ...(changedFrom === undefined ? {} : { changedFrom }) });
    printResult(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId } = process.env;
  const result = await afterDeployCheck({
    build: args.build ? readJson(args.build) : null,
    origin: args.origin,
    uploadOutcome: args['upload-outcome'],
    before: args.before,
    live: args.live,
    report: args.report,
    gh,
    runUrl: server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : undefined,
    ...timing(deadlineMs),
  });
  printResult(result);
  if (!result.ok) process.exitCode = 1;
  if (result.reportError) fail(`The issue could not be updated: ${result.reportError}`);
}

main().catch((error) => fail(error.message));

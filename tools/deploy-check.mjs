// The after-deploy check and the small questions the deploy workflows ask. The rules are in tools/deploy-lib.mjs.
//   --build dist/build.json --origin <url> [--report]    does the live site serve this build? Exit 1 if not
//   --self --origin <url>                                does the live site match its own build.json?
//   --decide --build <file> --config <file> --origin <url>   writes changed= and check= to GITHUB_OUTPUT
//   --pick-rollback <rows.json> [--named <id>] [--versions-dir <dir>]   prints the version id, or refuses with exit 1
//   --rollback-candidates <rows.json>  --live-version <rows.json>  --is-stale <sha> <head>
//   --check-emergency <dist>  --assert-rehearsal <name>  --summary rollback|switch
// It reads and reports. It never deploys, and it never rolls back.
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import {
  checkEmergencyWorker,
  checkLive,
  checkSelf,
  decide,
  isStale,
  liveVersionOf,
  pickRollback,
  REHEARSAL_WORKER,
  reportIssue,
  ROLLBACK_SUMMARY,
  rollbackCandidates,
  SWITCH_SUMMARY,
  uploadNeverArrived,
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
    'versions-dir': { type: 'string' },
    'rollback-candidates': { type: 'string' },
    'live-version': { type: 'string' },
    'is-stale': { type: 'boolean', default: false },
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
    console.log(isStale(positionals[0] ?? '', positionals[1] ?? '') ? 'true' : 'false');
    return;
  }
  if (args['assert-rehearsal'] !== undefined) {
    if (args['assert-rehearsal'] !== REHEARSAL_WORKER) fail(`This workflow only ever uploads to ${REHEARSAL_WORKER}, and was given "${args['assert-rehearsal']}". Nothing uploaded.`);
    return;
  }
  if (args.summary) {
    const text = { rollback: ROLLBACK_SUMMARY, switch: SWITCH_SUMMARY }[args.summary];
    if (!text) throw new Error('--summary takes rollback or switch.');
    console.log(text);
    toSummary(text);
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
    const pick = pickRollback(rows, { named: args.named || undefined, versions });
    if ('refuse' in pick) fail(`Rollback refused, nothing changed: ${pick.refuse}`);
    else console.log(pick.versionId);
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
    const result = await decide(readJson(args.build), readJson(args.config), args.origin, { fetch: globalThis.fetch });
    const lines = `changed=${result.changed}\ncheck=${result.check}\n`;
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
    console.log(result.summary);
    toSummary(result.summary);
    return;
  }

  if (args.self) {
    const result = await checkSelf(args.origin, timing(deadlineMs));
    printResult(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  const notArrived = uploadNeverArrived({ outcome: args['upload-outcome'], before: args.before, after: args.live });
  const build = args.build ? readJson(args.build) : null;
  const result = build
    // An upload that never arrived has nothing to wait for.
    ? await checkLive(build, args.origin, timing(notArrived ? 0 : deadlineMs))
    : { ok: false, problems: [`the build list ${args.build ?? '(none given)'} could not be read`] };
  printResult(result);
  if (!result.ok) process.exitCode = 1;
  if (args.report) {
    const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId } = process.env;
    await reportIssue(result, {
      gh,
      liveVersion: args.live,
      lastDeployActive: notArrived,
      runUrl: server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : undefined,
    });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

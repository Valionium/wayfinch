// What the deploy workflows promise, read from their YAML with small text checks. GitHub itself can't run here, so these
// prove what the files say; what GitHub does with them is checked on the rehearsal. Plan Task 8.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { REHEARSAL_WORKER, ROLLBACK_MESSAGE, SWITCH_TAG } from '../../../tools/deploy-lib.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string) => readFileSync(join(REPO, file), 'utf8').replace(/\r\n/g, '\n');
const workflow = (name: string) => read(`.github/workflows/${name}`);
const DEPLOYING = ['deploy.yml', 'emergency.yml', 'preview.yml', 'rehearsal.yml'];

/** The text of each job under `jobs:`, by name. */
function jobsOf(text: string): Record<string, string> {
  const body = text.slice(text.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const parts = body.split(/^ {2}(?=[A-Za-z0-9_-]+:\n)/m).filter((part) => part.trim());
  return Object.fromEntries(parts.map((part) => [part.slice(0, part.indexOf(':')), part]));
}
/** A job's lines before `steps:`. */
const headOf = (job: string) => job.slice(0, job.indexOf('\n    steps:\n'));
/** A job's steps, each as its own text. */
const stepsOf = (job: string) => job.slice(job.indexOf('\n    steps:\n') + '\n    steps:\n'.length).split(/^ {6}- /m).filter((step) => step.trim());
const ifOf = (step: string) => /^\s*if: (.*)$/m.exec(step)?.[1] ?? '';
const runOf = (step: string) => {
  const at = step.search(/^\s*run: /m);
  return at < 0 ? '' : step.slice(at);
};
const job = (file: string, name: string) => {
  const found = jobsOf(workflow(file))[name];
  if (found === undefined) throw new Error(`${file} has no job ${name}`);
  return found;
};
const triggersOf = (text: string) => {
  const on = /^on:\n((?: {2}.*\n|\n)+)/m.exec(text)?.[1] ?? '';
  return [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
};

describe('deploy.yml: who may start it, and what a merge does', () => {
  test('[DEP-TRIGGERS] it follows the checks on main only: conclusion, event, branch and repository all checked', () => {
    const text = workflow('deploy.yml');
    expect(triggersOf(text)).toEqual(['workflow_run']);
    expect(text).toMatch(/workflow_run:\n\s+workflows: \[Pull request checks\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
    expect(workflow('pull-request.yml')).toMatch(/^name: Pull request checks$/m);
    const head = headOf(job('deploy.yml', 'decide'));
    expect(head).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(head).toContain("github.event.workflow_run.event == 'push'");
    expect(head).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(head).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    for (const name of ['decide', 'deploy']) {
      expect(job('deploy.yml', name)).toContain('ref: ${{ github.event.workflow_run.head_sha }}');
    }
  });

  test('[DEP-TRIGGERS] approve skipped means deploy skipped: deploy needs approve, with no always() on the job', () => {
    const approve = job('deploy.yml', 'approve');
    expect(headOf(approve)).toMatch(/needs: decide\n/);
    expect(ifOf(headOf(approve))).toBe("needs.decide.outputs.changed == 'true'");
    expect(headOf(approve)).toContain('environment: production-approval');
    expect(stepsOf(approve)).toHaveLength(1);
    expect(stepsOf(approve)[0]).toContain('echo');
    expect(approve).not.toContain('secrets.');

    const head = headOf(job('deploy.yml', 'deploy'));
    expect(head).toMatch(/needs: approve\n/);
    expect(ifOf(head)).toBe("needs.approve.result == 'success'");
    for (const job of Object.values(jobsOf(workflow('deploy.yml')))) expect(headOf(job)).not.toMatch(/always\(\)|failure\(\)|cancelled\(\)|continue-on-error/);
    expect(job('deploy.yml', 'decide')).toContain('changed: ${{ steps.compare.outputs.changed }}');
  });

  test('[DEP-TRIGGERS] the token stands only behind the production environment: approve has none, decide has none', () => {
    expect(headOf(job('deploy.yml', 'deploy'))).toContain('environment: production\n');
    expect(job('deploy.yml', 'decide')).not.toContain('environment:');
    expect(job('deploy.yml', 'decide')).not.toContain('CLOUDFLARE');
    expect(job('deploy.yml', 'decide')).not.toContain('wrangler');
    for (const file of DEPLOYING) expect(workflow(file)).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(job('deploy.yml', 'deploy')).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_WORKER_TOKEN }}');
    expect(job('deploy.yml', 'deploy')).toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
  });

  test('[DEP-LATCH] decide asks the build\'s latch, and only its outputs open approve or the check', () => {
    const steps = stepsOf(job('deploy.yml', 'decide'));
    const compare = steps.find((step) => step.includes('id: compare')) ?? '';
    expect(runOf(compare)).toMatch(/deploy-check\.mjs --decide --build dist\/build\.json --config build\.config\.json --origin "\$LIVE_ORIGIN"/);
    const artifact = steps.find((step) => step.includes('upload-artifact')) ?? '';
    expect(ifOf(artifact)).toBe("steps.compare.outputs.changed == 'true'");
  });

  test('[DEP-UNCHANGED] the unchanged build\'s check runs in decide, and reports; decide can\'t upload', () => {
    const steps = stepsOf(job('deploy.yml', 'decide'));
    const check = steps.find((step) => step.includes('--report')) ?? '';
    expect(ifOf(check)).toBe("steps.compare.outputs.check == 'true'");
    expect(runOf(check)).toContain('deploy-check.mjs --build dist/build.json --origin "$LIVE_ORIGIN"');
    expect(check).toContain('GH_TOKEN: ${{ github.token }}');
    expect(headOf(job('deploy.yml', 'decide'))).toContain('issues: write');
  });

  test('[DEP-STALE] the first thing deploy does is compare head_sha with main\'s head', () => {
    const steps = stepsOf(job('deploy.yml', 'deploy'));
    const at = steps.findIndex((step) => step.includes('id: stale'));
    expect(steps.slice(0, at).every((step) => /actions\/(checkout|setup-node)@/.test(step))).toBe(true);
    const guard = steps[at] ?? '';
    expect(guard).toContain('HEAD_SHA: ${{ github.event.workflow_run.head_sha }}');
    expect(runOf(guard)).toContain('branches/main');
    expect(runOf(guard)).toContain('--is-stale "$HEAD_SHA" "$head"');
    expect(runOf(guard)).toContain('A newer merge exists; nothing deployed.');
  });

  test('[DEP-STALE] after a stale exit nothing runs: no upload, no check, no issue, even from always()', () => {
    const steps = stepsOf(job('deploy.yml', 'deploy'));
    const after = steps.slice(steps.findIndex((step) => step.includes('id: stale')) + 1);
    expect(after.length).toBeGreaterThan(4);
    for (const step of after) expect(ifOf(step)).toContain("steps.stale.outputs.stale == 'false'");
    const always = after.filter((step) => ifOf(step).includes('always()'));
    expect(always.length).toBeGreaterThan(0);
    for (const step of always) expect(ifOf(step)).toMatch(/^always\(\) && steps\.stale\.outputs\.stale == 'false'$/);
    expect(job('deploy.yml', 'deploy').match(/steps\.stale\.outputs\.stale == 'true'/)).toBeNull();
  });

  test('[DEP-NOT-ARRIVED] the check is told how the upload went and what was live before it', () => {
    const steps = stepsOf(job('deploy.yml', 'deploy'));
    const upload = steps.find((step) => step.includes('id: upload')) ?? '';
    expect(upload).toContain('timeout-minutes: 10');
    const check = steps.at(-1) ?? '';
    expect(ifOf(check)).toContain('always()');
    expect(check).toContain('UPLOAD_OUTCOME: ${{ steps.upload.outcome }}');
    expect(check).toContain('BEFORE: ${{ steps.before.outputs.version }}');
    expect(check).toContain('AFTER: ${{ steps.after.outputs.version }}');
    expect(runOf(check)).toContain('--report --upload-outcome "$UPLOAD_OUTCOME" --before "$BEFORE" --live "$AFTER"');
    expect(steps.find((step) => step.includes('id: after'))).toContain('continue-on-error: true');
  });

  test('[DEP-ISSUE-ONE] the job may write issues and gh knows the repository', () => {
    const deploy = job('deploy.yml', 'deploy');
    expect(headOf(deploy)).toMatch(/permissions:\n\s+contents: read\n\s+issues: write/);
    expect(stepsOf(deploy).at(-1)).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow('deploy.yml')).toContain('GH_REPO: ${{ github.repository }}');
  });

  test('[DEP-ROLL-ID] the version a rollback returns to is noted in the summary before the upload', () => {
    const steps = stepsOf(job('deploy.yml', 'deploy'));
    const before = steps.findIndex((step) => step.includes('id: before'));
    expect(before).toBeLessThan(steps.findIndex((step) => step.includes('id: upload')));
    expect(runOf(steps[before] ?? '')).toContain('GITHUB_STEP_SUMMARY');
  });
});

describe('who may reach the real Worker', () => {
  const wranglerLines = (text: string) => text.split('\n').filter((line) => /\bwrangler\s/.test(line) && !line.trim().startsWith('#'));

  test('[DEP-TRIGGERS] of all workflows, only deploy\'s deploy job, emergency and rehearsal run wrangler deploy', () => {
    const files = readdirSync(join(REPO, '.github/workflows'));
    const running = files.filter((file) => wranglerLines(workflow(file)).some((line) => /wrangler deploy\b/.test(line))).sort();
    expect(running).toEqual(['deploy.yml', 'emergency.yml', 'rehearsal.yml']);
    const jobs = jobsOf(workflow('deploy.yml'));
    expect(Object.keys(jobs).filter((name) => /wrangler deploy\b/.test(jobs[name] ?? ''))).toEqual(['deploy']);
    expect(headOf(job('deploy.yml', 'deploy'))).toMatch(/needs: approve/);
  });

  test('[DEP-TRIGGERS] pull-request.yml has no environment and no wrangler', () => {
    const text = workflow('pull-request.yml');
    expect(text).not.toMatch(/environment:/);
    expect(text).not.toMatch(/wrangler/);
    expect(text).not.toMatch(/CLOUDFLARE/);
  });

  test('[DEP-TRIGGERS] emergency, preview and rehearsal start only by Run workflow, only from main', () => {
    for (const file of ['emergency.yml', 'preview.yml', 'rehearsal.yml']) {
      expect(triggersOf(workflow(file))).toEqual(['workflow_dispatch']);
      for (const body of Object.values(jobsOf(workflow(file)))) {
        expect(headOf(body)).toContain('environment: production\n');
        expect(ifOf(headOf(body))).toBe("github.ref == 'refs/heads/main'");
      }
    }
  });

  test('[DEP-TRIGGERS] emergency never touches the approval environment or the gate', () => {
    const text = workflow('emergency.yml');
    expect(text).not.toContain('production-approval');
    expect(text).not.toContain('workflow_run');
    expect(text).not.toContain('needs:');
  });

  test('[DEP-TRIGGERS] preview only uploads a version, never deploys, and prints the address', () => {
    const lines = wranglerLines(workflow('preview.yml'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/wrangler versions upload/);
    expect(workflow('preview.yml')).not.toMatch(/wrangler (deploy|rollback|versions deploy)/);
    expect(workflow('preview.yml')).toContain('--launch=on');
    expect(workflow('preview.yml')).toContain('Version Preview URL');
  });

  test('[DEP-TRIGGERS] rehearsal asserts its Worker before uploading, and passes only that name', () => {
    expect(REHEARSAL_WORKER).toBe('load-check-rehearsal');
    const body = job('rehearsal.yml', 'rehearsal');
    expect(body).toContain('REHEARSAL_WORKER: load-check-rehearsal\n');
    const steps = stepsOf(body);
    const assertAt = steps.findIndex((step) => step.includes('--assert-rehearsal "$REHEARSAL_WORKER"'));
    const uploadAt = steps.findIndex((step) => /wrangler deploy/.test(step));
    expect(assertAt).toBeGreaterThanOrEqual(0);
    expect(assertAt).toBeLessThan(uploadAt);
    const lines = wranglerLines(workflow('rehearsal.yml'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('wrangler deploy --name "$REHEARSAL_WORKER"');
    expect(ifOf(steps[uploadAt] ?? '')).not.toContain('always()');
  });

  test('[DEP-TRIGGERS] rehearsal builds each stage, and legacy fetches the tag explicitly', () => {
    const text = workflow('rehearsal.yml');
    expect(text).toMatch(/options: \[legacy, step-one, switch, launch\]/);
    expect(text).toContain('git fetch --depth=1 origin +refs/tags/load-check-zip-2026-10-30:refs/tags/load-check-zip-2026-10-30');
    expect(text).toMatch(/legacy\)[\s\S]*legacySite[\s\S]*mv [^\n]*legacy dist/);
    expect(text).toMatch(/step-one\) node tools\/build\.mjs --launch=off/);
    expect(text).toMatch(/switch\) node tools\/build\.mjs --emergency/);
    expect(text).toMatch(/launch\) node tools\/build\.mjs --launch=on/);
  });

  test('[DEP-TRIGGERS] no run block interpolates anything: every value reaches the shell through env', () => {
    for (const file of DEPLOYING) {
      for (const [name, body] of Object.entries(jobsOf(workflow(file)))) {
        for (const step of stepsOf(body)) expect(runOf(step), `${file} ${name}`).not.toContain('${{');
      }
    }
  });

  test('[DEP-TRIGGERS] every checkout in the jobs holding a token drops its GitHub credentials', () => {
    for (const file of DEPLOYING) {
      for (const body of Object.values(jobsOf(workflow(file)))) {
        for (const step of stepsOf(body).filter((s) => s.includes('actions/checkout@'))) expect(step).toContain('persist-credentials: false');
      }
    }
  });

  test('[DEP-TRIGGERS] actions are pinned in the same style as pull-request.yml', () => {
    const allowed = new Set(['actions/checkout@v7', 'actions/setup-node@v7', 'actions/upload-artifact@v7', 'actions/download-artifact@v7']);
    for (const file of DEPLOYING) {
      for (const m of workflow(file).matchAll(/uses: (\S+)/g)) expect(allowed.has(String(m[1])), String(m[1])).toBe(true);
    }
  });
});

describe('emergency.yml', () => {
  const steps = () => stepsOf(job('emergency.yml', 'emergency'));
  const find = (needle: string) => steps().find((step) => step.includes(needle)) ?? '';

  test('[DEP-ROLL-ID] rollback goes through pickRollback, and only then wrangler rollback, with the marked message', () => {
    const pick = find('id: pick');
    expect(ifOf(pick)).toBe("inputs.action == 'rollback'");
    expect(pick).toContain('NAMED: ${{ inputs.version }}');
    expect(runOf(pick)).toContain('wrangler deployments list --json > rows.json');
    expect(runOf(pick)).toContain('--pick-rollback rows.json --named "$NAMED" --versions-dir versions');
    const rollback = find('id: rollback');
    expect(rollback).toContain('VERSION: ${{ steps.pick.outputs.version }}');
    expect(runOf(rollback)).toContain(`wrangler rollback "$VERSION" --yes --message "${ROLLBACK_MESSAGE}`);
    expect(steps().indexOf(pick)).toBeLessThan(steps().indexOf(rollback));
  });

  test('[DEP-SELF-LIST] both actions end with deploy-check --self', () => {
    const self = find('--self');
    expect(ifOf(self)).toBe("steps.rollback.outcome == 'success' || steps.switch.outcome == 'success'");
    expect(runOf(self)).toContain('--self --origin "$LIVE_ORIGIN"');
  });

  test('[DEP-ROLL-WARN] the summary of what stays on main ends the run, whatever the check found', () => {
    const summary = steps().at(-1) ?? '';
    expect(summary).toContain('ACTION: ${{ inputs.action }}');
    expect(runOf(summary)).toContain('--summary "$ACTION"');
    expect(ifOf(summary)).toBe("always() && (steps.rollback.outcome == 'success' || steps.switch.outcome == 'success')");
  });

  test('[SW-SWITCH] switch builds the emergency worker, passes its check, marks the version, then says what riders lose', () => {
    const build = find('--emergency');
    const check = find('--check-emergency');
    const upload = find('id: switch');
    for (const step of [build, check, upload]) expect(ifOf(step)).toBe("inputs.action == 'switch'");
    expect(steps().indexOf(build)).toBeLessThan(steps().indexOf(check));
    expect(steps().indexOf(check)).toBeLessThan(steps().indexOf(upload));
    expect(runOf(upload)).toContain(`wrangler deploy --tag ${SWITCH_TAG}`);
    expect(runOf(steps().at(-1) ?? '')).toContain('--summary "$ACTION"');
  });
});

describe('every deploying workflow', () => {
  test('[DEP-ONE-AT-A-TIME] deploy, both emergency actions, preview and rehearsal share one group, and none cancels another', () => {
    const holders: Array<[string, string]> = [['deploy.yml', 'deploy'], ['emergency.yml', 'emergency'], ['preview.yml', 'preview'], ['rehearsal.yml', 'rehearsal']];
    for (const [file, name] of holders) {
      const head = headOf(job(file, name));
      expect(head, file).toMatch(/concurrency:\n\s+group: worker-deploy\n\s+cancel-in-progress: false/);
    }
    for (const file of DEPLOYING) expect(workflow(file)).not.toContain('cancel-in-progress: true');
  });

  test('[DEP-ONE-AT-A-TIME] waiting for a click holds no group, so it can\'t block a rollback', () => {
    expect(headOf(job('deploy.yml', 'approve'))).not.toContain('concurrency');
    expect(headOf(job('deploy.yml', 'decide'))).not.toContain('concurrency');
    expect(workflow('deploy.yml').slice(0, workflow('deploy.yml').indexOf('\njobs:\n'))).not.toContain('concurrency');
  });

  test('[DEP-ONE-AT-A-TIME] every step runs with pipefail, so a failed upload can\'t look green through tee', () => {
    for (const file of DEPLOYING) expect(workflow(file)).toMatch(/defaults:\n\s+run:\n\s+shell: bash/);
  });
});

describe('the environments', () => {
  const json = (file: string) => JSON.parse(read(`tools/${file}`)) as Record<string, unknown>;

  test('production is limited to named branches and has no reviewer, no bypass', () => {
    const env = json('env-production.json');
    expect(env.deployment_branch_policy).toEqual({ protected_branches: false, custom_branch_policies: true });
    expect(env.reviewers ?? null).toBeNull();
    expect(env.can_admins_bypass).toBe(false);
  });

  test('production-approval has the owner as reviewer, who may approve their own merge; no bypass', () => {
    const env = json('env-approval.json');
    const reviewers = env.reviewers as Array<{ type: string; id: number }>;
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0]?.type).toBe('User');
    expect(Number.isInteger(reviewers[0]?.id)).toBe(true);
    expect(env.prevent_self_review).toBe(false);
    expect(env.can_admins_bypass).toBe(false);
  });
});

describe('commits that serve nothing new', () => {
  function hashTree(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!e.isFile()) continue;
      const path = join(e.parentPath, e.name);
      out[relative(dir, path).split(sep).join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
    return out;
  }

  test('[DEP-TRIGGERS] pipeline/-only and docs/-only commits leave dist/ byte-identical, so no click', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wf-trig-'));
    const clone = join(tmp, 'clone');
    const link = join(clone, 'node_modules');
    const quiet = { cwd: clone, stdio: 'pipe' as const };
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], quiet);
    const build = (name: string) => {
      const out = join(tmp, name);
      execFileSync(process.execPath, ['tools/build.mjs', `--out=${out}`], quiet);
      return hashTree(out);
    };
    try {
      execFileSync('git', ['clone', '--quiet', '--shared', REPO, clone], { stdio: 'pipe' });
      symlinkSync(join(REPO, 'node_modules'), link, 'junction');
      const first = build('first');
      expect(Object.keys(first)).toContain('offline-worker.js');

      writeFileSync(join(clone, 'pipeline', 'touched-by-test.txt'), 'a commit under pipeline/ only\n');
      git('add', '-A', 'pipeline');
      git('commit', '-q', '-m', 'pipeline only');
      expect(build('second')).toEqual(first);

      appendFileSync(join(clone, 'docs', 'rules.md'), '\n<!-- a commit under docs/ only -->\n');
      git('add', '-A', 'docs');
      git('commit', '-q', '-m', 'docs only');
      expect(build('third')).toEqual(first);
    } finally {
      // The link first, so nothing can follow it into the real node_modules.
      try { unlinkSync(link); } catch { /* the clone never got that far */ }
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});

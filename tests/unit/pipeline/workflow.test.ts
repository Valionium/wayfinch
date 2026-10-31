import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const yaml = readFileSync('.github/workflows/place-packs.yml', 'utf8');

test('[PIPE-WF-01] workflow rules', () => {
  expect(yaml).not.toMatch(/^\s*pull_request/m);
  expect(yaml).toMatch(/runs-on: ubuntu-24\.04/);
  expect(yaml).not.toMatch(/ubuntu-latest/);
  expect(yaml).toMatch(/fail-fast: false/);
  expect(yaml).toMatch(/max-parallel: 4/);
  expect(yaml.indexOf('secrets.CLOUDFLARE_API_TOKEN')).toBe(yaml.lastIndexOf('secrets.CLOUDFLARE_API_TOKEN'));
});

test('[PIPE-WF-01] the workflow runs weekly or by hand, and reads the repository by default', () => {
  expect(yaml).toMatch(/^on:\s*\n\s+schedule:[\s\S]*?workflow_dispatch:/m);
  expect(yaml).toMatch(/permissions:\s*\n\s+contents: read/);
});

test('[PIPE-WF-01] the country job has the limits of the plan', () => {
  expect(yaml).toMatch(/timeout-minutes: 120/);
  expect(yaml).toMatch(/--max-old-space-size=12000/);
  expect(yaml).toMatch(/retention-days: 7/);
  expect(yaml).toMatch(/osmium --version/);
});

test('[PIPE-WF-01] user input reaches a script only through an environment variable', () => {
  const uses = yaml.split('\n').filter((l) => /\$\{\{\s*inputs\./.test(l));
  expect(uses.length).toBeGreaterThan(0);
  for (const l of uses) expect(l, l).toMatch(/^\s+[A-Z_]+: \$\{\{\s*inputs\./);
});

test('[PIPE-WF-01] runs never overlap, so two merges cannot meddle with the same stored files', () => {
  expect(yaml).toMatch(/^concurrency:\s*\n\s+group: place-packs\s*\n\s+cancel-in-progress: false/m);
});

test('[PIPE-WF-01] the merge job waits for the countries, runs even if some fail, and may write releases and issues', () => {
  const merge = yaml.slice(yaml.indexOf('\n  merge:'));
  expect(merge).toMatch(/needs: country/);
  expect(merge).toMatch(/if: \$\{\{ !cancelled\(\) \}\}/);
  expect(merge).toMatch(/timeout-minutes: 60/);
  expect(merge).toMatch(/contents: write/);
  expect(merge).toMatch(/issues: write/);
  expect(merge).toMatch(/runs-on: ubuntu-24\.04/);
  expect(merge).toMatch(/pipeline\/merge\.ts/);
  expect(merge).toMatch(/GH_TOKEN: \$\{\{ github\.token \}\}/);
  expect(merge).not.toMatch(/secrets\./);
});

test('[PIPE-WF-01] the publish job waits for a good merge, runs only when asked, and only its deploy step has the secrets', () => {
  expect(yaml).toMatch(/publish:\s*\n\s+description:[^\n]*\n\s+type: boolean\s*\n\s+default: false/);
  const start = yaml.indexOf('\n  publish:\n    needs: merge');
  expect(start).toBeGreaterThan(0);
  const job = yaml.slice(start, yaml.indexOf('\n  merge:'));
  expect(job).toContain("if: ${{ !cancelled() && needs.merge.result == 'success' && (github.event_name == 'schedule' || inputs.publish) }}");
  expect(job).toMatch(/timeout-minutes: 60/);
  expect(job).toMatch(/contents: write/);
  expect(job).toMatch(/issues: write/);
  expect(yaml.indexOf('secrets.CLOUDFLARE_ACCOUNT_ID')).toBe(yaml.lastIndexOf('secrets.CLOUDFLARE_ACCOUNT_ID'));
  const withSecrets = job.split(/\n\s+- /).filter((s) => s.includes('secrets.'));
  expect(withSecrets).toHaveLength(1);
  expect(withSecrets[0]).toContain('wrangler pages deploy pipeline/out/deploy --project-name=wayfinch-data --branch=main');
  expect(job.indexOf('publish-prepare.ts')).toBeLessThan(job.indexOf('wrangler pages deploy'));
  expect(job.indexOf('wrangler pages deploy')).toBeLessThan(job.indexOf('check-live.ts'));
});

test('[PIPE-WF-01] wrangler is pinned to one exact version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies: Record<string, string> };
  expect(pkg.devDependencies['wrangler']).toMatch(/^4\.\d+\.\d+$/);
});

const keepAlive = readFileSync('.github/workflows/keep-alive.yml', 'utf8');

test('[PIPE-WF-01] the schedule and keep-alive rules', () => {
  expect(yaml).toContain("cron: '17 3 * * 2'");
  expect(yaml).toMatch(/keep-alive:[\s\S]*actions: write/);
  expect(yaml).toContain('keep-alive.yml/enable');
  expect(keepAlive).toContain("cron: '41 4 1,15 * *'");
  expect(keepAlive).toMatch(/for f in place-packs\.yml; do[\s\S]*workflows\/\$f\/enable/);
  expect(keepAlive).toMatch(/workflow_dispatch:/);
  expect(keepAlive).toMatch(/actions: write/);
  for (const f of [yaml, keepAlive]) expect(f).not.toMatch(/git (commit|push)/);
  for (const f of [yaml, keepAlive]) expect(f).not.toMatch(/deploy-pause/);
});

test('[PIPE-WF-01] the keep-alive job has no needs, so a failing country cannot stop it', () => {
  const job = yaml.slice(yaml.indexOf('\n  keep-alive:'), yaml.indexOf('\n  setup:'));
  expect(job.length).toBeGreaterThan(0);
  expect(job).not.toMatch(/needs:/);
});

test('[PIPE-WF-01] the report job runs after everything, needs only its own token, and has no secrets', () => {
  const job = yaml.slice(yaml.indexOf('\n  report:'));
  expect(job).toMatch(/needs: \[country, merge, publish\]/);
  expect(job).toContain('if: ${{ !cancelled() }}');
  expect(job).toMatch(/issues: write/);
  expect(job).not.toMatch(/secrets\./);
  expect(job).toContain('pipeline/report.ts');
});

test('[PIPE-WF-01] the test-only force_fail input names a country and stops that job at once', () => {
  expect(yaml).toMatch(/force_fail:\s*\n\s+description:[^\n]*\n\s+type: string\s*\n\s+default: ''/);
  expect(yaml).toMatch(/FORCE_FAIL: \$\{\{ inputs\.force_fail \}\}/);
});

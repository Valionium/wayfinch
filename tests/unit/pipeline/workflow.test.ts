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

test('[PIPE-WF-01] the workflow is started by hand only, reads the repository and nothing else', () => {
  expect(yaml).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
  expect(yaml).not.toMatch(/^\s*schedule:/m);
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

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

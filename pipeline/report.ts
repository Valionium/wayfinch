// Turns the result of a weekly run into one issue for the owner, or nothing. Uses only the job's own token.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { PackManifest } from '../src/core/places/types.ts';

export const ISSUE_TITLE = 'Weekly place packs need a look';

export type RunInput = { manifest: PackManifest | null; problems: string[]; publishFailed: boolean };

export function problemsOfRun(input: RunInput): { title: string; body: string } | null {
  const lines: string[] = [];
  if (input.manifest === null) lines.push('- The weekly build could not be put together at all, so nothing new was made this week.');
  else {
    for (const [cc, c] of Object.entries(input.manifest.countries)) {
      if (c.status === 'last-good') lines.push(`- ${cc}: this week's data was not used. The last good data from ${c.builtOn ?? 'an unknown date'} stays in place.`);
      if (c.status === 'missing') lines.push(`- ${cc}: there is no data at all for this country, neither new nor from an earlier week.`);
    }
  }
  if (input.publishFailed) lines.push('- The publish step failed, so the public address still shows the previous build.');
  if (lines.length === 0 && input.problems.length === 0) return null;
  const reasons = input.problems.length > 0 ? `\nWhat the run reported:\n${input.problems.map((p) => `- ${p}`).join('\n')}\n` : '';
  const body = [
    "This week's run of the place packs did not finish cleanly.",
    '',
    ...lines,
    reasons,
    'Nothing is broken for riders. The pipeline keeps the last good data, and the app shows how old it is.',
    "If the same country shows up three weeks in a row, ask a helper or tool to read the failed job's log. The steps are in `pipeline/README.md`.",
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  return { title: ISSUE_TITLE, body };
}

function readManifest(dir: string): PackManifest | null {
  if (!existsSync(dir)) return null;
  for (const d of readdirSync(dir)) {
    const f = path.join(dir, d, 'manifest.json');
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as PackManifest;
  }
  return null;
}

const gh = (...args: string[]): string => execFileSync('gh', args, { encoding: 'utf8' });

function main(): number {
  const problems: string[] = [];
  const country = process.env['COUNTRY_RESULT'] ?? 'success';
  const merge = process.env['MERGE_RESULT'] ?? 'success';
  if (country !== 'success') problems.push(`country jobs: ${country}`);
  if (merge !== 'success') problems.push(`merge job: ${merge}`);
  const manifest = merge === 'success' ? readManifest(process.env['BUILD_DIR'] ?? 'pipeline/build') : null;
  const found = problemsOfRun({ manifest, problems, publishFailed: process.env['PUBLISH_RESULT'] === 'failure' });
  if (found === null) { console.log('No problems, no issue.'); return 0; }
  const open = JSON.parse(gh('issue', 'list', '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title')) as { number: number; title: string }[];
  const existing = open.find((i) => i.title === ISSUE_TITLE);
  const runUrl = `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${process.env['GITHUB_REPOSITORY'] ?? ''}/actions/runs/${process.env['GITHUB_RUN_ID'] ?? ''}`;
  const body = `${found.body}\n\nRun: ${runUrl}`;
  if (existing) gh('issue', 'comment', String(existing.number), '--body', body);
  else gh('issue', 'create', '--title', found.title, '--body', body);
  console.log(existing ? `Commented on issue ${existing.number}.` : 'Opened an issue.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = main();

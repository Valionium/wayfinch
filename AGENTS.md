# Guide for agents

Wayfinch is built from a design spec, which is not in this repository yet. It is in the owner's project folder: `docs/superpowers/specs/2026-10-29-copilot-foundation-design.md`. Its "First version" page decides the scope until the first version is live. Read only the sections a task names.

## Node

Use Node 24, version 24.15 or later. `.npmrc` makes npm refuse any other. The owner's computer has Node 26 as its default for other work, so put a Node 24 folder first on `PATH` for every command here.

## Folders

Exist so far:

```
src/core/      pure TypeScript, no DOM, fully unit-tested
  geo/         distances
  places/      place types, pack format, classification
  answers/     makeAnswer, the final comparator, the one time formatter
  engines/     the answer engines: one pace, one trip day, one hours check
  hours/       prepared opening hours; only spans.ts reaches the library
  screen/      screen(inputs): the whole stop screen, never throws
  wording/     every user-facing string (en.ts)
  route/       rounded form, GPX reading, stages, climbs, sample grid, hash
public/        what is served; public/tools/bags/index.html is the Load Check page
qa/            Load Check's QA suites (plain Node scripts), qa/paths.cjs, qa/fixtures/
tests/
  unit/        Vitest
  gen/         shared generators; extend these instead of writing your own
  sim/         the simulator: harness, checks (tests/sim/checks.ts), its run
  regressions/ saved simulator failures, replayed on every run (added only with the owner)
  fixtures/    one-line builders (build.ts, route.ts), banned words, device zones
tools/         project scripts
```

`pipeline/` is the weekly place-pack build; its guide for the owner is `pipeline/README.md` (commands are listed there). Commits under `pipeline/` must never trigger an app deploy.

Planned, in spec section 4.2: `src/core/` engines, `src/data/`, `src/store/`, `src/ui/`, `src/tools/tyre/`, `public/`, `pipeline/`, `contracts/`, `tests/e2e/`, `tests/fixtures/`, `tests/sim/`.

## Commands

| Command | Runs |
| --- | --- |
| `npm run fast` | types, lint, the tests touched by this change with 25 runs per property, 100 simulator scenarios and the rule check |
| `npm run qa` | Load Check's 35 QA suites, one line each; exit 0 only if all pass. `LC_PAGE` and `LC_WORKER` override the page and the old worker |
| `npm test` | types, lint and all unit and property tests |
| `npm run types`, `npm run lint`, `npm run unit` | one part |
| `npm run sim -- --seed S --count N` | the simulator: N invented trip moments, each screen checked; a failure saves `tests/regressions/<ID>-<seed>.json` |
| `npm run sim:replay -- <file>` | one saved simulator case; exits with an error while it still fails |
| `npm run rules` | the rule check: every rule ID in force has a test, every ID a test names is defined |
| `npm run rules -- show <PREFIX>` | the rules of one area (for example `W`) and the tests naming them |
| `npm run rules -- --final` | as `rules`, and fails while any `later:` line remains |

## Rules

- `core` never imports from `ui`, `data` or `store`.
- `core` has no hidden inputs: no clock, randomness or device time zone. `now`, zone data and seeds are arguments. Lint enforces this.
- Rule IDs live in `docs/rules.md`, one line per rule ending in its ID. A test title starts with its ID, for example `test('[W-ZERO] …')`. `tests/rules-in-force.txt` lists IDs in force; a `later: ID` line is listed but has no test yet, and the task that adds the test removes the `later:` mark.
- Pull requests use fixed seeds.
- `main` accepts changes only through pull requests with green `types-lint`, `unit-property` and `load-check-qa` checks.
- Never print or quote lines 20–25 of Load Check's page (`public/tools/bags/index.html`) in any copy. Read it only from line 26 on (`Read` with `offset` 26, or narrow Grep patterns). `.gitattributes` marks it `-diff`, so `git diff` and `git show` print nothing for it. Never run `gh pr diff` on a pull request that holds the page; review with `git diff -- . ':(exclude)public/tools/bags/index.html'`, and for the page's own edits `git diff --text -U0 -- public/tools/bags/index.html`, whose hunks must not touch lines 20–25.
- The bag rules are frozen: `qa/selection-fixtures.cjs` and `LC-FREEZE-01` may not change without the owner.
- Load Check's source is now this repository. The project folder's `index.html` is the archive; don't edit it.

## A task

One group of related rules, 1–2 hours of work. Each task lists its rule IDs, spec sections, files and commands.

1. A failing test that names the rule ID.
2. The smallest code that passes.
3. `npm run fast`.
4. A commit.

## Only with the owner

- Changing a golden file, a regression case, a committed schema or a threshold.
- Skipping or loosening a test.
- Making anything public that was not public before.

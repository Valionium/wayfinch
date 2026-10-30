# Guide for agents

Wayfinch is built from a design spec, which is not in this repository yet. It is in the owner's project folder: `docs/superpowers/specs/2026-10-29-copilot-foundation-design.md`. Its "First version" page decides the scope until the first version is live. Read only the sections a task names.

## Node

Use Node 24, version 24.15 or later. `.npmrc` makes npm refuse any other. The owner's computer has Node 26 as its default for other work, so put a Node 24 folder first on `PATH` for every command here.

## Folders

Exist so far:

```
src/core/      pure TypeScript, no DOM, fully unit-tested
  geo/         distances
tests/
  unit/        Vitest
  gen/         shared generators; extend these instead of writing your own
tools/         project scripts
```

Planned, in spec section 4.2: `src/core/` engines, `src/data/`, `src/store/`, `src/ui/`, `src/tools/tyre/`, `public/`, `pipeline/`, `contracts/`, `tests/e2e/`, `tests/fixtures/`, `tests/sim/`.

## Commands

| Command | Runs |
| --- | --- |
| `npm run fast` | types, lint and the tests touched by this change, with 25 runs per property |
| `npm test` | types, lint and all unit and property tests |
| `npm run types`, `npm run lint`, `npm run unit` | one part |

## Rules

- `core` never imports from `ui`, `data` or `store`.
- `core` has no hidden inputs: no clock, randomness or device time zone. `now`, zone data and seeds are arguments. Lint enforces this.
- Pull requests use fixed seeds.
- `main` accepts changes only through pull requests with green `types-lint` and `unit-property` checks.
- Never print or quote lines 20–25 of Load Check's `index.html`.

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

# Guide for agents

Wayfinch is built from a design spec, which is not in this repository yet. It is in the owner's project folder: `docs/superpowers/specs/2026-10-29-copilot-foundation-design.md`. Its "First version" page decides the scope until the first version is live. Read only the sections a task names.

## Node

Use Node 24, version 24.15 or later. `.npmrc` makes npm refuse any other. The owner's computer has Node 26 as its default for other work, so put a Node 24 folder first on `PATH` for every command here.

## Folders

Exist so far:

```
src/core/      pure TypeScript, no DOM, fully unit-tested
  geo/         distances
  places/      place types, pack format, classification (classify-all.ts is the one code path of the pipeline and Refresh this stretch)
  answers/     makeAnswer, the final comparator, the one time formatter
  engines/     the answer engines: one pace, one trip day, one hours check
  hours/       prepared opening hours; only spans.ts reaches the library
  screen/      screen(inputs): the whole stop screen, never throws
  wording/     every user-facing string (en.ts)
  route/       rounded form, GPX reading, stages, climbs, sample grid, hash, zones.ts (routeZones and zoneAt over the bundled boundary file)
  bike/        your bike: tyre sizes (one reader, the tyre tool's too), the bike normaliser, resolveBikeSpec, frame templates, bikeArt and markerArt, swatches and OKLab, the caption
src/ui/        the app's shell in Preact (app, nav, theme.css, update prompt, shared card and status pieces); Ahead's components go in src/ui/ahead/ and may not import store or data
src/store/     the rider's data: IndexedDB (add-only migrations) and copilot:* keys; readInputs is the one place screen()'s inputs are put together; a window writes only over the version it read, so Tasks 12 and 13 must call `readTrip` again before `saveTrip` after any `writeSettings`, and `readSettings` before `writeSettings`, or the write is refused as newer
src/data/      what comes from outside. openmeteo.ts checks each answer whole before handing it on; refresh.ts decides when to ask, with no request of any kind without a prepared trip, a signal and a reason; weather-mode.ts reads build.config.json; overpass.ts is Refresh this stretch; prepare.ts is Get ready offline (it sets the prepared mark weather.ts reads, and takes the forecast through Update weather's turn and write); packs/download.ts gets tiles, resumable, one build per run; boundaries.ts reads public/data/boundaries.v1.json, which tools/build-boundaries.mjs makes once from OpenStreetMap and tools/prove-boundaries.mjs checks on a live pack (tools/boundaries-proof.json; rebuild the file and the proof goes stale)
public/        what is served; public/tools/bags/index.html is the Load Check page; manifest.webmanifest and icons/ ship only with the launch switch on
qa/            Load Check's QA suites (plain Node scripts), qa/paths.cjs, qa/fixtures/
tests/
  unit/        Vitest
  gen/         shared generators; extend these instead of writing your own
  sim/         the simulator: harness, the 32 checks (checks.ts), what they read (world.ts), the cases proving each can fail (inv-*.test.ts)
  regressions/ saved simulator failures, replayed on every run; a plain case for each is in tests/unit/core/screen/sim-found.test.ts
  fixtures/    one-line builders (build.ts, route.ts), banned words, device zones
tools/         project scripts
```

`pipeline/` is the weekly place-pack build; its guide for the owner is `pipeline/README.md` (commands are listed there). Commits under `pipeline/` must never trigger an app deploy.

Planned, in spec section 4.2: `src/data/` fetching, more of `src/ui/`, `src/tools/tyre/`, `public/`, `pipeline/`, `contracts/`, `tests/e2e/`, `tests/fixtures/`, `tests/sim/`.

## The bike on Trip, You and the strip

Groups 5, 6 and 8 place the drawing; `BK-WHERE-SCREENS` waits for them. Trip, at the top: `<BikeDrawing bike summary back="trip" />` from `src/ui/bike/drawing.tsx`, with `bike`, `summary` and `known` taken from the `bikeSource` signal of `src/ui/bike/live.ts` (it redraws when the bag planner saves in another tab). You: `size="small"` beside each bike of `bikeSource.value.bikes`, the plan's bike first, with `back="you"`; Edit is `bikeDetailsHref(id, 'you')` from `src/ui/bike/link.ts`, without a section. Ahead's strip: `<BikeMarker bike />` from `src/ui/bike/marker.tsx`, decorative, never a link; the strip gets the bike from its actions object, since Ahead's components may not import the store. Never write a `loadcheck:*` key; a tap on a drawing opens the bag planner's Look.

## Commands

| Command | Runs |
| --- | --- |
| `npm run fast` | types, lint, the tests touched by this change with 25 runs per property, 100 simulator scenarios and the rule check |
| `npm run qa` | Load Check's 36 QA suites, one line each; exit 0 only if all pass. `LC_PAGE` and `LC_WORKER` override the page and the old worker |
| `npm run build` | writes `dist/`: the page, `/offline-worker.js`, `_headers`, `build.json`. `--launch=on|off`, `--out=`, `--emergency`. With `--launch=on` it also runs Vite for the app shell and copies `public/`; with it off, no Vite runs and the output is what it was before the app existed |
| `npm run e2e` | the browser tests in `tests/e2e` (Chromium, phone and laptop size). The old site in them comes from the tag `load-check-zip-2026-10-30` |
| `node tools/deploy-check.mjs --build dist/build.json --origin <url>` | does the live site serve this build? Exit 1 if not. Read-only. `--self --origin <url>` compares the site with its own `build.json`; the other modes are for the workflows, listed at the top of the file |
| `npm test` | types, lint, all unit and property tests, and the cases proving each simulator check can fail |
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
- `main` accepts changes only through pull requests with green `types-lint`, `unit-property`, `load-check-qa` and `browser` checks.
- Never print or quote lines 20–25 of Load Check's page (`public/tools/bags/index.html`) in any copy. Read it only from line 26 on (`Read` with `offset` 26, or narrow Grep patterns). `.gitattributes` marks it `-diff`, so `git diff` and `git show` print nothing for it. Never run `gh pr diff` on a pull request that holds the page; review with `git diff -- . ':(exclude)public/tools/bags/index.html'`, and for the page's own edits `git diff --text -U0 -- public/tools/bags/index.html`, whose hunks must not touch lines 20–25.
- The bag rules are frozen: `qa/selection-fixtures.cjs` and `LC-FREEZE-01` may not change without the owner.
- Load Check's source is now this repository. The project folder's `index.html` is the archive; don't edit it.

## A task

One group of related rules, 1–2 hours of work. Each task lists its rule IDs, spec sections, files and commands.

1. A failing test that names the rule ID.
2. The smallest code that passes.
3. `npm run fast`.
4. A commit.

## Deploys

A merge never deploys. Only the owner approves a deployment, and only the owner runs `emergency`, `preview` and `rehearsal`. Agents never start, approve or re-run any of these, never run `wrangler deploy`, `wrangler rollback` or `wrangler versions upload`, and never call GitHub's approval API.

After green checks on `main`, `deploy.yml`'s `decide` compares the build with the live `build.json`. Only a real difference asks for the owner's click on the `production-approval` environment; `deployEnabled` in `build.config.json` must be true before anything is even compared. `deploy.yml`'s `deploy` job, after that click, is the only ordinary way to `wrangler deploy` to `load-check`. A failed after-deploy check opens one issue labelled `after-deploy`; nothing rolls back by itself. `tools/env-production.json` and `tools/env-approval.json` hold the two environments' settings.

`decide` refuses to ask for a click, and fails, when `production-approval` has no required reviewer or can't be read, unless `deployWithoutReviewer` in `build.config.json` is true. Setting that to true is the owner's decision. `emergency`'s `check` action changes nothing and says where a rollback would go; `switch` builds from the commit that is live, and only with `also_release_main` from `main`.

## Only with the owner

- Changing a golden file, a regression case, a committed schema or a threshold.
- Skipping or loosening a test.
- Making anything public that was not public before.

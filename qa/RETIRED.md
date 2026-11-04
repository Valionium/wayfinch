# Retired QA suites

Load Check's QA suites that were retired, and why. Retiring a suite is the owner's call (spec 12.6); these four are the ones in the
table of sub-project 6's plan ("Load Check's QA suites after the move"), which the owner approved on 2 November 2026. Each retired
in sub-project 6, group 2 (Task 6), when the tyre helper left the bag planner (spec 7.1 item 3). Anything they also guarded moved
to a kept suite first, as listed. `tests/unit/tools/load-check-wired.test.ts` (LC-QA-TABLE) checks this file against `run-all`.

| Suite | Why it retired | What moved, and where |
| --- | --- | --- |
| `tyre-pressure` | It checked the helper's weights for SRAM, its record of SRAM's suggestions, the limits on that record and its print-out. The helper is gone; the tyre tool (`src/tools/tyre/`) does the calculation now, with its own tests | Its limit cases have an equal or tighter row in `tests/unit/tools/tyre/` (the comparison is in the pull request). It held no Berto case: those are only in the tyre tool's fixture. Its mass-accounting cases (kit, cage water counted full, food modes, light mode, spilled items, a backpack's load) are checked on the load summary's weights in `tests/unit/contracts/load-summary-page.test.ts` (C-SUMMARY-INVARIANT) |
| `pressure-tool-markup` | It checked the helper's dialog markup | Unique ids, the bike opener, the bike weight's place, label and help: `qa/bike-details-ui.cjs` (its last block) |
| `pressure-tool` | It checked the helper's dialog, its modal behaviour and its use of the bike's tyre fields | Use these bike details keeping the repair references and the saved-bike list, an unnamed bike, a full list, an invalid weight: `qa/bike-details-ui.cjs` (its last block). The tyre fields kept in the data: `qa/tyre-pressure-storage.cjs` (LC-TYRE-KEPT) |
| `ui-pressure-layout` | It checked the CSS of the helper's confirmation checkbox | The contrast and underline of the attribution links and Leaflet's attribution bar: `qa/info-layout-regression.cjs` |

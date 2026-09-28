# Row 220: the band-preset harness clicks for real (review packet)

Branch `row220-band-preset-realclick`, agent tip `c9228278` (two commits: `b944f5c4` moves
`realClick` and the Effects-facet loader to `scratchpad/lib/real-click.mjs`; `c9228278` moves
the five clicks). The implementing agent ended with its session and wrote no packet; this
packet is the overseer's review, with every figure below from runs the overseer made on
2026-09-28 against this branch's own debug build.

## What changed

`scratchpad/band-preset-harness.mjs` drove five controls with synthetic `el.click()`: the
Effects facet pill (row 1d), the colour sub-tab (no row; now row 1e), the section header
(rows 2a and 4c), the preset `New` button (4a) and the 7f swatch. Each now goes through
`AIM_AT` + `clickSite`: resolve ONE target, scroll it into view, take its integer centre,
hit-test that pixel, send `realClick` there. Each row requires BOTH the hit to land on the
target AND a read-back of the state the click changes (facet, `effectsSubTab`, the section's
proof input, the model's preset list, the slider count).

Also fixed: 2a/4c's old `opened !== 'no-header'` guard was always true, because the helper
returned `'no-header: [...]'`. It is now a structured state.

`PLANT=<pe-none|cover|inert>:<facet|subtab|section|new|swatch>` breaks one control in the
running app through CDP (no source edit). Unknown PLANT values are refused.

## Verification (overseer, one environment, dpr 1 in every run)

Run with `AEON_DIR=<scratch aeon copy at cffdf716>`, `AURORA_BUILT_TREE=<this worktree>`
and `ELECTRON_BIN=<main checkout's electron>`. Every run printed `root:` and `pinned:` naming
the worktree, so the branch's own build was measured, not master's.

- Unmutated, twice (before and after the plants): **45 rows, 0 failed**, both times.
- **All 15 plants: the plant printed `applied`, the planted site's own row went FAIL, and the
  run exited 1.**

  | Site | Row that must go red | Result |
  |---|---|---|
  | facet | 1d | red (dependents 1e, 2a, 2b also red) |
  | subtab | 1e | red (dependents 2a, 2b also red) |
  | section | 4c | red (dependents 4c2, 4d, 4e, 4f, 7b also red) |
  | new | 4a | red (dependents down to 7a also red) |
  | swatch | 7f | red (dependent 7g also red) |

  Each of those five rows held for every plant kind: `inert`, `cover` and `pe-none`.
- **Which half of each row does the catching** (protocol bar 2d, the other green-path):
  - `cover` and `pe-none` fail the hit test.
  - `inert` PASSES the hit test at every site (`hitIsTarget: true`) and is caught only by
    the read-back, for example facet `"layout"` before and still `"layout"` after, or
    subTab still `"parallax"`.
  - So the read-back half is proven independently of the hit pre-check, and a click that
    lands and does nothing is red.
- `scratchpad/effects-guide-harness.mjs`, which now imports the moved helpers: **13/13**.
- `node scratchpad/check-harness-guards.mjs`: **292 clean of 292, 0 failures, 0 unmeasurable**.

## Left open

- Every run came up at dpr 1. The harness aims at integer centres and prints dpr, rect
  and aim beside every row, but the 1.35 regime was not observed in this review.

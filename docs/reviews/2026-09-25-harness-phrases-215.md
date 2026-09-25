# Harness copied phrases, the last two, ROADMAP row 215 (2026-09-25)

Branch `parcel/harness-phrases-215`, cut from master `da936133`. Left open by row 214
(`docs/reviews/2026-09-25-harness-copied-phrases-214.md`, "Left open"). Both items were
re-measured on the base before any change, and both were still true. No emulator and no
`mcp__oracle__*` tool was used.

Every harness run below used the same setup:
- `VITE_AURORA_DEBUG=1 npx electron-vite build` in the worktree, rerun after every mutation
  and every restore;
- `ELECTRON_BIN` = the main checkout's electron, `AURORA_BUILT_TREE` = the worktree;
- `AEON_DIR` = a fresh extract of `git archive` of aeon `8a6f92c4` (origin/master that
  day), re-extracted for every run.

Every run printed `root:` and `pinned: AURORA_BUILT_TREE=` naming the worktree.

Mutations were applied with `sed`, shown with `git diff`, and restored with
`git restore --source=HEAD -- <that one path>` after the harness change was committed.
"OLD" means the pre-change harness from `HEAD~1`, run on the same build. It was an untracked
copy and was deleted afterwards.

## (a) effects-guide row 1b: `.click()` → real input, with a read-back

**Still true on the base.** Row 1b was `clickByText('/^Effects$/')`, a synthetic `el.click()`.
It passed on "an element matched" (`click → true`). Baseline: 13/13.

**What the control binds.** `FacetBar` (`src/renderer/workspace/FacetBar.tsx`) renders one
`<button>` per descriptor. The button paints `f.label` and binds `onClick={() => switchFacet(tabId, f.id)}`.
There is no mousedown or pointerdown handler, so the pressed/released pair `realClick`
sends fires it through the browser's hit test.

**Change (`6642d5a4`).**
- The harness bundles `src/core/shell/facets.ts` with esbuild and runs `registerBuiltinFacets()`.
  It takes the `parallax` descriptor (label `Effects`). The run refuses to start if that
  descriptor is missing.
- It requires exactly one pill with that label inside `[role="group"][aria-label="Facets"]`,
  hit-tests the pill's `Math.round` centre, and clicks there with `realClick` (row 214's CDP
  `Input.dispatchMouseEvent` move/press/release, integer-only).
- It reads back `__dbg.parallaxPreview().facet`, which is the workspace store's
  `facetFor(activeId)`. The facet must not be `parallax` before the click and must be
  `parallax` after it.
- dpr, rect, aim and the hit element are printed.
- `assertFreshBuild` was added, because the row now compares against `src/`.
- The unused `clickByText` was removed.

| run | mutation on disk | new harness | OLD harness |
|---|---|---|---|
| fix | none | 13/13; 1b `aim {404,54}, hitIsPill true; facet before "layout", after "parallax"` | n/a |
| M1: pill unreachable | FacetBar `styles.pill` + `pointerEvents: 'none'` | 2 pass, 3 fail: 1b `hitIsPill false, hit "div:LayoutObjectsEffects…"; after "layout"`, then 2a/2b, ABORTED | **13/13 green**, `click → true` |
| M2: pill wired wrong | `onClick={() => switchFacet(tabId, visible[0].id)}` | 1b FAIL `hitIsPill true; facet before "layout", after "layout"`, then aborted | 1b **PASS** (`click → true`), 2a/2b fail |
| M3: label renamed in source | `facets.ts` `label: 'Effects'` → `'FX M3'` | 13/13, 1b clicked the `FX M3` pill, after `"parallax"` (the row follows the source) | 1b FAIL `click → false` |
| restored | none, rebuilt | 13/13 | n/a |

M1 is the defect: the old row stays green on a pill nobody can click. M2 shows the read-back
does its own work, because the hit test passes and only the facet value goes red.

## (b) band-preset row 3d: copied headline phrases → provider value

**Still true on the base.** 3d matched `/An author can author a raster band/` and
`/programmer wires it up in one line/` against the block's whole `innerText`. Baseline: 44/44.

**What the panel renders.** `LimitBlock` paints `{PRESET_HEADLINE}` whole, as the block's
only child `div` without a `title`. Every limit div and the no-preview div carry a `title`.

**Change (`1d550571`).**
- 3d reads every untitled child div of the block and requires exactly one.
- It compares that div's `innerText` exactly with `PRESET_HEADLINE`, imported from the esbuild
  provider bundle 3a/3b/3c/3e already use. A red prints the first differing character.
- The run refuses to start if the constant is missing or under 30 chars.
- The forbidden-sentence negative, `/no longer needs a programmer/i` over `allProse` (painted
  plus every hover), is unchanged. It stays a typed literal: it is what the source must never
  say, so it cannot be derived from the source.

| run | mutation on disk | new harness | OLD harness |
|---|---|---|---|
| fix | none | 44/44; 3d `1 untitled div; painted(73B vs source 73B): identical` | n/a |
| B1: panel paints something else | `{PRESET_HEADLINE} And then it is in the game.` | 43/1, 3d `painted(101B vs 73B): first difference at char 73` | **44/44 green** (both phrases still present) |
| B2: source reworded | `PRESET_HEADLINE` → `… A programmer connects it in one line (M215).` | 44/44, 3d `painted(80B vs 80B): identical` | 43/1, 3d `wiresItUp=false` |
| B3: forbidden sentence planted, painted | `PRESET_HEADLINE` → `… It no longer needs a programmer.` | 43/1, 3d `painted identical; forbiddenSentenceAbsent=false` | not run |
| B4: forbidden sentence planted, hover only | `NO_PREVIEW` gains `It no longer needs a programmer.` | 43/1, 3d `painted identical; forbiddenSentenceAbsent=false (… 10218B hovered)` | not run |
| restored | none, rebuilt | 44/44 | n/a |

B3 and B4 show that the negative alone reds the row. The positive half is identical in both,
and B4 plants the sentence only in a `title`.

## Suite

`check:harness-guards`: 0 failures after each commit.

`npm test` (`VITEST_MAX_WORKERS=4`):
- on base `da936133`: 2 failed | 10484 passed | 18 skipped (10504);
- on the tip: see the ROADMAP row.

The 2 failures on the base are the known aeon currency rows (row 218):
- `aeon-fixture-currency` for `clips/s2_ehz_cpz.clips.json`;
- `clip-tool-outputs` for `validate-json.cases.json`.

## Left open

The two named defects are closed. `effects-guide-harness.mjs` now has no synthetic click
call.

`band-preset-harness.mjs` still clicks with synthetic `.click()` at five sites. They are
outside row 215's scope and were not triaged here:
- `clickByText` (line ~296, used to reach the Effects facet);
- the section header in `OPEN_SECTION` (~342);
- `SUBTAB` (~438);
- the preset `New` button (~856);
- the colour swatch in 7f (~1139). The comment there calls this a real click, but the code
  is `.click()`.

If they are worth a row, it should be the same shape as rows 214/215: `realClick`, a hit
test, and a read-back.

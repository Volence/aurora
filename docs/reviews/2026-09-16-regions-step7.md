# REGIONS STEP 7 (EDITOR spec): `migrate-sections`

**Parcel:** editor spec §7 row 7 — `migrate-sections` (§4) and `migrate_sections` on the bus.
**Spec:** empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` at
`origin/main`, read through `git show`. ⚠ THE EDITOR HALF. `2026-09-14-regions-part-2-design.md`
is the ENGINE half and numbers its steps independently; "step 7" names two unrelated pieces of
work depending on which document the speaker last read.
**Branch:** `parcel/regions-step7-migrate`, off master `b31cda02`.
**Commits:** `4e79d0e1` (planner, command, the row rect the reader dropped), `07fd624a` (the
planner's 16 rows and the app-side assembly), `2e611c6c` (the end-to-end acceptance test and act 1
against aeon's golden), `384c0741` (the bus method and the panel's door), `6323d59a` (the landed
wiring suite meets the new `edges` key), `3739dfc7` (the gates this parcel's own copy tripped).
**Suite:** `npm test` on `3739dfc7`: **636 files passed, 3 skipped (639); 9947 tests passed, 9
skipped (9956), 0 failed**, exit 0.
**On the MERGED tree** (`a7686a6e`, this branch with master `3e54bd50` — REGIONS 184 — merged in,
because master moved after this branch was cut and both landings touch `RegionsPanel.tsx`):
**637 files passed, 3 skipped (640); 9954 tests passed, 9 skipped (9963), 0 failed**, exit 0. The
three skips are the two `test/live/` warp rows and `compose-bench`, none of them this parcel's; all
four of this parcel's files RAN (16 + 5 + 4 + 5).

---

## 1. What landed

| piece | file |
|---|---|
| The planner (pure) | `src/core/editing/migrate-sections.ts` |
| The command and its one undo step | `src/core/editing/commands.ts`, `src/core/editing/history.ts` |
| The key-less row's rectangle | `src/core/formats/effects/section-wiring.ts` (`UnkeyedEffectsRow.edges`) |
| The app-side assembly | `src/renderer/providers/regions-migrate.ts` |
| The bus method | `src/shared/agent-protocol.ts`, `src/renderer/agent/agent-handler.ts`, `src/main/editor-methods.ts` |
| The panel's door | `src/renderer/components/regions/RegionsPanel.tsx` |

Tests: `src/core/editing/__tests__/migrate-sections.test.ts` (16),
`test/formats/aeon-migrate-sections-roundtrip.test.ts` (5),
`test/formats/regions-migrate-act1.test.ts` (4),
`src/renderer/agent/__tests__/agent-handler.migrate-sections.test.ts` (5).

## 2. Act 1 produces TEN regions, and that number is derived

`test/formats/regions-migrate-act1.test.ts` builds the migration's input from **aeon's own bytes at
a committed revision** — `807bfdd5`, the same pin `section-wiring.test.ts` reads act 1's descriptor
at — and migrates it:

* nine section runs (act 1's nine presets are all different, so no two sections share a tuple),
* plus one key-less descriptor row (the night region),
* **= 10**, computed from the inputs in the test rather than typed from §7's "nine or ten".

The output is then compared to the **vendored golden**, aeon's own hand-authored `regions.json`
for act 1 (`test/fixtures/regions/ojz_act1.regions.json`, published at aeon `9772326`):
`preset`, `rect`, `sceneRef` and `rasterRef` **match for all ten rows, in order**, including the
two the night region carved (`sec1` w = 1352, `sec2` x = 4800).

**The known difference is asserted, not excluded:** ids and names. §4 specifies `sec_<lowest index>`
and "Sections a, b, c"; the golden was hand-authored `sec0` / "Forest, upper left". Neither is a
wire value — the engine reads no region id (§2.3) — so the row asserts both lists rather than
diffing around them.

## 3. Three of §4's sentences have no referent in the landed contract

The spec banners §2.3, §2.5, §3.2 and §5.2 as superseded by the owner's Q1 ruling of
2026-09-14T14:54:34Z ("cut right away"). **It does not banner §4**, and three of §4's sentences were
written under the model that ruling overturned. The landed code is the measurement; each is
answered in `migrate-sections.ts`'s header and each is a finding, not a silent departure:

1. **`defaults` does not exist.** The landed schema is `{schema, act, regions[]}` with `preset`
   required and non-null. Under the ruling an area no region holds is UNASSIGNED and the build
   refuses it, so §4's "the largest run becomes the bottom layer and creates no region" would leave
   a hole where a section used to have identity. **Every run becomes a region with an explicit
   preset.** aeon's own golden is the check on that reading: nine section regions, nine explicit
   presets, `OJZ_Preset_Plain` on `sec8` — exactly the modal tuple §4 would have dissolved.
2. **"Sections with an all-null sidecar and the default preset create nothing"** goes the same way.
3. **"appended AFTER … so they paint over them"** is painter's order. A key-less row **carves** the
   runs at migration time, which is what produces the hand table's own shrunk rows.

A fourth, smaller one: §4's "rects … as the fewest rectangles a row-by-row merge gives" assumed the
superseded `rects[]` array. The contract carries ONE rect per region, so a run whose surviving area
is not one rectangle becomes several entries sharing bindings with suffixed ids (`sec_0`,
`sec_0_a`). The engine reads that the same way — "an L-shape is two rows" (§2.1). Act 1 never takes
the branch; a fixture that does is under test.

## 4. The reader dropped the geometry, and §4 needed it

`UnkeyedEffectsRow` carried the preset, the constructor and the line and **no rectangle**. A row with
no section key is the only row whose rectangle cannot be derived from the section grid, so §4's "the
rectangle read from the row" had nowhere to read it from. `edges` now carries the row's four
INCLUSIVE edges, resolved out of the same descriptor **including aeon's named constants**
(`x0: OJZ_NIGHT_X0`, `x1: OJZ_NIGHT_X0 - 1`).

**Null when any one of the four does not resolve, and the migration REFUSES on a null** rather than
dropping the row: dropping it hands the night region's area to the section regions it was cut out
of and changes the act's identity in silence.

## 5. The anti-vacuity the spec names for this row

§7's note (2026-09-16) names this row's verification as absence-shaped: *"assert nine or ten regions
and every sidecar nulled"* passes identically on a fixture whose sidecars were never populated.

Every row that asserts a null asserts the non-null first, **field for field rather than by count**,
and the discipline reaches the save plan: a sidecar is only really cleared when the all-null body
reaches the file, so the planned bodies are parsed and compared (`parseSectionMeta`), not counted.

**Proven by making the vacuous case happen (M3 below): with the fixture's sidecars set all-null, the
guard reddens with its own sentence** — `the fixture carries no sidecar refs at all, so "every
sidecar nulled" would prove nothing: expected +0 to be 3`.

## 6. Red-first proofs

Every mutation was applied to a clean tree at a committed baseline, shown on disk (`git diff --stat`
plus the mutated line), run, and restored with `git checkout --` on a tree with nothing else dirty
(`dirty: 0` printed after each).

| # | mutation (on disk) | reds |
|---|---|---|
| M1 | `for (const carve of carves) void carve; // the carve, removed` | 6 (planner 3, roundtrip 1, act-1 2 — including the golden comparison) |
| M2 | history apply writes `'old'` instead of `'next'` | 3 (roundtrip 2, handler 1) |
| M3 | the roundtrip fixture's three sidecars set ALL-NULL (the vacuous fixture) | 3, incl. the named anti-vacuity guard |
| M4 | `rowEdges` returns null always | 10 (act-1 4, roundtrip 3, wiring 3) |
| M5 | flood fill visits every cell, ignoring adjacency | 1 (`sec_0`,`sec_0_a` instead of `sec_0`,`sec_4`) |
| M6b | UNDO only (apply untouched) restores two of the four refs | 2, both named "all four refs" |
| M7 | `runKey` includes `bgLayoutRef`/`paletteRef` | 1 (a run split on a difference the file cannot carry) |
| M8 | `dryRun` applies anyway | 1 (`applied` true where false was asserted) |

M6 was first written as a mutation of the SHARED writer, which reddened the apply side too and
isolated nothing; M6b is the narrow version and it is the one recorded. The broad one is not
counted.

## 7. Gates this parcel's own work tripped

* **The engine-claim register** refused `migrate_sections`'s published description, which asserts
  engine behaviour ("the build refuses a sidecar that still carries sceneRef or rasterRef"). The
  licensing clause is REAL and was measured at aeon `origin/master`: `check_mode_conflict` in
  `tools/effects_gen.py` refuses exactly that tree, and its own message names the remedy — *"run
  Aurora's `Migrate sections`"*. Registered with the quote `section sidecar(s) still carry
  identity`, so the clause is re-read on every run.
* **The dash gates**, eleven repairs across component text, source strings and test titles.
* **`tsc` caught what vitest could not:** `BoundEditHistory.undo()` takes no level, and
  `history.undo(level)` compiled fine under vitest (which strips types) and passed.
* **Three rows of the LANDED wiring suite were red on this branch for three commits.** Adding
  `edges` broke three `toEqual` comparisons: `toEqual` ignores an *undefined* property but not a
  present one. I ran my own files green and not the suite of the file I had changed the module
  under. The two synthetic rows now assert `edges: null` (a reading: both write only `x0:`, and the
  rule is all four edges or nothing), and the real aeon row is STRONGER than before — its `edges`
  expectation comes from that file's own `resolveEdge`, so the row is now two independently written
  readers of one syntax agreeing on aeon's bytes, with a guard above it refusing the vacuous case
  where the test's own resolver returns null.

## 8. Left open, TAGGED for the controller

1. **⚠ AT AEON'S CURRENT MASTER THE SAME MIGRATION WOULD PRODUCE ELEVEN REGIONS, not ten.** Act 1's
   descriptor gained a DEBUG-conditional row after the pin:
   `const OJZ_E2_SNAP_ROWS: array = if DEBUG == 1 { [ ojz_region(… effects: OJZ_Preset_NightSnap) ] } else { [] }`.
   Aurora's descriptor reader is textual — it pairs each `effects:` with the `sec:` inside its own
   call and cannot evaluate `if DEBUG == 1` — so that row reads as a second key-less row, its rect
   resolves, and the migration would emit it as a region carving section 2 at x 5600, producing the
   DEBUG shape of the table rather than the release shape aeon's own golden carries. It would also
   appear BEFORE the night region, because it is declared above the table and appended with `++`.
   **This is a tested statement, not a prediction:** the last row of
   `test/formats/regions-migrate-act1.test.ts` asserts it at `9772326`. The same hazard is already
   recorded from the other side in ROADMAP row 181, which declined to move the wiring pin for it.
   **It needs a product decision the migration cannot take for itself:** either Aurora learns which
   rows are DEBUG-only, or the migration refuses an act whose descriptor carries a conditional row
   array, or the author is warned. Not guessed here.
2. **The panel button has no on-screen test.** `MigrateSections` is arrangement over tested
   functions (the provider, the planner, the command), and the node suite cannot see React. A CDP
   row belongs with `scratchpad/regions-facet-harness.mjs` (step 6's harness), run with
   `AURORA_BUILT_TREE` set or it silently measures the main checkout. Not attempted: the brief put
   CDP work outside this parcel.
3. **Migration refuses an act that already has regions**, which §4 does not discuss (it describes a
   one-way trip). The alternative — replacing every authored rectangle with the section grid, undoable
   but easy to miss — was judged worse. Overturnable.
4. **Nothing runs the migration against act 2 or another game**: no such act has a descriptor Aurora
   can read in this checkout, so the multi-section-run and multi-rect branches are exercised by
   synthetic fixtures only.

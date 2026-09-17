# Deleting a raster preset a REGION binds (DELETE-PRESET-REGION-BOUND, 2026-09-17)

Queue row `DELETE-PRESET-REGION-BOUND`. Base: master `d6075e55`, branch
`parcel/preset-delete-region-bound`. No emulator was used, and no aeon or sigil build was needed.

## The defect

`deletePresetRefusal` in `src/renderer/providers/effects-preset.ts` took only `sections` and
delegated to `sectionsBindingPreset`, which scans `Section.rasterRef`. There was no region-side
counterpart anywhere in the repo. Since aeon `e2af59ea` OJZ act 1 is in REGION MODE and its raster
bindings live on the region rows: `test/fixtures/regions/ojz_act1.regions.json` has `sec5` binding
`ojz_sec5_showcase` and `sec6` binding `ojz_sec6_baseswap`, and every section sidecar `rasterRef`
is null. So on that act Delete offered a clean bill of health for a document a region still bound,
and the dangling ref was met later as aeon's generator refusing the build by name, through the FAST
wrapper's wrong message about donor directories. That is EFFECTS-W1 defect 11's exact shape, one
namespace over, reintroduced by the mode change rather than by an edit to the guard.

## The rule as built

`deletePresetRefusal(sections, id, act?)` takes the act as an optional third argument, the shape
`sceneSelectionRelation` (`src/renderer/providers/effects-aeon.ts`) and `sectionRasterBindRefusal`
already take. `src/renderer/components/effects/BandPresetPanel.tsx` passes it.

- Mode: `actHasRegionsFile` from `src/core/formats/regions/act-regions.ts`, ruling B1's one
  predicate. No second region-mode test was written.
- Bindings: `regionsBindingPreset`, the exported twin of `sectionsBindingPreset`, over
  `Region.rasterRef`. Ids once each, in author order.
- `REGION_RASTER_BINDING_ROW` is the row word the sentence points at, asserted equal to
  `BINDING_LABELS.raster` (`src/renderer/providers/regions-aeon.ts`), the map the Regions panel's
  own rows are built from.

### THE FIELD IS `rasterRef`, NOT `preset`

A `Region` (`src/core/formats/regions/document.ts`) carries two fields that both read like "a
preset". `preset` is the RECORD NAME of an EffectsPreset in the GAME's own effects library: required,
non-null, validated by aeon's generator against a source Aurora does not open. `rasterRef` is the
optional id of a raster preset DOCUMENT, the same namespace `Section.rasterRef` and this panel's
library name, and the only one a document delete can dangle. Row `[ns]` is the plant: a region whose
`preset` equals the id being deleted, with a null `rasterRef`, must still delete cleanly. Verified on
the tree; nothing contradicted the reading.

### The three states, each with its own answer

`ActRegionsState` distinguishes three states on purpose and no consumer may collapse them
(`src/core/formats/regions/act-regions.ts`, and the same warning at
`src/renderer/providers/regions-aeon.ts` and `src/renderer/debug-hooks.ts`).

1. **No regions file** (and an `undefined` act, and `{}`, and `noRegionsLoaded()`'s state): section
   mode. The old arm, unchanged, returning the old sentence. Row `[sec-mode]` asserts the three
   spellings produce the identical string, and that the region arm produces a different one, so it
   is not comparing one sentence with itself.
2. **A readable document**: the region rows are scanned.
3. **`unreadable` non-null**: REFUSED, saying Aurora cannot tell.

### Design calls

1. **State 3 refuses, and says it cannot tell.** Returning null there would print a clean bill of
   health derived from a failed read, on the one control whose whole reason for existing is that a
   dangling ref is met later as a misattributed build failure. The sentence cannot be mistaken for
   either other answer, and row `[unread]` asserts that directly (it must not contain "no region
   binds", and must not read as the bound sentence). **Stated cost, not hidden:** while an act's
   regions.json is refused, Delete is disabled for every preset on that act. That is coherent with
   the rest of the load's treatment of state 3, which already writes nothing and removes nothing for
   such an act, and the way out is named: the Regions panel's own notice about that file.
2. **Both causes are reported, not the first one found.** A region-mode act can carry a readable
   regions.json AND section sidecars still holding refs, which is the tree
   `sectionRasterWriteRefusal` exists because of. Both bindings dangle if the document goes, so
   suppressing the section clause in region mode would make this guard WEAKER there than on a
   section-mode act: a protection removed by the mode rather than moved by it. The sidecar clause
   says the ref is itself refused beside regions.json (aeon's `check_mode_conflict`) and that
   clearing it is allowed, because clearing is the only write that select permits on such an act and
   it repairs both faults at once. Its lead does not depend on a preceding clause, so it reads
   correctly standing alone (row `[both-solo]`).
3. **Region IDS, not names.** `Region.name` is an optional author-facing label the engine and the
   generator never read; the Regions panel shows the `id` on every row, and the sentence points at
   that panel, so the id is the label that makes it actionable. This is
   `regionModeSceneRelationText`'s call, for the same reason, and it keeps the two region-mode
   sentences naming regions the same way.
4. **One mention per id.** A carved region is several `regions[]` entries sharing an id and ONE
   panel row (`setRegionBinding`'s invariant: every entry of one id carries identical bindings).
   Naming it three times would point three times at one control. Rows `[carve]` and `[plural]`.
5. **The list spells `and`, unlike the scene relation sentence.** The scene sentence writes
   `regions b, c bind`; this refusal has written `Sections 0, 2 and 3 bind` since EFFECTS-W1 defect
   11 and its existing rows pin it exactly. One refusal must read the same way in both of its arms,
   so the region arm takes `bindingListWords`, the shared helper, rather than the other file's
   shape.
6. **The guard is NOT suppressed in region mode**, unlike every other verdict in
   `BandPresetPanel.tsx` (the wiring advisory, the arm refusal and its unknown notice, the rebind
   notice). Those ask about a SECTION as the owner of a binding, which a region-mode act has none
   of. This asks whether anything still names the document, which both modes answer; the owners just
   move. Row `[gate]` reads the derivation and fails if anything else can zero it.
7. **The pointer is the Regions panel for the region cause and the Section dropdown for the
   sidecar cause.** On a region-mode act the Section select refuses a binding outright, so pointing
   there for the region cause would send an author to a wall; and the Regions panel has no control
   over a section sidecar. B1's register ("the Regions panel, under Bindings") is what is in force,
   plus the control that actually exists on that row, "revert to inherited".

## Wording

Region mode, one region (the OJZ act 1 case, with ids derived from the fixture):

> Region sec5 binds "ojz_sec5_showcase". Deleting it would leave that binding naming a document that
> does not exist, and aeon's build refuses that by name. Select that region in the Regions panel and
> use "revert to inherited" on its raster row, under Bindings, first.

Several regions: `Regions b and c bind "mine". ... those bindings ... Select those regions in the
Regions panel and use "revert to inherited" on the raster row, under Bindings, first.`

regions.json refused:

> Aurora cannot tell whether a region binds "mine": this act is in region mode and its regions.json
> could not be read, so the region rows that would name it are unknown. Deleting it could leave a
> binding naming a document that does not exist, which aeon's build refuses by name. The Regions
> panel says why the file was refused.

Leftover section sidecar, appended to whichever of the above applies and correct standing alone:

> Section 1 still carries rasterRef "mine" in its sidecar beside regions.json, which aeon's
> check_mode_conflict refuses. Clearing it in the Section dropdown above is allowed, and it is what
> removes that binding.

Section mode is byte-identical to before, e.g. `Section 2 binds "mine". ... Set the raster binding
back to "..." on that section first, in the Section dropdown above.`

No en dash or em dash in any new string (row `[dash]`).

## Fixtures

- `test/fixtures/regions/ojz_act1.regions.json`, the committed copy of aeon's shared golden
  (provenance beside it), read through the REAL codec `parseRegionsDocument` rather than a trusted
  `JSON.parse`. The binder id and its ref are DERIVED from the file (the rows pick a `rasterRef`
  exactly one row carries), never typed.
- Small in-test regions documents for the plural/carved, namespace, both-causes and refused cases.

## Tests

Runner: **`npm test`** (which runs the eleven `check:*` scripts, then `npm run typecheck`, then
`vitest run`). File: `src/renderer/components/effects/__tests__/preset-delete-guard.test.ts`, the
file whose name already claims to lock "deleting a bound preset". 13 rows added, file 7 -> 20.

`describe('deleting a preset a REGION binds is refused (DELETE-PRESET-REGION-BOUND)')`:

| row | claim |
|---|---|
| `[av]` | ANTI-VACUOUS: a region-mode act whose regions bind something ELSE still deletes cleanly |
| `[ojz]` | one region, on OJZ act 1 as shipped: names the row and the Regions panel, never the Section dropdown |
| `[plural]` | several regions: all of them, once each, in author order |
| `[unread]` | a refused regions.json is never a clean bill of health |
| `[ns]` | the scan reads `rasterRef`, never `preset` |
| `[carve]` | a carved region is named once: one id, one panel row |
| `[both]` | a leftover section sidecar is reported too, beside the region cause |
| `[both-solo]` | the sidecar cause stands alone when no region binds it |
| `[unread-both]` | a refused document and a leftover sidecar say both things |
| `[sec-mode]` | section mode is untouched: no act, `{}` and `noRegionsLoaded()` take the old path |
| `[ctrl]` | the sentence names a control that exists, with the row word derived from `BINDING_LABELS` |
| `[dash]` | no en dash or em dash in any region-mode sentence |

and `[gate]` in the existing `describe('the panel is wired to the guard, from one derivation')`: the
delete derivation is not suppressed in region mode.

## Suite

| | Test Files | Tests | exit |
|---|---|---|---|
| baseline, untouched worktree at `d6075e55` | 649 passed, 3 skipped (652) | 10157 passed, 9 skipped (10166) | 0 |
| after this parcel | 649 passed, 3 skipped (652) | 10170 passed, 9 skipped (10179) | 0 |

`+13`, exactly the rows added. The baseline was GREEN: nothing in it is attributed to this parcel and
nothing was inherited red. `failure-class: no failures in this run (652 modules)` both times.
`tsc --noEmit` clean. Run in a LINKED WORKTREE, so `test/support/sibling-root.test.ts` step 3 is
unmeasurable here and is one of the 9 skips; the other 8 are the same pre-existing opt-in and
absent-tree skips the baseline reported.

## Red-first record

Rows committed BEFORE the fix, at `1afdbd64`, and run with `npx vitest run` on the file: **11 failed
/ 8 passed**. Green at baseline were the four pre-existing section rows, the two preview-chip rows,
`[av]` and `[dash]` (both vacuously, and both given their own mutation below). The fix landed at
`79ecb498`: **20/20**.

Every mutation below was applied by a script that asserts its target text occurs exactly once,
SHOWN on disk with `git diff --stat` and `git diff -U0` before the run, and restored with
`git show HEAD:<path> > <path>` from the COMMITTED baseline `79ecb498` (the tree was clean before
each one; `git diff --stat` after each restore was empty).

| # | mutation, on disk | red |
|---|---|---|
| M1 | the region arm deleted: `if (regions !== undefined && actHasRegionsFile(regions)) { return regionModeDeletePresetRefusal(...) }` removed | 9 red: every region row except `[av]`, `[carve]`, `[dash]`. **All four pre-existing rows GREEN** |
| M2 | `regionsBindingPreset` scans `region.preset` instead of `region.rasterRef` | 6 red, including `[ns]` |
| M3 | the state-3 clause not pushed (unreadable answers null) | `[unread]`, `[unread-both]` only |
| M4 | the leftover-sidecar clause suppressed in region mode | `[both]`, `[both-solo]`, `[unread-both]` only |
| M5 | `&& !out.includes(region.id)` deleted | `[plural]`, `[carve]` only |
| M6 | `if (binders.length > 0)` -> `if (true as boolean)`, the region arm becomes a WALL | `[av]`, `[ns]`, `[both-solo]` |
| M7 | an em dash in the region clause | `[dash]` + 4 exact-string rows |
| M8 | `REGION_RASTER_BINDING_ROW` drifts from `BINDING_LABELS.raster` | `[ctrl]`, `[ojz]` |
| M9 | the panel suppresses the guard in region mode, via a local NOT called `regionNotice` | **GREEN. A gate defect, see below** |
| M9r | the same mutation after the gate was repaired | `[gate]` alone |
| M10 | the panel drops the third argument | `[gate]` and the pre-existing wiring row |

`[dash]` cannot be isolated: every region-mode sentence is also pinned exactly by the rows above it,
so M7 takes five rows. That is the same result the scene-relation landing recorded for its own dash
row.

### The vacuous gate, and the method change it forced

`[gate]`'s first draft asserted `not.toMatch(/regionNotice/)` over the `deleteRefusal` derivation.
**M9 applied that suppression on disk and the file stayed 20/20 GREEN**, because a realistic
suppressor need not spell that identifier:

```
const deleteRefusalGate = act === null ? null : regionModeRasterNotice(act);
const deleteRefusal = (act === null || selected === null || deleteRefusalGate !== null) ? null : ...
```

Applied and still green is a gate defect, not a pass. The row now makes the claim structurally: the
condition that can zero the derivation must have the SORTED IDENTIFIER SET `['act', 'null',
'selected']`, so any suppressor under any name adds a fourth. Its instrument is checked before it is
trusted: the same extraction over `wiringAdvisory`, a sibling verdict that IS suppressed in region
mode, must find `regionNotice !== null`, so a regex that matched nothing cannot read as "no
suppressor here". Repaired at `c6660256`, and M9 re-run against that version as **M9r**, red on
`[gate]` alone.

**Retroactive pass (invariant e).** Only `[gate]` changed proof method. Every other row was
established by a mutation that went red on the committed tree, and each of those runs is the one
tabulated above; none of them relied on the identifier-search method, so none needed re-establishing.

## What the old lock did and did not cover, stated plainly

The file is named for "deleting a bound preset" and carries an anti-vacuous row of its own. Under
M1, which reintroduces exactly the region-side defect this parcel fixes, **all four pre-existing
section rows stayed green**, as did the panel-wiring row and the two preview-chip rows. That is a
true and useful fact about the old lock's scope rather than a failure of those rows: they lock the
section installer, which is the only one that existed when they were written, and the mode change is
what added a second.

## Open, and tagged for the foreground

1. **TAGGED: not checked on screen.** These rows read source and call the provider. Whether the
   Delete button is really greyed on a region-mode act and the sentence really painted is the CDP
   harness's claim, as this file's own header says, and Node/Vitest here cannot see React or a
   canvas. The on-screen check to run in the real editor: open OJZ act 1 (region mode), Effects >
   Raster band presets, select `ojz_sec5_showcase`, and read the Delete button and the warning hint
   beneath it; then select a preset no region binds and confirm Delete is enabled; then, on any act
   without a regions.json, confirm the old section sentence is unchanged.
2. **TAGGED: the state-3 screen.** The refusal disables Delete for EVERY preset on an act whose
   regions.json is refused. Worth one look in the running editor to confirm the Regions panel's own
   notice is visible at the same time, so the two sentences together tell the whole story.
3. **NOT DONE, deliberately: no ROADMAP row and no lane-log entry.** The overseer holds the queue row
   and the lane log; `docs/lane-log.jsonl` is gated by `check:ledger-timestamps` and wants one clock
   read per entry with distinct seconds, so it is left to the landing rather than written from a
   worktree.
4. **FOUND, NOT FIXED (candidate row): the SCENE document delete has no binding guard at all, in
   either mode.** `deleteSceneCommand` (`src/renderer/providers/effects-aeon.ts`) refuses only when
   there is no such scene, and its control at `src/renderer/components/effects/EffectsScenePanel.tsx`
   goes through `deleteSceneGuarded`, which asks for a CONFIRM when there is a file to lose. Nothing
   asks which sections' `sceneRef` or which regions' `sceneRef` still name it. So this is not the
   same defect one namespace over: it is the absence of the whole guard, and a confirm is what
   `deletePresetRefusal`'s own ruling rejected as an answer ("a confirm asks are you sure about a
   consequence the author cannot see"). Out of scope for this row, which is about the guard that
   exists being blind to one installer. The readers it would need already exist:
   `sectionsBindingPreset`'s scene twin is the `users` array `sceneSelectionRelation` computes, and
   the region side is `regionBindingValue(region, 'scene')`.

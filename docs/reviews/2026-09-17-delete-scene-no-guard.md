# Deleting a scene a SECTION or a REGION binds (DELETE-SCENE-NO-GUARD, 2026-09-17)

Queue row `DELETE-SCENE-NO-GUARD`, booked as item 4 under "Open" in
`docs/reviews/2026-09-17-delete-preset-region-bound.md`. Base: master `5e104e95`, branch
`parcel/scene-delete-guard`. No emulator was used, and no aeon or sigil build was needed.

## The defect

Deleting a SCENE document had NO binding guard at all, in either mode. `deleteSceneCommand`
(`src/renderer/providers/effects-aeon.ts`) refuses only when there is no such scene. Its control in
`src/renderer/components/effects/EffectsScenePanel.tsx` goes through `deleteSceneGuarded`
(`src/renderer/shell/effects-delete-guard.ts`), which asks a CONFIRM when there is a FILE to lose.
That is a different question (am I destroying a file), and nothing anywhere asked which sections'
`sceneRef` or which regions' `sceneRef` still named the document. The dangling ref is then met later
as aeon's generator refusing the build by name, through the FAST wrapper's wrong message about donor
directories.

So this is NOT the preset defect one namespace over. `DELETE-PRESET-REGION-BOUND` was an existing
guard blind to one installer; this was the absence of the whole guard, and a confirm is what
`deletePresetRefusal`'s own ruling rejected as an answer to this question ("a confirm asks are you
sure about a consequence the author cannot see").

Both installers were unguarded, and both are live on the act in front of the owner: on OJZ act 1
(`test/fixtures/regions/ojz_act1.regions.json`, the committed copy of aeon's golden) FOUR regions
bind a scene (`sec0`, `sec4`, `sec7`, `sec8`), and every section sidecar `sceneRef` is null.

## The rule as built

`deleteSceneRefusal(sections, id, act?)` in `src/renderer/providers/effects-aeon.ts`, the shape
`deletePresetRefusal` and `sceneSelectionRelation` already take.
`src/renderer/components/effects/EffectsScenePanel.tsx` passes it, disables Delete on it and paints
the sentence under it, from ONE derivation.

- Mode: `actHasRegionsFile` (`src/core/formats/regions/act-regions.ts`), ruling B1's one predicate.
- Section side: `sectionsBindingScene`, `sectionsBindingPreset`'s twin, EXTRACTED from
  `sceneSelectionRelation`'s own `users` loop rather than written beside it. This surface now has one
  scan of `Section.sceneRef`, not two.
- Region side: `regionsBindingScene`, over `regionBindingValue(region, 'scene')`
  (`src/renderer/providers/regions-aeon.ts`). `regionModeSceneRelationText` now calls it too, for the
  same reason: one region scan, not two. Ids once each, in author order.
- `REGION_SCENE_BINDING_ROW` is the row word the sentence points at, asserted equal to
  `BINDING_LABELS.scene`, the map the Regions panel's own rows are built from.
- `SCENE_REF_ACT_DEFAULT` is the option label the section-mode sentence points at, and
  `sceneRefOptions` now builds the select from the same constant.

### The three states, each with its own answer

`ActRegionsState` distinguishes three states on purpose and no consumer may collapse them.

1. **No regions file** (and an `undefined` act, and `{}`, and `noRegionsLoaded()`'s state): section
   mode, the section arm. Row `[sec-mode]` asserts the three spellings produce the identical string,
   and that the region arm produces a different one, so it is not comparing one sentence with itself.
2. **A readable document**: the region rows are scanned.
3. **`unreadable` non-null**: REFUSED, saying Aurora cannot tell.

### The namespace, verified before the scan, and it is NOT the preset's shape

The brief asked for the row `[ns]` did for presets: establish from source which `Region` field is the
DOCUMENT id a delete can dangle and which is a game-library record name. **On the scene side that
pair does not exist, and the honest finding is that the asymmetry is the finding.** From
`src/core/formats/regions/document.ts`:

- `sceneRef` is the only field in the parallax-scene namespace: "Optional id of the parallax scene (a
  `parallax_config`) this region uses", the same namespace `Section.sceneRef` and this panel's library
  name.
- `preset` is the RECORD NAME of an EffectsPreset in the GAME's effects library (ruling Q8), required
  and validated by aeon's generator against a source Aurora does not open.
- `rasterRef` is a raster preset DOCUMENT id (the preset parcel's subject), and `bg.layoutRef` a
  background layout id.

Three other namespaces, none of which reads as a scene. The plant is kept anyway, and the reason is
mechanical rather than rhetorical: the region reader is KEY-DRIVEN
(`regionBindingValue(region, 'scene')`), so a wrong key is a one-word mutation, and M2 below applies
exactly that one word. Row `[ns]` gives the region BOTH decoys at once (`preset` and `rasterRef` equal
to the id being deleted, `sceneRef` null) and requires a clean delete.

**The symmetric pair is on the SECTION side, and it did not exist for presets.** One section sidecar
carries both `sceneRef` and `rasterRef`; row `[ns-sec]` plants a section whose `rasterRef` is the
scene id being deleted beside two whose `sceneRef` is, and M11 applies the swap.

### Design calls

The preset ruling's seven calls were followed. Where a scene genuinely differs it is called out.

1. **State 3 refuses, and says it cannot tell** (preset call 1, unchanged). Stated cost, not hidden:
   while an act's regions.json is refused, Delete is disabled for every scene on that act. Row
   `[unread]` asserts the sentence cannot be mistaken for either other answer.
2. **Both causes are reported, not the first found** (preset call 2, unchanged). aeon's
   `check_mode_conflict` refuses a sidecar `sceneRef` beside regions.json exactly as it refuses a
   `rasterRef`, and `sectionSceneWriteRefusal`'s docblock states that CLEARING is never refused, so
   the sidecar clause's advice is true on the scene side for the same reason.
3. **Region IDS, not names** (preset call 3, unchanged): `Region.name` is never read by the engine or
   the generator, and the Regions panel shows the id on every row.
4. **One mention per id** (preset call 4, unchanged). Rows `[carve]` and `[plural]`.
5. **The list spells `and`** (preset call 5), **but the helper could NOT be shared, and that is a real
   difference.** `src/renderer/providers/effects-preset.ts` imports FROM
   `src/renderer/providers/effects-aeon.ts` (`EFFECTS_FIRE_LINE_MIN`, `FactorOption`, `vDeformValue`),
   so the arrow cannot also point back and `bindingListWords` cannot be imported without a cycle or a
   third module. A local `sceneBindingListWords` twin was written instead, and row `[sec-plural]` is
   the anti-drift gate: it DERIVES the expected fragment by calling `deletePresetRefusal` over the
   same indices rather than typing it. M15 proves that bites.
6. **The guard is NOT suppressed in region mode** (preset call 6, unchanged). Row `[gate]` reads the
   derivation structurally.
7. **The pointer names a control that exists (preset call 7), but it is a DIFFERENT control and a
   different preposition.** The preset sentence says "in the Section dropdown above"; on this panel
   the scene binding lives in a titled `CollapsibleSection` called **Section assignment**, and it sits
   BELOW the scene form, not above it. The sentence therefore reads "under Section assignment", and
   row `[ctrl]` reads `title="Section assignment"` off the panel so the words cannot drift from the
   section they name. The region clause keeps B1's register ("the Regions panel, under Bindings") and
   the control that actually exists on that row, "revert to inherited".

### How the two guards compose

They answer different questions and both are wanted.

| | question | mechanism |
|---|---|---|
| `deleteSceneRefusal` | would deleting this DANGLE a binding | DISABLES the button, sentence beneath |
| `deleteSceneGuarded` | am I destroying a FILE | CONFIRMS, at the click |

Because both live on ONE button, **a scene that is both bound and has a file never reaches the
confirm**: the press cannot happen while the refusal stands. Nothing had to be sequenced for that;
the disable is what makes it true. Row `[confirm]` asserts it structurally (both attributes on the
same `IconButton`), so a later edit cannot move the confirm onto a control the refusal does not
cover. M18 (the guard replaced by an unguarded call) and M16 (the `disabled` dropped) red it from
either side.

**The command is NOT guarded**, exactly as `deletePresetCommand` is not: the agent handler calls it
directly, an agent's request IS its explicit act, and there is no control to disable. See "Open".

## Wording

Section mode, one section:

> Section 2 binds "mine". Deleting it would leave that binding naming a document that does not exist,
> and aeon's build refuses that by name. Set the scene binding back to "Act default" on that section
> first, under Section assignment.

Several: `Sections 0, 2 and 3 bind "mine". ... those bindings ... on those sections first, under
Section assignment.`

Region mode, one region (the OJZ act 1 case, ids derived from the fixture):

> Region sec4 binds "ojz_act1_depth". Deleting it would leave that binding naming a document that
> does not exist, and aeon's build refuses that by name. Select that region in the Regions panel and
> use "revert to inherited" on its scene row, under Bindings, first.

regions.json refused:

> Aurora cannot tell whether a region binds "mine": this act is in region mode and its regions.json
> could not be read, so the region rows that would name it are unknown. Deleting it could leave a
> binding naming a document that does not exist, which aeon's build refuses by name. The Regions
> panel says why the file was refused.

Leftover section sidecar, appended to whichever of the above applies and correct standing alone:

> Section 1 still carries sceneRef "mine" in its sidecar beside regions.json, which aeon's
> check_mode_conflict refuses. Clearing it under Section assignment is allowed, and it is what removes
> that binding.

No en dash or em dash in any new string (row `[dash]`).

## Fixtures

- `test/fixtures/regions/ojz_act1.regions.json`, the committed copy of aeon's shared golden
  (provenance beside it), read through the REAL codec `parseRegionsDocument` rather than a trusted
  `JSON.parse`. The binder id and its ref are DERIVED from the file (the rows pick a `sceneRef`
  exactly one row carries), never typed.
- Small in-test regions documents for the plural/carved, namespace, both-causes and refused cases.

## Tests

Runner: **`npm test`** (eleven `check:*` scripts, then `npm run typecheck`, then `vitest run`). New
file: `src/renderer/components/effects/__tests__/scene-delete-guard.test.ts`, mirroring
`src/renderer/components/effects/__tests__/preset-delete-guard.test.ts`. 19 rows.

| row | claim |
|---|---|
| `[av]` | ANTI-VACUOUS: a scene nothing binds still deletes cleanly |
| `[sec]` | one section: names it, names the build's own failure, and says what to do |
| `[sec-plural]` | several sections, once each, in index order, spelled as the PRESET refusal spells it |
| `[ns-sec]` | the section scan reads `sceneRef`, never the `rasterRef` in the same sidecar |
| `[av-region]` | ANTI-VACUOUS, region side: OJZ act 1 as shipped still deletes a scene no region binds |
| `[ojz]` | one region, on OJZ act 1 as shipped: names the row and the Regions panel, never Section assignment |
| `[plural]` | several regions: all of them, once each, in author order |
| `[unread]` | a refused regions.json is never a clean bill of health |
| `[ns]` | the region scan reads `sceneRef`, never `preset` and never `rasterRef` |
| `[carve]` | a carved region is named once: one id, one panel row |
| `[both]` | a leftover section sidecar is reported too, beside the region cause |
| `[both-solo]` | the sidecar cause stands alone when no region binds it |
| `[unread-both]` | a refused document and a leftover sidecar say both things |
| `[sec-mode]` | section mode: no act, `{}` and `noRegionsLoaded()` take one identical path |
| `[ctrl]` | both sentences name controls that exist, with every word read from source |
| `[dash]` | no en dash or em dash in any sentence this guard speaks |
| (wiring) | Delete is disabled by the refusal and the refusal is rendered, from one derivation |
| `[confirm]` | the file confirm is KEPT, on the same button the refusal disables |
| `[gate]` | the guard is NOT suppressed in region mode |

## Suite

| | Test Files | Tests | exit |
|---|---|---|---|
| baseline, untouched worktree at `5e104e95` | (vitest not reached) | (vitest not reached) | **1** |
| baseline, same tree, the failing gate skipped | 649 passed, 3 skipped (652) | 10170 passed, 9 skipped (10179) | 0 |
| after this parcel, the same gate skipped | 650 passed, 3 skipped (653) | 10189 passed, 9 skipped (10198) | 0 |

`+19`, exactly the rows added, and one new file.

**THE BASELINE WAS NOT GREEN, AND NONE OF IT IS THIS PARCEL'S.** At master `5e104e95`, `npm test`
exits 1 in `check:doc-citations` before `vitest` is ever reached:

```
docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md:18
  docs/research/s2-compressed-act/2026-09-17-whole-zone-converter.md  [ABSENT]
```

That line was written by the S2-DONOR-PAGE notes at the tip of master, and it cites a path in the
AEON checkout without naming aeon on the line, so the gate resolves it against THIS repository's
`origin/master` and finds nothing. It is an inherited red, untouched here (a fix is a one-line
rewording in someone else's parcel, listed under "Open"), and every number above was measured with
that ONE gate skipped and the other thirteen plus `typecheck` plus `vitest` run in the normal order.
`failure-class: no failures in this run` both times. `tsc --noEmit` clean. Run in a LINKED WORKTREE,
so `test/support/sibling-root.test.ts` step 3 is unmeasurable here and is one of the 9 skips; the
other 8 are the same pre-existing opt-in and absent-tree skips the baseline reported.

## Red-first record

Rows committed BEFORE the fix, at `ba5e66c4`, and run with `npx vitest run` on the file: **19 failed
/ 0 passed**. Nothing was green at baseline, so no row was vacuously satisfied by the feature's
absence; each still got its own mutation. The fix landed at `cc39eb3f`: **19/19**.

Every mutation below was applied by `mutate.py`, which REFUSES unless its target text occurs exactly
once; each was SHOWN on disk with `git diff -U0` naming the file before the run, and restored with
`git show HEAD:<path> > <path>` from the COMMITTED baseline `cc39eb3f`. The runner refuses to start
on a dirty tree and reports the dirty-line count after each restore (0 every time). Each run also
carried `preset-delete-guard.test.ts`, so a mutation that broke the neighbouring guard could not pass
unnoticed.

| # | mutation, on disk | red |
|---|---|---|
| M1 | the region arm deleted from `deleteSceneRefusal` | 9 red: every region row except `[av-region]`, `[carve]`, `[dash]`. Preset file GREEN |
| M2 | `regionsBindingScene` asks `regionBindingValue(region, 'preset')` | 6 red, including `[ns]` and `[carve]` |
| M3 | the state-3 clause not pushed (unreadable answers null) | `[unread]`, `[unread-both]` only |
| M4 | the leftover-sidecar clause suppressed in region mode | `[both]`, `[both-solo]`, `[unread-both]` only |
| M5 | `&& !out.includes(region.id)` deleted | `[plural]`, `[carve]` only |
| M6 | `if (binders.length > 0)` -> `if (true as boolean)`, the region arm becomes a WALL | `[av-region]`, `[ns]`, `[both-solo]` |
| M7 | an em dash in the region clause | `[dash]` + `[ojz]` |
| M8 | `REGION_SCENE_BINDING_ROW` drifts from `BINDING_LABELS.scene` | `[ojz]`, `[plural]`, `[ctrl]` |
| M9 | the panel suppresses the guard in region mode, via a local NOT called `sceneModeRefusal` | `[gate]` alone |
| M10 | the panel drops the third argument | `[gate]` and the wiring row |
| M11 | `sectionsBindingScene` reads `rasterRef` instead of `sceneRef` | 8 red, including `[ns-sec]` |
| M12 | `if (bound.length === 0) return null` disabled, the section arm becomes a WALL | `[av]`, `[ns-sec]` |
| M13 | the section pointer becomes the preset's "in the Section dropdown above" | `[sec]`, `[sec-mode]`, `[ctrl]` |
| M14 | `sceneRefOptions` spells its own label instead of using the constant | `[ctrl]` alone |
| M15 | `sceneBindingListWords` drops the `and` | `[sec-plural]`, `[ns-sec]`, `[plural]`, `[both]` |
| M16 | the panel drops `disabled={deleteRefusal !== null}` | `[confirm]` and the wiring row |
| M17 | the panel drops the `<Hint>` | the wiring row alone |
| M18 | the button's `deleteSceneGuarded` replaced by an unguarded `run(null)` | `[confirm]` + the d-27 row in `src/renderer/components/__tests__/d27-act-and-drop-focus.test.ts` |
| M19 | `wiringAdvisory` in `BandPresetPanel.tsx` loses its `regionNotice` suppressor | `[gate]` HERE and `[gate]` in the preset file |

Every one of the 19 rows is red under at least one mutation.

### The gate row, and the method inherited rather than rediscovered

`[gate]`'s claim is made STRUCTURALLY from the first draft, because
`docs/reviews/2026-09-17-delete-preset-region-bound.md` recorded that its own first draft
(`not.toMatch(/regionNotice/)`) stayed GREEN under a suppressor spelled with any other local. The row
here asserts that the condition able to zero the derivation has the sorted identifier set
`['act', 'null', 'selected']`, so any suppressor under any name adds a fourth. **M9 applies exactly
the suppressor shape that defeated the preset's first draft, under a different local name, and it is
red.**

M19 is the instrument's own control. `[gate]` checks itself before it is trusted by running the same
extraction over a sibling verdict that IS suppressed in region mode, so a regex matching nothing
cannot read as "no suppressor here". **This panel has no region-mode-suppressed derivation of its
own**, so that positive control has to come from `BandPresetPanel.tsx`'s `wiringAdvisory`, and M19
removes that suppressor to prove the control is live rather than decorative.

**Retroactive pass (invariant e).** No proof method changed partway: every row above was established
by a mutation applied to the committed tree `cc39eb3f`, and every run tabulated here is one of those.
Nothing needed re-establishing.

## Open, and tagged for the foreground

1. **TAGGED: not checked on screen.** These rows read source and call the provider. Whether the
   Delete button is really greyed and the sentence really painted is the CDP harness's claim;
   Node/Vitest here cannot see React or a canvas. The on-screen check: open OJZ act 1 (region mode),
   Effects > Parallax, select `ojz_act1_depth` (region `sec4` binds it), expand `Scene: ...` and read
   the Delete button and the hint; then select a scene no region binds and confirm Delete is enabled;
   then on an act with no regions.json confirm the section sentence names Section assignment.
2. **TAGGED, and it applies to the PRESET panel identically: the sentence is inside a section that
   arrives COLLAPSED.** The Delete button sits in the `CollapsibleSection` header (always visible)
   and the `<Hint>` sits in its body, which is `defaultCollapsed`. So an author whose scene form is
   shut sees a greyed Delete with no reason beside it until they expand it. This parcel MIRRORED the
   preset panel rather than diverging from it, so the question is one row about both surfaces, not a
   scene defect: candidate row, "a disabled control's reason can be behind a disclosure".
3. **TAGGED: the state-3 screen.** The refusal disables Delete for EVERY scene on an act whose
   regions.json is refused. Worth one look that the Regions panel's own notice about that file is
   visible at the same time.
4. **FOUND, NOT FIXED (candidate row): the inherited baseline red.**
   `docs/reviews/2026-09-17-s2-donor-page-read-half-settled.md:18` cites an aeon path without naming
   aeon on the line, so `check:doc-citations` fails the whole suite at master `5e104e95`, before
   vitest runs. Not touched here: it is another parcel's document, the fix is a rewording of its
   line, and editing it from this branch would put an unrelated change in this parcel's diff.
5. **NOT DONE, deliberately: the agent surface is unguarded, on the preset's precedent.**
   `set_effects_scene` / the delete path in `src/renderer/agent/agent-handler.ts` calls
   `deleteSceneCommand` directly, as the preset side calls `deletePresetCommand` directly. If that
   precedent is ever revisited it should be revisited for BOTH documents at once, and
   `deleteSceneRefusal` is now available to whoever does.
6. **NOT DONE, deliberately: no ROADMAP row and no `docs/lane-log.jsonl` entry.** The overseer holds
   the queue row and the lane log; the ledger gate wants one clock read per entry with distinct
   seconds, so it is left to the landing rather than written from a worktree.

# Scene relation sentence in region mode (SCENE-RELATION-REGION-MODE, 2026-09-17)

Queue row `SCENE-RELATION-REGION-MODE`, booked by the overseer's on-screen check in
`docs/captures/2026-09-17-region-mode-b1-on-screen/README.md` (section "Found: the scene panel
still gives section-keyed advice in region mode"). Base: master `e760b693`. No emulator was used.

## The rule as built

`sceneSelectionRelation` in `src/renderer/providers/effects-aeon.ts` takes the act as an optional
fourth argument (`{ regions?: ActRegionsState }`, the same shape `sectionSceneBindRefusal` takes).
`src/renderer/components/effects/EffectsScenePanel.tsx` passes it.

- Mode: `actHasRegionsFile` from `src/core/formats/regions/act-regions.ts`, ruling B1's one
  predicate. No second region-mode test was written.
- Bindings: each region's own scene binding, read with `regionBindingValue(region, 'scene')` from
  `src/renderer/providers/regions-aeon.ts`, the reader behind the Regions panel's Bindings rows.
  Ids are listed once each, in author order (a carved region is several entries under one id and
  one panel row).
- A refused regions.json (`document` null, `unreadable` set) says the bindings cannot be told.
- Section mode is untouched: the old sentence and its silence-on-agreement are unchanged.

### Design calls

1. **No clause about the active section, and no silence on agreement, in region mode.** A section
   does not own a scene binding there, so "the active section's scene" has no referent.
   Rejected: mapping the active section to a region by geometry. Region rectangles need not sit
   on the section grid (`ojz_preset_night` in the OJZ fixture straddles x = 4096), and a region id
   spelled `secN` is a name, not a link to section N. A leftover sidecar `sceneRef` equal to the
   selection does not silence the sentence either: aeon's `check_mode_conflict` refuses that ref,
   so it decides nothing. The follow never moves in region mode (sidecar refs are null), so the
   sentence already showed whenever a scene was selected; no panel height is added.
2. **Only a region's own `sceneRef` counts as binding.** Rejected: listing regions with a null
   `sceneRef` as inheriting the act scene (the Regions panel badge reads `inherited (act: X)`).
   aeon's `tools/effects_gen.py` (origin/master `d6ec0c11`) lowers a null region `sceneRef` to
   `rg_parallax: 0`, which `Effects_ResolveParallax` resolves through the preset's parallax before
   the act's, so naming such a region as a user of the act scene would be a guess. OJZ act 1's
   project.json `sceneRef` is null, so this call changes nothing on that act's screen.
3. **Wording matches B1.** The pointer is B1's "the Regions panel, under Bindings". New strings
   carry no en or em dash, as the B1 strings do not.

## Wording

Section mode (unchanged), e.g.:

> Section 0 uses the act default scene. Edits below change canyon, which no section uses yet: bind it under SECTION ASSIGNMENT.

Region mode, before (measured on screen, OJZ act 1, section 3, `ojz_act1_depth` selected):

> Section 3 uses the act default scene. Edits below change ojz_act1_depth, which no section uses yet: bind it under SECTION ASSIGNMENT.

Region mode, after:

- one binder: "This act is in region mode: scenes are bound on its region rows, not on sections. Edits below change ojz_act1_depth, which region sec4 binds. To change which scene a region binds, use the Regions panel, under Bindings."
- several: "... Edits below change canyon, which regions b, c bind. To change which scene a region binds, use the Regions panel, under Bindings."
- none: "... Edits below change fresh_scene, which no region binds yet: bind it in the Regions panel, under Bindings."
- regions.json refused: "... Edits below change canyon. This act's regions.json could not be read, so Aurora cannot tell which regions bind it. The Regions panel says why."

## Fixtures

- `test/fixtures/regions/ojz_act1.regions.json`, vendored aeon blob `d7f45399` (provenance beside
  it). B1's review records the same blob as OJZ act 1's regions.json at aeon `c7ebe7a1`. The
  expected binder id is derived from the file (`sceneRef === 'ojz_act1_depth'`), not typed.
- Small in-test regions documents for the none, plural/carved, leftover-ref and refused cases.

## Tests (describe `sceneSelectionRelation in region mode: the bindings live on region rows`, in `src/renderer/providers/__tests__/effects-aeon.test.ts`)

1. names the region row that binds the selected scene, on OJZ act 1 as measured
2. says no region binds a scene none binds, and points at the Regions panel
3. lists every binding region id once, in author order, with the plural verb
4. is not silenced by a leftover sidecar sceneRef naming the selected scene
5. says which regions bind it cannot be told when regions.json was refused
6. keeps the section-mode sentence when the act has no regions file
7. carries no en dash or em dash in any region-mode sentence

## Red-first record

- **The bug itself.** Rows 1 to 7 committed first (`test(...)` commit) against the unfixed code:
  rows 1 to 5 red, 6 and 7 green. Row 1 received exactly the on-screen sentence: "Section 3 uses
  the act default scene. Edits below change ojz_act1_depth, which no section uses yet: bind it
  under SECTION ASSIGNMENT." After the fix: 190 of 190 in the file.
- **Row 6** (green before the fix, a control). Mutation, shown with `git diff`:
  `if (regions !== undefined && actHasRegionsFile(regions)) {` became `if (regions !== undefined) {`.
  Row 6 alone went red (1 failed, 189 passed). Restored with `git show HEAD:<path> > <path>`.
- **Row 7** (green before the fix). Mutation: the lead string became
  `'— This act is in region mode: ...'`. Rows 1 to 5 and 7 went red (6 failed). Row 7 cannot
  be isolated: every region-mode sentence is also pinned exactly by rows 1 to 5. Restored the same way.
- **Row 3's dedupe.** Mutation: `=== selectedSceneId && !binders.includes(region.id)) {` became
  `=== selectedSceneId) {`. Row 3 alone went red. Restored the same way.

## Other wrong advice in region mode (found, NOT fixed; candidate rows)

1. `src/renderer/providers/effects-aeon.ts:3157`, `layerCountLine`: "(per scene; scenes are assigned
   per section)", painted under LAYERS at `EffectsScenePanel.tsx:649` (visible in the capture
   `region-mode-parallax-scene-panel.png`), with the title "a section can bind its own scene".
   False in region mode.
2. `EffectsScenePanel.tsx:1645` passes `act.sections` to `reelsBindingAdvisories`
   (`effects-aeon.ts:4785`), which calls `advisoryReelsBinding` (`src/core/formats/effects/scene.ts:932`).
   In region mode every sidecar ref is null, so a scene with `reels` gets "no section in this
   project names X in its sceneRef" even when a region binds it at rung 1.
3. `EffectsScenePanel.tsx:1947`, `vDeformRampAdvisory(selected.id, act.sections, act.sceneRef, ...)`
   (`src/renderer/providers/effects-preset.ts:3908`), whose sentence resolves bindings per section
   and can say a section "takes the act default and this act names no editor scene"
   (`src/core/formats/effects/ramp-scroll-mode.ts:284`). Section-keyed in region mode.
4. `EffectsScenePanel.tsx:2002`, SECTION ASSIGNMENT on an empty section: "Section N is empty: nothing
   to assign a scene to." In region mode the B1 refusal is skipped there (`sceneModeRefusal` is
   null when the section is null), so this implies a non-empty section could take a scene. Low.
5. Not wrong advice, but inert: `sceneSelectionFollow` / `sceneSelectionFollowStep`
   (`effects-aeon.ts:3565`, `:3634`) follow the sidecar `sceneRef`, which is always null in region
   mode, so picking a section never moves the scene selection there. Silent, so it states nothing
   false. Recorded so nobody reads the silence as region-aware.

## On-screen checks for the overseer

- OJZ act 1 (region mode), Effects > Parallax, Editing Section 3, select `ojz_act1_depth` in Scenes:
  the warning under the list reads the one-binder sentence above naming `sec4`, with no "act
  default", no "no section uses", no SECTION ASSIGNMENT.
- Same act, select `ojz_act1_start` (bound by `sec0`) and a scene no region binds (for example one
  created with New): the `sec0` sentence, then the "no region binds yet" sentence.
- Same act, pick another section in the Editing select: the sentence does not change (it is not
  section-keyed in this mode).
- Control, a section-mode act (any act without regions.json): select a scene the active section
  does not use; the old "Section N uses ... Edits below change ..." sentence is unchanged, and
  selecting the section's own scene shows no sentence.

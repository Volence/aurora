# The rest of the region-mode advice (SCENE-RELATION-REGION-MODE-REST, 2026-09-18)

The four candidate rows the shipped parcel found and did not fix, listed in
`docs/reviews/2026-09-17-scene-relation-region-mode.md` under "Other wrong advice in region
mode". Items 1, 2, 3 and 4 are fixed here. Item 5 is left alone deliberately: it is a
silence that states nothing false, and it is recorded there so nobody reads that silence as
region-awareness.

Base: master `f0fd9767`. Commits: `426dfa66` (tests, red first), `9233d9eb` (the fix).
No emulator. No CDP harness: all four subjects are pure string functions.

## What the tree said that the packet did not

The packet's line numbers are 2026-09-17 and every path here was re-derived by grepping the
symbol. Two of its statements did not survive that.

1. **Item 3 cites the wrong sentence.** "a section takes the act default and this act names
   no editor scene" is `unknownClause`'s `act-unset` arm inside `rampScrollModeSentence`,
   and `rampScrollModeSentence` is reachable only from `BandPresetPanel.tsx`. The scene
   panel's `vDeformRampAdvisory` goes through `vDeformRampSentence`, whose only unknown
   reasons are `preset-dangling` and `preset-unreadable`. That clause cannot appear on the
   surface item 3 names.
2. **The real item-3 defect is ATTRIBUTION, and it is still a defect.**
   `vDeformRampBindings` produces a row only for a section with a `rasterRef`, and a section
   sidecar `rasterRef` beside regions.json is exactly what aeon's `check_mode_conflict`
   refuses (`sectionRasterBindRefusal` is the editor half of that rule). It then reaches the
   scene through `sectionSceneRef`'s act-default fallback, which attributes the binding to a
   section that owns none. So on a region-mode act **every row that function can produce
   rests on a ref the build rejects**, and the sentence named a section, a preset and a
   consequence that the act's own regions.json contradicts.
3. **Item 2 is stronger than "unhelpful".** On a region-mode act every section sidecar
   `sceneRef` is null, so the section lookup found no binder and warned on **every scene of
   the act** — loudest on the one a region binds at rung 1, which is the case aeon's
   generator accepts. The warning fired hardest on the compliant document.

Item 4's "Low" rating came with permission to leave it if a proper fix needed a design call.
It did not: it is the shipped parcel's design call 1 (no clause that treats a section as the
owner of a binding) applied to the one branch the B1 refusal never reached, because
`sectionSceneBindRefusal` needs a section to name and that branch has none.

## The rule as built

Every design constraint is the shipped parcel's, unchanged and not re-litigated: one mode
predicate (`actHasRegionsFile`), only a region's **own** ref read through
`regionBindingValue`, ids listed once each in author order, a refused `regions.json` says the
bindings **cannot be told**, no geometry anywhere, section mode untouched, no en or em dash.

- **Item 1** — `layerCountLine` takes the act; `layerCountTitle` is new.
  "(per scene; scenes are assigned per section)" becomes "(per scene; scenes are bound on
  region rows)", and the hover "a section can bind its own scene" becomes "a region can bind
  its own scene". **The cap half never moves**: `MAX_PARALLAX_BANDS` is per SCENE in both
  modes. The hover was a JSX literal in `EffectsScenePanel.tsx`, one attribute from the line
  it explains and invisible to every provider test; it is a provider function now.
- **Item 2** — `reelsBindingAdvisories` takes the act. The codec keeps **one** copy of aeon's
  mechanism sentence: `reelsBindingWarning(id, 'section' | 'region')` plus the shared
  `REELS_BINDING_ADVICE_TAIL`, which is the half that says this is advice, that saving is not
  blocked, and that its silence is not a clearance. The codec is handed a **word**, not a
  document: it gains no `Region` type, no regions schema and no mode predicate.
  There is no empty-list arm on the region side, and that is derived: `regions` is
  `minItems: 1`, so "this act has no regions at all" is not a state.
- **Item 3** — `vDeformRampAdvisory` takes the act and, in region mode, walks regions
  (`vDeformRampRegionBindings`) rather than sections. `vDeformRampSentenceFor` is the one
  composition of that sentence; the two arms differ only in the binder noun.
  A null region `rasterRef` is not "inherits the act raster" for the same reason a null
  `sceneRef` is not "inherits the act scene".
- **Item 4** — `sectionAssignmentEmptyHint`. The region arm leads with the mode, which holds
  on every slot, and says in as many words that the emptiness is **not** why the panel binds
  nothing; it still names the slot, so the missing select is explained too.
  `REGION_MODE_SCENE_LEAD` is hoisted and exported so the two sentences an author meets
  within one screen cannot drift.

## Wording

- LAYERS, region mode: `1 of 16 layers (per scene; scenes are bound on region rows)`, hover
  `a region can bind its own scene`.
- Reels, no region binds it: "EDITOR-SIDE WARNING, not the refusal: no region in this act
  names "X" in its sceneRef, and aeon's generator refuses a reels key on a scene whose
  regions resolve through a preset or the act default instead of an editor sceneRef (...
  unique only for a sceneRef-bound region). Saving is not blocked, ..."
- Reels, regions.json refused: "... this act is in region mode and its regions.json could not
  be read, so Aurora cannot tell whether a region binds "X" in its sceneRef ... The Regions
  panel says why the file was refused. Saving is not blocked, ..."
- V deform, region binds a ramp preset: "THIS NARROWS A RAMP ELSEWHERE: V deform puts VSRAM
  in per-column mode, and Region sec4 binds this scene and preset "r1", whose VSRAM ramp
  therefore scrolls a single 16-pixel column instead of the full width. ..."
- V deform, regions.json refused: "THIS MAY NARROW A RAMP ELSEWHERE, AURORA CANNOT READ THIS
  ACT'S REGIONS: ... which regions bind this scene, and which raster presets those regions
  bind, are both unknown. ... The Regions panel says why the file was refused."
- SECTION ASSIGNMENT, empty slot in region mode: "This act is in region mode: scenes are
  bound on its region rows, not on sections. Section 3 is empty as well, but that is not why
  this panel binds nothing: no section of this act takes a scene. To bind one, use the
  Regions panel, under Bindings."

## Fixtures

- `test/fixtures/regions/ojz_act1.regions.json` (the vendored aeon blob, provenance beside
  it) for row `[c10]`, whose expectation is **read out of the file**: no region of that act
  carries a `sceneRef` and a `rasterRef` at once, so no region can both bind a scene and
  narrow a ramp, and every scene that IS bound there answers null. A re-vendor that added one
  flips the row rather than leaving a stale pin green.
- Small in-test regions documents for the none / carved-plural / leftover-ref / refused
  cases, exactly as the shipped parcel did.

## Rows

`[r1]`-`[r7]` in `src/renderer/providers/__tests__/effects-aeon.test.ts`,
`[g1]`-`[g8]` in `test/formats/effects-reels-panel.test.ts`,
`[c1]`-`[c11]` in `src/renderer/providers/__tests__/effects-preset-vdeform-ramp.test.ts`.

## Red-first record

**The bug itself.** All 26 rows were committed first (`426dfa66`) against the unfixed tree.
Measured there, over the three files: **20 failed | 251 passed (271)**.
Red: `[r1]`-`[r7]`, `[g1]` `[g2]` `[g4]` `[g5]`, `[c1]`-`[c8]` and `[c11]`.
Green there, and two of them **vacuously** so: `[g3]` (the section arm also returned one
message, so it meant nothing until the fix) and `[c10]` (the act argument was ignored and an
empty section list returned null anyway). `[g7]` and `[c9]` are the real section-mode
controls; `[g6]`, `[g8]` are gates.
After the fix: **271 of 271** over the same three files.

**Narrow mutations**, each applied to the committed baseline, shown by `git diff -U0`, run,
then restored with `git show HEAD:<path> > <path>` and re-checked clean with
`git status --porcelain`. Every one went red.

| mutation | the line as it read on disk | red |
|---|---|---|
| m1 | `? 'scenes are assigned per section' : 'scenes are assigned per section'})\`;` | r1, r2 |
| m2 | `? 'a section can bind its own scene' : 'a section can bind its own scene';` | r2, r3 |
| m3 | `if (true) {` (the empty hint's mode test) | r5 |
| m18 | `Section ${sectionIndex} is empty; nothing to assign a scene to.` | r4 |
| m19 | `That slot is empty as well, but that is not ` | r5, r6 |
| m20 | an en dash planted in `REGION_MODE_SCENE_LEAD` | r7 + 6 shipped rows |
| m4 | `if (false) return [];` (the reels binder test) | g1 |
| m5 | `if (regions.document.regions.length > 0) return [];` | g2, g3, g4 |
| m6 | `return [reelsBindingWarning(scene.id, 'section')];` | g2, g4 |
| m7 | the refused arm returning the negative-case sentence | g5 |
| m8 | the `scene.reels === undefined` gate deleted | g6 |
| m9 | `if (regions !== undefined) {` (the reels mode predicate) | g7 |
| m21 | an em dash planted in the refused reels sentence | g8 |
| m10 | `if (false) continue;` (the one-row-per-id dedupe) | c4 |
| m11 | `if (false) continue;` (the null-rasterRef skip) | c5, c10 |
| m12 | a null region `sceneRef` treated as naming this scene | c5, c10 |
| m13 | `reason: 'preset-dangling',` unconditionally | c6 |
| m14 | `if (regions.document === null) return null;` | c8 |
| m15 | `if (regions !== undefined) {` (the ramp mode predicate) | c9 |
| m16 | the region binder vocabulary set to the section words | c2, c4, c6 |
| m17 | the region arm replaced by the section walk | c1, c2, c7, c11 |
| m22 | the region sentence composed a second time | c3 |
| m23 | an en dash planted in the refused-regions ramp sentence | c11 |

**Three rows that could not be isolated, and one that is deliberately blind.**

- `[r7]` cannot be isolated, for the shipped packet's own row-7 reason: every region-mode
  sentence built on `REGION_MODE_SCENE_LEAD` is also pinned exactly by the shipped parcel's
  rows, so planting a dash in the lead reds seven rows at once.
- `[c5]` and `[c10]` cannot be separated from each other. Both mutations that make a
  not-a-binding into a binding (m11, m12) red both, because `[c10]`'s derivation from the OJZ
  file is precisely that no region there carries both refs. They are one claim with two
  entrances, and `[c10]`'s value is that its inputs come off disk rather than out of a test.
- `[c3]` is **green under m16**, and that is correct rather than a defect: it normalises the
  binder nouns before comparing, so a vocabulary swap is invisible to it by construction. The
  vocabulary is held by `[c2]`, `[c4]` and `[c6]`; `[c3]` holds that there is one sentence
  body, and m22 is the mutation that reds it.

## Verification

- `npm test`: **650 passed | 3 skipped files (653); 10215 passed | 9 skipped tests (10224);
  0 failed.** Master's baseline before this parcel was 10190 passed | 8 skipped; the 26 rows
  here account for the difference.
- The ninth skip is `test/support/sibling-root.test.ts` step 3, which names a **linked
  worktree** as its reason and is not this parcel's. It closes when the suite runs from the
  main checkout.
- `npm run typecheck` clean.

## On-screen checks for the overseer

Not run here: this lane does not drive the app. All four are pure string functions and the
node suite can reach every arm, but only a real screen can say they are PAINTED.

- OJZ act 1 (region mode), Effects > Parallax: the line under LAYERS reads "(per scene;
  scenes are bound on region rows)" and its hover says "a region can bind its own scene".
- Same act, select a scene with a `reels` key: no binding warning on `ojz_act1_depth` (region
  `sec4` binds it), and the region-worded warning on a scene no region binds.
- Same act, a scene carrying `v_deform`: no section is named in the V-deform sentence.
- Same act, move the Editing select to an act slot with no section: the SECTION ASSIGNMENT
  hint leads with the region-mode sentence and no longer implies a populated section could
  take a scene.
- Control, a section-mode act: all four sentences are the ones that shipped.

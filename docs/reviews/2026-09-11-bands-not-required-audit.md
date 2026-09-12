# Bands-not-required audit: does any Aurora code still assume a preset has `bands`?

2026-09-11, branch `parcel/bands-not-required-audit`, base aurora `ba727d1e`.

## The answer

**Nothing crashes, and the type system forces a guard at every direct read.** The escapes are nine
`bands ?? []` sites. They don't crash, and they render a ramp, base_swap or boundary preset as an
empty band list. Six of them are correct: each sits beside a program-aware answer
(`presetProgramArm` / `bandControlsRefusal`). **Three mislead:**

- **F1, FIXED.** The agent tool `list_effects_presets` reported a non-bands preset as `bands: 0` with
  nothing beside it. The reply now carries `program`.
- **F2, OPEN (a look ruling is needed).** The raster timeline paints a non-bands preset as an empty
  column headed `bands`, and it drops "palette bands" from its never-empty honesty line because *a
  preset is selected*, not because its bands are drawn.
- **F3, OPEN (harness-facing, not an author surface).** The debug hook `presets()` has the same shape
  F1 had.

Separately, one sentence that says "a preset document authored here carries bands" is stale wording
(F4, OPEN).

## The facts relied on, re-checked here

| Fact | How it was checked |
|---|---|
| Aurora's vendored schema is byte-identical to the contract | `git hash-object src/core/formats/effects/aurora-effects-preset.schema.json` and `git -C <empyrean> rev-parse origin/main:contract/schema/aurora-effects-preset.schema.json` both print `b4cec60553929ac32330e3c33b0af6ee4012efe2` |
| Top-level `required` is `["schema","id"]`, and `oneOf` takes exactly one of `bands`, `ramp`, `base_swap`, `boundary` | read from the vendored schema: `required ['schema', 'id']`, `oneOf [{required:[bands]},{required:[ramp]},{required:[base_swap]},{required:[boundary]}]` |
| The hub's correction | empyrean `origin/main:docs/AURORA_EFFECTS_SCHEMA.md` lines 1072-1092: "CORRECTED 2026-09-11 … a document carries exactly one raster program (`bands`, `ramp`, `base_swap` or `boundary`), and `cycles` and `variants` ride on one, never alone" |
| The codec knows it | `src/core/formats/effects/preset.ts` `presetProgramArm` (l.1031) and `presetRasterChannel` (l.1054). The docblock at l.1043-1045 says code that must branch "asks HERE rather than testing `bands` for undefined". `json-schema-subset.ts` l.600-640 selects exactly one `oneOf` branch when canonicalizing. |

## Do the types already make this safe?

**Yes for direct reads, and that was measured.** `EffectsPreset.bands` is optional
(`preset.ts:595`, `bands?: EffectsPresetBand[]`). The docblock at l.586-594 says why it is optional
and not a discriminated union. `tsconfig.json:6` is `"strict": true`.

- **Plant.** Line 481 of `src/renderer/canvas/raster-timeline.ts` was mutated on disk from
  `(preset.bands ?? []).map(` to `preset.bands.map(`, and the diff was shown. `npx tsc --noEmit` then
  gave **exit 2, one error**: `raster-timeline.ts(481,10): error TS18048: 'preset.bands' is possibly
  'undefined'`.
- **Restore and control.** The file was restored with `git checkout ba727d1e -- …`, then tsc was
  re-run: **exit 0, 0 errors**.

So the audit only has to cover escapes, and each kind was queried separately:

| Escape shape | Query | Hits in `src/` (tests excluded) |
|---|---|---|
| `bands ?? []` (default-empty) | `grep -rnE 'bands \?\? \[\]'` | **9** code sites (plus one comment, `effects-preset.ts:1156`). All nine are classified below. |
| `!` non-null on bands | `grep 'bands!\|bands\]!'` and a read of every `.bands` line | 1: `RasterTimelineStrip.tsx:194`, `preset.bands[drag.index]!`. It is guarded by `preset?.bands?.[drag.index]` in the same `&&` on l.193, so it is safe. |
| casts | `grep 'as EffectsPreset\b\|as any'` | 1: `preset.ts:2112`, `obj as unknown as EffectsPreset`. It comes after schema validation (pass-through). Separately, `effects-preset.ts:5861` deletes keys through a `Record` cast inside a loop over `EFFECTS_PRESET_PROGRAM_ARMS`, which is correct. |
| string-keyed `['bands']` / `'bands' in` | `grep -rnE "\[['\"]bands['\"]\]\|['\"]bands['\"] *(in\|:)\|get\(['\"]bands['\"]\)"` | **0**. The query is live: the same pattern finds 5 hits in `agent-handler.effects-preset.test.ts`. |
| untyped JSON pass-through | a read of every consumer below | only `get-effects-preset` (the whole document, by design) and `presetsJson()` (the debug hook, a JSON string) |

## Enumeration: by what touches the data

**The type.** `EffectsPreset` (`preset.ts:575`) is the only document type. `EffectsPresetLibrary`
holds the parsed list, and `parseEffectsPreset` / `loadEffectsPresetLibrary` produce it.

**Every file that names the type or the library, or reaches `project.effectsPresets`** (both greps,
tests excluded):
`core/editing/commands.ts`, `core/editing/history.ts`, `core/formats/effects/boundary.ts`,
`core/formats/effects/preset.ts`, `core/formats/effects/section-wiring.ts`,
`core/formats/section-meta.ts`, `core/model/s4-types.ts`, `core/project/adapter.ts`,
`core/project/aeon/load.ts`, `core/project/aeon/save.ts`, `main/editor-methods.ts`,
`renderer/agent/agent-handler.ts`, `renderer/canvas/raster-timeline.ts`,
`renderer/components/effects/BandPresetPanel.tsx`, `renderer/components/effects/EffectsScenePanel.tsx`,
`renderer/components/effects/RasterTimelineStrip.tsx`, `renderer/components/effects/SectionPicker.tsx`,
`renderer/providers/effects-preset.ts`, `renderer/shell/effects-delete-guard.ts`,
`renderer/state/aeon-save.ts`, `renderer/state/projectStore.ts`, `renderer/debug-hooks.ts`,
`renderer/workspace/facets/effects-facet.tsx`, `shared/agent-protocol.ts`.

### Which `bands` each file means

About half of the `bands` hits are other concepts. Each file with a hit (`grep -rcw bands src`) was
put in one bucket before it was audited:

| Bucket | Files |
|---|---|
| **Effects-preset `bands`** (audited below) | `providers/effects-preset.ts`, `canvas/raster-timeline.ts` (preset column only), `components/effects/BandPresetPanel.tsx`, `components/effects/RasterTimelineStrip.tsx`, `agent/agent-handler.ts` (l.986-1150), `main/editor-methods.ts` (l.427-434), `debug-hooks.ts` (l.880-895, 1509-1520), `core/formats/effects/preset.ts`, `json-schema-subset.ts`, `section-wiring.ts` (l.554, 640), `providers/effects-sub-tabs.ts` (l.95, a section id only) |
| **BgAnim bands** (background tile animations, a separate document) | `core/formats/bg-override/*`, `bg-anim-*.ts`, `bganim-preview*.ts`, `BgAnimBandPanel.tsx`, `BgAnimPreviewRenderer.ts`, `BgAnimPreviewStrip.tsx`, `core/editing/bg-override-band.ts`, `bg-override-art.ts`, `band-strip-range.ts`, `band-follow.ts`, `band-coverage.ts`, `tile-picker-source.ts`, `band-verbs.ts`, `state/viewStore.ts`, `MapViewport.tsx` l.309-311 and 2461-2480 (`documentBands`), `agent-handler.ts` l.1193-1302, `editor-methods.ts` l.508-520, `agent-protocol.ts` l.152-165, `debug-hooks.ts` l.1048-1075 and 1563, `effects-sub-tabs.ts` l.104 |
| **Scene layer bands** (`CameraPreviewPlan.bands`, the parallax layers) | `canvas/camera-preview.ts`, `raster-timeline.ts` l.304, 571 and 719 (the layer column), `MapViewport.tsx` l.697, 1365-1385 and 1831, `debug-hooks.ts` l.952 |
| **Patch-channel bands** (`aeon-effects-channel-bands.json`) | `core/formats/effects/channel-bands.ts`, `boundary.ts` l.26-119, `effects-aeon.ts` l.40 |
| **Prose, or an unrelated word** | `canvas-constraints.ts` (tile-grid bands), `ArtBrowser.tsx` (a DOM id), `ArtToolOptions.tsx` (swatch bands), `guides.ts`, `scene-ui.ts`, `curve-rate.ts`, `raster-binding.ts`, `s4-types.ts`, `EffectsToolOptions.tsx`, `EffectsScenePanel.tsx` l.1790, `row-remap-span.ts`, `band-lens.ts`, `commands.ts` l.337, `effects-facet.tsx`, `effects-aeon.ts` l.1821 and 4688, `preset-lag.ts`, `ramp-scroll-mode.ts` l.426 |

`preset-lag.ts` and `ramp-scroll-mode.ts` are prose-only. That is confirmed by a grep for code-level
`.bands` accesses (`grep -rnE '\.bands\b'`, comment lines excluded), which lists no line in either
file.

### Per-site verdicts (effects-preset bucket)

Bins: **branch** (behaviour decided on the program), **pass-through**, **display** (shows someone
something derived from it).

| Site | Bin | Verdict on a ramp / base_swap / boundary preset |
|---|---|---|
| `preset.ts:2094` parse, `if (Array.isArray(obj.bands))` | branch | guarded, correct |
| `preset.ts:2112` post-validation cast | pass-through | correct: the `oneOf` is enforced before it |
| `preset.ts:1031/1054` `presetProgramArm` / `presetRasterChannel` | branch | the helpers themselves |
| `json-schema-subset.ts:617-640` canonicalize `oneOf` | branch | selects exactly one arm, and throws on 0 or 2 |
| `serializeEffectsPreset` / `save.ts:597-611` / `history.ts:187,405` / `load.ts:1083` / `adapter.ts:293` / `commands.ts` / `effects-delete-guard.ts:88` / `aeon-save.ts:161-163` | pass-through | whole documents or paths; no `bands` read |
| `effects-preset.ts:649-650` `presetListEntries` count + `channel: presetProgramArm(p)` | display | **correct: POSITIVE CONTROL** (below) |
| `effects-preset.ts:670-675` `presetListSummary` | display | correct: a positive test on `'bands'`, the noun otherwise |
| `effects-preset.ts:1123` `addBandCommand` (`if (!p.bands) return`) | branch | no-op, and the chip is disabled with `bandControlsRefusal`'s sentence (`BandPresetPanel.tsx:734-739`) |
| `effects-preset.ts:1140-1144` `removeBandCommand` (`?? []` index bound) | branch | refuses, correct |
| `effects-preset.ts:1164-1171` `lastBandRefusal` (`?? []` at 1167) | display | correct: asks `bandControlsRefusal` first (l.1165), so the program's reason is shown and not "its only raster band" |
| `effects-preset.ts:1178/1199/1214/1350/1459` band-field commands (`p.bands?.[index]`) | pass-through | no-op |
| `effects-preset.ts:2253-2289` `bandCollisionAdvisory` (`?? []`) | display | null, correct: there is no band to collide |
| `effects-preset.ts:2354-2373` `splitBandCommand` | branch | null, correct |
| `effects-preset.ts:5453-5493` `bandControlsRefusal` | branch | correct: a positive test `arm === 'bands'` on `presetProgramArm` (l.5462, 5470) |
| `effects-preset.ts:5797-5826` `programArmSwapAdvisory` (`?? []` at 5799) | display | correct: the count is used only when the arm is `bands` or null (l.5810) |
| `effects-preset.ts:5843-5871` `setProgramArmCommand` | branch | correct: deletes every other arm of `EFFECTS_PRESET_PROGRAM_ARMS` |
| `BandPresetPanel.tsx:453` list row via `presetListSummary` | display | correct |
| `BandPresetPanel.tsx:702-712` Program select, `presetProgramArm(selected)` | display | correct |
| `BandPresetPanel.tsx:714` `(selected.bands ?? []).map(BandCard)` | display | correct: zero cards, with the arm's own card at l.751-762 and the refusal hint at l.737-739 |
| `raster-timeline.ts:477-502` `rasterTimelinePresetRows` (`?? []` at 481) | display | **F2**: zero rows under a `bands` header |
| `raster-timeline.ts:616` `absent: rasterTimelineAbsences(preset !== null)` | branch | **F2**: branches on a preset being *selected*, not on its program being drawn |
| `raster-timeline.ts:695` header `presetId === null ? 'no preset' : 'bands'` | display | **F2** |
| `raster-timeline.ts:559` `presetDragFor` (`preset?.bands?.[index]`) | pass-through | null, correct |
| `RasterTimelineStrip.tsx:132, 187` any selected preset is handed to the view | pass-through | feeds F2 |
| `RasterTimelineStrip.tsx:193-194, 201, 222, 233` gesture guards | pass-through | no-op; the l.194 `!` is guarded (above) |
| `RasterTimelineStrip.tsx:383` `title={preset === null ? undefined : RASTER_TIMELINE_GESTURES}` | display | **F2**: tells the author to "Drag a band edge in the left column" over a column with no bands |
| `agent-handler.ts:1041-1045` `list-effects-presets` | display (to an agent) | **F1, FIXED** |
| `editor-methods.ts:427-434` the `list_effects_presets` description, "band count" | display (to an agent) | **F1, updated** |
| `agent-handler.ts:1073-1085` `get-effects-preset` | pass-through | the whole document |
| `agent-handler.ts:1087+` `set-effects-preset` | pass-through | validated by `parseEffectsPreset`, so the `oneOf` is enforced |
| `debug-hooks.ts:1509-1513` `presets()` → `{id, name, bands}` | display (to a harness) | **F3, OPEN** |
| `debug-hooks.ts:1514-1515` `presetsJson()` | pass-through | the whole document |
| `SectionPicker.tsx:239-243` `boundDoc` → `sectionExtraChannelsCondition` | pass-through | reads only `cycles`, `variants` and `patch_*` (`ChannelBearingDocument`, `section-wiring.ts:922-927`) |
| `EffectsScenePanel.tsx:1949-1953` → `vDeformRampAdvisory` | branch | on `ramp`, not on `bands` |
| `boundary.ts:165, 195` | branch | on `boundary` |
| `section-wiring.ts:631-649` `sectionArmExclusivityRefusal` sentence | display | **F4, OPEN (wording)** |
| `effects-sub-tabs.ts:95` `'aeon.effects.preset.bands'` | pass-through | a section id |
| `agent-protocol.ts:148-151` | pass-through | request kinds; there is no reply type |

## Real inputs

aeon `origin/master` at `7577daeef74cf66af5ec3efde2838d958b9f2c33` ships six preset documents under
`games/sonic4/data/editor/effects/presets/`, all read via `git show`. **Three carry no `bands`:**

- `aurora_ramp_witness.json` (`ramp`)
- `ramp_probe.json` (`ramp`)
- `ojz_sec6_baseswap.json` (`base_swap`)

`authored_probe`, `ojz_sec3_shimmer` and `ojz_sec5_showcase` carry bands. **aeon ships no `boundary`
preset file.**

Aurora already vendors all six:

- **Golden fixture.** `test/fixtures/effects/preset-canonical-golden.json` holds them, from aeon
  `f8beaad0`. Both ramps' content was compared against aeon's current bytes (`JSON.parse` equality):
  both are equal.
- **base_swap fixture.** `test/fixtures/effects/ojz_sec6_baseswap.json` has blob `9cdf62d4`, the
  same object as aeon's current file.

Every row here uses those **real** documents. For the fourth arm, the rows use the contract's own
boundary vector (`effects-preset-vectors.json` case 17, `ojz_water_boundary`, "the shipped moving
water").

## Findings

### F1: `list_effects_presets` reported a non-bands preset as `bands: 0` (FIXED)

**Before.** At `ba727d1e`, `agent-handler.ts:1041-1045` returned `{ id, name, bands: (p.bands ?? []).length }`
and nothing else.

- **What an agent saw.** For `ramp_probe` the row was `{id:'ramp_probe', name:…, bands:0}`. The
  schema says a zero-band list cannot exist (`minItems: 1`), and the MCP description promised "id,
  name and band count".
- **Why it's a defect.** This is exactly the defect the panel's own row was fixed for.
  `presetListSummary`'s docblock (l.654-669) says "0 bands … reads as a broken or half-authored
  preset rather than a different kind of one". The agent's copy of the list was never fixed.

**Fix (one obvious answer: the codec's own function, and the panel's own precedent).** The reply
gains `program: presetProgramArm(p)`, the value `PresetListEntry.channel` already reads.

- It is the program ARM, so a boundary document gets `'boundary'` rather than null.
- The count is left alone.
- The MCP description now says the reply names the program, and that a non-bands preset's count is
  0 without being empty.
- Two existing rows that pinned the reply shape with `toEqual` gained `program: 'bands'`. Both of
  their fixtures carry a `bands` key.
- The field is named `program`, not `channel`, after the panel's "Program" row and the function.
  That is the only naming choice in the fix, and it is not author-visible.

**Red-first, on real documents.** `agent-handler.effects-preset.test.ts`, describe "list_effects_presets
on presets that carry no bands", 2 rows:

- The non-bands row loads `ramp_probe`, `aurora_ramp_witness`, `ojz_sec6_baseswap` and the boundary
  vector, and first asserts that the set covers every non-bands arm of the schema.
- The control row checks that a bands preset gets `program: 'bands'`.

| Stage | Result |
|---|---|
| Red at commit `7b32b6d3` | **2 failed**: `ramp_probe carries ramp: expected undefined to be 'ramp'` and `expected undefined to be 'bands'` |
| Green at `c98624a6` | **39/39** across `agent-handler.effects-preset.test.ts` and `agent-handler.assign-section-preset.test.ts` |
| Plant: the `program:` line deleted on disk (diff shown) | **3 failed**: the two new rows plus the updated `toEqual` row |
| Restore: `git checkout c98624a6 -- src/renderer/agent/agent-handler.ts` | tree clean |

### F2: the raster timeline paints a non-bands preset as an empty `bands` column (OPEN: look ruling)

When a ramp, base_swap or boundary preset is selected, `rasterTimelineView` produces three results:

- `presetBands`: `[]`. `rasterTimelinePresetRows` maps `preset.bands ?? []` (l.481).
- Header: the preset column is headed **`bands`** (l.695, `presetId === null ? 'no preset' : 'bands'`).
- `absent`: `['per-line deform']`, because `rasterTimelineAbsences(preset !== null)` (l.616) drops
  "palette bands" whenever a preset is **selected**.

The docblock at l.413-417 gives the intent: "true only when there is no preset to draw". The flag
conflates "a preset is selected" with "its program is drawn".

**Effect.** The strip's never-empty "not drawn" line for a base_swap or boundary preset is the line a
fully drawn band preset gets, while the column draws nothing of that program. The canvas tooltip also
says "Drag a band edge in the left column" (`RasterTimelineStrip.tsx:383`), over a column with no
band to drag. For a ramp, "per-line deform" arguably covers the ramp's per-line VSRAM run. For
base_swap and boundary it does not.

**Repro (real documents).** `src/renderer/canvas/__tests__/raster-timeline-non-bands-preset.test.ts`:

- Per document, a PRECONDITION row asserts `presetId` is the document's id (the preset reached the
  view) and that the column is empty.
- A **DEFECT** row asserts `absent` differs from `rasterTimelineAbsences(true)`, the line shown when
  the bands ARE drawn.
- A **CONTROL** row checks that `authored_probe` draws 2 rows and does get that line, and that the
  two lines differ, so the comparison discriminates.

| Stage | Result |
|---|---|
| Red-first: DEFECT rows run as plain `it` on the committed file (`it.fails(` → `it(` on disk, diff shown) | **4 failed**, every one `expected [ 'per-line deform' ] to not deeply equal [ 'per-line deform' ]` |
| Restore: `git checkout 7b32b6d3 -- <file>` | back to `it.fails` |

**Why `it.fails` and not a fix.** Every fix changes what an author reads on the canvas. That is the
brief's STOP condition, so none is picked here.

- The DEFECT rows are committed as `it.fails`. They pass while the defect stands and go red the day
  any fix lands, and whoever lands it turns them into plain `it`.
- `it.fails` passes on *any* failure. So the documents load at module scope (a loader error fails
  the file), and every precondition is its own plain row.

| Stage | Result |
|---|---|
| Plant: candidate (a) applied on disk to `raster-timeline.ts:616` (diff shown) | **4 failed** (`Expect test to fail`) in this file |
| Same run, existing `raster-timeline.test.ts` | stayed green: **63 passed** across the two files |
| Restore: `git checkout c98624a6 -- src/renderer/canvas/raster-timeline.ts` | tree clean |

**The options, for the ruling. Not picked.**

- **(a) Key the absence flag on the program.** Use `rasterTimelineAbsences(presetProgramArm(preset) === 'bands')`
  (the plant used the equivalent `preset?.bands !== undefined`). This restores "palette bands" to
  the line for a non-bands preset. It adds no new words, but it does not name the program that is
  missing. The header still says `bands`. The plant shows existing rows stay green.
- **(b) Name the program in the absence line**, e.g. `not drawn: base swap; per-line deform`, from
  `PROGRAM_ARM_NOUNS`. These are new drawn words, and the existing width row (`foot.length * 5.4 <
  RASTER_TIMELINE_W - 4`) applies. "patchable palette boundary" is long.
- **(c) Re-label the column header** from `bands` to the program's noun, or to a "no bands" phrase.
  These are drawn words in a narrow column.
- **(d) Draw the program in the preset column**: the ramp's `top..top+lines` span, base_swap's fire
  lines, the boundary's `lo..hi` and `line`. This is the most honest option and a feature, not a
  fix.
- **(e) Gate the gesture tooltip** (`RasterTimelineStrip.tsx:383`) on the program being `bands`. It
  goes with any of the above.
- **Not viable:** hand the view `null` for a non-bands preset. The header would then say "no
  preset", which is false.

A pixel-level check of whichever is chosen belongs to `scratchpad/raster-timeline-harness.mjs` (a CDP
run, not the emulator). That is for the overseer.

### F3: the debug hook `presets()` has F1's shape (OPEN, harness-facing)

`debug-hooks.ts:1509-1513` returns `{ id, name, bands: (p.bands ?? []).length }`. No author reads it.
`scratchpad/band-preset-harness.mjs` row 1b reads `bands` for `authored_probe`, a bands document, so
today's harness is unaffected. A harness that listed a ramp preset would see `bands: 0` and nothing
else. The same additive `program` field would close it. It was left out of this parcel because the
hook is not an author surface and has no node-suite row to go red first.

### F4: stale wording in `sectionArmExclusivityRefusal` (OPEN, wording)

`section-wiring.ts:640`, shown in `BandPresetPanel.tsx:528-530` and as the select's title at l.567,
says: "A preset document authored here carries bands, bands lower to a raster program". A preset
authored here may carry ramp, base_swap or boundary.

- **For ramp and base_swap** the conclusion still holds, because they lower to `raster:` too. Only
  "carries bands" is stale.
- **For a boundary preset** the sentence is about the wrong channel. A boundary lowers to `patched:`,
  and the verdict itself (`sectionArmExclusivity`) branches on the SECTION's record, never on the
  document.

That second half is the condition-2 defect `section-wiring.ts:903-910` already records in
`docs/reviews/2026-09-05-coldread-fixes.md`. The wording is a look call and was not changed.

## Positive control: a site that handles a ramp preset correctly

`providers/effects-preset.ts:645-652, 670-675`. `presetListEntries` sets `channel: presetProgramArm(p)`,
and `presetListSummary` returns the program's noun whenever `entry.channel !== 'bands'`.

`bandControlsRefusal` (l.5462, 5470) and `lastBandRefusal` (l.1165) give the program's reason, not
"its only raster band". The same test file holds the rows that show this on the real documents, 8
green rows (2 per document):

- the list summary never matches `/^\d+ bands?$/`;
- `lastBandRefusal(d) === bandControlsRefusal(d)`, which is non-null and does not contain "only
  raster band".

## Totals

All runs are foreground, on the tree at `c98624a6` plus this report.

| Run | Result |
|---|---|
| `npx vitest run` on this parcel's files (`raster-timeline-non-bands-preset.test.ts`, `agent-handler.effects-preset.test.ts`, `agent-handler.assign-section-preset.test.ts`) | exit 0: **3 files passed; 54 passed, 4 expected fail (58)** |
| full `npm test` | exit 0: **Test Files 607 passed, 3 skipped (610); Tests 9160 passed, 4 expected fail, 9 skipped (9173)**. The 4 expected fails are F2's `it.fails` rows. check-test-collection: 610 test-shaped files on disk, all 610 collected. |
| `npx tsc --noEmit` | exit 0, 0 errors (and the TS18048 plant above, exit 2, 1 error) |

**Environment note, for the next worktree agent.** The first `npm test` here exited 2 before vitest:
`check-cited-paths: COULD NOT MEASURE: the exit-0 arm is not behaving … node_modules/__check-cited-paths-ignore-probe__ … got []`.

- **Cause:** a `node_modules` SYMLINK this audit had added to the worktree, pointing at the main
  checkout's. `git check-ignore node_modules/__probe__` answers `fatal: pathspec … is beyond a symbolic
  link` (exit 128), so the gate's own probe fails.
- **Fix:** removing the symlink fixed it. The main checkout's `node_modules` is an ANCESTOR directory
  of `.claude/worktrees/<name>`, so node resolution and npm's PATH walk reach it without the link.
  The rerun is the green one above.
- **It was not a repo defect.** The gate refusing to measure was the right behaviour.

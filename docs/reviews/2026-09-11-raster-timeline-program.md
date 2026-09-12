# The raster timeline on a non-bands preset: the ruling, and F2/F3/F4 of the bands-not-required audit

2026-09-11, branch `parcel/raster-timeline-program`, base aurora `aeb6bb19`. Closes F2, F3 and F4 of
`docs/reviews/2026-09-11-bands-not-required-audit.md`.

## The ruling (F2)

**What was false.** With a ramp, base_swap or boundary preset selected, the strip's preset column was
headed `bands` over nothing, its never-empty honesty line read `not drawn: per-line deform` (the line a
fully drawn band preset gets), and the canvas tooltip and the hint under it said "Drag a band edge in
the left column" over a column with no band. Three claims about the tool, all false.

**The bar** (the owner's cold read of this tab, 2026-09-06): a false statement on screen is a
correctness defect and gets fixed; a placement or wording choice made inside the fix is a look call I
make, then show a capture of. So: the smallest change that makes nothing on screen false.

**What each option would have shown an author**, for a `base_swap` preset:

| Option | Caption | Honesty line | Gestures | Verdict |
|---|---|---|---|---|
| (a) key the absence flag on the program | `bands` | `not drawn: palette bands; per-line deform` | still offered | line true; caption still reads as "0 bands"; tooltip still false |
| (b) name the program in the line | `bands` | `not drawn: base swap; per-line deform` | still offered | 37 chars fits the width row; **`patchable palette boundary` makes 54 chars and fails it** (`foot.length * 5.4 < RASTER_TIMELINE_W - 4` admits 47) |
| (c) caption = the program's noun | `base swap` | as (a) | still offered | the caption slot is `RASTER_TIMELINE_STRIP_X - RASTER_TIMELINE_PRESET_X` = 32px; `base swap` is ~40px at 9px and `patchable palette boundary` is ~104px |
| (c') caption = a "no bands" phrase | `no bands` | as (a) | gated | true in every state; the program is named by the list row, the Program row and `bandControlsRefusal` beside the strip |
| (d) draw the program | ramp span / fire lines / lo..hi | (a) | gated | the most honest picture, and a feature; not built |
| (e) gate the tooltip and hint on bands | — | — | none | goes with any of the above |
| hand the view `null` | `no preset` | as (a) | none | **false**: a preset is selected |

**Chosen: (a) + (c') + (e), and the view carries the program.**

- The honesty flag is `presetProgramArm(preset) === 'bands'` (the positive test `bandControlsRefusal`
  and `presetListSummary` already settled on), so a non-bands preset gets `palette bands` back.
- The caption has three states: `no preset`, `bands`, `no bands`. The third is parallel in grammar
  to the first and drawn in the same dim register (`RULER_TICK`); the column's own hue (`PRESET_EDGE`)
  is used only while the column has something in it.
- One helper, `rasterTimelineGestures(presetProgram)`, feeds the canvas `title` and the two hints
  under it; null unless the program is bands, so the tooltip and the prose cannot disagree.
- `RasterTimelineView.presetProgram` and `RasterTimelineReport.presetProgram` carry the arm, so a
  harness can tell `no bands` from `no preset` without reading pixels.

**Rejected, and why.**

- **The noun on the canvas** — in the caption or the line. Not for want of wanting it: `ramp` and
  `base swap` fit both places and are more informative than `no bands`. `patchable palette boundary`
  fits neither, and a noun-when-it-fits rule is the per-arm branch whose fourth arm reads `0 bands`
  again — the shape `presetListSummary`'s docblock records as the defect it replaced. A short second
  noun per arm would be a new spelling of a program name the repo already spells once. The program
  IS on this tab three times (`docs/captures/2026-09-11-raster-timeline-program/01-ramp-preset-selected-no-bands.png`
  shows `PRESET: AURORA_RAMP_WITNESS` two sections above the strip), and the strip's job is to be
  true about what it draws.
- **A new prose sentence under the strip** naming the program. Allowed by the brief when necessary
  for truthfulness; not necessary once the three false claims are gone, and `bandControlsRefusal`
  already says `preset "x" carries a ramp, not bands` in the panel above.
- **(d)**. A feature. Recorded here as the honest next step if the owner wants the program visible
  on the ruler, and not started.
- **The audit's aside that "per-line deform" already covers a ramp.** Checked and not relied on
  either way: `per-line deform` in this strip's line is the SCENE's `deform`/`v_deform` (see
  `src/renderer/canvas/camera-preview.ts`, the DEFORM block), not the preset's `ramp`, and the fix
  restores `palette bands` regardless of arm, so the claim does not bear on the ruling.

**One look call made inside the fix, from a measurement.** The first CDP capture of this parcel
showed `no bands` left-aligned at x=34 reaching under `layers` at x=66 ("no bandlayers"): at 9px
system-ui the word is ~37px and the slot is 32px. `no preset`, one character longer, had the same
latent collision, unseen because a project with no preset at all is rare. The caption is now anchored
at the preset column's right edge (x=60) with `textAlign = 'right'`, restored to `'left'` on the next
line, so it grows into the ruler gutter (numerals end at ~17px) and never into the layer caption. The
second capture is the one committed. That capture is what the owner reacts to.

## F2: the change, and the proof

**Files.** `src/renderer/canvas/raster-timeline.ts` (`presetProgram` on the view and report,
`rasterTimelineAbsences(bandsDrawn)` keyed on the arm, `rasterTimelinePresetCaption`,
`rasterTimelineGestures`, the caption's alignment); `src/renderer/components/effects/RasterTimelineStrip.tsx`
(title and hints read `rasterTimelineGestures`, the publish carries `presetProgram`).

**Rows.** `src/renderer/canvas/__tests__/raster-timeline-non-bands-preset.test.ts`, 18 → 44 rows,
every one on the audit's real documents (aeon's shipped `ramp_probe`, `aurora_ramp_witness`,
`ojz_sec6_baseswap` as Aurora vendors them, and the contract's boundary vector) with `authored_probe`
as the bands control:

- the four `it.fails` DEFECT rows are plain `it`;
- per document: the line equals `rasterTimelineAbsences(false)` and contains `palette bands`, and
  `presetProgram` is the document's arm;
- caption: `no preset` / `bands` / `no bands` through `rasterTimelinePresetCaption`, AND through the
  draw (`fillText` recorded at the anchor), with the old `bands` asserted absent; a fifth arm and a
  null arm land in the third state; `no bands` is no longer than `no preset`;
- alignment: the recorder captures `textAlign` writes in sequence with the texts, and the row pins
  `align=right`, the caption at `@60,18`, `align=left`, with `layers@66,18` unmoved, on both a ramp
  and a bands view;
- gestures: null for every non-bands document and for no preset; the sentence for the bands control;
- report: the inactive publish carries `presetProgram: null`.

`src/renderer/canvas/__tests__/raster-timeline.test.ts` is untouched: **48 rows before, 48 after.**

**Red on base.** With the five source files stashed and only the test file changed:
`25 failed | 18 passed (43)`. The eight honesty-line rows failed on
`expected [ 'per-line deform' ] to deeply equal [ 'palette bands', 'per-line deform' ]` (and the
`not.toEqual` form of it); the caption, gesture and report rows on the missing field and functions.
The four PRECONDITION rows, both CONTROLs and the eight positive-control rows stayed green.

**Plants, from the committed baseline `36f29b3e`, mutation shown on disk, restored with
`git checkout 36f29b3e -- <file>` (tree clean after each).**

| Plant | Mutation (the diff line) | Red | Stayed green |
|---|---|---|---|
| A (absence flag) | `- absent: rasterTimelineAbsences(presetProgram === 'bands')` / `+ … (preset !== null)` | the 8 honesty-line rows (4 DEFECT + 4 specific) | caption, gesture, report rows; all 48 of `raster-timeline.test.ts` |
| B (caption) | `- return view.presetProgram === 'bands' ? 'bands' : 'no bands';` / `+ return 'bands';` | the 4 caption rows + the fifth-arm row (5) | the bands/no-preset CONTROL |
| C (gestures) | `- return presetProgram === 'bands' ? RASTER_TIMELINE_GESTURES : null;` / `+ return presetProgram === null ? null : RASTER_TIMELINE_GESTURES;` | the 4 gesture rows | the gesture CONTROL |
| D (alignment) | `- ctx.textAlign = 'right';` (deleted) | the alignment-sequence row (1) | the 4 caption rows (the anchor is unchanged, which is the point of a separate row) |

Plant A was run together with F3's and F4's plants (different files, disjoint rows): 11 red in one
run, each attributable by name; the boundary CONTROL row of F4 stayed green under the old wording, as
it should (the old sentence did not name a boundary either).

## F3: `__dbg.aeon.presets()` carries `program`

**Cause.** `src/renderer/debug-hooks.ts` returned `{ id, name, bands }`, F1's shape.

**Change.** `program: presetProgramArm(p)` beside the count, and the hook's type. The count stays;
`scratchpad/band-preset-harness.mjs` row 1b reads it for a bands document and is untouched.

**Row.** `debug-hooks.ts` installs onto `window` and has no node-suite caller; the suite's precedent
for it is a SOURCE read (`src/renderer/__tests__/debug-level-edit.test.ts`), and that is what the F3
describe is: it locates the `presets: () =>` body and asserts `program: presetProgramArm(p)` and the
import, with the band count as the control. It is a text row and its title says so; it proves the
field is in the hook, not that a harness received it. Red on base (`expected … to contain
'program: presetProgramArm(p)'`); plant A deleted the line (`- program: presetProgramArm(p),`) and the
row went red alone among F3's three.

## F4: the arm-exclusivity refusal no longer says a preset "carries bands"

**Cause.** `src/core/formats/effects/section-wiring.ts`, `sectionArmExclusivityRefusal`: "A preset
document authored here carries bands, bands lower to a raster program, and effects_seam_gate.py
requires it be threaded through …". A preset authored here may carry a ramp or a base swap.

**Change.** "A preset document authored here carries one program; a band list, a ramp or a base
swap lowers to a raster program, and effects_seam_gate.py requires it be threaded through …". True
for bands, ramp and base_swap: all three lower to `raster:`, so the conclusion held and only the
premise was stale. The three nouns are `PROGRAM_ARM_NOUNS`' spellings, typed in core because that
module must stay importable without the preset codec; `PROGRAM_ARM_NOUNS` is now exported so a
renderer row holds them to the map.

**Is the new wording still false for a boundary preset?** The first clause ("carries one program")
is now true of a boundary document. The threading clause is still the wrong sentence for one: a
boundary lowers to `patched:` and is chosen by `<act>_sec_patched`, not by the raster chooser the
sentence names. That is condition 2's recorded defect (`section-wiring.ts`, the CONDITION 2 note;
`docs/reviews/2026-09-05-coldread-fixes.md`) and was deliberately not taken on. The sentence is also
about the SECTION's record, shown whatever preset is selected, so no wording about "the document"
would make it right for that case; the fix is in condition 2.

**Rows** (same file as F2's, describe "F4"): a minimal barred `SectionRasterWiring` (one binding whose
record passes a patched arm) yields the sentence; it does not contain `carries bands`; for every
`EFFECTS_PRESET_RASTER_CHANNELS` arm it contains `PROGRAM_ARM_NOUNS[arm]`; CONTROL: it does not
contain the boundary noun, and `boundary` is not a raster channel. Red on base (2 of 3); plant A
restored the old wording (`+ 'carries bands, bands lower to a raster program, and '`) and the same
two went red, the control stayed green.

## Pixels

`scratchpad/raster-timeline-harness.mjs`, UNMODIFIED, driven at this worktree's `VITE_AURORA_DEBUG=1`
build with `ELECTRON_BIN=<main checkout>/node_modules/.bin/electron`, `AURORA_BUILT_TREE=<this
worktree>` and `AEON_DIR=<an archive of aeon origin/master 35f54923 in the scratchpad>` (never the
peer's live tree; the harness opens read-only and never saves). The run's own first lines:
`root: <this worktree>` / `pinned: AURORA_BUILT_TREE=<this worktree>`, and row 0a names
`<this worktree>/dist`.

- **It shows a non-bands preset without modification.** The strip draws `resolveSelectedPreset`'s
  fallback, the library's first preset, and aeon's `aurora_ramp_witness` (a ramp) sorts first. So
  the capture is of the F2 fix on a real render, not of the control.
- **Two runs, one look call.** Run 1 (caption left-aligned): the footer read
  `not drawn: palette bands; per-line deform` and the caption `no bands` ran under `layers`. That
  capture was overwritten by run 2 (the harness writes a fixed filename) and is described from the
  reading taken of it, not preserved; the collision is what the alignment commit's message records.
  Run 2 (right-aligned): the committed capture, `no bands` clear of `layers` in the dim register,
  footer as above, ruler numerals clear.
- **Control.** `scratchpad/ramp-control-harness.mjs`, unmodified, same environment: its
  `cv-converted` shot shows the strip with a BANDS preset selected on this build — caption `bands`
  in the column's hue, band 0 drawn, `layers` in place. Committed as
  `docs/captures/2026-09-11-raster-timeline-program/02-bands-preset-control.png`.

**Harness rows, faithfully.** Neither harness reached its final tally on this build, and neither
failure is on the surface this parcel changed:

- `raster-timeline-harness.mjs`: rows 0a, 1a, 1b, 2a, 3a, 3b, 3c, 4b, 5a, 5d PASS; 4a, 5b, 5b2, 5cA,
  5cB FAIL, then a TypeError at its line 550. Row 4a shows the cause: the fixture's layers carry
  `world_y` 96 and 176 and NO `vsplit`. The harness aims its select at the title prefix
  `Layer N vsplit.at —` (its lines 457, 610, 627, 631); the app titles that select
  `Layer ${i} ${LAYER_VSPLIT_ROW.title}` and `LAYER_VSPLIT_ROW.title` now begins `vsplit.at: the Plane
  B row …` (`src/renderer/providers/effects-aeon.ts:269-273`). The harness was last touched 2026-09-05
  (`87262540`). Aim drift, predating this branch; the strip painted (5a) and hit-tested (5d).
- `ramp-control-harness.mjs`: b1 PASS; f0 FAIL with `raster select = null` — its handle is
  `rowFor('Raster')` (its line 487) and the panel's row is labelled `Program`
  (`BandPresetPanel.tsx`, `<Field label="Program"`). The conversion never happened, so cv-a and cv-z
  fail. Same class, same pre-dating.

Neither drift is fixed here (not this parcel's surface; a harness edit is what the brief said not to
force). Both are **OPEN for the overseer**: the timeline harness's `vsplit.at —` aim and the ramp
harness's `Raster` row aim need re-pointing at the current titles, and then the pixel rows that
today fail for want of a fixture can run again.

## Totals

All foreground, on the tree at `c4e38045` plus this packet and three test titles repaired for the
dash gate (the repair changed no assertion).

| Run | Result |
|---|---|
| `npx vitest run` on the two timeline files | exit 0: 2 files, **92 passed** (44 + 48) |
| with `section-wiring.test.ts` | exit 0: 3 files, 153 passed |
| full `npm test` | exit 0: **Test Files 608 passed, 3 skipped (611); Tests 9195 passed, 9 skipped (9204)**. No expected-fail rows remain: the audit's four were the only ones, and they are plain `it` now. check-test-collection: 611 test-shaped files on disk, all 611 collected. |
| `npx tsc --noEmit` | exit 0, 0 errors |

Two earlier `npm test` runs on this tree exited 1 before vitest and are recorded because each gate
did its job: `check-doc-citations` refused this packet while its two captures were on disk but
untracked (fixed by committing them, `c4e38045`), then `check-test-dashes` refused three test
titles carrying an em dash (repaired). The green run above is the third.

**Environment note.** As the audit found, a worktree needs no `node_modules` symlink; none was
added here and every `npm` command resolved the main checkout's tree from the parent directory.

## Open

- **Option (d)**, drawing the program on the ruler: a feature, recorded above, not started.
- **Condition 2 for a boundary document** (F4's second half): unchanged, already recorded.
- **Two harness aims** drifted from the app's titles (above); re-point and rerun.
- **`no preset` collision**: fixed by the same alignment, but unobserved on a render (no project in
  reach has an empty preset library); the row that pins the alignment covers it by construction.

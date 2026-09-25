# REGIONS-MIDDRAG-PREVIEW (ROADMAP §5.1 row 208): with the tint hidden, a region drag draws only the gesture

Ruling: **C**, by the aurora overseer on 2026-09-25, as a look call under the owner's
2026-09-18T19:27:49Z words, overturnable by his one word. Row 208 is the ruling and section 7
of `docs/reviews/2026-09-25-regions-list.md` holds the options. This parcel builds C.

Branch `parcel/regions-middrag-preview`, cut from master `6072f9df` (the ruling commit itself;
checked with `git merge-base --is-ancestor`). Commits:

| sha | purpose |
|---|---|
| `b2da19ab` | test: the tint-ON overlay pinned to master 6072f9df's own call log (control, green on both trees) |
| `0aae7d0d` | harness: row 7c asserts gesture-only by report AND by pixels, with controls 7e/7f/7g; committed before the fix |
| `a56357ca` | fix: `regionOverlayPass` + `drawRegionGesture`, report `mode`/`drew`, MapViewport comment cites row 208; 13 new node rows |
| `224112d8` | harness: row 7h puts the trimmed half of the gesture on screen |
| `98eba32e` | captures: before and after, tint hidden, mid-drag |
| (tip) | this packet and the ROADMAP row |

## 1. Answer table

| asked | answer | evidence |
|---|---|---|
| tint OFF + drag live: only the dragged rectangle's outline and the trimmed pieces' outlines | DONE | node rows in `region-overlay-middrag.test.ts` §2; harness 7c, 7c2, 7h |
| no hatch, no unassigned wash (red included), no labels | DONE | node: no text, fill, clip, alpha or `REGION_UNASSIGNED_FILL` stroke, line length equals the trimmed boundary exactly; live: 0.62% of device px change vs 20.58% for the full wash |
| tint ON: the drawing does not change at all | HELD | node control: every context call of 5 scenarios equals master's golden; live: the tint-ON mid-drag capture is byte-identical between the pre-fix and fix builds |
| comment above the block cites row 208 and the ruling | DONE | `src/renderer/components/MapViewport.tsx`, regions overlay block |
| check `regionDragPreview` really yields the trimmed pieces | IT DID NOT, as stated. See §4 | `regionDragGesturePreview` added |
| harness 7c "paints advance AND full wash not drawn" + positive + controls | DONE | 7c, 7c2, 7e, 7e2, 7f, 7g, 7h, 7h2 |
| 7c red pre-fix, green on fix | DONE | §5 |
| screenshot | DONE | `docs/captures/2026-09-25-regions-middrag-preview/` |
| full `npm test` | exit 0, 10337 passed / 9 skipped | §6 |

## 2. What changed

- `src/renderer/components/map-region-gesture.ts`
  - `regionDragGesturePreview(doc, drag)` makes the ONE `applyRegionGesture` call and keeps
    what the old preview threw away. It returns `pieces` (the whole post-release set,
    unchanged), `trimmedIds` (the layer's own), `dragged` (`drag.rect` under its region id)
    and `trimmed`. `trimmed` holds the result pieces of trimmed regions that the region did
    not already have, which is what the carve leaves of each region it cuts. The dragged
    region is excluded: a same-region overlap moves no visible boundary, and its coalesced
    piece would draw on top of the dragged outline. `regionDragPreview` now delegates to it,
    so the two can never disagree about the carve.
  - `regionOverlayPass(doc, drag, showRegions)` answers `none`, `full` or `gesture`. This is
    the decision MapViewport used to make inline. It moved here so node can drive it. The
    `full` arm is exactly the old one: preview pieces mid-drag, the document's own at rest.
- `src/renderer/canvas/region-overlay.ts`
  - `drawRegionGesture` draws each trimmed region's remainder as a union outline (interior
    edges suppressed, the region's hue, 1 px), then the dragged rectangle (its region's hue,
    2 px, drawn last). A minted id with no document row draws in the label text colour.
    It issues no clip, alpha, fill or text.
  - The report gains `mode` (`full` or `gesture`) and `drew` (hatches, unassigned holes,
    labels, gesture outlines, trimmed outlines). The counts are taken at the call sites and
    only include what intersected the canvas. In gesture mode, `regions` is empty and
    `unassignedRects`/`unassignedArea` describe the state the release would leave, none of
    which is drawn. The full draw's context calls did not change (the golden in §3 holds this).
  - The stale header note "NOT WIRED. Nothing calls this yet" is replaced with a section
    naming the two draws.
- `src/renderer/components/MapViewport.tsx`: the block asks `regionOverlayPass` and calls
  one of the two draws. The "OVERSEER'S CALL AND IS OVERTURNABLE" paragraph is rewritten.
  It now cites `dce413e9`, row 208, the options section, the ruling (C, the aurora overseer,
  2026-09-25, overturnable by the owner), and the shape.
- `src/renderer/components/__tests__/map-region-wiring.test.ts`: the two source-scan rows
  follow the move. The gate line now names `regionOverlayPass(` with `regionsDoc` and `rd`,
  there is one `drawRegionGesture(` and one `drawRegionOverlay(`, and the behaviour is
  pointed at the new file.
- `src/renderer/canvas/__tests__/region-overlay.test.ts`: the one direct
  `publishRegionOverlayReport` call passes the two new fields.

## 3. Node: red and green

`src/renderer/canvas/__tests__/region-overlay-middrag.test.ts`, 20 rows. The scenario is in
`region-overlay-cases.ts`: three regions tile 640x448, `west` is selected, and a DRAW at
(400,96)-(496,192) punches a hole in `east` and does not touch `south`. The expected figures
are worked out by hand in the file header and are not read back from the code: east's
remainder area is 320·224 − 96·96 = 62464 and its boundary is 2(320+224) + 2(96+96) = 1472.

**Control (7 rows), green on both trees.** The golden `region-overlay-full-master.golden.json`
was written by a one-off vitest generator on the base tree. It was never committed: it ran
`drawRegionOverlay` over `fullCases()` and wrote `{calls, report}` with
`generatedFrom: "master 6072f9df..."`. It holds 5 scenarios: at rest ×3, mid-drag with the
preview pieces at dpr 1 and 1.35. Base tree `b2da19ab`: 7/7. Fix tree: 7/7.
Planted mutation M3 (`REGION_HATCH_ALPHA = 0.5; // MUTATION M3`) turned the 5 golden rows
RED, so the comparison can fail.

**New rows (13), red first by visible mutation on the committed fix, then restored with
`git show HEAD:<path> > <path>`:**

- M1, in `regionOverlayPass`, restores the pre-208 behaviour
  (`+  if (drag) return { kind: 'full', pieces: regionDragPreview(doc, drag) }; // MUTATION M1`,
  `git diff --stat`: 1 file, 1 insertion). Result: **10 failed | 10 passed**. Every
  gesture-arm and draw row went red. The 7 control rows and the none, full and no-document
  pass rows stayed green.
- M2, in `drawRegionGesture`, draws everything
  (`+  if (vp) return drawRegionOverlay(ctx, dpr, vp, input); // MUTATION M2`).
  Result: **5 failed | 15 passed**. These were the absence rows, the line-length row, both
  outline rows and the report row. The dpr-frame row stayed green, correctly, because the
  full draw uses the same frame.
- After each restore, `git status --short` was empty and the file ran **20/20**.

With the overlay, wiring and gesture suites: **71/71**.

## 4. Where the tree disagreed with the brief

1. **`region-overlay.ts` is at `src/renderer/canvas/region-overlay.ts`**, not
   `src/renderer/components/canvas/`.
2. **`regionDragPreview` does not yield "the trimmed pieces".** It returns
   `applyRegionGesture(...).pieces`, which is the WHOLE post-release set, and it discards
   `trimmedIds`. So "taken from `regionDragPreview`" could not be followed literally. I added
   `regionDragGesturePreview` around the same single call and made `regionDragPreview`
   delegate to it, which keeps the substance (the release's own transform). The definition
   of "piece the release will trim" had to be chosen. I chose **what the carve leaves** of
   each trimmed region (post-release pieces not already present), not the pre-release piece
   it bites. That is the shape the author will see when the tint comes back.
3. The brief's harness wording "paints advance AND the full wash is not drawn" is built.
   It is also split so the absence is measured twice (§5).

## 5. Live: `scratchpad/region-gesture-harness.mjs`

Environment in every run: `ELECTRON_BIN` = the main checkout's electron, `AURORA_BUILT_TREE`
= this worktree, and the `root:`/`pinned:` lines named this worktree. `AEON_DIR` was a fresh
rsync of the aeon working tree (`.git` and `.claude` excluded) into a run-unique directory
of the session scratchpad, deleted afterwards (`copy removed: yes` every run). Each run was
under `timeout -s TERM 420`, with xvfb 1680x1050. **dpr 1 in every run**, canvas
`{left 284, top 74, width 836, height 774}`. All added input is CDP `Input.dispatchMouseEvent`
/ `dispatchKeyEvent`. The toggle goes through the existing `__dbg.setOverlay` door, which is
the action the View menu calls.

Rows added or changed in section 7:

| row | asserts |
|---|---|
| 7f | CONTROL: two rest captures of the same view, with a repaint between, differ in < 0.1% of device px (noise floor) |
| 7c | paints advance AND `mode === 'gesture'`, `drew` has 0 hatches / 0 holes / 0 labels and ≥ 1 gesture outline |
| 7g | ANTI-VACUOUS: one Ctrl+Z after the OFF drag returns the seeded bytes, so 7e drags the same document |
| 7e | CONTROL: the same drag with the tint ON changes more than 1/(2·hatchPx) of device px (hatchPx read from the report) |
| 7e2 | and its report says `full` with hatches and labels |
| 7c2 | PIXELS: the OFF mid-drag change is under a quarter of the ON change and above the noise floor |
| 7h | a DRAW inside night on the seam view, tint off: `gesture`, ≥ 1 gesture outline, ≥ 1 trimmed outline, 0 hatch / hole / label |
| 7h2 | ANTI-VACUOUS: that release carved night (4 entries) and one Ctrl+Z restored the seed |

Pixels come from `getImageData` on `#map-canvas`, which is the 2D canvas the overlay draws on.

**Pre-fix build** (the base src, harness at its final state): **24 passed, 4 failed,
0 unmeasurable of 28**. The failures are 7c (`mode=undefined drew=undefined`), 7c2
(`OFF mid-drag 20.58% vs ON mid-drag 20.58%`: the same picture), 7e2 (field absent) and 7h
(field absent). The controls 7e, 7f, 7g and 7h2 were green. An earlier pre-fix run with the
harness at `0aae7d0d` (before 7h existed) gave 23 passed, 3 failed of 26, with the same
three reds.

**Fix build:** **28 passed, 0 failed, 0 unmeasurable of 28** (final run, tip src, final
harness). The key lines were 7c `drew={"hatches":0,"unassignedHoles":0,"labels":0,"gestureOutlines":1,"trimmedOutlines":0}`,
7c2 `OFF mid-drag 0.62% vs ON mid-drag 20.58% vs noise 0.000%`, and 7h
`"gestureOutlines":1,"trimmedOutlines":1`. 7c's trimmedOutlines is 0 because its drag is a
move of forest whose carve into night lands off screen. That is why 7h exists.

**Tint ON unchanged, live:** the tint-ON mid-drag capture from the pre-fix run and the one
from the fix run are **byte-identical** (`cmp`). The pre-fix tint-OFF mid-drag capture is
byte-identical to both: the old override drew exactly the full overlay.

## 6. `npm test`

`VITEST_MAX_WORKERS=4 npm test`, foreground semantics (detached to a run-unique log and
polled for an end marker I wrote, exit code echoed straight after `npm test` with no pipe).
The run was on `98eba32e`, before this packet and the ROADMAP row: **exit 0**,
`Test Files 656 passed | 3 skipped (659)`, `Tests 10337 passed | 9 skipped (10346)`,
skip-report "Every skip named its reason", failure-class "no failures". The re-run after
this packet is in the final report.

## 7. Captures

`docs/captures/2026-09-25-regions-middrag-preview/`:

- `0-before-OFF-mid-drag.png`: the pre-fix build, 7c's drag. The whole overlay is there:
  red UNASSIGNED cross hatch, forest's hatch, the unassigned label colliding with forest's.
- `1-after-OFF-mid-drag.png`: the fix, the same drag. Only forest's dragged outline (orange),
  over clear art.
- `2-after-OFF-mid-drag-carve.png`: 7h, on the seam view at 25%. Forest's dragged rectangle
  (orange) and night's remainder outline (the blue seam line). The hole rim night would get
  lies under the dragged outline by construction. The pale blue line and grey rule at the
  top left are level art, not overlay. They are in the tint-ON boundary capture too.

A tint-ON capture is not committed: it is byte-identical to `0-before` (§5).

## 8. Deviations

- A new report field pair (`mode`, `drew`) and a new debug-visible shape. `regionOverlayReport()`
  returns the whole report, so no new `__dbg` door was needed.
- `map-region-wiring.test.ts` was edited, because its gate row asserted the old one-line
  disjunct (`rd !== null`), which the ruling removes. It now asserts the new one-line call.
- The dragged rectangle's hue for an id with no document row (the refused no-selection draw)
  is the label text colour. The full overlay never drew that rectangle at all, since it
  draws only rows the document has. The gesture draw does, because the author is dragging it.

## 9. Observations not acted on

- In the full overlay, a draw with NO selection (minted id) never shows the dragged
  rectangle, only its carve on others, because `regions` comes from the document's rows.
  This is pre-existing and was left alone (tint ON must not change).
- The pre-fix capture shows the unassigned label plate overlapping forest's label plate
  ("unassigned: no region owns this st"). This is the transient label collision section 7
  of the regions-list packet mentions. It is still present with the tint ON and was not
  touched.
- The golden is 211 KB, because each hatch line is a logged call. It is kept as one call
  per line so a diff is readable.

## 10. TAGGED for the foreground

- **The look itself** (ruling C is overturnable by the owner): captures 1 and 2 are for his
  eye. Open questions for him: whether the 2 px dragged outline plus 1 px trimmed outlines
  read clearly over busy art, and whether the dragged rectangle should be dashed to set it
  apart from the trimmed outlines.
- Not measured live at dpr ≠ 1 (every run on this box was dpr 1). The node rows cover dpr
  1.35 for both draws' transform frame.

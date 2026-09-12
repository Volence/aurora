# DPR guides offset: the map's chrome at a scale factor above 1

Parcel `parcel/dpr-guides-offset`, cut from master `803e8a30` (verified with
`git merge-base --is-ancestor 803e8a30 HEAD`). Opened by `docs/reviews/2026-09-12-cdp-sweep-4.md`
section 5.1 (OBS.DPR). No emulator was touched. Every capture and log cited below is in
`docs/captures/2026-09-12-dpr-guides-offset/`.

## Verdict

- **Fixed.** On a map canvas whose backing store is sized in device pixels, the layer guides and
  the screen frame are now drawn where their hit tests grab them, at every scale factor. Measured
  at 1.35 with two different instruments: an EMULATED factor (`Emulation.setDeviceMetricsOverride`,
  the OBS.DPR method) and a REAL forced factor (`--force-device-scale-factor=1.35`, which takes on
  this harness launch path). A real press on the visible guide grabs it, and the drag moves the
  right layer. A real press on the visible frame edge grabs the frame, and the drag moves it. A
  press where the old drawing sat grabs nothing.
- **The population was five draws, not two.** The finding named the guides and the frame. The
  camera preview composite and the band lens caption also reset to identity on the same canvas,
  and at 1.35 they sat in a 1/1.35 corner of what they belong to (section 2).
- **At dpr 1 nothing changed by one pixel.** Three witnesses agree. A call-for-call golden of all
  five draws was recorded from master's code. The whole map backing store hashes the same as a
  master build in two fixed states, in two windows. The dpr-1 look PNGs of master and the fix are
  byte-identical under `cmp` (section 4).
- **LOOK CALL at 1.35 (owner).** The labels, plates and captions are now 10 CSS px (13.5 device
  px), the size they have at dpr 1, where master drew them 10 device px (7.4 CSS px). The
  `plane_y` rule's casing is 5 device px where master drew 3. The 1 px and 2 px lines keep
  master's device weight. Captures in section 5.
- **Found, not fixed (TAG).** MapViewport's clear under the composite uses the container's CSS
  rect, not the backing store's CSS size, so at a fractional `rect * dpr` the canvas's last device
  column is left partly uncleared while the composite is on (section 9).

Final runs on the final build: three native runs, 33/33 each, and one REAL 1.35 run, 34/34.
`npm test`: see section 8.

## 1. The defect, re-derived from source

`MapViewport.redraw` sizes the map canvas's backing store as `round(rect * dpr)` device pixels
and sets `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Its docblock: *"every line below it goes on
drawing in CSS pixels, unchanged."* The geometry the chrome is drawn from is CSS: that is
`layerGuideGeometry`, `surfaceGeometry`, `screenFrameRect` and `bandLensAnchor`. The hit tests
measure CSS: `guideAtCanvasY(e.clientY - rect.top, ...)` and
`screenFrameEdgeAt(e.clientX - rect.left, ...)`, at `MapViewport.tsx` press and hover. On master
each chrome draw began with `ctx.setTransform(1, 0, 0, 1, 0, 0)` and then issued those CSS
numbers, so they landed in device pixels. At 1.35 a guide reported at canvas row 200 was drawn at
200 / 1.35 = 148.15 CSS, and a press on the line at 148 caught nothing. This is measured on master
at both an emulated and a real 1.35 in section 6.

## 2. Every identity-reset site

Enumerated by grep over `src/` for `setTransform(1, 0, 0, 1, 0, 0)` and `resetTransform`: 7
sites in 6 files, and no `resetTransform` anywhere. That is the same seven the brief listed, and
its list was complete. Nothing else writes the map canvas outside its transform either: every
`putImageData` in the renderer targets an offscreen canvas.

| Site (master) | Canvas it draws on | Backing store dpr-scaled? | Its coordinates | Hit test or pointer mapping on the same geometry | Verdict | Change |
|---|---|---|---|---|---|---|
| `effects-guides.ts` `drawLayerGuides` (line 524) | `#map-canvas` | yes (`redraw`) | CSS (`layerGuideGeometry`) | `guideAtCanvasY`, CSS, on press and hover | **wrong** | `setTransform(dpr...)`, snapped |
| `effects-guides.ts` `drawSurfaceMarks` (line 385) | `#map-canvas` | yes | CSS (`surfaceGeometry`) | none of its own, by design (not a handle); it shares rows with the guides | **wrong** | `setTransform(dpr...)`, snapped |
| `screen-frame.ts` `drawScreenFrame` (line 139) | `#map-canvas` | yes | CSS (`screenFrameRect`) | `screenFrameEdgeAt`, CSS, on press and hover | **wrong** | `setTransform(dpr...)`, snapped |
| `camera-preview.ts` `drawCameraPreview` (line 546) | `#map-canvas` | yes | CSS (`frame` is `screenFrameRect`) | none of its own; it must fill the frame whose edges have one | **wrong** (fills a 1/dpr corner of the frame: 237.69 of 320 CSS, section 6) | `setTransform(dpr...)` |
| `band-lens.ts` `drawBandLensLabel` (line 161) | `#map-canvas` | yes | CSS (`bandLensAnchor`, `vp.width`) | none on the label; the wash it labels is drawn in CSS and the mark click resolves through `screenToWorld` | **wrong** (the plate sits at 1/dpr of the coverage it points at) | `setTransform(dpr...)` |
| `raster-timeline.ts` `drawRasterTimeline` (line 750) | the raster strip in `RasterTimelineStrip.tsx` | **no**: fixed intrinsic `RASTER_TIMELINE_W` x `RASTER_TIMELINE_H`, and CSS may scale the element | strip px | `toStrip()` maps client px to strip px through `cv.width / rect.width` | **right** | none |
| `ClassicLevelViewport.tsx` main render effect (line 641) | the classic level canvas | **no**: `measure()` sets `canvas.width = floor(rect.width)`, never times dpr | CSS px (equal to backing px) | `screenToWorld(cam, clientX - rect.left, ...)`, CSS | **right** for this defect (see the TAG in section 9 on its sharpness) | none |

Also read, because they touch the same canvases, and all are right: `redraw` and
`drawCollisionPreview` in MapViewport (dpr-scaled stores, `setTransform(dpr...)`, all drawing in
`save`/`scale`/`restore`), `CollisionLegend`'s swatch and `AnchorSweepPreview` (both size their
store times dpr and set `setTransform(dpr...)`), and `drawCameraPreviewCaptions`, which inherits
`drawCameraPreview`'s transform.

## 3. The fix, and why CSS is the canonical frame

**CSS is canonical.** It is the frame every geometry function publishes, the frame every hit test
reads, the frame the debug reports (`__dbg.aeon.guides()`, `screenFrame()`) carry, and the frame
MapViewport draws every other layer in. Device pixels are a property of one surface's backing
store; the pointer never sees them. Mapping the hit tests to device pixels instead would move the
grab to the old drawing, and section 6 shows the harness catching exactly that wrong-way fix.

**Each of the five draws now takes the canvas's `dpr` as a required second parameter**
(`drawLayerGuides(ctx, dpr, vp, ...)` and so on), and restates `setTransform(dpr, 0, 0, dpr, 0, 0)`
absolutely rather than inheriting whatever the previous pass left. There is no default, because a
default of 1 is the defect. MapViewport passes the `dpr` its `redraw` sized the store with.

**The crispness the identity reset was for is kept** (`src/renderer/canvas/device-grid.ts`). The
master comments give the reason: *"a 1px line on an integer coordinate straddles two device rows
and renders as a 2px smear."* That reason survives; the way of getting it changes. Under the CSS
transform:

- a stroke's centre goes on a device half-pixel: `(round(v * dpr) + 0.5) / dpr`;
- its width is the whole number of device pixels nearest `w * dpr` with the same parity as `w`,
  ties going thinner. A 1 px line stays an odd device width and covers whole device rows. A 2 px
  line (hover, drag, refusal) keeps the half-covered edges it has always had at dpr 1;
- the notice plate's `Math.round` corners become `snapLength`, which is whole device pixels.

At dpr 1 each of these reduces to master's arithmetic exactly: `Math.round(v) + 0.5`, width `w`,
and `Math.round(len)`. That is why dpr 1 is pixel-identical, not merely close. The node row "the
snap reduces to master's dpr-1 arithmetic" asserts it with `Object.is`.

## 4. dpr-1 pixel identity

1. **Call for call.** A one-off vitest spec recorded every call of the five draws, at master's
   signatures and from master's sources, into
   `src/renderer/canvas/__tests__/dpr1-chrome-master.golden.json` (12 cases: three guide scenarios,
   two `plane_y`, three frame, two composite, two lens caption, with fractional pans and zooms on
   purpose). The spec was deleted after it ran; its text is
   `docs/captures/2026-09-12-dpr-guides-offset/dpr1-golden-generator.ts.txt`. The fixed code at
   dpr 1 issues exactly those calls: 12 rows of `src/renderer/canvas/__tests__/dpr-chrome.test.ts`.
2. **The backing store, hashed.** The harness hashes the whole map backing store in two fixed
   states. The first is the probe scene with its two guides, the forced-on frame, its captions and
   a band lens (label and wash). The second is `ojz_act1_floor` with the camera stepped to 64, so
   the composite differs from the map. The fixed build equals the master build in every run:

   | Window | Master (`master-final`, `master-final-real`) | Fix (`fixed-final1/2/3`, `fixed-final-real`) |
   |---|---|---|
   | native dpr 1, canvas 816 x 742 | probe `a55232571f3233f4`, floor `81860e4ef2e51081` | the same, in all three final native runs |
   | emulated 1 inside the REAL 1.35 window, canvas 661 x 620 | probe `a12aa4a58b096dcc`, floor `e005f27e5abeeb35` | the same |

   The same probe hash was produced by master runs 1 to 5 as well (five launches of one build),
   and the floor state by master runs 4 and 5, so the hash is stable across launches, not only
   within one.
3. **The pictures.** `look-probe-dpr1-master.png` and `look-probe-dpr1-fix.png`, and
   `look-floor-dpr1-master.png` and `look-floor-dpr1-fix.png`, are byte-identical under `cmp`.

The identity row's printed label says "baseline build (96c3a542...)" for `master-final`. That is
the tree's git HEAD, not the code that was built: `master-final` was built with master's five
changed files checked out from `803e8a30` into the tree at `96c3a542`. Its seven red rows at 1.35
are what show the bundle was master's.

## 5. The look at 1.35 (LOOK CALL for the owner)

Each pair is the same scene at 1.35, master then the fix:

- emulated: `look-probe-emulated135-master.png` / `look-probe-emulated135-fix.png`,
  `look-floor-emulated135-master.png` / `look-floor-emulated135-fix.png`;
- real forced factor: `look-probe-real135-master.png` / `look-probe-real135-fix.png`,
  `look-floor-real135-master.png` / `look-floor-real135-fix.png`.

On master the composite fills the top-left 1/1.35 of the frame, the guides sit above the art they
divide, and the guide caption floats mid-canvas. On the fix, the composite fills the frame, the
guides sit on their rows, and the caption sits in the bottom-right corner. **What changes
deliberately at 1.35:** every label, plate and caption is 10 CSS px, the size it has at dpr 1 and
the size of the rest of the UI, where master drew it at 10 device px (7.4 CSS px). The `plane_y`
casing is 5 device px where master drew 3. The 1 px guide and frame lines, and the 2 px active
ones, keep master's device weight exactly. None of this reaches dpr 1 (section 4).

## 6. Red-first, per row

### Node rows (`src/renderer/canvas/__tests__/dpr-chrome.test.ts`, 175)

Each mutation was applied on disk, its `git diff` quoted in the log, run, and restored with
`git checkout --` from the committed fix `be428ed4`. The only uncommitted change each time was
the mutation itself. Logs: `node-mutation-A.log` to `node-mutation-E.log`.

| Mutation | Diff | Result | Rows red |
|---|---|---|---|
| M-A: snap centre `round` becomes `floor` (`device-grid.ts:70`) | `-at: (Math.round(cssAt * dpr) + 0.5) / dpr` `+at: (Math.floor(cssAt * dpr) + 0.5) / dpr` | 5 failed / 170 passed | 4 dpr-1 golden rows, and the snap-reduction row |
| M-B: master's identity reset back at both `effects-guides.ts` sites (389, 543) | `setTransform(dpr, ...)` becomes `setTransform(1, 0, 0, 1, 0, 0)` | 71 failed / 104 passed | 21 guide-position rows, 14 `plane_y` rows, 35 crispness rows, the census |
| M-C: the naive fix in `screen-frame.ts` (CSS transform, master's CSS rounding, no device snap) | `snapStroke(...)` and `snapLength(...)` become `Math.round(r.x) + 0.5`, `Math.round(r.w)`, `lineWidth = lw` | 29 failed / 146 passed | 18 crispness rows, 11 frame-edge rows |
| M-D: identity back in `camera-preview.ts` (553) | as M-B | 16 failed / 159 passed | 14 composite-scaling rows, the census, and "the comparison can fail" |
| M-E: identity back in `band-lens.ts` (167) | as M-B | 16 failed / 159 passed | 14 lens-caption rows, the census, and "the comparison can fail" |

The dpr-1 golden stays green under M-B, M-D and M-E, as it must: at dpr 1 the identity reset and
the CSS transform are the same matrix. M-C shows the snap is what the crispness and the tight edge
rows rest on, not the transform alone.

### CDP rows (`scratchpad/dpr-guides-offset-harness.mjs`, `npm run harness:dpr-guides-offset`)

- **Rows .2, .3, .4, .6, .7, .8, .10: red on master at 1.35, green at dpr 1**, under both
  instruments and under the final harness. `master-final` (emulated): E.2, E.3, E.4, E.6, E.7,
  E.8 and E.10 red, with every native dpr-1 row green. `master-final-real` (REAL): N.2 to N.10,
  the same seven, red, with the emulated-1 control green. Master's drawn guides are at CSS 44.43
  and 148.10 (prediction 44.44 and 148.15), its right frame edge at 236.95 to 237.69 (prediction
  237.04), and its composite spans 47.39 to 284.34 (prediction 47.41 to 284.44).
- **Rows .5 and .9 cannot be red against master**, because there a press at the identity-transform
  position grabs nothing for the defect's own reason. What they exist to catch is the WRONG-WAY
  fix: scaling the pointer into device pixels so the grab moves to the old drawing. That was
  planted on top of the fix at both press sites:

  ```
  -        const idx = guideAtCanvasY(e.clientY - rect.top, scene.layers,
  +        const idx = guideAtCanvasY((e.clientY - rect.top) * deviceScale(), scene.layers,
  -        if (screenFrameEdgeAt(e.clientX - rect.left, e.clientY - rect.top, anchor, vp)) {
  +        if (screenFrameEdgeAt((e.clientX - rect.left) * deviceScale(), (e.clientY - rect.top) * deviceScale(), anchor, vp)) {
  ```

  The mutation was built and run. `wrongway-native` (emulated 1.35): E.5 and E.9 red (a press at
  canvas row 148 now grabs layer 1, and a press at x 237 grabs the frame), plus E.3, E.4, E.7 and
  E.8, with dpr 1 all green. `wrongway-real` (REAL 1.35): N.3, N.4, N.5, N.7, N.8 and N.9 red. It
  was restored from `be428ed4` and rebuilt.
- **Row I2 (pixel identity) is red for a change that touches dpr-1 pixels and no geometry.** The
  snap centre `+0.5` was changed to `+0` in `device-grid.ts:70`, which puts every hairline on an
  integer device coordinate: a smear of about half a pixel, and no move. That was built and run
  against `master-final` (`i2-mutation`, uptime 160067s): **N.I2 FAIL, and all 32 other rows
  PASS**. Master's probe `a55232571f3233f4` and floor `81860e4ef2e51081` became probe
  `6c028aef70cc8a88` and floor `39160a66fd47b2a7`. So the identity gate sees what every geometric
  row forgives. The file was then restored from `1bd40ec7` and rebuilt, and the rebuilt `dist/` is
  byte-identical to the build the final runs used (sha256 of all 13 bundle files). The final
  runs therefore stand for the final bundle.
- **Anti-vacuous rows** (`[anti-vacuous]` in their names) establish that each phase's store really
  is dpr-scaled, that the report is live, that the composite differs from the map before its
  extent may pass, that the camera moved and came back, and that the session undoes back to the
  fixture with nothing saved.

### Where the instrument was wrong, and how each was caught

These are recorded because each would otherwise pass or fail for the harness's reason:

1. `selectScene(null)` is not "no scene". `resolveSelectedScene` falls back to `scenes[0]`, so the
   first baseline drew `ojz_act1_start`'s five guides (master run 1, where every diff row failed at
   dpr 1 too). The harness now writes an unlocked, off-canvas baseline scene into the aeon COPY.
2. A press released where it pressed can commit. The aim at a run's centre (200.5 + 106 = 306.5)
   rounds to client 307, canvas row 201 (master run 2, E.1 read `[60, 201]`). The probe now undoes
   its own commit and says so.
3. Frame hover outlived the gesture: hover is recomputed on a canvas mousemove only, and the park
   point was off the canvas (master run 2, the composite row one column wide at dpr 1). The park
   now crosses a neutral canvas point.
4. At camera X 0 the composite IS the map (`ojz_act1_floor` scrolls by camX times a factor), so the
   composite row measured the frame's edges a second time (master run 3's per-row runs: only
   `[0, 1]` and `[320, 321]`). It now steps the camera to 64 with Shift+Arrow and requires a
   quarter of the interior to differ first.
5. The canvas's last device column is only partly under the CSS surface at a fractional
   `rect * dpr`. One such column differed 432 CSS px from the frame (wrongway-native, master-run4).
   Scans drop a run wholly inside the last device index, and row .10 refuses as UNMEASURABLE if the
   frame ever reaches the edge. Re-established under that method from the logged runs, and then
   directly by `master-final`: master's verdicts do not move. The column itself is a finding
   (section 9).

## 7. Every harness run

All runs used `ELECTRON_BIN` from the main checkout and `AURORA_BUILT_TREE` pointed at this
worktree. Each printed `root: <this worktree>`, `pinned: AURORA_BUILT_TREE=...`, `build: FRESH` and
`build flavour: DEBUG`. `AEON_DIR` was a `git archive` copy of aeon `origin/master`
`8061d1dd6e92c28b631946e9b2abacc7f8772c47`, never the live tree. Every run printed dpr, the canvas
rect and every aim. Native canvas rect is `{left 284, top 106, width 816, height 742}`. In the REAL
1.35 window it is `{left 283.993, top 105.984, width 661.192, height 620.393}`, store 893 x 838.
Uptime is at harness start.

| Run | Build under test | Phase N | Phase E | Rows | Log |
|---|---|---|---|---|---|
| master-run1 | master code | native dpr 1 | EMULATED 1.35 | 15/28, harness defect 1 | `master-run1.log` |
| master-run2 | master code | native 1 | EMULATED 1.35 | 19/28, harness defects 2-3 | `master-run2.log` |
| master-run3 | master code | native 1 | EMULATED 1.35 | 21/28, harness defect 4 | `master-run3.log` |
| master-real | master code | **REAL 1.35** | EMULATED 1 | 21/29 | `master-real.log` |
| master-run4 | master code | native 1 | EMULATED 1.35 | 23/30, red E.2-E.4, E.6-E.8, E.10 | `master-run4.log` |
| master-real2 | master code | **REAL 1.35** | EMULATED 1 | 24/31, red N.2-N.4, N.6-N.8, N.10 | `master-real2.log` |
| master-run5 | master code | native 1 | EMULATED 1.35 | 24/31 (identity equal to run 4) | `master-run5.log` |
| master-real3 | master code | **REAL 1.35** | EMULATED 1 | 25/32 (identity equal to real2) | `master-real3.log` |
| wrongway-native | fix + wrong-way hit tests | native 1 | EMULATED 1.35 | 23/30, red E.3-E.5, E.7-E.10 | `wrongway-native.log` |
| wrongway-real | fix + wrong-way hit tests | **REAL 1.35** | EMULATED 1 | 24/31, red N.3-N.5, N.7-N.10 | `wrongway-real.log` |
| fixed-run1, 2, 3 | fix `be428ed4` | native 1 | EMULATED 1.35 | 31/31 each | `fixed-run1.log` ... |
| fixed-real1 | fix `be428ed4` | **REAL 1.35** | EMULATED 1 | 32/32 | `fixed-real1.log` |
| master-final | master code, final harness | native 1 | EMULATED 1.35 | 25/32, red E.2-E.4, E.6-E.8, E.10 | `master-final.log` |
| master-final-real | master code, final harness | **REAL 1.35** | EMULATED 1 | 26/33, red N.2-N.4, N.6-N.8, N.10 | `master-final-real.log` |
| **fixed-final1** | fix, final harness | native 1 | EMULATED 1.35 | **33/33** (uptime 159181s) | `fixed-final1.log` |
| **fixed-final2** | fix, final harness | native 1 | EMULATED 1.35 | **33/33** (uptime 159421s) | `fixed-final2.log` |
| **fixed-final3** | fix, final harness | native 1 | EMULATED 1.35 | **33/33** (uptime 159532s) | `fixed-final3.log` |
| **fixed-final-real** | fix, final harness | **REAL 1.35** | EMULATED 1 | **34/34** (uptime 159293s) | `fixed-final-real.log` |
| i2-mutation | fix + snap centre `+0` | native 1 | EMULATED 1.35 | 32/33, red N.I2 only (uptime 160067s) | `i2-mutation.log` |

(wrongway-real's E.10 at emulated 1 passed; its N.10 red is the wrong-way build at REAL 1.35.)
The "fixed-run" and "master-run" rows before `master-final` ran earlier harness versions. Their
verdicts were re-derived under the final method as described in section 6 item 5, and then
re-measured directly by the final four runs and `master-final`/`master-final-real`.

**The REAL factor.** `--force-device-scale-factor=1.35`, passed by `SCALE=1.35` on the
`xvfb-run ... electron` launch, TAKES. `devicePixelRatio` reads 1.350000023841858, the window
becomes 1244 x 777 CSS on the 1680 x 1050 screen, and the canvas rect goes fractional. It is a real
compositor scale on a virtual display, not an emulation. It is still not a real scaled monitor,
which only the owner has (section 10).

## 8. Suite and typecheck

Run on the final tree, with src at the fix plus the recorder change (`1bd40ec7`) and the packet
committed (`83d0abc6`):

- **vitest: 613 test files passed, 3 skipped (616); 9423 tests passed, 9 skipped (9432); 0
  failed.** Duration 18.16s, started at uptime 159782s (load 2.18). `failure-class: no failures in
  this run (616 module(s) reported)`. `skip-report: OK. Every skip named its reason`: all 9 are
  pre-existing rows gated on an environment variable (for example `AURORA_FG_GATE_FILE`), none of
  them this parcel's. This parcel's own file, `src/renderer/canvas/__tests__/dpr-chrome.test.ts`,
  is 175 of those, all green.
- **`tsc --noEmit`: rc 0**, inside the same chain, before vitest.
- **Every `check:*` gate: OK.** `check-test-collection` (616 of 616 collected), `check-pseudo-skip`,
  `check-peer-path-literals`, `check-doc-citations` (this packet's cited paths are tracked),
  `check-object-stringify`, the four dash gates, `check-guide-text`, `check-prose-constants`,
  `check-ledger-timestamps`, `check-python-resolver`, and `check-harness-guards` (277 clean of 277
  classified, the new harness included).
- **`check-cited-paths`: OK, rc 0, measured separately.** `npm test` as one command cannot pass it
  in this worktree. The chain stops there with COULD NOT MEASURE, because the worktree's
  `node_modules` is a symlink to the main checkout and `git check-ignore` refuses paths beyond a
  symlink, so the gate's own exit-0 self-test comes back empty. That is exactly what
  `docs/reviews/2026-09-10-cdp-sweep.md` records, and it is an artifact of the worktree, not of
  these files. So the gate was run on its own with the symlink removed: all four arms of its ignore
  query proven, and every in-repo path named in a comment on disk. The rest of the chain ran in
  `package.json`'s own order with the symlink in place.
- **The first full attempt was red, and it was this parcel's.** At uptime 159703s vitest read 1
  failed / 9422 passed / 9 skipped: `test/renderer/no-raw-hex.test.ts`, 2 raw hex literals in
  src/renderer against a ceiling of 0. They were the recorder's `'#000'` placeholder styles, since
  the guardrail counts `__tests__` too. That was fixed in `1bd40ec7`; the guardrail reads 0.

## 9. Findings outside this parcel's change (TAGGED)

- **TAG(follow-up, map-canvas edge clear):** at `MapViewport.tsx` line 1462, the showBgPlane-off
  branch (the default) clears for the composite with `ctx.fillRect(0, 0, rect.width, rect.height)`,
  the container's CSS rect. The backing store maps to `canvas.width / dpr`
  (1102 / 1.35 = 816.30 CSS against rect 816). So at a fractional `rect * dpr` the last device
  column is left partly uncleared while the composite is on. Measured by row .10's note: alpha 154
  against 255 at an emulated 1.35 (816 x 1.35 = 1101.6, 60% covered), and 156 at the REAL 1.35
  (661.19 x 1.35 = 892.61). The no-act path at line 1314 already uses `cssWidth, cssHeight`, which
  is the fix. Not made here: it is not an identity reset, and at dpr 1 with a fractional container
  rect it would change one column's pixels, a look change the brief says not to ship silently.
- **TAG(follow-up, classic canvas sharpness):** `ClassicLevelViewport` sizes its store as
  `floor(rect)` CSS pixels and never times dpr, so at a scale factor above 1 the browser upsamples
  it. This is the state MapViewport's own docblock describes fixing for itself (*"the map was
  resampled up from too few pixels"*). Its draw and its grab agree, so it is not this defect.

## 10. TAGGED foreground items

- **TAG(owner): a real scaled display.** Both instruments here are on Xvfb: an emulation, and a
  forced compositor factor. On the owner's own monitor at 125%, 135% or 150%, press and drag a
  layer guide and a screen-frame edge on the Effects facet, and confirm the line he sees is the line
  that moves.
- **TAG(owner): LOOK CALL at 1.35** (section 5): the labels at their CSS size, and the heavier
  `plane_y` casing.

## 11. Where the tree contradicted the brief

- **Five wrong sites, not two files.** The brief's defect names the guides and the frame. The same
  identity reset also mis-placed the camera preview composite (measured at 237.69 of a 320 CSS
  frame) and the band lens caption. Both are fixed, since both are placed by CSS geometry on the
  same dpr-scaled canvas.
- **The brief's list of seven identity sites was complete.** A fresh grep, including
  `resetTransform`, found no others.
- **"About a quarter off"** is exactly 1 - 1/1.35 = 26% at 1.35, and it scales with the factor.
- **The forced factor takes.** `scratchpad/effects-guides-harness.mjs` records that
  `--force-device-scale-factor=1` "was tried and does NOT take here". On today's launch path, with
  harness-guard's ozone x11 pin and private profile, `--force-device-scale-factor=1.35` does take.
  Whether `=1` takes was not re-tested.
- **One new harness, not two extended.** The brief allowed either. One registered harness carries
  both the emulated and the real instrument and both subjects, and the two older harnesses keep
  their own subjects.
- **The drag contract rounds before it clamps.** A press and release on the drawn line at a
  half-pixel aim writes the neighbouring row (200 becomes 201). That is the app behaving as
  specified (`clampLayerTop(round(...))`), not a defect, but a probe that presses a line must undo
  what its release wrote.
- **ROADMAP section 5.1 has no row for OBS.DPR**, so it was not edited.

## 12. Commits

On `parcel/dpr-guides-offset`, oldest first. The tip is the commit that fills this section, so
it cannot name itself; the final report names it.

| Commit | What |
|---|---|
| `fe5193d6` | instruments: the harness, the recording 2D context, master's dpr-1 golden (before any src change) |
| `e330784b` | harness: the probe undoes its own commit, park clears hover, the composite row prints its runs |
| `5a09df4a` | harness: the composite row moves the camera off 0; identity pinned to the parallax sub-tab |
| `be428ed4` | **the fix**: five chrome draws in the CSS frame, snapped to the device grid; 175 node rows |
| `d8675a46` | harness: diff scans ignore the canvas's last, partly covered device column and row |
| `96c3a542` | harness: the two fixed states captured in every phase (look at 1.35, identity at 1) |
| `1bd40ec7` | recorder: no colour literal (the `no-raw-hex` guardrail counts `__tests__` too) |
| `83d0abc6` | this packet and its 53 captures |

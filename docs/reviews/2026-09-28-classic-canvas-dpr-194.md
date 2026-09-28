# Row 194: CLASSIC-CANVAS-BLUR-DPR, the Sonic 1 level canvas at every display scale

Branch `parcel/classic-canvas-dpr-194`, from master `450d0a04`. Evidence files are in
`docs/reviews/194-classic-dpr/`.

The ruling (ROADMAP row 194, 2026-09-28, under the owner's 2026-09-18T19:27:49Z look
permission): crisp. The canvas backing store follows the display scale and pixel art is
drawn nearest-neighbour, so a 100% and a 150% display show the same hard pixel edges.
Drawing and grabbing must still agree at every scale.

## 1. Where the row came from, and the pointer contract it must keep

The row was found by the scaled-display fix, `67397a46` ("merge: dpr-guides-offset"),
packet `docs/reviews/2026-09-12-dpr-guides-offset.md`. Its section 2 table lists
`ClassicLevelViewport.tsx` like this: the store is not dpr-scaled
(`canvas.width = floor(rect.width)`), the coordinates are CSS px, and the pointer is
mapped through `screenToWorld(cam, clientX - rect.left, ...)` in CSS. Its section 9
TAG says the canvas is upsampled above dpr 1 and that draw and grab agree.

That packet ruled that CSS is the canonical frame. The fix keeps it. Every pointer path
(`worldUnderCursor`, the wheel zoom, F7) still reads `clientX - rect.left` in CSS px,
and not one of them changed.

**The existing dpr pattern, reused rather than reinvented.** `MapViewport.redraw` (aeon's
map) already does this job. It uses a `deviceScale()` read on every call with a hostile
fallback to 1, a store of `round(rect * dpr)`, `setTransform(dpr, 0, 0, dpr, 0, 0)`,
`imageSmoothingEnabled = false`, a CSS extent derived back as `canvas.width / dpr`, and
`imageRendering: 'pixelated'`. `CollisionLegend` and `AnchorSweepPreview` size their
stores the same way. `deviceScale()` was private to MapViewport. It moved to
`src/renderer/canvas/device-grid.ts` with its docblock, and both map surfaces now import
it.

**No DPR-change listener exists anywhere in the codebase.** A grep for `matchMedia` and
`resolution` finds nothing. MapViewport re-reads the factor only when something else
makes it redraw. So none was added (see Open).

## 2. The defect, re-measured before the fix

The harness (section 4) was committed first (`a3cf7116`) and run on that tree. That tree
is master plus read-only probe members and the harness, with the canvas code untouched.
Log: `194-classic-dpr/before-run.log`. Result: 8/10.

| scale | row | result |
|---|---|---|
| 1 | all five | PASS, 0 foreign colours |
| 1.5 | s1.5.1 store size | **FAIL**: `canvas.width 576 vs rect.width*dpr 864.000`, height 542 vs 813 |
| 1.5 | s1.5.2 hard pixels | **FAIL**: `1082 of 5184 device px are colours the store never drew (280 distinct)` |
| 1.5 | s1.5.3 / s1.5.4 click, hover | PASS: draw and grab already agree |

Here is the device row across the GHZ1 chunk-45 | chunk-49 edge at 1.5, before the fix:
`... 0a0c12 1d1f15 89892a a6a62f a6a62f a6a62f a6a62f b1b12f eeee2f ffff2f`. That is a
filtered ramp. After the fix, the same row reads `0a0c12 x8, 929200 x6, ffff00 x2`,
which is the scale-1 row (`0a0c12 x8, 929200 x4, ffff00 x4`) with each world pixel 3
device px wide instead of 2.

Screenshots (full window, device px):

- before: `194-classic-dpr/before-scale1.png` and `194-classic-dpr/before-scale1.5.png`
- after: `194-classic-dpr/after-scale1.png` and `194-classic-dpr/after-scale1.5.png`

## 3. The fix (`030d91b3`)

- **`classicBackingStore(rectW, rectH, dpr)`** (`classic/viewport-math.ts`, pure).
  - The store is `max(1, floor(rect * dpr))` device px.
  - The CSS box is `store / dpr`, exactly.
  - Floor, not round: the canvas never overhangs its overflow-hidden container, and at
    dpr 1 the result is the pre-fix `floor(rect)` to the pixel.
  - This differs from MapViewport's `round`. MapViewport's canvas is `width: 100%`.
    Classic's canvas has no CSS width of its own, so its CSS box must be set explicitly
    from the store.
- **`measure()`**
  - It writes the device store and `style.width` / `style.height` = the CSS box. The
    CSS box must be explicit, because an absolutely positioned canvas with no CSS width
    lays out at its attribute size, which would be `dpr` times too big.
  - `sizeRef` now carries `{ w, h }` in CSS px plus the `dpr` the store was sized at.
- **The draw** starts from `setTransform(dpr, 0, 0, dpr, 0, 0)`, where it used to start
  from the identity, with smoothing still off.
  - Everything below it draws in CSS px, unchanged: the chunks, overlays, ghosts,
    `visibleChunkRange` and the occlusion `visible` rect.
  - `dpr` is the measured one from `sizeRef`, never a fresh read, so the store and the
    transform always match.
- **`imageRendering: 'pixelated'`** on the canvas, as MapViewport has it. This decides
  the filter only if a sub-pixel layout ever makes the compositor resample.
- **`drawCollision(..., dpr)`**, a REQUIRED parameter. The overlay read
  `ctx.getTransform().a` as "screen px per world px". On the device store that value is
  zoom × dpr.
  - The angle mark's density gate, tier and stroke widths now divide the dpr back out.
    They stay in CSS px, as aeon's overlay states them.
  - The surface hairline is `deviceStrokeWidth(1, dpr) / a`, which is exactly `1 / a` at
    dpr 1.
  - The seven existing test call sites pass `1`.

## 4. Tests and their red-first proof

### Node suite (all wired into `npm test`'s `vitest run`)

| file | rows | red-first |
|---|---|---|
| `classic/__tests__/classic-device-scale.test.ts` (mounts the real component) | store = `floor(rect×dpr)` and CSS box = store/dpr at 1, 1.25, 1.35, 1.5, 2, 3 (6); hostile ratios fall back to 1 (7); base transform `[dpr,0,0,dpr,0,0]` and every chunk blit with smoothing off at 1, 1.5, 2 (3); a right-click either side of x=256 eyedrops chunk 1 then chunk 2 at 1, 1.5, 2 (3) | against the unfixed component, committed at `4e10c5e1`: **8 failed / 11 passed** (`red-unfixed-component.log`). The 6 size rows were red, the dpr-1 one because the CSS width was unset. The transform rows were red at 1.5 and 2. The hostile and pointer rows were green, as they must be on the unfixed code, and are proved by M1 and M3 below |
| `classic/__tests__/classic-backing-store.test.ts` (pure) | 5 rects × 6 factors property rows, factor 1 = pre-fix floor, a zero box gives 1×1 (32) | 32 red with `classicBackingStore is not a function` (`red-no-helper.log`); then M4 |
| `classic/__tests__/classic-overlays.test.ts` (+1 row) | at 1.5 the angle-mark tier is decided in CSS px | M5 |

Planted mutations. Each one was applied to a committed baseline and shown on disk (the
`.diff` files). Each was restored with `git show HEAD:<path> > <path>`, and the tracked
tree was confirmed clean afterwards. The four unit files were then re-run on the restored
baseline: 85/85 (`restored-baseline-unit.log`).

| id | mutation | unit result | harness result |
|---|---|---|---|
| M1 | pointer mapped through the device scale: `(clientX - rect.left) * dpr` (`M1-pointer-times-dpr.diff`) | pointer rows red at 1.5 and 2, green at 1 (2 failed / 17 passed, `M1-unit.log`) | **s1.5.3 and s1.5.4 FAIL**, all else PASS, 8/10 (`M1-harness.log`). A right-click left of the edge eyedropped B (49) where A (45) was wanted, and the hover changed box `431..816` where cell A is `48..431` |
| M2 | draw back at the identity on the device store (`M2-draw-identity.diff`) | transform rows red at 1.5 and 2 (2 failed / 17 passed, `M2-unit.log`) | **s1.5.4 FAIL** only, 9/10 (`M2-harness.log`): the ghost was drawn at 31..288 where the grab's cell is 48..431 |
| M3 | `deviceScale` without the hostile guard, `(dpr as number) ?? 1` (`M3-no-fallback-guard.diff`) | 10 failed / 26 passed across classic-device-scale and map-device-scale: the 0, -2, NaN, Infinity and '2' rows in each file. The `undefined` and `null` rows stay green, because `??` covers exactly those two | n/a |
| M2b | the M2 plant again, against `dpr-chrome.test.ts`'s identity-reset census (after `c7bc75cd`) | `every identity reset left is on a canvas whose backing store is not dpr-scaled` red, 1 failed / 174 passed (`M2b-census.log`) | n/a |
| M4 | `round` instead of `floor` in `classicBackingStore` (`M4-round-not-floor.diff`) | 26 failed / 25 passed (`M4-unit.log`) | n/a |
| M5 | the overlay reads `getTransform().a` raw (`M5-overlay-raw-a.diff`) | the new tier row fails, 1 failed / 16 passed (`M5-unit.log`) | n/a |

What does not discriminate, stated plainly:

- **s.2 does not see M2.** A draw at the wrong scale still paints only store colours; it
  paints them in the wrong place. s.4 is the row that catches a draw/grab split.
- **The dpr-1 transform row is green on the unfixed code**, because the identity is the
  right answer at 1.
- **s.3 and s.4 are green before the fix.** They guard against a regression; they do not
  detect the defect, which is why M1 and M2 were needed to prove them.

### On-screen harness: `npm run harness:classic-canvas-dpr` (registered in package.json)

`scratchpad/classic-canvas-dpr-harness.mjs` makes one app launch per scale, using
`--force-device-scale-factor`. The new, opt-in `opts.electronArgs` on
`canvas-cdp-harness.mjs`'s `session()` carries the flag. Every row is judged inside its
own launch, and no number crosses launches.

- **Setup.** The harness opens GHZ act 1, turns animated-art playback off through the
  View-menu action, and picks from the document a column edge whose two cells hold
  different non-air chunks. This run found col 13, row 2, A=45, B=49. It then sets an
  integer camera at zoom 2. Rows s.0 to s.4 are listed in the harness header.
- **Aiming.** Every mouse event goes to an integer client pixel. The expected cell is
  derived back from that integer through `world = cam + (clientX - rect.left) / zoom`.
- **s.2 reads a real `Page.captureScreenshot`.** The harness checks that the image is in
  device pixels: 1680x1008 = innerWidth×1.5.
- **s.3 uses real right-press and right-release events.**
- **s.4 uses real clicks.** Those clicks select the Layout facet and the dock's Stamp
  Chunk button. Classic binds no tool keys, because `toolForKey` is wired only in aeon's
  MapViewport. A real hover then paints the ghost, and the row measures the bounding box
  of the store pixels that changed.

Runs of the fixed build (`VITE_AURORA_DEBUG=1 npm run build`), with `ELECTRON_BIN` set
to the main checkout's electron and `AURORA_BUILT_TREE` set to this worktree:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ab34b6ed775224009
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ab34b6ed775224009
```

The same `root:` and `pinned:` lines appear in every run: before, after, M1 and M2. None
of them names the main checkout. The fixed build passed **10/10 in four separate runs**
(`after-run1.log` to `after-run4.log`). Each run forced dpr 1 and 1.5 and read them back.

At 1.5 in each of those runs:

- the canvas was 864x813 device px, against a rect of 576x542 CSS, with
  `style.width 576px`;
- the screenshot had **0 of 5184** device px in colours the store never drew (9 colours,
  330 neighbour changes);
- the right-clicks eyedropped 45 then 49;
- the ghost changed box was `47..432 x 213..599`, against cell A at
  `48..431 x 214.5..597.5`, tolerance 2.

## 5. Suite

`VITEST_MAX_WORKERS=4 npm test`, with `TMPDIR` under `$HOME`.

**First run, on `030d91b3`: 1 failed.**

```
 Test Files  1 failed | 678 passed | 3 skipped (682)
      Tests  1 failed | 10636 passed | 20 skipped (10657)
skip-report: 20 SKIPPED test(s) in 8 file(s). A SKIP IS NOT A PASS:
skip-report: OK. Every skip named its reason.
failure-class: 1 failure record(s) in 1 file(s) (1 failed test(s); a hook or collection failure has no failed test of its own).
run-completeness: COMPLETE, 682 of 682 module(s) this run selected finished.

  src/renderer/canvas/__tests__/dpr-chrome.test.ts
    [ASSERTION] no identity reset is left in the renderer except on canvases that are not dpr-scaled > and each of those sites still has one, so the list cannot outlive what it names
        AssertionError: expected [ 'canvas/raster-timeline.ts' ] to include 'components/classic/ClassicLevelViewpo…'
```

This failure is correct and is a finding. The dpr-guides-offset census listed the classic
canvas as an UNSCALED site whose identity reset was right. The fix removed that reset,
so the end-condition row fired as designed. Commit `c7bc75cd` takes classic off the
list. The sibling row now guards it: **M2b** plants the identity reset back into the
classic draw, and that row reds, 1 failed / 174 passed (`M2b-census.log`). The file was
restored from HEAD and re-run at 175/175.

**Final run, on the tip before this packet (the census commit):**

```
 Test Files  679 passed | 3 skipped (682)
      Tests  10637 passed | 20 skipped (10657)
skip-report: 20 SKIPPED test(s) in 8 file(s). A SKIP IS NOT A PASS:
skip-report: OK. Every skip named its reason.
failure-class: no failures in this run (682 module(s) reported).
run-completeness: COMPLETE, 682 of 682 module(s) this run selected finished.
```

## 6. Open

- **No re-size on a pure scale change.** A window dragged to a monitor with another
  scale factor keeps its old store until the next container resize.
  - The draw reuses the store's own `dpr`, so the picture stays self-consistent. It is
    correct in position and only not sharp.
  - Browser zoom does re-measure, because it changes the container's CSS rect.
  - No surface in the codebase listens for a scale change, MapViewport included, so
    none was invented here. The brief conditioned this on an existing pattern.
  - The standard mechanism, if wanted for both maps, is a
    `matchMedia('(resolution: <dpr>dppx)')` change listener, or a ResizeObserver on
    `device-pixel-content-box`.
- **Vector chrome on the classic canvas is not snapped to the device grid.** This covers
  the stamp ghost outline, grid-like strokes, the marquee and the collision stroke
  widths. They are drawn at CSS widths (for example 1 CSS px = 1.5 device px at 1.5),
  antialiased as before. The ruling names pixel art, and the pixel art is nearest-
  neighbour. MapViewport's chrome snaps through `device-grid.ts` (`snapStroke`). Applying
  that to classic's overlays would be a separate look change for the owner's eye.
- **TAG(owner): a real scaled display.** Every instrument here uses Xvfb with a forced
  compositor factor. On the owner's own monitor at 125% to 150%, the check is that the
  Sonic 1 level shows hard pixel edges, and that a right-click eyedrop and a stamp land
  on the chunk under the cursor.
- **Not measured:** fractional factors other than 1.5 on screen. 1.25, 1.35, 2 and 3 are
  covered in the node suite only. Real hardware is not measured at all.

## 7. Where the files contradicted the brief

- The brief said to confirm a click "at a known tile". Classic's right-click eyedrop
  resolves a layout CELL (a 256 px chunk), which is the unit a stamp or eyedrop grabs.
  The rows aim 2 CSS px either side of a chunk edge, so a one-pixel mapping error is
  still caught.
- The brief said to register the harness "if the harness supports passing"
  `--force-device-scale-factor`. The shared `session()` did not support it, so it now
  takes `opts.electronArgs`. When that option is absent, the launch line is unchanged.

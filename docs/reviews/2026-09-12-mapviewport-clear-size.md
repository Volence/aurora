# The map canvas's edge clear: the container's rect against the canvas's own

Parcel `parcel/mapviewport-clear-size`, cut from master `b8090d5b`. Opened by the
`TAG(follow-up, map-canvas edge clear)` in `docs/reviews/2026-09-12-dpr-guides-offset.md`
section 9, which found this defect and deliberately did not fix it. No emulator was touched.
Every log, scan record and capture cited below is in
`docs/captures/2026-09-12-mapviewport-clear-size/`.

## Verdict

- **Fixed.** `MapViewport.redraw`'s camera-preview clear now spans `cssWidth, cssHeight`,
  the CSS extent of the backing store, instead of the container's rect. One line, and the
  spelling every sibling clear in the same pass already uses.
- **The defect's shape is exactly what the arithmetic says.** It is the canvas's last device
  column and last device row, and nothing else: across five exercising geometries, 0 of the
  1343/1800 translucent pixels lay outside them. The alphas match `round(255 * (1 - deficit))`
  within one: 128/128, 192/191, 224/223, 240/239 at dpr 1, and 154/153 at 1.35 — the same
  154 the dpr-guides-offset packet recorded, re-derived here by a different instrument.
- **⚠ THE dpr-1 VERDICT IS NOT "IDENTICAL", AND IT IS THE OWNER'S CALL.** In every dpr-1
  geometry this application produced on its own, the fix is byte-identical: the native
  window (rect 816 x 742, hash equal in three runs and the PNGs byte-identical under `cmp`),
  and the genuinely fractional dpr-1 rect the forced-1.35 window makes (661.192 x 620.393,
  byte-identical). But a container rect whose CSS width or height has a fractional part
  **at or above 0.5** does change at dpr 1, and this parcel produced four such rects by
  imposing them. Section 4 quantifies exactly which pixels and by how much. **This parcel
  stops there for a ruling.**
- **Red-first, both directions.** The row is red on master's code in every geometry with a
  positive deficit (runs `master-base`, `master-f2`, `master-real2`) and green in every one
  without. The old spelling planted back on top of the fix and rebuilt is red again in 11
  rows (`mutation`), and that mutated build's pixels are hash-identical to master's in all
  seven geometries and both composite states — so this one line is provably the entire
  behavioural difference between the two builds.

Final runs on the final build: three native runs at **57/57**, one REAL forced-factor run at
**58/58**. `npm test`: see section 7.

## 1. The defect, re-derived from source

The line the earlier packet pointed at has MOVED. Its coordinates were `MapViewport.tsx`
1462 for the composite clear and 1314 for the no-act path; on `b8090d5b` they were **1471**
and **1323**. Found by content, as the brief required.

`redraw` sizes the map canvas in device pixels and sets the transform:

```
const dpr = deviceScale();
canvas.width  = Math.round(rect.width  * dpr);
canvas.height = Math.round(rect.height * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const cssWidth  = canvas.width  / dpr;
const cssHeight = canvas.height / dpr;
```

and `cssWidth`'s own comment says why it exists: *"Derived BACK from the backing store
rather than from `rect` so it is exactly the region the transform maps onto."*

Let `x = rect.width * dpr` and `W = canvas.width = Math.round(x)`.

- `fillRect(0, 0, cssWidth, …)` covers exactly `[0, W)` device px. Full coverage, always.
- `fillRect(0, 0, rect.width, …)` covers `[0, x)`.
  - `frac(x) < 0.5` — it OVERSHOOTS `W` and the canvas clips it. **Identical.**
  - `frac(x) = 0` — identical.
  - `frac(x) >= 0.5` — the last device column, index `W - 1`, is covered `frac(x)` of the
    way across. The **deficit** is `W - x`, in `(0, 0.5]`.

The height is the same statement, independently. So the defect is present exactly when
`frac(rect * dpr) >= 0.5` in an axis, and its size there is `1 - frac`.

**Is there a reason in source for the two paths to differ?** No — and the brief asked. The
composite clear was the ONLY clear in the pass spanning the container's rect. Every sibling
already spans the surface the transform maps onto:

| Clear | Extent it uses | Where |
|---|---|---|
| the no-act arm (`CANVAS_VOID`) | `cssWidth, cssHeight` | `MapViewport.tsx` 1323 |
| the camera-preview arm (`CANVAS_BLACK`) | **`rect.width, rect.height`** | `MapViewport.tsx` 1471 — the defect |
| `drawCollisionPreview`'s `clearRect` | `w / dpr, h / dpr` | `MapViewport.tsx` 750 |
| `SectionRenderer.render`'s `clearBackground` arm | `viewport.width, viewport.height` | `SectionRenderer.ts` 415, and `MapViewport.tsx` 1330 builds that viewport out of `cssWidth/cssHeight` |

That last row is why the composite-off state is the control: it is the same surface, the
same scene and the same scan, in the state where this change does nothing.

## 2. The fix

```
-          ctx.fillRect(0, 0, rect.width, rect.height);
+          ctx.fillRect(0, 0, cssWidth, cssHeight);
```

`cssWidth`/`cssHeight` are already in scope eight lines above. Commit `f3dd024c`, with the
reason written beside it.

## 3. What is measured, and why it is an alpha

Assigning `canvas.width` **resets the backing store to transparent black**, so on every pass
the clear is the first ink on an empty surface. `CANVAS_BLACK` is `#000000`, opaque, so a
fully covered device pixel ends at alpha 255 and a partly covered one at about
`255 * coverage`. Nothing in the map canvas's path lowers alpha again: there is no
`globalCompositeOperation` anywhere in `src/`, and every `clearRect` in the renderer is on
an offscreen canvas or on the separate `map-preview-canvas`.

So the invariant the harness asserts is **derived, not observed**:

> After a full redraw, every pixel of `#map-canvas` has alpha 255.

`scratchpad/mapviewport-clear-size-harness.mjs`, registered as
`npm run harness:mapviewport-clear-size`, scans the whole backing store in each geometry
with the composite on (row `.2`) and with it off (row `.3`, the control), hashes the store
both ways round, and writes the hashes per geometry so another build can be compared against
them (`SCAN_OUT` / `SCAN_BASELINE`).

**Three classes of geometry, and a green means a different thing in each** (`classOf`):
`exercises` (a deficit at or above `MIN_DEFICIT`, the only class in which row `.2` is
evidence), `sub-raster` (a smaller positive deficit), `overshoots` (no positive deficit, so
the two spellings cannot differ at all). Row `.2` carries the words NOT EXERCISED or
SUB-RASTER in its own name where they apply, so a green row cannot be read as a pass for the
clear; run-level row `9a` fails a run in which no geometry exercised the defect.

## 4. THE dpr-1 VERDICT

### 4.1 Every dpr-1 geometry the app produced on its own: IDENTICAL

| Geometry | dpr | container rect | store | deficit | master vs fix |
|---|---|---|---|---|---|
| `N`, native window | 1 | 816 x 742 | 816 x 742 | 0.0000 / 0.0000 | composite-ON hash `df1c41559d327f80` both; composite-OFF `61e4ac79091d1d4c` both; PNGs byte-identical under `cmp` |
| `I025`, imposed 812.25 x 738.25 | 1 | 812.25 x 738.25 | 812 x 738 | **-0.2500** / -0.2500 | hashes equal both states; PNGs byte-identical |
| `E` inside the REAL 1.35 window, emulated dpr 1 | 1 | **661.192 x 620.393** | 661 x 620 | -0.1921 / -0.3935 | hashes equal both states (run `fix-real1` row `E.I2`) |

The third row is the important one: that is a **genuinely fractional container rect at
dpr 1**, produced by the window and not by this harness, and it is byte-identical because
its fractions (0.192, 0.393) are below 0.5, so the container-rect clear overshot and the
canvas clipped it.

Three witnesses agree, per the brief's two suggestions and one more: whole-store hashes
(rows `N.I2` and `I025.I2`, green in `fix-final1`, `fix-final2`, `fix-final3`), the saved
PNGs byte-compared with `cmp`, and the translucent-pixel counts (0 on both builds).

**Does this layout ever make a fractional container rect at dpr 1?** Measured rather than
assumed, run `fix-dpr1sweep`: 24 emulated viewport widths at `deviceScaleFactor` 1, from
1400 down to 1377. The container rect came back an **integer at every one of them** (816,
815, … 793) and the deficit was 0.000 every time. It is not a proof of impossibility —
Chromium can lay out a fractional CSS box at dpr 1, and the forced-1.35 window above is an
example of one — but nothing this window does on its own produces one, let alone one whose
fraction reaches 0.5.

### 4.2 A dpr-1 container rect with a fractional part at or above 0.5: **CHANGED**

To ask the question at all, the harness gives the map container an explicit fractional CSS
size (`flex: none; width: <n>.<f>px`) and lets the app's own `ResizeObserver` repaint it.
Four such rects, all at dpr 1, master `master-base` against fix `fix-final1`:

| Imposed rect | store | deficit | changed px | where | RGBA transition | largest on-screen difference |
|---|---|---|---|---|---|---|
| 812.5 x 738.5 | 813 x 739 | 0.5000 | 1343 | last device column + last device row, **0 outside** | 1301 of them `0,0,0,128 -> 0,0,0,255` | **13.5 / 255** at the corner, mean 8.8 |
| 812.75 x 738.75 | 813 x 739 | 0.2500 | 1343 | the same | 1320 of them `0,0,0,192 -> 0,0,0,255` | 7.8 / 255, mean 4.4 |
| 812.875 x 738.875 | 813 x 739 | 0.1250 | 1343 | the same | `0,0,0,224 -> 0,0,0,255` | 4.2 / 255, mean 2.2 |
| 812.9375 x 738.9375 | 813 x 739 | 0.0625 | 1343 | the same | `0,0,0,240 -> 0,0,0,255` | 2.1 / 255, mean 1.1 |

"Changed px" and "where" are from a PNG decode of the two captures
(`scratchpad/pngdiff.mjs`); "on-screen difference" composites both builds' pixels over the
ground they are actually seen against and takes the largest per-channel difference
(`scratchpad/pngdiff2.mjs`). That ground is `--void: #0A0C12` from
`src/renderer/styles/theme.css`: the canvas element sets no background of its own, and its
container is painted with that token.

**So what an author would see, at dpr 1, in such a window:** master leaves the canvas's
outermost device column and row as partly transparent black, through which the container's
`#0A0C12` shows — a hairline at most `#070909` lighter than the black beside it, worst case,
and progressively fainter as the fraction approaches 1. The fix makes that hairline the same
`#000000` as the rest of the cleared canvas. The change is toward the colour the surface
already is, on one pixel of border, and it is a change nonetheless.

The 42 pixels of the 1343 that are not `0,0,0,a` are ones where chrome or art also drew on
the partly-cleared edge (for example `210,82,82,217 -> 179,70,70,255`); composited, those
move by 1 to 4 of 255.

**⚠ PARCEL STOPPED HERE for the ruling.** The brief says a visible change at dpr 1 is the
owner's call, not mine. The fix is committed on this branch and every row is green; what is
being asked is whether 4.2 is acceptable, given that 4.1 shows it does not arise in any
geometry the app produces for itself.

## 5. Red-first, per row

### The defect, on master's own code

Row `.2` is red in every geometry with a positive deficit and green in every one without.
Three master runs, two instruments, each printing dpr, the rect, the store and the derived
deficit in its own output:

| Run | Instrument | Rows | Red |
|---|---|---|---|
| `master-base` | native dpr 1 + emulated 1.35 + five imposed rects | 44/49 | `E.2`, `I05.2`, `I075.2`, `I0875.2`, `I09375.2` |
| `master-f2` | the same | 44/49 | the same five |
| `master-real2` | **REAL** `--force-device-scale-factor=1.35` + emulated 1 | 47/50 | `N.2`, `I05.2`, `I075.2` |

`master-base` and `master-f2` are two separate launches of one build: every geometry's
composite-ON and composite-OFF hash is **identical between them**, so the hash is stable
across launches and a cross-build difference is the code.

### The regression, planted on top of the fix

Invariant 8(a) asks for the mutation shown on disk before the red run. The fix was
committed (`f3dd024c`), then the old spelling was put back:

```
$ git diff --stat
 src/renderer/components/MapViewport.tsx | 2 +-
-          ctx.fillRect(0, 0, cssWidth, cssHeight);
+          ctx.fillRect(0, 0, rect.width, rect.height);
```

rebuilt (`VITE_AURORA_DEBUG=1 npm run build`, rc 0), and run: `mutation`, **46/57**, red in
`E.2`, `E.I2`, `I05.2`, `I05.I2`, `I075.2`, `I075.I2`, `I0875.2`, `I0875.I2`, `I09375.2`,
`I09375.I2` and the both-sides row `9b`. It was then restored with
`git checkout f3dd024c -- src/renderer/components/MapViewport.tsx` — `git status` clean
after, so the restore is the committed baseline and not a hand edit — and rebuilt, and
`fix-final2` read 57/57.

**And the mutated build is master, pixel for pixel.** Its per-geometry hashes equal
`master-base`'s in all seven geometries and both composite states (`scan-mutation.json`
against `scan-master-base.json`). So the difference between the two builds is this line and
nothing else.

### The both-sides row, and why a green `.2` alone is not enough

**Later opaque drawing can cover the edge.** Measured: at the REAL 1.35 factor the last
device ROW came back fully opaque in every geometry — `master-real2`'s `N` read 717
translucent pixels, all of them in column 892, none in row 837 — while the same arithmetic
at dpr 1 left both the last column and the last row partly clear. The map is 620 CSS px tall
in that window against 742 at dpr 1, so the section art reaches the bottom edge there and
does not here. A green `.2` can therefore also mean "something painted over it".

Row **`9b`** closes that, against a baseline build measured in the SAME geometries: *every
geometry the baseline showed an uncleared edge in is fully cleared here AND its composite-ON
pixels moved; every geometry the baseline showed none in is byte-identical here.* Green in
`fix-final1/2/3` (against `master-base`) and in `fix-real1` (against `master-real2`); red in
`mutation`. Row `.I2` is its per-geometry form.

`fix-real1`'s `9b`, in full, is the REAL-factor both-sides statement:

```
N:      baseline 717 translucent px -> here 0; composite-ON hash CHANGED; composite-OFF same
E:      baseline   0 translucent px -> here 0; composite-ON hash same;    composite-OFF same
I05:    baseline 720 translucent px -> here 0; composite-ON hash CHANGED; composite-OFF same
I075:   baseline 720 translucent px -> here 0; composite-ON hash CHANGED; composite-OFF same
I0875:  baseline   0 translucent px -> here 0; composite-ON hash same;    composite-OFF same
I09375: baseline   0 translucent px -> here 0; composite-ON hash same;    composite-OFF same
I025:   baseline   0 translucent px -> here 0; composite-ON hash same;    composite-OFF same
```

### Anti-vacuous rows

`0a` the probes are in the bundle; `1a` the aeon COPY is open with sections; `1b` the Effects
facet was entered by a real click; `1c` **the branch under test is the one running** (Bg
Plane overlay OFF, editing layer not `bg`, camera preview ACTIVE with real blits); `.0` the
store really is `round(rect * dpr)` in this geometry; `.1` the composite is active in it;
`.2x` the geometry is still the class it was set up as when its rows run; `.I1` the store
hashes the same on two reads of one paint; `4a` the imposed container style was put back
whole; `9a` at least one geometry exercised the defect.

## 6. Where the instrument was wrong, and how each was caught

Recorded because each would otherwise have passed or failed for the harness's reason.

1. **The restore deleted what it meant to put back.** `styles.container`'s `flex: 1` is an
   inline style React writes, so `el.style.flex = ''` removes it, the container collapses to
   width 0, and the next `getImageData` dies with "The source width is 0". Run `master-run2`
   aborted that way AFTER its rows had passed — the shape that reads as a result. The
   element's `cssText` is now saved and put back whole, and row `4a` checks the geometry
   afterwards.
2. **Row `.2x` asserted the wrong thing.** It read "this geometry exercises the defect",
   which made the deliberately-below-threshold control geometry fail for being what it was
   set up to be. It now asserts the geometry is the CLASS it was declared as, from an
   independent read taken before the phase.
3. **`MIN_DEFICIT` stood on one observation, and the observation was misread.**
   `master-real`'s `I025` left a 0.0625 device px height deficit and the scan found nothing,
   which set the constant at 0.25. At dpr 1 the same 0.0625 deficit reads alpha 240 against
   the arithmetic's 239 — so there is no rasteriser floor there at all, and the earlier
   reading was the art covering the row (defect 4 below), not the rasteriser. The
   `sub-raster` class and the geometries at 0.125 and 0.0625 are kept so every run prints
   where that floor is rather than inheriting the number.
4. **A deficit is not a guarantee that a translucent pixel survives** — the finding behind
   row `9b`, in section 5.
5. **Row `.I2` asserted blanket identity**, which made the fix's own run red in the five
   geometries it repairs: a row that could not be green on either build. It now asserts the
   relation the baseline's own measurement requires.
6. **The instrument refuses an incomparable pair rather than answering.** Run
   `fix-dpr1sweep` runs its `E` phase at emulated dpr 1, where the store is 816 x 742 while
   the baseline's `E` was 1102 x 1002 at 1.35. `E.I2` and `9b` went RED reading
   *"NOT COMPARABLE, and not a verdict either way"*. That run's two reds are the refusal, not
   a finding; every other row in it is green, including all four imposed geometries against
   the baseline.

## 7. Every run

All runs used `ELECTRON_BIN` from the main checkout and `AURORA_BUILT_TREE` pointed at this
worktree, and each printed `root: <this worktree>`, `pinned: AURORA_BUILT_TREE=…`,
`build: FRESH` and `build flavour: DEBUG`. `AEON_DIR` was a `git archive` copy of aeon
`origin/master` `47bc76d4b34013042b3b09ac4254839efe4c0aea`, never the live tree. Native
canvas rect is `816 x 742` at dpr 1; in the REAL 1.35 window it is `661.192 x 620.393`,
store `893 x 838`. Uptime is at harness start.

| Run | Build under test | Phases | Rows | Log |
|---|---|---|---|---|
| `master-run1` | master code | — | aborted on `window.__dbg.selectedTile` (it is `__dbg.aeon.selectedTile`) | not kept |
| `master-run2` | master code | native 1, imposed, emulated 1.35 | 23/27 then ABORTED (instrument defect 1) | `master-run2.log` |
| `master-final` | master code | native 1 + emulated 1.35 + 3 imposed, SWEEP at 1.35 | 34/37, red `E.2`/`I05.2`/`I075.2` | `master-final.log` |
| `master-real` | master code | **REAL 1.35** + emulated 1 + 3 imposed | 35/38 | `master-real.log` |
| `master-f2` | master code | native 1 + emulated 1.35 + 5 imposed | 44/49, red the five | `master-f2.log` |
| **`master-base`** | master code, final harness | the same | **44/49**, red the five (uptime 190862s) | `master-base.log` |
| **`master-real2`** | master code, final harness | **REAL 1.35** + emulated 1 + 5 imposed | **47/50**, red `N.2`/`I05.2`/`I075.2` (uptime 191787s) | `master-real2.log` |
| `fix-run1` | fix `f3dd024c` | native, vs `master-base` | 52/57 (instrument defect 5, since corrected) | `fix-run1.log` |
| **`fix-final1`** | fix `f3dd024c` | native 1 + emulated 1.35 + 5 imposed | **57/57** (uptime 191345s) | `fix-final1.log` |
| **`fix-final2`** | fix, rebuilt after the mutation was restored | the same | **57/57** (uptime 191517s) | `fix-final2.log` |
| **`fix-final3`** | the same build | the same | **57/57** (uptime 191589s) | `fix-final3.log` |
| **`fix-real1`** | fix, rebuilt | **REAL 1.35** + emulated 1 + 5 imposed | **58/58** (uptime 191890s) | `fix-real1.log` |
| `fix-dpr1sweep` | fix | native 1 + emulated **1** + 5 imposed, SWEEP at dpr 1 | 55/57, the two NOT-COMPARABLE refusals of defect 6 | `fix-dpr1sweep.log` |
| `mutation` | fix + the old spelling back | native 1 + emulated 1.35 + 5 imposed | **46/57**, red in 11 rows | `mutation.log` |

**The REAL factor.** `--force-device-scale-factor=1.35`, passed by `SCALE=1.35` on the
`xvfb-run … electron` launch, TAKES: `devicePixelRatio` reads 1.350000023841858 and the
canvas rect goes fractional. Row `2a` asserts it took rather than assuming so. It is a real
compositor scale on a virtual display, not an emulation, and still not a real scaled
monitor, which only the owner has (section 9).

**dpr varies between runs on this host, and every run printed its own.** Every native run
here read dpr 1; `master-real2` and `fix-real1` read 1.35. No claim in this packet is
assembled from two runs except the cross-build hash comparisons, which are exactly that by
design and name both runs.

`master-base` and `master-real2` are labelled in their own output with git HEAD `be194de8`
and `f3dd024c`. That is the TREE's HEAD, not the code that was built: both were built with
master's `MapViewport.tsx` checked out over the tree (`git show be194de8:…` for the first,
the saved pre-fix copy for the second). Their red rows are what show the bundle was
master's, and `git status` was clean before and after each restore.

## 8. Suite and gates

Run on the final tree (`f3dd024c` plus this packet):

- **vitest: 615 test files passed, 3 skipped (618); 9553 tests passed, 9 skipped (9562); 0
  failed.** Duration 40.52s. `failure-class: no failures in this run (618 module(s)
  reported)`. `skip-report: OK. Every skip named its reason` — all 9 are pre-existing rows
  gated on an environment variable, none of them this parcel's. Log: `vitest.log`.
- **`tsc --noEmit`: rc 0.**
- **Every `check:*` gate: OK.** `check-test-collection` (618 of 618 collected),
  `check-pseudo-skip`, `check-peer-path-literals`, `check-doc-citations`,
  `check-object-stringify`, the four dash gates, `check-guide-text`, `check-prose-constants`,
  `check-ledger-timestamps`, `check-python-resolver`, and `check-harness-guards` (281 clean
  of 282 classified, this harness and the two PNG readers included; the one
  unguarded-untracked entry is another parcel's untracked probe, not this one's).
- **`check-cited-paths`: OK, rc 0, measured separately.** `npm test` as one command cannot
  pass it in this worktree: `node_modules` is a symlink to the main checkout and
  `git check-ignore` refuses paths beyond a symlink, so the gate's own exit-0 self-test comes
  back empty and it stops with COULD NOT MEASURE. That is the worktree artifact
  `docs/reviews/2026-09-10-cdp-sweep.md` records. It was run on its own with the symlink
  removed: all four arms of its ignore query proven, and every in-repo path named in a
  comment on disk.

## 9. TAGGED foreground items

- **TAG(owner): the dpr-1 ruling** — section 4.2. A container rect with a fractional part at
  or above 0.5 at dpr 1 changes by one device column and one device row, at most 13.5 of 255
  per channel on screen. Nothing this app's layout produces for itself is in that state
  (section 4.1), so the change may never be seen; the decision is still the owner's.
- **TAG(owner): a real scaled display.** Both scaled instruments here are on Xvfb — an
  emulation and a forced compositor factor. On the owner's own monitor at 125%, 135% or 150%,
  turn the parallax composite on with the Bg Plane overlay off and look at the map's right
  and bottom edges: master leaves a faint hairline there, the fix does not.

## 10. Findings outside this parcel's change (TAGGED)

- **TAG(follow-up, `map-preview-canvas` is sized from the container too.**
  `drawCollisionPreview` sizes its store `Math.round(rect * dpr)` from the container rect and
  then clears `w / dpr, h / dpr`, which is correct for the clear. It is listed here only
  because the same `rect` is the source of the size; nothing in it was found wrong, and its
  clear is a `clearRect`, so an edge it misses is transparent either way.
- The `TAG(follow-up, classic canvas sharpness)` from the dpr-guides-offset packet is
  untouched and still open: `ClassicLevelViewport` sizes its store as `floor(rect)` CSS
  pixels and never times dpr.

## 11. Where the tree contradicted the brief

- **The line numbers had moved**, as the brief warned they might: 1462 -> 1471 for the
  composite clear and 1314 -> 1323 for the no-act path. Both were found by content.
- **The no-act path is not the only sibling.** The brief named it; `drawCollisionPreview`
  and `SectionRenderer.render` spell the same extent the same way, which is what makes the
  composite clear the odd one out rather than one of two conventions (section 1).
- **"One column" is one column AND one row.** The earlier packet's TAG described the last
  device column; the height carries the identical arithmetic, and at dpr 1 both were partly
  clear in every imposed geometry (1343 pixels = 685 columns of the last row + 659 rows of
  the last column, the rest of each having been painted over opaquely).
- **The 154 was reproduced without being copied.** The harness predicts `round(255 * (1 -
  deficit))` from the geometry it measures and prints both; at 816 x 1.35 that is 153 against
  a measured 154.
- **The brief's dpr-1 prediction was right about the mechanism and had no case to fire in.**
  It predicted "at dpr 1 with a fractional container rect it would change one column's
  pixels". True when the fraction reaches 0.5; the only fractional dpr-1 rect this window
  produces on its own has fractions 0.192 and 0.393, and is byte-identical.

## 12. Commits

On `parcel/mapviewport-clear-size`, oldest first. The tip is the commit that fills this
section, so it cannot name itself; the final report names it.

| Commit | What |
|---|---|
| `5eec6652` | the instrument and its registration, before any src change |
| `84e6a2e3` | the harness: the container style restored whole, the geometry class declared, the cross-build hashes |
| `be194de8` | the harness: row `9b`, and `MIN_DEFICIT` from a measurement rather than an assumption |
| `f3dd024c` | **the fix**: `cssWidth, cssHeight` for the composite clear, and row `.I2` corrected |
| this one | the packet, its 29 captures, and the two PNG readers |

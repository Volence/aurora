# The curve ramp — what the format actually admits, and the clock it never needed

**Date** 2026-08-28 · **Branch** `feat/curve-editor` · **Base** master `19b76d5`
**Parcel type** ROADMAP §4.6 editor surface, row 77.

---

## 0. THE PARCEL WAS BOOKED AS SOMETHING THE ENGINE CANNOT DO — read this first

ROADMAP §4.6 says the curve editor is *"sine params or 256-point freehand"*. **The
engine has no such capability and the format cannot express one.** Verified against
three independent statements of the contract before any design was done:

| where | what it says |
|---|---|
| `src/core/formats/effects/scene.ts:101` | `export type EffectsCurve = 'none' \| { to: EffectsFactor }` |
| `aurora-effects-scene.schema.json`, `$defs/layer.properties.curve` | `oneOf: [{const:"none"}, {type:"object", properties:{to:{$ref:"#/$defs/factor"}}, required:["to"], unevaluatedProperties:false}]` |
| aeon `engine/level/parallax.emp:221` | `pub struct band_curve (size: 10)` — `bc_to_s1`, `bc_to_s2`, `bc_flags`, `bc_pad`, and three words the engine DERIVES each frame |

`unevaluatedProperties: false` is the load-bearing clause: a third key on a curve is
not merely unused, it is **unrepresentable**. There are no sine parameters, no control
points, and no 256-point table anywhere in the contract.

**Where the phrase most likely came from.** §2.4 of the schema DOES define 256-byte
tables with `sine` and `triangle` generators — they belong to **`deform`**, a different
field on a different feature, whose `tableRef` the panel already edits. Conflating
`deform`'s table with `curve`'s two endpoints is a one-word slip that would have cost a
parcel.

**So the honest deliverable was smaller than "an editor", and this packet says so
plainly.** The control is one dropdown and has existed since parcel H. `curve` is
reachable through the running app and was proven so on 2026-08-27
(`reviews/2026-08-27-curve-vsplit-reachable.md`). **What did not exist was any depiction
of what the value does.** That is what this parcel built. **The format was not
widened**, and §4.6's sentence is corrected in place so the next reader is not sent
where this one nearly was.

---

## 1. VERDICT

| the parcel's question | answer |
|---|---|
| what does the curve format admit? | **exactly two endpoints**, measured three ways (§0) |
| did the preview need a clock? | **NO** — and the note saying it did was wrong (§2) |
| is the ramp on the canvas? | **yes**, measured in the canvas's own pixels (§4) |
| was anything else found? | **yes — a shipped defect that made the whole composite invisible** (§3) |

---

## 2. THE PREVIEW NEVER NEEDED A CLOCK, AND THE MEASUREMENT

`src/renderer/state/viewStore.ts:62` recorded the deferral as:

> *"no curve ramps, no deform (both need a clock this pass does not have)"*

**The parenthesis is true of deform and false of curves, and lumping them is what cost
the feature a pass.** Measured by reading the whole of the engine's curve code for a
phase or frame-counter reference:

* **`.cap_factor_curve_hoist`** (`parallax.emp:1189-1277`) — inputs are `Camera_X`
  (`move.l Camera_X, d0`), the band's authored `bc_to_*` bytes, and the two shadow band
  tops. It writes `bc_step`, `bc_rem`, `bc_span`. **No phase, no frame counter.**
* **`.lp_curve`** (`:1841-1906`) — inputs are those three parked words, the band's base
  scroll, and the LINE INDEX. Two adds and a conditional correction per line. **No
  phase, no frame counter.**
* **Contrast, deform** (`:1958` onward) — `move.w Parallax_Deform_Phase_FG, d6`, and
  `Parallax_Update` advances that phase by `speed` every frame. **That one really does
  need a clock**, which is why its absence line stays.

**A ramp is a function of POSITION.** MapViewport's measured zero-idle-repaint property
(37/37) was therefore never in its way, and the ruling already on record —
`reviews/2026-08-22-preview-posture-ruling.md`, *"camera bands preview clocklessly, only
timer bands need a clock"* — already covered it.

**The file's OWN booking note gave a different and better reason**, and that one was
right: a ramp guessed as a linear interpolation of the two ends is off by the truncation
at nearly every row. §5 is about that.

---

## 3. THE DEFECT THE HARNESS FOUND — the composite was drawn and then erased

While calibrating the pixel probe, the harness asked a question no row in this repo had
asked of this feature: **which pixels inside the frame does the composite actually
own?** It answers it by toggling the composite and keeping the rows that move.

**Answer, with the "Bg Plane" overlay off: none. 0 of 224 rows, at every `v_offset`
tried (0/64/128/192/256/320/384/448).**

`MapViewport`'s foreground branch called `drawCamera()` and then
`sectionRenderer.render(..., clearBackground = true)`, whose first act is a `fillRect`
over the **whole canvas**. So on every frame the preview was composed and then painted
black.

**Every instrument in the app said it was working:**

| instrument | what it said | why it was not lying |
|---|---|---|
| `cameraPreview().active` | `true` | the plan really was built |
| `cameraPreview().blits` | `81` | 81 real `drawImage` calls really were issued |
| `paints` | advancing | the draw body really did run |
| ~5,300 node tests | green | none of them can see a canvas |

The report is a **publish from the end of the draw body**, which is exactly the design
that makes it trustworthy — and it is still true when something later in the same frame
covers the result. **This is the defect class the whole effects arc has been about:**
the app holds the value, every instrument says yes, and the screen says nothing.

**Fixed** by moving the clear into MapViewport when the composite is going to draw and
telling `render` not to repeat it — which restores the order the `bgVisible` arm already
had and that `camera-preview.ts`'s docblock describes: backdrop, composite, then the
FOREGROUND over it. Harness row **6g** pins it: **224/224** composite-owned rows with the
overlay off, against 0/224 before.

---

## 4. WHAT WAS BUILT

| path | what |
|---|---|
| `src/renderer/canvas/camera-preview.ts` | **`curveRampRuns`** — transcription 5. `CurveRun`, `layerCurveTo`, the `ramp` field on `CameraPreviewBand`, per-run blitting, the ramp caption, and the removal of the absence line. |
| `src/renderer/components/MapViewport.tsx` | the clear-order fix (§3), + `cameraPreviewActive`. |
| `src/renderer/state/viewStore.ts` | the wrong deferral note replaced with the measurement (§2). |
| `src/renderer/canvas/__tests__/camera-preview.test.ts` | 11 new/inverted rows. |
| `scratchpad/curve-editor-harness.mjs` | **new.** 29 rows, CDP, real app. |
| `docs/ROADMAP.md` | row **77**; §4.6's stale sentence corrected in place. |

### What was REJECTED, and why

* **A freehand / sine curve editor.** The format cannot hold one (§0). Building it would
  have meant widening the contract to make a nicer panel possible, which the parcel was
  explicitly told not to do — and which would have broken the aeon build.
* **A second control for `curve`.** One dropdown already writes the only value there is,
  and it is proven reachable. A panel around a single enum is chrome.
* **A lerp for the ramp.** §5.
* **Forcing the ramp to end exactly on `to`.** `to` is the scroll at line `span`, which
  is the FIRST row of the next band; whether the last drawn row already shows it depends
  on where the truncation falls. A ramp made to land on `to` is a different function,
  off by roughly `spread/span` at every row above it. Written into the function's
  docblock so it is not "fixed" later.

---

## 5. WHY IT IS A TRANSCRIPTION AND NOT A LINEAR INTERPOLATION

Two things make the engine's answer differ from `base + (far - base) * i / span`, and
each is worth a pixel a row — on a feature that exists precisely for the rows *between*
its ends:

1. **THE ARITHMETIC HAPPENS IN HSCROLL-WORD SPACE, WHICH IS NEGATED.** The engine ramps
   the buffer word, `-decode`. **Floor division is not symmetric under negation**:
   `floor(-7/2)` is `-4`, `-floor(7/2)` is `-3`. Ramping the un-negated preview scroll
   is off by one on exactly the rows that do not divide evenly, and only for one sign of
   spread — the shape of bug that reads as "nearly right".
2. **THE REMAINDER IS CARRIED.** `divs.w` truncates toward zero; the engine then
   normalises the pair to a **floor** (`add.w d4,d2 / subq.w #1,d1`) because
   `.lp_curve`'s correction is one-directional.

**The row that separates the two**, at camX 320, `fb` `FACTOR_1_4`, `to` `FACTOR_1_2`,
span 224:

```
base  = 320>>2 = 80        far   = 320>>1 = 160
baseW = -80                farW  = -160        spread = -80
line i shows -(baseW + floor(i*spread/span)) = 80 + ceil(i*80/224)
line 1 -> 80 + ceil(0.357) = 81        a lerp in un-negated space says 80
```

`camera-preview.test.ts` asserts 81 at line 1. The planted lerp (§6) fails it with
`expected 80 to be 81`.

---

## 6. HOW IT WAS PROVEN

### 6.1 Node suite — `camera-preview.test.ts`, 38/38 (was 28)

Full suite: **5,287 passed, 1 failed, 7 skipped (5,295)**. The single failure is
`test/formats/effects-scene-curve-vsplit.test.ts` — **pre-existing and not this
parcel's**; it reads aeon's live working tree by absolute path and that tree is dirty.
**Proven not mine:** with `src/` reverted to `origin/master` and only the test files at
HEAD, it fails identically (`TypeError: Cannot read properties of null (reading 'type')`
at `history.ts:99`). A separate agent owns it.

**RED-FIRST, with `src/` at master and the tests at HEAD — 11/11 of the new rows red:**

| row | failing assertion |
|---|---|
| `NEVER names curve ramps…` | `expected 'curve ramps (bands preview flat, at their top factor)\|…' not to contain 'curve'` |
| `THE CATCHER: the strip is NOT FLAT…` | `TypeError: Cannot read properties of undefined (reading '0')` |
| `the ramp is the ENGINE's truncation…` | `TypeError: runs is not iterable` |
| `the caption reads the ramp's two ENDS…` | `expected 'L0 FACTOR_1_4 (1/4) x=+80' to be 'L0 FACTOR_1_4 (1/4) x=+80..+160 ramp'` |
| (+7 more) | `curveRampRuns is not a function`, `Target cannot be null or undefined`, … |

Restored; 38/38.

**A SECOND, SHARPER RED-FIRST, because most of those are "the function does not exist"
and that proves little.** A **lerp in un-negated space** was planted inside
`curveRampRuns` (committed first, per the tree discipline), and it is caught precisely:

```
× the ramp is the ENGINE's truncation, not a linear interpolation
  AssertionError: expected 80 to be 81
× the caption reads the ramp's two ENDS, not one flat number
  expected 'L0 FACTOR_1_4 (1/4) x=+80..+159 ramp' to be '…x=+80..+160 ramp'
```

**⚠ AND THE ROW THAT STAYED GREEN UNDER IT IS DISCLOSED.** `THE CATCHER: the strip is
NOT FLAT` passed with the lerp planted — correctly, because a lerp is also not flat.
That row proves "a ramp exists"; the truncation row proves "the *right* ramp". Neither
substitutes for the other. Reverted; 38/38.

**One real find from the tests themselves:** `-acc` on a zero accumulator produced `-0`,
which reaches a caption as `x=-0` and a JSON report as `-0`. Fixed at source with the
word negation, which is also the faithful operation.

### 6.2 CDP harness — `scratchpad/curve-editor-harness.mjs`, **29/29, three runs**

Runner: `VITE_AURORA_DEBUG=1 npx electron-vite build && node scratchpad/curve-editor-harness.mjs`.
`dpr` **1**, frame rect `{x:320, y:0, w:320, h:224}`, view `{x:0,y:0,zoom:1}` — all
printed by the run. **The harness sends no mouse coordinates at all** (form controls,
arrow KEYS, a View-menu CHECKBOX), which removes the fractional-rect class the guide
harness lost a review cycle to; the only coordinates are pixel probes in the canvas's
own backing-store space, where `canvas.width = rect.width` and there is no dpr factor.

| group | rows |
|---|---|
| provenance | `0a` probe exists; `4a` bands carry `ramp` (this branch, not master) |
| anti-vacuous | `1a` project open with sections; `2a`/`2b` scene authored and selected; `3b` composite active + blitting; `6b` the probed row is varied art; `6c` the curve really came off |
| **vacuity guards** | `3c` camera at **320, not 0** (at 0 every ramp is flat and a dead one passes) |
| model | `5a` document; `5b` runs cover the span; `5c` starts at `fb`'s decode; `5d` **not flat**; `5e` **all 224 lines match a closed form derived independently**; `5f` the DRAW issued one blit per run (81, vs the flat path's 1) |
| **pixels** | `6a` calibration; `6d` shallow row unmoved; `6e` deep row moved; **`6f` the 12-row shift scan** |
| the found defect | `6g` the composite survives the background clear |
| controls | `7a` `to == fb` renders flat; `7c` the report is live (toggle off ⇒ `active:false`); `7d` blanket no-empty-probe |
| the picture | `8a` the absence banner no longer names curve ramps |

**Row 6f is the one that settles it.** It measures the drawn strip's horizontal shift by
search, on twelve rows, and requires each to be the scroll the ramp predicts **for that
line**:

```
L17: want 7, got 7 (99% vs runner-up 98%)      L120: want 43, got 43 (95% vs 44%)
L34: want 13, got 13 (95% vs 95%)              L137: want 49, got 49 (98% vs 56%)
L51: want 19, got 19 (95% vs 94%)              L155: want 56, got 56 (96% vs 54%)
L68: want 25, got 25 (96% vs 82%)              L172: want 62, got 62 (98% vs 56%)
L86: want 31, got 31 (95% vs 94%)              L189: want 68, got 68 (97% vs 46%)
L103: want 37, got 37 (95% vs 50%)             L206: want 74, got 74 (98% vs 46%)
```

**Twelve different numbers, each its own line's prediction.** Nothing but a per-line
scroll produces that shape; a build with no ramp measures 0 on all twelve.

### 6.3 The alternative green-paths that were ruled out

Asked of every green row: *if this went green for a reason other than the rule holding,
what would that reason be?*

| alternative green path | how it was ruled out |
|---|---|
| **camX = 0** — every factor decodes to 0, spread is 0, a dead ramp is flat and green | Node: a **named control row** asserts the flat answer at camX 0 so no row can be run there and believed. Harness: row `3c` **fails** unless the camera reached 320. |
| **`to == fb`** — the ramp goes nowhere and renders byte-identically to no curve | Present **once in each suite, labelled a control**, asserting the flat answer. Every discriminating row uses `FACTOR_1_4 → FACTOR_1_2`, which differ. |
| **a lerp satisfies "not flat"** | Disclosed in §6.1: the catcher row *does* stay green under a planted lerp. The truncation row is its catcher. |
| **the plan has a ramp but the draw ignores it** | Row `5f`: blits must equal the run count (81), not the flat path's 1. |
| **the pixels changed for some other reason** | Row `6a` calibration establishes which rows the composite owns at all; `6f` scores only the composite's own columns and requires the *right* shift, not "different". |
| **the report is stale from an earlier frame** | Row `7c`: toggling the composite off must make it say `active:false`. `paints` is quoted in `6d`. |
| **the probe is measuring level art** | This actually happened — twice — and both are §6.4. |

### 6.4 Two instrument defects, both of which FAILED a correct build

Kept on the record in the harness's own docblock rather than quietly fixed:

1. **It was sampling the foreground.** The first probe aimed at the band's last rows and
   found them unchanged by the curve while every model row passed. The frame's interior
   is the composite with **Plane A drawn over it**, and the level art does not move with
   the curve. Fixed by the composite-ownership calibration.
2. **It aimed at a row where no shift is measurable.** The deepest row is low-entropy
   canopy: the search scored **84.8%** at the right answer and **83.3%** at the
   runner-up — noise, and it failed a build whose ramp was correct. Rows are now chosen
   for detail and scored over a spread.

**Neither was fixed by weakening an assertion.** Both are cases of the instrument
measuring the wrong quantity — the failure mode a planted violation cannot reveal.

---

## 7. WHAT IS LEFT OPEN

* **A direct-manipulation gesture for the curve on the map** was considered and NOT
  built. The layer guides already draw and drag a layer's top; a ramp handle would live
  in that family. It is not needed to close the parcel's gap — the ramp is now visible
  where the author is already looking — and it is a bigger design question than the
  remaining budget. **Not booked**; a future row should decide whether it is wanted at
  all before anyone builds it.
* **`curveAdvisory` remains advice, not refusal.** The dispatch asked whether the picker
  should refuse to originate `to == fb` the way the layer-guide control refuses an
  illegal top. **Not done, and it should be looked at**: the advisory does fire and is
  on screen (harness row `7b` reads it out of the DOM), so the author is told — but the
  dropdown will still originate the value. Deliberately left rather than half-done,
  because "the control that owns a value refuses to originate an illegal one" needs the
  option **disabled with a reason**, not merely hidden, and that is a `FactorField`
  change shared with `fa`/`fb`.
* **The `to == fb` refusal is aeon's**, not Aurora's; a scene carrying that pair does not
  build. Nothing here changes that.

---

## 8. TAGGED FOR FOREGROUND FOLLOW-UP

**No emulator was touched** (standing invariant 1). One runtime want:

* **TAGGED — confirm the ramp against the ROM.** The preview is now a transcription of
  `.cap_factor_curve_hoist` + `.lp_curve`, and its correctness rests on that reading.
  The decisive check is an emulator run of a curve scene with the same `camX`, reading
  the HScroll buffer per line and comparing against `curveRampRuns` for the same band.
  That would close the loop the same way the band-direction measurement did.

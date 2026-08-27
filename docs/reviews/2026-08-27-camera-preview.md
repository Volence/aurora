# The frame becomes the camera — and the guides stop riding it

**Branch:** `feat/camera-preview` (from master `df8fb07`)
**Date:** 2026-08-27
**Source:** the owner, live, on what he wanted from the screen frame parcel 65–67 had just landed.

---

## 0. What he asked for

> *"I just want it to appear how it would in game."*

on how to move the camera:

> *"realistically you should be using arrow keys in the editor to get a smoother feel and less immediate jump"*

and, deciding the shape himself:

> *"I was half thinking a different view but I think that's too cumbersome with wanting to do edits and
> having to go back and forth."*

**So: ONE canvas.** Not a preview mode, not a second view. He rejected the separate view and the reason is
the one that matters — he wants to edit and see the result without travelling between them.

Mid-parcel he also reported two things that turned out to be the same defect, and it was **a rule this
suite had shipped nine hours earlier**:

> *"if I move the viewport it drags the layers which I don't want"*
> *"I can't drag a layer below the viewport when I need them here"* — pointing at flower art well below the frame.

---

## 1. THE DECODER — the first time Aurora turns a `FACTOR_*` into a number

`src/core/formats/effects/factor-decode.ts`, commit `d1a7a44`.

Everything upstream carries a factor as a NAME or as the packed triple and passes it along. Nothing
evaluated one, because nothing needed to until the canvas had to show where a band would sit.

**The definition is `Decode_Factor_A` (`aeon engine/level/parallax.emp:1665`), transcribed term for term**,
with the proc's closing `neg.w` left off (a VDP HScroll word is a negated offset; the preview wants the
scroll, and `hscrollWord` carries the negation for anyone who wants the word).

```
s1 == 15  ->  0                                (.locked — before s2 or op is looked at)
s2 == 15  ->  camX >> s1                       (single term; op is never consulted)
op == 0   ->  (camX >> s1) + (camX >> s2)
op == 1   ->  (camX >> s1) - (camX >> s2)
```

Every shift is `asr.w` and every combine is `add.w`/`sub.w`, so it works in a signed 16-bit word throughout.

### 1.1 Agreement with every published `FACTOR_*`

The triples are transcribed from `parallax_dsl.emp:25-40`. The **name** is a hint; the **triple** is the
definition; the table below is the agreement, and it is asserted row by row in
`test/formats/effects-factor-decode.test.ts` by a name-parser that lives **in the test only** — a second
independent statement, never the fact itself.

| name | triple `{s1,s2,op}` | the decode | ratio from the triple | fraction the name spells | agree |
|---|---|---|---|---|---|
| `FACTOR_LOCKED` | 15, 15, + | `0` | 0 | 0 | ✅ |
| `FACTOR_0` | 15, 15, + | `0` | 0 | 0 | ✅ |
| `FACTOR_1` | 0, 15, + | `camX` | 1 | 1 | ✅ |
| `FACTOR_1_2` | 1, 15, + | `camX>>1` | 1/2 | 1/2 | ✅ |
| `FACTOR_1_4` | 2, 15, + | `camX>>2` | 1/4 | 1/4 | ✅ |
| `FACTOR_1_8` | 3, 15, + | `camX>>3` | 1/8 | 1/8 | ✅ |
| `FACTOR_1_16` | 4, 15, + | `camX>>4` | 1/16 | 1/16 | ✅ |
| `FACTOR_1_32` | 5, 15, + | `camX>>5` | 1/32 | 1/32 | ✅ |
| `FACTOR_3_4` | 0, 2, − | `camX - camX>>2` | 3/4 | 3/4 | ✅ |
| `FACTOR_3_8` | 2, 3, + | `camX>>2 + camX>>3` | 3/8 | 3/8 | ✅ |
| `FACTOR_3_16` | 3, 4, + | `camX>>3 + camX>>4` | 3/16 | 3/16 | ✅ |
| `FACTOR_5_8` | 1, 3, + | `camX>>1 + camX>>3` | 5/8 | 5/8 | ✅ |
| `FACTOR_5_16` | 2, 4, + | `camX>>2 + camX>>4` | 5/16 | 5/16 | ✅ |
| `FACTOR_7_8` | 0, 3, − | `camX - camX>>3` | 7/8 | 7/8 | ✅ |
| `FACTOR_7_16` | 1, 4, − | `camX>>1 - camX>>4` | 7/16 | 7/16 | ✅ |
| `FACTOR_15_16` | 0, 4, − | `camX - camX>>4` | 15/16 | 15/16 | ✅ |

**Sixteen names, sixteen agreements, no disagreement to report.** The coverage row is driven from
`EFFECTS_FACTOR_NAMES`, which is read out of the vendored schema rather than typed, so a contract that
gains a factor goes red here instead of shipping a band that silently does not move.

### 1.2 ⚠ THE ONE THING THAT DOES **NOT** AGREE, and it is not a defect

**The decode is NOT `camX * num / den`, and it is not the floor of it either.** `asr.w` truncates toward
−∞ **per term**, before the terms combine:

| camX | factor | decode | `camX*num/den` | `floor(camX*num/den)` |
|---|---|---|---|---|
| 7 | `FACTOR_3_4` | **6** | 5.25 | 5 |
| 31 | `FACTOR_3_16` | **4** | 5.8125 | 5 |
| 100 | `FACTOR_3_16` | **18** | 18.75 | 18 |

Three different numbers at camX 7. The decode is the first; the other two are not what the hardware does
and the module does not offer them. `factorRatio` exists for **labels and the agreement table only** and
says so.

### 1.3 ⚠ THE SENTINEL, and the honest boundary of what a test can see

`15` is a sentinel, not the largest shift. `s1 == 15` is a locked band; `s2 == 15` is single-term.

**A decoder that treated 15 as an ordinary shift is NUMERICALLY INVISIBLE for a non-negative camera X**,
and that is written into the module's docblock rather than glossed: for `camX` in `0..32767`, `camX >> 15`
is `0`, and `0` is the identity for both `+` and `−`. That is precisely why the mistake reviews as
plausible, and it means **no row of any suite that uses a realistic camera position can catch it by value.**

What catches it:

* **`factorIsLocked`** — structural, works at any camX, and it is what the preview's `locked` flag and the
  canvas caption read.
* **negative camX and camX ≥ $8000** — where `asr.w` sign-fills. Asserted.
* **the VERTICAL sentinel, which IS reachable.** `planeVscroll` under the lock returns `v_offset` and never
  reads the camera. Treat 15 as a shift and it becomes `((camY − v_center) >> 15) + v_offset` — equal to
  `v_offset` while `camY >= v_center` and **`v_offset − 1` the moment it is not**. `v_center` is authorable
  above 0 and the camera is authorable below it, so that is not a corner case.

---

## 2. ⚠ THE FOUNDATION CORRECTION — a locked layer top is a PLANE ROW

**The dispatch I was given stated the opposite, and so did the rule that shipped this morning as row 65.**
Both said a locked scene's guides are measured from the screen frame's top edge — *"line 32 is line 32
wherever the camera is."* The owner disproved it live. The engine agrees with him, in four steps that were
all already in the tree:

| # | Fact | Source |
|---|---|---|
| 1 | Locked, the plane does not track the camera **at all**: `.v_locked` is `move.w pcfg_v_offset(a0), d2` → `Parallax_Current_Vscroll_BG`. `Camera_Y` is not read on that arm. | `parallax.emp` `Parallax_Step5_Vscroll` |
| 2 | So the screen is a **fixed window**: Step 4a puts plane line `vs = Vscroll_BG & 511` at the screen top, i.e. the display shows plane rows `v_offset .. v_offset+223`, forever. | `parallax.emp` Step 4a |
| 3 | And a layer top **is** a plane row — `scene_plane_line` is the identity under the lock. | `scene_dsl.emp` |
| 4 | The map draws the plane at world origin (`ctx.drawImage(this.bg.canvas, 0, 0)`), so plane row P is at map world Y P. | `SectionRenderer.renderBg` |

**⇒ the guide origin is 0, in BOTH spaces.** `guideOriginWorldY` kept its name and **lost its arguments**, so
every stale call site became a type error rather than compiling quietly — the same trick row 65 played with
the argument *order*, one rule later.

**Where the old rule's `− v_offset` came from**, because it is a real quantity and easy to put back:
`scene_vsplit_line = scene_plane_line − v_offset` is the SCREEN line a vsplit **fires** on, the number
bounded to 3..223. That is a property **of** a layer, not a layer's **position**. A guide is drawn where the
layer IS; the fire line is what the layer BECOMES.

### 2.1 The consequence, and it is the gesture he was missing

Fact 2 says the frame's top edge **is** plane row `v_offset`. So:

> **On a locked scene the frame's X is a camera position and its Y is a scene field.**

That reads oddly and it is exactly what the engine says — the lock's entire content is that the vertical
stopped being about the camera. `MapViewport.frameAnchorFor` is the one place it is resolved; dragging or
arrowing the frame vertically now **edits `v_offset`** as one undo step, while horizontally it moves the
session anchor as before. On an unlocked scene both axes are the camera, unchanged.

The corner readout says so: `camera x=768 · v_offset=32 · arrows move ±1, shift ±16`, instead of the
`screen 320x224 @ x,y` that would have been a quiet lie about the Y.

### 2.2 ⚠ ONE POINT OF THE CORRECTION WAS ITSELF WRONG, and nothing was changed for it

The correction's point 3 said the fire-line clamp is *"a fixed 3..223"* and *"exactly what is stopping the
owner dragging a layer down to the flowers."* **It is not fixed.** Row 66 already shipped
`layerTopBounds`'s fire arm as

```ts
min: Math.max(0,   EFFECTS_FIRE_LINE_MIN + vo),   // v_offset + 3
max: Math.min(511, EFFECTS_FIRE_LINE_MAX + vo),   // v_offset + 223
```

which is the correction's own formula, already in the tree. **No code was changed for point 3.** The real
blocker on *"I can't drag a layer below the viewport"* is the pair this parcel does fix: the guides rode the
frame, and `v_offset` — the other half of the bound — had **no gesture anywhere on the canvas**. It has one now.

Reported rather than silently absorbed, per the correction's own instruction that its statements are claims
to check.

---

## 3. THE COMPOSITE — `src/renderer/canvas/camera-preview.ts`

Geometry is split from the blit so the node suite can see it, exactly as `layerGuideGeometry` is split from
`drawLayerGuides`, and for the same reason: a harness that re-derives the answer it is checking proves only
that two copies of one sum agree.

**Four transcriptions, each from a named site:**

| what | from | what it means on screen |
|---|---|---|
| per-band horizontal | `Decode_Factor_A` | screen column `c` shows plane column `decode(camX, fb) + c` |
| dormant bands | `.band_disabled`: `move.w d4, (a3)` | `enabled: false` **inherits the band above's scroll**, seeded 0 for band 0 — it is not "skipped", which is what a preview reads the flag as by default |
| whole-plane vertical | `Parallax_Step5_Vscroll` | locked → `v_offset`; unlocked → `((camY − v_center) >> v_factor) + v_offset` |
| plane→screen | Step 4a | find `k` = last band with plane top ≤ `vs`, start the screen there, walk forward wrapping, `+512` on a wrap, clamp to 224 |

Vsplits walk the **screen** order, because that is the order the raster fires in — and **only under the lock**,
because `scene()`'s two-writer guard refuses a vsplit on an unlocked scene, so there is no in-game appearance
to imitate.

**Where it is drawn is the whole reason this is one canvas:** between `renderBg`/`drawBands` and
`sectionRenderer.render`. The map has already painted Plane B in plane space; the composite repaints the
frame's interior per band; then the section canvases composite the **real foreground** over it. No clock —
inside the pass that already repaints on a pan, a zoom, a store change and an undo.

### 3.1 ⚠ WHAT THE PREVIEW DOES **NOT** REPRODUCE

Stated in the module, computed per scene as `absent`, **and printed on the canvas** inside the frame.

* **Curve ramps** (`curve: To(..)`). The engine ramps a band's factor across its own rows with a per-line
  Bresenham accumulator (`parallax.emp:1214-1260`). A curved band previews **flat**, at the factor its top
  decodes to. **Booked, deliberately not approximated** — a ramp guessed as a linear interpolation of the two
  ends is off by the truncation at every row, which is the whole difference a curve exists for.
* **Deform, of every kind** — per-band `deform`, scene `deform_fg`/`deform_bg`, `v_deform` columns. All three
  are functions of a frame counter and this pass has no clock by construction.
* **Transitions.** `Parallax_Transition_Frames` lerps Plane B between two configs; the editor is never
  mid-transition, so this is the engine's own `.snap_b` path — the steady state, which is what is being judged.
* **Plane A's factors, sprites, priority, the HUD.** The foreground drawn over the composite is the world
  under the frame, which is the camera's view of Plane A **only while that band's `fa` is `FACTOR_1`**.
  Nothing here applies `fa`.
* **The left partial column / `left_column_mask`.** The composite samples continuously and wraps; it does not
  model the cell-granular column the VDP fetches at the screen's left edge.
* **The vertical plane wrap uses the loaded blob's own pixel height** for sampling, while the band rebase uses
  the contract's `PLANE_LINE_SPAN` (512). They agree for a 64-row blob, which is every shipped one.

---

## 4. ARROW KEYS — and the binding they took

**1 px plain, 16 px with Shift**, and **16 is derived, not chosen for feel**: it is the camera movement that
displaces the slowest published band, `FACTOR_1_16`, by exactly one pixel (`decode(15)` is 0, `decode(16)` is
1 — asserted). `FACTOR_1_32` needs 32 and so takes two coarse presses; 16 was taken over 32 so the common case
lands on a boundary every press rather than the reverse.

Left/Right move `Camera_X`. Up/Down move `v_offset` on a locked scene and `Camera_Y` on an unlocked one — §2.1.

⚠ **This takes a binding that already existed**: arrows panned the map by 64. The old behaviour is kept
wherever the composite is off (every other facet, and this one with the toggle off), and mouse-drag,
space-pan and wheel panning are untouched in both cases, so **panning is never unreachable**. Harness rows
7a/7b hold both halves.

**Booked:** holding an arrow on a locked scene pushes one undo entry per press, the same as holding a
spinner's arrow in the panel. Consistent with what exists; not coalesced.

---

## 5. VERIFICATION

### 5.1 Node — 65 new rows

`test/formats/effects-factor-decode.test.ts` (37) and
`src/renderer/canvas/__tests__/camera-preview.test.ts` (28). Suite **5174 passed / 7 skipped**, `tsc` clean.
The `effects-guides` locked-scene block was **rewritten, not extended** — it asserted the reversed rule.

### 5.2 CDP — `scratchpad/camera-preview-harness.mjs`, **26/26 on three consecutive runs**

Real app, real View menu, real key events, the shipped `ojz_act1_start` and `ojz_act1_depth`.

| run | rows | dpr | canvas rect | load | uptime |
|---|---|---|---|---|---|
| 1 | 26/26 | 1.35 | 816.007 × 742.616 @ (283.993, 105.984) | 6.78 | 185518s |
| 2 | 26/26 | 1.35 | same | 17.05 | 185553s |
| 3 | 26/26 | 1.35 | same | 17.44 | 185588s |

⚠ **dpr was 1 on the earlier runs of this same session and 1.35 on the final three.** The brief's warning is
real and it happened here. Every row in this harness is measured in MODEL space (camera px, plane rows,
document fields) rather than in device pixels, so nothing in the final number depends on which it was —
stated because a pixel-aimed harness would have moved.

**★ THE CATCHERS ★**

* **3a** — after 16 shift-presses (camX 0 → 256), each band moved by its own factor's decode:
  `moved = [16,16,32,64,128]` against `expected = [16,16,32,64,128]`, where the expectation comes from a
  **transcription of `Decode_Factor_A` written into the harness from the engine**, never a call into the app.
* **3b** — the same fact with **no absolute value in it**: `fast/slow = 8`, `mid/slow = 4`, the ratios the
  document's own factor names imply.
* **4b** — a band whose `fb` the harness sets to `FACTOR_LOCKED` **through the panel's own picker** does not
  move over the same 256 px while every neighbour does: `moved=[0,16,32,64,128]`, `band0.locked=true`.
* **5e** — the frame moved 32 rows down the plane (via `v_offset`) and **the guides did not move with it**.
* **6a** — vsplits: `document splits=[null,null,80,20,44]` → `composite vscroll=[0,0,80,20,44]`.

**★ RED-FIRST PLANTS ★**

| plant | what was restored | what went red |
|---|---|---|
| **A** (CDP) | `prev = camX` — the factor decode not applied | 3a (`moved=[256,256,256,256,256]` vs `expected=[16,16,32,64,128]`), 3b, 3d, 3e, **4b** (`moved=[256,…]`) — 21/26 |
| **B** (CDP) | row 65's frame-anchored guide origin — the owner's reported defect | **5e** — 25/26 |
| **C** (node) | the vertical sentinel treated as a shift | `AssertionError: camY=0: expected 23 to be 24`, `expected -1 to be +0` |
| **D** (node) | a dormant band skipped instead of inheriting | `expected { scrollX: +0, inherited: true } to deeply equal { scrollX: 160, inherited: true }` |
| **E** (node) | the decoder treating 15 as a shift | 5 rows red incl. `AssertionError: camX=-1: expected -2 to be +0` |
| **F** (node) | `FACTOR_3_16`'s triple mis-transcribed as `{2,3}` | 4 rows red incl. `expected { name:'FACTOR_3_16', num:3, den:8 } to deeply equal …` |

### 5.3 ⚠ NON-DISCRIMINATING ROWS, DISCLOSED — including one I had labelled a catcher

**Row 5c was written as "★ CATCHER ★ the owner's sentence" and came back GREEN under plant B.** It moves the
camera **horizontally** and asserts the guides hold their world row — but the rule it was meant to catch reads
the frame's **Y**, which a horizontal move does not change. That is failure mode (iii) from the brief verbatim:
*the row measured the wrong quantity*. It is relabelled `[non-discriminating — GREEN under plant B; the catcher
is 5e]` and kept, because it still rules out an origin that reads camera X.

Also disclosed: **0a, 1a, 1b, 2a, 2b, 2c, 2d, 4a, 5a, 5b, 6c** are `[anti-vacuous]`. They exist so a green
catcher cannot be green because nothing was on screen — 2c in particular asserts `blits > 0` **and** `paints`
advancing, so "the composite drew" is a fact and not an assumption. Every one of them stayed green under
plant A, which is what makes them scaffolding rather than catchers.

**"If a catcher went green for a reason other than the rule holding, what would it be?"** — three answers,
each ruled out by a row: *(i) nothing drew* → 2c; *(ii) the key did nothing and both samples are one frame* →
3a asserts camX moved by exactly 256, 3c measures the fine step alone; *(iii) the report is a re-derivation*
→ ruled out structurally, `cameraPreview()` publishes the array `drawCameraPreview` blitted from, plus the
blit count, in the same call.

### 5.4 ⚠ WHAT THE HARNESS DOES **NOT** PROVE

**`Input.dispatchKeyEvent` never replies on this CDP target.** Two runs were spent on it: the call is accepted
and no response ever arrives, and without a per-call timeout that leaves an await that never settles, an empty
event loop, and **a process that exits 0 having reported nothing** — which reads as a passing run that stopped
printing. The `send` timeout in the harness is from that, and it is worth carrying into the next harness.

So the keys are dispatched as real `KeyboardEvent`s on `document.body`, which bubbles to `window` where the
listener is; `key`, `shiftKey`, `preventDefault` and `isTypingTarget(e.target)` all behave as for a real press.
**What is NOT proven is that the OS/Electron layer delivers an arrow key to this window at all.** Everything
downstream of the listener is under test.

**Not seen on the owner's own display**, and **no emulator was touched** — hardware confirmation is the
foreground follow-up's.

---

## 6. THE AEON TREE

`/home/volence/sonic_hacks/aeon` was read only — `grep`, `sed -n`, `find`, and an `rsync` **out of** it into a
scratchpad copy. Nothing in this parcel writes to it, builds in it, or touches
`scratchpad/fixtures/aeon-build-pin`. The harness refuses to start if `AEON_DIR` names either.

⚠ **THE md5 THIS ROLE HAS BEEN ASKED TO REPORT IS THE WRONG MEASUREMENT, and here is the diagnosis.** The
usual recipe — `find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 md5sum | md5sum` — read
`db236873f2a43130d1428ad41c180480`, then `b4eaca4efc48b89272006fac408ce577`, then
`610eba7f2c575d82f13af9080ff48d2f`, each stable across consecutive re-reads, **while no file in the tree had an
mtime inside the last three hours.**

The cause: `-path ./.git -prune` prunes **only the top-level `.git`**. The walk therefore descends into

* `./.claude/worktrees/agent-*/` — **other agents' worktrees, inside the aeon tree**, created and destroyed
  while this session ran, and
* nested repositories such as `./docs/research/external/harmony/.git`.

So the number tracks **other lanes' scratch space**, not aeon's source, and it will move under any agent that
reports it faithfully. Diffed against my rsync copy to confirm: every difference is one of those two classes.

**The measurement that answers the question actually being asked** — did this parcel change aeon's source? —
prunes `.git` *anywhere* and `.claude`:

```
find . -name .git -prune -o -path ./.claude -prune -o -type f -print0 | sort -z | xargs -0 md5sum | md5sum
  ->  40fd4cce6f2287753c8ec8ff1e0cfc3a   (twice, consecutively)
```

**Recommend the successor's brief ask for that one.** This parcel's own interactions with the tree were
`grep`, `sed -n`, `find` and an `rsync` **out of** it; nothing wrote, built or deleted.

---

## 7. BOOKED, NOT FIXED

1. **Curve ramps preview flat.** §3.1 — the Bresenham accumulator is not transcribed. The per-band plan is the
   shape it would slot into.
2. **Deform of every kind, and transitions.** Both need a clock; the pass deliberately has none.
3. **One undo entry per arrow press** on a locked scene's vertical. §4.
4. **`factor0LockRefusal` still borrows the layer deform bound for the anchor's `dsb`** — inherited from row
   64's booking, untouched here.
5. **The frame's anchor is still session-scoped, not per-project** — inherited from row 67's booking. Its Y is
   now the document's on a locked scene, so only the X half remains.
6. **No node-suite pin is possible for anything rendered.** The suite has no React renderer; the harness is the
   only instrument that can see this feature at all.

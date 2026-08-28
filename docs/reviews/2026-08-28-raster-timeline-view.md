# The raster timeline — the VIEW half

**Branch** `feat/raster-timeline-view` · **SHAs** `6d17484` (the strip), `0fa2630` (label/footer fixes + harness), `20744e8` (docs) ·
**ROADMAP** §4.6 → §5.1 row 79 · **Instrument** `scratchpad/raster-timeline-harness.mjs`
(`npm run harness:raster-timeline`)

## 0. The defect

An author sets `vsplit.at` in a spinner and **nothing on screen changes**. It is the
third instance of one shape closed on 2026-08-28: the curve ramp was authorable and
invisible (row 77), priority was authorable and invisible (row 76), and this is the
same thing on the raster surface. Closed the same way — by drawing the value.

---

## 1. THE COORDINATE-SPACE FINDING

This is the part of the parcel that decided the picture, and it is the part a future
change is most likely to get wrong.

### 1.1 Three spaces, named by the engine

Read at aeon **`0bee83c61e9c53ade6899f7389f666720215caf7`** (reachable from their
`origin/master` — verified with `branch -a --contains`), via git plumbing only, never
through their working tree:

| # | Space | Where it is defined | Bound |
|---|---|---|---|
| 1 | **ACT** | `engine/level/scene_dsl.emp`, `layer(world_y:)` | `ensure(world_y >= 0 && world_y < $8000)` — *"the engine's act-axis span"* |
| 2 | **PLANE** | `scene_plane_line(s, wy)` | `ensure(pl >= 0 && pl < 512)`. Locked: the **identity**. Unlocked: `((wy - v_center) >> v_factor) + v_offset` |
| 3 | **SCREEN** | Step 4a, **every frame**: `plane_line - (Vscroll_BG mod 512)` | the strip's own ruler, 0..223 |

A layer's top is authored in (1). A split's fire line is in (3). `scene_vsplit_line()`'s
own header calls itself *"the second hop of two"* and its result *"a vertical split's
SCREEN line"*, and its first statement is the whole answer:

```
ensure(s.sc_v_factor == 15,
       "scene_vsplit_line(): this scene's Plane B tracks the camera (v_factor {..}),
        so a layer top has no comptime SCREEN line — Vscroll_BG changes every frame
        and the fire line is baked. ...")
return scene_plane_line(s, wy) - s.sc_v_offset
```

`scene()` refuses the unlocked-plus-vsplit combination outright, in its own words:
the split *"carries ONE baked scroll value at ONE baked fire line, and that line is
derived at comptime from the layer top, which is a screen line only while `Vscroll_BG`
is constant."*

### 1.2 The answer

**The two axes are commensurable exactly when `v_factor == 15`, and not otherwise.**

On an unlocked scene a layer top does not have an *unknown* screen line — it has
**none until runtime**. Drawing it on a 224-line screen ruler and saying nothing would
be inventing a fact.

### 1.3 And where they meet, they meet EXACTLY

Derived rather than assumed, and swept rather than spot-checked:

```
locked  =>  planeTop = world_y   and   vs = v_offset & 511
a legal fire line is 3..223, so planeTop - vs = world_y - v_offset >= 3 > 0
`rebasePlaneTopsToScreen` picks k = the LAST band with planeTop <= vs
  => a band with planeTop > vs is never band k
  => it never takes the `top = 0` arm
  => it never takes the `top <= 0 => += 512` wrap
  => 223 < SCREEN_HEIGHT, so the clamp is not reached
therefore screenTop = planeTop - vs = world_y - v_offset = fireScreenLineOf
                                                         = aeon scene_vsplit_line
```

The two sides are computed by **genuinely different code** — `fireScreenLineOf` is one
subtraction; `rebasePlaneTopsToScreen` is Step 4a with its `k` rotation, its wrap and
its clamp. The test sweeps 8 `v_offset` values × 11 tops and asserts equality on every
legal case, with an anti-vacuous floor on the count (a sweep whose `continue` swallowed
every case would otherwise pass). **Planting a one-line drift into Step 4a reds it:**
`AssertionError: vo=0 top=3 line=3: expected 4 to be 3`.

### 1.4 What that means on screen

| Scene | Bands | Splits |
|---|---|---|
| **Locked** (`v_factor 15`) | solid, at their screen rows | rule + downward flag at the baked line, labelled `L1 split -> B row 300 (line 120)` |
| **Unlocked** | **hatched** — a different KIND of mark, not a paler one — plus a warning Hint: *"Plane B tracks the camera (v_factor N), so a layer top has no fixed screen line — these rows are where the tops land for THIS camera only"* | **listed but placed nowhere** (`y: null`), each carrying the engine's own refusal |

The split is listed rather than dropped for the reason the parcel exists: silently
hiding a value the author authored is the defect, one level up.

### 1.5 The trap, stated plainly

`vsplit.at` is a **PLANE-B ROW** (0..511) — a *payload*, the value written to VSRAM
entry 1. It is **not a position**. The fire's position is the owning layer's own
screen line. A strip that drew `at` on the 224 ruler would look authoritative and be
wrong. The fixture is chosen so that mistake is loud: `at: 300` is not even on a
224-line ruler, and `at: 44` is a plausible-looking wrong answer.

---

## 2. TWO MECHANISMS, TWO GRAMMARS

Both are called "raster" here and they are shaped differently:

| | Vertical split | Palette band |
|---|---|---|
| Shape | **BOUNDARY, one edge** | **INTERVAL, two edges** |
| Mechanism | one mid-frame write of an absolute value to VSRAM entry 1 | an ON op plus a paired `pal_restore` |
| Ends when | the next split supersedes it, or the next frame's top-of-frame write | its restore fires |
| Drawn here | yes — a rule with a downward flag, and **no closing edge** | **no** |

Drawing an interval as a boundary, or a boundary as an interval, is a picture that
misstates the hardware. The strip's own footer says `not drawn: palette bands;
per-line deform`, and `RASTER_TIMELINE_GRAMMAR` states the distinction in prose
beside it.

---

## 3. WHAT WAS BUILT, AND WHAT WAS LEFT AT THE BOUNDARY

### Built

- `src/renderer/canvas/raster-timeline.ts` — geometry, draw, publish. The view-model is
  a **projection of `CameraPreviewPlan`**, so the strip and the camera frame cannot
  disagree about where a band starts.
- `src/renderer/components/effects/RasterTimelineStrip.tsx` — the panel section.
  Expanded by default, deliberately: `CollapsibleSection` renders
  `{!collapsed && children}`, so shipping this behind a disclosure would ship the
  defect it closes.
- `__dbg.aeon.rasterTimeline()` — a publish from the end of the draw, carrying the
  strip's own constants so no harness aim is ever typed.

### Left at the boundary — deliberately, and this is the ruling

Aeon is designing N-bands (the revision above). That design decides **ownership and
edge semantics**, which is exactly what an *editing* model would have to encode. So:

- **no drag**, no create, no delete, no pointer handler of any kind;
- **no persisted timeline document**;
- **no exported type that commits to how splits are owned or ordered** — the view-model
  is recomputed per render and thrown away, and splits are a **flat list** (mirroring
  the engine's own fire list) rather than nested inside the bands, so nothing here
  encodes "a band owns its split";
- **no band count, no height minimum, no wire size** transcribed from that design. It
  carries five open questions and its height minimum rests on `op_work_cyc == 64`,
  which their §12 still marks UNVERIFIED. A number copied from a moving spec is the
  copied-pin defect this repo keeps paying for. A test asserts none of those numbers
  appear in what we ship.

The design being *readable* does not move the boundary. What it bought was the ability
to check that what is rendered will still make sense under it — the split's one-edge
grammar is stated by their document, and the palette band's two-edge grammar is why
it is not drawn.

---

## 4. HOW IT WAS PROVEN

### 4.1 Node — 29 rows, `src/renderer/canvas/__tests__/raster-timeline.test.ts`

**Suite: 5,341 passed · 0 failed · 7 skipped** (baseline on this tree, measured by
excluding the new file: 5,312 passed / 0 failed / 7 skipped).

**Red-first, eight planted violations, tree committed first and restored after:**

| Violation | Rows red | Quoted failure |
|---|---|---|
| 1. `line = at` (the payload as a position) | **7** | `expected [[2,300,300],[3,44,44]] to deeply equal [[2,96,300],[3,176,44]]` |
| 2. `line = world_y` (v_offset ignored) | 1 | `expected 140 to be 100` |
| 3. unlocked claims a certain screen position | 1 | `expected false to be true` |
| 4. a disabled band is skipped | 1 | `expected undefined to be defined` |
| 5. a refused split is silently dropped | 2 | `expected [] to have a length of 1 but got +0` |
| 6. one line of drift in Step 4a (**in `camera-preview.ts`, not mine**) | 2 | `vo=0 top=3 line=3: expected 4 to be 3` |
| 7. the honesty line dropped | 2 | `expected false to be true` |
| 8. the absence list emptied | 1 | `expected 0 to be greater than 0` |

### 4.2 CDP — 25 rows, `scratchpad/raster-timeline-harness.mjs`

**25/25 on three consecutive runs** after the instrument fix below; `dpr = 1` in every
run, strip client rect `258 x 269.9`, **backing store `258 x 270`, fixed**.

The dpr class is **removed, not managed**: the strip canvas has a fixed intrinsic size,
so `getImageData` is in strip space with no rounding anywhere and every aim is derived
from the report's own published `originY`/`scale`/`stripX`/`stripW`. The one place
client coordinates appear is row 5d's `elementFromPoint`, aimed at the canvas centre.

The decisive rows:

- **5cA/5cB** — the marker's colour IS at the predicted line and **is NOT** at ±3.
- **6a/6b** — moving the TOP `96 → 120` moves the marker exactly 24 strip px, and
  vacates 96.
- **7a/7b/7c** — **the row the parcel turns on.** Changing the PAYLOAD `300 → 301`
  repaints the strip (`paints 11 → 12`) and moves the marker **zero** pixels, and there
  is no marker at line 44 (the other split's payload).
- **8a/8b** — `v_offset 40` lifts both fire lines by exactly 40 and the pixels follow.
- **9a** — the CONTROL: both splits dropped ⇒ 0 markers and **0 marker pixels** at every
  previously-marked line; **9b** — and the bands are still drawn.

**Red-first on the running app, two planted defects, rebuilt each way:**

- `line = at` → **15/25**, reddening 5 pixel rows plus 5b/6a/7b/8a.
- **drawn, reported active, then painted black** (the defect that shipped this evening
  on the camera composite) → **20/25**. `active: true`, `markers: 2`, `fills: 3` all
  still report correctly and **five pixel rows go red**. That is the discrimination
  this instrument exists for.

### 4.3 Alternative green-paths ruled out

- *"the marker is at the right line because both numbers happen to be `world_y`"* —
  ruled out by rows 8a/8b, which set `v_offset 40` so the two differ by 40, and by the
  node `v_offset` row.
- *"the row is green because the strip re-derived the same arithmetic twice"* — ruled
  out by the theorem sweep comparing `fireScreenLineOf` against `rebasePlaneTopsToScreen`,
  and by planting drift into the latter (violation 6).
- *"the pixel row is green because something else on the strip is that colour"* — the
  marker predicate is derived from the two composited colours and every other colour the
  strip paints is shown excluded by at least one channel, in the harness's own comment.
  The refused-marker red is excluded on purpose, so a build painting every marker red
  would fail rather than pass.
- *"green because nothing was drawn and nothing was expected"* — rows 5c/6b/7c/8b assert
  **presence** as well as absence, and row 9a proves the run can produce the empty state.
- *"the report says active while the canvas is blank"* — the black-paint red-first run
  is exactly that case, and five rows catch it.

### 4.4 Rows that would survive the feature being deleted — named

- `the ruler IS the frame` (`RASTER_TIMELINE_LINES === SCREEN_HEIGHT`) — a
  characterization of a constant.
- `publishes the strip's own constants` — a shape guard on the probe.
- `NO BAND COUNT ... is transcribed from the moving spec` — a negative guard; it can only
  ever fail on a future edit.
- harness `2a`, `5d`, `9b` — presence/plumbing rows. `9a` is a **control**: it proves the
  instrument can see the empty state, and passes under the black-paint violation.
- Node rows in `splitRefusal` sweep the **null** majority; they discriminate against a
  chatty advisory, not against a broken strip.

### 4.5 Two defects found by LOOKING at the picture

Both were green through 5,300 node tests and 25 CDP rows.

1. **Band labels were covered by split labels.** A split fires at its layer's own top, so
   a band label at the band's top sits exactly where that split's caption goes — L1 and
   L2 lost their labels entirely. Fixed by putting the label at the band's **middle**,
   which is also the truer place: it names an interval, and the rules name edges.
2. **The honesty line was ellipsised** to `palette bands (an interval with tw…`. Half a
   sentence about what the app cannot show reads as chrome. The drawn absences are short
   phrases now; the grammar sentence moved to prose beside the strip, and a test bounds
   the drawn line against the strip's own width so the next absence must be *shortened*,
   never cut.

### 4.6 One instrument defect, kept on the record

Row 5d FAILED on a correct build with `{isSelf: false, hitId: null}`: the effects column
scrolls, the strip sits low in it, and its centre landed **below the window's viewport**,
where `elementFromPoint` answers null for every element. Fixed in the instrument —
scroll into view the way an author would, then hit-test, and report `inViewport`
separately so a future failure can distinguish "below the fold" from "behind something".
Weakening the row to accept null would have deleted the only check that can see a
covered canvas.

---

## 5. OPEN / FOR THE NEXT SESSION

1. **The editing half is not started and must not be until aeon's N-bands design settles.**
   Row 79 records the split so this is not read as an abandoned build.
2. **Palette bands are not drawn.** Their two-edge grammar is the subject of that design.
3. **A REAL GAP FOUND, NOT FIXED — Aurora has no advisory for `unlocked scene + vsplit`.**
   `fireLineAdvisory` returns null for that case with the comment *"it already has its own
   advisory, and a layer top is not what is wrong with it"* — **and no such advisory exists
   anywhere in the panel** (grepped). aeon `scene()` refuses the document outright. The
   timeline now says it, in the strip, because it had to; the **panel** still does not.
   That is edit-side surfacing and belongs in a provider parcel, not this one.
4. **TAGGED for foreground:** nothing here has been seen on the owner's display, and no
   emulator was touched. The strip is a pure editor lens with no ROM path.

## 6. Screenshot

`scratchpad/shots-raster-timeline/04-for-the-owner.png` — three bands labelled, two split
markers at lines 120 and 176 with their payloads (`B row 300`, `B row 44`), the footer
complete, and the strip agreeing with the map's own layer guides (`L1 y=120`, `L2 y=176`)
beside it.

# The priority lens reaches aeon — 2026-08-28

**Branch** `feat/aeon-priority-lens` · **base** `31130cc` (master) · **instrument**
`scratchpad/aeon-priority-lens-harness.mjs`

> *"No way to see what art on fg is priority or not. Randomly sometimes sonic just goes
> behind a tile that I wasn't aware was prioritised."* — the owner, from a play session

The complaint is **surprise**, not missing data. He is not asking to audit a table; he is
asking not to be ambushed. That framing decided every call below.

---

## 1. What was actually wrong

The priority lens **already existed and already worked** — for the classic (Sonic 1)
viewport only. He was in the aeon viewport.

* `src/renderer/state/viewStore.ts` has carried `showPriority: boolean` since
  `feat/s1-priority-lens`, and `ViewMenu.tsx` labels it `Priority (above sprites)`.
* `OVERLAY_KEYS_BY_ENGINE.s1` listed it. **`OVERLAY_KEYS_BY_ENGINE.aeon` did not** —
  so the checkbox was not in his View menu at all.
* The only consumers were `ClassicLevelViewport.tsx:788` (`drawPriority`) and `:870`
  (`lensVeil`). **Nothing in the aeon draw path read the key.**

So this is a **registration**, not a new feature, and that is the shape the change takes.

## 2. The design call, and why it is reuse rather than a second lens

Two lenses in one app that mean the same thing must not look different. Aeon draws the
**identical picture** classic has drawn since `337d2d3`:

* a translucent `PRIORITY_FILL` = `rgba(200, 90, 255, 0.42)` veil over each **high-priority
  8×8 tile**, merged into horizontal runs;
* a crisp 1-**screen**-px `PRIORITY_EDGE` stroke on every high↔low boundary, so a region
  reads as one outlined shape rather than a tile-grid mush and a lone high tile stays
  unmissable at any zoom;
* **the exception is marked, the rule is left alone.** Low-priority tiles stay untouched
  art. Veiling the majority would turn the lens into a full-map dimmer, which is a worse
  answer to "I could not see it" than no lens.

Same store key, same View-menu label, same colours, same OFF-by-default posture.

**The picture was lifted; the data side was not.** `core/level-classic/priority-mask.ts`
does not generalise, and that is a finding rather than a shortcut: its entire substance is
the chunk→block→quad composition and the flip trap (*a chunk cell's flip moves a tile, and
its priority bit, to another quadrant*). Aeon has a **flat 8px nametable** — bit 15 sits
directly on the cell, and a word's own hFlip/vFlip mirror pixels *inside* the tile and can
never move the bit. There is nothing there to lift. What generalises is the DRAW, so the
draw is what moved:

| new/changed | what it is |
|---|---|
| `src/renderer/canvas/tile-lens.ts` | **the shared depiction.** `drawTileLens(ctx, spec)` over a boolean predicate on a tile grid. Knows nothing about priority, nametables, blocks or chunks. |
| `src/renderer/components/classic/classic-overlays.ts` | `drawPriority` now delegates to it. Behaviour-preserving: classic's own four `drawPriority` tests assert the exact rects and segments and were **not** touched. |
| `src/core/model/nametable-priority.ts` | the aeon data side — `tileWordDrawsAboveSprites(word)`, the VDP rule stated once. |
| `src/renderer/canvas/priority-lens.ts` | the aeon draw (windowed) + the `PriorityLensReport` publish. |
| `src/renderer/canvas/OverlayRenderer.ts` | calls it per section, under the object/ring markers, over the art. Returns what it painted. |
| `src/renderer/components/MapViewport.tsx` | publishes the report from the draw body, in both layer branches. |
| `src/renderer/state/viewStore.ts` | `'showPriority'` added to `OVERLAY_KEYS_BY_ENGINE.aeon`. |
| `src/renderer/debug-hooks.ts` | `__dbg.aeon.priorityLens()`. |

### 2.1 What differs, and why it is not a second design

**It windows to the viewport.** Classic iterates the visible chunks it is already drawing,
1,024 tiles each. An aeon section is **256×256 = 65,536 tiles** and an act may hold
`MAX_ACT_SECTIONS = 48`, so an unwindowed scan is **~3.1M predicate calls per repaint** —
and MapViewport's measured frame headroom is ~15.7ms. The window is computed exactly the
way `drawCollisionOverlay` computes its own, so the two agree about "visible".

The neighbour probes still reach **outside** the window, so a boundary at the edge of the
screen is decided against the real neighbour and no false seam appears as you pan. Only the
**section perimeter** skips strokes — the same reasoning classic uses at a chunk edge, and
far rarer here (2048px vs 256px).

## 3. The two traps I was told to measure

**Can the aeon viewport show a per-tile veil at the zooms he uses?** Yes. The lens draws
onto the map context *after* `sectionRenderer.render`, inside the transform
`scale(zoom); translate(-vpX,-vpY)`, so a tile veil is `zoom × 8` screen px. Verified at
zoom 4 by pixel sampling (§4) and visually in `scratchpad/shots-priority-lens/2-lens-on.png`.

**Does the section renderer cache painted output in a way that makes the overlay stale?**
It caches section canvases — but **the lens is never drawn into them.** It is painted over
them on the shared context each pass, and that pass already repaints on pan, zoom, store
change, paint edit and undo. Harness row **7a** proves it live: toggling the lens off
restores **both** sampled pixels byte-identically. **Not blocked; the design did not have
to bend.**

## 4. How it is proven

### 4.1 Node — 33 new rows, all red-first

| file | rows | what it holds |
|---|---|---|
| `src/renderer/canvas/__tests__/tile-lens.test.ts` | 13 | veil geometry, run merging, the grid-perimeter skip, and the **window edge vs grid edge** distinction |
| `src/renderer/canvas/__tests__/priority-lens.test.ts` | 12 | aeon tile geometry, the hi/lo discriminating pair, the **probe count** (a 320×224 view touches `2 × ceil(320/8) × ceil(224/8)`, not 65,536), the report |
| `src/renderer/canvas/__tests__/overlay-priority-wiring.test.ts` | 4 | the ONE call site: the toggle gate, every section at its own offset |
| `src/core/model/__tests__/nametable-priority.test.ts` | 4 | the predicate against `packNametableWord`/`unpackNametableWord` over every field combination |

Plus the rewritten `viewStore-overlays.test.ts` row (see §5).

**Red-first cycles run, with the exact failing assertion:**

| plant | reds |
|---|---|
| `on()` bounded by the WINDOW instead of the GRID | 2 rows — `AssertionError: expected 4 to be 3` |
| predicate = "any non-empty tile" | 4 rows — `expected [ …(28) ] to deeply equal [ { x: 80, y: 32, w: 8, h: 8 } ]` |
| `'showPriority'` removed from `OVERLAY_KEYS_BY_ENGINE.aeon` | 1 row — `expected [ 'showObjects', 'showRings', …(10) ] to include 'showPriority'` |
| the lens call deleted from `OverlayRenderer.render` | 2 rows — `expected [] to deeply equal [ { …(5) } ]` |
| the lens run on `sections[0]` only | 1 row — `expected [ { …(5) } ] to deeply equal [ { …(5) }, { …(5) } ]` |

**Full suite: 5,206 passed / 1 failed / 7 skipped (5,214), 393 files passed / 1 failed.**
The one failure is **`test/formats/effects-scene-curve-vsplit.test.ts` › `ojz_act1_depth.json`
round-trip golden › "is byte-stable through parse→serialize, and again after an edit and its
undo"** (`TypeError: Cannot read properties of null (reading 'type')` at
`history.ts:99`). **PRE-EXISTING**, confirmed by stashing this branch's whole diff and
running it on the base tree: 1 failed / 8 passed there too. Nothing in this parcel touches
effects scenes or the history stack.

### 4.2 The pre-existing CLASSIC harness — 9/9, unchanged

⚠ **`scratchpad/priority-lens-harness.mjs` ALREADY EXISTED** (commit `b11f890`, the classic
lens's own CDP harness). The dispatch named that exact path for the new work; writing there
**destroyed it**, and it was restored from `HEAD` and the new instrument renamed to
`scratchpad/aeon-priority-lens-harness.mjs`. **Check the path before writing a "new" harness
file — the natural name for this feature was taken by the same feature's other half.**

Having it back is worth more than the near-miss cost: it is a live check on the exact code
`drawPriority` now delegates. Run against this branch's build, on real s1disasm data:
**9/9 rows passed** — SBZ block `$11`'s high tile shades (`off=[73,109,109] on=[126,101,170]`),
the LOW tile of the SAME block is byte-identical, the two differ from each other with the
lens on, toggling off restores exactly, and SLZ's all-high block `$152` shades. **The
depiction lift perturbed nothing in the running classic viewport.**

⚠ It cannot launch from a git worktree as written: `ELECTRON` is pinned to
`${ROOT}/node_modules/.bin/electron` with no fallback, and a worktree has no `.bin`. Run
above with a temporary symlink to the main clone's, since removed. (The aeon harness carries
the fallback the effects harnesses use.) Not fixed here — out of scope, and this file had
already been damaged once today.

### 4.3 The running app — `scratchpad/aeon-priority-lens-harness.mjs`, 24/24 on three consecutive runs

The node suite cannot see a React menu, a canvas, or a running app. The harness opens the
**real** aeon project, clicks the **real** View-menu checkbox, and reads the map canvas's
**own pixels**.

**The measurement is a DELTA, and that is a correction, not a style choice.** The obvious
row — "is the pixel violet where the document says high priority" — is wrong here and
measurably so. `PRIORITY_FILL` is composited over whatever the art painted; over grey art
the violetness `min(r,b) − g` lands at a constant 46, but over **saturated green art** it
lands at **−102**. Oracle Jungle Zone is a jungle. A violetness predicate would have failed
on exactly the tiles the owner cares about, and loosening the threshold would have made it
pass on the green art itself. So:

* **6c** the high tile's pixel must CHANGE, and change to exactly
  `0.42·(200,90,255) + 0.58·before` per channel (±2 for rounding) — the source-over
  composite of `PRIORITY_FILL`, whose values the harness **reads out of
  `src/renderer/canvas/canvas-colors.ts`** rather than typing.
  Live: `before=(182,109,36) after=(189,101,127) want=(189.6,101.0,128.0)`.
* **6d** the low-priority tile beside it must be **byte-identical**.
  Live: `(182,255,109) → (182,255,109)` — bright jungle green, the exact case the naive
  predicate would have failed.

**The subject is found in the live model, never pinned**, and finding it took two
corrections that are themselves findings:

1. aiming at the tile CENTRE sampled `(0,0,0)` — the low control's word was `0x6000`,
   **tile index 0 (blank)**;
2. demanding a non-zero tile index got `0x41a1`, whose **whole inner 16×16 canvas region is
   still transparent**. Colour 0 in a VDP tile is transparent — the very distinction
   `occlusion.ts` calls `mapOpaque`. **"The word draws" and "this pixel is painted" are
   different claims.**

So `PICK_AIMS` scans the visible band of section 0 through `__dbg.aeon.ntRect` for a
high-priority ART tile with a **coloured opaque pixel**, paired with a low-priority ART tile
within 3 columns that also has one. Both aims are **inset by a quarter tile** so they can
never land on the 1-screen-px boundary stroke (that is the stroke's colour, not the veil's).

**The dpr trap does not apply here, and the harness measures the claim rather than asserting
it.** No mouse coordinate is ever sent: the checkbox is a real `.click()` on a real
`<input>`, and every pixel read is in **canvas backing-store** coordinates, which
`MapViewport` sets from `canvas.width = rect.width` — CSS px, truncated, never multiplied by
`devicePixelRatio`. Row **4c** asserts `canvas.width === Math.floor(rect.width)` and prints
dpr and the rect. Observed `dpr = 1` on one run and `1.35` on the next with **identical**
results, which is the point.

**Rows, and what each one exists to catch:**

| row | catches |
|---|---|
| 0a | a build without the parcel (`__dbg.aeon.priorityLens` exists nowhere on master) |
| 2a | **the owner's literal bug** — the aeon View menu offering `Priority (above sprites)` |
| 3a | object/ring markers turned off, so a sampled pixel is art + lens only |
| 4a/4d/5b | anti-vacuous: a real hi/lo ART pair, integer aims inset from the stroke, both pixels opaque and coloured |
| 4b/4c | the camera and the canvas the aims are derived from |
| 5a | the toggle off reports `active:false, reason:'off'` with a live `paints` counter |
| 6a/6b | the real checkbox drives it; the repaint drew over all 9 sections with veils **and** strokes |
| **6c/6d** | **the delta pair** |
| **7a** | **a veil baked into the section cache** |
| 8a/8b/8c | **an unwindowed lens** — parked over a clean region, `veils === 0` while the act still holds thousands; pan back and they return on the same pixel |
| 9b/9c | **a clock nobody asked for** — 3s with the lens drawn, `repaints=0` while `ticks=963` proves the page was still painting |
| 10a/10b | the BG layer says `reason:'bg-layer'` rather than leaving the last frame's numbers standing |
| 11a | teardown |

**Harness red-first — the app broken on purpose, rebuilt, and re-run:**

| plant in the app | rows that went red |
|---|---|
| `'showPriority'` removed from the aeon key list | **2a**, 6a, 6b, 6c, 7a, 8b, 8c |
| predicate = "any non-empty tile" | **6d** (`before=(182,255,109) after=(189,186,170)`), 8b — **6c stayed green**, which is exactly why 6d exists |
| the lens ignores the toggle (draws always) | **5a** (`active:false … veils:26`), 6c, 8c |

**Non-discriminating rows, named:** 0a, 1a, 3a, 4a–4d, 5b, 8a, 9a, 9b and 11a are setup or
anti-vacuous companions, not subject rows. **6d stayed green under the wrong-menu plant**
(nothing was veiled at all, so the control tile was trivially unchanged) — it is only
discriminating alongside 6b/6c, which is how it is read.

**Alternative green paths ruled out:**

* *6c passes because the whole canvas went violet.* Ruled out by **6d** on the adjacent tile
  and by **8b** (a clean region veils nothing while the lens is active).
* *8b's zero is a dead lens, not a window.* Ruled out by **8c** — panning back restores
  `veils=26` and the same composited pixel.
* *9c's `repaints=0` is a dead page.* Ruled out by **9b** — `ticks=963` in the same 3s, on
  the probe's own `bound()` check that it is watching the live canvas.
* *5a's `veils:0` is the draw pass never running.* Ruled out by `paints > 0` in the same
  assertion, and by 6b's higher `paints` one toggle later.

## 5. Where a prior claim in this repo was wrong, and was replaced

`viewStore-overlays.test.ts` asserted `OVERLAY_KEYS_BY_ENGINE.aeon).not.toContain('showPriority')`
under the comment *"The two lenses stay classic-only: aeon's tile words are a different
engine's format and its viewport has no drawPriority/occlusion pass, so listing them there
would be dead toggles."*

The reasoning held for **occlusion** and does not for the **lens**. Aeon's tile words are a
different format but they carry **the same bit for the same reason**, and the decoder was
already in `s4-types.ts`. The assertion was **replaced**, not weakened, by a row that says
what is now true and cites the owner's words; `occludeSprites` is still asserted
aeon-**excluded**, with the reason narrowed to the one that survives (aeon object previews
carry no per-pixel priority mask).

## 6. What the fixture actually looks like — measured, because it shaped the design

Scanned all nine `section_N.tiles.bin` of `ojz/act1`:

| section | non-empty | high-priority | high rows |
|---|---|---|---|
| 0 | 16,393 (25.0%) | 1,865 | 54 |
| 1 | 10,268 (15.7%) | 5,540 | 64 |
| 6 | 9,426 (14.4%) | 4,426 | 58 |

**Priority is used in large contiguous horizontal slabs**, not scattered tiles — section 6
rows 32–47 are **256/256**, a full-width 16-row band. In section 1 more than **half** of all
drawn tiles are high priority. That is well above classic's ~14%, and it is exactly why the
veil-plus-outline depiction is right rather than merely inherited: a slab reads as **one
outlined shape** saying "everything here is in front of you", which is the ambush he
described. It is also why "mark the exception, not the rule" had to be re-checked rather
than assumed — no section is uniformly high, and the high regions are localised to a
minority of rows, so the lens never becomes a full-map dimmer at any camera position.

Also measured: **7–20 words per section carry the priority bit with tile index 0**
(e.g. `0xC000`). The lens **does not** special-case them — `composeNametable` draws index 0
like any other tile, so hiding them would be the lens inventing a rule the picture does not
follow.

## 7. Left open

* **Sprite occlusion for aeon** (`occludeSprites` — redrawing high-priority map *pixels* over
  low-priority object-preview pixels, with the hidden portion kept as a violet ghost). Out of
  scope here and genuinely harder: aeon object previews carry no per-pixel priority mask, so
  there is no `RenderedObjectFrame.priMask` counterpart to composite against. The lens
  answers "will something here cover me"; occlusion would answer "and here is exactly what
  it hides".
* **Per-pixel truth.** The lens is per 8×8 tile. A high tile occludes only where it is
  *opaque* (§4.2's second correction is that story in miniature). Per-tile is the right
  granularity for a lens — a sparsely-opaque high tile can still swallow the player — but it
  is an over-approximation and is documented as one in `nametable-priority.ts`.
* **The BG plane.** The lens is FG-only by construction (§ the `bg-layer` report reason).
  Plane B has its own priority bit and no lens; nobody has asked.

## 8. Not attempted — TAGGED for foreground runtime confirmation

Nothing here touches oracle or any emulator MCP tool. **Not seen on the owner's display.**
The one thing a foreground session could add: confirm on his monitor that at his usual
working zoom (100–200%, not the harness's 400%) the 0.42 veil over a full-width slab reads
as *information* rather than as *the art being broken* — the classic lens has shipped at
this alpha for a while, so the prior is good, but OJZ's slabs are denser than SBZ's.

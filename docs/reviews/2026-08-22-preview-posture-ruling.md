# Ruling — MapViewport preview posture for effects wave 1

*Ruled 2026-08-22. Closes the design half of ROADMAP §5.1 item 9, which the
MapViewport measurement (`253cb0e`, 37/37) explicitly refused to conclude: it could not
separate "no loop because none is needed" from "no loop and one must be ADDED", since
nothing in the aeon viewport animates and both hypotheses predict the identical zero.*

*Decided by a dispatched fable agent on the measurement plus firsthand source reads, per
the standing practice of routing design forks to a decider rather than to the owner.
Every load-bearing citation below was **re-verified by the overseer** against source
before banking — see §5.*

## 1. The framing was wrong, and that is the ruling's substance

The fork as posed ("static preview / scrub control / running clock") assumes **time is
the independent variable for BgAnim bands**. It is not, for two of three drivers.

`aeon/engine/level/bg_anim.emp` — band record `$00 dc.w driver`, and the runtime walk at
`:135-147`:

| driver | value read | time-varying? |
|---|---|---|
| `0` `camera_x` | `Camera_X` (integer px, 16.16 high word) | **no** — a function of camera position |
| `1` `camera_y` | `Camera_Y` | **no** — same |
| `2` `timer` | `Logic_Tick+2` (low word, lag-immune) | **yes** |

`step = driver_value >> rate_shift`, then masked by `step_mask`. And `camera_x` is the
**schema default** (`empyrean/docs/AURORA_EFFECTS_SCHEMA.md` §5 table, `driver` row).

So the ruled answer is a **fourth option the fork did not name: driver-faithful
preview.**

- **Camera bands are clockless *by construction*.** `MapViewport.tsx:574`'s draw-effect
  dep array already carries `vpX, vpY` — panning already repaints. A camera band's phase
  is a pure function of the camera, so computing its step inside the existing draw pass
  is both sufficient and correct.
- **Only `timer` bands need a clock.**

This is also the *honest* preview. A camera-driven band auto-scrolling on a wall clock
would teach the author the wrong driver model — precisely the misreading class the
wave-1 design §5 warns about with its "camera_y is not vertical motion" banner. Labeled-
approximate licenses an approximate *phase*; it does not license a wrong *driver model*.

## 2. The four questions

**Q1 — is a clock needed?** Yes, but only for `timer` bands. A scrub/bank-stepper is
worth having independently (checking continuity across the 8 phase banks is static art
inspection), but the one authoring decision unique to a `timer` band is `rate_shift`, and
**rate is only judgeable in motion**. The oracle loop is the truth channel at ~2s; a
slider beats a compile loop for that one parameter.

**Q2 — prerequisite or concurrent?** **Concurrent.** The wave-1 design §5's
"wave-1 prerequisite on the Aurora lane" is **overdrawn** and is corrected here: nothing
in the band *editor/writer* work — region marking, bank authoring/import, constraint UX,
the `anims` writer, the sidecar codec work, scene JSON, `sceneRef` — reads or depends on
a clock. The real sequencing gate was the meta-gating fix, discharged at `a88db05`. The
clock is its own small parcel with **one intra-wave ordering edge** (it must land no
later than the band-preview parcel) and gates nothing else. Do not hold the opener on it.

**Q3 — what shape?** Classic's shape, copied **locally**, not hoisted:

- **Gate:** promote `playAnimatedArt` into `OVERLAY_KEYS_BY_ENGINE.aeon`
  (`viewStore.ts:52-56`), **OFF by default**. The store key and toggle plumbing already
  exist and are engine-scoped by design.
- **Clock:** the `ClassicLevelViewport.tsx:401-431` pattern verbatim — effect mounted only
  while `playAnimatedArt && timerBands.length > 0`, wall-clock game-frame counter, `t0` at
  toggle-on so playback is deterministic from game-frame 0, **repaint only when a band's
  step key changes** (at `rate_shift` 2 that is ~15 repaints/s, not 60), rAF cancelled on
  toggle-off/unmount.
- **The zero-repaint idle property is conditioned, not spent.** With the toggle off the
  effect body returns before scheduling anything — idle cost stays literally zero, exactly
  as classic's does.
- **Rejected:** always-on rAF (spends the idle property for nothing); panel-open coupling
  (playback is view state — an author wants bands running while placing objects beside
  them — and it invents a new mechanism where a proven toggle exists, one that a CDP
  harness can already freeze).
- **"The *shared* play-clock" (wave-1 design §5) is aspirational.** Classic's clock is
  component-local (`animFrameRef`/`animKeyRef`). There is no shared clock service in the
  tree. **Do not build one for wave 1.** If a later scene lens previews `SceneDeform` with
  nonzero `speed` (schema §2.2 — also time-varying), it rides the same local gate. Hoist
  only if wave 2 proves a cross-viewport sync need.

**Q4 — does the unmeasured palette-recompose path change the answer?** No; correctly
deferred to wave 2 as booked. Nothing wave 1 writes involves palettes-over-time: §2's
scene surface is scroll factors/deform/vsplit, §5's bands are tile-pixel phase banks
previewable by overlay blit, `sceneRef` is a pointer.

**One caution attached to the wave-2 booking:** measure the full-recompose path
(`SectionRenderer.ts:13`'s `RECOMPOSE_DIRTY_THRESHOLD = 2000`) as booked, but expect the
wave-2 preview design to **bypass** it — per-tick recompose is the naive route classic's
animated-art path explicitly refused. The recompose number therefore **bounds the wrong
implementation**. Keep it as the honesty baseline; do not let it price wave 2.

## 3. Affordability

Licensed by the item-9 measurement **for the repaint half only**: worst cell p95 1.000ms
= 6.0% of a 16.69ms frame at zoom 0.25, ~0.03ms at working zooms, ~+0.050ms per extra
full-viewport pass. The band blit (≤4 bands × cols×rows cells, overlay-blitted, never
through cache invalidation) is a smaller shape of work than the Tile Grid pass. **The
standing caveat travels:** the bracket excludes React commit, compositor and GPU upload,
so these are an **upper** bound on available headroom.

## 4. Overseer's addition — the coordinate derivation is the real correctness risk

Not raised by the decider, and it is where a driver-faithful camera preview will actually
go wrong: **`vpX`/`vpY` are an editor pan in editor space; `Camera_X`/`Camera_Y` are the
engine's world-pixel camera.** They are not the same quantity — the editor's is
zoom-scaled and has its own origin.

> ⚠ **CORRECTED 2026-08-26 by the item-42 parcel, and verified firsthand by the overseer
> before this amendment was written. The sentence immediately above is WRONG on both
> counts, and the mapping is the IDENTITY.**
>
> - **Not zoom-scaled.** `viewStore.ts:116` is `vpX: Math.max(0, state.vpX - dx / state.zoom)`
>   — the divide happens on the way *in*, so the value STORED in `vpX` is already unzoomed
>   world pixels. Zoom never multiplies the stored quantity.
> - **Not its own origin.** `sectionWorldOffset(i)` is `col * SECTION_PIXEL_SIZE`, and
>   `SECTION_PIXEL_SIZE = 2048` (`src/core/model/s4-types.ts:8`) is aeon's `$800`, with
>   section (0,0) at world (0,0).
>
> So `vpX` **is** the unbiased world-pixel left edge — the same quantity `Camera_X` holds.
> The parcel carries a test row asserting the identity, specifically so a scale factor
> cannot be reintroduced later by someone reading the original sentence.
>
> **What this does NOT weaken is the ruling's actual requirement**, which was to DERIVE the
> mapping rather than assume it. That requirement is what surfaced the error: an agent told
> to derive went and read the store, and found the prediction it had been handed was wrong.
> A ruling that had merely asserted the identity would have been right by luck and taught
> nobody to check. **The instruction was sound; the guess attached to it was not** — and the
> guess was the part that read as established fact, because it sat in a clause explaining
> the instruction rather than in the instruction itself.
>
> Also kept from this section and still correct: truncate to integer **before** the shift (a
> `move.w` on a 16.16 cell takes the high word), mask to a word, and do **not** model the
> right/bottom clamp — `SCREEN_WIDTH` has no authority inside Aurora, so inventing a 320
> would be the enshrine-a-neighbour's-number move. The label names it instead. A camera-band preview must **derive** the engine
camera value the band would see from the editor's pan, and that derivation is load-bearing:
get it wrong and the preview is confidently, silently wrong about phase *and* about rate.

Per the repo's derived-never-copied bar, that mapping must come from whatever already
relates editor viewport coordinates to act world pixels — not from a fresh constant. The
band-preview parcel must state the derivation and test it; the "labeled-approximate"
posture does **not** cover a wrong camera mapping.

### 4a. The coordinate authority — answered by the aeon overseer, verified here

Asked across the fence rather than reconstructed. Answer received and **re-verified
firsthand against aeon's tree** (§5b); aeon's spec correction is `c1cee0a4` (docs-only,
1 file / 20 insertions — correct class for the docs correction it anchors).

**`Camera_X`/`Camera_Y` are the camera's LEFT/TOP EDGE in world pixels, measured from the
ACT ORIGIN (0,0), with no bias of any kind.** Cite `aeon/docs/ENGINE_ARCHITECTURE.md:2244`
as the authority, not the peer message:

> `Camera_X/Y` and player positions are 16.16 **world** coordinates running
> `0 … level extent`. There is no bounded engine space, no `$200`/`SLOT_ORIGIN` bias, and
> nothing shifts under the player as it scrolls.

**The clamp is what proves "edge" rather than "centre"** — and it is the detail to build
the mapping on. `Camera_X_Max = (grid_w << SECTION_SIZE_SHIFT) - SCREEN_WIDTH`
(`engine/ram.emp:681`; `SCREEN_WIDTH = 320` at `engine/system/constants.emp:388`), stated
in `ENGINE_ARCHITECTURE.md:2255` as `[0, level_width − SCREEN_W]`. A centre-referenced
camera would clamp to `level_width − SCREEN_W/2`. Unbiased, left/top edge, act origin.

Two mechanical details a faithful derivation must get right:

1. **The band consumes the INTEGER pixel, from the 16.16 HIGH word.** `bg_anim.emp:144` is
   `move.w Camera_X, d0` on a `u32` 16.16 cell — on big-endian 68000 that word read takes
   the upper half. **Sub-pixel camera motion does not advance a band at all**; phase
   changes only on whole-pixel movement. **Truncate to integer BEFORE `>> rate_shift`** —
   truncating after the shift smears phase across sub-pixel pans.
2. **`Camera_X_Biased` (`ram.emp:661`) is a DIFFERENT quantity** — the integer minus the
   VDP +128 SAT offset, for sprite emission. **Do not map `vpX` onto it.** It is not what
   the band reads, and it is the near-miss a reconstruction would plausibly land on.

So: `world_px = f(vpX, zoom, editor_origin)` yielding an unbiased world-pixel left edge,
integer-truncated, then `>> rate_shift`, then `& step_mask`. Aurora's existing authority
for the editor-to-world half is `sectionRenderer.sectionWorldOffset(i)` (used in
`MapViewport.tsx`'s draw pass) together with `SECTION_SIZE = $800 = 2048px`
(`ENGINE_ARCHITECTURE.md:2244`'s fixed world ranges) — **derive from those, do not
introduce a parallel constant.**

## 5. Verified firsthand by the overseer before banking

- `aeon/engine/level/bg_anim.emp` — the three drivers, their record offsets, the runtime
  dispatch at `:135-147`, and `step = driver_value >> rate_shift`. **Confirmed exactly.**
- `empyrean/docs/AURORA_EFFECTS_SCHEMA.md` §5 — `driver` enum and its `"camera_x"`
  default. **Confirmed.**
- `MapViewport.tsx:574` — `vpX`, `vpY` present in the draw-effect dep array. **Confirmed.**
- `ClassicLevelViewport.tsx:401-431` — early-return gate, `t0`-deterministic start,
  step-keyed repaint, rAF cancel on cleanup. **Confirmed; the described shape is real.**
- The decider reported grep counts (0 rAF in `MapViewport`, 4 in `ClassicLevelViewport`),
  `viewStore.ts:52-56` s1-scoping, and `RECOMPOSE_DIRTY_THRESHOLD = 2000` — all consistent
  with the item-9 measurement, which established them independently.

### 5b. The peer's coordinate answer, verified rather than taken on trust

Per the protocol's verify-the-peer's-claims bar. All five cites re-read in aeon's tree:

- `ENGINE_ARCHITECTURE.md:2244` — quoted text present **verbatim**, including the explicit
  "no `$200`/`SLOT_ORIGIN` bias". ✅
- `ENGINE_ARCHITECTURE.md:2255` — clamp stated as `[0, level_width − SCREEN_W]`. ✅
- `engine/ram.emp:681` — `Camera_X_Max` comment reads
  `(grid_w << SECTION_SIZE_SHIFT) - SCREEN_WIDTH`. ✅
- `engine/system/constants.emp:388` — `SCREEN_WIDTH = 320`. ✅
- `engine/ram.emp:661` — `Camera_X_Biased: u16, // Camera_X(int) - VDP_SPRITE_X_OFFSET`,
  confirmed a distinct cell from `Camera_X: u32`. ✅

**The clamp argument is the load-bearing one and it holds**: clamping to
`level_width − SCREEN_W` is only consistent with an edge-referenced camera; a
centre-referenced one clamps to `level_width − SCREEN_W/2`. This is a derivation from the
engine's own constant, not an assertion about it — which is why it is the fact to build
on rather than the prose.

## 6. Tagged for a foreground pass (agents cannot run these)

1. Once a band-preview prototype exists: re-run the CDP harness at the worst case — 4
   `timer` bands, playback ON, zoom 0.25 — asserting the **step-keyed repaint rate** (not
   60Hz) and per-repaint cost. This is the "effects prototype" measurement item 9 already
   anticipated; the ~+0.050ms per-pass figure must not be used as a planning constant in
   its place.
2. The wave-2 palette-recompose measurement stands as booked, with §2's Q4 caveat attached.

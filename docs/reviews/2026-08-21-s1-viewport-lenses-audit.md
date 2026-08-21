# S1 Viewport Lenses Audit — animated level art playback + priority lens

Status: COMPLETE (measurement only; no `src/` changes). Branch `scout/s1-viewport-lenses`.

Two owner-requested classic/S1 map-viewport features, measured before anyone implements:

1. **Play the animated level art** — S1 streams uncompressed tiles into fixed VRAM slots
   on timers (`AnimateLevelGfx`); Aurora shows those slots frozen on one frame today.
2. **High/low priority lens** — surface the VDP priority bit that decides whether a map
   tile renders above sprites.

Method: transcription from `s1disasm` (read-only) with file:line citations, plus scripted
measurements over the real zone data using Aurora's own decoders (`enigmaDecompress`,
`kosinskiDecompress`, `unpackBlockCell`/`unpackChunkCell`). Scripts ran from the scratchpad;
nothing in `src/` was touched (proven by `npx tsc --noEmit` on this branch). Anything not
statically pinnable is tagged **UNVERIFIED** with what the controller can check on the live
emulator.

---

## 1. How S1 animates level art

`AnimateLevelGfx` is called once per frame from V-blank (`sonic.asm:865` in
`VBlank_UpdateScreen`, and `sonic.asm:944` in the second vblank variant). It skips work
while paused, always services the giant-ring streamer, then jumps through a per-zone
table (`_inc/AnimateLevelGfx.asm:25-33`):

| Zone | Routine | Tile animation? |
|---|---|---|
| GHZ | `AniArt_GHZ` | yes — waterfall, big flower, small flower |
| LZ | `AniArt_none` | **no** (LZ water look is palette cycling + objects, `_inc/PaletteCycle.asm:75`) |
| MZ | `AniArt_MZ` | yes — lava surface, scrolling magma, background torch |
| SLZ | `AniArt_none` | **no** (palette cycling only, `PaletteCycle.asm:174`) |
| SYZ | `AniArt_none` | **no** (palette cycling only, `PaletteCycle.asm:208`) |
| SBZ | `AniArt_SBZ` | yes — two background smoke puffs |
| Ending | `AniArt_Ending` | yes — GHZ flower slots, partly from RAM-patched art (cutscene only) |

That is the complete enumeration — the index has exactly these seven entries. Timer
convention throughout: the routine reloads a countdown with `N-1` and fires when it
underflows, so a reload of `#6-1` means **one art frame every 6 game frames**. Timers/frame
counters live in `v_lani0..5_{frame,time}` (`_Variables.asm:263-274`), zeroed on level init.
Transfers go through `LoadTiles` (`AnimateLevelGfx.asm:415`) — raw longword copies of
32-byte tiles into VRAM, no compression.

### 1.1 Per-family table

`tile_size` = $20 bytes. "VRAM slots" are 8x8 tile indices (`ArtTile_Level equ $000`,
`_Constants.asm:537`, so the listed offsets ARE absolute tile indices — the same index
space as Aurora's tile pool, see §2.1). File sizes verified on disk
(`s1disasm/artunc/`); every family's `frames × tiles × 32` exactly matches its file.

| Family | Art file (label, `sonic.asm` line) | VRAM slots | Tiles/frame | Frames | Timer sequence (game frames @60fps) | Code |
|---|---|---|---|---|---|---|
| GHZ waterfall | `Art_GhzWater` = `artunc/GHZ Waterfall.unc` (4890, 512 B) | $378–$37F | 8 | 2 (0,1 alternating) | 6 per frame → 12-frame cycle | `AnimateLevelGfx.asm:43-60` |
| GHZ big flower | `Art_GhzFlower1` = `artunc/GHZ Flower Large.unc` (4892, 1024 B) | $35C–$36B | 16 | 2 alternating | 16 per frame → 32-frame cycle | `:62-79` |
| GHZ small flower | `Art_GhzFlower2` = `artunc/GHZ Flower Small.unc` (4894, 1152 B) | $36C–$377 | 12 | 3 art frames, played as sequence **0,1,2,1** (`.flowerSeq`, `:110-111`) | **uneven**: frames 0 and 2 hold **128**, frame 1 holds **8** → cycle 0(128), 1(8), 2(128), 1(8) = 272 frames | `:81-108` |
| MZ lava surface | `Art_MzLava1` = `artunc/MZ Lava Surface.unc` (4896, 768 B) | $2E2–$2E9 | 8 | 3 (0→1→2→0) | 20 per frame → 60-frame cycle | `:123-143` |
| MZ magma (composite — see §1.2) | `Art_MzLava2` = `artunc/MZ Lava.unc` (4898, 1536 B; 3 frames × $200 B) | $2D2–$2E1 (16 tiles: 4 columns × 4 vertical tiles) | 16 | source frame = **lava surface's** `v_lani0_frame` (3 frames) | redrawn every **2** frames with a per-column horizontal byte shift from the global oscillator | `:146-176` + shift routines `:428-573` |
| MZ torch | `Art_MzTorch` = `artunc/MZ Background Torch.unc` (4900, 768 B) | $2F2–$2F7 | 6 | **4** (counter masked `andi.b #3`; the code comment says "3 frames" but the mask and the 768 B = 4×6-tile file say 4) | 8 per frame → 32-frame cycle | `:178-198` |
| SBZ smoke puff 1 | `Art_SbzSmoke` = `artunc/SBZ Background Smoke.unc` (4902, 2688 B = 84 tiles) | $448–$453 | 12 | 8-step machine (see §1.3) | 8 per step while puffing; **180-frame** (3 s) blank gap between puffs | `:209-256` |
| SBZ smoke puff 2 | same file | $454–$45F | 12 | same machine, independent state | 8 per step; **120-frame** (2 s) gap | `:258-291` |
| Giant ring (all zones) | `Art_BigRing` (uncompressed) | $400–$461 | 14/frame streamed | one-shot, 98 tiles | event-driven: object touch sets `v_gfxbigring` | `:577-604` |
| Ending flowers (cutscene) | `Art_GhzFlower1/2` + art patched into chunk RAM | $340, $35C, $36C, $380, $390 | 16/12/16/16 | sequences `0,0,0,1,2,2,2,1` and `0,1,2,1` | 8/8/15/12 per step | `:294-397` |

VRAM slot constants: `_Constants.asm:450-456` (GHZ), `:465-467` (MZ), `:522-523` (SBZ),
`:587` (giant ring).

Not in scope of a map-viewport play toggle: the giant ring (event streamer, not ambient)
and the ending routine (separate cutscene "zone", partly sourced from RAM the editor
doesn't model). Both noted for completeness.

### 1.2 The MZ magma composite (the only genuinely tricky family)

`AniArt_MZ_Magma` (`AnimateLevelGfx.asm:146-176`) is not a frame flip:

- Source frame: `v_lani0_frame` — the **lava surface's** frame counter (`ror.w #7` →
  frame × $200 bytes into `Art_MzLava2`). The two families are phase-locked by data.
- Every 2 frames it redraws all 16 tiles ($2D2–$2E1) as **4 columns of 4 vertical
  tiles**. For column c it reads `d3 = byte at v_oscillate+$A`, computes
  `((d3 + 4c) * 2) & $1E`, and jumps through `AniArt_MZMagma` (`:428-443`) — 16 routines
  that each copy a 4-byte-wide (8-pixel) column out of the $10-byte-wide (64 px) source
  frame at that byte offset, with wraparound. Net effect: the magma texture scrolls
  horizontally under the level, driven by the global oscillator.
- The oscillator: `v_oscillate+$A` is entry 3 of `OscillateNumDo`
  (`_inc/Oscillatory Routines.asm`) — baseline value $80/rate 0 (`:16-37`), frequency 2,
  turnaround byte $20 (`:91-108`), the same channel the comment labels "MZ magma
  animation". It is deterministic and independent of gameplay (only pause and Sonic's
  death gate it, `:47-48`).
- **UNVERIFIED (simulation, not emulator):** simulating `OscillateNumDo`'s exact
  add/compare semantics gives the read byte sweeping **0..$3F and back with a 360-frame
  period** (6 s). TAGGED for the controller: confirm against the live emulator by watching
  `v_oscillate+$A` — a play implementation only needs the byte sequence, which this
  simulation provides deterministically.

### 1.3 The SBZ smoke state machine

`AniArt_SBZ_Pollution` (`AnimateLevelGfx.asm:209-291`) runs two independent puffs. Each:

1. While the inter-puff delay counter is nonzero (`v_lani2_frame` for puff 1,
   `v_lani2_time` for puff 2 — note the lani2 pair is repurposed as two delay counters),
   decrement it and do nothing.
2. Otherwise step an 8-state counter every 8 frames. States 1–7 blit 12 tiles from file
   offset `(state-1) × 12 tiles`; state 0 blits the file's **first 6 tiles twice** (blank
   sky — `.clearSky`, `:243-250`) and arms the delay: 3 s for puff 1 (`:240`), 2 s for
   puff 2 (`:288`).

So the resting state is blank sky, which is exactly what Aurora's static view shows today
(profile blits `srcTileOffset: 0`, see §2.1) — SBZ currently looks *correct-but-dead*, and
GHZ/MZ look frozen mid-frame-0.

---

## 2. Aurora side — what a play toggle needs

### 2.1 Tile addressing: pool index == VRAM tile index (identity mapping)

`s1-io.ts` builds the doc's tile pool by concatenating the decoded `.nem` level art files
and then **blitting each animated `.unc` slice at `vramTileIndex * 32`**
(`src/core/level-classic/s1-io.ts:258-293`). The profile transcribes SonLVL's
`animtilesN` INI entries (`src/core/project/profiles/s1.ts:154-192`), and its own comment
(`s1.ts:54-58`) pins that `vramTileIndex` is used verbatim. `BlockCell.tile` is the raw
11-bit pattern-word index (`src/core/level-classic/model.ts:20-38`), so **doc pool index,
VRAM tile index, and block-cell tile index are the same number**. No translation layer is
needed: "the waterfall overwrites $378–$37F" means "swap `doc.tiles[0x378*32 ..]`" — or,
better, swap what the renderer *reads* for those indices (see 2.3).

Aurora's per-act animated entries (all frame-0/static today):
- GHZ acts: waterfall/big/small flower + a static flower stalk ($358) + four
  ending-flower blits ($340/$380/$390/$3A0) that the game only animates in the ending
  cutscene (`s1.ts:153-162`). A play toggle should animate only the first three.
- MZ acts: lava surface / magma / torch (`s1.ts:166-170`).
- SBZ acts: the two puffs as four 6-tile entries ($448/$44E/$454/$45A) (`s1.ts:186-191`).
- LZ/SYZ/SLZ acts: `animatedArt: []` — matches `AniArt_none`.

### 2.2 The composed-view cache (targeted invalidation exists and is measured)

- `renderChunk` composes chunk → block → tile straight from `doc.tiles`
  (`src/core/level-classic/render.ts`), stateless.
- The viewport caches **one offscreen canvas per engine chunk id**, keyed
  `${chunkEpoch}:${chunkVersions.get(id)}`
  (`src/renderer/components/classic/ClassicLevelViewport.tsx:247-335`, key applied
  `:482-487`). Tile edits today bump the **coarse** `chunkEpoch`
  (`src/renderer/state/classicLevelStore.ts:161-186`) — i.e. every cached chunk rebuilds.
- Per-chunk targeting is available: `usage-index.ts`
  (`src/core/level-classic/usage-index.ts`) already derives tile→blocks→chunks.

**Blast radius, measured on real data** (scripted over `map16/*.eni` + `map256/*.kos`
with Aurora's decoders):

| Family | Blocks referencing its slots | Chunks referencing those blocks |
|---|---|---|
| GHZ waterfall | 4/439 | 2/82 |
| GHZ big flower | 4/439 | 17/82 |
| GHZ small flower | 6/439 | 10/82 |
| MZ magma | 4/372 | 28/82 |
| MZ lava surface | 2/372 | 16/82 |
| MZ torch | 2/372 | 7/82 |
| SBZ puff 1 | 3/602 | 4/82 |
| SBZ puff 2 | 3/602 | 3/82 |

Animated **cells** (16x16 chunk cells whose block touches an animated tile):
GHZ 204 total (max 26 in one chunk), MZ **2214** (one chunk is 256/256 animated — the
full lava pool), SBZ 21 (max 6).

**Cost verdict:** chunk-canvas invalidation is fine for GHZ/SBZ (≤17 chunks at ≤1 art
frame per 6+ game frames) but wrong for MZ: the magma redraws every 2 frames across 28
chunks ≈ 1.8M px re-rasterized 30×/s. The cheapest **correct** mechanism is a
**draw-pass overlay blit** (same shape as the existing collision overlay, §3.2): derive
once per chunk the list of animated cells (cell rect + block id + composed flips —
recompute on the chunk's version key), pre-rasterize each family's frames per palette
line into small atlases, and on each play tick `drawImage` the current frame over just
the visible animated cells. Total animated pixels per full repaint = 2214 cells × 256 px
≈ 0.57M px worst case (MZ, mostly off-screen at any zoom), no doc mutation, no cache
interaction. The magma's horizontal scroll becomes an offset `drawImage` from a 64px-wide
frame strip — the wraparound shift for free.

### 2.3 Why the play clock must NOT mutate `doc.tiles`

The save path diffs `doc.tiles` against `originalDisplayTiles` and treats **any** changed
byte inside an anim range as a user edit, which is a hard save **error**: 'animated art
slots are not editable in v1' (`s1-io.ts:463-500`, error at `:497`). A playback that
blits frames into `doc.tiles` would poison the next tile save unless it restores bytes
exactly — and would also fight the undo-history and recompose self-check baselines.
Render-time indirection (2.2's overlay pass, or a tile-source override passed to
`renderChunk`) avoids the whole class.

### 2.4 Editing-over-animation interactions (already handled, one gap)

- Animated slots are **locked against editing** by the single predicate
  `tileLockReason` (`src/core/project/editable-tiles.ts:32-46`): composer shows a lock
  badge/banner (`composer-shared.tsx` re-export, `:50`), the command rejects
  (`classicLevelStore.ts:963` `classicEditTiles`), and the save path backstops (§2.3).
  `animRanges` flow from the profile via `editableTileRange`
  (`src/core/project/s1/index.ts:473-478`).
- The canvas commit planner separately refuses to *repoint* new art at animated slots
  (`animatedTileSet`, used in
  `src/renderer/components/canvas/canvas-commit-model.ts:278`).
- **Gap worth surfacing with the play feature:** nothing warns a user who edits a
  *block/chunk* that stamps animated tiles, or who stamps animated blocks somewhere new —
  legal and sensible, but the static view hides that those cells will move in game. The
  play toggle itself is the honest fix.

---

## 3. Priority lens

### 3.1 Where the bit lives and what Aurora does with it

- S1 16x16 block mappings: 4 pattern-name words per block; **bit 15 of each word is the
  per-8x8-tile priority bit** (`src/core/level-classic/model.ts:20-27`, verified against
  SonLVLAPI `DataTypes.cs:150-221`). Chunk cells have **no** priority bit (bits 13–14 are
  solidity, `model.ts:28-35`).
- Aurora **parses and preserves** it: `unpackBlockCell` → `BlockCell.pri`
  (`model.ts:160-169`), `packBlockCell` writes it back (`:150-158`), the save path
  round-trips blocks through these (`s1-io.ts:512-523`). It is **dropped at render
  time**, deliberately and documented: `render.ts:28-31` ("BlockCell.pri is intentionally
  ignored here... the flat chunk bitmap carries no low/high plane split"). So the lens is
  purely additive — the data is already in memory on every loaded act.

### 3.2 Granularity — MEASURED: must be per-8x8-tile

Counted over all six zone `map16` files (Aurora's own enigma decoder + unpacker):

| Zone | Blocks | any-high | all-high | **MIXED (some cells high, some low)** | high cells/total |
|---|---|---|---|---|---|
| GHZ | 439 | 63 | 59 | **4** | 242/1756 |
| LZ | 196 | 104 | 104 | **0** | 416/784 |
| MZ | 372 | 21 | 20 | **1** | 82/1488 |
| SLZ | 414 | 58 | 58 | **0** | 232/1656 |
| SYZ | 431 | 8 | 8 | **0** | 32/1724 |
| SBZ | 602 | 281 | 213 | **68** | 991/2408 |

**Verdict: 73 mixed-priority blocks exist; SBZ alone has 68 (11.3% of its blocks). A
per-16x16 overlay would lie about them — the lens must shade per 8x8 tile.** (First mixed
ids for spot-checks: GHZ $89,$8A,$C0,$EA; MZ $5D; SBZ $11,$12,$2B,$35,$36,$37,…)

### 3.3 Wiring — ride the existing overlay mechanism

The collision lens is the template, and it is an **overlay toggle, not a facet**:

- State: `viewStore.overlays` + `OVERLAY_KEYS_BY_ENGINE` gates which keys the open engine
  offers (`src/renderer/state/viewStore.ts:10-40`; s1 = objects/start/collision/angles).
- UI: the View menu renders exactly the engine's key list with labels
  (`src/renderer/shell/ViewMenu.tsx:8-31`). The collision facet additionally claims the
  overlay imperatively through a port
  (`src/renderer/providers/collision-overlay-classic.ts`) — the priority lens needs no
  port (no facet owns it).
- Render: the viewport's draw pass gates on `overlays.showCollision` and calls a pure
  drawing function per visible chunk (`ClassicLevelViewport.tsx:499-505` →
  `drawCollision` in `src/renderer/components/classic/classic-overlays.ts`).

Priority lens = add a `showPriority` key (viewStore + s1's `OVERLAY_KEYS_BY_ENGINE` entry
+ ViewMenu label) and a `drawPriority` sibling in `classic-overlays.ts`. One caution: the
collision overlay draws ≤4 vector rects per cell per frame; a per-tile priority walk is
256 cells × 4 tiles per visible chunk per frame. If that pass measures hot, cache a
256x256 alpha-mask canvas per chunk keyed by the **same** `${chunkEpoch}:${version}` key
as the art cache and `drawImage` it — mechanics already proven by `getChunkCanvas`.

**Flip trap (both features):** a chunk cell's xf/yf flips the *whole block* — the 2x2
tile arrangement AND each tile's pixels (`render.ts:22-27`). A priority mask or an
animated-cell blit that reads block cells without composing the chunk-cell flip will
shade/draw the wrong quadrants in flipped placements. Compose flips exactly as
`renderChunk` does.

---

## 4. Recommended implementation cut

**Two parcels, priority lens first.** They share no code beyond what exists; the lens is
a half-day parcel that exercises the overlay plumbing, the play toggle is the real work.

**Parcel A — priority lens (small).**
`showPriority` overlay key + ViewMenu label + per-8x8-tile `drawPriority` in
`classic-overlays.ts` (start as a direct draw pass; promote to a version-keyed per-chunk
mask canvas only if profiling says so). Suggested default presentation: dim low-priority
tiles (e.g. 55% black veil) and leave high-priority at full color with a thin outline —
reads as "this is what covers the player". Must not get wrong: (1) per-tile granularity
(§3.2 — 73 mixed blocks); (2) chunk-cell flip composition (§3.3); (3) gate the key to s1
via `OVERLAY_KEYS_BY_ENGINE` so aeon's View menu doesn't grow a dead toggle.

**Parcel B — play toggle (medium).**
1. Pure core module: the §1.1 table as data (slots, frame strides, timer sequences, the
   SBZ two-puff machine, the magma composite with the simulated oscillator sequence), plus
   a `tick(frame) → per-family current frame + magma shift` clock. Unit-testable against
   the transcription; the controller can diff the clock against live-emulator VRAM
   hashes for a few hundred frames (TAGGED — the only runtime-verifiable piece is the
   §1.2 oscillator).
2. Viewport: per-chunk animated-cell lists derived on the chunk's version key
   (tile→block→chunk via `usage-index.ts` mechanics), per-family frame atlases
   pre-rasterized per palette line, and a rAF-driven overlay blit of visible animated
   cells; magma as offset-blit from a 64px strip.
Must not get wrong: (1) **never mutate `doc.tiles`** (§2.3 — poisons saves/undo);
(2) the clock ticks at 60 fps semantics with per-family cadences — do not re-render chunk
canvases per tick (§2.2 cost verdict, MZ magma is 30 Hz × 28 chunks the naive way);
(3) animate the BG plane too (waterfall/torch/smoke are largely BG families and the
viewport draws planes separately); (4) animate only the game-animated families — GHZ's
stalk/ending entries in the profile's `animatedArt` are static or cutscene-only (§2.1);
(5) flip composition, again (§3.3).

Non-goals both parcels: palette cycling (LZ/SYZ/SLZ's only motion — a separate,
palette-domain feature; `PalCycle_*` in `_inc/PaletteCycle.asm`), the giant-ring
streamer, and the ending cutscene routine.

---

## Appendix: measurement provenance

- Mixed-priority counts: scratchpad `measure-priority.ts` over
  `s1disasm/map16/{GHZ,LZ,MZ,SLZ,SYZ,SBZ}.eni`, decoded with
  `src/core/formats/classic/enigma.ts`, unpacked with `model.ts:unpackBlockCell`.
- Blast radius + cell counts: scratchpad `measure-anim-usage.ts` / `measure-anim-cells.ts`
  over the same map16 files plus `map256/{GHZ,MZ (REV01),SBZ (REV01)}.kos` via
  `src/core/formats/kosinski.ts`. REV01 chosen to match the profile's variant preference
  (`s1.ts:261`).
- Oscillator period: node simulation of `OscillateNumDo` semantics (UNVERIFIED against
  live emulator; flagged in §1.2).


## Oscillator TAG closed — 2026-08-21, overseer foreground run

Sampled the byte at `v_oscillate+$A` ($FFFE68 — the symbol map attributes the address to
`v_timingvariables+8`; the engine deliberately indexes past the 2-byte bitfield) in the
live GHZ demo: f4400 $16 → f4445 $03 → f4490 $01 → f4580 $2A → f4670 $3E → f4760 $16.
Triangle sweep within 0..$3F; frames 4400 and 4760 — exactly 360 apart — read identically.
**The simulation (0..$3F sweep, 360-frame period) is CONFIRMED live.** Parcel B may rely
on it. (Oscillators are global — verified in GHZ without reaching MZ.)

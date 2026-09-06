# A vertical band the plane cells actually draw: the rig, and what it is waiting for

**Parcel:** `parcel/vertical-onscreen-rig`, aurora. **Date:** 2026-09-06.
**Shape:** a rig and a derived expectation table. **No emulator was called, no
measurement was taken, and no `mcp__oracle__*` tool was touched.** The measurement is the
overseer's; §8 is the recipe.

---

## 1. The question, and the one link that was open

Aurora's panel tells an author a vertical tile-animation band **scrolls up**. Three links
carry that sentence, and until this parcel only two of them had anything behind them:

| link | what it says | evidence before this parcel |
|---|---|---|
| L1 | the eight phase banks are Y-rolls of phase 0 in the band's own row order | **ours.** `shiftedPhaseBanks` derives bank *k* at `srcY = (row*8 + py + roll) % patternPx`, and the 2026-09-03 authoring script asserts it in both directions |
| L2 | at every step, VRAM at the band's slots is phase 0 rolled toward **decreasing row index in a row-major decode of the band's slots** | **aeon's**, `bganim_vprobe_witness.py` at `f0aebbd3` — on a probe band in the reserve that **no plane cell references** |
| L3 | band row order **is** screen row order | **nothing.** aeon's probe had no cells; aurora's 2026-09-03 run flipped the act's band 0, whose 32 slots are a scattered atlas drawn by 1,220 cells in no order at all (slot 3 alone in 940 of them) |

`docs/reviews/2026-09-06-vertical-word-precision.md` §4 named L3 precisely and booked it.
This parcel builds the rig that closes it, and stops one step short of running it.

---

## 2. Provenance — every input, and which clock it moves on

| input | value |
|---|---|
| aeon revision copied | **`f62a3d5cf20252493786d3b8ecbb011dcb4985fa`** — aeon `origin/master`, *"witness(depth): commit the A/B figures that travelled in mail…"*, 2026-09-06 11:29:33 -0400 |
| how | `git clone` of aeon's repo into `/home/volence/sonic_hacks/aeon-vrig-onscreen`, then `git checkout --detach f62a3d5c`. **A clone and not `git archive`** for the reason the 2026-09-03 run recorded: the level re-bake runs `git` *inside* the tree it is given, and an archive has no `.git`. aeon's live working tree was read only through `git show` and was never written; it carried one pre-existing modified file (`docs/lane-status.json`) before and after |
| empyrean | resolved live by aeon's `tools/suite_paths.py` from the copy's own location; HEAD `f42fe045d466b19ba91a9ee3469f02fc4f80130b` at resolve time. **Not pinned** — disclosed rather than claimed, see §9 |
| assembler | **`sigil 0.1.0 (e6e942e5)`**, revision `e6e942e55068c39d1568e9dac89ca7fe058f6589`, branch master, committed 2026-09-06T01:40:14-04:00. The binary **actually executed** hashes `fa18ebfe849aa4bfb3203cde7c8a0770`; `emit_sound_blob` hashes `0c1cf7ec5dd452bfb703856a42437d6d` |
| assembler warning, recorded not suppressed | the build printed *"THE ASSEMBLER MAY NOT MATCH ITS SOURCE"* — sigil's tree HEAD is `ebc3d17e06f53d1fbe44eab36e4288be25e9c904`. A stale assembler emits a byte-identical ROM when the source has not changed, so no CRC downstream detects it; hashing the executed binary is the check that survives that |
| ⚠ build env | **`SIGIL_BUILD` and `SIGIL_EMIT` were NOT set in my environment.** I resolved them to the paths aeon's own `CLAUDE.md` names (*"path to the sigil repo's release `sigil` binary"* / `emit_sound_blob`), i.e. `/home/volence/sonic_hacks/sigil/target/release/{sigil,emit_sound_blob}`, and recorded both hashes above. **If the overseer counts that as a workaround rather than following documented setup, the ROM is void and everything from §3 to §7 still stands** — the expectation table is derived from the document and cross-checked against the *generated data*, not from the ROM image |

### The ROMs

| artefact | crc | md5 | bytes |
|---|---|---|---|
| `s4.debug.bin` — **the rig ROM** | `76fec315` | `26ed6d3c475888bdfef9f8b40fff6a8c` | 846,390 |
| `s4.bin` (plain) | `c50da543` | `a8bc9a5a98031a219d8179f7e4b0b725` | 820,207 |
| baseline `s4.bin`, same copy, unmodified document | `fe512c95` | `bd08f0df6d6e359c921579d852596f86` | 820,207 |

Both shapes exit **0**. Exit codes were checked *before* any hash was taken. Both are
`FAST=1` builds, which the build itself banners as a dev artifact with its verification
lanes skipped — `bganim_room` (the BG-anim ceiling) among them, so **the section budget is
not checked by this build**; §4 checks it by arithmetic instead.

**The plain ROM animates nothing** — see §3.

---

## 3. ⚠ THE FINDING THAT SHAPED THE RIG: the act can only build with its band OFF

**Measured, with a one-key control, before any of my own changes were involved.**

Take the pristine document at `f62a3d5c`. Delete the single key `default_off` from its one
band. Change nothing else. A green `FAST=1 ./build.sh` becomes:

```
error: native build (sonic4 plain): build_program: 3 error(s);
  [Error] module `games.sonic4.ojz_bg_anim_act1` has no `pub` name `BgAnim_View_H`
  [Error] module `games.sonic4.ojz_bg_anim_act1` has no `pub` name `BgAnim_View_V`
  [Error] module `games.sonic4.ojz_bg_anim_act1` has no `pub` name `BgAnim_View_T`
```

**The cause.** `games/sonic4/test/ojz_scroll_test.emp` carries an unconditional
`use games.sonic4.ojz_bg_anim_act1.{BgAnim_Table, BgAnim_View_H, BgAnim_View_V, BgAnim_View_T}`.
`tools/inject_editor_bg.py`'s `view_emission` emits those three names for **exactly one act
shape**: a single band, marked `default_off`, whose `pattern_px` is 64. Every other shape —
a live band, two bands, a 32 px period — emits none of them, and the link fails. **In the
plain shape as well as DEBUG**, because the `use` is resolved regardless of the
`if DEBUG == 1` guards on the declarations themselves.

**Why this matters beyond my parcel.** aeon's own `01a45ede` (2026-09-06 09:16) removed
`view_emission`'s *refusal* precisely so that Aurora's `Promote` control would not fail
someone's build — its comment says *"an author did the one thing the editor invites them to
do and got a build failure about DEBUG view twins they had never heard of"*. The refusal is
gone; the failure is not. It has become a link error that names three symbols and does not
name the cause. **The pre-decouple code returned 0 for a no-`default_off` act too** (checked
at `483b3e12`), so this is not a regression from the decouple — it is a hole the decouple
walked up to and did not close.

**Proposed fix, for aeon and not applied here:** emit the three names unconditionally,
declining as a real count-0 table (`pub data BgAnim_View_H: [u16; BGANIM_VIEW_EMIT] = if
DEBUG == 1 { [0] } else { [] }`) so selecting a declined twin is an OFF row rather than a
link failure. The section-size assert would need the count words accounted for. **I did not
make this change**: it is a peer's generator, and a rig that needs an engine edit to exist
is a weaker rig than one that does not.

**What it forced.** No live second band is available, so the rig is **one band riding the
DEBUG view twins**, which is the route the 2026-09-03 proof took. `pattern_px` must be 64;
on a vertical band `pattern_px = rows*8`, so `rows = 8`; the rotation unit `cols*32` must be
a power of two, so `cols = 8`. **The geometry was discovered by building, not chosen.**

---

## 4. What Aurora authored, and what I wrote by hand

The authoring step is `scratchpad/vertical-onscreen-rig.vitest-script.ts` (this repo, this
branch). It is a vitest file and deliberately not a `*.test.ts` — vitest's `include` does
not reach `scratchpad/`, and a file that looks like a test and is never collected is a
silent zero inside a green total.

### Aurora's codec did all of this

| step | door |
|---|---|
| read and write the act document | `parseBgOverride` / `serializeBgOverride` |
| the period along the axis | `bandPatternPx` → 64 |
| the rotation unit | `bandRotationUnitBytes` → 256 B |
| the slot order | `bandCellSlot` / `bandSlotCell` |
| the eight phase banks as Y-rolls of phase 0 | `shiftedPhaseBanks` |
| the band itself, validated through the codec's own validator | `createBand` |
| retiring the shipped band to static art, image-preservingly | `planBandDemotion` + `demoteBand` |
| placing the new band at slot 0 and renumbering every layout word | `planBandInsertion` + `insertBand` |
| the verdict on the finished document | `validateBgOverride`, `bgOverrideSectionIssues` |

### I wrote these three by hand, and they are the parcel's own content

1. **The 64x64 phase-0 pixel plane.** Aurora has no art generator for this shape, so the
   plane is composed from the act's own blob: rows 0..31 are the shipped band's art decoded
   row-major, rows 32..63 are the 32 static tiles that follow it, decoded the same way. It
   is then cut into the band's slots through `bandCellSlot`, and the cut and the decode are
   asserted to be inverses. **Nothing is synthesised** and the distinctness the whole
   direction argument rests on is asserted, not assumed (§6).
2. **`default_off: true` on the new band** — §3's constraint, set on the band after
   `createBand` returns.
3. **The plane paint.** This is the link L3 and the reason the parcel exists:

   ```
   layout[row*64 + col] = 0x4000 | (slotBase + (row % 8)*8 + (col % 8))
       for every col with ((col >> 3) & 1) === 0
   ```

   Alternating 8-wide stripes — band on columns 0-7, 16-23, 32-39, 48-55; the act's own art
   untouched on the others — so **every 320 px screen window at every scroll shows both the
   moving band and untouched control art**. The rig must not depend on where the camera
   happens to be. `0x4000` is palette line 2 with **no flips**, and the no-flips half is
   load-bearing rather than cosmetic: a vflip bit reverses the pixel row order *inside* the
   tile and would invert the quantity under measurement. It is asserted (`word & 0x1800`
   is 0).

### Budgets, checked by arithmetic because `FAST` skipped `bganim_room`

- tiles 320 → **384**, against `BG_TILE_CAPACITY` **400** (aeon `vram.toml` `bg_region`,
  400 since EFFECTS-W1 item 9d). Static tiles 384 − 64 = **320**, exactly
  `BG_STATIC_TILE_BUDGET`.
- section = `2 + 44·1 + 3·(2 + 44·1) + 64·256` = **16,568 B** against the ruled ceiling
  **20,480**. Slots 64 against the 79 the ceiling allows.

---

## 5. The slot layout, DERIVED and not assumed

The parcel's warning was right to insist: column-major was measured for a **horizontal**
band and does not transfer.

**A vertical band is ROW-major: local slot = `row * cols + col`.** Three independent
readings, all at committed revisions:

1. **aeon's contract, the normative statement.** `tools/EFFECTS_CONSUMER_CONTRACT.md` at
   `f62a3d5c`, obligation 1: *"Horizontal wants column-major (slot `base + c*rows + r` at
   band cell `(c, r)`); vertical wants **row-major** (`base + r*cols + c`)."* The same
   section records the guard that exists because a writer got it wrong: `_band_pixels` now
   decodes row-major for vertical and column-major for horizontal, so a band that
   *"declares `vertical` and emits column-major slots is broken in obligation 1"*.
2. **Aurora's sole producer.** `bandCellSlot` in
   `src/core/formats/bg-override/bg-override.ts` returns
   `bandIsHorizontal(band) ? col * band.rows + row : row * band.cols + col`, citing the same
   contract section. Every Aurora surface that turns a band into a grid goes through it.
3. **The generated data, which is where I checked it rather than trusting either.** After
   the build, `games/sonic4/data/generated/ojz/act1/zone_bg.bin` was read directly: **all
   2,048 band-stripe cells carry `0x4000 | (1024 + (row%8)*8 + (col%8))`, zero
   mismatches.** That is the row-major relation surviving the injector's transpose into
   column-major storage.

And the hop from plane row to screen row, read out of aeon at `f62a3d5c`:

- `BG_Init` (`engine/level/bg.emp`) sets the VDP address to `VRAM_PLANE_B_BYTES + col*2`
  with autoincrement `$80` (= 128 B = one plane row) and drains 64 rows per column in
  source order. `Section_RedrawPlanes`' Plane B blit is byte-for-byte the same shape, and
  `Draw_BG_TileColumn` has **zero callers**. So it is a one-shot full blit, and **plane row
  == layout row, no offset and no wrap.**
- Plane B is at **`$E000`** (`VRAM_PLANE_B`, reg `$04` from `boot_data.emp`), planes are
  **64x64** (`$11` in the VDP init table). So plane cell `(col, row)` is the word at
  **`$E000 + row*128 + col*2`**.
- Vertical scroll: `Vscroll_Write` emits one longword to VSRAM 0; the **low** word is plane
  B (VSRAM `$02`). The engine states the convention itself, in the `VSCROLL_BG_MAX`
  derivation: *"the VDP shows SCREEN_HEIGHT plane lines starting at the VSRAM value v"* —
  screen row `s` shows plane pixel row `(V + s) mod 512`.
- **At boot, `V = 0` for OJZ act 1.** Section 0 binds `Scene_Editor_ojz_act1_start`, whose
  `v_factor` is **15** — the lock sentinel — with `v_offset` 0, so `Parallax_Step5_Vscroll`
  takes `.v_locked` and `Parallax_Current_Vscroll_BG` is 0. `Camera_X` = 96, `Camera_Y` =
  144. **Caveat, and it is real:** section 0's preset patches a plane-B VSRAM split at
  `line: 222, offset: $0043`, so screen lines **222-223 only** show plane rows 222+67. The
  band rows this rig reads are far above that.

**Therefore band row `r` is drawn at screen rows `8r`, `8r + 64`, `8r + 128`, … —
monotone increasing in `r`.** That is the relation the measurement tests the other end of.

---

## 6. The expectation table

`/home/volence/sonic_hacks/aeon-vrig-onscreen/rig/expectations.json`
(659,056 B, md5 `ccfbfe684eff3b7ab80ba851fc455560`). Machine-readable, and §8's checker
reads it so the overseer re-derives nothing.

### The band

| | |
|---|---|
| geometry | 8 cols x 8 rows, **axis vertical**, `driver: timer`, `rate_shift: 2`, `default_off: true` |
| slots | blob 0..63 → VRAM slots 1024..1087 → **`$8000` .. `$87FF`** |
| emitted record, read out of the build | `_BgAnim_ViewT0_hdr = [2, 2, 63, 8, 64, $8000]` — driver 2 (timer), rate_shift 2, **step_mask 63**, **col_shift 8** (unit `1<<8` = 256 = `cols*32`), 64 tiles, dest `$8000`. Every figure is the vertical one; the same band declared horizontal would emit 63 → 63 and 8 → 5 |
| step | `s = (Logic_Tick_low >> 2) & 63`, so 1 px per 4 frames, 256 frames per cycle |
| coarse / fine | `coarse = s >> 3` ∈ 0..7 (byte rotation `coarse * 256`), `fine = s & 7` (bank index) |

### The composite, derived from the engine and then checked against the artefact

`BgAnim_Update`'s two-piece wrapped DMA, read at `f62a3d5c`:

```
piece 1:  src = bank + c*U   len = T - c*U   dst = B
piece 2:  src = bank         len = c*U       dst = B + (T - c*U)     [skipped when c == 0]
```

so destination byte `d` holds bank byte `(d + c*U) mod T`; with `U = cols*32` that is
exactly `cols` whole tiles, and **band slot `j` holds bank `fine`'s tile `(j + coarse*cols)
mod 64`.** Composing with bank *k* = phase 0 rolled up by *k*:

> **band-plane pixel row `Y` at step `s` shows phase 0's pixel row `(Y + s) mod 64`.**

Content travels toward **decreasing Y**, and §5 puts decreasing Y at decreasing screen row.
That is `up`.

### UP and DOWN, side by side

| | prediction for slot `j = (r, c)`, pixel row `py` |
|---|---|
| **UP** | `phase0[(r*8 + py + s) mod 64][c*8 + px]` |
| **DOWN** | `phase0[(r*8 + py − s) mod 64][c*8 + px]` |

Both are in the file, per step, per slot, as 32-byte hex strings packed exactly the way
`inject_editor_bg.py` packs a tile.

### Which samples separate them — three bars, not one

**The second and third bars were found by running the checker against a synthetic broken
machine, not by reasoning.** I built a capture from the ROM's own bank blob with the coarse
rotation's sign flipped, at step 37, and the checker said **UP**. It was right to: at coarse
4 of 8, `c ≡ −c (mod 8)`, so a reversed rotation is byte-identical to an honest one. The
same fixed-point argument applies to the bank index at fine 0 and 4.

| bar | what a failure at it would hide | steps that pass |
|---|---|---|
| `discriminating` — UP ≠ DOWN | the direction of the composite | **62 of 64** (all but **0** and **32**, where `2s ≡ 0 mod 64`) |
| `separatesCoarseSign` — ≠ a reversed coarse rotation | half the mechanism | 48 of 64 (coarse ∉ {0, 4}) |
| `separatesBankIndex` — ≠ a reversed bank index | the other half | 48 of 64 (fine ∉ {0, 4}) |
| **`fullySeparating`** — all three | | **36 of 64**: 9-11, 13-15, 17-19, 21-23, 25-27, 29-31, 41-43, 45-47, 49-51, 53-55, 57-59, 61-63 |

Every flag is **derived by comparing bytes**, not from the arithmetic — a flag computed from
the formula could not catch art that made two different rotations produce the same picture —
and each is then cross-checked against the fixed-point argument it was *not* computed from.

**The rig discriminates.** At step 13 (coarse 1, fine 5) UP and DOWN differ at **all 64
slots**, and so do both reversed-half machines.

### The predictions are pinned to the built artefact, not to themselves

Three checks, all against generated data rather than against the model:

1. For all 64 steps × 64 slots — **4,096 comparisons** — the UP table equals
   `bg_anim_banks.bin`'s bytes under the engine's own DMA formula. **All match.**
2. The DOWN table **disagrees at every discriminating step** and agrees at exactly the two
   that are not.
3. `bg_tiles.bin`'s first 2,048 bytes are byte-identical to bank 0 — the prefix identity
   `tiles[slot_base…] == phases[0]` that aeon's coherence check asserts.

### Non-vacuity, which is what makes any of it mean something

aeon's own probe generator refuses art whose `H` pixel rows are not all distinct, because a
repeated row makes some vertical roll a no-op and *a frozen band would pass the up
predicate*. The same bar is asserted here, on both axes: **all 64 pixel rows and all 64
pixel columns of phase 0 are pairwise distinct.** Every bank `k` is additionally asserted to
**be** phase 0 rolled up by `k` and **not** to be an X-roll — the shimmer aeon's
`validate_band_phase_axis` exists to refuse.

### Red-first: the guards were planted before they were believed

| plant | result |
|---|---|
| paint the plane **column-major** (`(col%cols)*rows + (row%rows)`) | RED — *"ROW-major on a vertical band — aeon EFFECTS_CONSUMER_CONTRACT §1.2: expected 8 to be 1"* |
| invert the **UP model** (`+ s` → `− s`) | RED — *"UP model at step 1 slot 0 must equal bank 1 verbatim"*: the model is pinned to the ROM's bytes, not to itself |
| make phase 0 **repeat every 32 rows** (top plane twice) | RED — *"phase 0 must have all H pixel rows DISTINCT…: expected 32 to be 64"* |

All three restored with `git checkout --` from a committed baseline; green again after each.

### The checker, exercised on six synthetic machines

`scratchpad/vertical-onscreen-verdict.py` (copied to the rig directory as `verdict.py`).
Every arm was built from the **built ROM's own bank blob**:

| arm | verdict | rc |
|---|---|---|
| honest, sampled at 13 / 5 / 0 | UP | **0** |
| honest, sampled only at 5 and 37 (both at a fixed point) | UP, but *NO FULLY SEPARATING CAPTURE* | **1** |
| coarse rotation reversed, step 13 | **NEITHER** → *TEAR* | **1** |
| bank index reversed, step 13 | **NEITHER** → *TEAR* | **1** |
| both reversed, step 13 | **NEITHER** → *TEAR* | **1** |
| the DOWN table verbatim, step 13 | **DOWN** → *"BAND_SCROLL_DIRECTIONS.vertical is wrong"* | **1** |
| honest but the control slot moved | *control changed; not attributable* | **1** |

`rc == 0` means **UP, cleanly**, and nothing else. DOWN and NEITHER are results, not greens,
and both exit non-zero so neither can be skimmed past.

---

## 7. ⚠ A screenshot diff cannot answer this, and is not offered

A band DMAs new pixels into fixed slots, so the nametable tile index never moves; this lane
measured 0 of 27 sample points changing tile id across 90 frames while every screenshot
differed. The quantity that answers it is **VRAM tile bytes at the band's own slots, mapped
to screen rows through the nametable** — which is exactly §8's steps 6 and 7.

---

## 8. The run recipe

Numbered, and it re-derives nothing. Symbol addresses are read from
`/home/volence/sonic_hacks/aeon-vrig-onscreen/s4.debug.lst`.

1. **Load** `/home/volence/sonic_hacks/aeon-vrig-onscreen/s4.debug.bin`
   (crc `76fec315`, md5 `26ed6d3c475888bdfef9f8b40fff6a8c`). ⚠ A private instance, never
   the owner's window.
2. **Run to the level** — ~600 frames from reset is what the 2026-09-03 run used. Confirm by
   reading `Camera_Y` = `$FFFFA730` (long; expect `$0090` = 144 in its high word at rest) and
   `Parallax_Current_Vscroll_BG` = `$FFFF88EA` (word; expect **0**).
3. **Confirm the band is ON SCREEN before anything else.** Read Plane B's nametable at
   **`$E000`**, 16 bytes. Expect `4400 4401 4402 4403 4404 4405 4406 4407` — plane cells
   (0..7, row 0), drawing band slots 0..7 rebased by `BG_TILE_BASE_SLOT` 1024.
   Then `$E080` (row 1, cols 0..7) → `4408 … 440F`, and `$E100` (row 2) → `4410 … 4417`.
   **This is link L3 and it is half the answer**: increasing plane row draws increasing band
   row, and plane row `R` occupies screen rows `8R..8R+7` because the vscroll is 0.
   The full 64-entry table is `expectations.json` → `nametable.samples`.
   ⚠ If these words are wrong, stop: the ROM is not the rig ROM.
4. **Select a moving table.** Hold **START** for ≥ 2 frames with **no D-pad direction held**,
   then press **C** (one edge). The chord is `Debug_BgAnimViewHotkey`: gate 1
   `Input_Source` (`$FFFF8036`) must be 0, gate 2 START held, gate 3 no direction held,
   gate 4 C *pressed*. It advances then installs, so **one press installs row 1 =
   `BgAnim_View_H`**. Because the band is authored `driver: timer`, row 1 is tick-driven —
   no camera motion is needed.
5. **Verify the press landed, before believing any reading.** Read
   `BgAnim_Table_Ptr` = **`$FFFFE91A`** (long). It must be **`$00029402`** =
   `BgAnim_View_H`. (`BgAnim_Table` = `$000293D4` is the OFF row and is what boot installs;
   `BgAnim_View_V` = `$00029430`, `BgAnim_View_T` = `$0002945E` — rows 2 and 3, three
   presses total if you prefer the explicit timer twin, which is byte-identical here.)
   `Debug_BgAnim_View` = `$FFFFEE0F` (byte) is the cursor; expect 1.
6. **At each capture, read four things in this order:**
   - **the step** — `BgAnim_LastStep` = **`$FFFF8F06`** (word). This is the *committed*
     step, so it cannot disagree with what was DMA'd. (Cross-check if you like:
     `(Logic_Tick+2` at `$FFFF8006`, word`) >> 2 & 63`.)
   - **the band** — **2,048 bytes of VRAM at `$8000`**.
   - **the control** — **32 bytes of VRAM at `$8800`** (blob slot 64, the first static tile;
     the band does not own it). A second, on-screen control if wanted: `$8820`.
   - nothing else.
7. **Take at least three captures**, and **at least one must be at a step in
   `expectations.json` → `sampling.fullySeparating`** — `9, 10, 11, 13, 14, 15, 17, …`.
   The step advances every 4 frames, so ~40 frames apart lands on different steps. A run
   whose samples all fall at steps 0 or 32, or at coarse 0/4 and fine 0/4, **cannot fail**,
   and the checker says so by name rather than passing.
8. **Verdict.** Write each capture as
   `{"label": "...", "step": <int>, "band_hex": "<4096 hex chars>", "control_hex": "<64 hex chars>"}`
   and run:

   ```sh
   python3 /home/volence/sonic_hacks/aeon-vrig-onscreen/rig/verdict.py \
     --expect /home/volence/sonic_hacks/aeon-vrig-onscreen/rig/expectations.json \
     --capture cap1.json --capture cap2.json --capture cap3.json
   ```

### What each reading means

| reading | meaning |
|---|---|
| **rc 0, `UP`** at a fully separating step, control byte-stable | **L2 re-measured on an on-screen band, and L3 measured in step 3.** A viewer sees the band's art travel toward decreasing screen row. `BAND_SCROLL_DIRECTIONS.vertical = 'up'` is confirmed as a statement about a screen, not only about a decode |
| **rc 1, `DOWN`** | the composite runs the other way. Given that L1 and L3 are asserted and verified above, this means the engine's rotation opposes Aurora's phase roll consistently — and Aurora's panel word is **wrong** |
| **rc 1, `NEITHER`** (a *tear*) | the fine phase roll and the coarse rotation carry different signs. No amount of resampling fixes it; it says the mechanism is broken, and it is the outcome aeon's own red-first plant showed a DMA-level-only witness would miss |
| **rc 1, control changed** | the band's change is not attributable — the BG art was reloaded. Discard the run |
| **rc 1, no fully separating capture** | the run proves nothing. Re-sample |
| step 3's nametable words wrong | not the rig ROM, or the plane was not blitted. Stop |

---

## 9. What I did NOT establish

1. **Nothing was measured.** No emulator was called. Everything in §6 is derived from the
   document and cross-checked against *generated data* and the *ROM's own bank blob*; the
   claim that the running machine matches it is the recipe's job.
2. **No human has looked at it,** and this parcel does not make that possible either. The
   taste look is the owner's.
3. **The band is `default_off` and therefore off in the plain ROM.** Only the DEBUG shape,
   after one START+C, animates anything. That is §3's constraint, not a choice, and it means
   **this rig cannot say what a released ROM does** — only what the engine does.
4. **A `FAST=1` build**, which the build banners as a dev artifact. `bganim_room` did not
   run, so the section budget is checked here only by arithmetic (§4). Not re-run
   canonically.
5. **empyrean was not pinned.** aeon's resolver reached the live sibling checkout at
   `f42fe045`. The 2026-09-03 run materialised a pinned pair; I did not. Nothing in this
   parcel reads an empyrean value, but the ROM was built with whatever that tree held.
6. **`SIGIL_BUILD` / `SIGIL_EMIT` were not in my environment** — see §2.
7. **The DOWN column is a reference point, not a reachable machine state.** The eight banks
   are ROM data written by Aurora as up-rolls, so no engine behaviour alone produces the
   DOWN table; a machine with one half reversed produces `NEITHER`. DOWN's job is to prove
   the UP match is not vacuous, and it does that at 62 of 64 steps. The recipe's `DOWN` row
   is therefore the *composite* running the other way, which would implicate Aurora's
   producer as well as the engine.
8. **I did not fix aeon's link defect** (§3), and I did not check whether any other act or
   game hits it.
9. **Band 0's demotion changes the act's picture.** The stripes on half the plane are the
   band's art, not the authored canopy. This copy is a rig, not a candidate for anything.

---

## 10. Files

| what | where |
|---|---|
| the authoring step | `scratchpad/vertical-onscreen-rig.vitest-script.ts` + `.vitest.config.ts` (this branch) |
| the checker | `scratchpad/vertical-onscreen-verdict.py` (this branch) |
| the aeon copy | `/home/volence/sonic_hacks/aeon-vrig-onscreen` — **not committed**, delete when done |
| the rig ROM | `/home/volence/sonic_hacks/aeon-vrig-onscreen/s4.debug.bin` |
| the listing (symbols) | `/home/volence/sonic_hacks/aeon-vrig-onscreen/s4.debug.lst` |
| the expectation table | `/home/volence/sonic_hacks/aeon-vrig-onscreen/rig/expectations.json` |
| the checker, beside it | `/home/volence/sonic_hacks/aeon-vrig-onscreen/rig/verdict.py` |

Reproduce the authoring from a pristine copy:

```sh
BG_OVERRIDE_PATH=<copy>/games/sonic4/data/editor_bg_override.json \
EXPECT_OUT=<copy>/rig/expectations.json \
  npx vitest run --config scratchpad/vertical-onscreen-rig.vitest.config.ts
# then, in the copy, with SIGIL_BUILD / SIGIL_EMIT set:
DEBUG=1 FAST=1 ./build.sh
```

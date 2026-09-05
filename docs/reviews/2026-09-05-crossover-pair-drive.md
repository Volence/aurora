# The half-width pair is CONFIRMED on a running machine — and the cell-width control did NOT reproduce the defect

**Foreground overseer run, 2026-09-05.** Closes the first row of row 153's
`[TAG-FOREGROUND]` (`docs/reviews/2026-09-04-loops-two-way-mark.md` §7) and leaves the
second row **open with a measurement against it**. No Aurora code changed; no aeon tree
written.

## 1. Result, both rows of §7's table

| ROM | §7 expected | measured |
|---|---|---|
| **half-width pair** (aeon master, unmodified) | `layer` 0→1 on the marked column **and stays 1** | ✅ **exactly one write**, `Player_LoopCrossover.fire`, value 1, and it holds |
| **cell-width pair** (control) | `layer` returns to 0 — the defect, reproduced | ❌ **also exactly one write.** Final `layer` = 1. **The pair did not cancel.** |

§7 wrote the second row's failure condition itself: *"it stays 1, which would mean the
parity model is wrong and §1 needs re-deriving."* That is what happened.

⚠ **This does NOT invalidate row 153's shipped fix.** The half-width mark does exactly
what it was built to do, now witnessed on a running machine. What is unreproduced is the
*rationale* — the claim that a cell-width pair "netted to nothing. Every two-way pair,
not a corner case."

## 2. ⚠ MASTER ALREADY SHIPS HALF-WIDTH TWO-WAY PAIRS — so the half fixture is master

Not built for this run; found in it. `section_0.collattr*.bin` at aeon `9e3d2861` carries
8 marks per plane, **all at one 8 px column (143)**, `to-b` on A and `to-a` on B at the
same indices. On rows 35/71 plane A the *neighbouring* half carries the geometry
(`0x149A`) while only col 143 carries the mark (`0x949A`) — `CrossoverSpan: right`,
working in production exactly as designed.

So the control is the thing that had to be built: the same marks widened to **both** 8 px
halves. Two clones of aeon `9e3d2861`; in one, 8 words per plane read-modify-written to
set only bits 15:14 (`assert (new & 0x3FFF) == (old & 0x3FFF)` — the geometry is
preserved, which is the mistake that ate a previous parcel). The trees differ in **exactly
2 files, 8 bytes each, at the intended indices** and nothing else.

## 3. THE CONTROL IS REAL — verified in the engine's own cache, not in my source file

This is the half that makes the negative result reportable, and it took four checks
because a "the other side's model is wrong" result is the one most likely to be my own
broken setup:

- the bake **ran** (both trees re-baked; the staleness gate caught the edit on both arms);
- `crossover.bin` and `sec0_strips_a.bin` both **differ** between the ROMs;
- the added mark **fires**: the one `layer` write in the control happens at **x1136 = col
  142**, the column that exists only in the control;
- and at the moment of the crossing, **the engine's live `Tile_Cache_Collision` holds the
  full pair**: plane A `0x25`/`0x25` (= attr 37, `TO_B`) and plane B `0x26`/`0x26`
  (= attr 38, `TO_A`) at cols 142 **and** 143, collision row 15, both read at frame 591
  and again at 593 with the window re-derived at each frame (it scrolls; `Left_Col` and
  `Origin_Col` advance together, so the world cell resolves to the same slot).

## 4. The anomaly, stated precisely, because it is aeon's engine to explain

At **frame 592** every input for a second flip is present and verified:

| quantity | value | how |
|---|---|---|
| `layer` before | **1** (plane B) | read at frame 591 and 593 |
| position | **x1148**, inside col 143 (1144–1151) | read at frame 593 |
| row | **544** at both frames 590 and 592 | `xover_cell` low word — *same row*, so no geometry excuse |
| the edge fired | **yes** | `xover_cell` high word written `0x478` = 1144 at frame 592 |
| plane B cache there | **38** | `Tile_Cache_Collision` + 3658 |
| `CrossoverTable[38]` | **1** = `TO_A` | read out of the ROM at `CrossoverTable+38` |

Reading `player_common.emp`, that path must reach `move.b d0, layer(a0)`. **It does not:
`layer` is 1 before and after, by direct read, not only by watchpoint.** I could not
explain it from source and did not keep guessing.

## 5. Also confirmed live: the 8 px trigger column

Independently re-measured on these ROMs (first measured this morning on the 09-04 pair,
`docs/reviews/2026-09-05-crossover-trigger-granularity.md`): the quantised X values step
`1008, 1016, 1024 … 1224` — uniformly +8, all 8 px aligned, **not** all 16 px aligned.
The "one Aurora cell = two trigger columns" premise is measured, twice, on two builds.

## 6. Reproducing it

```sh
git clone --shared <aeon> ch && git -C ch checkout 9e3d2861   # and a second clone, cc
# in cc: set bits 15:14 of word idx-1 for each of the 8 marked indices, per plane
#        A |= 0x8000 (to-b), B |= 0x4000 (to-a); preserve bits 13:0
EMPYREAN_SUITE_ROOT=<suite> SIGIL_BUILD=<sigil> SIGIL_EMIT=<emit_sound_blob> FAST=1 DEBUG=1 ./build.sh
```

Then, on each ROM: boot, **press B** (the DEBUG shape boots into free flight;
`debug_flag` must read `0x00`), warp via the mailbox — `Warp_Req_X=1000`, `Warp_Req_Y=550`,
then `Warp_Req_Flag=1`, **that order, it is the protocol** — which lands him grounded at
**x1000, y557, plane A**, aeon's own asserted setup. Then hold RIGHT for 120 frames with a
write watchpoint on `layer`.

⚠ **Re-resolve every address from that build's own listing.** `Player_1` is `$FFFF8FFE`
here and `$FFFF8FFA` in the 09-04 pair. And on `reload_rom` between two same-size ROMs the
previous symbols report `symbolsDropped: false` and still "bind" — load the new listing
explicitly or you will read the wrong build's addresses with no warning.

## 7. Provenance

- **aeon** `9e3d28614cbee78ffeec74eab6e2bcd2ffc301b3`, two `--shared` clones, never the
  live tree. `ch` md5 `925e0c4f0e93b9700a2705c77081ac4b`, `cc`
  `a5b6d3b99d1ac031b76e53e6c08602f3`, both 845 638 B.
- **Toolchain, hashed rather than named** — `build.sh` warned `SIGIL_BUILD` is stale
  against sigil HEAD (`756c7efd` built vs `311ded5a`). Harmless here because **both ROMs
  used the identical binary**, and rebuilding it is forbidden in this repo. `sigil`
  md5 `58db359428e9b38e633836313bf40487`, `emit_sound_blob`
  `b9d971d4a322f98c803bc479ad3e1d9f`. Banner: `sigil 0.1.0 (756c7efd)`.
- **`FAST=1`**, documented byte-identical to canonical on the same tree, and it auto-runs
  the re-bake the edit requires. Both trees forced stale so both took the same path.
  Verification lanes were skipped — these are DEV artifacts for driving, not for landing.
- **sigil relink hold checked before building**: `NO ACTIVE HOLD`, table empty, at sigil
  `origin/master`.
- Private emulator (`own-instance`, pid 435411, own socket, `ORACLE_SOCKET` unset) —
  never the owner's window.

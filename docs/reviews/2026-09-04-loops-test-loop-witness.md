# LOOPS-P — a real loop exists in the ROM, and here is how to drive it

**2026-09-04.** Branch `parcel/loops-test-loop-witness`.
Instruments: `scratchpad/loop-plan.py` (the derivation), `scratchpad/loop-witness-harness.mjs`
(`npm run harness:loop-witness`, **13/13**), plus three pinned aeon builds by shell.
Builds on `docs/reviews/2026-09-03-o47-crossover-rom-arrow.md` (the pipeline proof and
the control technique) and `docs/reviews/2026-09-03-o56-loop-authoring-door.md` (the
controls a person clicks).

## What this closes, and what it does not

O47's closing line was the gap: *"nobody has driven through one, and no loop exists in
the act we tested against."* Half of that is now false.

| claim | verdict |
|---|---|
| a loop EXISTS, authored through Aurora's own palette and strokes | **YES** — 58 geometry cells + 6 marked cells, saved by a real Ctrl+S into a pinned aeon checkout |
| it reaches the ROM | **YES** — the bake announces it, `CrossoverTable` gains non-zero slots, and the ROM differs from a crossover-masked control |
| a player has been DRIVEN through it | **NO. Not attempted — no emulator from a background agent.** `[TAG-FOREGROUND]`, and §7 is the recipe |

**§6 is a defect finding that changes the encoding's design, not a detail.**

---

## 1. Provenance — the pinned checkout, and the live tree that was never touched

The hub's correction landed mid-parcel and it was right: an `rsync` of `../aeon` would
have carried another lane's uncommitted edits, so no byte claim could name a revision.
Everything here is **three independent `git clone`s of the aeon object database,
checked out at `75da5e1c12d631a1f76ceac938ee82a51d0bc578`**, each `git status --porcelain`
clean at checkout:

| tree | contents |
|---|---|
| `suite/aeon` | **baseline** — `75da5e1c`, no edit of mine. The four-shape control. |
| `suite-ctrl/aeon` | `75da5e1c` + the painted loop **with bits 15:14 masked off** |
| `suite-loop/aeon` | `75da5e1c` + the painted loop **as painted** |

Each sits under a suite-shaped root (`<root>/aeon` beside symlinks to the real
`empyrean`, `sigil`, `sonic_hack`, `skdisasm`, …) because `tools/suite_paths.py`'s
marker walk needs a parent holding both `aeon` and `empyrean`. That detail is
load-bearing and is why O47 could only build `FAST=1`: **without it the canonical
build is red in `/tmp` on 7 of its own tool tests** (`test_suite_paths.py` ×3,
`test_emp_helper_closure.py` ×4), which have nothing to do with the ROM. With the
marker layout, `pytest tools` is **2145 passed, 30 skipped** and every build below is
**canonical, not FAST** — so `tools/loop_crossover_gate.py`, the gate that executes the
crossover read site, actually ran.

The live aeon working tree was never written and never read by path: HEAD `6048f065`,
`git status --porcelain | wc -l` = 0, before and after.

**Aurora's Build & Run was not the path used**, and the hub's source read holds as far
as it goes: `basePath` is a parameter and the bake/build was done by shell against the
pinned checkouts. I did not exercise Build & Run against a pinned checkout, so the
"open the pinned checkout as the project and Build & Run lands bytes there" claim is
**still unobserved** — booked as open in §8.

### The assembler did not move underneath the comparison

| | md5 |
|---|---|
| `sigil` before and after the whole run | `6c2378ae8a657e26684d4019a7d976d7` (identical at both readings) |
| `emit_sound_blob` before and after | `b9d971d4a322f98c803bc479ad3e1d9f` (identical) |

`build.sh`'s own banner, matched on the text `Assembler: sigil`, was
`sigil 0a58f2ecc8e7 (clean at capture — no uncommitted changes)` on **every one of the
twelve builds**. No `cargo` command was run anywhere in `../sigil`. sigil's committed
`docs/OVERSEER.md` carries **NO ACTIVE HOLD**.

---

## 2. The four build shapes, before and after — the inherited red is a control result

**Established FIRST, on the baseline tree with no edit of mine**, exactly as the hub
asked. Every cell is a canonical `./build.sh` (no `FAST`).

| shape | **baseline** `75da5e1c`, no edit | **control** (+ geometry, marks masked) | **loop** (+ geometry + marks) |
|---|---|---|---|
| `./build.sh` (sonic4) | **rc 0** · `s4.bin` 720,821 B crc `7c7e4d09` | **rc 1** · crc `f8b59b81` | **rc 1** · crc `98b1f2cd` |
| `DEBUG=1 ./build.sh` | **rc 1** · `s4.debug.bin` 741,873 B crc `bdcf11e9` | **rc 1** · crc `4fdca878` | **rc 1** · crc `db33266a` |
| `./build.sh demo` | rc 0 · 96,602 B crc `3c5dcde6` | rc 0 · crc `3c5dcde6` | rc 0 · crc `3c5dcde6` |
| `DEBUG=1 ./build.sh demo` | rc 0 · 102,818 B crc `36014485` | rc 0 · crc `36014485` | rc 0 · crc `36014485` |

**Both `demo` shapes are byte-identical across all three trees** — demo does not consume
OJZ collision, and that identity is a control on the whole procedure.

The baseline row was taken **twice**, hours apart, and reproduced to the byte: the first
run was on the freshly-cloned tree, the second after a `tools/regenerate-level.sh`
re-bake of the *unpainted* editor data. `s4.bin` md5 `ec3eed913718a8c92acf53c93fd87eac`
and `s4.debug.bin` md5 `3121cf2bcd72e949ad4ebd92e75ad834` both times — so the re-bake
reproduces the committed generated tree exactly, and the build is deterministic. Without
that line, "the ROM changed" would be consistent with build nondeterminism.

**Read the two reds separately; they are different claims.**

**(a) `DEBUG=1 sonic4` — INHERITED, on all three sides, not mine.** `bganim_room`:
`dac_banks` is declared at `0x90000`, packed data ends at `0x8C01E`, leaving **16,354 B
< `DATA_GROWTH_RESERVE` 16,384 B — short by 30 bytes**, exactly as the hub said.
Identical text on the baseline and on both my trees. **A ROM is still emitted** (it is a
post-sigil gate), and that ROM is the one to drive.

**(b) `sonic4` release — APPEARS AFTER MY BAKE, and it is a FINDING, not a defect in the
loop.** `sprite_tilt_gate`:

```
FIXTURE STALE (tools/fixtures/sprite_tilt_cut.json) — the pre-build unit tests are
running over a cut that is no longer this routine:
  Ani_Sonic moved: fixture $02A94C, listing $02A9C8      (+$7C = +124)
```

The fixture pins **absolute ROM addresses**. Authoring 58 collision cells grew section
0's compressed block blob by 124 bytes, every symbol between it and `$90000` moved by
that much, and the fixture went stale. **It is red identically on the control and on the
loop tree**, so it is not a crossover effect — but it is red-by-construction for *any*
act-content change, which is a real obstacle to the LOOPS-P goal and is booked in §8.
I did not re-stamp it: it is an aeon artefact and this parcel does not write aeon.

`tools/loop_crossover_gate.py` sits **below** `sprite_tilt_gate` in `build.sh`
(lines 1095 vs 1039), so it never ran inside those builds. I ran it by hand instead —
see §5.

---

## 3. What was authored, and why every number in it is derived

`scratchpad/loop-plan.py` states each derivation beside the number it produces; this is
the summary.

**Where.** OJZ act 1, section 0. The floor is **rows 53-54, solid on BOTH planes from
cell 0 to cell 79** — measured off the committed `section_0.collattr.bin`, not assumed.
The player spawns at section-local `($0100, $0100)` (`act_descriptor.emp`
`start_local_x`/`start_local_y`), falls to that floor at world x ≈ 256, and has ~500 px
of runway before the loop. The loop's centre is **world (768, 800)**, both on 16 px
boundaries so no cell straddles the circle's horizontal extremes (which is what would
force a two-run column that `rotate_profile` refuses).

**How big.** `r_in = 48 px`, `r_out = 80 px`. The radius is bounded by the engine, not
by taste: the slope factor integrates to `v_top² = v₀² − 2·PHYS_SLOPE_WALK·Δy` where Δy
is the rise of the player's **centre**, `2·(r_in − PLAYER_Y_RADIUS)`. With
`PHYS_TOP_SPEED $600` (6.0 px/f), `PHYS_SLOPE_WALK $20` (0.125 px/f²) and
`PLAYER_Y_RADIUS 19`, `r_in = 48` gives **4.7 px/f at the apex** against
`PHYS_SLIP_SPEED $280` (2.5 px/f), the speed below which `Player_SlopeRepel` detaches.
`r_in = 64` would give 3.3; `r_in = 88` would fall off the top.

**What shape each cell is.** Fitted against aeon's own base bank
(`games/sonic4/data/collision/base/{heightmaps,angles}.bin` — 252 non-empty shapes),
scored on the per-pixel mask `collision_pipeline.covers()` produces, over all four
flips, rejecting any variant `rotate_profile` refuses. **Worst per-cell residual: 8 px
of 256.** The bank expresses this circle almost exactly, which is itself a finding: the
S&K shape library already contains the curve set a loop needs.

**Which plane each cell is on — read off a REAL shipped loop.** `scratchpad/s2loop.py`
decompresses s2disasm's `EHZ_HTZ.kos` with aeon's own `load_chunk_map` and prints
per-block path-A/path-B solidity. Chunks `$19`/`$1A`/`$29`/`$2A` are a working Sonic 2
loop, and its shape is unambiguous:

```
  $19 | $1A        row 0-1   XXXXXXXX XXXXXXXX   the loop TOP, solid on BOTH paths
                   row 2-11  .BBBB... ...AAAA.   LEFT leg path B only,
                             .BB..... .....AA.   RIGHT leg path A only
  $29 | $2A        row 12    AAAAXXXX AAAA....   the ground, with a both-planes
                                                 patch at the bottom centre
```

> ### ⚠ This contradicts the anchor's §3.3 worked example, and the anchor is wrong
>
> `docs/LOOP_CROSSOVER_ENCODING.md` §3.3 says *"plane L = ground + LEFT half of the
> loop. plane R = ground + RIGHT half"* and has the rightward traveller approaching **on
> L**. A player approaching rightward on L hits **the left leg**, which L holds, long
> before he reaches the bottom-centre mark. The approach plane must lack the **near**
> leg. The real loop above does exactly that and the anchor's example does not.
> §3.3's *conclusion* (a per-plane pair of absolutes dominates a toggle) is untouched;
> its worked layout is not authorable.

So the plan is the shipped one, with the ground left alone because it is already solid
on both planes:

```
plane A                       plane B
  row 45 ....######....         ....######....     rows 45-47: the ring TOP, both planes
  row 46 ...########...         ...########...
  row 47 ..###M######..         ..######M###..     M = geometry + crossover mark
  row 48 .....m...###..         ..###...m.....     m = mark on an air cell
  row 49 .....m...###..         ..###...m.....     rows 48-51: RIGHT leg on A,
  row 50 .........###..         ..###.........                 LEFT leg on B
  row 51 .........###..         ..###.........
  row 52 ......######..         ..######......     row 52: bottom-centre patch on both
  (cells 41..54 left to right; rows 53/54 are the existing floor, NOT written)
```

---

## 4. It was authored through Aurora's controls, and the harness is 13/13

`npm run harness:loop-witness` — **13 passed, 0 failed**, whole-run aggregate.

Every stroke is `armCollisionBrush(...)` (the same store actions the palette chips
call — O56 measured that equivalence) followed by a **real `Input.dispatchMouseEvent`
press/release on the real `#map-canvas`**, with the tool armed by the **real `c`
hotkey**. Not a poke. The plane files are then read back off disk.

| row | result |
|---|---|
| `[enc]` | the RUNNING build's crossover encoding matches this source tree — `dist/` is not stale |
| `[open]` | Aurora opened the **pinned checkout**, 9 sections |
| `[arm]` | the real `c` hotkey armed `paint-collision` |
| `[audit-legal]` | Aurora's own paint-time audit: **0 self-marks, 0 reserved** (aeon rules R1/R2) |
| `[audit-shape]` | `marksA=12 marksB=12 pairs=0 oneWay=24` — the one-way pattern §6 requires |
| `[audit-divergent]` | `divergent=908 solidBoth=1160` (from 780/1056) — the two legs are on different planes |
| `[dirty]` | the strokes dirtied the document, so the save had something to write |
| `[saved]` | **176 words changed in each plane file** on disk |
| `[marks-a]`/`[marks-b]` | 12 marked words = 3 cells per plane, all four sub-tiles each |
| `[mark-values]` | plane A → `to-b`, plane B → `to-a` — the per-plane absolute pair |
| `[ground]` | **0 words written at or below the floor** the loop stands on |
| `[split]` | all 58 geometry cells solid on exactly the plane(s) the plan assigns |

### The first run was red and that is why `[arm]` exists

Run 1 issued all 84 geometry strokes with the tool still on `view` — the collision
tool's hotkey is facet-scoped and I had not pressed it. Every stroke was a no-op,
`state().dirty` stayed `false`, and the audit read back **exactly aeon's own shipped
numbers** (`divergent=780 solidBoth=1056`, the figures §2.1 of the anchor records). Two
rows would have gone green on the absence of a stroke. `[arm]` and `[dirty]` are the
rows that make that unmissable, and both are fatal now.

---

## 5. The bake, and the ROM

### The bake announced it, and the control was silent

The same generator, the same run, on the two trees:

```
loop:  sec 0: editor collision baked (984 non-air cells)
       NOTICE: sec 0 carries 6 plane-A and 6 plane-B loop crossover mark(s). They are
       BAKED into the attr-set and reach crossover.bin.
ctrl:  sec 0: editor collision baked (980 non-air cells)
       (no NOTICE line at all)
```

`984` is derived and it checks out: the shipped section-0 count is 896, plane A gained
44 cells, and `apply_editor_collision_overlay` counts **tile** columns, so 896 + 44×2 =
**984**. The `984` vs `980` gap is the other half of the same arithmetic — the two
**marked AIR cells** on plane A (`cc46` rows 48-49, 2 tile columns each) intern to a
NON-ZERO attr in the loop tree and to zero in the control. `6` marks per plane is 3
cells × 2 tile columns.

### The ROM, measured three ways

All three ROMs are **exactly 720,821 B** (`s4.bin`) and **741,873 B** (`s4.debug.bin`).
"No per-cell ROM growth" holds at the ROM level.

A raw byte count would be misleading here and is reported as such: `ctrl` vs `loop`
differ in **352,863 bytes**, but that is a SHIFT, not content. Comparing the two
listings' symbol tables:

| comparison | what moved | where the shift starts | where it is absorbed |
|---|---|---|---|
| baseline → control | **+124 B** — the loop GEOMETRY, compressed | `OJZ_Sec1_Blocks` | the DAC bank at `$090000` |
| baseline → loop | **+138 B** | same | same |
| **control → loop** | **+14 B** — the MARKS alone | same | same |

2,234 of 2,402 symbols do not move at all; 168 move by exactly the figure above. Nothing
grows or disappears (`only in A: 0, only in B: 0`).

### `CrossoverTable` — the load-bearing measurement

Read at **each ROM's own symbol address** (the table moved +14 between them, so reading
both at one address would have been wrong — and was, on my first pass):

| tree | shape | `CrossoverTable` | non-zero slots |
|---|---|---|---|
| control | release | `$070634` | **none** |
| control | debug | `$070F96` | **none** |
| loop | release | `$070642` | **`(30, 2) (32, 2) (42, 1) (43, 1)`** |
| loop | debug | `$070FA4` | **`(30, 2) (32, 2) (42, 1) (43, 1)`** |

Four slots, and each one is accounted for by what was painted — the `SolidityTable`
byte at the same index (the two tables share the attr index) says which is which:

| slot | value | solidity | what it is |
|---|---|---|---|
| 30 | `2` = `XOVER_TO_B` | `3` = `SOL_ALL` | plane A's mark **over real geometry** (`cc46`, row 47) |
| 32 | `2` = `XOVER_TO_B` | `0` = `SOL_NONE` | plane A's mark **on AIR** (`cc46`, rows 48-49) |
| 42 | `1` = `XOVER_TO_A` | `3` = `SOL_ALL` | plane B's mark over geometry (`cc49`, row 47) |
| 43 | `1` = `XOVER_TO_A` | `0` = `SOL_NONE` | plane B's mark on AIR (`cc49`, rows 48-49) |

The attr-set high-water mark goes **71 → 75**: exactly four new
`(heights, angle, solidity, xover)` keys, which is the whole mechanism — the mark rides
in the *identity* of the interned attr byte.

> **Two `SOL_NONE` slots with a live crossover is aeon's §6 change (1) demonstrated on
> real content for the first time** — `bake_plane_cell` does not gate the mark behind
> solidity, so a crossover on an air cell survives. Its `⚠ [TAG-RUNTIME]` half (that
> `probe_core` treats such a cell as air) is **still unexecuted**; this shows the bake
> half only.

### The read site, executed — `tools/loop_crossover_gate.py`, run by hand

```
loop_crossover_gate [s4.debug.lst]:
  Player_LoopCrossover $01013C-$01017B (64 B) + Collision_GetType $006A28-$006A8F
    (104 B), both EXECUTED
  shipped CrossoverTable: 256 slots, 4 marked, 0 holding the reserved value 3
  148 executions: 6 consumption, 2 plane-select, 138 edge-trigger, 2 off-cache
  2 of them changed Sst.layer BECAUSE a byte of CrossoverTable in the ROM image was
    changed and nothing else was
```

The control's output is **identical except one line**: `0 marked` instead of `4 marked`.
The gate reads the four marks out of the ROM image itself.

⚠ **The gate exits 1 on BOTH trees**, for the same fixture reason as `sprite_tilt_gate`:
`tools/fixtures/loop_crossover_cut.json` pins `Player_LoopCrossover`'s 64 bytes, and one
byte at `+49` differs — fixture `$1A`, control `$96`, loop `$A4`. **`$A4 − $96 = $E =
14`**, precisely the shift measured above, which is the gate's own case (a):
*"displacement bytes following a symbol move"* — it is the low byte of the routine's
`lea CrossoverTable`. Not an opcode change. Booked in §8 with `sprite_tilt_gate`.

---

## 6. ⚠ THE FINDING — a two-way crossover pair CANNOT be authored from Aurora's grid

This is derived from source on both sides and it decided the whole mark layout.

`Player_LoopCrossover`'s edge trigger is keyed on a packed cell id:

```
const XOVER_CELL_MASK = (($10000 - COLL_CELL_W) << 16) | ($10000 - COLL_CELL_H)
ensure(XOVER_CELL_MASK == $FFF8FFF0, …)          games/sonic4/player/player_common.emp
```

`COLL_CELL_W` is **8 px** and `COLL_CELL_H` is 16 px (`engine/system/constants.emp`),
so the trigger fires once per **8 px** column crossed. **Aurora authors 16 px cells** —
its brush writes all four 8 px sub-tiles of a cell identically
(`cellTileIndices`, and `apply_editor_collision_overlay` reads `col` as a tile column).

Therefore **every mark an author can paint is an even number of trigger cells wide**,
and a two-way pair — plane A carrying `TO_B` where plane B carries `TO_A`, which is
exactly §3.3's design — flips a horizontally moving player **an even number of times**
and nets to nothing:

```
x=755 col 94  on A  -> A's TO_B -> layer 1
x=761 col 95  on B  -> B's TO_A -> layer 0
x=773 col 96  on A  -> A's TO_B -> layer 1
x=779 col 97  on B  -> B's TO_A -> layer 0      net change: NONE
```

The player's top speed is 6 px/f, below the 8 px column width, so he cannot skip a
column; and at a loop's apex or bottom his Y stays inside one 16 px row, so the Y half
of the id adds no odd fire. This is not a corner case — it is every two-way pair.

**What this parcel did instead**, and it is the shape §3.3 itself calls strictly
dominant: **two spatially separated ONE-WAY marks**, each on the far side of the apex
from the leg it hands you to.

| | plane A (`TO_B`) | plane B (`TO_A`) |
|---|---|---|
| cells | `cc46`, rows 47-49 — world x `736..751`, y `752..799` | `cc49`, rows 47-49 — world x `784..799`, y `752..799` |

- **rightward:** on A up the right leg → crosses the apex leftward → passes `cc49`
  first, where **plane A holds nothing** → reaches `cc46`, plane A's `TO_B` fires
  (any number of times, idempotently) → descends the left leg on B → runs out right,
  the right leg absent on B.
- **leftward:** on B up the left leg → crosses the apex rightward → passes `cc46`
  first, where **plane B holds nothing** → reaches `cc49`, plane B's `TO_A` fires →
  descends the right leg on A → runs out left, the left leg absent on A.

One-way marks are idempotent, so the parity problem cannot touch them; the **ordering**
does the work a toggle would have done. Aurora's own audit reports this as
`severity: warn` ("one-way crossover"), which is correct and is exactly the case the
audit's comment says is *"the single most likely authoring mistake"* — here it is the
only shape that works. **That warning's wording should be revisited**, and the anchor's
§3.3 should carry the parity constraint. Booked in §8; neither is changed here.

---

## 7. THE DRIVING RECIPE — for the overseer's foreground run

**No emulator was run by this parcel.** Everything below is derived from source.

### The ROMs

Both are **canonical** (not `FAST`) builds of `games/sonic4` at aeon `75da5e1c`, copied
out of the scratch trees to a durable path:

```
/home/volence/sonic_hacks/loops-p-witness-roms/
  loop-s4.debug.bin   741,873 B  md5 5d887d9b65b248ddd0eac5713250d053   <- DRIVE THIS
  ctrl-s4.debug.bin   741,873 B  md5 c6fba3ae858b9b3424156cb16c032a85   <- and this
  loop-s4.debug.lst / ctrl-s4.debug.lst                                 <- symbols
  loop-s4.bin  md5 6c645c72aee62172236b628883cc1d91   (release shape)
  ctrl-s4.bin  md5 a0c4e968fd56587c426f1188aea1bbaf
  baseline-s4.debug.bin  md5 3121cf2bcd72e949ad4ebd92e75ad834  (no loop at all)
```

The two `s4.debug.bin` differ ONLY through the crossover marks: their inputs are
byte-identical outside bits 15:14 of 12 words per plane (§5), and the ROM delta is the
+14 shift plus four `CrossoverTable` slots.

Drive the `DEBUG=1` shape: debug-fly is armed there (`CHEAT_DEBUG_FLY` is set at game
init in the DEBUG shape only), so **B toggles free flight** and a bad landing is
recoverable. Note the DEBUG shape's build is RED for an inherited reason (§2) but it
**emits a ROM** and that ROM is the one to drive.

### Getting there

1. Boot into OJZ act 1. The player spawns at section-local `(256, 256)` and **falls**
   to the floor at world y ≈ 848 — there is no ground at the spawn height; that is the
   shipped behaviour, not something this parcel changed.
2. Hold **RIGHT**. He needs ~384 px to reach `PHYS_TOP_SPEED` from a standstill
   (`v²/2a`, `a = PHYS_ACCEL $C` = 0.0469 px/f²) and has ~500 px before the loop. Do not
   tap; a run-up below ~4 px/f will not carry the apex.
3. The loop's bottom-centre is **world x = 768**. The floor starts curving up at about
   **x = 778**.

### What "he ran the loop" looks like in memory — the fields, and what each takes

The quantity that answers the question is **`Sst.layer`**, and it is the ONLY field
whose value differs between "ran the loop" and "ran along the floor".

| field | offset in `Sst` | **address, player 1** | type | what it says |
|---|---|---|---|---|
| **`layer`** | **`$2D`** | **`$FFFF9027`** | u8 | **0 = collision path A, 1 = path B.** The crossover's only output. |
| `x_pos` | `$02` | `$FFFF8FFC` | 16.16 | **high word = pixel X.** `Player_LoopCrossover` reads exactly this. |
| `y_pos` | `$06` | `$FFFF9000` | 16.16 | high word = pixel Y |
| `status` | `$1E` | `$FFFF9018` | u8 | `ST_*` bits |
| `angle` | `$1F` | `$FFFF9019` | u8 | terrain angle, 256/turn. Sweeps a full 256 around the loop — a floor run holds ≈ 0. |
| `PlayerV.ground_speed` | `$30` | `$FFFF902A` | i16 | 8.8 px/frame. `$600` = top speed, `$280` = the detach floor. |
| `PlayerV.player_state` | `$32` | `$FFFF902C` | u8 | `PSTATE_*`; leaving the ground shows as AIR/AIRBALL |
| `PlayerV.debug_flag` | `$3C` | `$FFFF9036` | u8 | non-zero = free flight (skips physics — a flight through the loop proves nothing) |
| `PlayerBlock.xover_cell` | `+20` (`$14`) | `$FFFFE93A` | u32 | the packed `(x & $FFF8)<<16 \| (y & $FFF0)` id the edge trigger compares. Watching it tick is how you see the trigger working at all. |

The absolute column is `Player_1 = $FFFF8FFA` (and `Player_Blocks = $FFFFE926`,
`Cheat_Flags = $FFFFE91E`) plus the struct offset, **read out of `loop-s4.debug.lst`'s
own symbol table, matched on the NAME.** `sizeof(Sst)` is `$50`, so player 2 is at
`$FFFF904A`. These addresses are true for **this pair of ROMs**; they move with the
build, so if you drive anything else, resolve them again from that build's listing
(`emulator_load_symbols` / `emulator_lookup_symbol`) rather than copying from here.

### The transition to watch for, and where

**Rightward run, LOOP ROM:** `layer` must go **0 → 1** on the frame the player's
**centre** first enters `x_pos.hi ∈ [736, 751]` **and** `y_pos.hi ∈ [752, 799]` — the
top-left of the loop, roughly `(746, 776)`. It then stays 1 all the way down the left
leg and out of the loop. `angle` sweeps the full 256 units; `ground_speed` should dip
to roughly `$300`-`$4C0` at the apex and never below `$280`.

**Rightward run, CONTROL ROM:** `layer` **stays 0 for the whole run**. Because plane A
holds the ring's top band (rows 45-47) but not its left leg (rows 48-51, `cc43-45`), he
rides the ceiling past the apex and then **runs out of geometry** on the way down the
left side. Derived rather than guessed: within row 47 the inner surface's left branch
runs from the apex `(768, 752)` down to `(733, 767)` — `|dx| = √(48² − 33²) = 34.9` at
the row's bottom edge — and the cell below that point, `cc45` row 48, is **absent on
plane A**. So his feet leave the geometry at about **`(733, 767)`** and he falls ~80 px
into the loop's interior, landing on the floor inside the ring.

That visible difference is what makes the control worth having: *"Sonic kept moving"* is
indistinguishable from *"Sonic ran along flat ground"*, but *"Sonic fell out of the top
of the loop"* is not.

**A screenshot cannot settle this.** This lane has a 0-of-27 result on band pixels
against screenshots that differed on every capture. The evidence is `layer` at `$2D`
sampled across frames, on both ROMs, from the same input.

### Two things that will make it look broken when it is not

- **There is no ART.** Only collision was authored. The loop is invisible; Sonic runs a
  circle through empty sky. That is expected.
- **A free-flight pass proves nothing.** `debug_flag` non-zero routes through
  `Player_DebugMove`, which skips physics *and* the state dispatch. Fly to the run-up,
  then toggle **B off** and run in on the ground.

---

## 8. What is open, and why

| # | what | why it is open |
|---|---|---|
| 1 | **NOBODY HAS DRIVEN IT.** | `[TAG-FOREGROUND]`. No emulator from a background agent — invariant, not an oversight. §7 is the whole recipe; the answer is `Sst.layer` at `$FFFF9027` across frames on both ROMs from the same input. |
| 2 | **Two aeon gate fixtures are address-pinned and go stale on ANY act-content change.** `tools/fixtures/sprite_tilt_cut.json` (reddens the release `sonic4` build) and `tools/fixtures/loop_crossover_cut.json` (reddens the crossover gate). Both red identically on the control and the loop tree, both diagnosed as symbol moves, neither re-stamped. | They are aeon artefacts and this parcel does not write aeon. **Whoever lands loop content in aeon must re-stamp both in the same change**, or the build is red for a reason that has nothing to do with the content. |
| 3 | **The anchor's §3.3 worked example is not authorable** (§3), and **§3.3's two-way pair is not authorable at all** from a 16 px grid (§6). | `docs/LOOP_CROSSOVER_ENCODING.md` lives in aeon. Reported here; the amendment is aeon's to make. Aurora's own `crossover-audit.ts` calls a one-way crossover *"the single most likely authoring mistake"* — for a loop it is the only shape that works, and that comment should be revisited on our side. |
| 4 | **Aurora's Build & Run was NOT exercised against a pinned checkout.** | I built by shell. The hub's source read (`basePath` is a parameter, `plan.cwd` follows it) is consistent with it working, but **it is unobserved**, and "the main-process half holds" is not the same claim. Worth one foreground run: open the pinned checkout, Build & Run, and check which tree gained a ROM. |
| 5 | **The loop has no ART.** Collision only. | Out of scope for a throwaway test loop, and it makes the witness *more* legible, not less — but an author would want tiles, and that is a separate parcel. |
| 6 | **The bake's own NOTICE still prints aeon's stale prose** — *"no loop exists in OJZ act 1, so the read side is proven by executing the ROM's own bytes and not by anyone having driven through one."* In the loop tree the first clause is now false. | aeon's string. |
| 7 | **Leftward traversal is designed for but unverified even on paper past the apex.** The mark layout in §6 is symmetric and the geometry is symmetric, so it should work; nothing measured it. | Same reason as row 1. Drive rightward first. |
| 8 | **The painted plane files are not committed anywhere.** They live in the scratch trees; `scratchpad/loop-plan.py` + the harness regenerate them deterministically. | 256 KB of binary in the editor repo for a throwaway fixture is the wrong trade. If the loop is kept, the files belong in aeon, not here. |

---

## 8b. Verification of this branch

| what | result |
|---|---|
| `npm run harness:loop-witness` | **13 passed, 0 failed** — run **three times**, on **two different pinned trees**, the last one after every edit below |
| the authored planes, across two independent runs on two trees | **byte-identical**: `section_0.collattr.bin` md5 `9a9c28bf84daee4f6b96c1a84671b080`, `.collattrb.bin` md5 `fc5ef06e112fa916372a693450bd2abd` both times |
| `npx vitest run` | **6963 passed · 9 skipped · 0 failed** (491 files passed, 3 skipped); every skip named its reason |
| `npx tsc --noEmit` | clean, exit 0 |
| `npm run check:harness-guards` | **210 clean / 210 classified · 0 failures · 0 unmeasurable** (209 before this branch) |
| `node scripts/check-peer-path-literals.mjs` | OK |
| `git -C ../aeon status --porcelain` | **0**, before and after everything |

**Two of my own defects were caught by this repo's gates and are reported, not hidden:**

1. `check:harness-guards` failed the harness on a **dropped `killTree` promise** in a
   file that calls `process.exit()` — the shape that SIGKILLs Electron and leaves a
   Chromium SIGTRAP core (O65). Fixed to `await killTree(child)`; the harness was
   **re-run after the fix** and is one of the three 13/13 runs above.
2. `check-peer-path-literals` failed it for reading `process.env.AEON_DIR` directly
   instead of going through the resolver. Fixed to `checkoutOverride('aeon')`, **and
   the fix carried a real hardening**: the harness now also refuses when the override
   names the LIVE `../aeon`, compared against `siblingDefaultPath` (comparing against
   `siblingPath` would compare the override to itself). **Proven red-first, live:**

   ```
   $ AEON_DIR=/home/volence/sonic_hacks/aeon node scratchpad/loop-witness-harness.mjs
   HARNESS REFUSES: AEON_DIR names the LIVE aeon checkout (/home/volence/sonic_hacks/aeon).
           This harness paints and SAVES. Clone a pinned checkout and point it there.
   ```
   `git -C ../aeon status --porcelain | wc -l` = 0 before and after that run.

### ⚠ `npm test` does not reach vitest **in a linked worktree**, and it is not this branch

The chain stops at `check-cited-paths` with **`COULD NOT MEASURE`** — not a failure, a
refusal to report a number it could not take, which is the behaviour this repo asks for.
The cause is environmental and is worth knowing for every worktree agent:

```
$ git check-ignore -v node_modules/foo
fatal: pathspec 'node_modules/foo' is beyond a symbolic link
```

A linked agent worktree has no `node_modules`, so it must be symlinked to the main
checkout's — and `git check-ignore` refuses any path beyond a symlink, so the gate's own
ignore probe cannot run. Everything before it in the chain is green (`check-test-collection`
494/494, `check-pseudo-skip`, `check-peer-path-literals`), and the vitest aggregate above
was taken with `npx vitest run`. O56 reported this chain blocked at
`check-ledger-timestamps`; that entry is gone and the chain now gets four gates further.

## 9. Reproduction

```
# 1. three pinned checkouts of aeon @75da5e1c under suite-shaped roots
git clone --no-hardlinks /home/volence/sonic_hacks/aeon <root>/aeon
git -C <root>/aeon checkout 75da5e1c12d631a1f76ceac938ee82a51d0bc578
ln -s /home/volence/sonic_hacks/{empyrean,sigil,sonic_hack,skdisasm,...} <root>/

# 2. the plan, and the paint
python3 scratchpad/loop-plan.py <root>/aeon scratchpad/loop-plan.json
VITE_AURORA_DEBUG=1 npm run build
ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
  AEON_DIR=<root>/aeon npm run harness:loop-witness        # 13 passed, 0 failed

# 3. the control: the same painted files with bits 15:14 masked off
python3 scratchpad/make-control.py

# 4. per tree, canonical (NOT FAST), with SIGIL_BUILD/SIGIL_EMIT set and
#    EMPYREAN_SUITE_ROOT *unset* so the marker walk answers
./tools/regenerate-level.sh && DEBUG=1 ./build.sh sonic4
```

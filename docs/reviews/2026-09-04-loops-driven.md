# LOOPS-P — the loop has been DRIVEN, and the recipe that told me how was wrong in three places

**2026-09-04.** Foreground overseer pass, no branch, no agent, no repo write.
Closes the `NO` row in `docs/reviews/2026-09-04-loops-test-loop-witness.md`'s own table:
*"a player has been DRIVEN through it — **NO. Not attempted.**"*

| claim | verdict |
|---|---|
| a loop EXISTS, authored through Aurora | YES (row 147, unchanged) |
| it reaches the ROM | YES (row 147, unchanged) |
| **a player has been DRIVEN through it** | **YES.** Full 360°, `layer` 0→1, exits east at speed |
| **the control behaves differently under the SAME input** | **YES.** Rides the ceiling, falls out, ends 464 px west, `layer` never leaves 0 |

---

## 1. The instrument, and what it is an instrument *of*

Private headless server, **not** the owner's window: `oracle-aether` pid 435411,
`mode: own-instance`, socket `/tmp/oracle-mcp-v8e7c_yc/oracle.sock`, spawned by this
session's own shim (pid 435378, itself started 09:03Z — **after** the ~08:21Z reap that
the suite board was still reporting as a standing outage). `pgrep -P 435378` returns the
child, which is the check `OVERSEER.md` requires before trusting any emulator call here.

`romFreshness` came back `verified` **by `emulator/memory_hash`**, i.e. the bytes the
server holds were compared to the file — not the launch line, which the server itself
warns says nothing about what it still holds.

**Both ROMs were md5'd on disk before loading** and match the witness packet's recorded
digests exactly: loop `5d887d9b65b248ddd0eac5713250d053`, control
`c6fba3ae858b9b3424156cb16c032a85`.

**Every address was re-resolved from each build's own `.lst`, by NAME**, per the witness
packet's own instruction not to copy its numbers. `Player_1 = $FFFF8FFA`,
`Player_Blocks = $FFFFE926`, `Cheat_Flags = $FFFFE91E` — identical in both builds and
identical to the packet's derivation. `layer` at `$FF9027` was additionally confirmed by
the server's own `symbolDisp: 45` (= `$2D`) on a single-byte read, and `debug_flag` by
`symbolDisp: 60` (= `$3C`), so the offsets are the server's arithmetic and not mine.

⚠ **The 68000 bus is 24 bits wide and the read tool enforces it.** `0xFFFF8FFA` is
refused; the address to send is `0xFF8FFA`. This cost one call and is worth writing down
because every address in the witness packet is spelled the long way.

---

## 2. THREE CORRECTIONS TO §7 OF THE RECIPE — and the first one silently invalidates the run

The recipe is otherwise good, and its central prediction is confirmed to the pixel (§3).
These are the three places following it exactly does not produce the run it describes.

### (a) ⚠ FREE FLIGHT IS **ON AT BOOT**, NOT MERELY ARMED — and a run that ignores this proves nothing

`debug_flag` (`$FF9036`) reads **`$FF` at level start**. The recipe says
*"`CHEAT_DEBUG_FLY` is set at game init in the DEBUG shape only, so **B toggles** free
flight"* and then, in step 1, *"The player spawns at section-local `(256, 256)` and
**falls**"*. He does not fall. He hovers, indefinitely: measured at frames 400 and 600,
`y` is `256` both times, unchanged.

This is the recipe's own §"Two things that will make it look broken when it is not"
firing on the recipe itself — *"A free-flight pass proves nothing"* — and it fires
**silently**, because free flight looks like a working game. My first attempt held RIGHT
for 60 frames and read `x` 256 → 1216: **960 px in 60 frames, 16 px/f, at constant `y`,
with no gravity.** That is roughly 2.7× `PHYS_TOP_SPEED`, and nothing on screen says so.
A less careful pass would have "driven the loop" by flying through where it is and
reported a success.

**The fix is one line into step 1: press B for 2 frames FIRST, and assert `$FF9036` reads
`$00` before you believe anything after it.** Verified: after the press it is `$00`, and
he immediately begins falling (`y` 256 → 573 over 120 frames).

### (b) The spawn floor is **y = 573**, not 848

He lands at `y = 573` at `x = 256` and stays there. 848 is the floor **near the loop**;
the terrain steps down eastward, so the recipe's *"falls to the floor at world y ≈ 848"*
describes the right place by the wrong number for where he starts. Not load-bearing on
its own — it becomes load-bearing through (c).

### (c) ⚠ THE UPPER FLOOR ENDS AT x ≈ 700 AND HE FALLS OFF IT — so the recipe's run-up cannot be taken

Step 2 says *"Hold RIGHT. He needs ~384 px … and has ~500 px before the loop."* That is
true of the distance and false of the ground. Running right from the spawn floor, he
**drops off its eastern edge at x ≈ 700**, tumbles into the lower area, and arrives near
the loop at `(666, 829)` with a ground speed of **`$0090` = 0.56 px/f** — against the
~4 px/f the recipe itself says is the minimum to carry the apex. Following the recipe
exactly produces a player who cannot enter the loop, and the failure looks like the loop
rejecting him.

**The run-up must be taken on the LOWER floor**, which I mapped by running west along it:
**flat at `y = 829`, continuous from at least `x = 278` to `x = 666`**. That is 490 px of
approach to the loop at `x = 768` — comfortably past the 384 px the physics needs.

**Replacement for step 2, and it is what the rest of this document ran:**
after landing, **hold LEFT ~120 frames** (he reaches `x = 278` at the leftward top speed
`$FA00`), **then hold RIGHT**. He is at `$05F0` (5.94 px/f) by `x = 621` and at the full
`$0600` by `x = 699` — i.e. at top speed with 69 px to spare.

---

## 3. THE MEASUREMENT — loop ROM

Input from reset: `run 400` · `B ×2` · `run 240` · `R60` · `R90` · `R60` · `L120` ·
`R130` · `R15` · `R12` · `R6` · `R6` · `R6` · `R3` · `R2` · `R10` · `R40`.

| frame | x | y | angle | **layer** | ground_speed |
|---|---|---|---|---|---|
| 1102 | 621 | 829 | 0 | 0 | `$05F0` 5.94 |
| 1117 | 699 | 829 | 0 | 0 | `$0600` 6.00 — top speed |
| 1129 | 771 | 828 | 0 | 0 | `$0618` 6.09 |
| 1135 | 795 | 804 | 232 | 0 | `$05E4` 5.89 — climbing the right side |
| 1141 | 791 | 786 | 168 | 0 | `$0592` 5.57 |
| 1147 | 763 | 770 | **128** | 0 | `$0572` 5.45 — **inverted, at the apex** |
| 1150 | 748 | 779 | 110 | 0 | `$0596` 5.59 |
| **1152** | **739** | **789** | 88 | **1** | `$05C4` 5.77 — **THE FLIP** |
| 1162 | 767 | 834 | 18 | 1 | `$06C1` 6.75 — back at floor level |
| 1202 | 1035 | 829 | 0 | 1 | `$06B4` 6.70 — clear of the loop, still running |

**`angle` swept the full 256 monotonically** (0 → 232 → 168 → 128 → 110 → 88 → 18, i.e.
descending through a whole turn), which is the recipe's own stated signature of a loop
run against a floor run — *"a floor run holds ≈ 0"*.

**Ground speed never fell below `$0572` (5.45 px/f)**, far above the `$280` detach floor.
He was never in danger of dropping off, which is why one clean run was enough.

⚠ **THE FLIP IS NOT ON THE FRAME OF ENTRY, AND I AM NOT ROUNDING THAT AWAY.** The recipe
predicts `layer` goes 0→1 *"on the frame the player's centre first enters
`x ∈ [736,751]` and `y ∈ [752,799]`"*. At frame 1150 he is at `(748, 779)` — **inside
both ranges** — and `layer` is still `0`. It is `1` two frames later at `(739, 789)`.
`Player_Blocks.xover_cell` (`$FFE93A`, `symbolDisp: 20` = `$14`) read `$02F0_0300` at
1150: the low word `$0300` = 768 is `y & $FFF0` for y=779 ✓, but the high word `$02F0` =
752 is `x & $FFF8` for **x ≈ 753**, which is where he was on the *previous* frame. **The
trigger's cell id is latched one frame behind the position you read beside it**, which is
exactly the size of the discrepancy. The prediction is right about the window and about
the direction; it is off by one frame. Anyone building a gate on "flips on the entry
frame" would write a flaky one.

⚠ **AND THE SENTENCE ABOVE TELLS ONE STORY WHERE THE OBSERVATION SUPPORTS TWO** — the
aeon lane's correction, accepted, and the better reading of my own measurement. "The cell
id is latched one frame behind" is a claim about the *read site*. But the identical
numbers are equally consistent with **a correctly-latched cell being read one frame after
the position it is compared against** — i.e. an ordering property of the caller, not a
stale latch. **Those want different fixes, and nothing I measured distinguishes them.**
What is established is the *symptom*: the flip lands two frames after window entry, and
`xover_cell`'s high word corresponds to the previous frame's `x`. The mechanism is not
established, by me or by anyone, and the word "latched" in the paragraph above should be
read as naming the symptom rather than the cause.

---

## 4. THE CONTROL — same input, same geometry, marks removed

The control is the same ROM with bits 15:14 masked off 12 words per plane. **Identical
input sequence, replayed call for call.**

**Through frame 1129 the player's 64-byte record is BYTE-IDENTICAL between the two ROMs
except two bytes** — `$13` (`$A4` vs `$96`) and `$1D` (`$30` vs `$22`). Both differ by
exactly **`$0E` = 14**, which is the +14 ROM shift the witness packet documented as the
consequence of the marks changing the compressed blob's size. So the two runs are the
same run, in the same place, at the same speed, arriving at the loop the same way — and
the only difference visible in the player's own state is a pair of pointers displaced by
the documented amount. That is the control doing its job.

| frame | loop ROM | control ROM |
|---|---|---|
| 1129 | (771, 828) angle 0 **layer 0** `$0618` | (771, 828) angle 0 **layer 0** `$0618` — identical |
| 1135 | (795, 804) angle 232 layer 0 | (795, 804) angle 232 layer 0 — identical, both climbing |
| **1152** | (739, 789) angle 88 **layer 1** | **(739, 788) angle 96 `layer` 0** |
| 1162 | (767, 834) angle 18 layer 1, on the floor | (684, 786) angle **128**, layer 0, moving **LEFT** at 6.09 |
| 1202 | **(1035, 829)** layer 1, 6.70 px/f | **(571, 829)** layer 0, **0.97 px/f** |

**Frame 1152 is the whole experiment.** Same frame, same `x` to the pixel, `y` differing
by 1 — and `layer` is `1` on the loop ROM and `0` on the control. From there the two runs
are different runs: the loop player comes down the left leg and leaves eastward at speed;
the control player stays inverted on the top band, rides it *leftward* past the loop's
left edge, runs out of geometry, falls, and lands back on the lower floor **west of where
the loop is**, nearly stopped.

**Final separation: 464 px in `x`, opposite sides of the loop, and 6.70 vs 0.97 px/f.**
This is a state divergence, not a picture — which matters in this repo, where a
screenshot diff has already returned a 0-of-27 result on a question it could not answer.

### ⚠ The control's predicted OUTCOME held; its predicted LOCATION did not

The witness packet derived the fall-out point rather than estimating it, and named it:
*"his feet leave the geometry at about `(733, 767)`"*. **Observed: he is still grounded at
`(684, 786)`, angle 128, ground speed 6.09** — 49 px further west and still on a surface.
So the departure is at least 49 px west of the derivation, on the far side of the loop's
left edge rather than at it.

The derivation's *conclusion* — plane A holds the top band and not the left leg, so he
must run out of geometry — is confirmed. Its *arithmetic for where* is not. I have not
diagnosed the difference and am not claiming to have; what I can say is that he stays on
plane A's top band further west than the row-47 branch math predicts, which is a question
for whoever next touches that derivation. **Booked, not fixed.**

---

## 5. What this does NOT show

- **No art.** The loop is invisible; both screenshots show Sonic against ordinary jungle
  tiles with nothing loop-shaped on screen (`scratchpad/loop-drive-loop-rom-exit.png`,
  `scratchpad/loop-drive-ctrl-rom-fellout.png`). The screenshots are **orientation, not
  evidence**, and the evidence is §3 and §4's tables.
- **One run per ROM.** The server is deterministic (the control reproduced the loop run's
  `mclk` exactly at frames 642 and 1129 before diverging), so a repeat would reproduce
  rather than corroborate. This is not a claim about robustness across run-ups, angles,
  or entry speeds — only that a loop, entered at top speed from the west, is traversed.
- **Nothing about the release shape.** Both ROMs are `DEBUG=1`, where the `sprite_tilt_gate`
  red documented in the witness packet §2 applies.
- **Nothing about the two-way crossover**, which row 147 established is not authorable
  from Aurora's grid at all. This loop is built from two one-way marks.

# The 8 px trigger column, measured on a running machine — and why the pair test is still open

**Foreground overseer run, 2026-09-05.** No repo code changed. This is the first half
of row 153's `[TAG-FOREGROUND]` (`docs/reviews/2026-09-04-loops-two-way-mark.md` §7)
and it does **not** close it.

## 1. What was open

Row 153 narrowed the crossover mark to an 8 px sub-column (`CrossoverSpan`) so that a
two-way pair stops cancelling. The whole argument rests on one quantity: **Aurora's
16 px cell spans exactly two engine trigger columns.** Until this run that "two" was
*derived from a constant* — `XOVER_CELL_MASK == $FFF8FFF0`, read in
`games/sonic4/player/player_common.emp:366` — and never observed.

§7 asks for two things. This run answers the first and reaches neither half of the
second.

## 2. CONFIRMED LIVE — the trigger quantises X to 8 px

Watchpoint on `PlayerBlock.xover_cell`'s high word (`$FFFFE93A`), rightward run,
real physics (`debug_flag` `$FF9036` read `0x00` — the DEBUG shape boots into
free flight and B was pressed to leave it).

**53 recorded writes, every one from PC `$00010150` = `Player_LoopCrossover+20`.**
The 68000 splits the routine's `move.l` into two word writes, so the watched address
receives the **X half** of the packed id — which is what makes this readable at all.

The first 20, decoded: 17 distinct values, `576, 584, 592, 600 … 704`.

| property | result |
|---|---|
| every value 8 px aligned | **yes** |
| deltas between consecutive **distinct** values | **uniformly +8**, no other value |
| every value 16 px aligned | **no** — 664 and 696 are odd multiples of 8 |

That last row is the one that matters. **664 and 696 are precisely the second-half
columns of a 16 px cell**, and the trigger stops on them. A 16 px-quantised trigger
could not produce them. The parity argument is now measured rather than derived.

The three zero-deltas are frames where only the **Y** half of the id moved: the same
long write, unchanged high word. Consistent with the mask, not an anomaly.

## 3. CONFIRMED LIVE, negative — no mark was ever reached

`layer` (`$FFFF9027`) watchpoint: **matched 0**, across 53 trigger fires and ~480
frames of rightward input. Every `CrossoverTable` lookup returned `XOVER_NONE`.

⚠ **A near-miss worth one line:** querying hits for *one* watchpoint reports a
`matched` field that is the **global** counter, so the layer watch first read as
`matched: 53` — the xover_cell count. `watchpoint_list` reports per-watch and says
`0`. Read the list, not the single-watch query, before believing a count.

## 4. WHY THE PAIR TEST WAS NOT REACHED — and it is not a crossover defect

The player **cannot traverse this loop.** He wedges at `x≈807, y=793, angle $E8,
ground_speed 0`, and **300 further frames of RIGHT move him one pixel.**

Not diagnosed, and it does not need to be. The ROM is aeon `75da5e1c` (2026-09-04),
and every traversability fix landed **after** it — the loop's left foot getting its
ramp, the left arc becoming a climbing surface, "the loop is finished and rides both
ways", the rolling clip — all 2026-09-05. The witness packet's own record says nobody
had driven it. **A stall here is the expected state of this ROM, not a finding.**

## 5. ⚠ THE SHORTCUT THAT DOES NOT EXIST — read this before trying to save a build

`CrossoverTable` is **indexed by attr-set index, not by world position**
(`config/constants.emp:365`, "one byte per attr-set index, addressed by the SAME index
as SolidityTable"). Its four non-zero entries in this ROM are at indices **30, 32
(= `XOVER_TO_B`) and 42, 43 (= `XOVER_TO_A`)** — attr ids, not columns. Verified
against the recorded md5 and matching the 2026-09-04 record entry for entry.

So **the half-width / cell-width distinction cannot be poked into the table.** It
lives in which 8 px plane columns carry a marked attr. Any attempt to fake the two
§7 fixtures with `write_memory` on `CrossoverTable` tests nothing.

## 6. What is still open, and what it takes

Both rows of §7's table are unreached: whether `layer` flips **once** through a
half-width pair, and **twice, net zero** through a cell-width one.

It needs the two fixtures built against an aeon master **at or after the 2026-09-05
traversability fixes** — a build, not a poke. Section 7's recipe otherwise stands,
with one correction: its addresses were re-resolved here from
`loop-s4.debug.lst` and all three matched (`Player_1 $FFFF8FFA`,
`Player_Blocks $FFFFE926`, so `layer $FFFF9027`, `xover_cell $FFFFE93A`).

## 7. Rig, asserted before anything was read

- Private emulator, `mode: own-instance`, pid 435411 on its own mkdtemp socket, with
  `ORACLE_SOCKET` unset — **not** the owner's window. Checked by `pgrep -P` on the
  shim before the first call, per the boot doc's one-command test.
- The server was holding a **stale ROM from another session's scratchpad**; the
  witness ROM and its listing were loaded over it and the listing bound `match`.
- `loop-s4.debug.bin` md5 `5d887d9b65b248ddd0eac5713250d053`, matching the
  2026-09-04 record.
- No repo file changed by this run. No aeon tree touched.

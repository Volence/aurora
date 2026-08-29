# LP-3 — a painted loop crossover reaches the FILE, and stops there

**2026-08-29.** Instrument: `scratchpad/crossover-paint-harness.mjs`.
Throwaway aeon worktree `/home/volence/sonic_hacks/.aurora-crossover-paint`
(branch `parcel/ojz-crossover-paint`, cut from aeon `4d86f5db`), reset to clean
after measurement. **Nothing was landed in aeon and nothing is offered for
landing.** The deliverable is this measurement.

## The question, and the answer

The hub asked whether **document → file → bake → ROM** holds for a loop
crossover painted through the agent road.

| arrow | verdict |
|---|---|
| document → file | **HOLDS.** Proven, 13 rows, two fixtures. |
| file → bake | **DOES NOT HOLD, and cannot today.** The bake never reads the field. |
| bake → ROM | unreachable — nothing arrives for it to carry. |

**The ROM is byte-identical across the paint (`06d2ccf6`, 719,205 B, both
sides), and that is the CORRECT result rather than a failure.**

## Why the second arrow fails — named, not inferred

`tools/collision_pipeline.py` at aeon `4d86f5db`:

- Lines 57-75 **do** define the encoding: `XOVER_SHIFT = 14`, `XOVER_MASK = 3`,
  `XOVER_NONE/TO_A/TO_B/RESERVED`. The anchor's "constant hygiene" step landed.
- `bake_plane_cell` (line 229) reads **shape, xflip, yflip, solidity** and
  interns `(heights, angle, solidity)`. Its own docstring enumerates the bits it
  consumes — `9:0`, `10`, `11`, `13:12` — and **15:14 is absent from that list.**

So the field is dropped, exactly as `LOOP_CROSSOVER_ENCODING.md`'s own table
says of the current state (*"unassigned — dropped by the bake"*). This is not a
defect: aeon's overnight order carries the LOOPS-P engine half, bake included,
as unbuilt work. **The constants are staged; the consumer is not written.**

## ⚠ THE TRAP THIS CREATES, AND IT IS THE FINDING WORTH CARRYING

An author can paint crossovers across an entire act today. The editor accepts
it, the file records it faithfully, the bake runs clean, **and the ROM does not
move by a single byte.** Every CRC gate, every byte-neutral witness and every
golden downstream reports "nothing happened" — *correctly*.

That means the usual instruments cannot distinguish **"the crossover was
authored and the bake correctly has nowhere to put it yet"** from **"the
crossover was never authored"**. Editor data can diverge arbitrarily far from
the ROM with no signal anywhere. The costume is a green build.

Consequences, stated so nobody has to rediscover them:

- **A CRC delta is not available as evidence for this feature, in either
  direction, until the bake reads the field.** Do not design a gate around one.
- **"The bytes arrive" and "the crossover works" are claims about different
  halves of a system where only one half is built** (aeon's formulation). Today
  a third claim sits between them and is also false: *the bytes arrive in the
  FILE and not in the ROM.*

## What was measured, and which rows discriminate

Every painted cell is written back with **the word it already had**, plus
`crossover: 'hand-off'` — geometry held constant by construction, so bits 15:14
are the only bits that *can* move. Values derived from the anchor at aeon
`4f846e25` §3.2/§4 (`1` to-A, `2` to-B, `3` reserved), **not** from a peer's
message; aeon flagged that their own relayed number was unverified, and it
turned out correct.

No geometry is assumed: the harness diffs the whole 131,072-byte file and
**derives** which words moved. The grid is not what a reader expects — the file
is per-**8px sub-tile**, so a 4-cell rect moves **16** words per plane, in 2 runs
of 8. That was caught by `paint_collision` replying `painted: 16` to a 4-cell
request, against an assertion that expected 4.

**Two fixtures, because no single one discriminates every row.** In section 0
there is **no** 4-cell run where both planes carry geometry *and* differ
(searched exhaustively: 198 runs have geometry on both, all identical; the
frames below are the two reachable shapes).

| fixture | result | what it earns | what it does NOT |
|---|---|---|---|
| cell (13,13) — A has shape, B is air | 13/13 | `2c` (a cross-plane clobber is detectable) | `5b` passes trivially: B has no geometry to lose |
| cell (56,16) — both planes `0x30ff` | 12/13 | `5a` **and** `5b` both discriminate | `2c` correctly goes **RED**: A == B, so a clobber is invisible here |

**Union of the two frames discriminates every claim row.** Reporting either
frame's total alone would overstate the evidence.

Rows: exactly 16 words changed per plane in the whole file (nothing else moved);
the low 14 bits identical on every changed word; plane A carries `2` and plane B
carries `1`; the two planes carry **different** values (a hand-off writing one
value to both would pass a single-plane check); and the change forms exactly 2
runs of 8, so nothing bled into a neighbour.

## The instrument's own error, kept because it is the lesson

The first draft read plane A and painted `plane: 'both'` with A's words, then
asserted geometry held on both. **Row `5b` went red — correctly.** The method's
own description says it: *"'words' with plane:'both' writes THE SAME per-cell
word into both planes"*, and *"round-tripping a region OVER ITSELF is exact"* —
*over itself* being the operative phrase. The app was right; the instrument was
wrong. Fixed by reading each plane and writing that plane back.

**It only surfaced because the fixture moved to cells with real geometry.** At
the original (8,8) every target word was `0`, and the identical broken call
passed **11/11** — "geometry held" cannot fail where there is no geometry. An
anti-vacuous fixture is not a formality; it converted a green run into a red one
within a single edit.

## Provenance

Baseline and after-build both from the same worktree, ROMs deleted first so
existence proves freshness. **Assembler binary hashed on both sides — md5
`504b0c0ad887424b39334ae123e44b75`, identical** (`sigil 0.1.0 765c31fc`), which
is what makes the CRC comparison a comparison at all; a pinned checkout does not
pin the toolchain. Baseline `s4.bin` `06d2ccf6`/719,205 independently reproduces
aeon's chain-181 pin.

`build.sh` printed its standing warning that a stale assembler emits a
byte-identical ROM whenever source has not changed — noted, and the binary hash
above is the answer to it.

## Open

- The bake half is aeon's (`bake_plane_cell`, plus the six encoding rules the
  anchor lists). Nothing for Aurora to do until it reads the field.
- **When it does land, this harness's ROM half becomes meaningful and should be
  re-run** — today it establishes only that the ROM does not move.

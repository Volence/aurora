# The loop's arc is painted — 36 cells and 2 one-way marks, verified in a ROM

**`loop_crossover_gate.py`: 256 slots, 0 marked → 2 marked.** The gate's own words: *"the FIRST
authored crossover reaching the ROM"*, and it proves consumption causally — flipping one
`CrossoverTable` byte and nothing else changes `Sst.layer`.

## What was painted, and from what

Cells from aeon's committed `docs/loop-arc-cells-section0.json` (aeon `db549f10`) — 88 arc cells
derived from **his drawn art**, 56 needing paint — through Aurora's real path:
`packCollisionCell` → `paintCollisionCellEntries` → `serializeCollAttr`, nothing hand-packed.

| | |
|---|---|
| 16 px cells painted | **36** (14 both-plane, 5 A-only, 17 B-only) |
| sub-tile writes | plane A **76** = 19×4, plane B **124** = 31×4 |
| marks | **2**, 8 sub-tile writes |
| aeon's 56 paint cells now solid | **56/56** |
| controls | ground rows 74–79 and a far region **byte-identical** |

**Shapes are fitted, not solid blocks.** A solid-all cell has angle 0, so a blocky arc is a wall,
not a loop. Each cell takes the best profile from aeon's own base bank against a circle at the
measured void centre `(1148, 488)`, `r_in 92` / `r_out 124` — **worst residual 11/256 px**, four
cells outside the annulus falling back to solid.

**Marks: aeon's recommended pairing, entry on the RIGHT** — plane A `to-b` at cc 148, plane B
`to-a` at cc 137, both row 70. Separated one-way, so R2 cannot see a self-mark and the pair is
parity-free.

## ⚠ Three cells I chose to accept, named so he can feel for them

Columns are 8 px but Aurora paints geometry at 16 px cells, so 16 of the 56 requested cells
round up to include their neighbour. **13 of those land on art (a slightly thicker track,
harmless). Three land in the void** and will read as 8 px of extra edge:

`row 60 col 133` (x 1064), `row 66 col 135` (x 1080), `row 60 col 154` (x 1232).

**Skipping them was not an option** — each shares its 16 px cell with a *requested* arc column,
so dropping the cell loses the arc there and opens a gap to fall through. Three 8 px cells at
the inner edge of a 184 px interior is the smaller error, and it is trimmable if he feels it.

## The instrument failure that cost the detour, and it was mine

I could not reproduce the interior void and refused to paint on numbers I could not check. The
cause: I tested art as **`word != 0`** instead of **`(word & 0x07FF) != 0`, the tile index**.
**176 cells inside the loop carry a non-zero word with tile index 0** — palette and priority
bits on the blank tile — so the raw test read the interior as solid foliage. With the mask, the
void appears immediately and cleanly: 128 → 160 → 176 → **184 px at row 62** → 160 → 144 → 128,
matching aeon's measurement almost cell for cell.

**The refusal was still right** — painting on a reading I could not reproduce is what put a
half-size loop in the wrong place earlier — but the reason I could not reproduce it was a bug in
my own instrument, not in theirs.

*(aeon's stated control for the mask — "the known-solid ground has zero tile-index-0 cells" —
does **not** reproduce here: I count 24 in rows 74–77, cols 128–159. The mask is validated by
the arc appearing, which is stronger than the control; the control itself is unexplained.)*

## Where it is

aeon's working tree, **uncommitted, for them to commit by arrangement** — not an unattended
write this time. Their file's caveat stands and is theirs: *"I cannot see the picture the way a
person can — if a run looks wrong against the art, trust the art."*

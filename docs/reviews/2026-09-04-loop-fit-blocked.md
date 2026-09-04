# I cannot establish the loop's paint target — four instruments, none of which survives its own check

**Nothing written. The mapping question is SETTLED and the paint target is not.** Handing the
arc cell list to the lane that can read the art, which is the split that has worked all day.

## What IS settled, and it is not small

**The collision mapping, from the authority** (`tools/ojz_strip_gen.py`,
`apply_editor_collision_overlay`): *"Editor data is 256×256 cells (one 16-bit word per 8 px
tile); a 16 px collision row samples the top tile row (even rows)."* So the **file** is 8 px
rows and the **engine's** collision row is 16 px — aeon and I were each right about our own
half and applying it to the other's object. ⚠ **Only EVEN file rows reach the ROM**; paint on an
odd row is discarded silently at bake. Aurora's `cellTileIndices` writes both rows of each pair,
so its paint path already satisfies this.

**Both surfaces I measured are real**, checked independently: file rows 72–73 solid at col 143
(y 576 — one pixel under his feet at 575) *and* rows 106–107 solid across cols 0–159 (y 848).
Two different surfaces in different places, not one mis-scaled.

## The four instruments, and why each is unusable

1. **Art-without-collision (aeon's 760 / 228 cells).** Not a paint target here: **the background
   is dense art everywhere**, so the set contains foliage and tree trunks, not the arc. Painting
   it would wall off the approach.
2. **My trunk-vs-arc discriminator.** Failed — it returned TRUNK/arc **alternating with column
   parity**, which is the art's dither pattern, not structure. A discriminator that alternates
   with parity is measuring parity.
3. **The interior void.** I cannot reproduce it. Scanning even rows for the longest run of empty
   art returns **cols 160–175 on every row** — the edge of the drawn area, not a hole. **The
   loop's interior is full of foliage, not empty**, so "void" is not `art == 0` and I do not know
   what reading produces aeon's per-row spans.
4. **The 18 stray "solid with no art" cells.** They are real — but **none is floating**. All 14
   carrying collision have solid support within two rows beneath, including row 70 cols 144–147,
   the four aeon would bet he felt. They read as connected surface, not debris.

**None of these says aeon is wrong** — their instrument may simply be better than mine. It says
**I cannot check their numbers**, and authoring level content into his game on a reading I
cannot reproduce is the exact thing that has already gone wrong twice today.

## What would unblock it in one message

**The explicit arc cell list — `(cc, cr, plane)` per cell — from whoever can read the art.**
Aurora then paints it through the real path (`packCollisionCell` / `paintCollisionCellEntries` /
`serializeCollAttr`), committed by arrangement, which is the handoff shape that has worked every
time today. Shape is not the problem and never was; the anchor is settled at his measured
position. **Only which cells are arc remains, and that is a read of the picture.**

## Also settled, and worth not re-deriving

The engine half is **already built and running** — `Player_LoopCrossover` is called every frame
from the shared preamble and writes `Sst.layer` before the sensors. There is no engine work
pending. And the R2 rule: a plane-A word carrying `TO_A` **raises** at bake, and a missing or
malformed `collattrb.bin` bakes plane B from plane A — which would turn a plane-A `TO_B` mark
into a plane-B self-mark and trip that same refusal. The separated one-way marks are the right
shape; both files must be present and well-formed.

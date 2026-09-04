# The section-0 loop has collision — authored into aeon's tree

**58 geometry cells and 6 one-way crossover marks, written through Aurora's own paint path into
`section_0.collattr.bin` / `.collattrb.bin` at aeon `bef26e4e`.** aeon takes the swap half.

## The premise was wrong and the measurement is why the scope changed

The parcel came as *"add the marks to the existing loop"*. Measured at aeon `origin/master`
first, as instructed: the loop region (cell rows 45–51, cols 43–52) held **0 non-zero of 280 on
plane A and 0 of 280 on plane B**, and **zero crossover marks**. The instrument was controlled —
the same reader sees the floor at rows 53–54 as **640/640 solid on both planes**, a fact the
witness packet states independently.

The owner's words settled it: *"we have a loop in section 0, any chance you can add collision to
it"* — the loop is drawn art with nothing behind it. So this is authoring the collision, not
marking it, which is why it went back for a ruling before anything was written.

## What was written, and it is Aurora's own path

`packCollisionCell` for the word, `paintCollisionCellEntries` for the brush (which expands each
cell to its four 8 px sub-tiles, the same expansion the map viewport uses), `serializeCollAttr`
to write. Nothing hand-packed.

| | plane A | plane B |
|---|---|---|
| sub-tile writes | 168 | 168 |
| = cells × 4 | 42 × 4 | 42 × 4 |
| mark writes | 12 | 12 |

42 per plane is 26 both-plane cells + 16 single-plane, exactly the plan; 6 marks × 4 sub-tiles
is 24 across the two planes. **The marks are ONE-WAY and separated** — plane A hands off `to-b`,
plane B `to-a` — the design proven end to end in the witness ROMs. A matched two-way pair
cancels; the two-way capability landed today and is the follow-on, not this.

## Verified with the instrument that read it empty

Re-read after writing: **plane A 0 → 152 geometry and 0 → 12 marks in-window; plane B the
same**. (152 of 168 because the count window stops at tile row 103 and the loop reaches 105.)
**The floor control is untouched at 640/640.** The occupancy prints as a recognisable loop — top
band, both legs, bottom, standing on the floor — with the mark column visible in it.

## ⚠ One thing I could NOT confirm

**That this collision lines up with the loop he can see.** `loop-plan.py:59` chose the centre
`(768, 800)` for *cell alignment*, not by fitting to art. I looked at `section_0.tiles.bin` and
it cannot answer: it is uniform vertical stripes, and it is **empty exactly where the floor
collision is solid**, so it is not the foreground picture. **If his loop is drawn somewhere
else, this collision is in the wrong place** — cheap to move, but someone who knows where the
art lives should look before he tests it.

## ✅ TWO CORRECTIONS, what is true now

**The branch line below is WRONG.** aeon measured it: the files are **uncommitted on master**,
`fix/swap-gate-lst-default` was already merged and deleted before my write landed, and **the
auto-commit daemon is dead** (verified 2026-08-22 and again now). Nothing auto-committed,
nothing at risk; aeon commits them normally once coordinates are settled. I read the branch off
`git branch --show-current` and inherited the daemon claim from dispatch guidance without
checking it — a live-state read and a stale invariant, both passed on as fact.

**The coordinates are challenged and I believe they hold.** aeon read `objects.json` and
`rings.json` (y 96–210) and inferred the y is ~600 px out. It is not: `collattr.bin` already
carries a floor at cell rows 53–54, so floor top = 53×16 = **848**, and with `height_pixels` 39
FULL the half-height is 19, so a player standing there sits at **829** — which is exactly the
player's **measured** y in the witness run. The rings bracket the rings, not the playfield; the
act descriptor spawns the player at (256, 256) and he **falls** to 829. And the loop was ridden
through a full 256 of angle in that ROM, which geometry 600 px out of place cannot do.
**Re-author held anyway until the owner says where the loop is.**

## Where it landed

aeon's working tree, branch **`fix/swap-gate-lst-default`** (their swap-half branch, editor data
otherwise clean when written). The auto-commit daemon commits `data/editor/ojz` paths to the
**current** branch, so it lands there rather than on master — named here because it is their
branch and their call whether that is where they want it.

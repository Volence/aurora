# An agent should judge a layout from data, not from a screenshot

**Branch** `mcp-collision-read` · **base** master `fe225dd` · **Project** LOOPS-P
**Commits** `6ccf10d` (the method + the write form + 36 node rows) · `04372d9` (the harness)
**Instrument** `scratchpad/collision-read-harness.mjs` — `npm run harness:collision-read`
**Modules** `src/core/collision/collision-region-read.ts` (new) · `src/core/collision/collision-paint.ts` (grew a decider)

---

## 1. The contract, exactly as an agent sees it

An agent gets the method description and nothing else. It cannot read the source
to find out what an omitted field means, and that gap cost this repo a parcel the
day before (`2026-08-29-agent-paint-priority.md` §4). So the descriptions below
are the deliverable as much as the code is.

### `get_collision_region`

| param | type | notes |
|---|---|---|
| `section` | int ≥ 0 | |
| `plane` | `'a' \| 'b'` | |
| `x`, `y` | int 0–127 | **16px CELL** units — the same coordinates `paint_collision` writes, NOT the 8px tile units `get_nametable_region` uses |
| `w`, `h` | int 1–128 | `w*h ≤ 4096` |
| `ascii` | bool, optional | also return a glyph grid with a legend |

> READ a w\*h CELL rectangle (16px units, the same coordinates paint_collision
> writes) of one collision plane — judge a layout from data instead of a
> screenshot. Returns "cells" (h rows of w objects: word, shape, xFlip, yFlip,
> solidity, known, angle) and "words" (those same raw words flat, row-major, w\*h
> long) — pass "words" back to paint_collision as its "words" to restore the
> region. A 16px cell is STORED as four 8px sub-tiles: when they disagree the
> cell is reported honestly as {word:null, mixed:true, sub:[tl,tr,bl,br]} with NO
> shape/flip/solidity, never by sampling one of the four, and "mixedCells" counts
> them (a null in "words" is what paint_collision skips). "word" is all 16 raw
> bits including 15:14, which no Aurora field owns and which a paint preserves;
> "cellsWithUnownedBits" counts cells carrying them. "profilesLoaded" false means
> no collision shape tables are loaded, so "known" is false and "angle" null
> everywhere. Max 4096 cells per call.

Reply:

```jsonc
{
  "plane": "a", "x": 0, "y": 48, "w": 24, "h": 12,
  "cells": [[ { "word": 12290, "shape": 2, "xFlip": false, "yFlip": false,
                "solidity": "all", "known": true, "angle": 0 }, … ], …],
  "words": [12290, 0, null, …],   // flat, row-major, w*h, null where mixed
  "mixedCells": 0,
  "cellsWithUnownedBits": 0,
  "profilesLoaded": true,
  "ascii": "…"                    // only when ascii:true
}
```

A **mixed** cell is `{ "word": null, "mixed": true, "sub": [w,w,w,w] }` and
carries **no** `shape`/`xFlip`/`yFlip`/`solidity`/`known`/`angle` at all.

### `paint_collision` — unchanged fill form, plus `words`

`word` became **optional**; `words` was added. Exactly one, enforced by
`validateCollisionWrite`. `painted` is unchanged; the reply gained `skipped`.

> Paint a w\*h CELL rectangle (16px units) of one collision plane. Pass EITHER
> "word" (fill the whole rectangle with that packed cell word) OR "words" (one
> word per cell, row-major, w\*h long, null = leave that cell alone) — exactly
> one; both or neither is refused. "words" is get_collision_region's reply
> "words" fed straight back, so read then write restores a region exactly. A
> paint AUTHORS shape/xflip/yflip/solidity and KEEPS whatever else each
> destination cell held (bits 15:14 are owned by no Aurora field), so copying
> words to a DIFFERENT place carries those four fields and not the source's spare
> bits. One undo step. Reply: "painted" counts 8px sub-tile entries actually
> changed (up to 4 per cell), "skipped" counts null cells.

### The ascii view, as it actually printed on the real act

Section 0 of Oracle Jungle Zone act 1, the densest 24×12 window (found live, not
assumed) — a solid floor band:

```
             11111111112222
   012345678901234567890123
48 ........................
…
53 ########################
54 ########################
…
59 ........................
```

Glyph rules, in order (the order is the contract, and `COLLISION_ASCII_LEGEND`
states it in the same order):

| glyph | meaning |
|---|---|
| `!` | **MIXED** — the four sub-tiles disagree; read `cells[][].sub` |
| `.` | air |
| `?` | shape index not in the loaded tables (or no tables loaded) |
| `,` | shape present but `solidity: none` — **stops nothing** |
| `#` | every column floor-to-ceiling |
| `\|` | vertical face (every solid column is full, at least one column empty) |
| `"` | hangs from the top |
| `/` `\` | rises to the right / to the left |
| `_` | flat partial floor |

A loop is recognisable: `""""` over `\|  \|` over `####`. Asserted as a picture in
`collision-region-read.test.ts` → *"a loop is recognisable in the grid"*, not
described.

**Stated limitations, in the legend itself:** glyphs show *geometry only*. They
do not show solidity beyond the `,` case, and they do not distinguish which way a
ceiling slopes. `cells[][].solidity` and `cells[][].angle` carry those.

---

## 2. Problem 1 — "a read round-trips into a write" was false, and how it was made true

The dispatch was right that it was false. `paint_collision` took **one** `word`
and filled the rectangle, so a read returning w×h distinct words had no matching
write for any non-uniform region — which is every loop.

**I took the second branch: `paint_collision` grew a per-cell form.** The
reasoning, since the dispatch asked for judgement rather than agreement:

- The first branch ("the round trip only works for uniform regions, say so
  plainly") makes the read's whole justification conditional on the case nobody
  needs. The test loop this is for is a loop; a loop is never uniform. Documenting
  that honestly would have shipped an instrument whose stated purpose does not
  apply to its first consumer.
- A **separate method** (`paint_collision_cells`) was the other option and I
  rejected it: a fill is the degenerate case of per-cell entries, and two tools
  for one operation makes an agent choose, which is a worse failure than choosing
  between two params of one tool. `set_bg` already switches on an optional param
  in this file, so the shape is not novel here.

**Three departures from the dispatch's sketch, all deliberate:**

1. **It is `words`, not `entries`.** `paint_region`'s `entries` are *objects*
   (`entrySchema`). These are packed 16-bit words. Calling them `entries` would
   have told an agent to send `{tile, pal}`-shaped things. `words` pairs with
   `cells[][].word`, which is where they come from.

2. **The read returns a flat `words` array as well as the 2-D `cells`.** So the
   round trip needs *no transformation at all* — `read.words` goes straight back
   as `paint.words`. Making an agent write `cells.flat().map(c => c.word)` is one
   line it can get wrong on a surface where the description is its only
   documentation, and the null-for-mixed case is exactly the one a hand-rolled
   flatten drops.

3. **`null` is legal inside `words`** and means "leave this cell alone". That is
   what makes read → write *total*: every cell the write half can express
   round-trips, and the ones it cannot (mixed cells — see §3) are skipped and
   **counted**, never guessed at. `skipped` is in the reply for that reason.

**I did not change the fill form's behaviour.** `word` still fills; `painted`
still counts sub-tile entries. Harness row `[r6]` is a regression guard on that
and is named non-discriminating.

### Classification: `paintCollisionCellEntries` is a **DECIDER** (writer #16)

Under `2026-08-28-collision-word-preservation.md` §3's taxonomy. The call was not
obvious, so here is the argument:

- A **TRANSFER** moves a whole cell out of a source that owns all sixteen bits (a
  chunk stamp, a clipboard paste). `words[i]` is not that: it is a packed word
  meaning shape + flips + solidity, authored by the caller, identical in kind to
  `paint_collision`'s `word`.
- The decisive point is that `word` **is already a proven DECIDER** — writer #2 in
  that sweep, one of the three that were broken. Two forms of one tool that
  classified differently would be two rules for one gesture, free to disagree.
- So it merges through `collisionPaintWord`, the same function the fill form and
  the interactive stroke use. No word is built by hand.

**The consequence, stated because it bounds the round trip:** reading a region and
writing it back **over itself** is exact — each cell's unowned bits are its own.
Reading it and writing it **somewhere else** carries the four owned fields only;
the destination keeps whatever it had in 15:14. That is the rule working, not a
lossy copy, and it is in the method description ("copying words to a DIFFERENT
place carries those four fields and not the source's spare bits").

Node rows: *"KEEPS the destination cell's unowned bits (it is a DECIDER)"*,
*"cannot smuggle unowned bits IN through a source word"*, *"classifies the same as
the fill form it sits beside"*.

---

## 3. Problem 2 — the four sub-tiles, and what happens when they disagree

**They can disagree, and it is not Aurora's guarantee to make.**

Established from source, not assumed:

- A collision plane is stored at **8px TILE** resolution.
  `SECTION_PLANE_WORDS = SECTION_TILES_WIDE * SECTION_TILES_HIGH`
  (`collision-cell-resolve.ts`), and a 16px cell is the 2×2 block
  `cellTileIndices` names (`collision-cell.ts`).
- `collision-cell.ts` *asserts* "Both tiles of each axis carry the same engine
  attr byte" — but nothing **enforces** it. It is a claim about the source data.
- `src/core/project/aeon/load.ts:270-283` fills `engineCollision` **one 8px tile
  at a time**: `engineColl[row * SECTION_TILES_WIDE + col] = stripData.collision[row * STRIP_COLS + col]`.
  Four independent source bytes per cell, with no cross-check.
- A saved `.collattr.bin` is likewise a per-8px-tile 16-bit plane, so a
  hand-edited or foreign-produced file can express a non-uniform cell.

**And the screen already samples.** `OverlayRenderer.drawCollisionOverlay` reads
`(cr * 2) * SECTION_TILES_WIDE + (cc * 2)` — the top-left sub-tile, alone.

So a reader that samples would be green on every shipped act and silently wrong on
the only case that matters. Worse in a data read than in a picture: the data read
is the instrument an agent *verifies* with, and an instrument that averages away
disagreement cannot report the one thing it was built to catch.

**The answer: report the cell honestly as mixed.** `word: null`, `mixed: true`,
`sub: [tl, tr, bl, br]`, and **no** unpacked fields at all — there is no single
shape/flip/solidity for such a cell, and offering one would be the same lie in a
friendlier shape. `mixedCells` counts them; the ascii marks them `!`;
`paint_collision` skips the resulting `null` and counts it.

**Corroboration, found after the ruling and not before it:** `debug-hooks.ts`'s
`collRect` reached the identical conclusion for the identical reason —
*"Reading the plane at tile resolution rather than cell resolution is deliberate
too… so a flip that wrote a cell non-uniformly across its four tiles is VISIBLE
here instead of being averaged away by a cell-level accessor."* This is that
ruling on the agent road.

### The cell extent, derived

`SECTION_CELLS_WIDE = SECTION_TILES_WIDE / 2` (= 128 today), same for HIGH — the
same numbers `validatePaintCollisionRect` is handed as `cellsW`/`cellsH`, and the
read reuses **that same validator** so read and write cannot drift on what a legal
rectangle is. The dispatch's 127/128 figures were re-derived, not copied. Two node
rows drive both sides rather than asserting the literal:

- *"is exactly the cell space validatePaintCollisionRect bounds a paint to"* —
  drives the real validator at the boundary.
- *"addresses every tile index a section plane holds, and no more"* —
  `max(cellTileIndices(127,127)) === 256*256 - 1`.

### Bits 15:14

`unpackCollisionCell` reads 13:0 and **drops** 15:14. So the unpacked view is
lossy, and a read that returned only it would teach its consumers those bits do
not exist. Every cell therefore carries the **raw stored `word`**, never re-packed
from the unpacked view, and the reply reports `cellsWithUnownedBits` through
`unownedCollisionBits`, whose mask is **derived from `packCollisionCell`**. No
meaning is encoded for them anywhere in this parcel.

The per-cell fields come from `unpackCollisionCell` — the encoder's own inverse —
not from bit literals typed in the reader. A first draft of `readCollisionCell`
had `word & 0x400` in it; that was the copied pin and it was removed before the
first commit.

---

## 4. Red-first evidence

### In the node suite

| plant | rows that went red | quoted failure |
|---|---|---|
| **A** — `readCollisionCell` samples the top-left, as the overlay does | 5 | `AssertionError: expected 12291 to be null` · `sub-tile 0 differing must be caught: expected undefined to be true` · `expected +0 to be 1` |
| **B** — `word` re-packed from the unpacked view | 2 | `AssertionError: expected 10247 to be 59399` (`0x2807` vs `0xE807`) |
| **C** — `paintCollisionCellEntries` writes the whole word (TRANSFER, not DECIDER) | 3 | `expected +0 to be 49152` · `expected 49152 to be +0` |
| **D** — `validateCollisionWrite` accepts both forms | 1 | `refuses both forms at once, naming both` |

All four restored; suite re-run green after each.

### Over the wire

Plants A and B were **rebuilt into `dist/` and re-run through the harness**, so
the discrimination is proven on the road the feature actually ships on:

| build | result |
|---|---|
| plant A (sampling reader) | **25/32** — `[r2] [r2b] [r2c] [r2d] [r2e] [r2f] [r2g]` red |
| plant B (unowned strip) | **30/32** — `[r3] [r3b]` red, `read 0x3805, expected 0xf805` |
| restored | **32/32**, three consecutive runs |

### ⚠ A false pass I found by reading the output, not by planting

`[a1b]`'s first draft asserted "some glyph is not air" after stripping row labels
with `.slice(1)` + `replace(/^\s*\d+ /)`. That leaves the **ones ruler** intact —
there is no space after its digits — so the ruler's own digits satisfied it. The
row printed **PASS over a window that was entirely air**.

Planting a violation would never have caught this. The property really was false,
and the row really was green: **the guard was aimed at the wrong observable**, and
that is a different question from whether it fires. It was found by looking at the
printed grid and noticing it was empty.

Fixed as two rows aimed at two observables — grid *shape* taken from the last `h`
lines by **position** (never by pattern-matching content), and *content* counted
off the JSON `words` array rather than off the picture — plus a third row `[a1c]`
cross-checking that the picture and the JSON agree on which cells are air. And the
window is now **found** by scanning the whole section for the densest non-air
24×12 block, because section 0's top-left corner is genuinely empty, which is why
the bad matcher went unnoticed in the first place.

---

## 5. Discriminating vs non-discriminating

Named in the harness's own printed output as well as here.

**Discriminating against a plausible wrong implementation** (measured, not
claimed — see the plant table above): `[r2]` `[r2b]` `[r2c]` `[r2d]` `[r2e]`
`[r2f]` `[r2g]` (sampling), `[r3]` `[r3b]` (unowned strip).

**Discriminating against a wrong new handler, but not measured against a plant:**
`[r1]` `[r1b]` `[r4]` `[r5]` `[r5c]` `[r7]` `[r8]` `[r9]` `[r9b]`.

**NON-DISCRIMINATING, printed as such in the run log:**

- `[r5b]` — "passing neither is refused". On master, omitting `word` was refused
  by **zod**, because it was required. This row pins that making `word` optional
  did not open a hole; its discriminator against a wrong new handler is `[r5]`.
- `[r6]` — the fill form still fills. Pre-existing behaviour, deliberately
  unchanged. A regression guard on shared ground, not evidence of anything new.

**Not a row at all, on purpose:** "nothing was saved to disk" is a property of the
harness's own source (no Ctrl+S, no save call, no autosave per
`shell/close-guard.ts`), so it is a printed NOTE. A check that can never fail is
not a check.

**Guards that report UNMEASURABLE rather than green:** `[r7]` if the real act's
shape table holds no shape the reader draws as `/` (it holds one — shape 28);
`[a1]` if the whole section is air; every `[r*]` row if the discovery file names a
pid that is not a descendant of the process the harness spawned.

---

## 6. Verification

| gate | result |
|---|---|
| `npx tsc --noEmit` | clean (note: `test/` is outside tsconfig's `include`, so this does **not** cover the two new test files) |
| `npm run test` | **407 files passed, 2 skipped (409) · 5504 tests passed, 7 skipped (5511), 0 failed** |
| new node rows | 36 (21 in `collision-region-read.test.ts`, 15 in `paint-collision-cells.test.ts`) |
| `npm run harness:collision-read` | **32/32**, 4.3–4.5 s wall clock, three consecutive clean runs |
| build the numbers came from | `VITE_AURORA_DEBUG=1 npx electron-vite build` off `mcp-collision-read`, rebuilt before every run including both plant runs |

No mouse coordinates are sent by this harness — every row goes over HTTP or
through `__dbg` — so the dpr trap does not apply to it. The one geometric claim it
makes (`[r8b]`) is arithmetic over parsed constants.

---

## 7. What is open

- **`get_layout_region` was not built.** The dispatch made it conditional on
  `get_nametable_region` not already returning chunk ids, and it does not — it
  returns unpacked *tile* entries at 8px units. But a chunk-id read is a different
  question from a collision read (Aurora's aeon sections have no chunk-id layer at
  all in the section model; chunks are a *library* that stamps into the
  nametable), and building it here would have been a second parcel wearing this
  one's branch. **TAGGED for the hub to route.**
- **Plane B is exercised only through the shared code path.** Every harness row
  uses plane `'a'`. The plane selector is a one-line ternary shared with
  `paint_collision`, and the node rows are plane-agnostic, but no wire row proves
  `plane: 'b'` end to end.
- **`angle` is `null` for the shapes I sampled** (`[r3c]`: shape 5, `known: true`,
  `angle: null`) because those profiles carry `hasAngle: false`. That is correct
  and documented, but it means no row proves a *non-null* angle reaches an agent.
- **Solidity is not in the ascii** beyond the `,` (stops-nothing) case, and a
  sloped ceiling is not distinguished from a flat one. Both are stated in the
  legend. If the loop lane wants solidity in the picture, it is a second glyph
  plane, not a change to this one.

## 8. Coordination

Edits to `src/main/editor-methods.ts` are two additive hunks — the `paint_collision`
params/description block, and one new `get_collision_region` entry immediately
after it. Nothing was reformatted or reordered, and no shared collision code was
refactored out from under `lp2-loop-paint`. `paint_collision`'s existing **fill
behaviour** is byte-for-byte unchanged; only an optional param and a reply field
were added.

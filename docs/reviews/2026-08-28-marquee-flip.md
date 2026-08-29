# Mirrored tiles are free — so give the author a way to flip

**Date:** 2026-08-28 · **Branch:** `feat/marquee-flip` · **Repo:** aurora

The owner established, in his own words, that a mirrored tile costs nothing against
the unique-tile budget — the VDP carries H and V bits in every nametable word, so a
mirrored tile is the same tile referenced twice. Then he asked the obvious next
question:

> *"if I have something selected with marquee, because flip is free, how do I
> actually flip it?"*

Told nothing was built:

> *"Yes I'd like the marquee flip built please"*

Commits: `61cafa6` (the feature), `cb99f52` (the instrument), plus this packet.
Rebased twice onto `origin/master` during the session — once over the marquee snap
modifier (`4f36936`) and once over collision-word preservation (`370168c`).

---

## 0. THE PICTURE

`scratchpad/shots-marquee-flip/4-mirror-closeup.png` — a jungle canopy slope, copied
once, pasted twice (once flipped) into blank ground, 8× nearest-neighbour off the map
canvas in the same session that measured it:

```
   ╱‾‾‾‾╲          the same four blocks of art, twice,
  ╱      ╲         the second one mirrored — one copy in
 ╱        ╲        the tileset, two directions on screen
```

`5-source-closeup.png` is the unflipped source beside it: a slope that descends to the
right and nothing else. Every pixel of the peak's left half is the same tile the right
half draws, with bit 11 set.

`1-flipped-in-place.png` and `3-art-only-flip.png` are full-app frames of the other two
gestures.

---

## 1. BOTH SHAPES, BECAUSE THEY ARE ONE TRANSFORM AT TWO MOMENTS

Two readings of his question were available and the parcel was told to pick. It built
both, because separating them would have meant writing the transform twice:

| moment | gesture | what it writes |
|---|---|---|
| **before it lands** | `X`/`Y` in paste mode | the pending **clipboard**; the ghost updates and the paste commits mirrored |
| **in place** | `X`/`Y` with a marquee standing | the **map content** inside the rectangle, one `BatchCommand` = one undo entry |

The first is what stamping tools do and it is the one that actually spends "flips are
free" — copy a slope once, stamp it facing both ways. The second is the literal reading:
he had something selected.

`src/core/editing/region-flip.ts` is the only place the transform exists. The in-place
path is literally three calls:

```ts
const flipped = flipClipboard(copyFromSection(section, col, row, w, h), axis);
return buildRegionWriteCommand({ source: flipped, /* … */ writeCollision: !flipped.artOnly });
```

`copyFromSection` is the same capture Ctrl+C performs and `buildRegionWriteCommand` is
the same writer paste and chunk-stamp use, so the in-place path cannot drift from the
clipboard path and neither can invent an alignment rule of its own.

---

## 2. THE TRANSFORM IS TWO OPERATIONS, AND DOING ONE IS THE CLASSIC BUG

Mirroring a region horizontally means **both**:

1. **REVERSE THE ORDER** of the words along that axis, and
2. **TOGGLE EACH WORD'S OWN FLIP BIT** on that axis.

Do only (1) and every tile is in the right *place* drawn the wrong way round. Do only
(2) and every tile is mirrored *where it stands*, so the picture scrambles.

**Neither half looks wrong on symmetric art**, which is most of a tiled background. So
both are implemented explicitly, as `plantReverseOnly` / `plantToggleOnly` in the node
test file and as `reverseOnly` / `toggleOnly` in the harness, and both were planted
into the implementation and measured:

| plant | node rows red | CDP rows red |
|---|---|---|
| reverse-only (`out[i] = src[mirror]`, no toggle) | **9 of 27** | **8 of 40** (32/40) |
| toggle-only (`sr = r; sc = c`) | **7 of 27** | **8 of 40** (32/40) |
| crossed layouts (collision XORed with the *nametable's* masks) | **2 of 27** | — |
| air not special (blind XOR on shape-0 cells) | **1 of 27** | — |
| unpack/repack instead of XOR | **2 of 27** | — |
| the key made dead, panel still advertising it | — | **15 of 40** (25/40) |

Quoted failing assertions:

```
2a: expected 36868 to be 38916                        (reverse-only)
2c: expected [ Array(8) ] to not deeply equal [ Array(8) ]
2d: expected [ 2049, 2, 18435, 38916, 6149, …(3) ] to not deeply equal […]   (toggle-only)
2e: expected { shape: 34, xFlip: false, …(2) } to deeply equal { shape: 34, xFlip: true, …(2) }
1d: expected 'all' to be 'sides-bottom'               (crossed layouts)
1e: expected 1024 to be +0                            (air not special)
1d: expected +0 to be 49152                           (unpack/repack)
1f: expected [ +0, +0 ] to deeply equal [ +0, 49152 ] (unpack/repack)
```

Every fixture is deliberately asymmetric in **tile index, palette, priority AND both
flip bits**, so a transform that gets any field wrong shows up rather than cancelling.

### ⚠ ROUND-TRIP IDENTITY IS NECESSARY AND NOT SUFFICIENT

`flip(flip(x)) === x` catches reverse-only and toggle-only at once, cheaply. It also
passes **if flip is a no-op** — which is not hypothetical: the dead-key plant left
node row 3a and CDP row `[4j]` GREEN while fifteen other CDP rows went red. So the
identity row never stands alone. Node 3b and CDP `[4k]` assert the **single** flip
changed the plane, on the same fixture, in the same session.

---

## 3. TWO WORD LAYOUTS, AND CROSSING THEM PRODUCES PLAUSIBLE OUTPUT

| field | nametable word | collision cell word |
|---|---|---|
| index | tileIndex 10:0 | shape 9:0 |
| **h / x flip** | **bit 11** | **bit 10** |
| **v / y flip** | **bit 12** | **bit 11** |
| — | palette 14:13 | solidity 13:12 |
| — | priority 15 | unowned 15:14 |

The two pairs are one bit apart and **overlap in exactly one position**: the
nametable's hFlip mask and the collision word's yFlip mask are the same sixteen-bit
value. A crossed implementation would flip art against palette bits and collision
against solidity bits — output that still renders, still saves, and is wrong.

**So no bit position is typed anywhere in this parcel.** Three independent derivations:

- `region-flip.ts` derives its masks by asking each **encoder** to encode exactly one
  field: `packNametableWord(0, 0, false, false, true)` *is* the hFlip mask.
- `region-flip.test.ts` row 1 pins those against the two **decoders**
  (`unpackNametableWord`, `unpackCollisionCell`), so a mask cannot be green against the
  function that produced it, and row 1c pins the **relation**
  (`ntH === collX * 2`, `ntH === collY` — the trap, named) rather than any literal.
- `marquee-flip-harness.mjs` **parses the masks out of the two codecs' source text**
  and prints the derivation in row `[0b]`. Its expectations therefore never come from
  the module under test.

Grounded at aeon **`b76576ea`**, `tools/collision_pipeline.py:50-53`, read through
`git -C ../aeon show <rev>:<path>` — never a peer working tree:

```python
BLOCK_ID_MASK = 0x03FF      # bits 9:0 of a chunk entry word
CHUNK_XFLIP_BIT = 0x0400    # bit 10
CHUNK_YFLIP_BIT = 0x0800    # bit 11
PATH_A_SOL_SHIFT = 12       # bits 13:12 (bit12=top, bit13=lrb)
```

---

## 4. COLLISION: THE UNOWNED-BITS RULE, OBEYED RATHER THAN RESTATED

`src/core/editing/collision-word.ts` landed on master during this session (`5148019`)
and declares the rule: **a collision writer authors the fields it OWNS and the cell
keeps the rest**, with `COLLISION_CELL_OWNED_MASK` derived from `packCollisionCell`
itself.

A flip is such a writer, and it obeys the rule **by construction** rather than by a
merge step: it XORs *one owned bit*, so no unowned bit is reachable. Rows 1d and 1f
assert that against **that module's own mask**, not against `0xC000` typed here — and
they author a destination with those bits set on purpose, because every cell in every
shipped act holds zero there and a row that does not author them is vacuous by
construction (their packet's own finding, applied).

Round-tripping through the codec is the way to break it, and was planted to prove the
rows discriminate: `packCollisionCell` writes four fields and emits zeros everywhere
else, so unpack/repack silently answers for bits it was never asked about.

**What 15:14 are, corrected from their packet.** They are *not* spare. At `b76576ea`
`bake_cell`'s legacy single-word encoding makes them path-B solidity
(`PATH_B_SOL_SHIFT = 14`, a live, fully-defined field); `bake_plane_cell`, which is the
encoding Aurora's data actually feeds, reads them not at all. This parcel encodes no
meaning for them either. It preserves them.

### AIR IS AIR — the one conditional in the transform

`collision-cell-word.ts` declares `AIR_CELL = 0` and `selectedCollisionWord` enforces
*"Air (shape 0) is always the bare AIR_CELL word, never solidity/flip bits."* A blind
XOR would turn every air cell in a flipped region into `0x400` — which still *reads* as
air (shape 0) but is a different word, would dirty every air cell in the undo entry, and
would break any `=== AIR_CELL` comparison downstream. So a shape-0 cell **moves but
keeps its word**.

The art plane has no such rule and must not acquire one: tile 0 is an ordinary tile
index, not a sentinel. Node row 1e pins both halves of that asymmetry.

---

## 5. GRANULARITY IS NOT TOUCHED, IN EITHER DIRECTION

The rule that landed earlier today (`2026-08-28-marquee-preview-tiles.md`) stands
unchanged: **a selection carries collision iff its rectangle is block-aligned**, and an
art-only clipboard carries **length-0** planes.

A flip therefore:

- **art-only (odd) selection** → flips art only. That is **correct, not a shortfall**:
  collision is stored per 16px cell, the rectangle owns none, and flipping it would be
  inventing data. CDP `[6d]` is the desync row and `[6e]` is its anti-vacuous companion
  (the art really moved, so "collision untouched" is not "nothing happened").
- **block-aligned selection** → flips both, in one command, cells still 2×2-uniform.
- **never upgrades or downgrades what a selection carries**: `artOnly` is copied
  through, never recomputed, and a plane whose length does not match the footprint's
  cell count is copied verbatim rather than reinterpreted (node 4b, CDP `[5c]`).

**The odd-run centre column** maps to itself under `w - 1 - c` and **still has its own
flip bit toggled**. That is the half an off-by-one drops silently, and it is invisible
on symmetric art, so it has its own row in both instruments (node 4a, CDP `[6c]`), plus
a 1×1 case where the flip is *purely* the toggle and reverse-only cannot be told from
doing nothing (node 4e).

And the author is **told**, in the same sentence Ctrl+C already uses:

> `Flip 3×1 tiles horizontally — art only. Not block-aligned — collision is stored per
> 16px block, so this selection is ART ONLY.`

---

## 6. THE UI — `X` AND `Y`, AND WHAT THEY WERE CHOSEN AGAINST

`X` mirrors left↔right, `Y` top↕bottom.

**What was ruled out, and none of it was free:**

- **`Alt` and `Shift`** are spent on the paste click — `e.altKey ? 'art' : e.shiftKey ?
  'collision'`. A modifier meaning "art only" on the mouse and "mirror" on the keyboard
  *in the same mode* is one mode with two grammars.
- **`Ctrl`** is the marquee's snap-grid modifier (landed on master this session,
  `67ce169`). `MapViewport`'s keydown bails on ctrl/meta/alt before the flip branch, so
  there is no path by which the two can meet.
- **`H` / `V`**, the other mnemonic pair: `v` is the **View tool's letter** in
  `TOOL_KEYS`, across the whole vocabulary. Half the pair was never available.
- **A button pair in the paste panel, as the only surface.** Flipping is done
  mid-gesture with the cursor over the map and the ghost under it; a control 240px away
  breaks that. The panel gets the *sentence* instead.

**Why `X`/`Y` is right and not merely free.** It is Tiled's binding for the same gesture
on a tile brush — and, decisively, **it is this engine's own vocabulary**:
`collision-cell-word.ts` names bit 10 `xFlip` and documents it as *"mirror horizontally
→ the other slope direction"*, and classic's block and chunk composers already ship
controls labelled `X flip` / `Y flip`. Row 76's tile-attribute chips copied that
vocabulary for exactly this reason. Naming one thing two ways across one app is the
defect that rule exists to prevent.

`map-flip.test.ts` asserts both letters are free **across the whole tool vocabulary**
rather than by eye, and includes `toolForKey('v') === 'view'` as the anti-vacuous row
that proves the check can fail.

**"X" alone is read both ways by different people**, so both surfaces spell the
direction:

> `Drag to select (hold Ctrl to snap the other way) · Ctrl+C copy · Ctrl+V paste ·`
> `X flips the selection left↔right, Y top↕bottom`

> `Click to paste · hold Alt for art only, Shift for collision only ·`
> `X flips it left↔right, Y top↕bottom · Esc to stop`

plus `TOOL_HINTS.marquee`. An unlisted key is an undiscoverable feature.

### THE ASYMMETRY WITH Ctrl+C, ON PURPOSE

Copy works from **any** tool; flip-in-place works only while the **marquee tool** is
armed. That is about consequence, not consistency: a copy is non-destructive, so a stale
marquee costs nothing, while a flip **rewrites the map**. `s` (save-as-chunk) already
draws the line in the same place. Paste-mode flip is *not* gated on the tool, because
paste is a mode the author explicitly entered and the ghost under the cursor is what he
is looking at. `resolveFlip` states all of that as one pure function, mirroring
`resolveEscape`, so the node suite can pin an order the React effect cannot reach.

---

## 7. THE REPAINT TRAPS, BOTH OF THEM

**In place.** One `BatchCommand`, so one undo entry — and the invalidation listener walks
batches since this morning's fix, so the canvas repaints with the model. CDP `[4f]`
asserts the screen changed and only inside the selection; `[4i]` asserts the **undo**
repaints too, which is the exact shape of the defect the owner reported (*"control + z
or undo doesn't work with pasting from marquee"*): the model reverted and the canvas
kept the picture, and a model-only row was green for that bug's entire life.

**In paste mode.** `mapClipboard` is **not** a redraw dependency and the ghost lives on
the second, unnamed overlay canvas — so flipping the clipboard calls
`drawCollisionPreview()` explicitly. `flipClipboard` also returns a **new object**,
which is what invalidates the ghost's raster cache (keyed on clipboard identity). CDP
`[5d]` asserts the overlay changed under a **stationary** cursor and `[5e]` asserts the
map underneath did not.

A symmetric region yields `null` from `flipSectionRegion` and the author gets a sentence
rather than an empty undo step.

---

## 8. PROOF

### Node — 5,421 passed / 0 failed / 7 skipped

Baseline on the merged tree was 5,383/0/7; this parcel adds **38 rows** across
`src/core/editing/__tests__/region-flip.test.ts` (28) and
`src/renderer/components/__tests__/map-flip.test.ts` (10).

Five planted violations, each restored, each quoted in §2.

### CDP — `npm run harness:marquee-flip`, **40/40 on three consecutive runs**

dpr 1, screen 1680×1050, map canvas 876×721, view parked at (0,0,1) so **one canvas
pixel is one world pixel** — which is what licenses the pixel rows. Every mouse
coordinate goes through `aimX`/`aimY` (integers) and every expectation is derived from
*that* integer through the app's own transform; dpr, rect and aim are printed.

Three consecutive full runs were taken on the merged tree after both rebases, each read
whole from its own run.

**THE MONEY ROWS.** The clipboard is pasted twice into blank ground — once flipped, once
as copied — so the two land **side by side**, and the combined 8×4-tile window must be
its own left-right mirror:

- `[5h]` on the **model**, word for word through the parsed masks: *0 of 32 words
  disagree*.
- `[5j]` on the **canvas**, pixel for pixel, exact RGBA, no tolerance: *same=2048 diff=0
  of 2048 px, 10 distinct colours*.
- `[5k]` is the **control**: the source region **alone** is not its own mirror
  (*544 of 1024 px differ*), so `[5j]` is measuring the flip and not a symmetric
  fixture.

`[5j]` is red under **all three** running-app plants.

### ⚠ ALTERNATIVE GREEN PATHS, ASKED AND ANSWERED

- **"The panel advertises a key that does nothing."** Measured, not reasoned: with
  `flipAxisForKey` made to return `null`, rows `[3a]/[3b]/[3c]` — which read the hint out
  of the live DOM — stay **GREEN** while 15 rows go red. They are the *panel's* rows and
  are labelled as such; the behaviour rows are 4/5/6.
- **"Flip is a no-op."** `[4j]` and node 3a (flip twice = identity) stay green under
  every plant including the dead key. `[4k]` / node 3b exist for exactly this and are
  named as their pair.
- **"The art is symmetric anyway."** `[5k]` above, plus the region scan itself, which
  **refuses** a candidate source whose FG is already its own left-right mirror
  (`asym > 0`) and reports the count.
- **"The collision plane isn't there, so of course it didn't desync."** `[4d]` asserts
  the region *has* an authored plane and that it is 2×2-uniform **before** the flip, and
  says **LOUDLY** if `collRect` returns null rather than passing quietly.
- **"The masks agree because they came from the same file."** Three derivations, §3.

### ⚠ AN INSTRUMENT DEFECT, FOUND AND KEPT ON THE RECORD

The first run of `[5j]` landed the pair at column 0 and reported **exactly 64
mismatching pixels** — which turned out to be columns `x=0` and `x=63` of a 64×32
window, i.e. the **section outline** the renderer draws down the section's left edge,
which has no partner on the interior side. The art mirrored perfectly; the instrument
was reading a border into the measurement.

Diagnosed by making the row print its mismatch **bounding box and sample pixels** (kept,
permanently), then fixed in the instrument by requiring an **interior** blank strip —
not by weakening the assertion, which is still `diff === 0`.

This is the class this repo keeps paying for: a measurement bug that presents exactly
like a feature bug. Recorded here so the next reader of a 64-pixel discrepancy checks
the window's edges first.

### WHAT IT DOES NOT DO

- **Writes nothing to disk.** Ctrl+S is never pressed; every edit is undone; `[7a]`
  asserts the undo stack drained and the page threw nothing.
- **No emulator.** Nothing in this parcel touches oracle or any emulator MCP tool.
- **Not seen on the owner's display.** The screenshots in §0 are for that.

---

## 9. WHAT IS OPEN

- **No flip for the classic engine's marquee.** Classic's layout facet declares
  `['view', 'stamp-chunk', 'select']` — it has no marquee tool at all, so there is
  nothing to bind to. `TOOL_HINTS.marquee` is consequently never shown there, which is
  why naming an aeon key in it is honest.
- **No flip for a chunk in the library, or for the stamp ghost.** `stamp-chunk` arms a
  `ChunkDef`, not a `MapClipboard`; `flipClipboard` would serve it unchanged
  (`copyChunkToClipboard` already adapts the shape), but the stamp path has its own
  ghost and its own hint line and was left alone rather than half-wired.
- **No 90° rotation.** The VDP has no rotate bit — a rotated tile is a *different* tile
  and costs budget. It is a genuinely different feature from this one and must not be
  bound beside it as though it were free.
- **No toolbar button.** The panel names the keys; a click target for the same two
  gestures is cheap and was not built.

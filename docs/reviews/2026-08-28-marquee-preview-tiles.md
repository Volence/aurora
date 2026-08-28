# The marquee: tile granularity, the paste preview, and the undo that never repainted

**Date:** 2026-08-28 · **Branch:** `feat/marquee-preview-tiles` · **Repo:** aurora

Three owner reports from one play session in the aeon Layout facet:

> 2. "The marquee tool, when I select something it doesn't preview what's selected."
>    …later, with a screenshot of the **paste ghost**: *"I select this, then press
>    control c, when I press control v to paste it later it should have that preview
>    in this empty stamp shape right?"*
> 3. "Same tool, I think it should allow me to select by tiles right? Right now it's
>    only block size that I can copy paste."
> 4. "control + z or undo doesn't work with pasting from marquee."

Commits: `0608bf0` (items 2 + 3), `759b481` (item 4).

---

## 1. THE MEASUREMENT ITEM 3 TURNS ON — art is per-tile, collision is per-block

This is the part a future session will need, so it is stated first and in full.

A section stores **art per 8px TILE**: one nametable word each, strided by
`SECTION_TILES_WIDE` (`copyFromSection`, `src/core/editing/map-clipboard.ts`).

A section stores **collision per 16px CELL**. `cellTileIndices`
(`src/core/collision/collision-cell.ts`) is four lines and settles it:

```ts
export function cellTileIndices(cellCol: number, cellRow: number, width: number): number[] {
  const tc = cellCol * 2, tr = cellRow * 2;
  return [tr * width + tc, tr * width + tc + 1, (tr + 1) * width + tc, (tr + 1) * width + tc + 1];
}
```

Four tile indices, one collision word. `OverlayRenderer` says the same from the
draw side ("both tiles of a cell share the word"), and `buildRegionWriteCommand`
writes all four indices from one source word.

**The consequence.** A tile rectangle that does not begin *and* end on even tile
coordinates owns no complete cell at that edge — every cell it touches there is
shared with tiles outside the rectangle. So:

- tile-granular selection is **structurally fine for art**;
- tile-granular selection is **structurally impossible for collision**.

That is a property of the engine's data model. It is a constraint, not a defect,
and no amount of editor work removes it.

`chunkCellCount` compounds it downstream: `(w>>1)*(h>>1)`, which **floors**. A
5×3-tile chunk carries two collision cells describing its top-left 4×2 tiles and
nothing for the rest, while its art claims the full 5×3.

## 2. THE RULE CHOSEN

> **A selection carries collision if and only if its RECTANGLE is block-aligned
> (`isBlockAligned`: origin and size both even in both axes). Every surface that
> could imply otherwise refuses out loud rather than degrading.**

Keyed on the **geometry, never on the armed granularity**. A Tile-mode drag that
lands on even bounds is block-aligned and carries collision like any other; a
Block-mode drag is aligned by construction. Nothing downstream has to know which
control was set, and flipping the control never retro-changes a standing
selection.

Where the rule is *said*, at the moment it matters:

| Surface | What it does |
|---|---|
| the marquee itself | strokes **peach** (`MAP_MARQUEE_ART_ONLY`) instead of teal when off-grid |
| copy toast | `Copied 5×3 tiles — art only. Not block-aligned — collision is stored per 16px block…` |
| marquee panel | a warning line, and the `Collision` layer button **disabled** with the reason in its title |
| paste ghost | same peach outline; collision shading skipped entirely |
| paste with Shift (collision-only) | refused with a toast, not a click that silently does nothing |
| save-as-chunk (`s` and the button) | **refused**, with the fix named ("select on even tile bounds, or switch the marquee to Block") |

Structurally, an art-only clipboard carries **length-0** collision planes, not
zero-filled ones. A zero-filled plane of the right length is indistinguishable
from "this region is all air", and the region writer treats air as
authoritative — so pasting it would have **erased** the destination's collision
under art the author only meant to move. `buildRegionWriteCommand` additionally
refuses a collision write by plane **length** and by **odd base**, as a backstop
under `effectivePasteLayers`/`pasteBaseStep`, so a future call site that forgets
both is a no-op instead of data loss.

An art-only clipboard pastes on the **tile** grid (`pasteBaseStep` → 1). A
selection you can make but cannot place at the precision you made it is worse
than one you cannot make.

### What was ruled out, and why

- **(a) Silently drop collision in tile mode.** Forbidden by the dispatch and
  dishonest. Worse than it sounds: with length-0 planes and no rule, the per-cell
  read yields `undefined → 0` and the paste writes air over the whole footprint.
- **(b) Silently re-snap the selection back to blocks** while calling it
  tile-granular. Forbidden, and now caught red-first by harness rows 3f/3g and
  node rows 2a–2c.
- **(c) Art tile-exact, collision taken from the *enclosing* block rect.** The two
  halves would then have different footprints, and a paste would write collision
  **outside** the visible marquee. Actively destructive.
- **(d) Sub-block collision — store per-tile and blend on paste.** There is no
  representation for half a cell. Four tiles share one word; a tile-granular
  collision paste would have to pick a winner among four, i.e. invent data.
  Ruled out on the measurement in §1, not on taste.
- **(e) Make tile granularity the only mode and always art-only.** Destroys
  collision copy/paste, a shipped capability.

### Consistency with what already shipped

This facet **already** answers "tile or block", with two tools:
`paint-tile` writes one 8×8 tile, `paint-block` writes a 2×2 tile run
(`MapViewport` tool branches), and **neither touches collision** — collision is a
separate facet with a separate tool. The `Snap: Block | Tile` control restates
that vocabulary rather than inventing a third one, and "art tools do not write
collision" was the app's existing answer, not a new concession.

## 3. ITEM 2 — the paste ghost

The primary target, per the owner's own screenshot: not the committed marquee
(which sits over the art it selected, under a 10%-alpha wash you can see
through), but the **paste ghost**, which hovers over *different* art and showed
nothing of what was copied.

It was footprint-only "by an earlier decision", reasoned in the code as:

> a paste's contents are what you just copied and still remember, whereas a
> stamp's contents are one of seventy library thumbnails you picked a moment ago

**That premise is an empirical claim about the author, and the author has
contradicted it from a real session.** He did not remember; he asked to see it. A
premise about a person, refuted by that person, does not survive. Three further
points against it:

1. Its neighbour in the same draw block — the **stamp ghost** — already draws real
   art translucently at native size, and argues for doing so because "which
   chunk" matters as much as "where". A clipboard region is *more* arbitrary than
   one of seventy library chunks, so that argument is **stronger** for paste.
2. A clipboard now outlives the rectangle it came from (the region can be
   repainted; the marquee can be cleared), so there may be nothing left on screen
   to remember *from*.
3. An art-only clipboard now pastes on the **tile** grid, where being one tile out
   is both possible and invisible against a plain rectangle.

Secondary, and kept because it was nearly free: the marquee panel draws a live
canvas of the selection's own art, at its native footprint.

## 4. THE CRASH CLASS THIS PARCEL SITS IN — `src/renderer/canvas/region-preview.ts`

The stamp ghost once rasterised through `rasterizeAeonChunk`, which returns a
**fixed 128×128** buffer (the thumbnail grid's contract), and paired it with an
`ImageData` sized to the chunk's own footprint. `ImageData.data` is a
`Uint8ClampedArray` and `.set` throws `RangeError` when the source is longer — so
**every chunk under 16×16 tiles threw**, from mousemove (eating the ghost) and
again inside the render effect after the stamp click, where it **unmounted the
React root**. That was the owner's earlier crash, and marquee-saved chunks were
the input class that produced it.

The fix had been restored in exactly **one** call site. This parcel adds two
more, over regions that go **smaller** (a single 8×8 tile) and **odder** (any
width × any height) than anything the stamp path ever saw. So the derivation was
moved into one module, `regionPreviewCanvas`, which reads `widthTiles`/
`heightTiles` off the source and uses them for the raster dimensions *and* the
`ImageData` dimensions — there is no argument a caller can pass that would let
them disagree. **All three ghosts now go through it**, the stamp ghost included.

Proven both ways:

- **node**, `region-preview.test.ts` row 2 runs the real failing operation
  (`dest.set(rgba)` into a natively-sized buffer) at 1×1, 1×5, 5×1, 3×3, 5×3,
  16×16, 33×17, 64×2. Row 3 runs the **identical assertion** against the fixed-size
  rasteriser and demands it throw `RangeError` — so row 2 cannot be an assertion
  incapable of failing.
- **runtime**, planting the fixed buffer back and running the harness: row 5a
  reported `canvases: []`. The React root was gone, live, exactly as recorded.

## 5. ITEM 4 — undo did not repaint (and the workaround that hid it)

Reproduced before it was fixed. The undo always *did* revert the model. What
never happened was the repaint: MapViewport's invalidation listener was a bare
`switch (cmd.type)` with **no `'batch'` case**, so a batch fell to `default:` and
nothing was marked dirty. `buildRegionWriteCommand` returns a batch.

Its sibling `bumpStoreVersions` in `editorStore` *has* recursed into batches from
the start — which is why chunk thumbnails refreshed after an undo and the map did
not.

**Blast radius, measured, wider than reported:**

| Path | Status |
|---|---|
| paste (`buildPasteCommand`) | reported by the owner; fixed; runtime-verified |
| chunk stamp (`buildStampCommand`, same builder) | same defect, unreported; fixed; **not** runtime-verified |
| art facet (`ComposerCanvas` multi-tile edit — a batch of `set-tileset-tiles`) | changed nothing on the map at all, forward edit included; fixed; **static trace only** |
| single-command edits (FG/BG paint, palette, sections) | never affected — they reach the switch as themselves |

**The workaround was the tell.** The paste and stamp click handlers each reached
into the batch by hand for their `set-tiles` child and marked it dirty
themselves. That is precisely what made the forward edit visible while its undo
was not, and the undo path cannot copy it — `BoundEditHistory.undo()` is
argument-free, which is the entire reason `notifyCommandApplied` exists. Both
reaches are **deleted**: keeping them would double-invalidate every paste and
would let the next reader conclude the general path works.

**Coalesced, not merely recursed.** A plain `forEach(handle)` would call
`rebuildTileArt()` once per leaf, and that reloads *every* section — a 60-tile art
stroke would re-prerender the whole act sixty times. Leaves are collected first;
each whole-viewport rebuild runs at most once, in decreasing order of scope
(`reloadAllSections` subsumes the narrower two and calls `reloadBg` itself); and
per-tile dirtying runs last, so marks cannot land on a canvas about to be
replaced.

## 6. HOW IT IS PROVEN

**Node:** 5,204 pass, 1 pre-existing failure
(`test/formats/effects-scene-curve-vsplit.test.ts`, which fails **identically on
an unmodified master clone** — a shipped-fixture drift, not this branch). New:
26 rows in `map-clipboard.test.ts`, 5 in `region-preview.test.ts`, 1 refusal row
in `selection-to-chunk.test.ts`.

**Runtime:** `scratchpad/marquee-harness.mjs`, **34/34 rows, three runs**. Real
CDP mouse and key events on the real canvas; whole-canvas diffs; every
expectation derived from the delivered integer client pixel through the app's own
transform, with no tolerance windows.

### Red-first, with the failing assertion

| Plant | Rows that went red |
|---|---|
| listener non-recursive **+ the manual reach restored** (master exactly) | **6e** — `map diff pre-paste vs after-undo: {"changed":476,…}`. 6a and 6d stayed **green**: the paste was still visible and the model still reverted, so **a model-only row was green for this bug's entire life.** |
| paste ghost footprint-only | **5d** — `distinct colours introduced by the ghost: 2` (the wash + the outline), while 4e reported the selection itself has 8 |
| `snapMarquee` ignores `'tile'` | **3f, 3g, 4a, 4c, 4d, 8b** — and the toast printed `Copied 2×1 blocks`, the exact wrong-unit output |
| fixed 128×128 raster buffer | node rows 1, 2, 4; runtime row 5a → `canvases: []`, the React root gone |

All restored; 34/34 and 5,204 confirmed after.

### Non-discriminating rows, named

- **6f** (redo repaints) passes under the undo plant — after a failed undo the
  screen already matches the post-paste state. It only discriminates while 6e holds.
- **6e** needs **6a** beside it: under a plant where the paste itself never
  repaints, 6e would pass vacuously. The pair is the test; neither half alone is.
- **5b** (ghost geometry) stayed green under the footprint-only plant, as it
  should — it measures *where*, 5d measures *what*. Two properties, two rows.

### Alternative green-paths ruled out

- *"5a/5b could pass because collision writing is broken everywhere."* Ruled out
  by the paired `-control` rows in `map-clipboard.test.ts`, which push the same
  call through an **aligned** clipboard and demand collision children appear.
- *"The `effectivePasteLayers` rule is what stops the erase."* **Not on its own** —
  planting it away left row 5a green, because the `buildRegionWriteCommand`
  length/parity backstop caught it. Two independent enforcement points produce one
  observable, so only 5d discriminates the layer rule. Stated in the test file.
- *"Row 2's crash assertion may be incapable of failing."* Ruled out by row 3,
  which runs it against the known-bad rasteriser and demands `RangeError`.

### Two measurement bugs found in the harness before any result was believed

Both produced **red rows against an app that was right**, and both are recorded in
the harness docblock:

1. **The ghost is not on `#map-canvas`.** MapViewport layers a second, unnamed
   canvas of identical size and position over the map, and every preview is drawn
   on that one. The row was measuring the wrong surface — which no planted
   violation could ever have revealed, because the row never touched its subject.
2. **A canvas-colour scan cannot tell the two planes apart.** The source region
   was chosen for having 41 distinct colours on screen; its **foreground** was
   fifteen words of tile index 0, and all 41 colours belonged to Plane B showing
   through. The scan now counts distinct non-zero FG tile indices and the choice is
   confirmed empirically against the app's own selection preview before any ghost
   row runs.

`scratchpad/marquee-paste-probe.mjs` is the committed measurement that found both.

## 7. THE FOUR PRE-DISPATCH MEASUREMENTS

1. *The marquee draws only its rectangle* — **correct** (line numbers had drifted
   to ~501–518).
2. *`snapMarquee` snaps to 16px blocks; the toast says blocks* — **correct**.
3. *Art per tile, collision per 16px cell; tile-granular selection structurally
   impossible for collision* — **correct, and it is the whole design.**
4. *Other consumers: Ctrl+C, save-as-chunk, paste, the stale-marquee guard* —
   **correct but incomplete.** It missed `copyChunkToClipboard` (an odd-sized
   library chunk has the same problem), the paste-ghost collision shading (which
   would have shaded *every* cell from length-0 planes — `undefined !== 0`), and
   `MarqueePasteOptions`' own save-as-chunk button beside the `s` key.

## 8. OPEN

- **Chunk-stamp undo repaint** is fixed but **not runtime-verified**. TAGGED for
  foreground.
- **Art-facet multi-tile edits repainting the map** — static trace only; the fix
  covers it, nothing has driven it. TAGGED for foreground.
- **`test/formats/effects-scene-curve-vsplit.test.ts`** fails on master too.
  Unrelated to this branch; `setLayerFieldCommand(..., 'vsplit', undefined)`
  returns null against the shipped `ojz_act1_depth.json`, i.e. the fixture no
  longer carries the field the test removes. Not booked here.
- **An odd-sized chunk already in a library** still stamps its short collision
  planes (pre-existing; `buildStampCommand` passes the `ChunkDef` directly). The
  new backstop refuses only a *length mismatch*, and `chunkCellCount` makes such a
  chunk self-consistent-but-short. No shipping profile has one; not fixed here.

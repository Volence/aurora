# Task 12 — paint-through, verified in the running app

**Status: DONE.** All six checks pass in a full run of the running Electron app (GHZ act 1,
real `s1disasm` data) driven over CDP — real pointer drags, real Undo-chip clicks, real
canvas pixel readback. Two of the six checks were also falsified by **temporarily
reintroducing the two named historical bugs (A1, A2) into the actual source, rebuilding, and
watching the app fail exactly as documented**, then reverting and reconfirming green. This is
the only step in the twelve-task plan that observed any of this actually happen; nothing here
is inferred from the node suite.

Harness: `scratchpad/paint-through-harness.mjs`. Modeled on `tile-editor-harness.mjs` and
`composer-fill-harness.mjs` — same launch discipline (detached `xvfb-run` + `electron`, kill
the process group, verify the debug port free before/after), same evidence discipline (pixel
readback off real canvases, undo counted via the header's Undo chip + dispatched `Ctrl+Z`,
negative controls that must themselves report FAIL). Run with `node
scratchpad/paint-through-harness.mjs`; `ONLY=5,6 node ...` restricts to specific checks (used
here to re-run one check cheaply while the source was deliberately broken).

## Setup, once, from the real doc

GHZ act 1: 965 pool tiles, 439 blocks, 82 chunks, 158 reserved (object-art) tiles spanning
`0x3B..0xE4` — this matches `reserved-tiles-real-act.test.ts`'s pinned numbers exactly, which
is itself a good sign the new `__dbg.classic` probe hooks (below) read the same doc the real
pipeline does. Test targets (a shared block used by two chunks, a cell whose divergence must
touch all three tiers, two adjacent cells sharing one block, the six-divergence fixture) were
all found programmatically from the live doc, not hand-picked — see "What I added to
`__dbg`" below.

## The six checks

### 1 — one gesture (a ~6px drag) = one undo entry

**PASS.** Dragged the Pencil tool from (2,2) to (7,7) inside one 16×16 chunk cell on chunk
`$01`'s composed Paint surface (6 intermediate `mousemove` events, batched the way the
existing harnesses do — no per-move CDP round-trip). Undo chip went enabled immediately after
release; drained in exactly **1** `Ctrl+Z` press.

**Falsified by:** three SEPARATE single-pixel gestures (mouse down/up, not one drag), each at
a different point, each independently confirmed by a canvas-pixel hash readback to be a real
color change and not a no-op. Two of the three were genuine changes (the third coincided with
the pixel's existing color and was correctly refused — rule 3, "a gesture that changed nothing
commits nothing" — so it recorded no undo step at all, which is itself correct behavior, not a
harness bug). Draining took **2** presses, not 1 — proof the press-counting actually
distinguishes separate gestures from one continuous drag, rather than just always reporting 1.

### 2 — undo restores all three tiers together

**PASS.** Target: chunk `$01` cell 8, block `$D8`(216), whose TL tile (`$10`/16) is itself
shared by ≥2 blocks — so painting it is guaranteed to force a tile clone AND a block clone AND
a chunk-cell repoint, not just one or two of the three.

Before: `{tiles:965, blocks:439, chunks:82}`, tile 16 hash `2829599009`, block 216's TL cell
→ tile 16, chunk cell 8 → block 216.

After a 4-pixel drag inside that cell: `{tiles:965, blocks:**440**, chunks:82}` (the free-slot
search reused an existing unused pool slot — tile 34 — rather than growing the tile array, so
the tile *count* didn't move even though a new tile's *bytes* did), chunk cell 8 → block
**439**, block 439's TL cell → tile **34**, tile 34's hash differs from tile 16's original
hash, and — the important part — **tile 16's hash is still `2829599009`, byte-identical to
before**. Isolate diverged; it did not mutate the shared original in place.

One `Ctrl+Z`: pool back to `{965, 439, 82}`, chunk cell 8 back to block 216, block 216's TL
cell back to tile 16, tile 16's hash still `2829599009`. All three tiers, one undo.

**Falsified by:** a planted assertion that the chunk cell *still* points at the diverged block
439 after the one undo — correctly reports false (it points at 216).

### 3 — Isolate isolates (compared by rendered pixels, not store state)

**PASS.** Found a block (`$D6`/214) placed in two different chunks: chunk `$01` cell 6 and
chunk `$02` cell 0. Opened chunk `$02` in Paint mode and hashed its **actual composed
PixelViewport canvas** (the bitmap the user would see if they clicked that chunk) — this is a
real `getImageData` readback of what got painted to screen, not a recomputation from the
store. Switched to chunk `$01`, painted a short drag inside cell 6 (which diverged its block
214 → 439, confirmed via `__dbg`), switched back to chunk `$02`, re-hashed its canvas: **the
hash is bit-identical**, `3097990892` both times.

**Falsified by two things.** First, an idle-noise control: hashed the unchanged chunk `$02`
canvas twice in a row with nothing happening in between — reports no difference, so the
hash isn't randomly flaky and a "no change" result later can be trusted. Second, and more
importantly, checks 3 and 4 share one setup: check 4 immediately below performs the *identical*
paint, in Link mode, and the *same* hash comparison reports a real difference — proof the
canvas-hash method can and does detect an actual change when one exists, not just a method
that always reports "unchanged."

### 4 — Link propagates

**PASS.** Same shared-block setup, restored to its pre-check-3 state by draining the isolate
edit first. Clicked the "Link" chip (confirmed active via a theme-independent
background-vs-border-color check on the Chip element — no hardcoded accent color), painted the
same cell on chunk `$01` again, switched to chunk `$02`: canvas hash changed,
`3097990892` → `1631077996`.

**Falsified by:** a planted assertion that chunk `$02` is unchanged — correctly reports false.

### 5 — the A1 regression, in the app

**PASS**, and this is the one that mattered most. Found two chunk cells **within the same
chunk** (`$01`, cells 135 and 136 — adjacent, same row, both flipped) referencing the same
block (`$13`/19). One continuous drag from inside cell 135 across the boundary into cell 136.
After release: cell 135 → block **439**, cell 136 → block **440** — two DIFFERENT new blocks,
neither equal to the original 19. Pixel reads at the two touched points both changed from the
original color `(0,109,0,255)` to the painted color `(109,146,255,255)` — both locations show
real paint, not one blank/dropped.

**Falsified by driving the wrong thing AND by breaking the real code** — this is the check the
plan singled out ("it was fixed and unit-tested, but never seen"), so it got the strongest
treatment:

- *Behavioral*: a planted assertion that both cells diverged to the *same* cloned block
  (`439 === 440`) — correctly reports false.
- *Code, live, in the running app*: temporarily reverted `classic-surface-plan.ts`'s clone
  memo from keying by `chunkCellIndex` back to keying by `blockId` — i.e. reintroduced the
  exact A1 bug the plan describes, byte for byte. Rebuilt (`VITE_AURORA_DEBUG=1 npm run
  build`), re-ran `ONLY=5` against the SAME real doc and same drag. **It failed, exactly as
  predicted**: cell 135 got block 439 (kept its edit), but cell 136 stayed at block **19** —
  its paint was silently dropped — and the pixel read at cell 136's touched point came back
  UNCHANGED, `(0,109,0,255)`, the original background color. That is "the second location's
  paint appears in the first location, the first location's paint is destroyed" from the plan,
  reproduced live. Reverted the file (`git diff` clean afterward — confirmed), rebuilt, re-ran
  `ONLY=5` again: back to PASS (`git diff --stat src/` showed no changes to that file for the
  rest of the session).

### 6 — reserved tiles are spared

**PASS.** Used the *exact* fixture from `reserved-tiles-real-act.test.ts`'s
`sixSharedTileDivergences`, replicated in a new `__dbg` hook against the SAME chunk (file index
0 / engine id `$01`) that test uses, so this is the proven unit-test scenario driven through
real mouse clicks instead of a direct function call. Six separate single-pixel clicks, each on
its own chunk cell, each with color 9 (a value that test's docblock verifies GHZ's real tile
data never legitimately holds there).

Before: `{tiles:965, blocks:439}`. After: `{tiles:965, blocks:**445**}` — six blocks cloned.
Diffing an FNV hash over **every** pool tile (965 of them) before/after found exactly 6 changed
indices: `[34, 48, 57, 58, 82, 86]`. **None** of the six are in the 158-tile reserved set, and
tile `0x3B` specifically — the first tile of the GHZ platform run, the one the real unit test
names as the actual collision point when the guard is absent — has an unchanged hash.
Supplementary visual: screenshotted the area around a real placed GHZ Platform object (`$18`,
level pixel `(4640, 488)`, found via a new `findObject` hook) on the Layout facet before and
after, at a camera position pinned with `__dbg.setView` so the two shots are directly
comparable; the map canvas's own pixel hash is bit-identical, `327017985` both times
(`13-platform-before.png` / `15-platform-after.png`).

**Falsified by driving the wrong thing AND by breaking the real code:**

- *Behavioral*: a planted assertion that reserved tile `0x3B`'s hash changed — correctly
  reports false; and an idle-noise control on the 965-tile hash array (called twice, nothing
  in between) — reports no difference.
- *Code, live, in the running app*: temporarily changed `ChunkTab.tsx`'s
  `commitSurfaceWrites` to pass `reservedTiles: undefined` instead of the real reserved set —
  i.e. reintroduced the A2 bug (Isolate's free-slot search can claim object-art tiles when
  nothing tells it not to). Rebuilt, re-ran `ONLY=6` against the identical six clicks. **It
  failed, exactly as predicted**: the six changed indices became `[34, 48, 57, 58, **59**,
  **60**]` — `59` is `0x3B`, and it is the **5th** element (index 4) of that list, which is
  *precisely* what `reserved-tiles-real-act.test.ts` documents ("the 5th claim (index 4) lands
  on 0x3B") — reproduced live, in the running app, against the same real data, not just in the
  unit test. The map canvas hash also changed (`327017985` → `3220656585`), though the
  specific crop screenshotted didn't show an obvious visual artifact — plausibly the corrupted
  bytes belong to a sprite frame not on screen at that camera position, or another on-screen
  element (an enemy's idle animation) also moved between the two shots. The byte-level proof
  needs no visual corroboration to be conclusive: the exact predicted index, in the exact
  predicted position, is not a coincidence. Reverted the file (confirmed clean via `git
  diff --stat src/`), rebuilt, re-ran `ONLY=6` again: back to PASS.

## What I added to `__dbg`

All additions are read-only queries or pure setup navigation — nothing here bypasses the
composer's real write path (`diffWrites` → `planSurfaceEdit` → `classicPaintSurface` stays the
only way a pixel edit actually commits; the harness only ever drives that path through real
`Input.dispatchMouseEvent` calls on the real canvas).

- **`window.__dbg.classic.*`** (`src/renderer/debug-hooks.ts`) — a new probe surface:
  `poolSizes()`, `chunkCell(chunkId, cellIndex)`, `blockCell(blockId, cellIndex)`,
  `tileHash(tileIndex)` (FNV-1a over one tile's 32 bytes), `allTileHashes()` (same, over the
  whole pool — used for check 6's diff), `reservedTiles()`, `findObject(id)`, and four
  **candidate finders** that answer "where in this real 965-tile/439-block/82-chunk doc do the
  six checks' preconditions actually hold": `findSharedBlock()`, `findJuicyCell()`,
  `findAdjacentSharedBlockCells()`, and `sixDivergenceWrites()` (a direct port of
  `reserved-tiles-real-act.test.ts`'s own fixture function, so check 6 drives the *exact*
  proven scenario through the UI rather than a fresh one). Plus two setup setters,
  `setSelectedChunk(id)` / `setComposerBlock(id)` — navigation, exactly like the existing
  `activate()`.
- **`window.__dbg.setPaintColor(v)`** — sets `artStore.selectedColor` directly. Needed because
  ChunkTab/BlockTab's Paint mode mounts **no swatch row of its own** (only TileTab does); the
  color is a cross-tier singleton normally armed by clicking a swatch on the Tile tier first.
  Discovered this the hard way (see below) rather than assuming it.

I considered NOT adding these and instead having the harness re-derive candidates by scanning
`document.querySelectorAll` and reading pixels blind, but there is no DOM affordance that
exposes "which two chunks share a block" — that information lives only in the doc, and the
plan explicitly sanctions this kind of setup hook (`activate()`, `setView()` already work the
same way).

## Defects found in the harness itself, before I trusted anything

Per the mandate — three found, all caught by making the assertion fail on purpose or by
checking a value I hadn't verified was really flowing where I assumed:

1. **Wrong chunk's cell index.** Check 1's negative control originally used
   `findSharedBlock().cellB`, which indexes **chunk B's** cells — while chunk A was the one
   selected on screen. First run: the "three separate clicks" negative control drained in **0**
   presses (not even 1), which should have been an immediate red flag rather than a pass — 0
   ≠ 1 still satisfies "not equal to 1" but is not evidence of anything. Traced it to painting
   into a cell index that belongs to the wrong chunk. Fixed by reusing chunk A's own cell.
2. **The swatch row doesn't exist on the tier being tested.** A standalone diagnostic
   (`scratchpad/probe-click-paint.mjs`) showed `selectedSwatch()` returning `{count: 0, index:
   -1}` while ChunkTab's Paint mode was mounted — TileTab's 16-swatch strip (`title="index
   N"`) simply isn't in the DOM there. The eyedrop-then-repaint scheme I'd designed for "prove
   each click is a real color change" silently did nothing. Added `__dbg.setPaintColor()`
   instead of routing every color change through a Tile-tier detour.
3. **`clickPill("Map")` matched nothing.** The facet pill is actually labelled "Layout", not
   "Map" (`s1LayoutFacet`, id `'layout'`). The click silently failed (my helper returns `false`
   on no match, which I wasn't checking), so the "before/after platform screenshot" was
   actually re-screenshotting the **Art-facet composer canvas** — its hash differed only
   because the six divergence paints changed IT, which is expected and told me nothing about
   the level view. Fixed by using the real label; re-ran and the map-canvas hash became stable
   as expected once it was actually looking at the map.

None of these were assertions I "trusted and moved on from" — each was caught because a
positive result looked suspiciously convenient (0 undo presses, an empty swatch array, a hash
diff with no plausible cause) and I stopped to check the mechanism rather than the headline
number.

## What did not work / was not covered

- **BlockTab was not separately deep-tested.** All six checks exercise ChunkTab specifically
  (as the plan's own language does — "chunk surface", "chunk cell"). BlockTab mounts the
  identical Paint substrate and funnels through the identical `planSurfaceEdit` →
  `classicPaintSurface` path (confirmed by reading both files), so the mechanism is the same
  code, but I did not independently drive a BlockTab drag/undo/isolate/link sequence under
  CDP. If a BlockTab-specific defect exists (e.g. in how a block surface reports
  `placesAffected` with a null `chunkIndex` — noted as A7 in the plan's audit, already fixed
  per that section) it would not have been caught here.
- **Check 6's visual (screenshot) half is inconclusive on its own.** The byte-level proof
  (exact tile hashes, exact reserved-set membership) is solid; the accompanying screenshot
  comparison is supplementary and, during the deliberately-broken run, did not visibly show
  the corruption at the one camera position I picked. I did not go hunting for a camera
  position where the corrupted tile is definitely on screen — the byte-level evidence made
  that unnecessary, but it means "screenshot proves it" is not itself something I can claim.
- **The "2 of 3" negative control in check 1.** One of the three planted single-pixel clicks
  happened to repaint a pixel with the color it already had, so it correctly committed nothing
  (rule 3) and the drain count was 2, not the 3 I originally expected. This is not a bug — it's
  the no-op guard working — but it means the negative control is weaker evidence than "exactly
  3" would have been; I left it as-is rather than hand-picking pixels to force a 3-for-3
  result, since forcing the fixture to avoid a real code path (the no-op guard) felt like
  cheating the test more than leaving it honest.

## Screenshots

`scratchpad/shots-paint/` (16 PNGs) — before/after pairs for each check: the 6px drag (01/02),
the three-tier divergence and its undo (03-05), chunk B before/after isolate (06-08), chunk B
after link (09/10), the A1 drag (11/12), the six-divergence pass and the GHZ Platform area
before/after (13-15).

## Commit

See the final line of this task's report message for the commit SHA (filled in after
committing). The `__dbg` additions in `src/renderer/debug-hooks.ts` (product code, tracked)
and this report are committed together; the harness `scratchpad/paint-through-harness.mjs` is
tracked alongside the other scratchpad harnesses in the same commit.

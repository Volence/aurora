# Phase 2C — resolve and commit

**Status: designed 2026-08-15, unbuilt.** Supersedes §4.4 of
`2026-08-15-in-app-art-authoring-design.md` (the "origination canvas" spec), whose §0 · Corrections
called for exactly this respec. Where the two disagree, this document wins.

Phases 1, 2A and 2B are merged. This is the step that turns a drawing into pool art.

---

## 1 · What commit is for

Two ways in, one resolver, one command:

```
  canvas document ─┐
                   ├─→  canvas-resolve  ─→  classic-commit-plan  ─→  classicCommitCanvas
  PNG on disk     ─┘     (pure geometry)      (binds to the doc)       (one store command)
```

**The canvas** is where art is *originated* in-app — with clashes, colours-per-line and the
flip-aware tile count live in front of the artist while they draw. It is capped at 16 chunks per
commit (§6), because it is an undo-tracked document.

**The PNG path** is how work made elsewhere gets in, at any size. This is what the field actually
does: SonED2's importer takes a *layout-sized* image and auto-creates chunks, blocks and tiles with
flip-aware dedup; SonLVL imports at every tier for PNG/BMP/JPG/GIF; the documented S1 community
workflow is build-a-sheet-externally, delete the level's art, import
(`research/2026-08-15-how-a-zone-actually-gets-built.md` §5). That research's recommendation 5 names
the missing importer as "the real gap" and says: build it or delete the stub.

The standing product bar is that the canvas should be good enough that artists **do not leave for
Aseprite to make the art in the first place**. The PNG path exists for work that already happened
elsewhere, not as an admission that origination belongs elsewhere.

`src/renderer/components/ChunkSheetImporter.tsx` was a gutted S4-era stub, mounted nowhere, whose
TODO claimed the tile→block→chunk hierarchy "no longer exists" (true for aeon, false for classic).
2C supersedes it. Deleted in `e432a87`.

---

## 2 · Decisions, and what settles them

Six decisions. Where the engine answers, the engine answers — these are not preferences.

### D1 — the unit of replacement is a chunk range

The artist names which chunk ids the commit is overwriting. Before allocating, tiles and blocks
referenced *only* by those chunks are returned to the pool. Naming every chunk is a full replace;
naming none is a purely additive claim. One mechanism, three behaviours.

This answers §0 C3: incremental slot-claiming made the budget "the leftovers", which is where the
scarcity came from. Reclaim makes the budget the range's own art.

### D2 — commit never changes colour silently, in either direction

Commit compares only the palette entries the committed art actually uses. On drift it **refuses**,
names the drifted entries, and offers two resolutions:

- **Use the act's colours** — re-index the art onto the act palette. Exact matches only; refuses if
  a canvas colour has no equivalent, rather than picking a nearest.
- **Adopt into the zone palette** — write lines 1–3, stating plainly which acts change.

  **That reach is computed from the act's own palette components, never hardcoded.** "Every act of
  the zone changes" is false for SBZ, whose acts carry per-act palette files — `SBZ Act 2.bin`,
  `SBZ Act 3.bin` (`profiles/s1.ts:473, 493`). The dialog must read `paletteSources` and name the
  files it would write, so the sentence is true in every zone rather than in most of them.

**Line 0 drift always refuses.** `profiles/s1.ts:132–140`: every zone composes as
`palette/Sonic.bin[0..16) → entries 0..16` plus `palette/<Zone>.bin[0..48) → entries 16..64`. Line 0
is Sonic's palette, shared by the whole game.

**This must be enforced in the planner.** VERIFIED: `s1-io.ts:571–597` decomposes `doc.palettes`
into every component file with no special-casing, `Sonic.bin` included. Nothing downstream defends
line 0.

Adoption writes only the dry palette. LZ and SBZ3 carry separate underwater palette files
(`profiles/s1.ts:174–177`) that are not in `LevelDoc.palettes`, so adopted art renders under the old
underwater palette. The report must say so; it is not a defect to be fixed here.

### D3 — collision follows the engine

VERIFIED against `s1disasm/_incObj/sub FindNearestTile & FindFloor & FindWall.asm:111–155`:

```
move.w  (a1),d0          ; chunk cell word
andi.w  #$7FF,d0         ; block number
beq.s   .isblank         ; BLOCK 0 IS BLANK — short-circuits BEFORE the solidity test
btst    d5,d4            ; is the block solid?      <- chunk cell solidity bits
movea.l (v_collindex).w,a2
move.b  (a2,d0.w),d0     ; collision heightmap id   <- colind INDEXED BY BLOCK NUMBER
beq.s   .isblank         ; id 0 = no collision
btst    #$B,d4           ; x-flip -> mirror heightmap, negate angle
btst    #$C,d4           ; y-flip -> flip angle
```

Four consequences, none of them optional:

1. **colind is one byte per block id.** Two blocks needing different collision *are* two different
   blocks. So inherited collision is **part of block identity during dedup**: two occurrences that
   look identical but displace different collision shapes stay two blocks. Merging them would
   silently change collision, and no representation avoids that. Where this exceeds the block pool,
   the planner refuses with the numbers (§5).
2. **Solidity gates collision before colind is ever read** (`btst d5,d4`). A chunk whose cells are
   all solidity 0 is fall-through regardless of colind. So a new chunk cell **inherits the displaced
   cell's solidity plane** as well as its block's colind. Both, or the feature ships the defect D3
   exists to prevent.
3. **Orientation is part of block identity too — flip-merging is NOT free.** The engine orients the
   heightmap by the **chunk cell's** flip bits. The displaced cell collided as
   `orient(colind_old, flip_old)`; the new cell collides as `orient(colind_inherited, flip_new)`,
   where `flip_new` comes from the resolver's canonicalisation and knows nothing about `flip_old`.
   Two cells whose old art was mirror-imaged but whose colind id was the *same* (a symmetric shape —
   real data does this) pass the D3.1 identity test and merge, after which one of them collides
   against a mirrored heightmap. Even a lone occurrence breaks if canonicalisation flips it relative
   to the cell it displaced.

   So the dedup identity tuple is **(canonical cells, inherited colind, relative orientation
   `flip_new XOR flip_old`)** — three elements, not two. Merge only where that relative orientation
   is consistent across occurrences, or where the inherited colind is 0 (nothing to orient). The
   resolver should additionally *prefer* the displaced cell's orientation when choosing an
   occurrence's flips, so the common case merges rather than splits.

   An earlier draft of this spec claimed flip-merged blocks got correct collision for free. That is
   true for art drawn from scratch and false under positional inheritance, which is the only mode
   2C has.

4. **Block 0 and tile 0 are floors, not resources.** `beq.s .isblank` fires on block number 0
   *before* the solidity test, so block 0 is engine-blank unconditionally and can never carry
   collision. Tile 0 is the transparent tile. **Neither is ever reclaimable or allocatable**, and
   this must be stated as its own rule in 2C rather than inherited: the tile-0 protection phase 1
   relies on is `findFreeSlot` starting at `t=1` (`classic-surface-plan.ts:127`), a private function
   2C does not call — 2C's allocator is new code drawing from a reclaimed list phase 1 never had.

   A full replace (D1) makes every block's chunk references a subset of the replaced set, so without
   this rule tile 0 and block 0 are *always* reclaimed on the path most likely to be used. Allocating
   over tile 0 repaints every blank cell in the zone; reassigning block 0 fills every blank chunk
   cell with art the engine will never make solid.

   The mirror of the all-transparent-cell rule applies at the block tier too: an all-transparent
   block maps to **block 0**, never allocated.

Appended chunks have nothing to inherit: colind 0 and solidity 0, **reported as a count**, never
silent.

Curiosity, harmless, worth recording so nobody "fixes" it: the engine masks the block number to
`$7FF` (11 bits) while `model.ts:38` uses `$3FF` (10 bits, following SonLVL). Bit 10 is unused in S1
and always zero, so the two agree in practice.

### D4 — one pool matcher, flip-awareness behind a flag

`findContentMatch` (`classic-surface-plan.ts:98`, exact-only, private) generalises into a shared
`findPoolMatch(..., { allowFlips, excluded })` returning the match **plus the orientation it needs**.
Phase 1 passes `allowFlips: false` and behaves exactly as today; 2C passes `true`.

Its `excluded` contract (documented at `classic-surface-plan.ts:88–97`) is load-bearing and must
survive the move: a slot already claimed this gesture holds stale on-disk bytes, so matching against
it would repoint one cell at another's paint.

**One exclusion set is not enough — there are three states, and the matcher's contract must name
all of them.** Availability threads through matching *and* allocation as one structure:

| State | May be matched against | May be allocated |
|---|---|---|
| free / reclaimed, untouched | yes — its bytes are what is on disk | yes |
| matched and reused this gesture | yes — its bytes are unchanged | **no** |
| allocated new bytes this gesture | **no** — its bytes are stale | no |

The middle row is the one a single `excluded` set loses. Without it: tile A content-matches
reclaimed slot 5 and repoints to it, then the allocator hands slot 5 to tile B and overwrites it —
A's blocks now render B's paint. On a re-theme this is close to certain, because reclaimed slots
hold the old zone art, imported art matches many of them, and the allocator draws from the same
list.

**This is also a latent defect in shipped phase 1**, found by this review rather than in the field:
`classic-surface-plan.ts:285–288` takes a `findContentMatch` hit without adding it to `claimed`, so
a free slot whose stale bytes matched one cell can be handed to another cell by `findFreeSlot` in
the same gesture and overwritten. Reachable, because free pool slots hold leftover art rather than
zeros. Fixing it is part of the extraction; it needs its own regression test with a planted
collision, and that test must fail against today's code before the fix lands.

§0 C6 feared 2C's claim count could exceed 2B's readout. It cannot, provided **within-canvas dedup
is flip-aware** — pool matching only ever reduces the count further. The readout stays an upper
bound.

### D2b — the commit's reach crosses acts, and the report must say so

Art files are shared, so a commit is never scoped to the act the artist has open. Three reaches,
all verified in `profiles/s1.ts`:

- **Sibling acts** share the zone's tiles, blocks, chunks and colind files. Replacing a chunk
  changes every act of the zone that uses it.
- **SBZ Act 3 borrows LZ's tiles, blocks, chunks and colind** (`profiles/s1.ts:485–488`) while
  keeping its own palette (`:493`). So art committed while editing LZ also appears in SBZ3 — under
  a different palette the artist never saw. "Use the act's colours" is honest about LZ and silent
  about SBZ3; the report must name it.
- **The ending reuses GHZ's art *and its block set*** (predecessor spec §0 C2).

Reclaim itself is safe across all three, because `blockToChunks` walks the shared chunk file rather
than one act's view of it. The exposure is entirely in what the artist is told. The report names
every context a commit reaches, computed from the profile, not from the open act.

### D5 — commit's minimum unit is a whole chunk

A 256×256px region. One targeting model, one report shape, and the only unit for which D3's
positional inheritance is defined. A 16×16px rock goes in through phase 1: paint it onto a block
surface.

### D6 — the PNG path never becomes a canvas document

VERIFIED: `decodeCanvasFiles` refuses images over `CANVAS_MAX_SIDE`
(`canvas-file-format.ts:249–254`), and its comment states why — "the undo history clones the whole
pixel buffer per edit". The cap belongs to the **document**, not the decoder.

So the import path calls `decodeIndexedPng` (`indexed-png.ts:332`) directly, maps its palette into
canvas index space against the act palette, and feeds the resolver. No `CanvasDoc`, no undo history,
no 1024px cap. That is the whole reason a layout-sized sheet can be imported at all.

**Mapping a PNG colour to a palette LINE is constraint satisfaction, not a lookup.** Real act
palettes repeat colours across lines — black and white especially — so a per-colour first-match
assignment picks a line per *colour* when the rule is one line per *8×8 cell*. On a legitimate sheet
that manufactures clashes the artist cannot fix, because nothing they drew is wrong. Assignment is
therefore solved **per cell**: for each 8×8 cell, choose a line that can express all of its colours;
a cell with no such line is a genuine clash and refuses through the same gate as the canvas path
(§4 step 2). SonLVL solves this per tile; so do we.

---

## 3 · Architecture

Three new modules and two extractions. The seam is at the document boundary.

### Extractions (each refactors its existing consumer onto it)

**`core/art/tile-canon.ts`** — the canonical 8×8 form and its orientation, lifted out of
`countUniqueTiles` (`canvas-constraints.ts:169–198`). One rule: keyed on palette **entries** not
6-bit canvas indices; x/y/xy only, never transpose (the VDP has no transpose bit).

This is the extraction that matters most. 2B's readout promises commit can never claim more tiles
than it shows; that promise is only *provable* if the readout and the resolver share one definition
of "same tile, mirrored". Re-implementing it inside a doc-bound module would give the rule two
homes — the defect this codebase treats as a defect. It also buys a second witness: planting a wrong
orientation then fails both the 2B count suite and the 2C dedup suite.

**`core/art/tile-pool-match.ts`** — `findPoolMatch(tiles, want, { allowFlips, excluded })
→ { tileIndex, xf, yf } | null`, lifted from `classic-surface-plan.ts:98` with the `excluded`
contract intact. D4 forces this out into the open: two modules cannot share a private function.

The guard that phase 1 is unchanged is its existing suite staying green **untouched**.

### `core/art/canvas-resolve.ts` — pure geometry

Imports no document type. In: `pixels: PixelBuffer`, `gridOrigin`, region. Out — `CanvasResolution`:

- canonical tiles indexed by local **handle** (not pool id — it knows no pool);
- per-occurrence orientation;
- blocks as 2×2 arrays of `{ handle, xf, yf, palLine }`, deduped flip-aware **in handle space**
  (sound: flip-aware-distinct canonical tiles can never collapse to one pool tile);
- chunks as 16×16 arrays of block-handle cells with their flips.

Total over clash-free input. Refuses nothing — the binding guarantees the precondition. This mirrors
`canvas-constraints.ts`'s own stated philosophy ("It reports; the pane decides how loudly to say
so").

### `core/art/classic-commit-plan.ts` — the binding

In: `doc: LevelDoc`, `UsageIndex`, **`pixels: PixelBuffer` and `gridOrigin`**, the target chunk file
indices, the chosen palette resolution, and injected `isEditableTile` / `reservedTiles` (same
injection pattern as `PlanInput`, `classic-surface-plan.ts:57–75`).

**The planner takes pixels and calls `canvas-resolve` itself** — it does not take a finished
resolution. Three of its own steps need pixels (the palette scan, the clash gate, the cut), and
"use the act's colours" re-indexes pixels and therefore must re-resolve. A caller that ran resolve
first would have to run the palette and clash steps too, which would make "every refusal lives in
the planner" false.

Out — `CanvasCommitPlan`:

- `tileWrites: { tileIndex, data }[]`
- `blockWrites: { blockId, def, colind }[]` — **overwrites as well as appends**, which
  `SurfaceEditPlan.newBlocks` cannot express, so this is a new type rather than a reuse
- `chunkWrites: { chunkFileIndex, def }[]` and `chunkAppends: ChunkDef256[]`
- `paletteWrites: { line, colors }[] | null`
- `report` (§6)

**Every chunk id in every type names its space.** The `UsageIndex` carries both: `blockToChunks` is
FILE order, `chunkPlacements` is ENGINE id (`usage-index.ts:39, 41`), and engine id = file index + 1
(`classicLevelStore.ts:1057–1059`). So fields are `chunkFileIndex` or `chunkEngineId`, never
`chunkIndex`, with **one** conversion point. A missed conversion in reclaim would intersect the
wrong file index against `blockToChunks` and free an *adjacent* chunk's tiles and blocks — the
corrupts-art-nobody-was-editing failure this feature must not have.

**Every refusal lives here**, as a discriminated union rather than phase 1's bare `reason` string —
the palette refusal must carry the drifted entries and both resolutions so the dialog can offer them
(§5).

### `classicCommitCanvas(plan)` — the store command

Shaped exactly like `classicPaintSurface` (`classicLevelStore.ts:885–988`): re-validate tile writes
through the same `tileLockReason`, build one immutable `newDoc`, run `structuralError` once, call
`commitArt` once.

VERIFIED: `ART_DOMAINS = ['tiles','blocks','chunks','palette','colind']`
(`classic-domain-history.ts:21`) — all five domains this touches are members, so the whole commit,
palette adoption included, is **one history record and one Ctrl+Z**. Same structural guarantee §3.4
verified for phase 1.

Do not split further. A separate reclaim or allocator module would scatter one gesture's
bookkeeping: the claimed-slot set must thread through matching and allocation as one structure.

---

## 4 · The pipeline

1. **Palette check** (D2) — over the entries the committed art uses. Drift refuses; line 0 drift
   refuses unconditionally. Compare CRAM words through **one** masking helper on both sides: the
   canvas palette is `number[]`, the doc's is `Uint16Array[4]`, and a stray high bit makes an exact
   match spuriously fail.
2. **Clash gate** — by *calling* `findCellClashes` (`canvas-constraints.ts:86`), never restating it.
   Refuses with the offending cells.
3. **Reclaim** — from the `UsageIndex`, the tiles and blocks referenced only by the chunks being
   replaced. Four rules, all load-bearing:

   - **Never tile 0, never block 0** (D3.4).
   - **Filtered by the same predicates as allocation**: reclaimed tiles must pass `isEditableTile`
     and must not be in `reservedTiles`. Two concrete failure modes this prevents: GHZ chunks
     reference animated-art overlay slots (`profiles/s1.ts:150–158`) which `tileLockReason` would
     refuse at apply time, killing the whole plan *after* the artist committed; and `reservedTiles`
     are invisible to the usage index by construction (`classic-surface-plan.ts:65–74`), so a tile
     drawn by an object sprite plus a replaced chunk would be reclaimed and overwritten, corrupting
     the sprite.
   - **Refuse to reclaim at all when either predicate is UNKNOWN.** `tileLockReason(null, …)`
     permits everything (`editable-tiles.ts:35`) and `buildReservedTileSet` contributes nothing when
     the mapping assembly failed to load (`s1-levelart-reservations.ts:96–110`); `PlanInput`
     documents the empty set as deliberately permissive. Phase 1 tolerates that because one gesture
     risks a handful of tiles. A full-zone reclaim under unknown predicates exposes the whole pool
     at once. 2C refuses rather than inheriting the permissive default — this is the one place the
     two phases deliberately differ, and the reason is scale.
   - **Chunk ids are FILE indices here**, because `blockToChunks` is (§3).
4. **Cut and canonicalise** — via `tile-canon`. All-transparent cells map to **tile 0**, never
   allocated (`findFreeSlot` starts at `t=1`, `classic-surface-plan.ts:127`); this is the difference
   between a mostly-empty canvas costing nothing and costing dozens of slots.
5. **Dedup within the drawing**, flip-aware (D4).
6. **Match against the pool**, flip-aware, against the three-state availability structure (D4) —
   not a single exclusion set. Reclaimed slots still hold their old bytes, so matching them is
   legitimate reuse; a matched slot then becomes ineligible for allocation, and an allocated slot
   ineligible for both.

   **Animated-art overlay slots are excluded from matching.** The doc pool contains blitted
   animation frames (`s1-io.ts:245–267`); a match that repoints level art at one of them produces
   art that animates in game. Latent in phase 1, near-certain at import scale.
7. **Allocate** the remainder from reclaimed-then-free slots. Short → refuse with the numbers.
8. **Compose blocks**, dedup on the **three-element identity** of D3.1 and D3.3 — canonical cells,
   inherited colind, relative orientation. Then **match against existing pool blocks**, on that same
   identity: an identical-looking pool block carrying a different colind is not a reuse candidate,
   by D3's own logic. Without pool-block matching an additive re-import duplicates every block and
   reaches the 1024 ceiling twice as fast; reclaimed block ids pending overwrite are excluded from
   matching for the same reason their tile counterparts are.
9. **Assign block ids** — reclaimed ids first, then append. Inherit colind positionally. Reclaimed
   ids left unwritten keep stale definitions pointing at reallocated tiles: harmless in game, but
   garbage in BlockTab, so zero them and say how many in the report.
10. **Compose chunks** — write to target ids, or append. Inherit solidity positionally (D3).
11. **Report** (§6), then **apply as one command**.

**Ordering note:** "use the act's colours" (D2) remaps entries and therefore changes tile bytes, so
it must run *before* step 4. The planner takes the palette resolution as an **input parameter** and
re-runs; it never patches a finished plan.

**The remap is line-preserving, or the clash gate runs again.** An exact colour match may live in a
different palette line, so a remap that crosses lines can manufacture a multi-line cell *after*
step 2 already passed. Constrain the remap to within-line matches; where that is impossible, re-run
step 2 on the remapped pixels rather than trusting the earlier pass.

**There is an engine-hardcoded chunk alias no index can see.** When an object's
`sprite_looping_bit` is set — behind a loop — `FindNearestTile` substitutes engine chunk `$51` for
engine chunk `$28` when resolving collision
(`sub FindNearestTile & FindFloor & FindWall.asm:67–74`). The constants are hardcoded and the swap
is gated on the render bit, not on the zone, so it is a GHZ mechanism by data rather than by
condition. Consequence: replacing engine chunk `$51` silently changes what `$28` collides against
while leaving `$28` looking untouched. Nothing in `LevelDoc` records the relationship. A one-line
warning when the target range includes `$51` is the whole mitigation.

**The priority bit has no author.** `BlockCell.pri` exists (`model.ts:56`); the canvas has no
priority plane. Committed cells get `pri = 0`. Correct for most level art, wrong for
loop-foreground-style art. Named here so it is a decision rather than an accident.

---

## 5 · Refusals

Every refusal names a resolution the artist can act on. Commit is never a dead end — a commit step
that stops with "no" is the thing that sends someone back to another tool.

| Refusal | Carries | Resolution offered |
|---|---|---|
| Cell clash | the offending cells | fix them; the 2B overlay already shows where |
| Palette drift | the drifted entries | use the act's colours, or adopt into the zone palette |
| Line 0 drift | the drifted entries | revert those entries — Sonic's palette is not the act's to change |
| Tile allocation short | needed, available, reclaimed, free | widen the chunk range (reclaims more), or simplify |
| Block pool exceeded | needed vs `MAX_BLOCKS_TOTAL` | widen the range, or accept merged collision |
| Chunk append exceeded | needed vs 127 | replace existing chunks instead of appending |
| Range/canvas mismatch | ids named vs chunks supplied | adjust either |
| Predicates unknown | which one failed to load | reopen the project so the editable range and object reservations resolve; commit additively (no reclaim) meanwhile |
| PNG cell has no viable line | the offending cells | recolour those cells — no line can express them |

---

## 6 · Ceilings, stated honestly

VERIFIED against the code, not inferred:

- **Tiles** — two different numbers, and this spec previously used one word for both. **Base art**
  (the decompressed source files) is 454–882 tiles: LZ 454, SYZ 882, GHZ 461+369 = 830. The
  **document pool** is larger, because `s1-io.ts:243–267` extends it to cover animated-art overlays
  and the gaps before them: GHZ 965, SBZ 1120. The readout's denominator, and the allocator's
  ceiling, is the **document pool** — `poolTileCount`, `Math.floor(doc.tiles.length / 32)`. Name the
  two separately in code (`baseTileCount` vs `poolTileCount`); free slots come from
  `countFreeTileSlots` (`free-tile-slots.ts`) either way.
- **Blocks** — `MAX_BLOCKS_TOTAL = 0x400` = 1024 (`classicLevelStore.ts:1063`).
- **Chunks** — `MAX_ADDRESSABLE_CHUNKS = 0x7f` = **127**, not 256. The layout byte's bit 7 is S1's
  loop flag, so engine ids $80+ are unstampable (`classicLevelStore.ts:1055–1061`). `model.ts:194`'s
  `MAX_CHUNKS = 256` is *file capacity* — a different rule. The planner must bound at 127 and should
  import the constant rather than restate it; moving it to `model.ts` is the natural home.
- **Canvas commit size** — `CANVAS_MAX_SIDE` 1024px = 4×4 = **16 chunks per commit**. A full-zone
  re-theme from the canvas is therefore several commits, each naming its own range, each computed
  fresh against the live document. The PNG path has no such cap (D6).

**GHZ act 1 has 17 claimable tiles, not the 146 the art-authoring spec's §3.5 records.** Measured
live in the running app (CDP, 2026-08-15): the budget readout says
`tiles 9 unique · 17 free in GHZ 1 · pool 948/965`, and `reservedTiles` is **158**. §3.5's per-zone
figures ("ghz 146, mz 126, syz 137, slz 73, sbz 415, lz 0") are *unreferenced pool slots* and do not
subtract the tiles object sprites draw through mappings — which `countFreeTileSlots`,
`findFreeSlot` and this planner all do. 146 − 17 = 129 of GHZ's 158 reserved tiles were being
counted as free.

This is the same class of error as the Labyrinth claim §0 C1 corrected: a number measured by a model
simpler than the code that consumes it. Treat §3.5's table as an upper bound only. It also means
commit is much tighter than the predecessor spec implies — a 256×256 drawing of three casual strokes
needed 29 tiles and was correctly refused, which is the scarcity D1's reclaim exists to answer.

2B already ships the ceiling readout: `budgetReadout` prints
`tiles N unique · M free in GHZ 1 · pool 819/965`, and its comment
(`use-canvas-constraints.ts:100–105`) deliberately refuses to compare the two numbers because
"commit matches against the existing pool first". **2C supplies that comparison** — in the commit
report, where it is computed rather than guessed. It does not add a second readout.

The report states, before applying: new tiles / reused / reclaimed, new blocks / reused, chunks
replaced / appended, blocks that inherited collision vs. got 0, chunk cells that inherited solidity
vs. got 0, and pool counts before and after.

---

## 7 · Testing

Everything load-bearing is pure and node-reachable. Per the standing lesson
(`aurora-guards-assert-nothing`): **plant the violation, watch the named test fail, and assert the
plant applied to the file** — a silent no-op plant is indistinguishable from a passing guard.

- `tile-canon`: orientation choice, including the both-flips case. Planting a wrong orientation must
  fail **both** the 2B count suite and the 2C dedup suite.
- `findPoolMatch`: `allowFlips` both ways; the three-state availability contract in **both**
  directions — allocate-then-match and match-then-allocate; phase 1's existing suite green
  **untouched**.
- **The phase-1 latent defect (D4)**: a regression test where one cell content-matches a free slot
  and a second cell would be allocated the same slot. It must **fail against today's code** before
  the fix lands — a test that passes on the unfixed code is testing nothing.
- Floors: tile 0 and block 0 are never reclaimed and never allocated, exercised on the **full
  replace** path where every chunk is named, since that is the path that reclaims them.
- Collision orientation (D3.3): two occurrences with mirror-image art and the *same* colind must
  **not** merge; one occurrence whose canonical orientation differs from the cell it displaces keeps
  the displaced cell's orientation.
- Id spaces: a reclaim computed from engine ids rather than file indices must fail loudly — plant
  the off-by-one and assert it frees the neighbour's art.
- Reclaim: an animated-art overlay slot is never reclaimed; a `reservedTiles` tile is never
  reclaimed. Both planted against **real s1disasm GHZ data**, not a synthetic fixture — the dominant
  defect class all session was fixtures tidier than reality.
- Collision: two identical-looking occurrences displacing different colind stay two blocks;
  solidity inherits positionally; appended chunks report their zero counts.
- Palette: line 0 drift refuses; adoption writes lines 1–3 only; the water-palette warning fires for
  LZ.
- Allocation exhaustion — the Labyrinth path, refusing with numbers.
- Ceilings: 127 chunks, 1024 blocks.

The dialog, the targeting UI and the commit gesture need a CDP harness in the running app; the node
suite renders no React and no canvas. `scratchpad/canvas-cdp-harness.mjs` is importable for its
launch discipline, and `scratchpad/constraints-cdp-harness.mjs` shows the pattern.

---

## 8 · Out of scope

- **Sprite commit.** §4.4 names it as a second target behind the same interface. The `canvas-resolve`
  seam makes it cheap later; it is not a reason to build the seam and not part of this work.
- **A collision editor.** `classicSetColind` exists but is reachable only from `agent-handler.ts`.
  D3's positional inheritance means commit does not need one; authoring collision for
  brand-new chunks still has no in-app answer, and that remains true after 2C.
- **Layers**, ellipse, custom brushes, onion skinning. Deferred by phase ordering, not declined —
  see the standing bar in §1.
- **Re-resolve / round-trip link** from a canvas back to the art it produced.
- **Raising `CANVAS_MAX_SIDE`.** The cap is an undo-memory budget with its reasoning recorded at
  `canvas-doc.ts:137–141`. The PNG path is the answer to size, not a bigger canvas.

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

`src/renderer/components/ChunkSheetImporter.tsx` is a gutted S4-era stub, mounted nowhere, whose
TODO claims the tile→block→chunk hierarchy "no longer exists" (true for aeon, false for classic).
2C supersedes it; delete it as part of this work.

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
- **Adopt into the zone palette** — write lines 1–3, stating plainly that every act of the zone
  changes.

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
btst    d5,d4            ; is the block solid?      <- chunk cell solidity bits
movea.l (v_collindex).w,a2
move.b  (a2,d0.w),d0     ; collision heightmap id   <- colind INDEXED BY BLOCK NUMBER
beq.s   .isblank         ; id 0 = no collision
btst    #$B,d4           ; x-flip -> mirror heightmap, negate angle
btst    #$C,d4           ; y-flip -> flip angle
```

Three consequences, none of them optional:

1. **colind is one byte per block id.** Two blocks needing different collision *are* two different
   blocks. So inherited collision is **part of block identity during dedup**: two occurrences that
   look identical but displace different collision shapes stay two blocks. Merging them would
   silently change collision, and no representation avoids that. Where this exceeds the block pool,
   the planner refuses with the numbers (§5).
2. **Solidity gates collision before colind is ever read** (`btst d5,d4`). A chunk whose cells are
   all solidity 0 is fall-through regardless of colind. So a new chunk cell **inherits the displaced
   cell's solidity plane** as well as its block's colind. Both, or the feature ships the defect D3
   exists to prevent.
3. **Flip-merged blocks get correct collision for free.** The engine mirrors the heightmap and
   negates the angle from the chunk cell's own flip bits, so mirrored art gets mirrored collision
   automatically. Flip-aware block dedup is therefore safe, not a wrinkle to dodge.

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

§0 C6 feared 2C's claim count could exceed 2B's readout. It cannot, provided **within-canvas dedup
is flip-aware** — pool matching only ever reduces the count further. The readout stays an upper
bound.

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

In: `doc: LevelDoc`, `UsageIndex`, the resolution, the target chunk ids, the chosen palette
resolution, and injected `isEditableTile` / `reservedTiles` (same injection pattern as `PlanInput`,
`classic-surface-plan.ts:57–75`).

Out — `CanvasCommitPlan`:

- `tileWrites: { tileIndex, data }[]`
- `blockWrites: { blockId, def, colind }[]` — **overwrites as well as appends**, which
  `SurfaceEditPlan.newBlocks` cannot express, so this is a new type rather than a reuse
- `chunkWrites: { chunkIndex, def }[]` and `chunkAppends: ChunkDef256[]`
- `paletteWrites: { line, colors }[] | null`
- `report` (§6)

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
   replaced. **Filtered by the same predicates as allocation**: reclaimed tiles must pass
   `isEditableTile` and must not be in `reservedTiles`. Two concrete failure modes this prevents:
   GHZ chunks reference animated-art overlay slots (`profiles/s1.ts:150–158`) which
   `tileLockReason` would refuse at apply time, killing the whole plan *after* the artist committed;
   and `reservedTiles` are invisible to the usage index by construction
   (`classic-surface-plan.ts:65–74`), so a tile drawn by an object sprite plus a replaced chunk
   would be reclaimed and overwritten, corrupting the sprite.
4. **Cut and canonicalise** — via `tile-canon`. All-transparent cells map to **tile 0**, never
   allocated (`findFreeSlot` starts at `t=1`, `classic-surface-plan.ts:127`); this is the difference
   between a mostly-empty canvas costing nothing and costing dozens of slots.
5. **Dedup within the drawing**, flip-aware (D4).
6. **Match against the pool**, flip-aware, `excluded` carrying every slot already claimed this
   gesture. Reclaimed slots still hold their old bytes: matching them is legitimate reuse, but once
   allocated to new bytes they must enter `excluded`.
7. **Allocate** the remainder from reclaimed-then-free slots. Short → refuse with the numbers.
8. **Compose blocks**, dedup with **inherited colind as part of identity** (D3).
9. **Assign block ids** — reclaimed ids first, then append. Inherit colind positionally.
10. **Compose chunks** — write to target ids, or append. Inherit solidity positionally (D3).
11. **Report** (§6), then **apply as one command**.

**Ordering note:** "use the act's colours" (D2) remaps entries and therefore changes tile bytes, so
it must run *before* step 4. The planner takes the palette resolution as an **input parameter** and
re-runs; it never patches a finished plan.

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

---

## 6 · Ceilings, stated honestly

VERIFIED against the code, not inferred:

- **Tiles** — per-zone pool, 454–882. Free slots via `countFreeTileSlots` (`free-tile-slots.ts`).
- **Blocks** — `MAX_BLOCKS_TOTAL = 0x400` = 1024 (`classicLevelStore.ts:1063`).
- **Chunks** — `MAX_ADDRESSABLE_CHUNKS = 0x7f` = **127**, not 256. The layout byte's bit 7 is S1's
  loop flag, so engine ids $80+ are unstampable (`classicLevelStore.ts:1055–1061`). `model.ts:194`'s
  `MAX_CHUNKS = 256` is *file capacity* — a different rule. The planner must bound at 127 and should
  import the constant rather than restate it; moving it to `model.ts` is the natural home.
- **Canvas commit size** — `CANVAS_MAX_SIDE` 1024px = 4×4 = **16 chunks per commit**. A full-zone
  re-theme from the canvas is therefore several commits, each naming its own range, each computed
  fresh against the live document. The PNG path has no such cap (D6).

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
- `findPoolMatch`: `allowFlips` both ways; the `excluded` stale-bytes contract; phase 1's existing
  suite green **untouched**.
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

# In-app art authoring — design

**Status: phases 1, 2A and 2B built and merged (2026-08-15). Phase 3 DECLINED — see
"§0 · Corrections" immediately below, which is AUTHORITATIVE over everything after it.**

**§4.4 (resolve and commit) is SUPERSEDED by
`2026-08-15-phase-2c-resolve-and-commit-design.md`**, which answers the questions §0 raised and
adds a PNG import path alongside the canvas. Read that instead for anything about commit.

Goal: make Aurora a place where Genesis art is *made*, not only *edited* — so that level art and
sprite art can both be authored without round-tripping through Aseprite.

Two phases, one product story:

- **Phase 1 — paint-through.** Paint pixels directly on a composed block/chunk surface; strokes
  resolve down the tile→block→chunk reference ladder without silently damaging other places.
- **Phase 2 — origination.** A free canvas with a configurable constraint profile, plus a
  resolve-and-commit step that turns a drawing into pool art.

Phase 1 makes existing art pleasant to edit. Phase 2 makes new art possible. Phase 1 first, because
its unknowns are nastier and Phase 2's commit step lands on top of it.

---

## 0 · Corrections (2026-08-15, post-2B audit)

**This section overrides anything below it that disagrees.** Written after phases 1, 2A and 2B
shipped and three independent audits measured the claims this spec was resting on. Every number here
was verified directly against s1disasm, twice by separate implementations where it mattered.

**C1 — "Labyrinth has zero spare tiles" is TRUE BUT NARROWER THAN IT READS, and this document repeats
it three times (§3.5, §4.4, §6 Risk 3) as though it meant the zone is hopeless.** It does not. LZ has
zero *claimable slots inside the existing pool*; it has roughly **26 appendable tiles** between the
end of its art (454 tiles) and the first thing loaded above it (`ArtTile_LZ_Block_1 = $1E0` = 480).
The flat-pool model cannot express that difference, which is what turned 26 into "impossible".

**C2 — PHASE 3 (tile-pool growth) IS DECLINED.** Measured effective slack, per zone, after accounting
for animated art and for contexts that share a zone's files: GHZ **2**, LZ 26, MZ 33, SLZ 10, SYZ 14,
SBZ 7 — about **92 tiles game-wide**. GHZ is 2 rather than 14 because the ending sequence reuses GHZ's
art files *and its block set*, and `AniArt_Ending_Flower4` writes `$340–$34F`; Aurora already blocks
that range as an anim overlay, so a growth feature would have had to override a guard that was
already correct. Growing beyond the slack requires relocating engine art by editing `_Constants.asm`
equates and PLC lists, which `docs/ROADMAP.md` forbids outright ("Aurora never emits engine assembly
directly"). The phase therefore has no second rung and is not worth its first.

**C3 — the scarcity is mostly self-inflicted by §4.4's framing.** Commit is specced as *incremental
slot-claiming*, so the budget is the leftovers. A hacker replacing a zone's theme spends the **whole
pool** — 454–882 tiles depending on zone — and replace-mode commit is *less* code than the
incremental allocator, not more. Whatever 2C becomes, it should treat wholesale replacement as the
primary path and incremental claiming as the fallback.

**C4 — flip-aware dedup of the existing pools returns more than growth ever could, but not where it
is needed.** Duplicate tiles already present, measured twice independently: GHZ 111, SYZ 52, SLZ 52,
MZ 50, **LZ 0, SBZ 0**. It belongs inside the commit pipeline (§4.4 steps 2–3), not as a feature
anyone has to find — and it does not rescue the two starved zones.

**C5 — §4.4 never mentions PALETTE or COLLISION, and both are user-visible on first contact.** A
canvas seeded from a zone and then recoloured commits art that renders under the act's CRAM, not the
artist's; and newly composed chunks have no collision, so the player falls through them. Commit must
state what happens in both cases before it is planned. (The collision half had a shipped defect
underneath it, fixed 2026-08-15: appended blocks did not extend the block→collision table.)

**C6 — content-matching must be FLIP-AWARE to match 2B.** §4.4 step 2 dedups flip-aware while phase
1's `findContentMatch` is exact-only. Left as is, a divergence whose bytes are an x-flip of an
existing pool tile claims a fresh scarce slot instead of repointing with the flip bit set, and 2C's
claim count can exceed the flip-aware unique count the readout promises is an upper bound.

---

## 1 · Why, and what the evidence says

Full research: `docs/superpowers/research/2026-08-15-how-a-zone-actually-gets-built.md`. The parts
that drive this design:

- The reasons artists leave for a dedicated tool are, in order: **seeing seams while drawing**,
  **editing a tile in context rather than in isolation**, and **tile-instance linking** (edit once,
  every placement updates). Layers rank fourth.
- Aurora already has more of this than expected. `PixelViewport` has a `repeat` prop doing a 3×3
  seamless-tiling preview (wired in aeon's composer, absent in classic). Aeon's `ComposerCanvas`
  already paints across a chunk-scale `PixelBuffer`. Mirror/symmetry exists. Instance linking is
  *structurally inherent* — S1 blocks reference tiles by id.
- **Classic is the half that is behind**: `TileTab` edits one 8×8 tile in isolation.
- **The variant tier is blocks, not chunks** (measured across six zones): chunks have no
  near-duplicates at all, while block-level variants are everywhere and usually diverge in
  flip/palette/collision rather than pixels. So divergence tooling belongs at the block tier.
- **Nobody prevents a constraint violation.** Every tool that solved the per-cell palette rule
  (GrafX2, Multipaint, NES Screen Tool) flags visually or auto-corrects; none block input.

### Vocabulary decisions

- Say **limit**, not "budget". Across nine surveyed tools "budget" appears in no primary
  documentation; GB Studio's phrasing is the field's: *"too many unique 8x8px tiles (204 where limit
  is 192)"*.
- Say **linked** / **unique**, not "shared" / "forked", in user-facing copy. "Edit one, all
  placements update" is a feature in Pyxel Edit and a warning in Aurora today; the words should match
  the framing we want.

---

## 2 · Scope

**In scope:** painting on composed block/chunk surfaces; block-tier divergence; the seam preview in
classic; the reframed linkage banner; a constraint-profiled origination canvas; a resolver that
commits a drawing into the tile/block/chunk pool.

**Out of scope, deliberately:**

- **Layers.** Ranked fourth by the evidence and structurally expensive — `PixelBuffer` is
  single-plane and layers interact with the commit/undo path. Revisit after Phase 2 ships.
- **Tile-pool growth** (a real `classicAddTile` writing back grown art files). Phase 1 recycles free
  pool slots instead. See §3.5 for why this matters and where it bites.
- **Re-resolve / round-trip link** from a canvas to the art it produced, so re-committing updates
  rather than duplicates. Useful, fiddly, and must not gate v1.
- **A standalone art tool.** Considered and deferred: the hard 90% (canvas, constraint model,
  resolver) is identical either way, a tool boundary would cut the draw → resolve → refine loop in
  half, and keeping the core pure means promoting it later stays cheap. Recorded because
  `empyrean/docs/STUDIO_VISION.md` never contemplated a from-scratch art tool at all, even though
  Seraph is exactly that for music — an asymmetry worth naming.

---

## 3 · Phase 1 — paint-through

### 3.1 The composed surface

New pure core module `src/core/art/classic-surface-buffer.ts`:

```
buildChunkSurface(doc, chunkIndex) -> { buffer: PixelBuffer, provenance: SurfaceProvenance }
buildBlockSurface(doc, blockId)    -> { buffer: PixelBuffer, provenance: SurfaceProvenance }
```

`buffer` is the composed image in palette indices. `provenance` is **per 8×8 cell**, not per pixel —
cheaper and sufficient — recording for each cell: chunk cell index, block id, block cell index, tile
index, and the *composed* flips.

**The correctness risk lives here.** A chunk cell's x/y flip mirrors the whole 16×16 block, which
both reorders which block cell sits where *and* flips the tile within it. Composing that with the
block cell's own flips is the single fiddliest piece of this design. It is pure, so the node suite
can cover it properly — and must, including the both-flips case.

Per-cell palette lines come free: `PixelViewport` already supports per-pixel palette lines because
level art needs them.

### 3.2 Resolving a stroke

`PixelEditController` already produces `diffWrites`. A new pure resolver turns surface writes into a
document mutation plan: walk provenance backwards, un-flipping coordinates to find the position
inside the *stored* tile, and group by target tile.

Painted content stays where it was painted only if **the tile is referenced by exactly one block
cell** *and* **the block is referenced by exactly one chunk cell**. Both checks are independent and
both are required — forking the block alone does not help, because the copy still points at the same
shared tile.

- **Block linked elsewhere** → clone it (`classicAddBlock`), repoint this chunk's cell.
- **Tile linked elsewhere** → try an exact content match in the pool first (reuse it), else claim a
  free pool slot, then repoint the block cell.

The isolation unit is **the chunk cell painted on**, not the layout placement. A chunk stamped eight
times in a layout shows the edit eight times; that is what a chunk *is*.

### 3.3 Link vs Isolate

A sticky mode in the tool options, following Aseprite's Manual/Auto rather than prompting per stroke:

- **Isolate** *(default)* — mutate in place when safe, diverge when not. Paint lands where you painted.
- **Link** — always mutate in place and propagate, with a live "*N places will change*" readout.

Isolate is the default because unwanted propagation is the destructive direction and Link is one
click away. Link is deliberately offered rather than prevented: it is Pyxel Edit's headline feature.

### 3.4 One command per gesture

A new composite store command applies tile writes, block additions, block-cell repoints and
chunk-cell repoints as **one** entry, preserving the rule step H established: one gesture, one
command, one Ctrl+Z.

**Verified 2026-08-15 — this fits the existing pattern with no change required.** Every classic
command already follows: build one immutable `newDoc`, run `structuralError(newDoc)` once, call
`commitArt(newDoc, dirtyPatch, versionEffect)` once. And `assertSingleDomain` rejects only domains
belonging to the *other* undo document (the layout split), so a patch of
`{ tiles, blocks, chunks }` — all members of `ART_DOMAINS` — is legal in a single `commitArt`. One
commit produces one history record, so the single-undo guarantee is structural, not careful. The
version effect should be `{ kind: 'all', tiles: [...] }`, since block and tile changes both repaint
every chunk that references them.

### 3.5 Limits, surfaced honestly

Measured spare tile slots per zone: ghz 146, mz 126, syz 137, slz 73, sbz 415, **lz 0**. (These are
*claimable slots inside the existing pool*. They are not the whole story about room — see C1/C2 in
§0: every zone also has a small appendable margin above its art, LZ's being 26, and growth into it
was investigated and declined.) Blocks are
far roomier (422–828 free of 1024) and `classicAddBlock` already exists; there is no `classicAddTile`
at all, so Phase 1 can only *recycle* free tile slots, never mint.

Mitigating this: **65% of tiles are used exactly once**, so the common stroke needs no new tile.

**Free is not the same as claimable.** `tileLockReason` (`core/project/editable-tiles.ts`) marks
tiles that cannot be written at all; `classicEditTiles` rejects them at edit time specifically so the
pencil can never look live on a tile the save path would refuse. A free pool slot is therefore only a
candidate if it is *also* inside the editable range — Isolate must filter on both, or it will diverge
into a tile that can never be saved. The same predicate must be used, not a second copy of the rule.

The tool options carry a live readout (`blocks 439/1024 · tiles 819/965`), and a stroke that will
diverge says so before committing. When Isolate cannot isolate because no free tile slot exists —
Labyrinth, today — it **refuses and offers the Link-mode edit explicitly**. It never silently mutates
linked content and never silently fails.

### 3.6 Two small pieces that close the loop

- Wire `PixelViewport`'s existing `repeat` prop into classic's `TileTab` behind a toggle, matching
  aeon's `repeatPreview`. The "essential" feature from the research, nearly free.
- Reframe `SharedBanner` from hazard to mechanism: *"used in 14 blocks · 31 cells — edits appear in
  all of them"*, plus a **Make unique** action. Same facts, stated as a tool.

---

## 4 · Phase 2 — the origination canvas

### 4.1 The document

A free-size indexed canvas — no chunk, no tile pool, no fixed dimensions. It is a **new document type
in the existing tab system**, alongside sprite docs, inheriting guarded activation, dirty tracking,
undo routing and `SaveCoordinator` without new plumbing.

It differs from a sprite doc in its colour model: pixels index a **64-colour space (4 lines × 16)**
rather than one 16-colour line.

**Persistence: indexed PNG plus a sidecar JSON** (constraint profile, palette-line assignment, grid
origin). Deliberately an open format — these files stay openable in Aseprite, and Aseprite output
stays importable. The origination surface should win by being Genesis-aware, not by trapping files.

### 4.2 Constraint profiles

A profile attached to each document, selected from **presets** — *Genesis level art*, *Genesis
sprite*, *Genesis unrestricted*, *none* — with individual rules exposed as toggles. Presets, not a
rule-builder: Multipaint, GrafX2 and GB Studio all ship a fixed menu of target machines, and none
expose custom rule authoring. Shipping a schema editor would be unusual, not standard.

| Rule | Meaning | Genesis level art | Genesis sprite |
|---|---|---|---|
| Colour space | bits per channel | 3 (512 colours) | 3 |
| Palette | lines × colours, transparent index | 4 × 16, index 0 | 1 × 16, index 0 |
| Cell palette rule | every 8×8 cell draws from one line | on | on |
| Tile limit | max unique 8×8 tiles, flip-aware | act's free slots | per sprite |
| Sprite limits | 4×4 tiles max; 20 sprites & 320 px per scanline; 80 per frame | off | on |
| Grids | overlay guides | 8 / 16 / 256 | 8 / 16 |

`decodeGenesisColor`/`encodeGenesisColor` already model 3 bits per channel, so the colour space is
modelled; what is new is *snapping* colour that arrives by paste or import.

### 4.3 How violations surface

Matched to the kind of constraint, following what the surveyed tools actually do:

- **Scalar limits** (colours used per line, unique tiles against the limit) → **live numeric
  readout**. This is GB Studio's `A: 0/20 T: 0/30` and Pyxel Edit's tile count.
- **Structural violations** (a cell drawing from two palette lines) → **live highlight overlay** on
  the offending cells, toggleable. Never a number: no surveyed tool gives a numeric count for this
  class, and none combines both for one constraint.
- **Commit** → hard check, refusing with specifics.

**Never prevent.** No tool found blocks the input, and the two that solved this problem properly
(GrafX2's red-tinted clash cells, Multipaint's silent auto-correct) both keep the artist in flow.

**Escape hatch:** an *unconstrained* toggle suspending live checking, re-scanning when re-enabled.
Pro Motion NG's tile-sync toggle and Multipaint's "unlimited" mode are the same idea, and it suits an
origination canvas — draw freely, reconcile deliberately.

**Flip-aware unique-tile counting is novel.** No surveyed tool counts mirrored tiles as one. It is
the correct count for the Genesis, but there is no proven UX to copy, so expect to iterate on it.

### 4.4 Resolve and commit

Over a grid-aligned region:

1. Palette-line check must pass, or refuse and show the offending cells.
2. Cut into 8×8 tiles; dedup exactly **and** flip-aware (x, y, xy) — the format has the bits and the
   shipped data leans on them heavily.
3. Match against the **existing pool first**, reusing what is already there. This is what SonLVL's
   importer does, and its author specifically changed it to check *all* existing art rather than only
   the current batch.
4. Compose 2×2 tile groups into blocks and dedup; same again for chunks.
5. Report before applying — *N new tiles, M new blocks, K new chunks*, with pool counts before and
   after. Over the limit refuses with the numbers; never a silent partial write.
6. Apply as one command.

**Phase 2 inherits Phase 1's no-mint constraint** (§3.5): with no `classicAddTile`, "new tiles" means
*claimed free pool slots*, and the commit is bounded by how many exist — zero, in Labyrinth. This was
read as the sharpest argument for tile-pool growth, on the grounds that a canvas you can draw on but
cannot commit is worse than no canvas. **That conclusion did not survive measurement (§0 C2): growth
is worth ~92 tiles game-wide and 2 in Green Hill.** The real answer is C3 — commit should be able to
REPLACE a zone's art, where the budget is the whole pool rather than its leftovers. Until then the resolver must state the ceiling up front,
before the user invests in a drawing that cannot land, rather than only at commit.

Then Phase 1 takes over: the region is real chunks, and refinement happens in place.

**Commit targets.** The canvas is general — the *target* is the specialised part. Level art first,
since the ladder work is Phase 1. Sprite commit (tiles plus mappings, into a sprite doc) is a second
target behind the same interface, and should not expand Phase 2's first cut.

---

## 5 · Testing

Everything load-bearing here is pure and therefore node-testable, which matters because the suite
renders no canvas and no React:

- Surface build and **flip composition**, including the both-flips case (§3.1).
- Plan resolution under Link and Isolate, including the two-tier cascade (§3.2).
- Limit exhaustion — the Labyrinth path, where Isolate cannot isolate (§3.5).
- Constraint evaluation: colour-space snapping, per-cell palette-line detection, flip-aware unique
  tile counting (§4.2–4.3).
- Resolver dedup against an existing pool, including flip-equivalent matches (§4.4).

Per the standing lesson in `aurora-guards-assert-nothing`: **plant a violation and watch each guard
fail before believing it passes.** The painting gestures themselves need a CDP harness in the running
app.

---

## 6 · Risks

1. **Flip composition in provenance** (§3.1) — the most likely source of subtly wrong pixels, and
   wrong in a way that looks plausible.
2. ~~**The composite command** (§3.4)~~ — **RETIRED 2026-08-15.** Verified against the store: the
   existing commit pattern composes, and `assertSingleDomain` permits a multi-domain art patch. No
   change to `CommandResult` needed.
3. **The Labyrinth cliff** (§3.5) — a zone where Isolate simply cannot work. Handled by refusing
   clearly, but it is a real gap until tile-pool growth exists.
4. **Novel UX with no precedent** — flip-aware tile counting (§4.3). Expect iteration.
5. **Scope creep toward "our own Aseprite."** The differentiator is being Genesis-aware, not being a
   general pixel editor. Layers, brushes and onion skinning stay out until Phase 2 ships and the gap
   is felt rather than assumed.

---

## 7 · Settled decisions

**All three are CLOSED — settled by the code that shipped, and written down here 2026-08-19 (the
2026-08-16 lens sweep §7.4 asked for exactly this) so that a cold session reading a list of "open"
questions does not redesign shipped behaviour.** Each was re-verified against source on that date;
the citation is where to look if you want to change one.

_(§0's corrections added three more that had to be answered before 2C was planned: what commit does
to the act PALETTE when the canvas has drifted from it; what COLLISION newly composed chunks get;
and whether commit's primary path is wholesale REPLACE or incremental claim. See C3 and C5 — and
`2026-08-15-phase-2c-resolve-and-commit-design.md`, which answers them.)_

- **Where the paint-through tools live in the UI** — SETTLED: **a tool-mode per tier**, as this
  spec was leaning. `ChunkTab.tsx:441` and `BlockTab.tsx:347` each carry a Paint chip that flips
  `chunkPaintMode` / `blockPaintMode`, and the pixel surface mounts only in that mode. One place
  per tier; no distinct surface.
- **What the canvas document is called**, in UI and on disk — SETTLED: **named sidecar files under
  `.aurora/canvas`**. `renderer/state/canvas-file.ts:36` (`CANVAS_DIR = '.aurora/canvas'`) writes
  `<project>/.aurora/canvas/<name>.png` beside `<name>.canvas.json`.
- **Whether the tile limit for a level-art profile is the act's free slots or the whole pool** —
  SETTLED: **show unique / free / pool and do NOT compare them.** `use-canvas-constraints.ts`
  carries `freeSlots`, `poolUsed` and `poolTotal` side by side; the not-comparing is deliberate and
  is asserted by `components/canvas/__tests__/canvas-budget.test.ts` ("It states two numbers and
  does NOT compare them"). Committing is where the match against the pool actually happens.

# Spec — Collision Authoring v2: block-keyed, hierarchy-flexible, ROM-bound

Status: **design, awaiting user review** · 2026-06-20
Context: Supersedes the *direction* of `2026-06-20-collision-authoring-design.md` (Phase 2a, which
shipped flat per-cell painting of existing profiles — that code carries over). After **heavy
engine research** (two workflows, file-line verified) and a design conversation, the user chose a
**block-keyed, reuse-first** model that matches how the engine actually represents collision, works
at tile/block/chunk granularity, and ultimately drives the ROM. This spec defines that model and
its phasing.

## 0. Engine ground truth (verified)

- **Collision is attached to the 16×16-px BLOCK** (= 2×2 tiles), and **reused via shared block
  definitions**: the engine maps `block_id → collision profile` (the "OJZ 16×16 collision index"),
  so every placement of the same block carries the same collision; only per-placement flip +
  solidity bits layer on top. (Hierarchy: chunk 128px = 8×8 blocks of 16×16px = 2×2 tiles each.
  Proof: OJZ's 344,064 placements collapse to ~84 unique profiles — collision is defined per-block
  and massively reused.) It is NOT per-8×8-tile and NOT per-128px-chunk.
- **Collision resolution is 16px** (one attr byte per 16px collision cell; the height *profile*
  carries per-pixel-column detail *within* a 16px-wide block). So 8px-tile-level authoring is finer
  than the engine can store and **collapses to the 16px cell on export**.
- **Chunks do not exist at runtime** — they're an Aurora layout convenience. The runtime streams
  768-byte blocks (`512 nt + 128 collA + 128 collB`) with collision **embedded**; there is no
  section-level collision (`sec_collision_s4lz` is reserved/0). The section's block grid is a fixed
  16×16 = 256 blocks, each grid cell its own block (no per-block dedup at runtime).
- **The build's collision step is a deliberate stub.** `ojz_strip_gen.py` re-derives collision from
  the *original sonic_hack* source (layout + chunk map + the 16×16 collision index) and **ignores
  editor data** — literal comment: *"editor collision authoring is future work (deferred)."*
  Aurora's painted collision currently reaches nothing.

## 1. Goal & the core model

**Goal:** author real collision in Aurora — by tile, block, chunk, or free paint — with the engine's
**block-level reuse**, and have it drive the game.

**Core model — block-keyed collision (the authoring layer):**
- A **block** = a 16×16-px region = a 2×2 tile arrangement, **identified by its content** (the four
  tile words). Set a block's collision once → **every place that same content appears gets it**
  (the reuse the engine does natively). No manual block table — blocks are derived from your tiles,
  so it stays flexible in Aurora.
- Authoring is **hierarchy-flexible** — the same data, four scopes:
  - **Tile (8×8):** paint at tile resolution (collapses to the 16px cell on export — see §0).
  - **Block (16×16):** the natural unit; set a block's profile.
  - **Chunk (128px):** set a chunk's blocks at once (a chunk = its blocks).
  - **Free region / cell:** marquee or per-cell paint.
- Two write modes:
  - **Reuse (by content):** the default — applies to all matching blocks (edit once, updates
    everywhere).
  - **Just here (override):** breaks the content link for one position when you want a twin to
    differ. (Engine-faithful: the per-placement override is what flips/per-path-solidity do.)
- **Three editing surfaces, one system:** map paint (set the block at a spot), the block/chunk
  editor (Art mode, set a block's/chunk's collision), and free paint all write the **same real-
  profile collision**, replacing the legacy 0-15 nibble / 2-bit-flag split (the "three encodings"
  reconciliation). All use the real profiles (heights/angle/solidity) from Phase 1's model.

**Storage:** a **flat per-section collision plane** (`collisionEdit`, Aurora's per-8px-tile
256×256 array — already built in Phase 2a). Block-keyed authoring writes into it (all matching
positions); free/override paint writes single cells. The flat plane is also what's exported, so the
block-keying is purely an authoring layer and the **engine side stays the simple, low-risk
injection** (§3). Block-content reuse is computed from the section nametable (find the 2×2-tile
arrangements); it is an editor convenience, not a stored block table.

## 2. Profiles (the shapes you assign)

Unchanged from Phase 1/2a: a **profile** = 16-byte height + angle + solidity, in
`projectStore.collisionProfiles`. You paint an attr index (a profile). **Existing profiles** (the
level's ~50) need no table changes. **New shapes** require a **profile editor** (draw the height
shape, set angle + solidity) and **co-exporting the height/angle/solidity tables** so Aurora's
index space matches the ROM — deferred to a later phase (§5).

## 3. Reaching the ROM (the bake wiring) — minimal & safe

Verified: a small, surgical change to the engine's `ojz_strip_gen.py` is **unavoidable but
low-risk** (the "produce files the unmodified bake reads" path is infeasible — hard-coded sonic_hack
paths, the collision step deliberately bypasses editor data, and Aurora's flat plane can't be
reverse-mapped into the block-index/Kosinski format without fabricating data).

- **Aurora side:** emit `collisionEdit` in the engine's strip collision layout — **downsample the
  256-row (8px) plane to 128 rows (16px cells)**, path A (and B once editable), as a `.bin` the
  bake reads. Painted *existing-profile* indices already match the current ROM tables, so they're
  valid as-is.
- **Engine side (one branch, behind the editor flag):** in `ojz_strip_gen.generate()` Pass 1b, when
  an editor collision file exists for a section, load it into `per_section_coll[sec_id]` (reusing
  the bake's own `AttrSet`/`emit_tables` machinery) **instead of** `build_section_collision`. The
  **non-editor (sonic_hack) path stays byte-for-byte identical**; the strip writer, `ojz_block_gen`,
  the ROM tables, and the runtime reader are all untouched. This *completes the deliberate stub*,
  not a rewrite of a working system.
- **Gate (user instruction):** re-confirm against the live build tools at implementation time (this
  research is that confirmation; re-verify before merging the engine change).

## 4. What Phase 2a already gives us (carries over)

The Phase-2a separate-field architecture is the right base and is reused wholesale: `collisionEdit`
(editable real-attr plane, separate from the legacy `tileGrid.collision` 2-bit/nibble), the
`set-collision-edit` command, `selectedCollisionProfile`, the profile palette + thumbnails, the
real-surface view, and `.collattr.bin` persistence. v2 **adds** the block-content keying, the
tile/block/chunk scopes + override mode, the chunk/block-editor unification, the export downsample,
and the bake wiring.

## 5. Phasing

1. **Block-keyed reuse + scopes (Aurora-only, build first):** block-content keying ("apply to all
   matching blocks") + a brush scope selector (tile/block/chunk/free) + the "just here" override.
   Builds directly on Phase 2a's flat plane + palette. *Shippable, testable in the editor.*
2. **ROM bake (the prize):** Aurora exports the downsampled strip-collision plane; the minimal
   `ojz_strip_gen` editor-collision branch. Painted collision drives the game (existing profiles).
   *Gated on re-verifying the build tools; touches the engine repo.*
3. **Profile editor + table co-export:** draw new collision shapes; co-export height/angle/solidity
   tables so new profiles are valid in-ROM.
4. **Chunk/block-editor collision unification + path-B authoring:** set collision while editing a
   chunk/block in Art mode (real profiles), and edit path B (loop/dual-layer).

Each phase is independently shippable. Phase 1 is editor-only (no ROM); Phase 2 makes it real.

## 6. Resolved decisions (user, 2026-06-20)

- **Reuse default = APPLY TO ALL MATCHING BLOCKS.** Map-paint defaults to reuse (every block with
  the same content), with a **modifier (Alt) for "just here."** Rationale (user): you paint because
  you *see* something wrong, and it's rarely one isolated block.
- **Content-key scope = per-section** (matches the engine's per-section block grid).
- **Tile-scope rounding = accepted** — Aurora may paint at 8px-tile resolution; it collapses to the
  engine's 16px cell on export (shown finer, rounded in-game).
- **Sequencing = reuse-first (editor-only), then ROM.** Phase 1 (block-keyed reuse) builds on the
  Phase-2a base and is immediately testable; Phase 2 (the verified, low-risk engine bake change)
  follows on a proven authoring layer.

## 7. Testing & verification

- Pure: block-content key (4 tile words → key), "matching positions" finder over a nametable,
  the 256→128 row downsample, the export plane shape. Existing suites green; raw-hex 0.
- Adversarial spec verification before build (as for every collision phase). Engine bake change
  verified against a from-scratch `build.sh` run (non-editor path unchanged byte-for-byte; editor
  section reflects painted collision) before merge.
- Manual: paint a block → all twins update (reuse); override one → only it changes; paint at
  tile/block/chunk scope; (Phase 2) rebuild ROM → collision matches in-game.

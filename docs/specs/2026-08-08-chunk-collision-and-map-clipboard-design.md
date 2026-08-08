# Chunk-Carried Collision + Map Clipboard — design spec

**Date:** 2026-08-08
**Status:** Approved by user (design dialogue 2026-08-08)
**Repos:** Aurora only (`/home/volence/sonic_hacks/aurora/`); aeon changes are
doc-only. This spec ADOPTS the approved aeon design #6
(`aeon/docs/superpowers/specs/2026-07-02-editor-collision-authoring-design.md`,
with implementation plan
`aeon/docs/superpowers/plans/2026-07-02-editor-collision-authoring.md`) as its
base and EXTENDS it with one new component: a map region clipboard carrying
art + collision (§4). Read the design #6 spec alongside this one — its sections
are not restated here in full.

---

## 1. The problems (user-reported, 2026-08-08)

1. **"Collision is tied to a tile — reused tiles drag collision where it isn't
   wanted."** Verified root cause (2026-08-08 audit): the *stored* model is
   already per-layout-cell (`Section.collisionEdit`/`collisionEditB`,
   `Uint16Array[65536]` per section, one 16-bit cell word per 16px cell —
   `src/core/model/s4-types.ts`). What ties collision to art is the **paint
   default**: the brush propagates each edit to every art-identical 16px block
   in the section (`findMatchingBlockCells`,
   `src/core/collision/collision-block.ts`), with Alt = "just here" as the
   modifier. Additionally, chunks don't carry the real collision planes, so
   stamping reused art places no collision and invites propagation-based
   fixups. Both are exactly what design #6 fixes.
2. **"Make sure our collision system still follows aeon's."** Verified — no
   drift (§2).
3. **"Copy/paste a chunk's collision over another; also copy/paste map regions
   for art, holding collision too."** No such tool exists today (only
   whole-section paste, `src/core/editing/section-ops.ts`, and one-way
   stamped-area → chunk-doc capture). New component, §4.

## 2. Contract verification vs aeon (2026-08-08 audit result)

The contract Aurora writes is byte-for-byte what the current aeon pipeline
consumes. Verified against aeon HEAD (through `e28a471`, the ojz_strip_gen v2
paging rework, and the `.asm` → `.emp` runtime migration):

- `.collattr.bin` / `.collattrb.bin`: 256×256 cells × 16-bit **big-endian**
  words (`serializeCollAttr` ↔ `ojz_strip_gen.py apply_editor_collision_overlay`,
  authoritative/WYSIWYG, absent file = air baseline).
- Cell word: shape bits 9:0, X-flip bit 10, Y-flip bit 11, per-plane solidity
  bits 13:12 (`collision-cell-word.ts` ↔ `collision_pipeline.py:50-57`,
  `bake_plane_cell`). Flip order xflip-then-yflip on both sides. Air = bare 0.
- Vocabulary: S&K base bank `data/collision/base/{heightmaps,angles}.bin`;
  baked combos interned into one shared `AttrSet`, emitted sparse to
  `games/sonic4/data/collision/*.bin`, embedded via `collision_data.emp`.
- Runtime: blocks stay 768 B = 512 nametable + 128 coll A + 128 coll B; cell
  byte = attr-set index; `Collision_GetType` (now fused with the former
  `Tile_Cache_GetCollision`, commit `49b7f3d`) reads the tile-cache collision
  buffer. No format change.
- `sec{N}_strips_a.bin` (ROM, carries the editor overlay) vs
  `sec{N}_strips_source.bin` (Aurora's read-only `engineCollision` baseline):
  split unchanged.

**Standing constraint (unchanged):** distinct painted (shape, flip, solidity)
combos per build must stay ≤ 255 (attr-set intern cap; ~13 used at last audit).
**Standing rule (from the design #6 plan):** do not edit
`aeon/tools/ojz_strip_gen.py` or `aeon/games/sonic4/data/editor/ojz/**`
(daemon-watched); this design needs zero aeon code changes.

## 3. Base: design #6, adopted as approved

Summarized; authoritative text is the 2026-07-02 spec.

1. **`ChunkDef.collisionA`/`collisionB: Uint16Array`** — one cell word per 16px
   cell ((w/2)×(h/2) words per plane), same encoding as the section planes.
   Legacy 2-bit `ChunkDef.collision` migrates on load (byte → full-block-shape
   word), then the field is deleted.
2. **Stamps place art + collision atomically** — chunk nametable + both
   collision planes written in ONE undo step; chunk air cells CLEAR destination
   collision (chunk authoritative for its footprint); "art only" modifier for
   overlay/decoration stamps. Stamp origin snaps to 16px block alignment.
3. **Chunk composer edits collision** — the Art-mode collision tool +
   `CollisionPalette` operate on the open chunk's planes with the standard
   overlay and A/B toggle. Capture-from-map (marquee → chunk / `save_chunk`)
   carries the selection's collision words into the new chunk.
4. **Paint default flips to "just here"** — art-identity propagation ("all
   matching blocks") becomes the explicit modifier; brush-area-only is the
   default.
5. **Legacy retirement** — `tileGrid.collision` nibble plane + `.coll.bin`
   export + legacy nibble paint path deleted; loaders ignore old `.coll.bin`
   files (logged once); chunk import (`chunk-mappings.ts`) seeds the new planes
   from block-ref solidity as full-block shapes.
6. **Suite surface** — `paint_collision` Aether/MCP tool (cell rect + packed
   word + plane → one history entry); `save_chunk`/`stamp_chunk` schemas carry
   the collision payload; `docs/MCP.md` updated.

Plus design #6's aeon doc closeouts (DEFERRED_WORK Path-B entry rewrite; status
banners on the superseded 2026-06-19/20/21 Aurora collision docs).

## 4. New: map region clipboard (art + collision)

One in-app clipboard (module/store state, not the OS clipboard):

```
MapClipboard = {
  widthTiles, heightTiles,            // snapped to 16px blocks (even tiles)
  nametable:  Uint16Array,            // widthTiles × heightTiles tile words
  collisionA: Uint16Array,            // (w/2) × (h/2) cell words
  collisionB: Uint16Array,
}
```

### 4.1 Map-side copy
A marquee region selection tool on the map. No such UI tool exists today
(capture-to-chunk is double-click / `save_chunk` only), so the marquee is NEW
in this work and serves both flows — one selection, two commits: "save as
chunk" (design #6 capture) or "copy" (clipboard).
Selection snaps to 16px block boundaries so art and collision stay aligned.
**Copy** (`Ctrl+C`) captures the region's nametable words + both collision-edit
planes from the active section.

### 4.2 Map-side paste
**Paste** (`Ctrl+V`) enters paste mode: a ghost preview of the clipboard art
(with the collision overlay when it's visible) follows the cursor, snapped to
16px blocks; click commits. Committing writes nametable +
`collisionEdit`/`collisionEditB` as **one undo step** (the same composed
command primitive stamps use). Escape leaves paste mode.

- **Paste modes:** default = art + collision. Toggles/modifiers for **art
  only** and **collision only** (exposed in the tool options UI next to the
  existing stamp "art only" control, plus held-modifier equivalents).
- **Air handling** matches stamps: within the pasted footprint the clipboard is
  authoritative — clipboard air (word 0 / tile 0) clears the destination — in
  whichever layer(s) are being pasted. No merge mode (YAGNI).
- **Cross-section:** paste works in any section (the clipboard is plain words;
  the shape vocabulary is project-global). Pastes clamp at section edges
  (out-of-bounds cells dropped).

### 4.3 Chunk composer integration
The composer shares the SAME clipboard: **Copy** captures the open chunk's
nametable + collision planes; **Paste** applies the clipboard to the open chunk
(size-clamped at the chunk bounds, same art/collision/both modes). This yields
chunk→chunk collision copying ("give chunk Y chunk X's collision") and
map↔chunk transfer in both directions with no extra machinery.

### 4.4 Non-goals
- No OS-clipboard interchange, no multi-slot clipboard history.
- No MCP clipboard tool — automation composes `paint_region`-style tools +
  `paint_collision` rects instead.
- No entity/object copy (entities are a separate design:
  `2026-07-03-entity-placement-properties-design.md`).

## 5. What does NOT change

Everything in design #6 §3: the aeon pipeline, the `.collattr*` consumption,
the S&K bank, `bake_plane_cell`, the attr-set intern, dual-plane strips,
runtime lookup. Aurora's save/load unit stays per-section `.collattr.bin` /
`.collattrb.bin`. The propagation paint mode survives as a modifier. Whole-
section copy/paste (`section-ops.ts`) remains.

## 6. Verification

- **Design #6 end-to-end (spec §5):** author a chunk (ground solid, grass
  NONE) → stamp twice → full aeon build → oracle: identical collision at both
  placements, decorative cells passable. Path-B variant probed.
- **Clipboard round-trip:** copy region → paste elsewhere → nametable + both
  planes byte-identical; one undo restores everything; art-only paste leaves
  destination collision untouched (and vice versa); clipboard air clears
  destination in pasted layers only; cross-section paste + edge clamp tested.
- **Composer:** map → copy → paste into chunk → stamp that chunk → identical
  words at the stamp site.
- **Migration goldens:** legacy chunk byte plane → expected word plane,
  idempotent; project with old `.coll.bin` loads clean.
- Vitest throughout (`npm test`); the paint-default flip covered at the
  `collisionPaintTargets` level.

## 7. Implementation note

The implementation plan for this spec should be a refresh of the design #6 plan
(`aeon/docs/superpowers/plans/2026-07-02-editor-collision-authoring.md`) — its
task structure stands, its file anchors are 5 weeks stale (research-first rule
already embedded) — extended with the clipboard tasks (§4) slotted after the
stamp-carry task (they share the composed-command primitive and the marquee).
Branch: `feat/chunk-collision` in aurora.
